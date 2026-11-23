// Bedenkzeit zum Angebot (Paket P5, Ole 17.11.2026; docs/plan-lead-verlauf.md Punkt 11, Risiko 10). Rein, ohne Datenbank,
// getestet (tests/unit/bedenkzeit.test.ts). Datenbank: lib/lead-sequences.ts (startBedenkzeit), Chat: lib/bedenkzeit-server.ts.
//
// „Ich überlege noch“ bzw. „ich melde mich“: Der Lead (im Chat) oder der Vermittler (am Kontakt, Blatt „Nachfassen
// pausieren“) setzt „meldet sich am …“, Standard 14 Tage. Das Nachfassen zum Angebot pausiert und startet an dem Tag neu
// (Abfolge „offer_bedenkzeit“ bzw. „offer_selbst_bedenkzeit“), zuerst mit einer passenden WhatsApp zum Angebot. KEINE
// Terminvorschlags-Vorlage `followup` (die passt nicht zum Angebotsstand). Antwortet der Lead vorher, endet die Abfolge wie
// jede andere, der Tag bleibt aber als Aufgabe „Bedenkzeit vorbei: Angebot nachfassen“ auf „Heute“.
// Im Chat erkennt die App die Bitte und fragt nach dem Datum mit drei Knöpfen (1 Woche, 2 Wochen, Ende des Monats);
// nennt der Lead selbst eine Zeit, legt der Assistent sie mit schedule_followup an (lib/lead-sequences.ts scheduleBotRecall
// leitet im Angebotsstand auf die Bedenkzeit um).

import { mitThema } from "@/lib/thema-artikel";
import { a, type Ansprache } from "@/lib/ansprache";
import { addDaysYmd, berlinYmd, weekdayOfYmd } from "@/lib/absence";
import { berlinAt } from "@/lib/calendar/lead-times";
import type { VermittlerName } from "@/lib/whatsapp/gespraech";

/** Standard, wenn nichts gewählt ist (Ole: 14 Tage). */
export const BEDENKZEIT_STANDARD_TAGE = 14;
/** Uhrzeit, zu der das Nachfassen am Tag wieder startet (im Versandfenster 9 bis 19 Uhr). */
export const BEDENKZEIT_UHRZEIT = "10:00";
/** Spätester Tag für ein frei gewähltes Datum. */
export const BEDENKZEIT_MAX_TAGE = 90;
/** Aufgabe am Tag, wenn die Abfolge vorher geendet hat (Antwort des Leads, Nachfassen ausgeschaltet). */
export const BEDENKZEIT_AUFGABE = "Bedenkzeit vorbei: Angebot nachfassen";

export type BedenkzeitWahl = "1w" | "2w" | "monatsende";

/** Knöpfe im Chat (Payload bedenkzeit:<wahl>, lib/whatsapp/knopf.ts), je höchstens 20 Zeichen. */
export const BEDENKZEIT_KNOEPFE: { id: string; title: string }[] = [
  { id: "bedenkzeit:1w", title: "1 Woche" },
  { id: "bedenkzeit:2w", title: "2 Wochen" },
  { id: "bedenkzeit:monatsende", title: "Ende des Monats" },
];

export const BEDENKZEIT_OPTIONEN: { wahl: BedenkzeitWahl; label: string }[] = [
  { wahl: "1w", label: "1 Woche" },
  { wahl: "2w", label: "2 Wochen" },
  { wahl: "monatsende", label: "Ende des Monats" },
];

export function istBedenkzeitWahl(x: unknown): x is BedenkzeitWahl {
  return x === "1w" || x === "2w" || x === "monatsende";
}

/** Samstag/Sonntag auf den Montag schieben. */
function werktag(ymd: string): string {
  const wd = weekdayOfYmd(ymd);
  return wd === 6 ? addDaysYmd(ymd, 2) : wd === 0 ? addDaysYmd(ymd, 1) : ymd;
}

