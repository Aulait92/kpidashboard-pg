// „Kein nächster Schritt“ (wie das Warnzeichen in Pipedrive): offener Lead,
// der schon bearbeitet wird, aber weder Wiedervorlage noch Termin hat.
// Neue Leads zählen nicht – für die gibt es die Rückrufliste.

const OPEN_WITHOUT_NEW = new Set(["Nicht erreicht", "Im Gespräch", "In Beratung", "Termin vereinbart", "Angebot gesendet", "Angebot verschickt", "Angebot raus", "Erreicht", "Qualifiziert", "Angebot/Beratung läuft"]);

export function needsNextStep(l: { status: string | null; closedAt?: Date | null; erasedAt?: Date | null; followUpAt?: Date | string | null; hasUpcomingAppointment?: boolean }): boolean {
  if (l.closedAt || l.erasedAt) return false;
  if (!l.status || !OPEN_WITHOUT_NEW.has(l.status)) return false;
  if (l.followUpAt) return false;
  return !l.hasUpcomingAppointment;
}
