// Admin → Bezug → „Testdatensatz senden“: klar markierter Test-Lead („TEST Lead“, Betreff mit [TEST])
// an alle Lieferadressen des Bezugs, mit allen Feldern des echten Funnels. Bei „Kundenbereich + PDF
// per Mail“ nur die PDF-Mail, nie ein Lead im Kundenbereich. Es entsteht kein Lead, kein Pool-Lead und kein Umsatz:
// zählt nicht ins Kontingent, nicht in Umsatz oder Auswertung. Steht im Änderungsprotokoll.

import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { deliverTo, type DeliveryLead, type DeliveryTarget } from "@/lib/ppl/delivery";
import { categoryLabels, categoryOf } from "@/lib/ppl/perspective";

export type TestLeadResult = { ok: boolean; error?: string; label?: string; targets: DeliveryTarget[]; leadId?: string };

/** Felder des PKV-Funnels in dieser Reihenfolge (Namen wie aus perspective.ts translatePerspective). */
export const PKV_TEST_FIELDS = [
  "Vorname",
  "Nachname",
  "Telefonnummer",
  "E-Mail",
  "Postleitzahl",
  "Ort",
  "Geburtsdatum",
  "Situation",
  "Gesetzlich oder privat?",
  "Aktuelle Versicherung",
  "Wie lange in PKV?",
  "Monatlicher Beitrag",
] as const;

/** Grundfelder jedes Perspective-Funnels (translatePerspective). */
const BASE_FIELDS = ["Vorname", "Nachname", "Telefonnummer", "E-Mail", "Postleitzahl", "Ort", "Geburtsdatum"];

const PHONE = "4915100000000";
const EMAIL = "test-lead@example.com";

/** Offensichtliche, aber plausible Testwerte je Feldname. */
const SAMPLE: Record<string, string> = {
  Vorname: "TEST",
  Nachname: "Lead",
  Telefonnummer: `+${PHONE}`,
  "E-Mail": EMAIL,
  Postleitzahl: "10115",
  Ort: "Berlin",
  Geburtsdatum: "01.01.1980",
  Situation: "Angestellt",
  "Gesetzlich oder privat?": "Privat",
  "Aktuelle Versicherung": "Testversicherung AG",
  "Wie lange in PKV?": "Mehr als 10 Jahre",
  "Monatlicher Beitrag": "850",
  Tierart: "Hund",
  "Geburtsjahr (Tier)": "2020",
  "Anzahl Tiere": "1",
  Tiername: "Testi",
  "Geschlecht (Tier)": "Männlich",
  "Rasse (Tier)": "Mischling",
  "Geburtsmonat (Tier)": "Mai",
  "Kastriert (Tier)": "Ja",
  "Haltung (Tier)": "Wohnung",
  "Alter (Futter)": "4 Jahre",
  "Gewicht (Futter)": "20",
  "Aktivitätslevel (Futter)": "Mittel",
  "Gesundheitliche Probleme (Futter)": "Nein",
  "Gesundheit-Detail (Futter)": "keine",
  "Allergien (Futter)": "Nein",
  "Allergie-Detail (Futter)": "keine",
  "Aktuelles Futter (Futter)": "Trockenfutter",
  "Interesse (Sterbegeld)": "Ja",
  "Absicherungshöhe (Sterbegeld)": "8.000 bis 12.000 €",
  "Altersklasse (Sterbegeld)": "56 bis 70 Jahre",
  "Anzahl Kinder (KSP)": "Ein Kind",
  "Zielbetrag (KSP)": "10.000 bis 20.000 €",
  "Alter der Kinder (KSP)": "1 bis 6 Jahre",
  "Monatliche Sparrate (KSP)": "100 bis 200 € pro Monat",
  "Zeithorizont (KSP)": "So zeitnah wie möglich",
  "Fehlende Zähne (Zahnzusatz)": "Keine",
  "Interesse (Zahnzusatz)": "Ja",
};

/** Feldnamen des echten Funnels zum Produkt, in Funnel-Reihenfolge. */
export function testFields(productKey: string): string[] {
  const cat = categoryOf(productKey);
  if (cat === "pkv") return /pkv|kranken/i.test(productKey) ? [...PKV_TEST_FIELDS] : BASE_FIELDS;
  return [...BASE_FIELDS, ...(cat === "tier" ? ["Tierart"] : []), ...categoryLabels(cat)];
}

/** Testdatensatz (rein): alle Felder des echten Funnels mit offensichtlichen Testwerten. */
export function testLead(productKey: string, now = new Date()): DeliveryLead {
  const stamp = now.toISOString().replace(/\D/g, "").slice(0, 14);
  return {
    id: `TEST-${stamp}`,
    product: productKey,
    name: "TEST Lead",
    phone: PHONE,
    email: EMAIL,
    answers: testFields(productKey).map((label) => ({ label, value: SAMPLE[label] ?? "TEST" })),
    date: now,
    consentAt: now,
    test: true,
  };
}

export async function sendTestLead(subscriptionId: string, actor?: AuditActor, now = new Date()): Promise<TestLeadResult> {
  const sub = await prisma.leadSubscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) return { ok: false, error: "Bezug nicht gefunden.", targets: [] };
  if (sub.delivery === "app") return { ok: false, error: "Testversand gibt es nur für Lieferung per E-Mail, PDF per Mail oder Webhook.", targets: [] };
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
