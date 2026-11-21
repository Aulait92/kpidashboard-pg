// Bitte um Policen direkt im WhatsApp-Chat (Ole, 18.11.2026), kein Upload-Link. Reine Texte, ohne Datenbank.
// Nach der Rechtsprüfung (docs/recht/policen-whatsapp-gesundheitsdaten.md, Auflage A1) und Oles Freigabe (18.11.2026)
// zwei Nachrichten:
//   1. die Bitte (Text von Ole, ohne Fußzeile, ohne Knöpfe),
//   2. die Einwilligung als eigene interaktive Nachricht („Kurz zum Datenschutz: Ich bin einverstanden, dass …“) mit
//      Vermittler (Vor- und Nachname), Firma und Link zu den Datenschutzhinweisen, Fußzeile „Ihr Termin findet auch
//      ohne Unterlagen statt.“, Knöpfe „Einverstanden“ / „Lieber nicht“.
// Kommt eine Datei vor der Einwilligung, fragt server.ts einmal mit demselben Text nach (policenNachfrage).
//
// WhatsApp-Grenzen (Meta, interaktive Antwort-Knöpfe): Text höchstens 1.024 Zeichen, Fußzeile höchstens 60, höchstens
// 3 Knöpfe mit je höchstens 20 Zeichen (Test in tests/unit/policen.test.ts).
//
// Kranken/BU/Leben je Vermittler (regeln.ts gesundheitFreigegeben, Standard aus): aus = die Bitte nennt nur
// Haftpflicht, Hausrat und Kfz, die Einwilligung ohne den Satzteil zu Gesundheitsangaben (eigene Textversion).
// Einwilligung, Tor, keine KI in diesem Paket, Ablage und Löschung gelten immer.
//
// Auflage A9 (Rechtsprüfung, Stand 18.11.2026; Ole will keinen dritten Knopf): Der Einwilligungstext endet (vor dem
// Link) mit „Ohne automatisches Auslesen? Dann antworten Sie einfach „ohne KI“.“ Das Stichwort (istOhneKi, nur Regeln)
// wird vor und nach dem Klick auf „Einverstanden“ erkannt (lib/policen/server.ts kiAbwaehlen): ki = false im Nachweis,
// feste Bestätigung (ohneKiBestaetigung), ausgelesene Werte gelöscht, künftig nichts ausgelesen.

import { a, type Ansprache, type Salutation } from "@/lib/ansprache";
import type { Person } from "@/lib/policen/regeln";
import { anderePolicenSatz } from "@/lib/policen/andere-policen";

export type Knopf = { id: string; title: string };
/** Eine WhatsApp-Nachricht: Text, Knöpfe (leer = reiner Text), Fußzeile (nur mit Knöpfen). */
export type Nachricht = { text: string; knoepfe: Knopf[]; fusszeile: string | null };
export type PolicenBitte = Nachricht & { einwilligung: Nachricht };
/** Vermittler wie in lib/whatsapp/gespraech.ts vermittlerName (nom/dat), dazu Anrede (er/sie) und voller Name. */
export type BitteVermittler = Person & { anrede?: Salutation | null; name?: string | null };

/** Versionen des Einwilligungstexts (stehen im Nachweis; bei jeder inhaltlichen Änderung hochzählen). */
// g2/s2 (A9): mit dem Satz zu „ohne KI“; g1/s1 ohne ihn (nur noch für Nachweise zu bereits gesendeten Texten).
export const EINWILLIGUNG_TEXT_VERSION = "2026-11-18.g2";
/** Fassung ohne Gesundheitsangaben (Kranken/BU/Leben für diesen Vermittler nicht freigegeben). */
export const EINWILLIGUNG_TEXT_VERSION_SACH = "2026-11-18.s2";
export const einwilligungTextVersion = (gesundheitAn: boolean) => (gesundheitAn ? EINWILLIGUNG_TEXT_VERSION : EINWILLIGUNG_TEXT_VERSION_SACH);
/** Textversion zu einem gesendeten Wortlaut: mit Gesundheitsteil (g) bzw. ohne (s), mit A9-Satz (2) bzw. ohne (1). */
export function einwilligungTextVersionAus(wortlaut: string): string {
  const g = /Gesundheitsangaben enthalten/.test(wortlaut);
  if (OHNE_KI_SATZ_RE.test(wortlaut)) return einwilligungTextVersion(g);
  return g ? "2026-11-18.g1" : "2026-11-18.s1";
}

