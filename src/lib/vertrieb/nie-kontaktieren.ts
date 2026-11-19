// „Nie kontaktieren“ (Ole, 19.11.2026): Antworten auf Kalt-Mails, nach denen wir den Kontakt nie wieder anschreiben
// dürfen. Befund vorher: 25 „bitte austragen“ und 18 Fragen nach Datenschutz bzw. Herkunft der Adresse wurden nur als
// Absage eingestuft, Instantly lief weiter. Reine Funktionen ohne Datenbank (Tests, Skripte); Setzen, Instantly-Sperre
// und Nachhol-Lauf in lib/vertrieb/nie-kontaktieren-server.ts.
//
// Gelesen wird nur der eigene Text der Antwort (lib/vertrieb/spaeter.ts eigenerText): ohne zitierte Cold-Mail (deren
// Abmeldehinweis wäre sonst ein Fehlalarm) und ohne Signatur bzw. Rechtstexte (Datenschutzhinweise im Fußtext).
import { eigenerText } from "@/lib/vertrieb/spaeter";

export const SPERR_GRUENDE = ["austragen", "widerspruch", "datenschutz", "bounce_hart", "manuell"] as const;
export type SperrGrund = (typeof SPERR_GRUENDE)[number];
/** Gründe, die eine Antwort selbst liefern kann */
export type AntwortSperrGrund = Extract<SperrGrund, "austragen" | "widerspruch" | "datenschutz">;

export const SPERR_GRUND_LABEL: Record<SperrGrund, string> = {
  austragen: "Austragung gewünscht",
  widerspruch: "Widerspruch gegen Werbung",
  datenschutz: "Datenschutzfrage (Auskunft, Herkunft der Adresse)",
  bounce_hart: "Adresse unzustellbar (harter Bounce)",
  manuell: "von Hand gesperrt",
};

export const istSperrGrund = (g: unknown): g is SperrGrund => typeof g === "string" && (SPERR_GRUENDE as readonly string[]).includes(g);

// Datenschutz: Auskunft (Art. 15), Herkunft der Adresse. Löst zusätzlich die Aufgabe „Auskunft nach Art. 15“ aus.
// „DSGVO“ allein reicht nicht („Sind die Leads DSGVO-konform?“ ist eine Frage zum Produkt): nur zusammen mit eigenen
// Daten, Auskunft, Herkunft, Einwilligung oder dem Vorwurf, die Mail sei unzulässig.
const DSGVO = /\b(ds-?gvo|gdpr)\b|datenschutz-?grundverordnung/;
const DSGVO_BEZUG =
  /\b(mein|unser)\w* (personenbezogenen |persönlichen )?(daten|adresse|e-?mail\w*|kontakt\w*)|einwilligung|gespeichert|auskunft|herkunft|woher|unzulässig|nicht zulässig|rechtswidrig|verstoß|verstößt|ihre (e-?mail|mail|nachricht|anschreiben|werbung)/;
