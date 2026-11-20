// Später-Interesse in Cold-Mail-Antworten erkennen („gerne später nochmal“,
// „aktuell nicht, aber ab März“, „melden Sie sich nächstes Jahr“, „in 3 Monaten“)
// und daraus den Zeitpunkt für das Follow-up ableiten (Werktag vormittags,
// deutsche Zeit). Bewusst ohne Laufzeit-Imports (Tests, Skripte).
import { dayKey, fromDayKey } from "@/lib/vertrieb/dates";

// Klare Absagen: nie als Später-Interesse werten, auch wenn ein Zeitpunkt vorkommt.
const HARD_NO = [
  /abmelden/, /unsubscribe/, /remove me/, /\bspam\b/,
  /bitte (entfernen|austragen|löschen|streichen)/, /aus (dem|ihrem) verteiler/,
  /nicht mehr (kontaktieren|anschreiben|schreiben|melden|anrufen)/, /bitte nicht mehr/,
  /(melden|kontaktieren|schreiben|rufen) sie (sich |mich |uns )?(bitte )?(nicht|nie)\b/, /keine (weiteren )?(e-?mails|nachrichten|anfragen|werbung)/,
  /sehen sie (bitte )?(davon )?ab/, /\b(nie|niemals|grundsätzlich nicht|generell nicht|auf keinen fall)\b/,
  /auch (in zukunft|später|künftig|zukünftig|dann) (nicht|kein)/, /(haben|habe) (uns|mich) (dagegen|anders) entschieden/,
  /\b(ruhestand|rente gehe|in rente|geschäftsaufgabe|agentur (wird )?(aufgegeben|geschlossen))\b/,
  // Ole, 18.11.2026 (Timo Janiel: „lösch mich bitte aus deinem Verteiler“)
  /\blösch\w*/, /\bverteiler\b/, /austragen/, /\bentfernen sie\b/, /(e-?mail|adresse|daten) (bitte )?(entfernen|löschen)/,
];

// Ausdrücklich „später“ ohne konkreten Zeitpunkt
const LATER_PHRASE = [
  /(zu einem )?späteren zeitpunkt/, /\bspäter (gerne |gern )?(noch ?mal|nochmals|wieder|erneut|melden|kontaktieren|darauf zurück)/,
  /gerne? (auch )?später/, /\bin zukunft (gerne|gern|vielleicht|eventuell|nochmal|wieder)/, /vielleicht später/,
  /(kommen|melden) sie (gerne |gern )?(später|zu einem späteren)/, /im moment (noch )?zu früh/, /\bnoch zu früh\b/,
];

// „Nicht jetzt“: aktuell/derzeit … nicht/kein, keine Zeit, ausgelastet, noch nicht, erst ab …
const NOT_NOW = [
  /(aktuell|derzeit|momentan|zurzeit|zur zeit|im moment|gerade|jetzt|vorerst|dieses jahr|in diesem jahr)(\s+\S+){0,3}?\s+(nicht|kein\w*|wenig|voll|ausgelastet|eingespannt|beschäftigt)/,
  /noch nicht/, /\berst\b/, /keine (zeit|kapazität\w*)/, /ausgelastet/, /(passt|geht)(\s+\S+){0,2}?\s+(nicht|schlecht)/,
  /(stellen|stelle|bauen|baue|ziehen|ziehe) (uns|mich|gerade)/, /\bumzug\b|umstrukturier|jahresabschluss|jahresendgeschäft|jahresend/,
  /\bbis\b(\s+\S+){0,3}?\s+(voll|ausgelastet|nicht)/,
];

// „Melden Sie sich wieder“
const RECONTACT = [
  /melden sie sich/, /meld(en)? (dich|euch|sie) (gerne |gern )?(nochmal|wieder|erneut)/,
  /(kommen|treten) sie (gerne |gern )?(\S+ ){0,3}?(auf (mich|uns) zu|zurück|in kontakt)/,
  /(noch ?mal|nochmals|wieder|erneut) (melden|kontaktieren|anschreiben|ansprechen|anrufen|sprechen|schreiben|zukommen|in kontakt)/,
  /(kontaktieren|schreiben|rufen) sie (mich|uns)/, /versuchen sie es/, /gerne (wieder|nochmal|noch einmal|erneut)/,
  /darauf zurück(kommen)?/, /dann (gerne|gern|sehr gerne)/, /(ab|im|nach) \S+ (gerne|gern)/, /dann (wieder|nochmal|mehr)/,
];

