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
const DATENSCHUTZ = [
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
];

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
];

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
  const betreff = (subject ?? "").replace(/^((re|aw|antw|wg|fwd?)\s*:\s*)+/i, "").toLowerCase();
  const t = `${betreff}\n${norm(text)}`.replace(VERNEINT, " ");
  if (!t.trim()) return null;
  if (DATENSCHUTZ.some((r) => r.test(t)) || (DSGVO.test(t) && DSGVO_BEZUG.test(t))) return "datenschutz";
  if (WIDERSPRUCH.some((r) => r.test(t))) return "widerspruch";
  if (AUSTRAGEN.some((r) => r.test(t))) return "austragen";
  return null;
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

/** Titel der Admin-Aufgabe, z. B. „Auskunft nach Art. 15 beantworten, Frist 19.12.2026“. */
export function auskunftsAufgabe(eingang: Date): string {
  return `${AUSKUNFT_AUFGABE}, Frist ${auskunftsFrist(eingang).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" })}`;
}
