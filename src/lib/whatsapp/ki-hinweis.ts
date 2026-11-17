// KI-Kennzeichnung des WhatsApp-Assistenten (KI-Verordnung Art. 50 Abs. 1, gilt seit 2.8.2026; Ole, 15.11.2026).
// Reine Funktionen (testbar), genutzt von Vorlagen (templates.ts) und Bot (bot.ts):
//   - Die erste Nachricht an jeden neuen Kontakt enthält immer den Hinweis (nicht abschaltbar). Seit dem neuen
//     Erstanschreiben (Ole, 16.11.2026, lib/whatsapp/erstanschreiben.ts) als „digitaler KI-Assistent von …“ im
//     Nutzen-Satz, ohne „Mensch“-Angebot und ohne „berate nicht zu Tarifen“; beides sagt der Assistent im Gespräch.
//   - Nach einer langen Pause (über 30 Tage ohne Nachricht) wiederholt der Assistent ihn kurz.
//   - „Mensch“, „Mitarbeiter“, „Bist du ein Bot?“ … → wahrheitsgemäße Antwort und Übergabe an den Vermittler.

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
  return `Erstinformation zu ${advisor} als Versicherungsvermittler: ${url}`;
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
 */
export function hasErstinfoPdf(messages: { direction?: string | null; kind?: string | null; body?: string | null }[]): boolean {
  return messages.some(
    (m) => m.direction !== "inbound" && ((m.kind === "document" && /Erstinformation/.test(m.body ?? "")) || (m.kind === "template" && (m.body ?? "").startsWith(ERSTINFO_KOPF))),
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

/**
 * Enthält eine ausgehende Nachricht die KI-Kennzeichnung? „digitaler KI-Assistent“ reicht (Erstanschreiben ab v5,
 * Ole 16.11.2026); alte Vorlagen mit „digitaler Assistent“ ohne „KI“ zählen nicht.
 */
export function hasKiHinweis(body: string | null | undefined): boolean {
  return /KI-Assistent/i.test(body ?? "");
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
  /\b(bist du|sind sie)\s+(echt|real|ein echter mensch|eine echte person)\b/,
  /\b(automatische|automatisierte|generierte) (antwort|nachricht)\b.*\?/,
  /\bkünstliche intelligenz\s*\?/,
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