// Ole, 18.11.2026 (Norbert Tetenborg fehlte im Später-Follow-up): breitere Regeln als Absicherung, auch ohne KI.
// „später“ ohne Datum zählt mit „nicht jetzt“, „melden Sie sich wieder“ oder Interesse, aber nicht kurzfristig.
const LATER_WORD = /\bspäter\b/;
const SHORT_TERM =
  /übermorgen|\b(heute|morgen|gleich|nachher|diese woche|nächste woche|kommende woche|später am (tag|vormittag|nachmittag|abend)|im laufe des tages)\b|später (zurück|an)?rufen|später (noch ?mal |noch einmal )?an\b/;
const WANT = /\b(interesse|interessant|gerne?|vielleicht|eventuell|evtl|bedarf|leads)\b/;
// Konkreter Termin- oder Rückrufwunsch: positive Antwort, kein Später
const IMMEDIATE = /\b(termin\w*|anruf\w*|telefon\w*|rückruf\w*|zurückrufen|gespräch\w*|call)\b/;
// „Aktuell nicht, aber …“: der Teil nach „aber“ muss nach später oder Interesse klingen („aber danke“ ist eine Absage)
const NOT_NOW_BUT = /\b(aktuell|derzeit|momentan|zurzeit|zur zeit|im moment|gerade|jetzt|vorerst|noch)\b(\s+\S+){0,4}?\s+(nicht|kein\w*)\b[^.!?]{0,80}?\b(aber|jedoch|doch)\b([^.!?]{0,100})/;
/** Hinweis auf einen späteren Zeitpunkt (für klare Absagen und als Vorfilter der KI) */
const LATER_HINT =
  /später|zukunft|zukünftig|künftig|(nächste[nms]?|kommende[nms]?|neue[nms]?) (jahr|quartal|monat|saison)|jahres(anfang|beginn|ende|wechsel)|quartal|\bin \S+ (wochen|monat\w*|jahr\w*)\b|halbe[nms]? jahr|frühjahr|frühling|sommer|herbst|winter|januar|februar|märz|maerz|april|\bmai\b|juni|juli|august|september|oktober|november|dezember|\b20\d\d\b|zu früh|noch nicht|(wieder|noch ?mal|noch einmal|erneut) (melden|kontaktieren|anschreiben|zukommen|in kontakt)|melden sie sich (gerne |gern |bitte )?(wieder|noch ?mal|im|in|ab|nach|anfang|mitte|ende)\b|(wir melden uns|ich melde mich)\b|(kommen|komme) (\S+ ){0,3}?auf sie zu|wenn es (wieder |besser |dann )?passt|zu viel los/;
// Klare Absagen ohne Hinweis auf später
const DECLINE = [
  /kein(en)? interesse/, /nicht interessiert/, /kein(en)? bedarf/, /nein,? danke/, /brauchen? (keine|nichts)/, /sind (bereits|schon) (gut )?versorgt/,
  /not interested/, /lieber nicht/, /verzichte/, /kein(en)? mehrwert/, /nicht relevant/,
  /nicht (be)?nötig/, /(benötige|brauche)n? (\S+ ){0,3}?nicht\b/, /kein(en)? (bedarf|interesse|nutzen|use)\b/,
];
// Hebt eine Absage nur auf, wenn ausdrücklich von später die Rede ist (eine Jahreszahl allein reicht nicht:
// „kein Interesse, 2027/2028 höre ich auf“)
const LATER_WORDS =
  /später|zukunft|zukünftig|künftig|noch nicht|zu früh|\berst\b|vielleicht|eventuell|\bevtl\b|gerne?\b|(wieder|noch ?mal|nochmals|noch einmal|erneut) (melden|kontaktieren|anschreiben|zukommen|in kontakt|ansprechen|anrufen|schreiben)|melden sie sich/;

