// KI-Kennzeichnung des WhatsApp-Assistenten (KI-Verordnung Art. 50 Abs. 1, gilt seit 2.8.2026; Ole, 15.11.2026).
// Reine Funktionen (testbar), genutzt von Vorlagen (templates.ts) und Bot (bot.ts):
//   - Die erste Nachricht an jeden neuen Kontakt enthält immer den Hinweis (nicht abschaltbar). Seit dem neuen
//     Erstanschreiben (Ole, 16.11.2026, lib/whatsapp/erstanschreiben.ts) als „digitaler KI-Assistent von …“ im
//     Nutzen-Satz, ohne „Mensch“-Angebot und ohne „berate nicht zu Tarifen“; beides sagt der Assistent im Gespräch.
//   - Nach einer langen Pause (über 30 Tage ohne Nachricht) wiederholt der Assistent ihn kurz.
//   - „Mensch“, „Mitarbeiter“, „Bist du ein Bot?“ … → wahrheitsgemäße Antwort und Übergabe an den Vermittler.
//   - Nur in der ERSTEN Nachricht, nicht in jeder Erinnerung (Ole, 24.11.2026): Die Erinnerung (followup_nudge ab v5) nennt
//     den Assistenten nicht mehr. Ist eine andere Nachricht die erste im Chat (Terminbestätigung nach einer
//     Online-Buchung, die Erinnerung selbst), trägt sie die Kennzeichnung als Fußzeile bzw. kursive Zeile (KI_FUSSZEILE,
//     templates.ts KI_ERST und kiKennzeichnungOffen). Wege zur ersten Nachricht: docs/recht/2026-11-24-ki-hinweis-erste-nachricht.md.

import { vermittlerBeruf } from "@/lib/vermittler-nennung";
import { a, anredeZeile, type AnredeKontakt, type Ansprache } from "@/lib/ansprache";

/** Ab so vielen Tagen Pause wird der Hinweis wiederholt. */
export const KI_HINWEIS_PAUSE_TAGE = 30;
const DAY = 24 * 60 * 60 * 1000;

/**
 * Die ersten beiden Sätze des Memo-Wortlauts (für Du und Sie gleich): wer schreibt (die Firma), kein Mensch, keine
 * Beratung zu Tarifen. Auch Grundlage der Erstanschreiben (Vorlagen ab v5, Freitext sofort; templates.ts).
 */
export const KI_HINWEIS_KURZ = "Hier schreibt der digitale KI-Assistent von [Firma]. Ich bin kein Mensch und berate nicht zu Tarifen.";
const kurzKlein = KI_HINWEIS_KURZ.charAt(0).toLowerCase() + KI_HINWEIS_KURZ.slice(1);

/**
 * Kern des Hinweises (nach der Anrede-Zeile, kleingeschrieben). [Firma] = Kundenname, [Berater] = Person.
 * Wortlaut laut Anwalts-Memo, in beiden Fassungen.
 */
export const KI_HINWEIS_KERN: Record<Ansprache, string> = {
  du: `${kurzKlein} Ich helfe dir, einen Termin mit [Berater] zu vereinbaren. Wenn du direkt mit [Berater] sprechen möchtest, schreib ‚Mensch‘.`,
  sie: `${kurzKlein} Ich helfe Ihnen, einen Termin mit [Berater] zu vereinbaren. Wenn Sie direkt mit [Berater] sprechen möchten, schreiben Sie ‚Mensch‘.`,
};

/** person: Vermittler nach der Nennungsregel (lib/vermittler-nennung.ts, Sie „Herr/Herrn Kannapinn“); ohne: advisor. */
export type KiNamen = { firm: string; advisor: string; person?: { nom: string; dat: string } };

