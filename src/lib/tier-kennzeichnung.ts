// Kennzeichnung des Tieres (Chip, Tätowierung), Ole 26.11.2026: wichtig für die Angebotserstellung, kommt zusätzlich ins
// Meta-Leadformular. Eine Erkennung für Formular (Feldname und Wert, deutsch und englisch, mit und ohne Umlaut), die
// feste Tierstrecke (lib/whatsapp/tier-fragen.ts) und die Fragen-Engine (lib/vorbereitung/sparten.ts). Rein, testbar.

export type Kennzeichnung = "chip" | "tattoo" | "beides" | "keine" | "ja" | "unbekannt";

/** Formularfeld zur Kennzeichnung (Feldname bzw. Frage im Meta-Formular). */
export const KENNZEICHNUNG_LABEL_RE = /chip|t(ä|ae|a)towier|tattoo|kennzeichn|transponder|identification/i;

/** Text in den Angaben („Kennzeichnung: gechippt“) und in der Terminvorbereitung. */
export const KENNZEICHNUNG_TEXT: Record<Kennzeichnung, string> = {
  chip: "gechippt",
  tattoo: "tätowiert",
  beides: "gechippt und tätowiert",
  keine: "weder gechippt noch tätowiert",
  ja: "gekennzeichnet (Chip oder Tätowierung)",
  unbekannt: "offen",
};

const CHIP = /chip|transponder|\b\d{15}\b/;
const TATTOO = /t(ä|ae|a)to?wier|tattoo/;
const WEISS_NICHT = /wei(ß|ss) (ich )?(es )?nicht|keine ahnung|unbekannt|unsicher|nicht sicher|don'?t know|not sure|unknown/;
const JA = /^(ja|jo|jap|jep|yes|y|genau|klar)\b/;
const NEIN = /^(nein|nee|ne|nö|noe|no|n|keine?s?|nichts|gar nicht|nicht|ohne|none|neither)\b/;

/**
 * Antwort lesen (Formularwert bzw. Chat). label = Feldname, falls die Formularfrage nur Ja/Nein kennt („Ist Ihre Katze
 * gechippt?“: ja → gechippt). null = nicht erkannt (der Aufrufer übernimmt den Text wörtlich).
 */
export function kennzeichnungLesen(wert: string | null | undefined, label?: string | null): Kennzeichnung | null {
  const t = (wert ?? "").toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (/\bweder\b|\bneither\b|nicht gekennzeichnet|ungekennzeichnet|keine kennzeichnung|\bnone\b/.test(t)) return "keine";
  if (WEISS_NICHT.test(t)) return "unbekannt";
  if (/\bbeide(s)?\b|\bsowohl\b|\bboth\b/.test(t)) return "beides";
  const chip = CHIP.test(t) && !/(nicht|kein\w*|not|no)\s+(ge)?(micro)?chip/.test(t);
  const tattoo = TATTOO.test(t) && !/(nicht|kein\w*|not|no)\s+(ge)?t(ä|ae|a)to?wier|(nicht|kein\w*|not|no)\s+tattoo/.test(t);
  if (chip && tattoo) return "beides";
  if (chip) return "chip";
  if (tattoo) return "tattoo";
  // „nein“, „nicht gechippt“, „no microchip“
  if (NEIN.test(t) || ((CHIP.test(t) || TATTOO.test(t)) && /\b(nicht|kein\w*|not|no)\b/.test(t))) return "keine";
  // Ja/Nein auf eine Formularfrage: aus dem Feldnamen
  if (JA.test(t) && label) {
    const l = label.toLowerCase();
    const lc = CHIP.test(l);
    const lt = TATTOO.test(l);
    if (lc && !lt) return "chip";
    if (lt && !lc) return "tattoo";
    return "ja";
  }
  if (JA.test(t)) return "ja";
  return null;
}

/** Kennzeichnung aus dem Formular (erstes passendes Feld mit Wert): erkannt bzw. der Wert wörtlich; null = kein Feld. */
export function kennzeichnungAusFormular(formular: readonly { label: string; value: string }[]): { art: Kennzeichnung | null; text: string } | null {
  const f = formular.find((x) => KENNZEICHNUNG_LABEL_RE.test(x.label) && x.value?.trim());
  if (!f) return null;
  const roh = f.value.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const art = kennzeichnungLesen(roh, f.label);
  return { art, text: art ? KENNZEICHNUNG_TEXT[art] : roh };
}