const MONTHS: [RegExp, number, string][] = [
  [/januar/, 1, "Januar"], [/februar/, 2, "Februar"], [/m(ä|ae)rz/, 3, "März"], [/april/, 4, "April"], [/\bmai\b/, 5, "Mai"],
  [/juni/, 6, "Juni"], [/juli/, 7, "Juli"], [/august/, 8, "August"], [/september/, 9, "September"], [/oktober/, 10, "Oktober"],
  [/november/, 11, "November"], [/dezember/, 12, "Dezember"],
];
export const MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MONTH_RE = /(?:(seit|bis|ab|im|in|nach|zum|vor)\s+)?(?:(?:dem|den|des)\s+)?(?:(anfang|mitte|ende)\s+)?(januar|februar|m(?:ä|ae)rz|april|mai|juni|juli|august|september|oktober|november|dezember)\b(?:\s+(20\d\d))?/g;

const NUM: Record<string, number> = {
  ein: 1, eine: 1, einem: 1, einer: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12,
  "ein paar": 3, paar: 3, einigen: 3, einige: 3, wenigen: 2, "ca.": 0,
};

type Ymd = { y: number; m: number; d: number };
type Cand = { at: Ymd; label: string };

const key = (x: Ymd) => `${x.y}-${String(x.m).padStart(2, "0")}-${String(x.d).padStart(2, "0")}`;
const parseKey = (k: string): Ymd => ({ y: +k.slice(0, 4), m: +k.slice(5, 7), d: +k.slice(8, 10) });
const cmp = (a: Ymd, b: Ymd) => key(a).localeCompare(key(b));