const nom = (n: KiNamen) => n.person?.nom ?? n.advisor;
const dat = (n: KiNamen) => n.person?.dat ?? n.advisor;
// [Berater] steht in den Texten hier nur nach „mit“ (Dativ)
const fill = (t: string, n: KiNamen) => t.split("[Firma]").join(n.firm).split("[Berater]").join(dat(n));
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Satz zur Erstinformation (§ 15 VersVermV) mit Link. */
/** advisor im Dativ nach der Nennungsregel („zu Herrn Kannapinn“, lib/vermittler-nennung.ts). */
export function erstinfoZeile(advisor: string, url: string): string {
  return `Erstinformation zu ${advisor} als ${vermittlerBeruf(advisor)}: ${url}`;
}

/**
 * Begleittext zum PDF der Erstinformation (Nachricht 2 nach dem Erstanschreiben; § 15/16 VersVermV: dauerhafter
 * Datenträger, der Hinweis auf Papier steht im PDF selbst). Für Du und Sie gleich.
 */
export const ERSTINFO_PDF_CAPTION = "Unsere Erstinformation als Versicherungsvermittler, wie gesetzlich vorgesehen.";

/** Markierung im gespeicherten Text einer Vorlage, die das PDF der Erstinformation im Kopf trug (templates.ts). */
export const ERSTINFO_KOPF = "[Erstinformation als PDF]";

/**
 * Wurde in dieser Unterhaltung schon das PDF der Erstinformation geschickt? Als eigenes Dokument oder im Kopf des
 * Erstanschreibens (v4, dann steht ERSTINFO_KOPF am Anfang des gespeicherten Textes). So geht es nie doppelt raus.
 * Nicht zugestellte (Status „failed“) zählen nicht: dann ein neuer Versuch (höchstens ERSTINFO_MAX_VERSUCHE, erstinfo-pdf.ts).
 */
export function hasErstinfoPdf(messages: { direction?: string | null; kind?: string | null; body?: string | null; status?: string | null }[]): boolean {
  return messages.some(
    (m) =>
      m.direction !== "inbound" &&
      // Nicht zugestellt (Status „failed“): Der Lead hat sie nie bekommen (Ole, 25.11.2026, lib/whatsapp/erstinfo-pdf.ts)
      m.status !== "failed" &&
      ((m.kind === "document" && /Erstinformation/.test(m.body ?? "")) || (m.kind === "template" && (m.body ?? "").startsWith(ERSTINFO_KOPF))),
  );
}

/** Vollständiger Hinweis für die erste freie Nachricht: „Guten Tag Frau Schneider, hier schreibt …“. */
export function kiHinweis(an: Ansprache, names: KiNamen, kontakt?: AnredeKontakt | null): string {
  return `${anredeZeile(an, kontakt)} ${fill(KI_HINWEIS_KERN[an], names)}`;
}

/** Kurze Wiederholung nach langer Pause. */
export function kiHinweisErneut(an: Ansprache, names: KiNamen): string {
  return a(
    an,
    `Kurzer Hinweis: Hier schreibt weiterhin der digitale KI-Assistent von ${names.firm}. Ich bin kein Mensch und berate nicht zu Tarifen. Wenn du direkt mit ${dat(names)} sprechen möchtest, schreib ‚Mensch‘.`,
    `Kurzer Hinweis: Hier schreibt weiterhin der digitale KI-Assistent von ${names.firm}. Ich bin kein Mensch und berate nicht zu Tarifen. Wenn Sie direkt mit ${dat(names)} sprechen möchten, schreiben Sie ‚Mensch‘.`,
  );
}

/** Kern mit großem Anfang (z. B. nach „Vielen Dank für Ihre Anfrage!“), Platzhalter bleiben. */
export function kiHinweisSatz(an: Ansprache): string {
  return cap(KI_HINWEIS_KERN[an]);
}

/** Woran die Kennzeichnung in einer gesendeten Nachricht erkannt wird (Groß- und Kleinschreibung egal). */
export const KI_KENNZEICHEN = "KI-Assistent";

/**
 * Enthält eine ausgehende Nachricht die KI-Kennzeichnung? „digitaler KI-Assistent“ reicht (Erstanschreiben ab v5,
 * Ole 16.11.2026); alte Vorlagen mit „digitaler Assistent“ ohne „KI“ zählen nicht.
 */