/** Letzter Werktag (Mo bis Fr) eines Monats. */
function letzterWerktag(jahr: number, monat: number): string {
  let ymd = new Date(Date.UTC(jahr, monat, 0)).toISOString().slice(0, 10);
  while ([0, 6].includes(weekdayOfYmd(ymd))) ymd = addDaysYmd(ymd, -1);
  return ymd;
}

/**
 * Tag der Bedenkzeit (10 Uhr Berlin): 1 bzw. 2 Wochen (am Wochenende der Montag danach), „Ende des Monats“ = letzter
 * Werktag des Monats; liegt der weniger als 7 Tage entfernt, der des nächsten Monats.
 */
export function bedenkzeitTag(wahl: BedenkzeitWahl, now: Date): string {
  const heute = berlinYmd(now);
  if (wahl === "1w") return werktag(addDaysYmd(heute, 7));
  if (wahl === "2w") return werktag(addDaysYmd(heute, BEDENKZEIT_STANDARD_TAGE));
  const [y, m] = heute.split("-").map(Number);
  const ende = letzterWerktag(y, m);
  return ende >= addDaysYmd(heute, 7) ? ende : letzterWerktag(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1);
}

export const bedenkzeitDatum = (wahl: BedenkzeitWahl, now: Date): Date => berlinAt(bedenkzeitTag(wahl, now), BEDENKZEIT_UHRZEIT);

/** Frei gewähltes Datum (Vermittler, YYYY-MM-DD): frühestens morgen, höchstens 90 Tage, sonst null. */
export function bedenkzeitAusDatum(ymd: string | null | undefined, now: Date): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const heute = berlinYmd(now);
  if (ymd <= heute || ymd > addDaysYmd(heute, BEDENKZEIT_MAX_TAGE)) return null;
  return berlinAt(ymd, BEDENKZEIT_UHRZEIT);
}

/** „Montag, 1. Dezember“ (an den Lead) */
export function tagLang(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long" }).format(d);
}
/** „Di, 1.12.“ (Vermittler-Oberfläche) */
export function tagKurz(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "numeric" }).format(d);
}

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();

const BITTE = [
  /\bueberleg/, // „ich überlege noch“, „muss ich mir überlegen“
  /\bueberdenk/,
  /\bnachdenken\b|\bdenke? (noch |mal |nochmal |es |das )*(drueber|darueber) nach\b/,
  /\b(drueber|darueber|eine nacht) schlafen\b/,
  /\bbedenkzeit\b/,
  /\bmelde mich\b(?! ab\b)/, // nicht „ich melde mich ab“
  /\bmelden uns\b/,
  /\b(brauche|braeuchte|benoetige|brauchen) (noch )?(etwas |ein bisschen |ein wenig |ein paar tage |mehr )?zeit\b/,
  /\b(mit|mich mit) (meine[mrn]?|unsere[mrn]?|der|dem) (frau|mann|partner(in)?|familie|freundin|freund|eltern)\b.*\b(sprechen|besprechen|reden|absprechen|abstimmen)\b/,
  /\b(besprechen|absprechen|abstimmen) (das |es )?(noch )?(mit|zu hause|daheim)\b/,
];
const KEIN_INTERESSE = /\bkein (interesse|bedarf)\b|\bnicht (mehr )?interessiert\b|\babmelden\b|\bstopp?\b/;