export const PAYLOAD_JA = "policen:ja";
export const PAYLOAD_NEIN = "policen:nein";

export const KNOPF_JA = "Einverstanden";
export const KNOPF_NEIN = "Lieber nicht";

export const EINWILLIGUNG_KNOEPFE: Knopf[] = [
  { id: PAYLOAD_JA, title: KNOPF_JA },
  { id: PAYLOAD_NEIN, title: KNOPF_NEIN },
];

/** „Ihrem Berater“ (Rückfall in server.ts/bot.ts für beide Fälle) wird im Nominativ „Ihr Berater“. */
function nominativ(an: Ansprache, p: Person | null): string {
  const nom = (p?.nom ?? "").replace(/\s+/g, " ").trim();
  if (!nom || /^(ihrem|deinem|ihr|dein) berater$/i.test(nom)) return a(an, "dein Berater", "Ihr Berater");
  return nom;
}

/** er/sie für den Vermittler, null = unbekannt (dann ein Satz ohne Pronomen). */
function pronomen(v: BitteVermittler | null, nom: string): "er" | "sie" | null {
  if (v?.anrede === "Herr") return "er";
  if (v?.anrede === "Frau") return "sie";
  if (/^Herr\b/.test(nom) || /^(Ihr|dein) Berater$/.test(nom)) return "er";
  if (/^Frau\b/.test(nom)) return "sie";
  return null;
}

/** Fußzeile der Einwilligung (höchstens 60 Zeichen). */
export const einwilligungFusszeile = (an: Ansprache) => a(an, "Dein Termin findet auch ohne Unterlagen statt.", "Ihr Termin findet auch ohne Unterlagen statt.");

/**
 * Einwilligungstext (Oles Freigabe 18.11.2026, ersetzt Text (a) der Rechtsprüfung). wer = Vor- und Nachname des
 * Vermittlers (Identität des Verantwortlichen), firma nur, wenn sie etwas anderes sagt. gesundheitAn = Kranken/BU/Leben
 * für diesen Vermittler freigegeben; aus = ohne den Satzteil zu Gesundheitsangaben.
 */
export function einwilligungText(o: { an: Ansprache; wer: string; firma?: string | null; link?: string | null; gesundheitAn: boolean }): string {
  const firma = (o.firma ?? "").replace(/\s+/g, " ").trim();
  const mitFirma = firma && !o.wer.toLowerCase().includes(firma.toLowerCase()) ? `${o.wer} (${firma})` : o.wer;
  const gesundheit = o.gesundheitAn ? ", auch wenn sie Gesundheitsangaben enthalten, z. B. bei Kranken-, BU- oder Lebensversicherung" : "";
  const infos = o.link ? ` Infos: ${o.link}` : "";
  const kern = `Kurz zum Datenschutz: Ich bin einverstanden, dass ${mitFirma} meine hier gesendeten Policen zur Vorbereitung des Termins speichert und die Vertragsdaten automatisch auslesen lässt (KI-Dienst in der EU)${gesundheit}. Beteiligt sind WhatsApp (Meta, Zugriff auch aus den USA möglich) und der Dienstleister performancegrowth. Widerruf jederzeit mit „Widerruf“.`;
  return `${kern} ${ohneKiSatz(o.an)}${infos}`;
}
/** Auflage A9: Ablehnung nur des Auslesens per Stichwort, ohne dritten Knopf (letzter Satz vor dem Link). */
export const ohneKiSatz = (an: Ansprache) =>
  a(an, "Ohne automatisches Auslesen? Dann antworte einfach „ohne KI“.", "Ohne automatisches Auslesen? Dann antworten Sie einfach „ohne KI“.");
/** Erkennt den A9-Satz in einer gesendeten Einwilligung (beide Fassungen). */
export const OHNE_KI_SATZ_RE = /Ohne automatisches Auslesen\? Dann (antworte|antworten Sie) einfach/;
/** Erkennt die Einwilligungsnachricht (auch als Nachfrage). */
export const EINWILLIGUNG_RE = /Ich bin einverstanden, dass .+ meine hier gesendeten Policen/;

/** Name für den Einwilligungstext: Vor- und Nachname, sonst die Anrede-Form bzw. „Ihr Berater“. */
function vollerName(an: Ansprache, v: BitteVermittler | null): string {
  const name = (v?.name ?? "").replace(/\s+/g, " ").trim();
  return name.split(" ").length >= 2 ? name : nominativ(an, v);
}