export function hasKiHinweis(body: string | null | undefined): boolean {
  return (body ?? "").toLowerCase().includes(KI_KENNZEICHEN.toLowerCase());
}

/**
 * Kennzeichnung unter der ersten Nachricht, wenn ihr Text sie nicht selbst trägt (Ole, 24.11.2026): Fußzeile der Vorlage
 * (Meta: höchstens 60 Zeichen, ohne Platzhalter) bzw. kursive Zeile im Freitext. Gleicher Wortlaut wie unter dem
 * Erstanschreiben (erstanschreiben.ts ERSTINFO_FOOTER_V12; Recht: das Wort „KI“ muss bleiben). Meta lässt eine
 * eingereichte Fußzeile nicht ändern: neuer Wortlaut heißt neue Textversion der betroffenen Vorlagen.
 */
export const KI_FUSSZEILE = "Digitaler KI-Assistent";

/** Freitext der ersten Nachricht: kursive Zeile mit der Kennzeichnung darunter, wenn der Text sie nicht schon trägt. */
export function mitKiZeile(text: string): string {
  return hasKiHinweis(text) ? text : `${text}\n\n_${KI_FUSSZEILE}_`;
}

/** Enthält eine ausgehende Nachricht schon den Link zur Erstinformation? */
export function hasErstinfoLink(body: string | null | undefined): boolean {
  return /\/erstinformation\/[A-Za-z0-9_-]+/.test(body ?? "");
}

/**
 * Braucht die nächste Antwort des Assistenten den Hinweis?
 *   "erst"   = noch nie vollständig offengelegt (neuer Kontakt oder nur alte Vorlage)
 *   "erneut" = letzte Nachricht vor der aktuellen liegt mehr als 30 Tage zurück
 *   null     = nicht nötig
 * outbound = bisherige ausgehende Texte, previousAt = Zeitpunkt der Nachricht vor der aktuellen eingehenden.
 */
