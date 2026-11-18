// Betroffenenrechte erkennen, ohne KI (Ole, 18.11.2026, docs/plan-mailstrecke-dsgvo-investoren.md D1): in WhatsApp-
// Nachrichten (lib/whatsapp/gateway.ts, vor dem Assistenten) und im Mail-Eingang (lib/mail/eingang.ts). Rein, getestet
// (tests/unit/dsgvo-erkennung.test.ts). Lieber eine Anfrage zu viel an den Vermittler als eine übersehene, aber nicht:
//   - „STOPP“ bzw. „keine Nachrichten mehr“ (Abmeldung von WhatsApp, lib/whatsapp/stopp.ts),
//   - Widerruf der Einwilligung zu Policen-Unterlagen („Widerruf“, „Unterlagen löschen“, lib/policen/regeln.ts),
//   - Widerruf eines Versicherungsvertrags, „Termin löschen“, Fragen nach benötigten Daten („Welche Daten brauchen Sie?“).

import type { Ansprache } from "@/lib/ansprache";
import { a } from "@/lib/ansprache";

export type DsgvoArt = "auskunft" | "loeschung" | "widerspruch_werbung" | "berichtigung" | "einschraenkung" | "uebertragbarkeit" | "unklar";

export const DSGVO_ART_LABEL: Record<DsgvoArt, string> = {
  auskunft: "Auskunft",
  loeschung: "Löschung",
  widerspruch_werbung: "Widerspruch gegen Werbung",
  berichtigung: "Berichtigung",
  einschraenkung: "Einschränkung",
  uebertragbarkeit: "Datenübertragung",
  unklar: "Datenschutz-Anfrage",
};

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[„“"'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** „meine Daten“, „personenbezogenen Daten“, „über mich gespeicherten Daten“ (nicht „Geburtsdaten“, „Termindaten“). */
const MEINE_DATEN = /\b(meine[rn]?|saemtliche[rn]?|alle[rn]?|die) (personenbezogenen |persoenlichen |gespeicherten |ueber mich gespeicherten |zu mir gespeicherten |kontakt)?daten\b|\bpersonenbezogene(n)? daten\b|\bdaten (ueber|zu|von) mir\b|\bmeine kontaktdaten\b/;
const ARTIKEL = (n: number) => new RegExp(`\\b(art\\.?|artikel) ?${n}\\b`);

/**
 * Art der Anfrage oder null (rein). Reihenfolge: Widerspruch gegen Werbung, Löschung, Auskunft, Berichtigung,
 * Einschränkung, Übertragbarkeit, sonst bei klarem DSGVO-Bezug „unklar“.
 */
export function erkenneDsgvo(text: string | null | undefined, opts: { betreff?: string | null } = {}): DsgvoArt | null {
  const roh = `${opts.betreff ?? ""} ${text ?? ""}`;
  const t = norm(roh);
  if (!t || t.length < 6) return null;
  const dsgvo = /\b(dsgvo|ds-gvo|datenschutzgrundverordnung|datenschutz-grundverordnung|bdsg|betroffenenrecht)/.test(t);

  // Widerspruch gegen Werbung (Art. 21 Abs. 2): „Ich widerspreche der Nutzung meiner Daten für Werbung“, „keine Werbung mehr“
  if (/(widersprech|widerspreche|widerspruch)/.test(t) && /(werbung|werbe|werblich|marketing|direktwerbung|verarbeitung|nutzung meiner daten|kontaktaufnahme)/.test(t)) return "widerspruch_werbung";
  if (/\bkeine (weitere |weiteren )?(werbung|werbemails?|werbe-?e-?mails?|werbenachrichten|marketing)\b/.test(t)) return "widerspruch_werbung";
  if (ARTIKEL(21).test(t) && dsgvo) return "widerspruch_werbung";

  // Löschung (Art. 17): „Löschen Sie meine Daten“, „Recht auf Vergessenwerden“; nicht „Unterlagen/Fotos löschen“, „Termin löschen“
  if (/recht auf (loeschung|vergessenwerden|vergessen werden)/.test(t) || (ARTIKEL(17).test(t) && dsgvo)) return "loeschung";
  if (/(loesch|entfern|vernicht)/.test(t) && MEINE_DATEN.test(t) && !/\btermin/.test(t)) return "loeschung";
  if (/(loesch|entfern)\w* (sie |bitte |ihr )*(mich|meinen eintrag|mein konto|meinen datensatz)\b/.test(t) && /(daten|kartei|system|verteiler|datenbank|crm)/.test(t)) return "loeschung";

  // Auskunft (Art. 15): „Auskunft über meine Daten“, „Welche Daten haben Sie über mich gespeichert?“
  if (ARTIKEL(15).test(t) && (dsgvo || /auskunft/.test(t))) return "auskunft";
  if (/auskunft/.test(t) && (MEINE_DATEN.test(t) || dsgvo || /gespeichert/.test(t))) return "auskunft";
  if (/welche daten (haben|speichern|verarbeiten|besitzen|nutzen) (sie|ihr|du)\b/.test(t) && /(ueber mich|von mir|zu mir|gespeichert)/.test(t)) return "auskunft";
  if (/woher (haben|hast|habt) (sie|du|ihr) (meine (daten|nummer|telefonnummer|e-?mail|adresse|kontaktdaten))/.test(t)) return "auskunft";
  if (/datenauskunft|selbstauskunft nach/.test(t)) return "auskunft";

  // Berichtigung, Einschränkung, Übertragbarkeit (Art. 16, 18, 20)
  if (/berichtigung/.test(t) && (MEINE_DATEN.test(t) || dsgvo) || (ARTIKEL(16).test(t) && dsgvo)) return "berichtigung";
  if (/einschraenkung der verarbeitung/.test(t) || (ARTIKEL(18).test(t) && dsgvo)) return "einschraenkung";
  if (/datenuebertragbarkeit|daten uebertragen lassen/.test(t) || (ARTIKEL(20).test(t) && dsgvo)) return "uebertragbarkeit";

  if (dsgvo && /(anfrage|antrag|verlange|fordere|bitte|moechte|beantrage|geltend)/.test(t)) return "unklar";
  return null;
}

/** Frist für die Antwort: ein Monat nach Eingang (Art. 12 Abs. 3), auf den letzten Tag des Monats gekürzt. */
export function fristBis(eingang: Date): Date {
  const d = new Date(eingang.getTime());
  const tag = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const letzter = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(tag, letzter));
  return d;
}

/**
 * Sofortbestätigung an den Absender im Namen des Vermittlers (Ole, 18.11.2026), beide Fassungen, ohne Gedankenstriche.
 * Beim Widerspruch gegen Werbung zusätzlich, dass ab sofort keine Werbung mehr kommt.
 */
export function bestaetigungText(an: Ansprache, art: DsgvoArt): string {
  const kern = a(an, "Deine Anfrage ist angekommen, du bekommst innerhalb eines Monats Antwort.", "Ihre Anfrage ist angekommen, Sie bekommen innerhalb eines Monats Antwort.");
  if (art !== "widerspruch_werbung") return kern;
  return `${kern} ${a(an, "Werbung schicken wir dir ab sofort nicht mehr.", "Werbung schicken wir Ihnen ab sofort nicht mehr.")}`;
}
