// Kalender, „Wann dürfen Leads Termine buchen?“ (Ole, 16.11.2026): Haben alle Tage mit Terminen dieselben Zeiträume,
// zeigt die Oberfläche sie einmal mit Wochentag-Schaltern statt fünfmal untereinander. Nur Anzeige: gespeichert wird
// weiter derselbe Zeitplan je Tag ({ step, days }), die freien Zeiten rechnet lib/calendar/lead-times.ts unverändert.
// Rein, ohne Server-Import (wird im Browser genutzt), getestet in tests/unit/zeiten-gleich.test.ts.

export type Zeitraum = [string, string];
export type ZeitenJeTag = Record<number, Zeitraum[]>;

/** Wochentage (0 = So … 6 = Sa) mit mindestens einem Zeitraum. */
export function aktiveTage(days: ZeitenJeTag): number[] {
  return Object.keys(days)
    .map(Number)
    .filter((d) => (days[d] ?? []).length > 0)
    .sort((a, b) => a - b);
}

/** Gemeinsame Zeiträume, wenn alle aktiven Tage genau dieselben haben (gleiche Reihenfolge); sonst null. */
export function gemeinsameZeiten(days: ZeitenJeTag): Zeitraum[] | null {
  const tage = aktiveTage(days);
  if (!tage.length) return null;
  const erste = JSON.stringify(days[tage[0]]);
  return tage.every((d) => JSON.stringify(days[d]) === erste) ? days[tage[0]].map((r) => [r[0], r[1]] as Zeitraum) : null;
}

/** Dieselben Zeiträume auf die gewählten Tage verteilen (je Tag eine eigene Kopie). */
export function aufTageVerteilen(zeiten: Zeitraum[], tage: number[]): ZeitenJeTag {
  const out: ZeitenJeTag = {};
  if (!zeiten.length) return out;
  for (const d of [...tage].sort((a, b) => a - b)) out[d] = zeiten.map((r) => [r[0], r[1]] as Zeitraum);
  return out;
}
