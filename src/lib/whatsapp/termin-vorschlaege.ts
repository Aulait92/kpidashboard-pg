// Zwei konkrete Terminvorschläge fürs Nachfassen (Ole, 15.11.2026): statt „Antworten Sie einfach hier“ zwei freie
// Zeiten aus dem Kalender (bestehende Frei/Belegt-Logik, lib/calendar → suggestSlots), mit Knöpfen
// „Erste Zeit passt“/„Zweite Zeit passt“/„Andere Zeit“. Der Payload trägt die Startzeit (slot:<ISO>), der Assistent
// bucht dann genau diese Zeit (lib/whatsapp/knopf.ts). Ohne verbundenen Kalender bzw. ohne freie Zeiten: null,
// dann nimmt der Aufrufer die kurze Nachfrage (followup_nudge).

import { slotPayload } from "@/lib/whatsapp/knopf";

const TZ = "Europe/Berlin";

/** „Di., 17.11. um 10:00 Uhr“ */
export function slotLabel(iso: string): string {
  const d = new Date(iso);
  const tag = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: TZ }).format(d);
  const zeit = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(d);
  return `${tag} um ${zeit} Uhr`;
}

const dayKey = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date(iso));

/**
 * Vorlaufzeit (Show-up-Paket, Ole 17.11.2026): Ziel 24 bis 48 Stunden, mehr als 3 Werktage nur auf Wunsch des Leads.
 * Die Wahl bleibt „früheste Zeit plus früheste an einem anderen Tag“ (Ole, 15.11. und 17.11.2026).
 */
export const MAX_VORLAUF_WERKTAGE = 3;

/** Werktage (Mo bis Fr) nach heute bis einschließlich zum Tag des Termins (Berlin); heute = 0. */
export function werktageBis(iso: string, now: Date): number {
  const ziel = dayKey(iso);
  let n = 0;
  for (let d = 1; d < 60; d++) {
    const tag = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    const key = dayKey(tag.toISOString());
    if (key > ziel) break;
    const wd = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short" }).format(tag);
    if (wd !== "Sat" && wd !== "Sun") n++;
  }
  return n;
}

/**
 * Zwei Vorschläge: der früheste und der früheste an einem anderen Tag. Gibt es keinen anderen Tag (bzw. mit
 * gleicherTag: nur dieser Tag gefragt), eine Zeit mindestens 3 Stunden später, sonst 2 Stunden, sonst die späteste
 * (Ole, 21.11.2026: „lieber 2 Vorschläge, die nicht nur 30 Min. auseinander liegen“). Rein, testbar. Mit `now`
 * nur Zeiten innerhalb von 3 Werktagen, solange es dort zwei gibt (sonst wie bisher, damit überhaupt Zeiten kommen).
 */
export function pickTwoSlots<T extends { start: string }>(slots: T[], opts: { now?: Date; maxWerktage?: number; gleicherTag?: boolean } = {}): [T, T] | null {
  if (slots.length < 2) return null;
  const nah = opts.now ? slots.filter((s) => werktageBis(s.start, opts.now!) <= (opts.maxWerktage ?? MAX_VORLAUF_WERKTAGE)) : slots;
  const pool = nah.length >= 2 ? nah : slots;
  const first = pool[0];
  const t0 = new Date(first.start).getTime();
  const rest = pool.slice(1).filter((s) => new Date(s.start).getTime() > t0);
  const tag = rest.filter((s) => dayKey(s.start) === dayKey(first.start));
  const abstand = (h: number) => (s: T) => new Date(s.start).getTime() - t0 >= h * 60 * 60 * 1000;
  const anderer = opts.gleicherTag ? undefined : rest.find((s) => dayKey(s.start) !== dayKey(first.start));
  const other = anderer ?? tag.find(abstand(3)) ?? tag.find(abstand(2)) ?? (opts.gleicherTag ? tag.at(-1) : rest.find(abstand(3)) ?? rest.at(-1)) ?? pool[1];
  return [first, other];
}

/** Liegen zwei Vorschläge am selben Tag weniger als 2 Stunden auseinander? (dann neu wählen) */
export function zuNahBeieinander(a: string, b: string): boolean {
  return dayKey(a) === dayKey(b) && Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 2 * 60 * 60 * 1000;
}

