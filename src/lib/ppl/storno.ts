// Storno (Reklamation) beim Pay-per-Lead: innerhalb des Storno-Fensters, nur mit erlaubtem Grund.
//
// Nachlieferung (Ole, 24.11.2026: „Bei Leadbestellungen … wir liefern Leads immer nach und erstatten nichts“), für
// Bezüge mit stornoErsatz (alle seit der Einführung angelegten): jede anerkannte Reklamation, auch der Grenzfall
// „Sonstiges“, schuldet genau einen kostenlosen Ersatzlead (Lead.ersatzGeschuldet). Keine Gutschrift, keine Erstattung;
// der Umsatz des reklamierten Leads bleibt, der Ersatzlead hat keinen Umsatz. Die Verteilung (lib/ppl/engine.ts
// quotaFor) liefert offene Ersatzleads vor allem anderen. Ein halber Ersatzlead geht nicht, darum kein 50:50 mehr;
// die Meldung bei hoher Stornoquote bleibt als Schutz vor Missbrauch.
//
// Alte Bedingungen (stornoErsatz = false, alle Bezüge vor dem 24.11.2026), unverändert:
// Ersatzlos, der Käufer bekommt eine Gutschrift (nächste Rechnung).
// Ole, 17.11.2026: „klare Stornos einfach annehmen, bei Grenzfällen 50:50“.
// Klar = erlaubter Grund → volle Gutschrift, auch bei Stornoquote > 20 % (letzte 30 Tage);
// dann bekommt der Admin eine Meldung, um mit dem Kunden zu sprechen.
// Grenzfall = „Sonstiges“ → automatisch halbe Gutschrift (Umsatz zur Hälfte bleibt), keine Prüfung mehr. Am Bezug (`stornoAutoApprove`): jede Reklamation
// im Fenster voll anerkannt.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { sendToAdmins } from "@/lib/push";

const DAY = 86_400_000;
export const REVIEW_QUOTA = 0.2;
export const PPL_REASON_PREFIX = "ppl:";

/** Anteil der Gutschrift bei Grenzfällen (Ole, 17.11.2026: 50:50) */
export const GRENZFALL_ANTEIL = 0.5;

export type StornoOutcome = { ok: true; state: "approved" | "review"; anteil?: number; ersatz?: boolean } | { ok: false; error: string };

export function stornoWindowOpen(deliveredAt: Date | null, days: number | null, now = new Date()): boolean {
  if (!deliveredAt || !days) return false;
  return now.getTime() - deliveredAt.getTime() <= days * DAY;
}

/** Erlaubte Gründe für einen Pay-per-Lead (leer = kein Storno möglich). */
export async function pplStornoOptions(leadIds: string[], now = new Date()) {
  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds }, subscriptionId: { not: null }, stornoState: null },
    select: { id: true, deliveredAt: true, subscription: { select: { stornoDays: true, stornoReasons: true } } },
  });
  const out = new Map<string, { recordId: string; grund: string; beschreibung: string | null }[]>();
  for (const l of leads) {
    if (!l.subscription || !stornoWindowOpen(l.deliveredAt, l.subscription.stornoDays, now)) continue;
    const reasons = [...l.subscription.stornoReasons, ...(l.subscription.stornoReasons.length ? ["Sonstiges"] : [])];
    out.set(l.id, [...new Set(reasons)].map((r) => ({ recordId: PPL_REASON_PREFIX + r, grund: r, beschreibung: null })));
  }
  return out;
}

