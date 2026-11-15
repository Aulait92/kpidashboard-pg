// KI-Kennzeichnung des WhatsApp-Assistenten (KI-Verordnung Art. 50 Abs. 1, gilt seit 2.8.2026; Ole, 15.11.2026).
// Reine Funktionen (testbar), genutzt von Vorlagen (templates.ts) und Bot (bot.ts):
//   - Die erste Nachricht an jeden neuen Kontakt enthält immer den Hinweis (nicht abschaltbar).
//   - Nach einer langen Pause (über 30 Tage ohne Nachricht) wiederholt der Assistent ihn kurz.
//   - „Mensch“, „Mitarbeiter“, „Bist du ein Bot?“ … → wahrheitsgemäße Antwort und Übergabe an den Vermittler.

import { a, anredeZeile, type AnredeKontakt, type Ansprache } from "@/lib/ansprache";

/** Ab so vielen Tagen Pause wird der Hinweis wiederholt. */
export const KI_HINWEIS_PAUSE_TAGE = 30;
const DAY = 24 * 60 * 60 * 1000;

/**
 * Kern des Hinweises (nach der Anrede-Zeile, kleingeschrieben). [Firma] = Kundenname, [Berater] = Person.
 * Wortlaut laut Anwalts-Memo, in beiden Fassungen.
 */
export const KI_HINWEIS_KERN: Record<Ansprache, string> = {
  du: "hier schreibt der digitale KI-Assistent von [Firma]. Ich bin kein Mensch und berate nicht zu Tarifen. Ich helfe dir, einen Termin mit [Berater] zu vereinbaren. Wenn du direkt mit [Berater] sprechen möchtest, schreib ‚Mensch‘.",
  sie: "hier schreibt der digitale KI-Assistent von [Firma]. Ich bin kein Mensch und berate nicht zu Tarifen. Ich helfe Ihnen, einen Termin mit [Berater] zu vereinbaren. Wenn Sie direkt mit [Berater] sprechen möchten, schreiben Sie ‚Mensch‘.",
};

export type KiNamen = { firm: string; advisor: string };

const fill = (t: string, n: KiNamen) => t.split("[Firma]").join(n.firm).split("[Berater]").join(n.advisor);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Satz zur Erstinformation (§ 15 VersVermV) mit Link. */
export function erstinfoZeile(advisor: string, url: string): string {
  return `Erstinformation zu ${advisor} als Versicherungsvermittler: ${url}`;
}

/**
 * Begleittext zum PDF der Erstinformation (§ 16 VersVermV: dauerhafter Datenträger, Papier auf Wunsch).
 * Der Link zur Seite steht zusätzlich dahinter.
 */
export function erstinfoPdfText(an: Ansprache, advisor: string): string {
  return a(
    an,
    `Hier ist die Erstinformation zu ${advisor} als Versicherungsvermittler als PDF zum Speichern. Auf Wunsch bekommst du sie auch kostenlos auf Papier.`,
    `Hier ist die Erstinformation zu ${advisor} als Versicherungsvermittler als PDF zum Speichern. Auf Wunsch erhalten Sie sie auch kostenlos auf Papier.`,
  );
}

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
    `Kurzer Hinweis: Hier schreibt weiterhin der digitale KI-Assistent von ${names.firm}, kein Mensch. Wenn du direkt mit ${names.advisor} sprechen möchtest, schreib ‚Mensch‘.`,
    `Kurzer Hinweis: Hier schreibt weiterhin der digitale KI-Assistent von ${names.firm}, kein Mensch. Wenn Sie direkt mit ${names.advisor} sprechen möchten, schreiben Sie ‚Mensch‘.`,
  );
}

/** Kern mit großem Anfang (z. B. nach „Vielen Dank für Ihre Anfrage!“), Platzhalter bleiben. */
export function kiHinweisSatz(an: Ansprache): string {
  return cap(KI_HINWEIS_KERN[an]);
}

/** Enthält eine ausgehende Nachricht den vollständigen KI-Hinweis? (alte Vorlagen „digitaler Assistent“ zählen nicht) */
export function hasKiHinweis(body: string | null | undefined): boolean {
  const t = body ?? "";
  return /KI-Assistent/i.test(t) && /kein Mensch/i.test(t);
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

/**
 * Will der Kontakt einen Menschen bzw. fragt er, ob er mit einer KI schreibt? Dann antwortet der
 * Assistent wahrheitsgemäß und übergibt (Bot pausiert, Vermittler bekommt eine Mitteilung).
 */
export function wantsHuman(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = norm(text);
  if (!t || t.length > 300) return false;
  if (NUR_WORT.test(t)) return true;
  return FRAGEN.some((r) => r.test(t)) || WUNSCH.some((r) => r.test(t));
}

/**
 * Wahrheitsgemäße Antwort bei der Übergabe an den Vermittler. Mit Anrede-Zeile (erste Nachricht an den
 * Kontakt): „Guten Tag Frau Schneider, hier schreibt der digitale KI-Assistent von …, kein Mensch. …“
 */
export function humanHandoverReply(an: Ansprache, names: KiNamen, kontakt?: AnredeKontakt | null, opts: { greet?: boolean } = {}): string {
  const wer = opts.greet
    ? `${anredeZeile(an, kontakt)} hier schreibt der digitale KI-Assistent von ${names.firm}, kein Mensch.`
    : `Ich bin der digitale KI-Assistent von ${names.firm}, kein Mensch.`;
  return `${wer} ${a(an, `Ich habe ${names.advisor} Bescheid gegeben, ${names.advisor} meldet sich persönlich bei dir.`, `Ich habe ${names.advisor} Bescheid gegeben, ${names.advisor} meldet sich persönlich bei Ihnen.`)}`;
}