export type Terminvorschlaege = { labels: [string, string]; starts: [string, string]; payloads: string[] };

/** Zwei freie Zeiten für diesen Lead; null ohne Kalender bzw. ohne freie Zeiten. Wirft nie. */
export async function zweiTerminvorschlaege(customerId: string, leadId: string | null | undefined): Promise<Terminvorschlaege | null> {
  try {
    const { bookingDurationMin, suggestSlots } = await import("@/lib/calendar");
    const duration = await bookingDurationMin(customerId, leadId).catch(() => 30);
    const two = pickTwoSlots(await suggestSlots(customerId, duration, 40, "lead", 10, leadId), { now: new Date() });
    if (!two) return null;
    const starts: [string, string] = [two[0].start, two[1].start];
    // Dritter Knopf „Andere Zeit“ ohne eigenen Payload (Knopftext genügt)
    return { labels: [slotLabel(starts[0]), slotLabel(starts[1])], starts, payloads: [slotPayload(starts[0]), slotPayload(starts[1]), "andere_zeit"] };
  } catch {
    return null;
  }
}

// Terminsuche über 7 Tage (Ole, 22.11.2026): Nennt der Lead einen Terminwunsch mehr als 7 Tage in der Zukunft („in drei
// Wochen“, „im Dezember“, „nach meinem Urlaub am 15.12.“), schlägt der Assistent keine Zeiten in den nächsten Tagen
// vor, sondern legt eine Wiedervorlage an (lib/lead-sequences.ts scheduleBotRecall, Abfolge „recall“) und bestätigt
// kurz (gespraech.ts wiedervorlageText). Wünsche bis 7 Tage: Zeiten ab dem Wunschtag wie bisher (bot.ts wunschTagAb).

/** Mehr als so viele Tage Abstand: der Terminwunsch gilt als „fern“, Wiedervorlage statt Zeiten. */
export const FERN_AB_TAGEN = 7;
/** Höchstens so weit im Voraus (wie wunschTagAb und scheduleBotRecall); später übernimmt der Assistent wie bisher. */
export const FERN_MAX_TAGE = 90;
/** Uhrzeit der Wiedervorlage am Wunschtag (deutsche Zeit, im Versandfenster). */
export const WIEDERVORLAGE_STUNDE = 10;

type Ymd = { y: number; m: number; d: number };
const ymdBerlin = (d: Date): Ymd => {
  const [y, m, t] = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d).split("-").map(Number);
  return { y, m, d: t };
};
/** Kalendertag als UTC-Mitternacht (zum Rechnen mit ganzen Tagen); Monat und Tag dürfen überlaufen. */
const utcTag = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const plusTage = (t: Date, n: number) => utcTag(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate() + n);
const tageZwischen = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);
const ymdText = (t: Date) => t.toISOString().slice(0, 10);

/** Uhrzeit an einem Kalendertag „JJJJ-MM-TT“ in deutscher Zeit als Zeitpunkt (Sommer- und Winterzeit). Rein. */
export function berlinZeitpunkt(ymd: string, stunde: number): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, stunde);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(guess))
      .map((x) => [x.type, x.value]),
  );
  const alsBerlin = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
  return new Date(guess - (alsBerlin - guess));
}

/** Liegt der Tag (deutsche Zeit) mehr als 7 Tage nach heute? Rein. */
export function mehrAls7Tage(tag: Date, now = new Date()): boolean {
  const h = ymdBerlin(now);
  const z = ymdBerlin(tag);
  return tageZwischen(utcTag(h.y, h.m, h.d), utcTag(z.y, z.m, z.d)) > FERN_AB_TAGEN;
}

/** Tage ohne Wiedervorlage außer dem Wochenende (MM-TT): Heiligabend bis 2. Feiertag, Silvester, Neujahr. */
const KEINE_WIEDERVORLAGE = new Set(["12-24", "12-25", "12-26", "12-31", "01-01"]);