export async function requestStorno(
  leadId: string,
  reason: string,
  note: string,
  actor: { id?: string | null; email?: string | null; role?: string | null },
  now = new Date(),
): Promise<StornoOutcome> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true, customerId: true, name: true, deliveredAt: true, stornoState: true, source: true, status: true,
      subscription: { select: { id: true, label: true, productKey: true, stornoDays: true, stornoReasons: true, stornoAutoApprove: true, stornoErsatz: true } },
      revenues: { select: { id: true, amount: true }, take: 1 },
    },
  });
  if (!lead?.subscription) return { ok: false, error: "Lead nicht gefunden." };
  if (lead.stornoState) return { ok: true, state: lead.stornoState === "approved" ? "approved" : "review" };
  const sub = lead.subscription;
  if (!stornoWindowOpen(lead.deliveredAt, sub.stornoDays, now)) {
    return { ok: false, error: sub.stornoDays ? `Storno ist nur ${sub.stornoDays} Tage nach Lieferung möglich.` : "Für diesen Bezug sind keine Stornos vorgesehen." };
  }
  const other = reason === "Sonstiges";
  if (!other && !sub.stornoReasons.includes(reason)) return { ok: false, error: "Dieser Stornogrund ist nicht zugelassen." };
  if (other && note.trim().length < 5) return { ok: false, error: "Bitte kurz beschreiben, was nicht gepasst hat." };

  // Stornoquote der letzten 30 Tage (inkl. diesem)
  const since = new Date(now.getTime() - 30 * DAY);
  const [delivered, stornos] = await Promise.all([
    prisma.lead.count({ where: { subscriptionId: sub.id, deliveredAt: { gte: since } } }),
    prisma.lead.count({ where: { subscriptionId: sub.id, deliveredAt: { gte: since }, stornoState: { in: ["approved", "review", "requested"] } } }),
  ]);
  const quota = delivered ? (stornos + 1) / delivered : 1;
  // Grenzfall nur „Sonstiges“ → 50:50; zugelassene Gründe immer voll (Ole, 17.11.2026), auch bei hoher Quote.
  // Am Bezug „immer automatisch anerkennen“ → alles voll.
  // Nachlieferung: jede anerkannte Reklamation = 1 Ersatzlead, auch „Sonstiges“ (kein 50:50)
  const ersatz = sub.stornoErsatz;
  const grenzfall = !sub.stornoAutoApprove && other;
  const hoheQuote = quota > REVIEW_QUOTA;
  const anteil = grenzfall && !ersatz ? GRENZFALL_ANTEIL : 1;

  await prisma.lead.update({
    where: { id: lead.id },
    data: { stornoState: "approved", stornoReason: reason, stornoNote: note.trim() || null, stornoRequestedAt: now },
  });
  if (ersatz) await approveErsatz(lead.id, now);
  else await approve(lead.id, now, anteil);
  await audit("lead.storno", { entity: "Lead", entityId: lead.id, customerId: lead.customerId, actor, details: { reason, grenzfall, hoheQuote, ...(ersatz ? { ersatz: true } : { anteil }), quota: Math.round(quota * 100), prevStatus: lead.status } });
  const bezug = sub.label ?? lead.source ?? "Pay-per-Lead";
  if (ersatz) await nachliefern(sub.productKey, now);
  if (hoheQuote) {
    // Hohe Quote: anerkannt, Ole spricht mit dem Kunden (eine Meldung je Bezug, ersetzt die vorige)
    await sendToAdmins({
      title: `Stornoquote ${Math.round(quota * 100)} %: mit dem Kunden sprechen`,
      body: `${bezug}: ${reason}${ersatz ? " (Ersatzlead)" : grenzfall ? " (50:50)" : " (voll gutgeschrieben)"}`,
      url: "/admin/neu/leads/ppl?ansicht=geliefert",
      tag: `ppl-storno-quote:${sub.id}`,
    }).catch(() => {});
  } else if (grenzfall && !ersatz) {
    await sendToAdmins({
      title: `Storno 50:50: ${bezug}`,
      body: `${reason}: ${note.trim().slice(0, 80)} · Quote ${Math.round(quota * 100)} %`,
      url: "/admin/neu/leads/ppl?ansicht=geliefert",
      tag: `ppl-storno:${lead.id}`,
    }).catch(() => {});
  }
  return ersatz ? { ok: true, state: "approved", ersatz: true } : { ok: true, state: "approved", anteil };
}

/**
 * Storno mit Nachlieferung anerkennen: Status „Storno“, ein Ersatzlead geschuldet. Keine Gutschrift, der Umsatz des
 * reklamierten Leads bleibt (bezahlt ist die Bestellung, der Ersatzlead kostet nichts).
 */
async function approveErsatz(leadId: string, now: Date) {
  await prisma.lead.update({
    where: { id: leadId },
    data: { stornoState: "approved", stornoDecidedAt: now, status: "Storno", ersatzGeschuldet: true, creditAmount: null },
  });
  // Statuswechsel zentral (lib/lead-followup.ts): Nachfassen und Anrufplan enden
  await import("@/lib/lead-followup").then((m) => m.syncFollowUpWithStatus(leadId, "Storno")).catch((e) => console.error("[status sync]", e));
}