/** Einwilligung als eigene interaktive Nachricht (Auflage A1). */
export function policenEinwilligung(o: { an: Ansprache; vermittler: BitteVermittler | null; firma?: string | null; datenschutzUrl?: string | null; gesundheitAn?: boolean }): Nachricht {
  return {
    text: einwilligungText({ an: o.an, wer: vollerName(o.an, o.vermittler), firma: o.firma, link: o.datenschutzUrl, gesundheitAn: !!o.gesundheitAn }),
    knoepfe: EINWILLIGUNG_KNOEPFE,
    fusszeile: einwilligungFusszeile(o.an),
  };
}

/**
 * Bitte um Policen (Ole, 18.11.2026) und die Einwilligung dazu. gesundheitAn = Kranken/BU/Leben freigegeben (Standard
 * aus): an = auch Kranken-, BU- und Lebensversicherung im Text. vermittler null = „Ihr Berater“.
 * Senden: erst die Bitte (text, ohne Knöpfe), dann einwilligung (interaktiv) – siehe policenNachrichten.
 */
export function policenBitte(o: {
  an: Ansprache;
  vermittler: BitteVermittler | null;
  gesundheitAn?: boolean;
  firma?: string | null;
  datenschutzUrl?: string | null;
  /** Bestehende Verträge des Leads (Vertragsfrage im Chat): stehen statt der festen Beispiele im Text (Ole, 21.11.2026) */
  vertraege?: string[] | null;
  /** Kfz-Lead (Ole, 21.11.2026): konkret Fahrzeugschein und letzte Rechnung der Kfz-Versicherung statt „Policen“ */
  kfz?: boolean;
  /** Kfz: Komplettcheck Ja (dann auch ohne genannte Verträge die Bitte um die anderen Policen, Ole 22.11.2026) */
  komplettcheck?: boolean | null;
}): PolicenBitte {
  const { an } = o;
  const wer = nominativ(an, o.vermittler);
  if (o.kfz) {
    const andere = anderePolicenSatz(an, pronomen(o.vermittler, wer) ?? wer, { vertraege: o.vertraege, komplettcheck: o.komplettcheck, verb: "schicken" });
    return { text: kfzBitteText(an, wer, andere), knoepfe: [], fusszeile: null, einwilligung: policenEinwilligung(o) };
  }
  const eigene = [...new Set((o.vertraege ?? []).map((v) => v.trim()).filter(Boolean))].slice(0, 4);
  const sparten = eigene.length
    ? eigene.length === 1
      ? a(an, `deine ${eigene[0]}`, `Ihre ${eigene[0]}`)
      : `${eigene.slice(0, -1).join(", ")} oder ${eigene.at(-1)}`
    : o.gesundheitAn
      ? "Haftpflicht, Hausrat, Kfz, Kranken-, BU- oder Lebensversicherung"
      : "Haftpflicht, Hausrat oder Kfz";
  const p = pronomen(o.vermittler, wer);
  // Wie die Flow-Nachricht (Paket 4, Ole 20.11.2026): konkreter Nutzen, nur das Bemühen ums Sparen, kein Versprechen
  const wer2 = p ?? wer;
  const dann = p
    ? a(an, `Dann sieht ${p} vorher, ob du etwas doppelt zahlst und wann du kündigen kannst, und versucht, dir Geld zu sparen.`, `Dann sieht ${p} vorher, ob Sie etwas doppelt zahlen und wann Sie kündigen können, und versucht, Ihnen Geld zu sparen.`)
    : a(an, `Dann ist vorher klar, ob du etwas doppelt zahlst und wann du kündigen kannst, und ${wer2} versucht, dir Geld zu sparen.`, `Dann ist vorher klar, ob Sie etwas doppelt zahlen und wann Sie kündigen können, und ${wer2} versucht, Ihnen Geld zu sparen.`);
  const text = a(
    an,
    `Damit ${wer} deinen Termin gut vorbereiten kann: Schick bitte vorab Fotos oder PDFs deiner aktuellen Policen hier in den Chat, egal ob ${sparten}. ${dann} So wird der Termin kürzer und konkreter.`,
    `Damit ${wer} Ihren Termin gut vorbereiten kann: Schicken Sie bitte vorab Fotos oder PDFs Ihrer aktuellen Policen hier in den Chat, egal ob ${sparten}. ${dann} So wird der Termin kürzer und konkreter.`,
  );
  return { text, knoepfe: [], fusszeile: null, einwilligung: policenEinwilligung(o) };
}

