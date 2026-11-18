// Gemeinsame Konstanten der Verträge je Lead (ohne Datenbank, auch für Client und Löschung).

/** Kennzeichen am Bestandskunden, der aus einem Lead mit Abschluss angelegt wurde (nicht aus dem Import). */
export const BESTAND_FROM_LEAD_NOTE = "Kunde mit Abschluss aus der App";

/** Wiedervorlage 6 Wochen nach dem ersten Abschluss (Anfang des Textes). */
export const CROSS_SELL_TODO = "Weiteres Produkt anbieten?";

/** Wiedervorlage 2 Wochen nach dem ersten Abschluss (Text der Aufgabe). */
export const POLICE_TODO = "Police da und erste Zahlung erfolgt?";

/**
 * Wiedervorlagen, die Heute auch bei Kontakten im Abschluss zeigt (Textanfang). Neue Aufgaben nach dem Abschluss
 * (lib/lead-aufgaben.ts, z. B. M6 Willkommen, Unterlagen fehlen) hier ergänzen.
 */
/**
 * Aufgabe beim Abschluss, wenn der Lead im Komplettcheck einen Vertrag derselben Sparte genannt hat (Paket M6):
 * „Alten Vertrag kündigen: Haftpflicht bei HUK-Coburg“. Im Kontakt mit dem Knopf „Kündigung vorbereiten“.
 */
export const KUENDIGUNG_TODO = "Alten Vertrag kündigen";
export const kuendigungNote = (sparte: string, gesellschaft?: string | null) => `${KUENDIGUNG_TODO}: ${sparte}${gesellschaft?.trim() ? ` bei ${gesellschaft.trim()}` : ""}`;
/** Versicherer aus der Aufgabe (für die Musterkündigung), null ohne Angabe. */
export function versichererAusKuendigung(note: string | null | undefined): string | null {
  if (!note?.startsWith(KUENDIGUNG_TODO)) return null;
  return / bei (.+)$/.exec(note)?.[1]?.trim() || null;
}

/** Aufgabe nach der Erinnerung „Unterlagen fehlen“ (Paket M6, gleicher Text wie lib/mail/termin-erinnerung.ts). */
export const UNTERLAGEN_TODO = "Unterlagen nachfassen";

export const NACH_ABSCHLUSS_TODOS: readonly string[] = [CROSS_SELL_TODO, POLICE_TODO, KUENDIGUNG_TODO, UNTERLAGEN_TODO];

/**
 * Wiedervorlage 4 Wochen nach der Unterschrift der Maklervollmacht (Bestandsübertragung, lib/maklervollmacht/uebertragung.ts):
 * „Übertragung bei Allianz bestätigt?“. Im Kontakt mit „Bestätigt“ und „Abgelehnt“; Heute zeigt sie in jeder Phase.
 */
export const UEBERTRAGUNG_TODO = "Übertragung bei";
export const uebertragungNote = (versicherer: string) => `${UEBERTRAGUNG_TODO} ${versicherer.trim()} bestätigt?`;
/** Versicherer aus der Wiedervorlage, null, wenn es keine Übertragungs-Wiedervorlage ist. */
export function versichererAusUebertragung(note: string | null | undefined): string | null {
  if (!note?.startsWith(UEBERTRAGUNG_TODO)) return null;
  return /^Übertragung bei (.+) bestätigt\?$/.exec(note.trim())?.[1]?.trim() || null;
}
