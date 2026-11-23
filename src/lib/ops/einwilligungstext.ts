// Diagnose „einwilligungstext“ (Ole, 21.11.2026: „hol dir den Einwilligungstext selbst“): fertiger Wortlaut des
// Einwilligungs-Häkchens fürs Meta-Leadformular eines Kunden (wie Kampagnen-Assistent, lib/kampagnen/context.ts) und
// fehlende Angaben. Nur Geschäftsangaben des Vermittlers, keine Lead-Daten.
//   GET /api/ops/diagnose?q=einwilligungstext&kunde=<Kunden-ID>
import { consentAngabenFor } from "@/lib/einwilligung-leadformular-server";
import { consentMissing, leadFormConsentText, CONSENT_VERSION, KNOPF_TITEL } from "@/lib/einwilligung-leadformular";

export async function einwilligungstextDiagnose(p: URLSearchParams) {
  const kunde = (p.get("kunde") ?? "").trim();
  if (!kunde) return { fehler: "kunde fehlt" };
  const angaben = await consentAngabenFor(kunde);
  const privacy = await import("@/lib/erstinformation").then((m) => m.datenschutzUrlFor(kunde)).catch(() => null);
  const x = { ...angaben, datenschutzUrl: privacy ?? angaben.datenschutzUrl };
  return { version: CONSENT_VERSION, titel: KNOPF_TITEL, haekchen: false, text: leadFormConsentText(x), fehlt: consentMissing(x) };
}
