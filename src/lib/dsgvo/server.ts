// Betroffenenrechte (Ole, 18.11.2026, docs/plan-mailstrecke-dsgvo-investoren.md D0, D1, D3, D8):
//   D1  Erkennung ohne KI (lib/dsgvo/erkennung.ts) in WhatsApp (gateway.ts, vor dem Assistenten) und Mail-Eingang
//       (mail/eingang.ts). Je Nachricht genau eine Anfrage (DsgvoAnfrage.quelleId).
//   D3  Sofortbestätigung über den Eingangskanal im Namen des Vermittlers: „Ihre Anfrage ist angekommen, Sie bekommen
//       innerhalb eines Monats Antwort.“ (Du/Sie nach Customer.leadAddress). Der Assistent antwortet darauf nicht.
//   D8  Widerspruch gegen Werbung sofort: Nachfass-Abfolgen, Mail-Strecke, Kampagnen (Sperrliste), Meta-Rückmeldung
//       (CAPI überspringt den Lead) und Sperrliste LeadSperre „werbung“. Termin-Nachrichten bleiben (keine Werbung).
//   Vermittler: Push, Hinweis im Chat bzw. Verlauf, Karte „Datenschutz-Anfrage“ auf Heute mit der Frist (D4 folgt).
// Protokoll DsgvoAnfrageLog ohne Inhalte, 3 Jahre (loeschenAb). Keine Inhalte in Logs.

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { asAnsprache } from "@/lib/ansprache";
import { bestaetigungText, DSGVO_ART_LABEL, erkenneDsgvo, fristBis, type DsgvoArt } from "@/lib/dsgvo/erkennung";

const DREI_JAHRE_MS = 3 * 366 * 86_400_000;
const istEindeutigFehler = (e: unknown) => !!e && typeof e === "object" && (e as { code?: string }).code === "P2002";

/** Hash für die Sperrliste (E-Mail klein, Telefon nur Ziffern). */
export function sperrHash(kind: "email" | "phone", value: string): string {
  const v = kind === "email" ? value.trim().toLowerCase() : value.replace(/\D/g, "");
  return crypto.createHash("sha256").update(`lead-sperre:${kind}:${v}`).digest("hex");
}

/** Gesperrt nach Betroffenenrechten? Umfang „geloescht“ vor „werbung“, sonst null. */
export async function sperreFuer(customerId: string, o: { email?: string | null; phone?: string | null }): Promise<"geloescht" | "werbung" | null> {
  const or = [
    ...(o.email?.trim() ? [{ kind: "email", hash: sperrHash("email", o.email) }] : []),
    ...(o.phone?.replace(/\D/g, "") ? [{ kind: "phone", hash: sperrHash("phone", o.phone) }] : []),
  ];
  if (!or.length) return null;
  const rows = await prisma.leadSperre.findMany({ where: { customerId, OR: or }, select: { umfang: true } });
  if (rows.some((r) => r.umfang === "geloescht")) return "geloescht";
  return rows.length ? "werbung" : null;
}

async function log(anfrageId: string, customerId: string, aktion: string, details: Record<string, unknown> | null, now: Date) {
  await prisma.dsgvoAnfrageLog.create({ data: { anfrageId, customerId, aktion, details: (details ?? undefined) as Prisma.InputJsonValue | undefined, at: now, loeschenAb: new Date(now.getTime() + DREI_JAHRE_MS) } });
}

export type EingangDsgvo = {
  customerId: string;
  leadId: string | null;
  kanal: "whatsapp" | "email";
  text: string | null;
  betreff?: string | null;
  /** Message-ID bzw. MailEingang-ID (Idempotenz) */
  quelleId: string;
  /** WhatsApp: Chat (Bestätigung dorthin); E-Mail: Absenderadresse */
  conversationId?: string | null;
  absender?: string | null;
  now?: Date;
};

export type DsgvoErgebnis = { erkannt: false } | { erkannt: true; art: DsgvoArt; anfrageId: string; neu: boolean; bestaetigt: boolean };

/**
 * Eingehende Nachricht prüfen; bei einer Anfrage anlegen, bestätigen, Widerspruch umsetzen und den Vermittler
 * benachrichtigen. Wirft nicht (Fehler nur im Log, ohne Inhalt).
 */
