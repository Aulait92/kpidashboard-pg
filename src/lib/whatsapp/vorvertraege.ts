// Bestehende Verträge des Leads (Komplettcheck, Ole 17.11.2026): Sagt der Lead nach der Buchung „Ja, gern“ zum
// Komplettcheck, fragt der Assistent, welche Versicherungen er schon hat. Die freie Antwort wird tolerant in eine
// Liste je Sparte gebracht (Sparte, Gesellschaft falls genannt, für wen falls genannt) und am Lead gespeichert
// (Lead.vorvertraege). Anzeige in der Terminvorbereitung und im Kontakt als „Bestehende Verträge“ mit
// „noch nicht genannt: …“ gegenüber den gängigen Sparten der Lebenssituation (neutral, keine Empfehlung).
// Keine Gesundheitsangaben: gespeichert werden nur Sparte, Gesellschaft und Person. Rein, ohne Datenbank.

/** Sparten in der Reihenfolge der Anzeige. */
export const VERTRAG_SPARTEN = [
  "Haftpflicht",
  "Hausrat",
  "Wohngebäude",
  "Rechtsschutz",
  "Unfall",
  "Berufsunfähigkeit",
  "Risikoleben",
  "Altersvorsorge",
  "Kfz",
  "Krankenzusatz",
  "Zahnzusatz",
  "Private Krankenversicherung",
  "Pflege",
  "Tierhalterhaftpflicht",
  "Tierkranken",
  "Sonstige",
] as const;
export type VertragSparte = (typeof VERTRAG_SPARTEN)[number];

export type Vorvertrag = { sparte: VertragSparte; gesellschaft?: string | null; fuer?: string | null };

/** Gespeichert am Lead (Lead.vorvertraege). keine = Lead sagt, er habe keine; liste leer und keine false = nichts erkannt. */
export type Vorvertraege = { at: string; liste: Vorvertrag[]; keine?: boolean };

// Erkennung je Sparte (Reihenfolge wichtig: Tierhalter vor Haftpflicht, Zahn vor Kranken)
const MUSTER: [RegExp, VertragSparte][] = [
  [/tierhalter|hundehaftpflicht|pferdehaftpflicht|hunde-?haftpflicht/i, "Tierhalterhaftpflicht"],
  [/tierkranken|tier-?op|katzenversicherung|hundekranken|tierversicherung/i, "Tierkranken"],
  [/zahn/i, "Zahnzusatz"],
  [/\bpkv\b|private?n? kranken|krankenvoll|privat krankenversichert/i, "Private Krankenversicherung"],
  [/kranken-?zusatz|zusatzversicherung|krankenhauszusatz|brille|heilpraktiker|ambulant|station(ä|a)r/i, "Krankenzusatz"],
  [/pflege/i, "Pflege"],
  [/haftpflicht|\bphv\b/i, "Haftpflicht"],
  [/hausrat/i, "Hausrat"],
  [/wohngeb(ä|a)ude|geb(ä|a)udeversicherung|feuerversicherung/i, "Wohngebäude"],
  [/rechtsschutz/i, "Rechtsschutz"],
  [/unfall/i, "Unfall"],
  [/berufsunf(ä|a)hig|\bbu\b|erwerbsunf(ä|a)hig|grundf(ä|a)higkeit/i, "Berufsunfähigkeit"],
  [/risikoleben|lebensversicherung|\brlv\b|sterbegeld/i, "Risikoleben"],
  [/altersvorsorge|rente|riester|r(ü|u)rup|bav\b|betriebliche|pensionskasse|direktversicherung|fondspolice|bauspar|sparplan/i, "Altersvorsorge"],
  [/\bkfz\b|\bauto|kasko|motorrad|fahrzeug|\bpkw\b/i, "Kfz"],
];

/** Sparte aus einem freien Wort („Privathaftpflicht“, „BU“, „Autoversicherung“); null = nicht erkannt. */
export function sparteAus(text: string | null | undefined): VertragSparte | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const exakt = VERTRAG_SPARTEN.find((s) => s.toLowerCase() === t.toLowerCase());
  if (exakt) return exakt;
  return MUSTER.find(([re]) => re.test(t))?.[1] ?? null;
}

const kurz = (s: unknown, max = 40): string | null => {
  if (typeof s !== "string") return null;
  const t = s.replace(/\s+/g, " ").trim().replace(/[.,;:!]+$/, "");
  if (!t || /^(-|keine?|unbekannt|k\.? ?a\.?|null|n\/a)$/i.test(t)) return null;
  return t.slice(0, max);
};

/**
 * Liste aus der KI-Extraktion (oder von Hand) aufräumen: Sparte auf die feste Liste abbilden, Gesellschaft und Person
 * kürzen, doppelte (gleiche Sparte, Gesellschaft und Person) zusammenfassen. Alles andere (z. B. Gesundheit) fällt weg.
 */
export function normalisiereVertraege(raw: unknown): Vorvertrag[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: Vorvertrag[] = [];
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const sparte = sparteAus(typeof o.sparte === "string" ? o.sparte : null);
    if (!sparte) continue;
    const v: Vorvertrag = { sparte, gesellschaft: kurz(o.gesellschaft), fuer: kurz(o.fuer ?? o.fuerWen ?? o.person, 30) };
    if (!out.some((y) => y.sparte === v.sparte && (y.gesellschaft ?? "") === (v.gesellschaft ?? "") && (y.fuer ?? "") === (v.fuer ?? ""))) out.push(v);
  }
  return out.sort((x, y) => VERTRAG_SPARTEN.indexOf(x.sparte) - VERTRAG_SPARTEN.indexOf(y.sparte));
}

