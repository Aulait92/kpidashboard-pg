// Aus-Schalter für Airtable nach der Pay-per-Lead-Umstellung (siehe
// docs/ppl-umstellung-drehbuch.md). AIRTABLE_SYNC_OFF=1:
//   - /api/sync überspringt nur den Airtable-Abgleich (inkl. PplIntake und
//     Löschlauf); Meta-/Outbrain-/TikTok-/Google-Kosten laufen weiter.
//   - Rückschreiben nach Airtable (Storno, Lead-Felder, Abschlusswert) wird
//     zur stillen No-op, damit Kundenaktionen an alten Airtable-Leads nicht
//     scheitern. Die App-Datenbank bleibt die Wahrheit.

export const AIRTABLE_SKIPPED_NOTE = "Airtable übersprungen (AIRTABLE_SYNC_OFF)";

export function airtableSyncOff(env: Record<string, string | undefined> = process.env): boolean {
  return (env.AIRTABLE_SYNC_OFF ?? "").trim() === "1";
}

const g = globalThis as typeof globalThis & { __airtableWriteSkipLogged?: boolean };

/**
 * true = nicht nach Airtable schreiben (Schalter an). Meldet das einmal je
 * Prozess im Log, statt bei jedem Aufruf.
 */
export function skipAirtableWrite(what: string): boolean {
  if (!airtableSyncOff()) return false;
  if (!g.__airtableWriteSkipLogged) {
    g.__airtableWriteSkipLogged = true;
    console.info(`[airtable] AIRTABLE_SYNC_OFF=1: Schreiben nach Airtable ausgeschaltet (zuerst: ${what}).`);
  }
  return true;
}
