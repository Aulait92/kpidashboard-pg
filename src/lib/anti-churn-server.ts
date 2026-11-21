// Anti-Churn beim Kündigen: Kündigungsabsicht speichern, Alternative merken, uns benachrichtigen
// (Push, bei Rückruf/Kampagnen-Check und Termin eine Aufgabe). Regeln und Texte: lib/anti-churn.ts.

import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { CHURN_OFFERS, churnReasonLabel, type ChurnOffer, type ChurnReason } from "@/lib/anti-churn";

const PUSH_EVERY_MS = 24 * 60 * 60 * 1000;

async function customerBasics(customerId: string) {
  return prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true, isTest: true, salesContact: { select: { id: true } }, onboarding: { select: { salesContactId: true } } },
  });
}

/** Grund gewählt (oder ohne Angabe weiter): Absicht speichern, uns höchstens einmal am Tag per Push melden. */
export async function recordChurnIntent(
  customerId: string,
  input: { reason: ChurnReason | null; note?: string | null; actor: AuditActor },
  now = new Date(),
): Promise<{ id: string }> {
  const note = input.note?.trim().slice(0, 1000) || null;
  const recent = await prisma.churnIntent.findFirst({ where: { customerId, createdAt: { gte: new Date(now.getTime() - PUSH_EVERY_MS) } }, select: { id: true } });
  const intent = await prisma.churnIntent.create({
    data: { customerId, userId: input.actor.id ?? null, reason: input.reason, note, outcome: "offen" },
    select: { id: true },
  });
  await audit("contract.cancel_intent", { entity: "Customer", entityId: customerId, customerId, details: { reason: input.reason, note }, actor: input.actor });
  const c = await customerBasics(customerId);
  if (!recent && c && !c.isTest) {
    const { sendToAdmins } = await import("@/lib/push");
    await sendToAdmins({
      title: `Kündigungsabsicht: ${c.name}`,
      body: `${churnReasonLabel(input.reason)}${note ? ` · ${note.slice(0, 80)}` : ""}`,
      url: `/admin/neu/kunden/${customerId}/abrechnung`,
      tag: `churn:${customerId}`,
    }).catch(() => {});
  }
  return intent;
}

/** Alternative gewählt. Bei Kampagnen-Check und Rückruf entsteht eine Aufgabe für uns. */
export async function chooseChurnOffer(customerId: string, intentId: string, offer: ChurnOffer, actor: AuditActor, now = new Date()): Promise<{ ok: true } | { ok: false; error: string }> {
  const intent = await prisma.churnIntent.findFirst({ where: { id: intentId, customerId }, select: { id: true, reason: true, note: true, offer: true } });
  if (!intent) return { ok: false, error: "Bitte noch einmal von vorn beginnen." };
  await prisma.churnIntent.update({ where: { id: intent.id }, data: { offer, outcome: "alternative", decidedAt: now } });
  await audit("contract.cancel_alternative", { entity: "Customer", entityId: customerId, customerId, details: { offer, reason: intent.reason }, actor });
  if (offer !== "check" && offer !== "rueckruf") return { ok: true };
  if (intent.offer === offer) return { ok: true }; // schon angefordert
  const c = await customerBasics(customerId);
  const contactId = c?.salesContact?.id ?? c?.onboarding?.salesContactId ?? null;
  const name = c?.name ?? "Kunde";
  const days = offer === "check" ? 2 : 1;
  await prisma.salesTask
    .create({
      data: {
        contactId,
        type: offer === "rueckruf" ? "ANRUF" : "SONSTIGES",
        title: `${offer === "check" ? "Kampagnen-Check" : "Rückruf"} statt Kündigung: ${name}`,
        note: [
          `Kunde wollte kündigen und hat „${CHURN_OFFERS[offer].title}“ gewählt (${actor.email ?? "unbekannt"}).`,
          `Grund: ${churnReasonLabel(intent.reason)}${intent.note ? `, ${intent.note}` : ""}.`,
          offer === "check" ? "Zugesagt: Rückmeldung mit konkreten Änderungen innerhalb von zwei Werktagen." : "Zugesagt: Anruf innerhalb eines Werktags.",
        ].join("\n"),
        dueAt: addWorkdays(now, days),
      },
    })
    .catch((err) => reportError(err, "churn-task", { customer: customerId }));
  if (c && !c.isTest) {
    const { sendToAdmins } = await import("@/lib/push");
    await sendToAdmins({
      title: `${offer === "check" ? "Kampagnen-Check" : "Rückruf"} statt Kündigung: ${name}`,
      body: churnReasonLabel(intent.reason),
      url: `/admin/neu/kunden/${customerId}/abrechnung`,
      tag: `churn-offer:${customerId}`,
    }).catch(() => {});
  }
  return { ok: true };
}

/** Nach der Kündigung: offene Absichten des Kunden als „gekündigt“ abschließen. */
export async function closeChurnIntents(customerId: string, now = new Date()): Promise<void> {
  await prisma.churnIntent.updateMany({ where: { customerId, outcome: { in: ["offen", "alternative"] }, createdAt: { gte: new Date(now.getTime() - 30 * PUSH_EVERY_MS) } }, data: { outcome: "gekuendigt", decidedAt: now } });
}

/** Für die Kundenakte: letzte Absichten. */
export async function loadChurnIntents(customerId: string, take = 5) {
  return prisma.churnIntent.findMany({ where: { customerId }, orderBy: { createdAt: "desc" }, take, select: { id: true, reason: true, note: true, offer: true, outcome: true, createdAt: true } });
}

/** Werktage (Mo bis Fr) addieren, für die Fälligkeit der Aufgabe. */
export function addWorkdays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}
