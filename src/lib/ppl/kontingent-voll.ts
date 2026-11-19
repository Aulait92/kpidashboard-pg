// Pay-per-Lead: Meldung „Kontingent erreicht“ (Ole, 19.11.2026).
// Erreicht ein Bezug durch eine Zustellung sein Kontingent (einmalig oder je Monat),
// geht genau einmal je Bezug, Zeitraum und Menge eine Meldung an die Admins (Push)
// und in Slack (SLACK_PPL_WEBHOOK_URL, Schalter slackNotify je Bezug). Ebenso, wenn ein
// Gebiet mit eigener Menge voll ist (der Bezug selbst aber noch Kontingent hat).
// Einmaligkeit ohne eigene Tabelle: Audit-Eintrag „ppl.kontingent_voll“ mit Schlüssel,
// geprüft und geschrieben unter einer Advisory-Sperre (gleichzeitige Zustellungen).
// Wochenbestellungen (period „week“) melden nichts: dort ist jede Bestellung ein eigener Auftrag.

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { sendToAdmins } from "@/lib/push";
import { postSlack } from "@/lib/ppl/slack";
import { areaPeriodRange, areaQuotas, quotaFor } from "@/lib/ppl/engine";
import { fmtWeek, monthRange } from "@/lib/ppl/periods";

export const KONTINGENT_VOLL_ACTION = "ppl.kontingent_voll";

const TZ = "Europe/Berlin";
const monatsName = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, month: "long" }).format(d);

export type KontingentVollInfo = {
  customer: string;
  label?: string | null;
  product: string;
  delivered: number;
  quota: number;
  /** „einmalig“, „im November“ oder „in der Woche 16.11. bis 22.11.“ */
  zeitraum: string;
  period: "once" | "month" | "week";
  /** gesetzt = Gebiet voll (nicht der ganze Bezug) */
  area?: string | null;
};

/** Text der Meldung (rein, getestet). Keine Gedankenstriche. */
export function kontingentVollText(i: KontingentVollInfo): string {
  const wer = `${i.customer}${i.label && i.label !== i.customer ? ` (${i.label})` : ""}`;
  const menge = `${i.delivered} von ${i.quota} Leads geliefert`;
  if (i.area) {
    const wann = i.period === "week" ? "diese Woche" : "diesen Monat";
    return `Gebiet voll: ${wer}, ${i.product}, Gebiet ${i.area}, ${menge} ${i.zeitraum}. Aus diesem Gebiet bekommt der Bezug ${wann} keine weiteren Leads.`;
  }
  if (i.period === "once") return `Kontingent erreicht: ${wer}, ${i.product}, ${menge} (einmalig). Der Bezug bekommt keine weiteren Leads.`;
  return `Kontingent erreicht: ${wer}, ${i.product}, ${menge} ${i.zeitraum}. Der Bezug bekommt diesen Monat keine weiteren Leads.`;
}

/** true, wenn für diesen Schlüssel noch nicht gemeldet wurde (und vermerkt jetzt). */
async function erstmals(key: string, sub: { id: string; customerId: string }, details: Record<string, unknown>): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ppl-kontingent-voll:${key}`}))`;
    const seen = await tx.auditLog.findFirst({ where: { action: KONTINGENT_VOLL_ACTION, entityId: sub.id, details: { path: ["key"], equals: key } }, select: { id: true } });
    if (seen) return false;
    await tx.auditLog.create({
      data: { action: KONTINGENT_VOLL_ACTION, actorRole: "system", entity: "LeadSubscription", entityId: sub.id, customerId: sub.customerId, details: { key, ...details } as Prisma.InputJsonValue },
    });
    return true;
  });
}

async function melden(text: string, product: string, slackNotify: boolean) {
  await sendToAdmins({ title: `Kontingent erreicht: ${product}`, body: text, url: "/admin/ppl", tag: `ppl-kontingent:${product}` }).catch((err: unknown) =>
    reportError(err, "ppl-kontingent-voll", { step: "push" }),
  );
  if (slackNotify) await postSlack(`🎯 ${text}`);
}

/**
 * Nach einer Zustellung prüfen, ob der Bezug (bzw. das belieferte Gebiet) sein
 * Kontingent erreicht hat, und dann genau einmal melden. Wirft nie.
 */
export async function pruefeKontingentVoll(subscriptionId: string, areaId: string | null, now = new Date()): Promise<void> {
  try {
    const sub = await prisma.leadSubscription.findUnique({ where: { id: subscriptionId }, include: { areas: true, customer: { select: { name: true } } } });
    if (!sub || sub.period === "week") return;
    const q = await quotaFor(sub, now);
    if (!q) return;
    const areas = sub.areas.length ? await areaQuotas(sub, now) : [];
    // wie distribute(): ohne Ziel gilt die Summe der Gebietsmengen als Kontingent
    const quota = !sub.goal && areas.length ? areas.reduce((n, a) => n + a.quantity, 0) : q.quota;
    const period = sub.period === "month" ? "month" : "once";
    const base = { customer: sub.customer.name, label: sub.label, product: sub.productKey };
    if (quota > 0 && q.delivered >= quota) {
      const start = period === "month" ? monthRange(now).start : null;
      const key = `${sub.id}:${start ? start.toISOString() : "einmalig"}:${quota}`;
      if (!(await erstmals(key, sub, { quota, delivered: q.delivered, period }))) return;
      const zeitraum = start ? `im ${monatsName(now)}` : "einmalig";
      await melden(kontingentVollText({ ...base, delivered: q.delivered, quota, zeitraum, period }), sub.productKey, sub.slackNotify);
      return;
    }
    const area = areaId ? sub.areas.find((a) => a.id === areaId) : null;
    const aq = area ? areas.find((a) => a.id === area.id) : null;
    if (!area || !aq || aq.quantity <= 0 || aq.delivered < aq.quantity) return;
    const r = areaPeriodRange(area, sub, now);
    const areaPeriod = area.period ?? (sub.period === "week" ? "week" : "month");
    const key = `${sub.id}:gebiet:${area.id}:${r.start.toISOString()}:${aq.quantity}`;
    if (!(await erstmals(key, sub, { areaId: area.id, quota: aq.quantity, delivered: aq.delivered, period: areaPeriod }))) return;
    const zeitraum = areaPeriod === "week" ? `in der Woche ${fmtWeek(r.start)}` : `im ${monatsName(now)}`;
    await melden(
      kontingentVollText({ ...base, delivered: aq.delivered, quota: aq.quantity, zeitraum, period: areaPeriod === "week" ? "week" : "month", area: area.label || area.plzRanges }),
      sub.productKey,
      sub.slackNotify,
    );
  } catch (err) {
    reportError(err, "ppl-kontingent-voll", { sub: subscriptionId });
  }
}
