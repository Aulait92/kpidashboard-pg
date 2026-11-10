// Lead-Mail nach Vorlage (für Systeme, die die Mail auslesen, z. B. die
// „Feld: Wert“-Mail an Heinrich von Kleist). {platzhalter} → Wert; Zeilen
// ohne Wert entfallen.

import { formatPhone } from "@/lib/format";

export type TemplateLead = { id: string; name: string | null; phone: string | null; email: string | null; answers: { label: string; value: string }[] };

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
  for (const [k, val] of byLabel) if (!(k in v)) v[k] = val;
  return v;
}

/**
 * Zeilen, deren Platzhalter alle leer sind, entfallen (wie im bisherigen
 * Zap). Feste Werte (z. B. „Strasse: Unbekannt“) schreibt man direkt in die Vorlage.
 */
export function renderTemplate(template: string, l: TemplateLead): string {
  const v = templateValues(l);
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