// Auskunft im engeren Sinn (Art. 15, Herkunft, Nachweis der Einwilligung): Ole muss antworten, bevor gelöscht wird
const AUSKUNFT = [
  /\bart(ikel|\.)?\s?15\b/,
  /\bauskunft\w* (nach|gemäß|gem\.?|laut) (art|artikel|§|der dsgvo|dsgvo|ds-gvo|datenschutz)/,
  /\bauskunft\w* über (die |meine |unsere )?(bei ihnen |von mir |zu mir |über mich )?(gespeicherten|personenbezogenen)/,
  /\bauskunft\w* über (meine|unsere) (daten|kontaktdaten)/,
  /\bauskunfts(ersuchen|anspruch|recht|anfrage|begehren)\b/,
  /\bwoher\b(\s+\S+){0,4}?\s+(meine|unsere|meiner|unserer)\s+(\S+\s+)?(e-?mail\w*|mail-?adresse\w*|adresse\w*|kontaktdaten|daten|kontakt\w*|nummer|anschrift)\b/,
  /\bwoher (haben|hast|habt|bekommen|bekamen|beziehen|kennen) (sie|du|ihr) (die|diese|meine|unsere) (e-?mail\w*|mail-?adresse|adresse|kontaktdaten|daten|kontakt\w*|nummer)\b/,
  /\bwoher (haben|hast|habt|kennen) (sie|du|ihr) (mich|uns)\b/,
  /\b(wie|wo) (sind|kommen|seid|bist|kamen) (sie|ihr|du) (an|auf) (meine|unsere|mich|uns)\b/,
  /\bherkunft (meiner|der|unserer|dieser|ihrer) (daten|adresse|e-?mail\w*|kontaktdaten)/,
  /\bwelche (daten|informationen) (haben|speichern|verarbeiten) sie (\S+ ){0,2}?(über|von|zu) (mir|mich|uns)\b/,
  /where did you get (my|our|this)/,
  // Nachweis der Einwilligung (Ole, 19.11.2026)
  /\b(nachweis|beleg)\w* (\S+ ){0,2}?(einwilligung|zustimmung|einverständnis)/,
  /\b(einwilligung|zustimmung|einverständnis)\w* (\S+ ){0,4}?(nachweisen|nachweis|belegen|vorlegen|vorzulegen|nachzuweisen)\b/,
  /\b(wann|wo|wodurch) (habe|hätte|haben|hätten) (ich|wir) (\S+ ){0,4}?(eingewilligt|zugestimmt)/,
  /\bweisen sie (\S+ ){0,4}?(einwilligung|zustimmung|einverständnis)\w* (\S+ )?nach\b/,
];
// Datenschutzbeauftragte(r): Datenschutzfrage mit Aufgabe, aber keine Auskunft im engeren Sinn
const DSB = /\bdatenschutz-?beauftragt\w*/;

