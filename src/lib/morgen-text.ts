// Zeile auf „Heute“ (Paket P6): rein, auch im Browser nutzbar (ohne Datenbank, anders als lib/nachrichtenplan.ts).

/** „Morgen: 3 automatische Nachrichten“ (eine Zeile, auch am Handy). */
export function morgenText(anzahl: number): string {
  return anzahl === 1 ? "Morgen: 1 automatische Nachricht" : `Morgen: ${anzahl} automatische Nachrichten`;
}
