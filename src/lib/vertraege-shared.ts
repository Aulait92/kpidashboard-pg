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
export const NACH_ABSCHLUSS_TODOS: readonly string[] = [CROSS_SELL_TODO, POLICE_TODO];
