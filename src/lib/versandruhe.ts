// Versandruhe für automatische Nachrichten an Leads (Ole, 27.11.2026: Live-Test, „Chat ruht“ ging an einem Sonntag raus).
// Keine automatischen Nachrichten an Sonntagen und an bundesweiten Feiertagen (Europe/Berlin); sie gehen am nächsten
// Werktag im Versandfenster raus. Gilt für alle Nachfass-Abfolgen (lib/lead-sequences.ts inSendWindow, die E-Mail-Schritte
// über lib/angebot-senden.ts naechsterVersand). Nicht für direkte Antworten des Assistenten auf eine Nachricht des Leads
// und nicht für Erinnerungen zu einem gebuchten Termin (die gehören zum Termin). Rein, ohne Laufzeit-Imports.
//
// Bundesweite Feiertage: Neujahr, Karfreitag, Ostermontag, 1. Mai, Christi Himmelfahrt, Pfingstmontag, 3. Oktober,
// 1. und 2. Weihnachtstag. Regionale Feiertage zählen nicht (die Region des Leads ist meist unbekannt).

const TZ = "Europe/Berlin";

/** Ostersonntag (Gauß, gregorianisch) als YYYY-MM-DD. */
function ostersonntag(y: number): { m: number; d: number } {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return { m: Math.floor((h + l - 7 * m + 114) / 31), d: ((h + l - 7 * m + 114) % 31) + 1 };
}

const ymd = (dt: Date) => dt.toISOString().slice(0, 10);

const cache = new Map<number, Set<string>>();
/** Bundesweite gesetzliche Feiertage eines Jahres (YYYY-MM-DD). */
export function bundesweiteFeiertage(y: number): Set<string> {
  let s = cache.get(y);
  if (!s) {
    const o = ostersonntag(y);
    const ostern = Date.UTC(y, o.m - 1, o.d, 12);
    s = new Set([
      ...["01-01", "05-01", "10-03", "12-25", "12-26"].map((x) => `${y}-${x}`),
      // Karfreitag, Ostermontag, Christi Himmelfahrt, Pfingstmontag
      ...[-2, 1, 39, 50].map((n) => ymd(new Date(ostern + n * 86_400_000))),
    ]);
    cache.set(y, s);
  }
  return s;
}

export function istBundesFeiertag(tag: string): boolean {
  return bundesweiteFeiertage(Number(tag.slice(0, 4))).has(tag);
}

/** Kalendertag in Berlin (YYYY-MM-DD). */
export const berlinTagVon = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const berlinStunde = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(d));

/** Sonntag oder bundesweiter Feiertag (Berlin): keine automatischen Nachrichten an Leads. */
export function istRuhetag(d: Date): boolean {
  const tag = berlinTagVon(d);
  return new Date(`${tag}T12:00:00Z`).getUTCDay() === 0 || istBundesFeiertag(tag);
}

export type Stunden = { von: number; bis: number };
/** Standard-Versandfenster der Abfolgen: 9 bis 19 Uhr. */
export const VERSAND_STUNDEN: Stunden = { von: 9, bis: 19 };

/** Im Versandfenster: Werktag (Mo bis Sa, kein Feiertag) und Stunde in [von, bis). */
export function imVersandfenster(d: Date, stunden: Stunden = VERSAND_STUNDEN): boolean {
  if (istRuhetag(d)) return false;
  const h = berlinStunde(d);
  return h >= stunden.von && h < stunden.bis;
}

/** Erster Zeitpunkt ab `at` im Versandfenster (volle Stunden), höchstens eine Woche voraus. */
export function naechsterVersandzeitpunkt(at: Date, stunden: Stunden = VERSAND_STUNDEN): Date {
  if (imVersandfenster(at, stunden)) return at;
  const H = 60 * 60 * 1000;
  let d = new Date(Math.ceil(at.getTime() / H) * H);
  for (let i = 0; i < 24 * 7 && !imVersandfenster(d, stunden); i++) d = new Date(d.getTime() + H);
  return d;
}