export async function pruefeDsgvoEingang(e: EingangDsgvo): Promise<DsgvoErgebnis> {
  const art = erkenneDsgvo(e.text, { betreff: e.betreff });
  if (!art) return { erkannt: false };
  const now = e.now ?? new Date();
  try {
    let anfrage: { id: string };
    const neu = true;
    try {
      anfrage = await prisma.dsgvoAnfrage.create({
        data: {
          customerId: e.customerId,
          leadId: e.leadId,
          art,
          kanal: e.kanal,
          eingangAt: now,
          fristBis: fristBis(now),
          auszug: (e.text ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || null,
          quelleId: `${e.kanal}:${e.quelleId}`.slice(0, 190),
          createdAt: now,
        },
        select: { id: true },
      });
    } catch (err) {
      if (!istEindeutigFehler(err)) throw err;
      const alt = await prisma.dsgvoAnfrage.findUnique({ where: { quelleId: `${e.kanal}:${e.quelleId}`.slice(0, 190) }, select: { id: true, bestaetigtAt: true } });
      return { erkannt: true, art, anfrageId: alt?.id ?? "", neu: false, bestaetigt: !!alt?.bestaetigtAt };
    }
    await log(anfrage.id, e.customerId, "eingang", { art, kanal: e.kanal }, now);
    if (art === "widerspruch_werbung") await widerspruchWerbung({ customerId: e.customerId, leadId: e.leadId, anfrageId: anfrage.id, email: e.kanal === "email" ? e.absender : null, conversationId: e.conversationId, now });
    const bestaetigt = await bestaetigen(anfrage.id, art, e, now);
    await vermittlerHinweis(anfrage.id, art, e, now);
    return { erkannt: true, art, anfrageId: anfrage.id, neu, bestaetigt };
  } catch (err) {
    console.error("[dsgvo] Eingang", err instanceof Error ? err.message.replace(/[^\w :.-]/g, "_").slice(0, 120) : "fehler");
    return { erkannt: true, art, anfrageId: "", neu: false, bestaetigt: false };
  }
}

/** Sofortbestätigung über den Eingangskanal (genau einmal je Anfrage). */
async function bestaetigen(anfrageId: string, art: DsgvoArt, e: EingangDsgvo, now: Date): Promise<boolean> {
  const claim = await prisma.dsgvoAnfrage.updateMany({ where: { id: anfrageId, bestaetigtAt: null }, data: { bestaetigtAt: now } });
  if (!claim.count) return false;
  const c = await prisma.customer.findUnique({ where: { id: e.customerId }, select: { leadAddress: true } });
  const an = asAnsprache(c?.leadAddress);
  const text = bestaetigungText(an, art);
  let ok = false;
  try {
    if (e.kanal === "whatsapp" && e.conversationId) {
      const conv = await prisma.conversation.findUnique({ where: { id: e.conversationId }, select: { contactPhone: true } });
      if (conv) {
        // Im Namen des Vermittlers: Gruß mit seinem Namen (wie die Mails)
        const { leadVersandKontext } = await import("@/lib/mail/lead-versand");
        const k = await leadVersandKontext(e.customerId, { leadId: e.leadId, nurLesen: true });
        const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
        await sendWhatsAppMessage({ customerId: e.customerId, to: conv.contactPhone, body: `${text}\n\nViele Grüße\n${k.daten.name}`, sentBy: "system" });
        ok = true;
      }
    } else if (e.kanal === "email" && e.absender) {
      const { leadVersandKontext, sendeLeadMail } = await import("@/lib/mail/lead-versand");
      const k = await leadVersandKontext(e.customerId, { leadId: e.leadId });
      const { anredeZeile } = await import("@/lib/ansprache");
      const who = e.leadId ? await (await import("@/lib/lead-anrede")).ansprechpartner({ customerId: e.customerId, leadId: e.leadId }) : null;
      const anrede = who && !(an === "sie" && !who.kontakt.salutation) ? anredeZeile(an, who.kontakt) : an === "du" ? "Hallo," : "Guten Tag,";
      const r = await sendeLeadMail(k, {
        to: e.absender,
        inhalt: (sig) => ({
          subject: an === "du" ? "Deine Datenschutz-Anfrage" : "Ihre Datenschutz-Anfrage",
          text: `${anrede}\n\n${text}\n\n${sig.text}`,
          html: `<div style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;line-height:1.5;color:#0b1220;max-width:520px;padding:24px"><p>${anrede}</p><p>${text}</p>${sig.html}</div>`,
        }),
        protokoll: { customerId: e.customerId, leadId: e.leadId, art: "datenschutz_bestaetigung", automatisch: true },
        ohneKopie: true,
      });
      ok = r.sent;
    }
  } catch (err) {
    console.error("[dsgvo] Bestätigung", err instanceof Error ? err.name : "fehler");
  }
  if (!ok) await prisma.dsgvoAnfrage.update({ where: { id: anfrageId }, data: { bestaetigtAt: null } });
  else await log(anfrageId, e.customerId, "bestaetigt", { kanal: e.kanal }, now);
  return ok;
}

const tagLabel = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

/** Vermittler: Push, Verlauf, Chat „braucht Aufmerksamkeit“ (Heute zeigt die Anfrage zusätzlich als eigene Karte). */
async function vermittlerHinweis(anfrageId: string, art: DsgvoArt, e: EingangDsgvo, now: Date): Promise<void> {
  const frist = tagLabel(fristBis(now));
  const grund = `Datenschutz-Anfrage (${DSGVO_ART_LABEL[art]}): Antwort bis ${frist}`;
  try {
    if (e.leadId) {
      const { logLeadHistory } = await import("@/lib/lead-history");
      await logLeadHistory(e.leadId, "status", `${grund}. ${art === "widerspruch_werbung" ? "Werbung ist ab sofort gestoppt. " : ""}Eingang per ${e.kanal === "whatsapp" ? "WhatsApp" : "E-Mail"}, Eingangsbestätigung ist raus.`, { customerId: e.customerId, userId: null });
    }
    if (e.conversationId) {
      const { flagAttention } = await import("@/lib/whatsapp/attention");
      await flagAttention(e.conversationId, grund, { push: false });
    }
    const lead = e.leadId ? await prisma.lead.findUnique({ where: { id: e.leadId }, select: { name: true } }) : null;
    const payload = { title: `🔒 Datenschutz-Anfrage: ${lead?.name?.trim() || "Kontakt"}`, body: `${DSGVO_ART_LABEL[art]}. Antwort bis ${frist}.`, url: e.leadId ? `/buyer/leads/${e.leadId}` : "/buyer", tag: `dsgvo:${anfrageId}` };
    if (e.leadId) await (await import("@/lib/team")).notifyLeadPush(e.leadId, payload);
    else await (await import("@/lib/push")).sendToBuyersOfCustomer(e.customerId, payload);
  } catch (err) {
    console.error("[dsgvo] Hinweis", err instanceof Error ? err.name : "fehler");
  }
}

/**
 * Widerspruch gegen Werbung sofort umsetzen (D8): Sperrliste, Abfolgen (außer Termin-Begleitung), Mail-Strecke,
 * Kampagnen-Sperrliste, Meta-Rückmeldung. Wirft nicht.
 */
export async function widerspruchWerbung(o: { customerId: string; leadId: string | null; anfrageId: string; email?: string | null; conversationId?: string | null; now?: Date }): Promise<void> {
  const now = o.now ?? new Date();
  const lead = o.leadId ? await prisma.lead.findUnique({ where: { id: o.leadId }, select: { id: true, email: true, weitereEmails: true, phone: true } }) : null;
  const conv = o.conversationId ? await prisma.conversation.findUnique({ where: { id: o.conversationId }, select: { contactPhone: true } }) : null;
  const emails = [...new Set([lead?.email, ...(lead?.weitereEmails ?? []), o.email].map((x) => (x ?? "").trim().toLowerCase()).filter(Boolean))];
  const phones = [...new Set([lead?.phone, conv?.contactPhone].map((x) => (x ?? "").replace(/\D/g, "")).filter(Boolean))];
  const { optOutHash } = await import("@/lib/bestand/links");
  for (const [kind, v] of [...emails.map((x) => ["email", x] as const), ...phones.map((x) => ["phone", x] as const)]) {
    await prisma.leadSperre
      .upsert({ where: { customerId_kind_hash_umfang: { customerId: o.customerId, kind, hash: sperrHash(kind, v), umfang: "werbung" } }, create: { customerId: o.customerId, kind, hash: sperrHash(kind, v), umfang: "werbung", anfrageId: o.anfrageId, createdAt: now }, update: {} })
      .catch(() => null);
    // Kampagnen und automatische Mails prüfen die Sperrliste des Kunden (BestandOptOut)
    await prisma.bestandOptOut
      .upsert({ where: { customerId_kind_hash: { customerId: o.customerId, kind, hash: optOutHash(kind, v) } }, create: { customerId: o.customerId, kind, hash: optOutHash(kind, v), scope: kind === "email" ? "email" : "all", createdAt: now }, update: {} })
      .catch(() => null);
  }
  const erledigt: string[] = ["sperrliste"];
  if (lead) {
    const { stopSequences, BEGLEIT_KINDS } = await import("@/lib/lead-sequences");
    await stopSequences(lead.id, "Widerspruch gegen Werbung", { now, ausser: BEGLEIT_KINDS }).catch(() => null);
    erledigt.push("abfolgen");
    await prisma.leadMailStrecke.updateMany({ where: { leadId: lead.id, schritt: { in: ["neu", "erstmail"] } }, data: { schritt: "gestoppt", stopGrund: "widerspruch" } });
    erledigt.push("mail_strecke");
    // Meta-Rückmeldung: offene Ereignisse überspringen (neue überspringt lib/capi/server.ts sendDue)
    await prisma.capiEvent.updateMany({ where: { leadId: lead.id, status: { in: ["queued", "failed"] } }, data: { status: "skipped", error: "Widerspruch gegen Werbung", nextAttemptAt: null } });
    erledigt.push("capi");
    const ec = await prisma.existingCustomer.findFirst({ where: { customerId: o.customerId, leadId: lead.id }, select: { id: true } }).catch(() => null);
    if (ec) {
      const { optOutExisting } = await import("@/lib/bestand/einwilligung-server");
      await optOutExisting(ec.id, { scope: "all", source: "widerspruch", now }).catch(() => null);
      erledigt.push("kampagnen");
    }
  }
  await log(o.anfrageId, o.customerId, "widerspruch_umgesetzt", { erledigt }, now);
}

/** Leads mit Widerspruch gegen Werbung (für CAPI und andere werbliche Wege). */
export async function leadsMitWiderspruch(leadIds: string[]): Promise<Set<string>> {
  if (!leadIds.length) return new Set();
  const rows = await prisma.dsgvoAnfrage.findMany({ where: { leadId: { in: leadIds }, art: "widerspruch_werbung" }, select: { leadId: true } });
  return new Set(rows.map((r) => r.leadId!).filter(Boolean));
}

export type HeuteDsgvo = { id: string; leadId: string | null; name: string; art: string; fristBis: string; ueberfaellig: boolean };

/** Offene Anfragen für „Heute“ (älteste Frist zuerst). */
export async function offeneDsgvoAnfragen(customerId: string, leadIds?: string[] | null, now = new Date()): Promise<HeuteDsgvo[]> {
  const rows = await prisma.dsgvoAnfrage.findMany({
    where: { customerId, status: "offen", ...(leadIds ? { leadId: { in: leadIds } } : {}) },
    orderBy: { fristBis: "asc" },
    take: 20,
    select: { id: true, leadId: true, art: true, fristBis: true },
  });
  const ids = rows.map((r) => r.leadId).filter((x): x is string => !!x);
  const names = new Map((await prisma.lead.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((l) => [l.id, l.name]));
  return rows.map((r) => ({
    id: r.id,
    leadId: r.leadId,
    name: (r.leadId ? names.get(r.leadId) : null)?.trim() || "Kontakt",
    art: DSGVO_ART_LABEL[r.art as DsgvoArt] ?? "Datenschutz-Anfrage",
    fristBis: r.fristBis.toISOString(),
    ueberfaellig: r.fristBis.getTime() < now.getTime(),
  }));
}

/** Anfrage als erledigt markieren (Vermittler). */
export async function dsgvoErledigt(customerId: string, anfrageId: string, userId: string | null, now = new Date()): Promise<boolean> {
  const r = await prisma.dsgvoAnfrage.updateMany({ where: { id: anfrageId, customerId, status: "offen" }, data: { status: "erledigt", erledigtAt: now } });
  if (r.count) await log(anfrageId, customerId, "erledigt", { userId }, now);
  return r.count > 0;
}