const ZEIT: { re: RegExp; wahl: BedenkzeitWahl }[] = [
  { re: /\b(eine|1|einer) woche\b|\b(naechste|kommende|naechster|kommender) woche\b/, wahl: "1w" },
  { re: /\b(zwei|2) wochen\b|\b(14|vierzehn) tage(n)?\b/, wahl: "2w" },
  { re: /\bende (des|diese[sn]) monats\b|\bmonatsende\b/, wahl: "monatsende" },
];
const ANDERE_ZEIT =
  /\bmorgen\b|\buebermorgen\b|\bheute\b|\bmontag|\bdienstag|\bmittwoch|\bdonnerstag|\bfreitag|\bsamstag|\bsonntag|\bwochenende\b|\b\d{1,2}\.\s?\d{1,2}\.?|\b\d+ (tage|tagen|wochen|monat|monaten)\b|\b(drei|vier|fuenf|sechs) wochen\b|\b(anfang|mitte|ende) (januar|februar|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\b|\b(januar|februar|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\b|\bnaechsten monat\b|\bspaeter im (jahr|monat)\b/;

export type BedenkzeitErkannt = { bedenkzeit: false } | { bedenkzeit: true; wahl: BedenkzeitWahl | null; andereZeit: boolean };

/**
 * Bittet der Lead um Bedenkzeit („ich überlege noch“, „ich melde mich“, „muss das mit meiner Frau besprechen“)? Nur kurze
 * Nachrichten ohne Frage (sonst beantwortet der Assistent die Frage). wahl: eine der Knopf-Zeiten, falls genannt;
 * andereZeit: eine andere Zeitangabe (die legt der Assistent selbst an).
 */
export function erkenneBedenkzeit(text: string | null | undefined): BedenkzeitErkannt {
  const raw = (text ?? "").trim();
  if (!raw || raw.length > 220 || raw.includes("?")) return { bedenkzeit: false };
  const t = norm(raw);
  if (KEIN_INTERESSE.test(t) || !BITTE.some((re) => re.test(t))) return { bedenkzeit: false };
  const z = ZEIT.find((x) => x.re.test(t));
  if (z) return { bedenkzeit: true, wahl: z.wahl, andereZeit: false };
  return { bedenkzeit: true, wahl: null, andereZeit: ANDERE_ZEIT.test(t) };
}

/** Frage nach dem Datum (Freitext mit BEDENKZEIT_KNOEPFE, im offenen Fenster). */
export function bedenkzeitFrage(an: Ansprache): string {
  return a(an, "Klar, lass dir ruhig Zeit. Wann darf ich mich wieder bei dir melden?", "Gern, nehmen Sie sich ruhig Zeit. Wann darf ich mich wieder bei Ihnen melden?");
}

/** Bestätigung nach der Wahl. */
export function bedenkzeitBestaetigung(an: Ansprache, bis: Date): string {
  const tag = tagLang(bis);
  return a(
    an,
    `Alles klar, dann melde ich mich am ${tag} wieder. Wenn vorher Fragen aufkommen, schreib einfach hier.`,
    `Alles klar, dann melde ich mich am ${tag} wieder. Wenn vorher Fragen aufkommen, schreiben Sie einfach hier.`,
  );
}

/**
 * Erste WhatsApp nach der Bedenkzeit (Freitext im offenen Fenster; als Vorlage offer_bedenkzeit, bis zur Freigabe
 * followup_offer). Gleiche Frage wie die Knöpfe „Eher der Beitrag“ / „Eher die Leistung“ / „Kein Bedarf mehr“.
 */
export function bedenkzeitNeustartText(c: { an: Ansprache; hi: string; topic: string; person?: VermittlerName | null; selbst?: boolean }): string {
  const vom = c.person?.nom ?? a(c.an, "dein Berater", "Ihr Berater");
  const wozu = c.selbst
    ? a(c.an, `zum Angebot, das ${vom} dir geschickt hat`, `zum Angebot, das ${vom} Ihnen geschickt hat`)
    : a(c.an, `zu deinem Angebot ${mitThema("für", c.topic)}`, `zu Ihrem Angebot ${mitThema("für", c.topic)}`);
  return a(
    c.an,
    `${c.hi} wie besprochen melde ich mich wieder ${wozu}. Hast du noch Fragen? Ist für dich eher der Beitrag oder die Leistung entscheidend?`,
    `${c.hi} wie besprochen melde ich mich wieder ${wozu}. Haben Sie noch Fragen? Ist für Sie eher der Beitrag oder die Leistung entscheidend?`,
  );
}

/** Untertitel der Karte am Kontakt (Sie-Form, ein Satz). */
export const BEDENKZEIT_KARTE_HINWEIS = "Danach fasst die App wieder nach, bei einer Antwort vorher steht der Tag auf Heute.";