/**
 * Bitte an Kfz-Leads (Ole, 21.11.2026): die zwei Unterlagen, aus denen der Beitrag gerechnet wird. Ohne Versprechen zu
 * Preisen oder Ersparnis. wer = Vermittler im Nominativ.
 */
export function kfzBitteText(an: Ansprache, wer: string, andere?: string | null): string {
  const kern = a(
    an,
    `Damit ${wer} deinen Beitrag vorab rechnen kann: Schick bitte ein Foto von deinem Fahrzeugschein (Vorderseite) und von der letzten Rechnung deiner Kfz-Versicherung hier in den Chat. Darauf steht alles Nötige, zum Beispiel deine SF-Klasse.`,
    `Damit ${wer} Ihren Beitrag vorab rechnen kann: Schicken Sie bitte ein Foto von Ihrem Fahrzeugschein (Vorderseite) und von der letzten Rechnung Ihrer Kfz-Versicherung hier in den Chat. Darauf steht alles Nötige, zum Beispiel Ihre SF-Klasse.`,
  );
  // Andere Policen nur mit Komplettcheck Ja bzw. genannten Verträgen, mit Grund und den genannten Verträgen (Ole, 22.11.2026)
  return andere ? `${kern}\n\n${andere}` : kern;
}

/** Beide Nachrichten in der Reihenfolge zum Senden. */
export const policenNachrichten = (b: PolicenBitte): Nachricht[] => [{ text: b.text, knoepfe: b.knoepfe, fusszeile: b.fusszeile }, b.einwilligung];

/**
 * Nachfrage, wenn eine Datei vor der Einwilligung kommt (einmal je Lead): kurzer Satz und derselbe Einwilligungstext.
 * Ohne Zustimmung wird die Datei nicht abgerufen.
 */
export function policenNachfrage(o: { an: Ansprache; vermittler: BitteVermittler | null; firma?: string | null; datenschutzUrl?: string | null; gesundheitAn?: boolean }): Nachricht {
  const e = policenEinwilligung(o);
  const vorweg = a(o.an, "Danke! Bevor ich deine Unterlagen ablege, brauche ich kurz deine Zustimmung:", "Danke! Bevor ich Ihre Unterlagen ablege, brauche ich kurz Ihre Zustimmung:");
  return { ...e, text: `${vorweg}\n\n${e.text}` };
}
/** Erkennt die Nachfrage in einer unserer Nachrichten. */
export const NACHFRAGE_RE = /^Danke! Bevor ich (deine|Ihre) Unterlagen ablege/;

/** Nach „Einverstanden“, solange noch keine Datei da ist (Folgenachricht aus Text a der Rechtsprüfung). */
export const nachEinwilligungText = (an: Ansprache) =>
  a(
    an,
    "Danke! Schick die Policen gern als Foto oder PDF. Seiten mit Gesundheitsangaben kannst du schwärzen, wenn du sie nicht besprechen möchtest.",
    "Danke! Schicken Sie die Policen gern als Foto oder PDF. Seiten mit Gesundheitsangaben können Sie schwärzen, wenn Sie sie nicht besprechen möchten.",
  );

/** Feste Bestätigung auf das Stichwort „ohne KI“ (A9); der Assistent antwortet darauf nicht zusätzlich. */
export const ohneKiBestaetigung = (an: Ansprache) =>
  a(an, "Alles klar, deine Unterlagen werden nur gespeichert und nicht automatisch ausgelesen.", "Alles klar, Ihre Unterlagen werden nur gespeichert und nicht automatisch ausgelesen.");

/** Nach „Lieber nicht“: freundlich, der Termin findet trotzdem statt, kein Upload-Link (Oles Wortlaut). */
export const lieberNichtText = (an: Ansprache) =>
  a(
    an,
    "Kein Problem, dein Termin findet trotzdem statt. Bring deine Unterlagen dann einfach zum Termin mit.",
    "Kein Problem, Ihr Termin findet trotzdem statt. Bringen Sie Ihre Unterlagen dann einfach zum Termin mit.",
  );