// Widerspruch: ausdrücklich gegen Werbung bzw. Datennutzung, Löschung, Abmahnung
const WIDERSPRUCH = [
  /\bwiderspreche\b/, /\bwidersprechen\b(\s+\S+){0,6}?\s+(nutzung|verarbeitung|verwendung|werbung|daten)/, /\bwiderspruch (gegen|nach|gemäß|gem\.?)/,
  /\bverbitte\b/, /\b(ich|wir) untersage(n)? (ihnen|euch|dir)\b/, /\buntersage(n)? (ich|wir) (ihnen|euch|dir)\b/,
  /werbung\b(\s+\S+){0,4}?\s+(verbitte|untersag|verbiet|nicht erwünscht|unerwünscht)/,
  /\b(unerwünschte|unerlaubte|unzulässige|unverlangte) (werbung|werbe-?mails?|e-?mails?|mails?|zusendung\w*|nachrichten)/,
  /\bkeine werbung (\S+ )?mehr\b/, /\bbitte keine werbung\b/, /\bkeine werbung (bitte|erwünscht|gewünscht)\b/,
  /\buwg\b/, /\babmahn\w*/,
  /\b(löschen|entfernen) sie ((bitte|umgehend|sofort|unverzüglich) )*(meine|unsere) (daten|personenbezogenen|kontaktdaten|e-?mail\w*|adresse)/,
  /(meine|unsere) (daten|kontaktdaten|e-?mail-?adresse|adresse) ((bitte|umgehend|sofort|unverzüglich) )*(löschen|entfernen)/,
  // Erweitert (Ole, 19.11.2026): Art. 21, Unterlassung, Werbung ohne Einwilligung, Aufsicht, Schadensersatz, Anwalt
  /\bart(ikel|\.)?\s?21\b/,
  /\bunterlassung\w*/,
  /\bunterlassen sie\b/,
  /\b(bitte|künftig|zukünftig|umgehend|sofort|ab sofort) (\S+ ){0,3}?unterlassen\b/,
  /\b(ist|sind|haben sie|hat) (\S+ ){0,3}?zu unterlassen\b/,
  /\b(werbung|werbe-?mails?|mails?|e-?mails?|anschreiben|zusendung\w*|kontaktaufnahme\w*|nachrichten|anrufe)\b(\s+\S+){0,5}?\s+(zu )?unterlassen\b/,
  // „ohne meine Einwilligung“, nicht „ohne Zustimmung der Allianz“ (Absage-Grund, kein Widerspruch)
  /\bohne (meine |unsere |jede |jegliche |vorherige |ausdrückliche |eine |die |vorher |erforderliche )*(einwilligung|zustimmung|erlaubnis|einverständnis)\b(?! (der|des|meines|meiner|unseres|unserer|von|vom|ihrer|ihres)\b)/,
  /\b(nie|niemals) (\S+ ){0,2}?(eingewilligt|zugestimmt)\b/, /\bnicht (\S+ ){0,2}?eingewilligt\b/,
  /\b(nie|niemals|keine) (\S+ ){0,2}?(einwilligung|zustimmung) (\S+ ){0,3}?(erteilt|gegeben)\b/,
  /§\s?7\b(\s+\S+){0,3}?\s+uwg/,
  /\blandesdatenschutz\w*/, /\bdatenschutzbehörde\w*/, /\blandesbeauftragte\w* für (den )?datenschutz/, /\bbeschwerde (bei|an) (der|die|den) (\S+ )?(aufsicht|datenschutz|behörde)/,
  /\bschadens?ersatz\w*/, /\bart(ikel|\.)?\s?82\b/,
  /\banwaltlich\w*/, /\banwaltskosten\b/, /\brechtliche schritte\b/, /\bnamens und in vollmacht\b/,
  // „meinen Anwalt“, „unsere Rechtsanwältin“; nicht „Ihr Anwalt für …“, „Anwaltskanzlei-Kunden“, „Anwälte als Kunden“
  /\b(mein|meinen|meinem|meine|unser|unseren|unserem|unsere) (\S+ )?(rechts)?anw(a|ä)lt(in|e|en|s)?\b(?!-?(s)?kanzlei)/,
  /\b(rechts)?anw(a|ä)lt(in|e|en)? (\S+ ){0,2}?(einschalten|eingeschaltet|beauftragen|beauftragt|übergeben|weiterleiten|weitergeleitet|prüfen lassen|vorlegen)\b/,
];
// Aufsichtsbehörde: nur mit Datenschutz-Bezug bzw. ohne BaFin (Versicherungsaufsicht ist ein Absagegrund, kein Widerspruch)
const AUFSICHT = /\baufsichtsbehörde\w*/;
const BAFIN = /\bbafin\b/;

// Austragen: nicht mehr anschreiben, aus dem Verteiler, abmelden. Nicht: „keine weiteren Anfragen“ (ausgelastet).
const MAILS = "(e-?mails|mails|nachrichten|zusendungen|anschreiben|werbe-?mails|kontaktaufnahmen?)";
const AUSTRAGEN = [
  /\baustragen\b/, /\bausgetragen\b/, /\baustragung\b/, /\babmelden\b/, /\babmeldung\b/,
  /\bunsubscribe\b/, /\bopt[- ]?out\b/, /\bremove me\b/, /\btake me off\b/, /\bstop (emailing|contacting|sending)\b/, /\bdo not (contact|email)\b/,
  /\b(entfernen|streichen|löschen) sie (bitte )?(mich|uns)\b/, /\bnehmen sie (bitte )?(mich|uns) (aus|raus|von)\b/, /\blösch\w* (bitte )?(mich|uns)\b/,
  /\bbitte (entfernen|austragen|löschen|streichen)\b/,
  /\baus (dem|ihrem|ihren|eurem|deinem|diesem|ihrer|der|eurer|deiner) (\S+ )?(verteiler|mailingliste|mail-?liste|e-?mail-?liste|adressliste|kontaktliste|newsletter|datenbank|kartei)\b/,
  /\baus (ihrer|eurer|deiner) liste\b/,
  /\bverteiler\w* (entfernen|streichen|löschen|nehmen|austragen)/,
  new RegExp(`\\bkeine (weiteren|weitere|zukünftigen|künftigen) ${MAILS}\\b`),
  new RegExp(`\\bkeine ${MAILS}(\\s+\\S+){0,3}?\\s+mehr\\b`),
  /\bnicht (mehr|wieder|weiter) (zu )?(an)?(schreiben|kontaktieren|mailen|anmailen|belästigen|zumailen)\b/,
  /\b(schreiben|kontaktieren|mailen|belästigen) sie (mich|uns) (bitte )?(nicht mehr|nie wieder|nicht wieder|nicht weiter)\b/,
  new RegExp(`\\bsehen sie (bitte )?(künftig |zukünftig |in zukunft )?von (weiteren )?${MAILS}`),
];