function addMonths(x: Ymd, n: number): Ymd {
  const t = x.y * 12 + (x.m - 1) + n;
  const y = Math.floor(t / 12);
  const m = (t % 12) + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { y, m, d: Math.min(x.d, last) };
}
function addDaysYmd(x: Ymd, n: number): Ymd {
  const d = new Date(Date.UTC(x.y, x.m - 1, x.d + n));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

/** Mindestens zwei Wochen nach der Antwort, sonst ins nächste Jahr (z. B. „ab März“ im März). */
function future(at: Ymd, ref: Ymd): Ymd {
  return cmp(at, addDaysYmd(ref, 14)) < 0 ? { ...at, y: at.y + 1 } : at;
}

/** Alle erkannten Zeitpunkte im Text (Monat, Quartal, Jahreszeit, nächstes Jahr, in N Monaten …). */
function candidates(t: string, ref: Ymd): Cand[] {
  const out: Cand[] = [];
  for (const m of t.matchAll(MONTH_RE)) {
    const [, pre, part, name, yearRaw] = m;
    if (pre === "seit" || pre === "vor") continue;
    const mo = MONTHS.find(([re]) => re.test(name))![1];
    let at: Ymd = { y: yearRaw ? +yearRaw : ref.y, m: mo, d: part === "mitte" ? 15 : part === "ende" ? 22 : 1 };
    let label = part === "mitte" ? `Mitte ${MONTH_NAMES[mo - 1]}` : part === "ende" ? `Ende ${MONTH_NAMES[mo - 1]}` : `ab ${MONTH_NAMES[mo - 1]}`;
    if (pre === "bis" || pre === "nach") {
      // „bis März ausgelastet“, „nach März“: ab dem Folgemonat
      at = part === "mitte" ? { ...at, d: 22 } : addMonths({ ...at, d: 1 }, 1);
      label = `ab ${MONTH_NAMES[at.m - 1]}`;
    }
    if (!yearRaw) at = future(at, ref);
    else if (cmp(at, ref) <= 0) continue;
    out.push({ at, label });
  }
  const rules: [RegExp, (m: RegExpMatchArray) => Cand | null][] = [
    [/mitte (des )?(nächsten|kommenden) jahres/g, () => ({ at: { y: ref.y + 1, m: 6, d: 15 }, label: "Mitte nächsten Jahres" })],
    [/ende (des )?(nächsten|kommenden) jahres/g, () => ({ at: { y: ref.y + 1, m: 11, d: 15 }, label: "Ende nächsten Jahres" })],
    [/(nächste[sn]?|kommende[sn]?|neue[sn]?) jahr|jahresanfang|jahresbeginn|jahreswechsel|anfang (des |nächsten |kommenden )?jahres|nach (den )?(feiertagen|weihnachten|silvester)|\b(im|ab) januar\b/g,
      () => ({ at: future({ y: ref.y, m: 1, d: 8 }, ref), label: "im neuen Jahr" })],
    [/(ende des|zum) jahres(ende)?|jahresende|ende (dieses|des) jahres/g, () => ({ at: future({ y: ref.y, m: 12, d: 1 }, ref), label: "zum Jahresende" })],
    [/(?:\b(?:anfang|ab|im|in|bis)\s+)?\b(20\d\d)\b/g, (m) => {
      const y = +m[1];
      if (y <= ref.y || y > ref.y + 3) return null;
      return { at: { y, m: 1, d: 8 }, label: y === ref.y + 1 ? "im neuen Jahr" : `${y}` };
    }],
    [/(nächste[sn]?|kommende[sn]?) quartal|ende (des|dieses) quartals/g, () => {
      const q = Math.floor((ref.m - 1) / 3) + 1;
      const at = addMonths({ y: ref.y, m: (q - 1) * 3 + 1, d: 1 }, 3);
      return { at, label: "im nächsten Quartal" };
    }],
    [/\bq\s?([1-4])\b|([1-4])\.\s?quartal|(erste[sn]?|zweite[sn]?|dritte[sn]?|vierte[sn]?) quartal/g, (m) => {
      const word = m[3]?.slice(0, 4);
      const q = m[1] ? +m[1] : m[2] ? +m[2] : ({ erst: 1, zwei: 2, drit: 3, vier: 4 } as Record<string, number>)[word ?? ""] ?? 1;
      return { at: future({ y: ref.y, m: (q - 1) * 3 + 1, d: 1 }, ref), label: `im ${q}. Quartal` };
    }],
    [/nach dem winter|frühjahr|frühling/g, () => ({ at: future({ y: ref.y, m: 3, d: 2 }, ref), label: "im Frühjahr" })],
    [/nach (dem sommer|den sommerferien|der sommerpause|den ferien|dem urlaub im sommer)|\bherbst\b/g, (m) => ({ at: future({ y: ref.y, m: 9, d: 1 }, ref), label: m[0].startsWith("nach") ? "nach dem Sommer" : "im Herbst" })],
    [/(?<!nach dem )\bsommer\b/g, () => ({ at: future({ y: ref.y, m: 6, d: 15 }, ref), label: "im Sommer" })],
    [/(?<!nach dem )\bwinter\b/g, () => ({ at: future({ y: ref.y, m: 12, d: 1 }, ref), label: "im Winter" })],
    [/(halbe[mns]? jahr|sechs monat)/g, () => ({ at: addMonths(ref, 6), label: "in einem halben Jahr" })],
    [/\bin\s+(?:ca\.?\s+|etwa\s+|rund\s+)?(\d{1,2}|ein paar|paar|einigen|einem|einer|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|wenigen)\s+(wochen|woche|monaten|monat|jahren|jahr)\b/g, (m) => {
      const n = /^\d+$/.test(m[1]) ? +m[1] : NUM[m[1]] ?? 3;
      if (!n) return null;
      if (m[2].startsWith("woche")) return { at: addDaysYmd(ref, n * 7), label: n >= 6 ? "in einigen Wochen" : "in ein paar Wochen" };
      if (m[2].startsWith("jahr")) return { at: { y: ref.y + n, m: ref.m, d: Math.min(ref.d, 28) }, label: n === 1 ? "in einem Jahr" : `in ${n} Jahren` };
      return { at: addMonths(ref, n), label: n === 1 ? "in einem Monat" : "in einigen Monaten" };
    }],
  ];
  for (const [re, fn] of rules) for (const m of t.matchAll(re)) {
    const c = fn(m);
    if (c) out.push(c);
  }
  return out;
}

/** Text normalisieren (klein, Umlaute vereinheitlicht, Leerraum). */
// Zitierter Verlauf, auch ohne Zeilenumbruch (Mails kommen oft als eine Zeile an)
const ZITAT =
  /(^|\s)(am\s.{3,120}?\sschrieb\b|on\s.{3,120}?\swrote\b|-{3,}\s*(original|ursprüngliche)|von:\s.{0,200}?\b(gesendet|datum|sent|an):|from:\s.{0,200}?\bsent:|gesendet von meinem|>\s)/i;
// Grußformel bzw. Signatur: danach folgen Name, Adresse, Bilder, Rechtstexte
const GRUSS =
  /(^|\s)(mfg\b|vg\b|lg\b|(mit )?((freundlich|herzlich|best|lieb|viel|sonnig|schön)\w* )?(grüß|grüss)e?n?\b|gruß\b|gruss\b|\[cid:)/i;
// Signatur ohne Grußformel („nein Danke Max Muster Bezirksdirektion … Telefon: …“): ab Funktion oder Kontaktzeile
const SIGNATUR =
  /(^|\s)(bezirksdirektion|generalvertretung|hauptvertretung|generalagentur|agentur der|vertretung der|geschäftsstelle|tel\.|telefon:?|mobil:?|fax:?|e-?mail:|www\.|sitz der|registergericht|handelsregister|amtsgericht|geschäftsführer|ust-?id)/i;

/**
 * Nur die eigenen Zeilen der Antwort (Ole, 18.11.2026): ohne zitierte Cold-Mail und ohne Signatur. Sonst machen
 * „melden Sie sich gerne“ aus unserer Mail oder Monatsnamen aus der Signatur eine Absage zum Später-Interesse.
 */
export function eigenerText(text: string | null | undefined): string {
  let t = (text ?? "").trim();
  const z = t.search(ZITAT);
  if (z > 0) t = t.slice(0, z);
  const g = t.search(GRUSS);
  // Grußformel ganz vorne („Liebe Grüße zurück, …“) nicht abschneiden
  if (g > 8) t = t.slice(0, g);
  const sig = t.search(SIGNATUR);
  if (sig > 8) t = t.slice(0, sig);
  return t.trim();
}

function norm(text: string | null | undefined): string {
  return eigenerText(text).toLowerCase().replace(/ae(?=r?z)/g, "ä").replace(/\s+/g, " ").trim();
}

/** Antwort mit Später-Interesse (statt Absage)? */
export function isLaterInterest(text: string | null | undefined, at: Date = new Date()): boolean {
  const t = norm(text);
  if (!t || HARD_NO.some((r) => r.test(t))) return false;
  if (isClearDecline(text)) return false;
  if (LATER_PHRASE.some((r) => r.test(t))) return true;
  const ref = parseKey(dayKey(at));
  // Kurzfristiges („nächste Woche“, „morgen“) ist kein Später-Interesse, sondern eine normale Antwort.
  const dated = candidates(t, ref).filter((c) => cmp(c.at, addDaysYmd(ref, 20)) >= 0);
  const notNow = NOT_NOW.some((r) => r.test(t));
  const recontact = RECONTACT.some((r) => r.test(t));
  if (dated.length) {
    if (notNow || recontact) return true;
    // „Nächstes Jahr gerne.“, „Im Frühjahr vielleicht.“ (aber nicht „Termin am 15. Januar?“)
    if (WANT.test(t) && !IMMEDIATE.test(t)) return true;
  }
  // „Momentan nicht, später vielleicht.“, „Ich hätte später Interesse an Leads.“
  if (LATER_WORD.test(t) && !SHORT_TERM.test(t) && (notNow || recontact || WANT.test(t))) return true;
  // „Aktuell nicht, aber gerne wieder melden.“
  const but = t.match(NOT_NOW_BUT);
  if (but && (LATER_HINT.test(but[5]) || (WANT.test(but[5]) && !IMMEDIATE.test(but[5])))) return true;
  return false;
}

/**
 * Klare Absage („kein Interesse“, „bitte nicht mehr schreiben“, Ruhestand …) ohne Hinweis auf später:
 * nie ins Später-Follow-up, auch wenn die KI es anders sieht.
 */
export function isClearDecline(text: string | null | undefined): boolean {
  const t = norm(text);
  if (!t) return false;
  if (HARD_NO.some((r) => r.test(t))) return true;
  return DECLINE.some((r) => r.test(t)) && !(LATER_HINT.test(t) && LATER_WORDS.test(t.replace(/kein\w* (interesse|bedarf)/g, "")));
}

/** Text mit möglichem Später-Bezug (Zeitangabe, „aktuell nicht“, „melden Sie sich“): nur dann lohnt die KI-Prüfung. */
export function hasLaterHint(text: string | null | undefined): boolean {
  const t = norm(text);
  return !!t && (LATER_HINT.test(t) || NOT_NOW.some((r) => r.test(t)) || RECONTACT.some((r) => r.test(t)));
}

export type LaterTiming = {
  /** Mail 1: Werktag vormittags (deutsche Zeit) */
  date: Date;
  /** Für Text und Anzeige, z. B. „ab März“; null = kein Zeitpunkt genannt (Standard 3 Monate) */
  label: string | null;
};

/** Zeitpunkt aus dem Text (spätester genannter), ohne Angabe 3 Monate nach `ref`. */
export function laterTiming(text: string | null | undefined, ref: Date, seed = ""): LaterTiming {
  const r = parseKey(dayKey(ref));
  const cands = candidates(norm(text), r).filter((c) => cmp(c.at, addDaysYmd(r, 7)) >= 0);
  cands.sort((a, b) => cmp(a.at, b.at));
  const best = cands[cands.length - 1];
  const at = best?.at ?? addMonths(r, 3);
  return { date: workdayMorning(key(at), seed), label: best?.label ?? null };
}

// ─── Werktage (Mo–Fr ohne bundesweite Feiertage) ────────────────────────
function easter(y: number): Ymd {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return { y, m: month, d: day };
}

const holidayCache = new Map<number, Set<string>>();
function holidays(y: number): Set<string> {
  let s = holidayCache.get(y);
  if (!s) {
    const e = easter(y);
    s = new Set([
      ...["01-01", "05-01", "10-03", "12-24", "12-25", "12-26", "12-31"].map((x) => `${y}-${x}`),
      ...[-2, 1, 39, 50].map((n) => key(addDaysYmd(e, n))),
    ]);
    holidayCache.set(y, s);
  }
  return s;
}

/** Werktag (Mo–Fr, kein bundesweiter Feiertag, nicht 24./31.12.) für YYYY-MM-DD */
export function isWorkdayKey(k: string): boolean {
  const x = parseKey(k);
  const wd = new Date(Date.UTC(x.y, x.m - 1, x.d)).getUTCDay();
  return wd !== 0 && wd !== 6 && !holidays(x.y).has(k);
}

/** Nächster Werktag ab `k` (einschließlich). */
export function nextWorkdayKey(k: string): string {
  let x = parseKey(k);
  while (!isWorkdayKey(key(x))) x = addDaysYmd(x, 1);
  return key(x);
}

/** Werktag ab YYYY-MM-DD, vormittags zwischen 9:00 und 11:29 Uhr (je Kontakt fest gestreut). */
export function workdayMorning(k: string, seed = ""): Date {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const min = h % 150;
  return fromDayKey(nextWorkdayKey(k), `${String(9 + Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);
}

/** n Werktage nach `d`, vormittags. */
export function workdaysLater(d: Date, n: number, seed = ""): Date {
  let x = parseKey(dayKey(d));
  let left = n;
  while (left > 0) {
    x = addDaysYmd(x, 1);
    if (isWorkdayKey(key(x))) left--;
  }
  return workdayMorning(key(x), seed);
}

/** Versandfenster der Später-Follow-ups: Werktag 8–17 Uhr deutsche Zeit (auch für „Geplante Nachrichten“). */
export const SENDEFENSTER = { von: 8, bis: 17 } as const;

/** Versandfenster: Werktag 8–17 Uhr deutsche Zeit. */
export function inSendWindow(now: Date): boolean {
  if (!isWorkdayKey(dayKey(now))) return false;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "numeric", hourCycle: "h23" }).format(now));
  return hour >= SENDEFENSTER.von && hour < SENDEFENSTER.bis;
}

/** „im August 2026“ für den Bezug auf die damalige Antwort */
export function monthPhrase(d: Date, now = new Date()): string {
  const k = parseKey(dayKey(d));
  const n = parseKey(dayKey(now));
  return `im ${MONTH_NAMES[k.m - 1]}${k.y !== n.y ? ` ${k.y}` : ""}`;
}
