// Admin → Bezug → „Testdatensatz senden“: klar markierter Test-Lead („TEST Lead“, Betreff mit [TEST])
// an alle Lieferadressen des Bezugs. Es entsteht kein Lead, kein Pool-Lead und kein Umsatz:
// zählt nicht ins Kontingent, nicht in Umsatz oder Auswertung. Steht im Änderungsprotokoll.

import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { deliverTo, type DeliveryLead, type DeliveryTarget } from "@/lib/ppl/delivery";

export type TestLeadResult = { ok: boolean; error?: string; label?: string; targets: DeliveryTarget[]; leadId?: string };

/** Testdatensatz (rein): feste, offensichtliche Testwerte. */
export function testLead(productKey: string, now = new Date()): DeliveryLead {
  const stamp = now.toISOString().replace(/\D/g, "").slice(0, 14);
  const pkv = /pkv|kranken/i.test(productKey);
  return {
    id: `TEST-${stamp}`,
    product: productKey,
    name: "TEST Lead",
    phone: "4915100000000",
    email: "test-lead@example.com",
    answers: [
      { label: "Postleitzahl", value: "10115" },
      { label: "Ort", value: "Berlin" },
      ...(pkv
        ? [
            { label: "Situation", value: "Angestellt" },
            { label: "Aktuelle Versicherung", value: "Testversicherung" },
            { label: "Monatlicher Beitrag", value: "850" },
          ]
        : []),
      { label: "Hinweis", value: "Testdatensatz, bitte nicht bearbeiten" },
    ],
    date: now,
    consentAt: now,
    test: true,
  };
}

export async function sendTestLead(subscriptionId: string, actor?: AuditActor, now = new Date()): Promise<TestLeadResult> {
  const sub = await prisma.leadSubscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) return { ok: false, error: "Bezug nicht gefunden.", targets: [] };
  if (sub.delivery === "app") return { ok: false, error: "Testversand gibt es nur für Lieferung per E-Mail oder Webhook.", targets: [] };
  const lead = testLead(sub.productKey, now);
  const report = await deliverTo(sub, lead);
  await audit("ppl.test", {
    entity: "LeadSubscription",
    entityId: sub.id,
    customerId: sub.customerId,
    actor,
    details: { leadId: lead.id, lieferweg: report.label, ok: report.ok, an: report.targets.map((t) => ({ an: t.target, ok: t.ok, ...(t.error ? { fehler: t.error } : {}) })) },
  });
  return { ok: report.ok, error: report.error, label: report.label, targets: report.targets, leadId: lead.id };
}
