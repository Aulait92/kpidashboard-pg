// Ansprache von Leads und Kunden: Sie (Standard) oder Du – je Kunde einstellbar (Ole, 14.11.2026).
// Gilt für E-Mail-Vorlagen, WhatsApp-Assistent und -Vorlagen, Termin-Nachrichten und öffentliche Seiten.
// Die Oberfläche für Vermittler bleibt unverändert (Sie-Form).
//
// Anrede-Zeile (Ole, 14.11.2026: „Hallo Julia“ mit Sie wirkt wie Du):
//   Du  → „Hallo Julia,“ (ohne Namen „Hallo,“)
//   Sie → „Guten Tag Frau Schneider,“ bzw. „Guten Tag Herr Schneider,“, wenn die Anrede bekannt ist,
//         sonst „Guten Tag Julia Schneider,“; ohne Nachnamen „Guten Tag,“.
//   Die Anrede wird nie aus dem Vornamen geraten, nur aus Angaben (Formularfeld Anrede/Geschlecht,
//   Bestandskunde, Vertriebs-CRM oder „Frau …“/„Herr …“ im Namen selbst).

import { anredeAusVorname, anredeBewusstOffen } from "@/lib/vorname-anrede";

export type Ansprache = "sie" | "du";

export const ANSPRACHE_LABEL: Record<Ansprache, string> = { sie: "Sie (förmlich)", du: "Du (persönlich)" };

export function asAnsprache(v: unknown): Ansprache {
  return v === "du" ? "du" : "sie";
}

/** Text je Ansprache wählen: a(ansprache, "Hast du …", "Haben Sie …"). */
export function a(ansprache: Ansprache, du: string, sie: string): string {
  return ansprache === "du" ? du : sie;
}

export type Salutation = "Herr" | "Frau";

/** Name und (falls bekannt) Anrede eines Kontakts. Alle Angaben optional. */
export type AnredeKontakt = {
  firstName?: string | null;
  lastName?: string | null;
  /** Ganzer Name, wie er gespeichert ist („Julia Schneider“, auch „Frau Schneider“). */
  fullName?: string | null;
  /** Rohwert aus Formular/Import (Herr, Frau, männlich, w, Mrs …); wird mit salutationOf gelesen. */
  salutation?: string | null;
};

const HERR = new Set(["herr", "hr", "herrn", "mann", "mannlich", "maennlich", "m", "male", "man", "mr", "mister", "sir"]);
const FRAU = new Set(["frau", "fr", "weiblich", "w", "f", "female", "woman", "mrs", "ms", "miss", "madam"]);

/**
 * Herr/Frau robust aus einem Formular- oder Importwert lesen. Divers, keine Angabe und alles
 * Unbekannte → null (dann „Guten Tag Vorname Nachname“).
 */
export function salutationOf(v: unknown): Salutation | null {
  if (typeof v !== "string") return null;
  const s = v
    .trim()
    .toLowerCase()
    .replace(/ä/g, "a")
    .normalize("NFKD")
    .replace(/[^a-z]/g, "");
  if (!s) return null;
  if (HERR.has(s)) return "Herr";
  if (FRAU.has(s)) return "Frau";
  // „Herr Dr.“, „Frau Prof.“
  if (/^herrn?(dr|prof)/.test(s)) return "Herr";
  if (/^frau(dr|prof)/.test(s)) return "Frau";
  return null;
}

// Formularfelder für die Anrede der Person (nicht „Geschlecht (Tier)“ o. Ä.: nur exakte Bezeichnungen)
const SALUTATION_LABELS = new Set(["anrede", "ihreanrede", "salutation", "geschlecht", "gender", "title"]);
const normLabel = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");

/** Anrede aus Lead.formData ([{ label, value }]) lesen; null, wenn kein passendes Feld da ist. */
export function salutationFromForm(formData: unknown): Salutation | null {
  if (!Array.isArray(formData)) return null;
  for (const x of formData) {
    if (!x || typeof x !== "object") continue;
    const { label, value } = x as { label?: unknown; value?: unknown };
    if (typeof label === "string" && SALUTATION_LABELS.has(normLabel(label))) {
      const s = salutationOf(value);
      if (s) return s;
    }
  }
  return null;
}

/**
 * Anrede-Rohwert aus Lead.formData für AnredeKontakt: „Herr“/„Frau“, „keine“ bei ausdrücklich offener Anrede
 * (Divers, keine Angabe, vom Vermittler so gewählt), sonst null (dann Anrede aus dem Vornamen, falls eindeutig).
 */