// Verneinte Abmeldung („muss mich nicht abmelden“) zählt nicht
const VERNEINT = /\b(nicht|nie|kein\w*)\s+(abmelden|austragen|abmeldung|austragung)\b/g;

function norm(text: string | null | undefined): string {
  return eigenerText(text).toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Sperrgrund aus einer Antwort (nur eigener Text, ohne Zitat und Signatur) oder null.
 * Reihenfolge: Datenschutz (braucht eine Antwort von Ole) vor Widerspruch vor Austragen.
 */
export function sperrGrundAusAntwort(text: string | null | undefined, subject?: string | null): AntwortSperrGrund | null {
  return dsgvoAusAntwort(text, subject).grund;
}

// Löschverlangen (Art. 17, Ole 19.11.2026): nur ausdrücklich („löschen Sie meine Daten“, „Löschung meiner Daten“,
// „Art. 17“, „Recht auf Vergessenwerden“). Nicht: „löschen Sie mich aus dem Verteiler“ (Austragung).
const DATEN = "(daten|kontaktdaten|personenbezogenen|personenbezogene|angaben|e-?mail[\\w-]*|mail-?adresse\\w*|adresse\\w*|informationen)";
// Eigene Daten: „meine/unsere …“ oder „… über mich“. Nicht „die Daten der Leads“ (Frage zum Produkt).
const MEIN = "(meine|unsere|meiner|unserer)";
const UEBER_MICH = "(über|zu|von) (mir|mich|uns)";
const LOESCHEN = [
  /\bart(ikel|\.)?\s?17\b/,
  /\brecht auf (vergessen\w*|löschung)/,
  new RegExp(`\\blöschung (aller |sämtlicher |der )?${MEIN} (\\S+ ){0,1}?${DATEN}`),
  new RegExp(`\\blöschung (\\S+ ){0,3}?${DATEN} ${UEBER_MICH}\\b`),
  new RegExp(`\\blösch\\w* sie (\\S+ ){0,3}?${MEIN} (\\S+ ){0,2}?${DATEN}`),
  new RegExp(`\\blösch\\w* sie (\\S+ ){0,3}?(alle|sämtliche|die|jegliche) (\\S+ ){0,2}?${DATEN} ${UEBER_MICH}\\b`),
  new RegExp(`\\b${MEIN} (\\S+ ){0,2}?${DATEN} (\\S+ ){0,5}?(zu )?(löschen|gelöscht)\\b`),
  new RegExp(`\\b(alle|sämtliche|jegliche|die) (\\S+ ){0,2}?${DATEN} ${UEBER_MICH} (\\S+ ){0,5}?(zu )?(löschen|gelöscht)\\b`),
  /\blösch\w* sie (\S+ ){0,3}?(mich|uns) (\S+ ){0,2}?aus (ihrer|der|eurer|ihren|den) (\S+ )?(datenbank|datenbanken|kartei|crm|system\w*)\b/,
  /\b(mich|uns) (\S+ ){0,2}?aus (ihrer|der|eurer|ihren|den) (\S+ )?(datenbank|datenbanken|kartei|crm|system\w*) (\S+ ){0,2}?(zu )?(löschen|gelöscht)\b/,
];

export type DsgvoBefund = {
  /** Sperrgrund oder null */
  grund: AntwortSperrGrund | null;
  /** ausdrückliches Löschverlangen (Art. 17) */
  loeschen: boolean;
  /** Auskunft im engeren Sinn (Art. 15, Herkunft, Einwilligungsnachweis): vor dem Löschen beantworten */
  auskunft: boolean;
};

/**
 * Befund einer Antwort (nur eigener Text, ohne Zitat und Signatur). Reihenfolge des Grunds: Datenschutz (braucht eine
 * Antwort von Ole) vor Widerspruch vor Austragen. Ein reines Löschverlangen ist ein Widerspruch (keine Auskunft nötig,
 * auch wenn „DSGVO“ und „meine Daten“ darin stehen).
 */
export function dsgvoAusAntwort(text: string | null | undefined, subject?: string | null): DsgvoBefund {
  const betreff = (subject ?? "").replace(/^((re|aw|antw|wg|fwd?)\s*:\s*)+/i, "").toLowerCase();
  const t = `${betreff}\n${norm(text)}`.replace(VERNEINT, " ");
  const out: DsgvoBefund = { grund: null, loeschen: false, auskunft: false };
  if (!t.trim()) return out;
  out.auskunft = AUSKUNFT.some((r) => r.test(t));
  out.loeschen = LOESCHEN.some((r) => r.test(t));
  const dsb = DSB.test(t);
  const dsgvoAllgemein = DSGVO.test(t) && DSGVO_BEZUG.test(t);
  const aufsicht = AUFSICHT.test(t) && (!BAFIN.test(t) || /datenschutz/.test(t));
  if (out.auskunft || dsb || (dsgvoAllgemein && !out.loeschen)) out.grund = "datenschutz";
  else if (out.loeschen || aufsicht || WIDERSPRUCH.some((r) => r.test(t))) out.grund = "widerspruch";
  else if (AUSTRAGEN.some((r) => r.test(t))) out.grund = "austragen";
  return out;
}

/** Frist für die Auskunft nach Art. 15 DSGVO: ein Monat ab Eingang (Art. 12 Abs. 3), gleicher Kalendertag. */
export function auskunftsFrist(eingang: Date): Date {
  const d = new Date(eingang);
  const tag = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const letzter = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(tag, letzter));
  return d;
}