export function kiHinweisNoetig(opts: { outbound: (string | null)[]; previousAt: Date | null; now: Date }): "erst" | "erneut" | null {
  if (!opts.outbound.some(hasKiHinweis)) return "erst";
  if (opts.previousAt && opts.now.getTime() - opts.previousAt.getTime() > KI_HINWEIS_PAUSE_TAGE * DAY) return "erneut";
  return null;
}

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/[‚‘’'„“"«»]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Ganze Nachricht ist nur das Stichwort (ggf. mit Satzzeichen): „Mensch“, „Mitarbeiter!“, „Bot?“, „KI?“
const NUR_WORT = /^(ein )?(echte[rnm]? )?(mensch|menschen|mitarbeiter|mitarbeiterin|berater|beraterin|bot|ki|roboter|chatbot)\s*[?!.]*$/;
// Fragen nach der Natur des Gegenübers
const FRAGEN = [
  /\b(bist du|sind sie|ist das|bin ich hier bei|schreibe ich (hier )?mit|rede ich (hier )?mit|spreche ich (hier )?mit)\s+(eine?[mnr]? )?(echte[rnm]? )?(bot|ki|k\.i\.|roboter|maschine|computer|chatbot|chat ?gpt|automat|programm|mensch|person)\b/,
  /\b(bist du|sind sie|seid ihr)\s+(echt|real|ein echter mensch|eine echte person|echte menschen|echte personen|(eine? )?(echte[rnm]?|richtige[rnm]?) mitarbeiter(in)?)\b/,
  /\b(automatische|automatisierte|generierte) (antwort|nachricht)\b.*\?/,
  /\bkünstliche intelligenz\s*\?/,
  // Dritte Person (Ole, 24.11.2026: die Erinnerung nennt den Assistenten nicht mehr, die Frage kommt dann so):
  // „Schreibt hier ein Mensch?“, „Antwortet da eine KI oder ein Mensch?“, „Schreibt mir gerade ein Mensch?“
  /\b(schreibt|antwortet|chattet|tippt|spricht)\s+(mir\s+|mit mir\s+)?(hier|da|dort)\s+(mir\s+)?((gerade|jetzt|wirklich|eigentlich|überhaupt)\s+)?(eine?[mnr]?\s+)?((echte[rnm]?|richtige[rnm]?)\s+)?(bot|ki|k\.i\.|roboter|maschine|computer|chatbot|automat|programm|mensch|person|mitarbeiter(in)?)\b/,
  /\b(schreibt|antwortet)\s+mir\s+((hier|da|gerade|jetzt|wirklich|eigentlich|überhaupt)\s+)*(eine?[mnr]?\s+)?((echte[rnm]?|richtige[rnm]?)\s+)?(bot|ki|k\.i\.|roboter|maschine|computer|chatbot|automat|programm|mensch|person|mitarbeiter(in)?)\b/,
  // „Ist hier ein echter Mensch?“, „Ist da ein Mensch dran?“, „Sitzt da ein Mensch?“ (nicht: „Ist da eine Person mitversichert?“)
  /\b(ist|sitzt)\s+(hier|da|dort)\s+((gerade|jetzt|wirklich|eigentlich|überhaupt)\s+)?(eine?[mnr]?\s+)?((echte[rnm]?|richtige[rnm]?)\s+)?(bot|ki|k\.i\.|roboter|maschine|computer|chatbot|mensch)(\s+(dran|am apparat|am anderen ende|am werk))?\s*[?!.]*$/,
];
// Wunsch, mit einem Menschen zu sprechen
const WUNSCH = [
  /\bmit (einem |einer |nem |ner )?(echten |richtigen |realen )?(menschen|mitarbeiter(in)?|person)\b.{0,40}\b(sprechen|reden|schreiben|telefonieren|verbinden|kontakt)/,
  /\bmit (einem |einer |nem |ner |echten |richtigen |realen )(echten |richtigen |realen )?(menschen|mitarbeiter(in)?)\b/,
  /\b(echten|richtigen|realen) (menschen|mitarbeiter(in)?)\b/,
  /\b(kein(en)? bot|keine ki)\b/,
];

// Wunsch nach einem Anruf (Ole, 16.11.2026: jederzeit übergeben). „Lieber telefonieren“ als Antwort auf „Telefon oder
// Video?“ ist KEIN Übergabewunsch und wird hier nicht erkannt.
const ANRUF = [
  /\b(ruf(en sie|t)?|rufe) mich (bitte |doch |mal |gern |gerne |einfach |kurz )*(zurück|an)(?![a-zäöüß])/,
  /\b(können|könnten|kann|könnte|würden) (sie|du|mich|jemand)( mich)? (bitte |mal |kurz |einfach )*(anrufen|zurückrufen)\b/,
  /\b(bitte um|wünsche|möchte|hätte gern|hätte gerne|lieber) (einen |einen kurzen )?(rückruf|anruf)\b/,
  /^(rückruf|anruf|bitte anrufen|bitte rückruf)( bitte)?\s*[?!.]*$/,
];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Will der Kontakt einen Menschen, einen Anruf oder den Vermittler persönlich, bzw. fragt er, ob er mit einer KI
 * schreibt? Dann antwortet der Assistent wahrheitsgemäß und übergibt (Bot pausiert, Vermittler bekommt eine Push-
 * Mitteilung). opts.names: Namen des Vermittlers (z. B. „Ole“, „Ole Schmidt“, „Herr Schmidt“) für „Kann ich mit Ole sprechen?“.
 */
export function wantsHuman(text: string | null | undefined, opts: { names?: (string | null | undefined)[] } = {}): boolean {
  if (!text) return false;
  const t = norm(text);
  if (!t || t.length > 300) return false;
  if (NUR_WORT.test(t)) return true;
  if (FRAGEN.some((r) => r.test(t)) || WUNSCH.some((r) => r.test(t)) || ANRUF.some((r) => r.test(t))) return true;
  const names = (opts.names ?? []).map((n) => norm(n ?? "")).filter((n) => n.length >= 3);
  if (!names.length) return false;
  const n = `(herrn? |frau )?(${names.map(esc).join("|")})`;
  return (
    new RegExp(`\\bmit ${n}\\b.{0,30}\\b(sprechen|reden|telefonieren|verbinden|kontakt)`).test(t) ||
    new RegExp(`\\b${n} (soll|möge|kann|könnte|darf) mich\\b.{0,20}\\b(anrufen|zurückrufen|kontaktieren|melden)`).test(t) ||
    new RegExp(`\\b(ist|wäre) ${n} (persönlich )?(erreichbar|zu sprechen)\\b`).test(t)
  );
}

// Behauptet eine Antwort des Assistenten, ein Mensch bzw. keine KI zu sein? Nur bejahende Aussagen: „Ich bin kein
// Mensch“ und „Hier schreibt der digitale KI-Assistent“ treffen nicht.
const ALS_MENSCH = [
  /\bich bin (ja |doch |auch |wirklich |tatsächlich |natürlich |selbstverständlich )*(ein|eine) ((echter|echte|richtiger|richtige|realer|reale) )?(mensch|person|mitarbeiter|mitarbeiterin)\b/,
  /\bich bin (ja |doch |auch |wirklich |tatsächlich |natürlich |selbstverständlich )*(kein|keine) (bot|ki|k\.i\.|roboter|maschine|chatbot|computer|programm|automat|künstliche intelligenz)(?![a-zäöüß-])/,
  /\bhier (schreibt|ist|spricht|antwortet|sitzt) (ihnen |dir )?(ja |doch |wirklich |tatsächlich )*(ein|eine) ((echter|echte|richtiger|richtige) )?(mensch|person|mitarbeiter|mitarbeiterin)\b/,
  /\b(sie schreiben|du schreibst|sie sprechen|du sprichst|sie chatten|du chattest) (hier |gerade )*mit (einem|einer) ((echten|richtigen|realen) )?(menschen|person|mitarbeiter|mitarbeiterin)\b/,
  /\bich bin (ja |doch |wirklich |tatsächlich )*aus fleisch und blut\b/,
];

/**
 * Sicherheitsnetz hinter den Regeln im System-Prompt (Ole, 24.11.2026; KI-VO Art. 50): Gibt sich eine Antwort des
 * Assistenten als Mensch aus („Ja, ich bin ein Mensch“, „Ich bin kein Bot“)? Dann geht stattdessen ehrlicheAntwort raus
 * (bot.ts, wie die Beratungssperre). Rein, testbar.
 */
export function gibtSichAlsMenschAus(text: string | null | undefined): boolean {
  const t = norm(text ?? "");
  return !!t && ALS_MENSCH.some((r) => r.test(t));
}

/** Ehrliche Antwort statt einer, die sich als Mensch ausgibt (ohne Übergabe; „Mensch“ führt wie immer zum Vermittler). */
export function ehrlicheAntwort(an: Ansprache, names: KiNamen): string {
  return `Ich bin der digitale KI-Assistent von ${names.firm}, kein Mensch. ${a(an, `Wenn du direkt mit ${dat(names)} sprechen möchtest, schreib ‚Mensch‘.`, `Wenn Sie direkt mit ${dat(names)} sprechen möchten, schreiben Sie ‚Mensch‘.`)}`;
}

/**
 * Wahrheitsgemäße Antwort bei der Übergabe an den Vermittler. Mit Anrede-Zeile (erste Nachricht an den
 * Kontakt): „Guten Tag Frau Schneider, hier schreibt der digitale KI-Assistent von …, kein Mensch. …“
 */
export function humanHandoverReply(an: Ansprache, names: KiNamen, kontakt?: AnredeKontakt | null, opts: { greet?: boolean } = {}): string {
  const wer = opts.greet
    ? `${anredeZeile(an, kontakt)} ${fill(kurzKlein, names)}`
    : `Ich bin der digitale KI-Assistent von ${names.firm}, kein Mensch.`;
  return `${wer} ${a(an, `Ich habe ${dat(names)} Bescheid gegeben, ${nom(names)} meldet sich persönlich bei dir.`, `Ich habe ${dat(names)} Bescheid gegeben, ${nom(names)} meldet sich persönlich bei Ihnen.`)}`;
}
