// Storno beim Pay-per-Lead: innerhalb des Storno-Fensters, nur mit erlaubtem
// Grund. Ersatzlos – der Käufer bekommt eine Gutschrift (nächste Rechnung).
// Automatisch genehmigt, außer Grund „Sonstiges“ oder Stornoquote > 20 %
// (letzte 30 Tage) → Prüfung durch Admin. Am Bezug abschaltbar
// (`stornoAutoApprove`): dann wird jede Reklamation im Fenster anerkannt.

import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { sendToAdmins } from "@/lib/push";

const DAY = 86_400_000;
export const REVIEW_QUOTA = 0.2;
export const PPL_REASON_PREFIX = "ppl:";

export type StornoOutcome = { ok: true; state: "approved" | "review" } | { ok: false; error: string };

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
      id: true, customerId: true, name: true, deliveredAt: true, stornoState: true, source: true,
      subscription: { select: { id: true, label: true, stornoDays: true, stornoReasons: true, stornoAutoApprove: true } },
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
  // Ohne Prüfung, wenn am Bezug „immer automatisch anerkennen“ eingestellt ist
  const review = !sub.stornoAutoApprove && (other || quota > REVIEW_QUOTA);

  await prisma.lead.update({
    where: { id: lead.id },
    data: { stornoState: review ? "review" : "approved", stornoReason: reason, stornoNote: note.trim() || null, stornoRequestedAt: now },
  });
  if (!review) await approve(lead.id, now);
  await audit("lead.storno", { entity: "Lead", entityId: lead.id, customerId: lead.customerId, actor, details: { reason, review, quota: Math.round(quota * 100) } });
  if (review) {
    await sendToAdmins({
      title: `🔎 Storno prüfen: ${sub.label ?? lead.source ?? "Pay-per-Lead"}`,
      body: `${reason}${other ? `: ${note.trim().slice(0, 80)}` : ""} · Quote ${Math.round(quota * 100)} %`,
      url: "/admin/ppl?ansicht=storno",
      tag: `ppl-storno:${lead.id}`,
    }).catch(() => {});
  }
  return { ok: true, state: review ? "review" : "approved" };
}

async function approve(leadId: string, now: Date) {
  const rev = await prisma.revenue.findFirst({ where: { leadId }, select: { id: true, amount: true } });
  await prisma.$transaction([
    prisma.lead.update({
      where: { id: leadId },
      data: { stornoState: "approved", stornoDecidedAt: now, status: "Storno", creditAmount: rev?.amount ?? 0 },
    }),
    ...(rev ? [prisma.revenue.update({ where: { id: rev.id }, data: { cancelled: true } })] : []),
  ]);
}

/** Admin entscheidet über einen Storno in Prüfung. */
export async function decideStorno(leadId: string, accept: boolean, now = new Date()) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { stornoState: true, customerId: true } });
  if (lead?.stornoState !== "review") return false;
  if (accept) await approve(leadId, now);
  else await prisma.lead.update({ where: { id: leadId }, data: { stornoState: "rejected", stornoDecidedAt: now } });
  await audit(accept ? "storno.approve" : "storno.reject", { entity: "Lead", entityId: leadId, customerId: lead.customerId });
  return true;
}

/** Offene Gutschriften eines Bezugs (noch auf keiner Rechnung). */
export async function openCredits(subscriptionId: string) {
  const rows = await prisma.lead.findMany({
    where: { subscriptionId, stornoState: "approved", creditedAt: null, creditAmount: { gt: 0 } },
    select: { id: true, creditAmount: true },
  });
  return { leadIds: rows.map((r) => r.id), amount: rows.reduce((n, r) => n + Number(r.creditAmount ?? 0), 0) };
}