/** Zeitpunkt der Wiedervorlage für einen Wunschtag: 10 Uhr deutscher Zeit am nächsten Werktag (ohne Feiertage oben). Rein. */
export function wiedervorlageAm(tag: Date): Date {
  const z = ymdBerlin(tag);
  let t = utcTag(z.y, z.m, z.d);
  while (t.getUTCDay() === 0 || t.getUTCDay() === 6 || KEINE_WIEDERVORLAGE.has(ymdText(t).slice(5))) t = plusTage(t, 1);
  return berlinZeitpunkt(ymdText(t), WIEDERVORLAGE_STUNDE);
}

const MONATE: [RegExp, number][] = [
  [/^jan(uar)?$/, 1],
  [/^feb(ruar)?$/, 2],
  [/^(märz|maerz|mär)$/, 3],
  [/^apr(il)?$/, 4],
  [/^mai$/, 5],
  [/^juni?$/, 6],
  [/^juli?$/, 7],
  [/^aug(ust)?$/, 8],
  [/^sept?(ember)?$/, 9],
  [/^okt(ober)?$/, 10],
  [/^nov(ember)?$/, 11],
  [/^dez(ember)?$/, 12],
];
const MONAT_WORT = "januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember|jan|feb|mär|apr|aug|sept?|okt|nov|dez";
const monatNr = (w: string) => MONATE.find(([re]) => re.test(w.toLowerCase()))?.[1] ?? null;
const ZAHLWORT: Record<string, number> = { ein: 1, eine: 1, einer: 1, einem: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, zwölf: 12 };
const ZAHL_WORT = "\\d{1,2}|ein|eine|einer|einem|einen|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zehn|zwölf";
const zahl = (w: string) => (/^\d+$/.test(w) ? Number(w) : (ZAHLWORT[w] ?? null));

/** Gemeint ist etwas anderes als ein Termin (Vertragsende, Versicherungsbeginn, Geburt, Beitrag): keine Wiedervorlage. */
const KEIN_TERMIN = /vertrag|verträge|kündig|ausl(ä|ae)uft|l(ä|ae)uft\b.{0,30}\baus\b|geboren|geburt|police|beitrag|rechnung|\bbeginn/i;
/** Hinweis auf einen Terminwunsch („erst“, „Zeit“, „Urlaub“, „melden“, „passt“ …); kurze Antworten zählen auch so. */
const TERMIN_HINWEIS =
  /termin|\bzeit\b|gespräch|telefon|anruf|meld|urlaub|verreist|unterwegs|krank|wieder da|zurück|\berst\b|frühestens|früher nicht|vorher nicht|passt|passen|\bgeht\b|ginge|klappt|\bkann\b|könn|lieber|besser|schaff|\bab\b|\bnach\b|\bweg\b/i;

/**
 * Terminwunsch des Leads mehr als 7 Tage (höchstens 90) in der Zukunft: der Wunschtag (0 Uhr deutscher Zeit), sonst
 * null. Versteht „in drei Wochen“, „in 2 Monaten“, „in 10 Tagen“, „nächsten Monat“, „übernächste Woche“, „im
 * Dezember“, „Anfang/Mitte/Ende Januar“, „nach Weihnachten“, „im neuen Jahr“, „am 15.12.“, „15. Dezember“ sowie
 * „nach dem 15.12.“ bzw. „bis 15.12. im Urlaub“ (dann der Tag danach). Mehrere Angaben: der früheste Tag, eine
 * Angabe mit „bis“ geht vor. Rein, testbar.
 */