/** Geparkte Leads des Produkts sofort verteilen, damit der Ersatzlead schnell kommt (wirft nie). */
async function nachliefern(productKey: string, now: Date) {
  try {
    const { redistributeParked } = await import("@/lib/ppl/engine");
    await redistributeParked(productKey, now);
  } catch {
    // Verteilung läuft beim nächsten Eingang ohnehin
  }
}

/** Offene Ersatzleads eines Bezugs: anerkannte Reklamationen mit Nachlieferung, für die noch kein Ersatz geliefert ist. */
export const offeneErsatzWhere = (subscriptionId: string) =>
  ({ subscriptionId, ersatzGeschuldet: true, stornoState: "approved", ersatz: { is: null } }) satisfies Prisma.LeadWhereInput;

export async function offeneErsatzleads(subscriptionId: string): Promise<number> {
  return prisma.lead.count({ where: offeneErsatzWhere(subscriptionId) });
}

/**
 * Storno anerkennen. anteil 1: volle Gutschrift, Umsatz storniert. anteil < 1 (Grenzfall 50:50): Gutschrift über den
 * Anteil, der Umsatz bleibt mit dem Rest bestehen (undoStorno rechnet ihn zurück).
 */
async function approve(leadId: string, now: Date, anteil = 1) {
  const rev = await prisma.revenue.findFirst({ where: { leadId }, select: { id: true, amount: true } });
  const betrag = Number(rev?.amount ?? 0);
  const gutschrift = anteil >= 1 ? betrag : Math.round(betrag * anteil * 100) / 100;
  await prisma.$transaction([
    prisma.lead.update({
      where: { id: leadId },
      data: { stornoState: "approved", stornoDecidedAt: now, status: "Storno", creditAmount: gutschrift },
    }),
    ...(rev
      ? [prisma.revenue.update({ where: { id: rev.id }, data: anteil >= 1 ? { cancelled: true } : { amount: Math.round((betrag - gutschrift) * 100) / 100 } })]
      : []),
  ]);
  await import("@/lib/lead-followup").then((m) => m.syncFollowUpWithStatus(leadId, "Storno")).catch((e) => console.error("[status sync]", e));
}

/** Admin entscheidet über einen Storno in Prüfung (Altfälle vor der 50:50-Regel). "half" = Grenzfall 50:50. */
export async function decideStorno(leadId: string, accept: boolean | "half", now = new Date()) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { stornoState: true, customerId: true, subscription: { select: { stornoErsatz: true, productKey: true } } } });
  if (lead?.stornoState !== "review") return false;
  // Nachlieferung: anerkannt heißt immer ein ganzer Ersatzlead (auch „half“)
  if (accept && lead.subscription?.stornoErsatz) {
    await approveErsatz(leadId, now);
    await nachliefern(lead.subscription.productKey, now);
  } else if (accept) await approve(leadId, now, accept === "half" ? GRENZFALL_ANTEIL : 1);
  else await prisma.lead.update({ where: { id: leadId }, data: { stornoState: "rejected", stornoDecidedAt: now } });
  await audit(accept === "half" ? "storno.half" : accept ? "storno.approve" : "storno.reject", { entity: "Lead", entityId: leadId, customerId: lead.customerId });
  return true;
}

export type AdminStornoOutcome =
  | { ok: true; already: boolean; outsideWindow: boolean }
  | { ok: false; error: string };

/**
 * Admin trägt einen Storno direkt als anerkannt ein (z. B. Heinrich von
 * Kleist: kein Login, Stornos kommen per Abrechnungs-Mail). Wie ein
 * anerkannter Kunden-Storno: Status „Storno“, Gutschrift, Umsatz storniert.
 * Das Storno-Fenster gilt hier nicht (outsideWindow nur als Hinweis); ein
 * Storno in Prüfung oder ein abgelehnter wird damit anerkannt. Idempotent.
 * allowAirtableLead: auch Leads aus der Airtable-Zeit ohne Bezug (HvK-Abrechnung, lib/ppl/hvk-abrechnung-server.ts).
 */