export const AUSKUNFT_AUFGABE = "Auskunft nach Art. 15 beantworten";
export const LOESCH_PRUEFEN_AUFGABE = "Löschverlangen prüfen (Kunde/Lead)";
export const AUSKUNFT_VOR_LOESCHUNG_AUFGABE = "Auskunft und Löschverlangen: erst Auskunft schicken, dann löschen (Art. 17)";

/** „TT.MM.JJJJ“ in Berliner Zeit */
export const datumDe = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });

/** Titel einer Datenschutz-Aufgabe mit Frist von einem Monat, z. B. „Löschverlangen prüfen (Kunde/Lead), Frist 19.12.2026“. */
export const aufgabeMitFrist = (titel: string, eingang: Date) => `${titel}, Frist ${datumDe(auskunftsFrist(eingang))}`;

/** Einziger Verlaufseintrag eines auf Verlangen gelöschten Kontakts (ohne Personenbezug). */
export const art17Vermerk = (at: Date) => `Personenbezogene Daten am ${datumDe(at)} auf Verlangen gelöscht (Art. 17 DSGVO). Sperrvermerk bleibt.`;
export const ART17_NAME = "Gelöscht auf Verlangen (Art. 17 DSGVO)";

/** Titel der Admin-Aufgabe, z. B. „Auskunft nach Art. 15 beantworten, Frist 19.12.2026“. */
export function auskunftsAufgabe(eingang: Date): string {
  return aufgabeMitFrist(AUSKUNFT_AUFGABE, eingang);
}
