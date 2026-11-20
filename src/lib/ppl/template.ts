// Lead-Mail nach Vorlage (für Systeme, die die Mail auslesen, z. B. die
// „Feld: Wert“-Mail an Heinrich von Kleist). {platzhalter} → Wert; Zeilen
// ohne Wert entfallen.

import { formatPhone } from "@/lib/format";
import { anredeAusVorname } from "@/lib/ppl/anrede";

export type TemplateLead = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  answers: { label: string; value: string }[];
  /** Einwilligungsnachweis (L3): Platzhalter {einwilligung}, {einwilligung_zeitpunkt}, {einwilligung_fassung}, {einwilligung_kanaele} */
  consent?: { text: string; at: string; version: string; kanaele: string[] } | null;
};

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

const ALIASES: Record<string, string[]> = {
  anrede: ["anrede", "salutation", "geschlecht"],
  strasse: ["strasse", "straße", "street", "adresse", "strasseundhausnummer"],
  plz: ["plz", "postleitzahl", "zip", "zipcode", "postalcode"],
  ort: ["ort", "stadt", "city", "wohnort"],
  geburtsdatum: ["geburtsdatum", "geburtstag", "birthday", "dateofbirth"],
  berufsstatus: ["berufsstatus", "berufsgruppe", "beruf", "situation", "tatigkeit", "taetigkeit"],
  versicherer: ["woversichert", "aktuelleversicherung", "versicherung", "gesellschaft", "welchepkv", "aktuellegesellschaft"],
  versicherungsart: ["wieversichert", "gesetzlichoderprivat", "versicherungsart", "artderversicherung"],
  beitrag: ["monatsbeitrag", "beitrag", "aktuellerbeitrag", "monatlicherbeitrag"],
};

export function templateValues(l: TemplateLead): Record<string, string> {
  const byLabel = new Map(l.answers.map((a) => [norm(a.label), a.value]));
  const [first, ...rest] = (l.name ?? "").trim().split(/\s+/);
  const v: Record<string, string> = {
    id: l.id,
    name: l.name ?? "",
    vorname: byLabel.get("vorname") ?? first ?? "",
    nachname: byLabel.get("nachname") ?? rest.join(" "),
    email: l.email ?? "",
    telefon: l.phone ? formatPhone(l.phone) : "",
  };
  for (const [key, aliases] of Object.entries(ALIASES)) {
    const hit = aliases.map((a) => byLabel.get(norm(a))).find(Boolean);
    if (hit) v[key] = hit;
  }
  if (l.consent) {
    v.einwilligung = l.consent.text;
    v.einwilligung_zeitpunkt = l.consent.at;
    v.einwilligung_fassung = l.consent.version;
    v.einwilligung_kanaele = l.consent.kanaele.join(", ");
  }
  // Kennung bei der Leadbörse: steht nicht im Code, sondern in der Variable PPL_HVK_BROKERCODE
  if (process.env.PPL_HVK_BROKERCODE?.trim()) v.brokercode = process.env.PPL_HVK_BROKERCODE.trim();
  for (const [k, val] of byLabel) if (!(k in v)) v[k] = val;
  return v;
}

/**
 * Zeilen, deren Platzhalter alle leer sind, entfallen (wie im bisherigen
 * Zap). Feste Werte (z. B. „Strasse: Unbekannt“) schreibt man direkt in die Vorlage.
 */
export function renderTemplate(template: string, l: TemplateLead): string {
  const v = templateValues(l);
  // Leadbörse (HvK): Anrede wie im alten Zap aus dem Vornamen, falls der Funnel keine liefert (nur Vorlagen-Mail)
  if (!v.anrede) v.anrede = anredeAusVorname(v.vorname);
  const get = (key: string) => (v[key.trim().toLowerCase()] ?? v[norm(key)] ?? "").trim();
  return template
    .split("\n")
    .flatMap((line) => {
      const keys = [...line.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]);
      if (keys.length && keys.every((k) => !get(k))) return [];
      return [line.replace(/\{([^{}]+)\}/g, (_, k: string) => get(k))];
    })
    .join("\n");
}