export async function adminRecordStorno(
  leadId: string,
  reason: string,
  note: string,
  actor: { id?: string | null; email?: string | null; role?: string | null },
  now = new Date(),
  opts: { allowAirtableLead?: boolean } = {},
): Promise<AdminStornoOutcome> {
  const grund = reason.trim().slice(0, 200);
  if (!grund) return { ok: false, error: "Bitte einen Stornogrund angeben." };
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, customerId: true, status: true, deliveredAt: true, stornoState: true, airtableId: true, creditAmount: true, creditedAt: true, subscription: { select: { stornoDays: true, stornoErsatz: true, productKey: true } } },
  });
  if (!lead || (!lead.subscription && !(opts.allowAirtableLead && lead.airtableId))) return { ok: false, error: "Kein Pay-per-Lead aus der App." };
  const outsideWindow = !stornoWindowOpen(lead.deliveredAt, lead.subscription?.stornoDays ?? null, now);
  if (lead.subscription?.stornoErsatz) {
    // Nachlieferung (Ole, 24.11.2026): Ersatzlead statt Gutschrift, Umsatz bleibt
    if (lead.stornoState === "approved") return { ok: true, already: true, outsideWindow };
    const r = await prisma.lead.updateMany({
      where: { id: lead.id, OR: [{ stornoState: null }, { stornoState: { not: "approved" } }] },
      data: {
        stornoState: "approved",
        stornoReason: grund,
        stornoNote: note.trim().slice(0, 1000) || null,
        stornoRequestedAt: now,
        stornoDecidedAt: now,
        status: "Storno",
        ersatzGeschuldet: true,
      },
    });
    if (!r.count) return { ok: true, already: true, outsideWindow };
    await import("@/lib/lead-followup").then((m) => m.syncFollowUpWithStatus(lead.id, "Storno")).catch((e) => console.error("[status sync]", e));
    await audit("storno.admin", {
      entity: "Lead",
      entityId: lead.id,
      customerId: lead.customerId,
      actor,
      details: { reason: grund, note: note.trim() || null, outsideWindow, ersatz: true, prevStatus: lead.status, prevStornoState: lead.stornoState },
    });
    await nachliefern(lead.subscription.productKey, now);
    return { ok: true, already: false, outsideWindow };
  }
  const rev = await prisma.revenue.findFirst({ where: { leadId: lead.id }, select: { id: true, amount: true, cancelled: true } });
  if (lead.stornoState === "approved") {
    // Grenzfall 50:50 nachträglich voll anerkennen (Gutschrift noch nicht verrechnet)
    const teil = Number(lead.creditAmount ?? 0);
    if (!rev || rev.cancelled || teil <= 0 || lead.creditedAt) return { ok: true, already: true, outsideWindow };
    const voll = Math.round((Number(rev.amount) + teil) * 100) / 100;
    const done = await prisma.$transaction(async (tx) => {
      const r = await tx.lead.updateMany({ where: { id: lead.id, stornoState: "approved", creditedAt: null, creditAmount: lead.creditAmount }, data: { creditAmount: voll, stornoReason: grund, stornoDecidedAt: now } });
      if (r.count) await tx.revenue.update({ where: { id: rev.id }, data: { amount: voll, cancelled: true } });
      return r.count > 0;
    });
    if (!done) return { ok: true, already: true, outsideWindow };
    await audit("storno.admin", { entity: "Lead", entityId: lead.id, customerId: lead.customerId, actor, details: { reason: grund, note: note.trim() || null, outsideWindow, vonTeilAufVoll: true, prevStatus: "Storno" } });
    return { ok: true, already: false, outsideWindow };
  }
  // Nur wenn noch nicht anerkannt (zweiter Klick / paralleler Aufruf ändert nichts)
  const claimed = await prisma.$transaction(async (tx) => {
    const r = await tx.lead.updateMany({
      where: { id: lead.id, OR: [{ stornoState: null }, { stornoState: { not: "approved" } }] },
      data: {
        stornoState: "approved",
        stornoReason: grund,
        stornoNote: note.trim().slice(0, 1000) || null,
        stornoRequestedAt: now,
        stornoDecidedAt: now,
        status: "Storno",
        creditAmount: rev?.amount ?? 0,
      },
    });
    if (r.count && rev) await tx.revenue.update({ where: { id: rev.id }, data: { cancelled: true } });
    return r.count > 0;
  });
  if (!claimed) return { ok: true, already: true, outsideWindow };
  await import("@/lib/lead-followup").then((m) => m.syncFollowUpWithStatus(lead.id, "Storno")).catch((e) => console.error("[status sync]", e));
  await audit("storno.admin", {
    entity: "Lead",
    entityId: lead.id,
    customerId: lead.customerId,
    actor,
    details: { reason: grund, note: note.trim() || null, outsideWindow, prevStatus: lead.status, prevStornoState: lead.stornoState },
  });
  return { ok: true, already: false, outsideWindow };
}