export function anredeRohAusForm(formData: unknown): string | null {
  if (!Array.isArray(formData)) return null;
  for (const x of formData) {
    if (!x || typeof x !== "object") continue;
    const { label, value } = x as { label?: unknown; value?: unknown };
    if (typeof label === "string" && SALUTATION_LABELS.has(normLabel(label))) {
      const s = salutationOf(value);
      if (s) return s;
      if (anredeBewusstOffen(value)) return "keine";
    }
  }
  return null;
}

/** Vor- bzw. Nachname aus Lead.formData (falls das Formular sie getrennt abfragt). */
export function namePartsFromForm(formData: unknown): { firstName: string | null; lastName: string | null } {
  const out = { firstName: null as string | null, lastName: null as string | null };
  if (!Array.isArray(formData)) return out;
  for (const x of formData) {
    if (!x || typeof x !== "object") continue;
    const { label, value } = x as { label?: unknown; value?: unknown };
    if (typeof label !== "string" || typeof value !== "string" || !value.trim()) continue;
    const l = normLabel(label);
    if (!out.firstName && (l === "vorname" || l === "firstname")) out.firstName = value.trim();
    if (!out.lastName && (l === "nachname" || l === "lastname" || l === "familienname")) out.lastName = value.trim();
  }
  return out;
}

const PARTICLES = new Set(["von", "van", "vom", "zu", "zum", "zur", "de", "der", "den", "di", "da", "du", "del", "la", "le", "ten", "ter"]);
const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Vorname, Nachname und Anrede aus den Angaben ableiten (Nachname nur, wenn wirklich bekannt). */
export function kontaktParts(k: AnredeKontakt | null | undefined): { first: string; last: string; salutation: Salutation | null } {
  let full = clean(k?.fullName);
  let salutation = salutationOf(k?.salutation);
  // „Frau Schneider“ / „Herr Dr. Weber“ im Namensfeld: Anrede steht da, nicht geraten
  const m = /^(herr|herrn|frau|hr\.?|fr\.?)\s+(.+)$/i.exec(full);
  if (m) {
    salutation = salutation ?? salutationOf(m[1]);
    full = m[2].trim();
  }
  const words = full.split(" ").filter(Boolean);
  let first = clean(k?.firstName);
  let last = clean(k?.lastName);
  if (!last && m && words.length === 1) {
    // Nach „Frau“/„Herr“ steht oft nur der Nachname
    last = words[0];
  } else {
    if (!first && !(m && words.length === 1)) first = words[0] ?? "";
    if (!last && words.length >= 2) {
      // Nachname = letztes Wort samt Namenszusatz („von Schneider“)
      let i = words.length - 1;
      while (i > 1 && PARTICLES.has(words[i - 1].toLowerCase())) i--;
      last = words.slice(i).join(" ");
    }
  }
  if (first && last && first === last) first = "";
  // Eindeutiger Vorname → Herr/Frau (Ole, 16.11.2026), außer die Anrede wurde bewusst offen gelassen
  if (!salutation && !anredeBewusstOffen(k?.salutation)) salutation = anredeAusVorname(first);
  return { first, last, salutation };
}

/**
 * Name, mit dem angesprochen wird (ohne Grußwort): Du → Vorname; Sie → „Frau Schneider“,
 * ohne bekannte Anrede „Julia Schneider“. null, wenn so nicht angesprochen werden kann
 * (Du ohne Vornamen, Sie ohne Nachnamen).
 */
export function anredeName(an: Ansprache, k: AnredeKontakt | null | undefined): string | null {
  const p = kontaktParts(k);
  if (an === "du") return p.first || null;
  if (!p.last) return null;
  if (p.salutation) return `${p.salutation} ${p.last}`;
  return p.first ? `${p.first} ${p.last}` : null;
}

/** Grußwort der Anrede-Zeile. */
export function grusswort(an: Ansprache): string {
  return an === "du" ? "Hallo" : "Guten Tag";
}

/**
 * Anrede-Zeile mit Komma, zentral für alle Texte an Leads und Kunden:
 * „Hallo Julia,“ · „Guten Tag Frau Schneider,“ · „Guten Tag Julia Schneider,“ · „Guten Tag,“.
 */
export function anredeZeile(an: Ansprache, k: AnredeKontakt | null | undefined): string {
  const name = anredeName(an, k);
  return name ? `${grusswort(an)} ${name},` : `${grusswort(an)},`;
}

/** Wie anredeZeile, nur aus einem ganzen Namen (ohne bekannte Anrede). Ohne Komma. */
export function begruessung(ansprache: Ansprache, name: string | null | undefined): string {
  return anredeZeile(ansprache, { fullName: name }).replace(/,$/, "");
}