/** „keine“, „noch nichts“, „gar keine Versicherungen“ … */
export function sagtKeine(text: string | null | undefined): boolean {
  const t = (text ?? "").toLowerCase().trim();
  return /^(keine?|nichts|noch nichts|gar keine?|bisher keine?|noch keine?|nein)\b/.test(t) && !MUSTER.some(([re]) => re.test(t));
}

/**
 * Rückfall ohne KI (Fehler beim Abruf): Sparten im Text erkennen, Gesellschaft nur, wenn sie direkt mit „bei“
 * dahinter steht („Haftpflicht bei der HUK“). Tolerant, lieber weniger als falsch.
 */
export function vertraegeAusText(text: string | null | undefined): Vorvertrag[] {
  const teile = (text ?? "").split(/[,;\n]|\bund\b|\bsowie\b|\+/i).map((s) => s.trim()).filter(Boolean);
  const out: { sparte: string; gesellschaft: string | null }[] = [];
  for (const teil of teile) {
    const sparte = sparteAus(teil);
    if (!sparte) continue;
    const ges = /\b(?:bei|von)\s+(?:der|dem|den|die)?\s*([A-ZÄÖÜ][\w&+.\-ÄÖÜäöüß ]{1,30})/.exec(teil)?.[1] ?? null;
    out.push({ sparte, gesellschaft: ges });
  }
  return normalisiereVertraege(out);
}

/** Gängige Sparten je Lebenssituation (neutral, für „noch nicht genannt“). */
export function gaengigeSparten(lebenssituation: string | null | undefined): VertragSparte[] {
  const t = (lebenssituation ?? "").toLowerCase();
  const basis: VertragSparte[] = ["Haftpflicht", "Hausrat", "Berufsunfähigkeit", "Altersvorsorge"];
  if (/kind|familie/.test(t)) return [...basis, "Unfall", "Risikoleben"];
  if (/paar|partner|verheiratet|zu zweit|ehe/.test(t)) return [...basis, "Risikoleben"];
  return basis;
}

/** Gängige Sparten, die der Lead nicht genannt hat (nur wenn er überhaupt etwas angegeben hat). */
export function nochNichtGenannt(v: Vorvertraege | null | undefined, lebenssituation: string | null | undefined): VertragSparte[] {
  if (!v || (!v.liste.length && !v.keine)) return [];
  const da = new Set(v.liste.map((x) => x.sparte));
  return gaengigeSparten(lebenssituation).filter((s) => !da.has(s));
}

/** Gespeicherten Wert lesen (defensiv). */
export function vorvertraegeAus(raw: unknown): Vorvertraege | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return { at: typeof o.at === "string" ? o.at : "", liste: normalisiereVertraege(o.liste), ...(o.keine === true ? { keine: true } : {}) };
}

/** Produktnamen der App, die sparteAus nicht kennt (Abschluss-Sparten aus lib/provision.ts). */
const ABSCHLUSS_ALIAS: [RegExp, VertragSparte[]][] = [
  [/privatschutz/i, ["Haftpflicht", "Hausrat"]],
  [/\btkv\b|katze|hund|pferd/i, ["Tierkranken"]],
  [/\bbu\b/i, ["Berufsunfähigkeit"]],
];

/**
 * Bestehende Verträge, die der neue Abschluss ersetzt (Paket M6, Aufgabe „Alten Vertrag kündigen“): gleiche Sparte wie
 * eines der Produkte des Abschlusses (Produkt des Leads, Sparte des Vertrags, gewählte Angebote). Rein.
 */
export function zuErsetzendeVertraege(v: Vorvertraege | null | undefined, produkte: (string | null | undefined)[]): Vorvertrag[] {
  if (!v?.liste.length) return [];
  const sparten = new Set<VertragSparte>();
  for (const p of produkte) {
    const t = (p ?? "").trim();
    if (!t) continue;
    const s = sparteAus(t);
    if (s && s !== "Sonstige") sparten.add(s);
    for (const [re, liste] of ABSCHLUSS_ALIAS) if (re.test(t)) liste.forEach((x) => sparten.add(x));
  }
  return v.liste.filter((x) => sparten.has(x.sparte));
}

/** Eine Zeile je Vertrag: „Haftpflicht (HUK, für die Familie)“. */
export function vertragZeile(v: Vorvertrag): string {
  const zusatz = [v.gesellschaft, v.fuer ? `für ${v.fuer.replace(/^für\s+/i, "")}` : null].filter(Boolean).join(", ");
  return zusatz ? `${v.sparte} (${zusatz})` : v.sparte;
}

/** Werkzeug-Schema für die KI-Extraktion (Anthropic tool input_schema). */
export const VORVERTRAEGE_SCHEMA = {
  type: "object",
  properties: {
    keine: { type: "boolean", description: "true, wenn der Lead sagt, er habe keine Versicherungen." },
    vertraege: {
      type: "array",
      description: "Je genannter Versicherung ein Eintrag. Nur Sparte, Gesellschaft und Person, nie Gesundheitsangaben, Beträge oder Tarifdetails.",
      items: {
        type: "object",
        properties: {
          sparte: { type: "string", enum: [...VERTRAG_SPARTEN] },
          gesellschaft: { type: "string", description: "Versicherer, nur falls genannt." },
          fuer: { type: "string", description: "Für wen, nur falls genannt (z. B. „Kinder“, „Partnerin“)." },
        },
        required: ["sparte"],
      },
    },
  },
} as const;
