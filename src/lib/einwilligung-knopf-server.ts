// Einwilligung per Knopf bei von Hand angelegten Formularen erkennen (Ole, 26.11.2026: Anid sah „Keine Einwilligung
// gespeichert“, obwohl das kopierte Formular den Einwilligungstext über „Senden“ hat). Die App kennt die Knopf-Fassung
// sonst nur bei selbst angelegten Formularen (LeadSource.consentVersion). Hier: Text aus Meta lesen, bei Knopf-Fassung
// an der Zuordnung speichern und schon eingegangene Leads dieses Formulars ohne Nachweis nachtragen.
import { prisma } from "@/lib/prisma";
import { CONSENT_VERSION_KNOPF, knopfEinwilligungAus } from "@/lib/einwilligung-leadformular";
import { reportError } from "@/lib/monitoring";

/** true, wenn die Zuordnung danach die Knopf-Fassung hat. Fehler (Meta nicht erreichbar) → false, nichts geändert. */
export async function knopfEinwilligungNachtragen(formId: string): Promise<boolean> {
  try {
    const src = await prisma.leadSource.findUnique({ where: { formId }, select: { id: true, pageId: true, consentVersion: true, customerId: true } });
    if (!src) return false;
    if (src.consentVersion) return src.consentVersion === CONSENT_VERSION_KNOPF;
    const { fetchFormLegal } = await import("@/lib/meta-leads");
    const text = knopfEinwilligungAus(await fetchFormLegal(formId, src.pageId));
    if (!text) return false;
    await prisma.leadSource.update({ where: { id: src.id }, data: { consentVersion: CONSENT_VERSION_KNOPF, consentText: text } });
    const leads = await prisma.lead.findMany({ where: { customerId: src.customerId, adFormId: formId, waConsent: null }, select: { id: true, createdAt: true } });
    for (const l of leads) {
      await prisma.lead.update({
        where: { id: l.id },
        data: { waConsent: "ja", consentData: { at: l.createdAt.toISOString(), formId, textVersion: CONSENT_VERSION_KNOPF, text, responses: [] } },
      });
    }
    return true;
  } catch (err) {
    reportError(err, "einwilligung-knopf", { formId });
    return false;
  }
}