export function fernerTerminwunsch(text: string | null | undefined, now = new Date()): Date | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!t || t.length > 300 || KEIN_TERMIN.test(t)) return null;
  if (!TERMIN_HINWEIS.test(t) && t.length > 40) return null;
  const h = ymdBerlin(now);
  const heute = utcTag(h.y, h.m, h.d);
  const kandidaten: Date[] = [];
  let bis: Date | null = null;
  // Datum ohne Jahr, das schon vorbei ist: nächstes Jahr
  const kuenftig = (m: number, d: number, y?: number) => {
    const x = utcTag(y ? (y < 100 ? 2000 + y : y) : h.y, m, d);
    return !y && x < heute ? utcTag(h.y + 1, m, d) : x;
  };
  // 1. Datum: „15.12.“, „15.12.2026“, „15. Dezember“ (nicht „10.30 Uhr“)
  const datum = new RegExp(
    `(\\b(?:nach|bis|ab)\\s(?:zum\\s|dem\\s|den\\s)?)?\\b(\\d{1,2})\\.\\s?(?:(\\d{1,2})(?:\\.(\\d{4}|\\d{2}(?!\\d))?)?(?!\\d)(?!\\s?uhr)|(${MONAT_WORT})\\b\\.?(?:\\s(\\d{4}))?)`,
    "g",
  );
  for (const m of t.matchAll(datum)) {
    const tag = Number(m[2]);
    const monat = m[3] ? Number(m[3]) : monatNr(m[5] ?? "");
    if (!monat || monat > 12 || tag < 1 || tag > 31) continue;
    let d = kuenftig(monat, tag, m[4] ? Number(m[4]) : m[6] ? Number(m[6]) : undefined);
    const vor = (m[1] ?? "").trim();
    if (vor.startsWith("nach") || vor.startsWith("bis")) d = plusTage(d, 1);
    if (vor.startsWith("bis")) bis = d;
    kandidaten.push(d);
  }
  // 2. „in drei Wochen“, „in 2 Monaten“, „in 10 Tagen“
  for (const m of t.matchAll(new RegExp(`\\bin (${ZAHL_WORT}) (wochen?|monate?n?|tage?n?)\\b`, "g"))) {
    const n = zahl(m[1]);
    if (!n) continue;
    kandidaten.push(m[2].startsWith("woche") ? plusTage(heute, 7 * n) : m[2].startsWith("tag") ? plusTage(heute, n) : utcTag(h.y, h.m + n, h.d));
  }
  // 3. „nächsten Monat“, „übernächste Woche“ (deren Montag)
  if (/\b(nächsten|naechsten|kommenden) monat\b/.test(t)) kandidaten.push(utcTag(h.y, h.m + 1, 1));
  if (/übernächste[nr]? woche|uebernaechste[nr]? woche/.test(t)) kandidaten.push(plusTage(heute, 14 - ((heute.getUTCDay() + 6) % 7)));
  // 4. Feiertage und Jahreswechsel
  if (/nach weihnachten|zwischen den jahren/.test(t)) kandidaten.push(kuenftig(12, 27));
  if (/im neuen jahr|nächstes jahr|naechstes jahr|nach (neujahr|silvester|den feiertagen)|anfang des jahres|jahresanfang/.test(t)) kandidaten.push(utcTag(h.y + 1, 1, 4));
  // 5. Monat: „im Dezember“, „Anfang/Mitte/Ende Januar“, „nach Dezember“ (nicht „15. Dezember“, das ist oben erfasst)
  for (const m of t.matchAll(new RegExp(`(?:\\b(anfang|mitte|ende|nach)\\s)?(?<![\\d.]\\s?)\\b(${MONAT_WORT})\\b(?:\\s(\\d{4}))?`, "g"))) {
    const monat = monatNr(m[2]);
    if (!monat) continue;
    const start = (m.index ?? 0) + m[0].lastIndexOf(m[2]);
    // Kurze Wörter („Mai“, „Juni“, Abkürzungen) nur mit „im“, „ab“, „in“, „bis“ bzw. Anfang/Mitte/Ende davor
    if (!m[1] && m[2].length <= 4 && !/\b(im|ab|in|bis) $/.test(t.slice(Math.max(0, start - 4), start))) continue;
    const jahr = m[3] ? Number(m[3]) : undefined;
    // Laufender Monat ohne Anfang/Mitte/Ende („im November“ am 22.11.): kein ferner Wunsch
    if (!jahr && monat === h.m && !m[1]) continue;
    let d = kuenftig(monat, m[1] === "mitte" ? 15 : m[1] === "ende" ? 22 : 1, jahr);
    if (m[1] === "nach") d = utcTag(d.getUTCFullYear(), d.getUTCMonth() + 2, 1);
    kandidaten.push(d);
  }
  if (!kandidaten.length) return null;
  const wahl = bis ?? kandidaten.reduce((a, b) => (b < a ? b : a));
  const abstand = tageZwischen(heute, wahl);
  if (abstand <= FERN_AB_TAGEN || abstand > FERN_MAX_TAGE) return null;
  return berlinZeitpunkt(ymdText(wahl), 0);
}
