// Platzhalter für fehlende Werte und Zeiträume (Usability-Check 18.11.2026): kein „–“ als Platzhalter und kein
// Gedankenstrich in Zeiträumen (Ole, 14.11.2026: keine Gedankenstriche). Reine Daten, auch im Browser nutzbar.

/** Einzelner Wert fehlt (Name, Datum, Feld). */
export const KEINE_ANGABE = "keine Angabe";

/** Kennzahl ohne Grundlage (noch keine Termine, Kosten, Abschlüsse im Zeitraum). */
export const NOCH_KEINE_DATEN = "noch keine Daten";

/** Zeitraum ohne Gedankenstrich: „10 bis 11 Uhr“, „01.11. bis 07.11.“. */
export function spanne(von: string, bis: string, einheit?: string): string {
  return `${von} bis ${bis}${einheit ? ` ${einheit}` : ""}`;
}
