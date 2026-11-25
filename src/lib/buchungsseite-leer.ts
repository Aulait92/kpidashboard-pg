// Warnung „Buchungsseite ohne freie Zeiten“ (Ole, 25.11.2026, Auswertung Kunde Lohmann): Die öffentliche Buchungsseite
// eines aktiven Software-Kunden zeigte über Stunden keine Vorschläge, weil die gewählte Allianz-Termin-Art keine freien
// Zeiten hatte. Niemand hat es gemerkt. Jetzt prüft der Cron tagsüber je Kunde (lib/buchungsseite-leer-server.ts) und
// merkt sich den Beginn („leer seit“); „Heute“ im Admin liest nur das Feld und rechnet nicht live.
// Rein (ohne Datenbank), getestet in tests/unit/buchungsseite-leer.test.ts.

/** Ab so viel leerer Zeit tagsüber erscheint der Punkt in „Heute“. */
export const LEER_AB_MS = 3 * 60 * 60 * 1000;
/** Je Kunde höchstens so oft prüfen (externe Kalender, Allianz). */
export const PRUEF_ABSTAND_MS = 30 * 60 * 1000;
/** „Tagsüber“ in Berliner Zeit: [von, bis) Uhr. Nur in dieser Zeit wird geprüft und gezählt. */
export const TAG_VON = 8;
export const TAG_BIS = 20;

const berlinStunde = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(d));

/** Jetzt tagsüber (Berlin 8 bis 20 Uhr)? */
export function istTagsueber(now: Date): boolean {
  const h = berlinStunde(now);
  return h >= TAG_VON && h < TAG_BIS;
}

/**
 * Wie lange war die Seite tagsüber leer? Zählt nur die Zeit zwischen 8 und 20 Uhr Berlin (in 5-Minuten-Schritten),
 * damit eine Lücke am Abend nicht schon um 8 Uhr früh als „seit 12 Stunden“ zählt.
 */
export function leerTagsueberMs(seit: Date, now: Date): number {
  const schritt = 5 * 60 * 1000;
  let ms = 0;
  // Höchstens 14 Tage zurück rechnen (danach ist es ohnehin lange genug)
  const start = Math.max(seit.getTime(), now.getTime() - 14 * 86_400_000);
  for (let t = start; t < now.getTime(); t += schritt) {
    if (istTagsueber(new Date(t))) ms += Math.min(schritt, now.getTime() - t);
  }
  return ms;
}

/** Punkt in „Heute“ zeigen? */
export function leerWarnen(seit: Date | null | undefined, now: Date): boolean {
  return !!seit && leerTagsueberMs(seit, now) >= LEER_AB_MS;
}

/** „seit 4 Std.“ bzw. „seit 2 Tagen“ (Zeit seit dem ersten leeren Lauf, nicht nur tagsüber). */
export function leerSeitText(seit: Date, now: Date): string {
  const std = Math.max(0, Math.floor((now.getTime() - seit.getTime()) / 3_600_000));
  if (std < 24) return `seit ${Math.max(1, std)} Std.`;
  const tage = Math.floor(std / 24);
  return tage === 1 ? "seit 1 Tag" : `seit ${tage} Tagen`;
}

/** Was der Cron nach einer Prüfung speichert (rein). null-Felder = nicht ändern. */
export function naechsterStand(
  vorher: { keineZeitenSeit: Date | null },
  ergebnis: { anzahl: number; fehler?: string | null },
  now: Date,
): { keineZeitenSeit: Date | null; leer: boolean; neu: boolean } {
  const leer = ergebnis.anzahl === 0 || !!ergebnis.fehler;
  if (!leer) return { keineZeitenSeit: null, leer: false, neu: false };
  return { keineZeitenSeit: vorher.keineZeitenSeit ?? now, leer: true, neu: !vorher.keineZeitenSeit };
}
