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

const KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
/** Reihenfolge der Woche ab Montag (So am Ende). */
const WOCHE = [1, 2, 3, 4, 5, 6, 0];
const uhr = (hhmm: string) => (hhmm === "24:00" ? "24" : hhmm.endsWith(":00") ? String(Number(hhmm.slice(0, 2))) : hhmm.replace(/^0/, ""));

/** Wochentage kurz: „Mo bis Fr“, „Mo, Mi, Fr“, „Mo bis Mi, Fr“ (Folgen ab drei Tagen zusammengefasst). */
export function tageText(tage: number[]): string {
  const sortiert = WOCHE.filter((d) => tage.includes(d));
  const teile: string[] = [];
  for (let i = 0; i < sortiert.length; ) {
    let j = i;
    while (j + 1 < sortiert.length && WOCHE.indexOf(sortiert[j + 1]) === WOCHE.indexOf(sortiert[j]) + 1) j++;
    if (j - i >= 2) teile.push(`${KURZ[sortiert[i]]} bis ${KURZ[sortiert[j]]}`);
    else for (let k = i; k <= j; k++) teile.push(KURZ[sortiert[k]]);
    i = j + 1;
  }
  return teile.join(", ");
}

/**
 * Beratungszeiten in einem Satzteil für die Anzeige (Einrichtung, „Ich habe keinen Online-Kalender“, 25.11.2026):
 * „Mo bis Fr, 10 bis 17 Uhr“; verschiedene Zeiten je Tag: „Mo, Di, Do (je Tag verschieden)“; keine: null.
 */
export function beratungszeitenText(days: ZeitenJeTag): string | null {
  const tage = aktiveTage(days);
  if (!tage.length) return null;
  const gemeinsam = gemeinsameZeiten(days);
  if (!gemeinsam) return `${tageText(tage)} (je Tag verschieden)`;
  return `${tageText(tage)}, ${gemeinsam.map((r) => `${uhr(r[0])} bis ${uhr(r[1])}`).join(" und ")} Uhr`;
}