const norm = (t: string | null | undefined) =>
  (t ?? "")
    .toLowerCase()
    .replace(/[.!]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

export type EinwilligungsAntwort = "ja" | "nein";

/** Antwort auf die Einwilligungsnachricht (Payload oder Knopftitel); null = keine solche Antwort. */
export function einwilligungsAntwort(payloadOderText: string | null | undefined): EinwilligungsAntwort | null {
  const t = (payloadOderText ?? "").trim();
  if (t === PAYLOAD_JA) return "ja";
  if (t === PAYLOAD_NEIN) return "nein";
  const n = norm(t);
  if (n === norm(KNOPF_JA)) return "ja";
  if (n === norm(KNOPF_NEIN)) return "nein";
  return null;
}

/** Ist dieser Text (Knopftitel „Einverstanden“ bzw. Payload policen:ja) die Einwilligung zu den Policen? */
export function istPolicenEinwilligungsKnopf(text: string | null | undefined): boolean {
  return einwilligungsAntwort(text) === "ja";
}

// ─── Stichwort „ohne KI“ (Auflage A9, nur Regeln) ───────────────────────────

/** Kleinbuchstaben, Anführungszeichen und Satzzeichen zu Leerzeichen („KI-Auslesen“ → „ki auslesen“). */
const flach = (t: string) =>
  t
    .toLowerCase()
    .replace(/[„“”"'‚‘’»«`´]/g, " ")
    .replace(/[.,!?;:()[\]\-\u2013\u2014_/*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const KI_WORT = String.raw`(?:ki|ai|kuenstliche intelligenz|künstliche intelligenz)`;
const AUSLESEN_WORT = String.raw`(?:(?:das |die )?(?:automatische[sn]? |maschinelle[sn]? )?(?:auslesen|auswertung|auswerten|erfassung))`;
/** „ohne KI“, „keine KI“, „ohne (automatisches) Auslesen“, „bitte ohne KI auslesen“. */
const OHNE_RE = new RegExp(String.raw`\b(?:ohne|keine?)(?: (?:eine?n?|die|den))? (?:${KI_WORT}|${AUSLESEN_WORT})\b`);
/** „nicht (automatisch) auslesen“, „nicht auswerten“ (als Frage kein Stichwort: „Wurde das nicht ausgelesen?“). */
const NICHT_RE = /\bnicht (?:automatisch |per ki |mit ki |maschinell )?(?:auslesen|ausgelesen|auswerten|ausgewertet)\b/;
/** „Bist du keine KI?“, „Das ist doch keine KI“: Frage nach dem Assistenten, kein Stichwort. */
const UEBER_DEN_ASSISTENTEN_RE = new RegExp(String.raw`\b(?:bist|sind|ist|bin|seid|waere|wäre|war|bleibt)\b(?: \S+){0,3} keine? ${KI_WORT}\b`);
/** Wunsch nach einem Menschen im Chat („keine KI, ich will mit einem Menschen sprechen“): Sache des Vermittlers. */
const MENSCH_RE = /\b(?:mensch\w*|echte[nmr]? person|bot|chatbot|roboter|sprechen|reden|telefonier\w*|anrufen)\b/;
/** Rückfragen dazu („Was heißt ohne KI?“): kein Stichwort. */
const RUECKFRAGE_RE = /^(?:was|wie|warum|wieso|weshalb|wozu|wofür|wofuer|welche[srnm]?)\b/;

/**
 * Stichwort „ohne KI“ samt Varianten (keine KI, ohne Auslesen, nicht auslesen), Groß/Klein, mit oder ohne
 * Anführungszeichen, auch im Satz („Ja, aber ohne KI bitte“). Nicht: Fragen nach dem Assistenten („Ist das eine
 * KI?“, „Bist du keine KI?“), Rückfragen („Was heißt ohne KI?“), „nicht ohne KI“, der Wunsch nach einem Menschen.
 */
export function istOhneKi(text: string | null | undefined): boolean {
  const roh = (text ?? "").trim();
  if (!roh || roh.length > 500) return false;
  const t = flach(roh);
  const ohne = OHNE_RE.test(t);
  if (!ohne && !(NICHT_RE.test(t) && !roh.includes("?"))) return false;
  if (/\bnicht ohne\b/.test(t)) return false;
  if (UEBER_DEN_ASSISTENTEN_RE.test(t) || MENSCH_RE.test(t)) return false;
  if (roh.includes("?") && RUECKFRAGE_RE.test(t)) return false;
  return true;
}

/** Rest einer Nachricht ohne das Stichwort („Ja, aber ohne KI“ → „ja“), für eine getippte Zustimmung mit Stichwort. */
export function ohneStichwort(text: string | null | undefined): string {
  return flach(text ?? "")
    .replace(new RegExp(OHNE_RE.source, "g"), " ")
    .replace(new RegExp(NICHT_RE.source, "g"), " ")
    .replace(/\b(aber|bitte|und|doch|nur|dann|gerne?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