/**
 * Anerkannten Storno zurücknehmen (Fehleintrag). Nur solange die Gutschrift
 * auf keiner Rechnung steht. Status wird auf den Stand vor dem Storno gesetzt.
 */
export async function undoStorno(
  leadId: string,
  actor: { id?: string | null; email?: string | null; role?: string | null },
): Promise<{ ok: true; already: boolean } | { ok: false; error: string }> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, customerId: true, stornoState: true, creditedAt: true, subscriptionId: true, creditAmount: true, ersatzGeschuldet: true, ersatz: { select: { id: true } } } });
  if (!lead?.subscriptionId) return { ok: false, error: "Kein Pay-per-Lead aus der App." };
  if (lead.stornoState !== "approved") return { ok: true, already: true };
  if (lead.ersatz) return { ok: false, error: "Der Ersatzlead ist schon geliefert." };
  if (lead.creditedAt) return { ok: false, error: "Die Gutschrift ist schon mit einer Bestellung verrechnet." };
  const last = await prisma.auditLog.findFirst({
    where: { entity: "Lead", entityId: lead.id, action: { in: ["storno.admin", "lead.storno"] } },
    orderBy: { at: "desc" },
    select: { details: true },
  });
  const prev = (last?.details as { prevStatus?: unknown } | null)?.prevStatus;
  const status = typeof prev === "string" && prev && prev !== "Storno" ? prev : "Neuer Lead";
  const done = await prisma.$transaction(async (tx) => {
    const r = await tx.lead.updateMany({
      where: { id: lead.id, stornoState: "approved", creditedAt: null },
      data: { stornoState: null, stornoReason: null, stornoNote: null, stornoRequestedAt: null, stornoDecidedAt: null, creditAmount: null, ersatzGeschuldet: false, status },
    });
    // Nachlieferung: Umsatz war nie storniert, nichts zurückzurechnen
    if (r.count && !lead.ersatzGeschuldet) {
      const restored = await tx.revenue.updateMany({ where: { leadId: lead.id, cancelled: true }, data: { cancelled: false } });
      // 50:50: Umsatz war nicht storniert, sondern um die Gutschrift gekürzt → zurückrechnen
      if (!restored.count && Number(lead.creditAmount ?? 0) > 0) {
        const rev = await tx.revenue.findFirst({ where: { leadId: lead.id }, select: { id: true } });
        if (rev) await tx.revenue.update({ where: { id: rev.id }, data: { amount: { increment: Number(lead.creditAmount) } } });
      }
    }
    return r.count > 0;
  });
  if (!done) return { ok: true, already: true };
  await audit("storno.undo", { entity: "Lead", entityId: lead.id, customerId: lead.customerId, actor, details: { status } });
  return { ok: true, already: false };
}

/**
 * Offene Gutschriften eines Bezugs (noch auf keiner Rechnung). Nur alte Bedingungen: Stornos mit Nachlieferung schreiben
 * nichts gut (creditAmount bleibt leer), daher zieht die Bestellung (lib/ppl/orders.ts) für sie nichts ab.
 */
export async function openCredits(subscriptionId: string) {
  const rows = await prisma.lead.findMany({
    where: { subscriptionId, stornoState: "approved", creditedAt: null, creditAmount: { gt: 0 } },
    select: { id: true, creditAmount: true },
  });
  return { leadIds: rows.map((r) => r.id), amount: rows.reduce((n, r) => n + Number(r.creditAmount ?? 0), 0) };
}
