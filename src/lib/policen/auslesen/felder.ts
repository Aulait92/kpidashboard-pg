// Policen auslesen: festes Schema (Rechtsprüfung K4). Nur Vertragsfelder, Zahlen und Daten typisiert, kein Freitext,
// kein „Bemerkungen“-Feld. KEINE Felder für Gesundheitsangaben (Zuschläge, Ausschlüsse, Diagnosen, Vorerkrankungen,
// Größe/Gewicht, Raucherstatus). Was die KI sonst noch liefert, verwirft bereinige(): unbekannte Felder, Felder einer
// anderen Sparte, falsche Typen und Werte mit Gesundheitsbegriffen. Rein, ohne Datenbank, testbar.

// Ole, 19.11.2026: „alle möglichen Sparten müssen auslesbar sein“: Unfall, Tier, Reise, Krankenzusatz, Pflege und
// „Sonstige“ (jede andere Police, nur die Grunddaten wie Versicherer, Tarif, Beitrag, Laufzeit, Kündigung)
export const AUSLESEN_SPARTEN = [
  "haftpflicht",
  "hausrat",
  "kfz",
  "wohngebaeude",
  "rechtsschutz",
  "unfall",
  "tier",
  "reise",
  "krankenzusatz",
  "pflege",
  "pkv",
  "bu",
  "leben",
  "sonstige",
] as const;
export type AuslesenSparte = (typeof AUSLESEN_SPARTEN)[number];
export const isAuslesenSparte = (v: unknown): v is AuslesenSparte => typeof v === "string" && (AUSLESEN_SPARTEN as readonly string[]).includes(v);
/**
 * Sparten, deren Unterlagen regelmäßig Gesundheitsangaben enthalten (Rechtsprüfung K2: nur mit Nachweis „keine
 * Speicherung“ und Einwilligung mit Gesundheitsangaben). Unfall und Pflege wie in lib/policen/regeln.ts (§ 203 StGB:
 * Kranken-, Unfall-, Lebensversicherung), Krankenzusatz (Zahn, Krankenhaus) wie Kranken.
 */
export const GESUNDHEITS_SPARTEN: readonly AuslesenSparte[] = ["pkv", "bu", "leben", "unfall", "pflege", "krankenzusatz"];

export const SPARTE_LABEL: Record<AuslesenSparte, string> = {
  haftpflicht: "Haftpflicht",
  hausrat: "Hausrat",
  kfz: "Kfz",
  wohngebaeude: "Wohngebäude",
  rechtsschutz: "Rechtsschutz",
  unfall: "Unfall",
  tier: "Tier",
  reise: "Reise",
  krankenzusatz: "Krankenzusatz",
  pflege: "Pflege",
  pkv: "Private Krankenversicherung",
  bu: "Berufsunfähigkeit",
  leben: "Leben/Rente",
  sonstige: "Sonstige",
};

export type FeldTyp = "text" | "betrag" | "zahl" | "ganzzahl" | "datum" | "janein" | "auswahl" | "liste";
type Option = { wert: string; label: string };
export type Feld = {
  key: string;
  label: string;
  typ: FeldTyp;
  /** null = alle Sparten */
  sparten: readonly AuslesenSparte[] | null;
  beschreibung: string;
  einheit?: string;
  optionen?: readonly Option[];
};

export const ZAHLWEISEN: readonly Option[] = [
  { wert: "monatlich", label: "monatlich" },
  { wert: "vierteljaehrlich", label: "vierteljährlich" },
  { wert: "halbjaehrlich", label: "halbjährlich" },
  { wert: "jaehrlich", label: "jährlich" },
];
const RATEN: Record<string, number> = { monatlich: 1, vierteljaehrlich: 3, halbjaehrlich: 6, jaehrlich: 12 };

export const FELDER: readonly Feld[] = [
  { key: "versicherer", label: "Versicherer", typ: "text", sparten: null, beschreibung: "Name des Versicherers, z. B. HUK-Coburg" },
  { key: "tarifname", label: "Tarif", typ: "text", sparten: null, beschreibung: "Tarif- bzw. Produktname, z. B. Comfort Plus" },
  { key: "versicherungsnummer", label: "Vers.-Nr.", typ: "text", sparten: null, beschreibung: "nur die letzten 4 Zeichen der Versicherungsscheinnummer" },
  { key: "beitrag", label: "Beitrag", typ: "betrag", sparten: null, einheit: "€", beschreibung: "Gesamtbeitrag in Euro je Zahlweise inkl. Versicherungsteuer" },
  { key: "zahlweise", label: "Zahlweise", typ: "auswahl", sparten: null, optionen: ZAHLWEISEN, beschreibung: "Zahlweise des Beitrags" },
  { key: "beginn", label: "Beginn", typ: "datum", sparten: null, beschreibung: "Versicherungsbeginn" },
  { key: "ablauf", label: "Ablauf", typ: "datum", sparten: null, beschreibung: "Ablauf bzw. Hauptfälligkeit des Vertrags" },
  { key: "kuendigungsfrist_monate", label: "Kündigungsfrist", typ: "ganzzahl", sparten: null, einheit: "Monate", beschreibung: "Kündigungsfrist in Monaten vor Ablauf" },
  { key: "naechster_kuendigungstermin", label: "Kündbar zum", typ: "datum", sparten: null, beschreibung: "nächstes Datum, zu dem der Vertrag gekündigt werden kann, nur wenn im Dokument genannt" },
  { key: "art", label: "Art der Versicherung", typ: "text", sparten: ["sonstige"], beschreibung: "Art der Versicherung laut Dokument, z. B. Glasversicherung, Handyversicherung, Photovoltaik" },
  { key: "selbstbeteiligung", label: "Selbstbeteiligung", typ: "betrag", sparten: ["haftpflicht", "hausrat", "kfz", "wohngebaeude", "rechtsschutz", "tier", "reise", "sonstige"], einheit: "€", beschreibung: "Selbstbeteiligung je Schaden in Euro, 0 wenn keine" },
  // Hausrat
  { key: "versicherungssumme", label: "Versicherungssumme", typ: "betrag", sparten: ["hausrat", "wohngebaeude", "leben", "reise", "sonstige"], einheit: "€", beschreibung: "Versicherungssumme in Euro" },
  { key: "wohnflaeche", label: "Wohnfläche", typ: "zahl", sparten: ["hausrat"], einheit: "m²", beschreibung: "versicherte Wohnfläche in m²" },
  { key: "unterversicherungsverzicht", label: "Unterversicherungsverzicht", typ: "janein", sparten: ["hausrat"], beschreibung: "Unterversicherungsverzicht vereinbart" },
  { key: "elementar", label: "Elementarschäden", typ: "janein", sparten: ["hausrat", "wohngebaeude"], beschreibung: "Elementarschäden (z. B. Überschwemmung, Starkregen) mitversichert" },
  { key: "fahrrad", label: "Fahrraddiebstahl", typ: "janein", sparten: ["hausrat"], beschreibung: "Fahrraddiebstahl mitversichert" },
  // Haftpflicht
  { key: "deckungssumme", label: "Deckungssumme", typ: "betrag", sparten: ["haftpflicht", "tier"], einheit: "€", beschreibung: "Deckungssumme für Personen- und Sachschäden in Euro (bei Tier nur Tierhalterhaftpflicht)" },
  {
    key: "umfang",
    label: "Wer ist versichert",
    typ: "auswahl",
    sparten: ["haftpflicht"],
    optionen: [
      { wert: "single", label: "Single" },
      { wert: "paar", label: "Paar" },
      { wert: "familie", label: "Familie" },
      { wert: "alleinerziehend", label: "Alleinerziehend" },
    ],
    beschreibung: "Single-, Paar-, Familien- oder Alleinerziehendentarif",
  },
  { key: "schluesselverlust", label: "Schlüsselverlust", typ: "janein", sparten: ["haftpflicht"], beschreibung: "Verlust fremder Schlüssel mitversichert" },
  { key: "forderungsausfall", label: "Forderungsausfall", typ: "janein", sparten: ["haftpflicht"], beschreibung: "Forderungsausfalldeckung vereinbart" },
  // Kfz
  { key: "sf_haftpflicht", label: "SF-Klasse Haftpflicht", typ: "text", sparten: ["kfz"], beschreibung: "Schadenfreiheitsklasse Haftpflicht, z. B. SF 12" },
  { key: "sf_kasko", label: "SF-Klasse Kasko", typ: "text", sparten: ["kfz"], beschreibung: "Schadenfreiheitsklasse Vollkasko, z. B. SF 8" },
  {
    key: "kasko",
    label: "Kasko",
    typ: "auswahl",
    sparten: ["kfz"],
    optionen: [
      { wert: "keine", label: "keine" },
      { wert: "teilkasko", label: "Teilkasko" },
      { wert: "vollkasko", label: "Vollkasko" },
    ],
    beschreibung: "Art der Kaskoversicherung",
  },
  { key: "fahrleistung", label: "Fahrleistung", typ: "ganzzahl", sparten: ["kfz"], einheit: "km/Jahr", beschreibung: "jährliche Fahrleistung in km" },
  { key: "werkstattbindung", label: "Werkstattbindung", typ: "janein", sparten: ["kfz"], beschreibung: "Werkstattbindung vereinbart" },
  // Wohngebäude
  { key: "wert_1914", label: "Wert 1914", typ: "betrag", sparten: ["wohngebaeude"], einheit: "Mark", beschreibung: "Versicherungssumme 1914 in Mark" },
  // Rechtsschutz
  {
    key: "bausteine",
    label: "Bausteine",
    typ: "liste",
    sparten: ["rechtsschutz"],
    optionen: [
      { wert: "privat", label: "Privat" },
      { wert: "beruf", label: "Beruf" },
      { wert: "verkehr", label: "Verkehr" },
      { wert: "wohnen", label: "Wohnen (Mieter/Eigentümer)" },
      { wert: "vermieter", label: "Vermieter" },
    ],
    beschreibung: "versicherte Lebensbereiche",
  },
  // PKV (nur Vertragsdaten, keine Gesundheitsangaben)
  { key: "selbstbehalt", label: "Selbstbehalt", typ: "betrag", sparten: ["pkv"], einheit: "€/Jahr", beschreibung: "jährlicher Selbstbehalt in Euro" },
  { key: "krankentagegeld", label: "Krankentagegeld", typ: "betrag", sparten: ["pkv"], einheit: "€/Tag", beschreibung: "versichertes Krankentagegeld in Euro je Tag, 0 wenn keins" },
  // BU
  { key: "monatsrente", label: "BU-Rente", typ: "betrag", sparten: ["bu"], einheit: "€/Monat", beschreibung: "versicherte monatliche BU-Rente in Euro" },
  { key: "endalter", label: "Endalter", typ: "ganzzahl", sparten: ["bu", "leben"], beschreibung: "Endalter bzw. Alter bei Ablauf" },
  { key: "dynamik", label: "Dynamik", typ: "zahl", sparten: ["bu"], einheit: "%", beschreibung: "jährliche Beitragsdynamik in Prozent, 0 wenn keine" },
  // Leben/Rente
  { key: "rente_monatlich", label: "Rente", typ: "betrag", sparten: ["leben"], einheit: "€/Monat", beschreibung: "garantierte bzw. versicherte monatliche Rente in Euro" },
  // Unfall (nur Leistungen des Vertrags, keine Gesundheitsangaben)
  { key: "invaliditaet_grundsumme", label: "Invalidität Grundsumme", typ: "betrag", sparten: ["unfall"], einheit: "€", beschreibung: "Grundsumme bei Invalidität in Euro" },
  { key: "progression", label: "Progression", typ: "ganzzahl", sparten: ["unfall"], einheit: "%", beschreibung: "Progression in Prozent, z. B. 225, 350 oder 500" },
  { key: "unfallrente", label: "Unfallrente", typ: "betrag", sparten: ["unfall"], einheit: "€/Monat", beschreibung: "monatliche Unfallrente in Euro, 0 wenn keine" },
  { key: "todesfallsumme", label: "Todesfallsumme", typ: "betrag", sparten: ["unfall"], einheit: "€", beschreibung: "Leistung im Todesfall in Euro, 0 wenn keine" },
  { key: "verbesserte_gliedertaxe", label: "Verbesserte Gliedertaxe", typ: "janein", sparten: ["unfall"], beschreibung: "verbesserte Gliedertaxe vereinbart" },
  // Tier
  {
    key: "tierart",
    label: "Tier",
    typ: "auswahl",
    sparten: ["tier"],
    optionen: [
      { wert: "hund", label: "Hund" },
      { wert: "katze", label: "Katze" },
      { wert: "pferd", label: "Pferd" },
      { wert: "anderes", label: "anderes Tier" },
    ],
    beschreibung: "versichertes Tier",
  },
  {
    key: "tier_umfang",
    label: "Versichert",
    typ: "liste",
    sparten: ["tier"],
    optionen: [
      { wert: "op", label: "OP-Kosten" },
      { wert: "kranken", label: "Tierarztkosten" },
      { wert: "haftpflicht", label: "Tierhalterhaftpflicht" },
    ],
    beschreibung: "was versichert ist: OP-Kosten, Tierarztkosten (Vollschutz) oder Tierhalterhaftpflicht",
  },
  { key: "jahreshoechstleistung", label: "Jahreshöchstleistung", typ: "betrag", sparten: ["tier", "krankenzusatz"], einheit: "€/Jahr", beschreibung: "höchste Erstattung je Versicherungsjahr in Euro, 0 wenn unbegrenzt" },
  { key: "erstattung_prozent", label: "Erstattung", typ: "ganzzahl", sparten: ["tier", "krankenzusatz"], einheit: "%", beschreibung: "Erstattungssatz in Prozent (bei Zahn: für Zahnersatz)" },
  // Reise
  {
    key: "reise_umfang",
    label: "Versichert",
    typ: "liste",
    sparten: ["reise"],
    optionen: [
      { wert: "ruecktritt", label: "Reiserücktritt" },
      { wert: "abbruch", label: "Reiseabbruch" },
      { wert: "auslandskranken", label: "Auslandsreise-Krankenversicherung" },
      { wert: "gepaeck", label: "Reisegepäck" },
    ],
    beschreibung: "versicherte Bausteine der Reiseversicherung",
  },
  { key: "jahresvertrag", label: "Jahresvertrag", typ: "janein", sparten: ["reise"], beschreibung: "Jahresvertrag (alle Reisen im Jahr) statt Einzelreise" },
  // Krankenzusatz (nur Leistungen, keine Gesundheitsangaben)
  {
    key: "zusatz_bausteine",
    label: "Bausteine",
    typ: "liste",
    sparten: ["krankenzusatz"],
    optionen: [
      { wert: "zahnersatz", label: "Zahnersatz" },
      { wert: "zahnbehandlung", label: "Zahnbehandlung" },
      { wert: "prophylaxe", label: "Prophylaxe" },
      { wert: "stationaer", label: "Krankenhaus (Einbett/Chefarzt)" },
      { wert: "ambulant", label: "Ambulant, Heilpraktiker" },
      { wert: "brille", label: "Brille, Kontaktlinsen" },
    ],
    beschreibung: "versicherte Leistungsbausteine",
  },
  // Pflege
  { key: "pflegegeld_monat", label: "Pflegegeld (Pflegegrad 5)", typ: "betrag", sparten: ["pflege"], einheit: "€/Monat", beschreibung: "monatliches Pflegegeld bzw. Pflegetagegeld × 30 in Euro bei Pflegegrad 5" },
];

const FELD = new Map(FELDER.map((f) => [f.key, f]));
export const feld = (key: string) => FELD.get(key) ?? null;
/** Felder einer Sparte in fester Reihenfolge. */
export const felderFuer = (s: AuslesenSparte) => FELDER.filter((f) => !f.sparten || f.sparten.includes(s));

// ─── Gesundheitsbegriffe (Rechtsprüfung K4) ─────────────────────────────────
// Ein Wert, der einen dieser Begriffe enthält, wird verworfen (auch in Tarifnamen: im Zweifel weg).
const GESUNDHEIT_WERT_RE =
  /zuschlag|ausschlu(ss|ß)|ausgeschlossen|diagnose|vorerkrank|erkrank|krankheit|befund|therapie|behandlung|medikament|allergi|gewicht|k(ö|oe)rpergr(ö|oe)(ß|ss)e|\bbmi\b|\bicd\b|psych|depress|r(ü|ue)cken|wirbels(ä|ae)ule|bandscheib|herz|diabet|blutdruck|krebs|tumor|operation|schwanger|raucher|gesundheit|leiden|anamnese|chronisch|attest|arzt|klinik|reha|sucht|alkohol|hiv|\bgdb\b|schwerbehind|behinderung/i;

export function hatGesundheitsbegriff(v: string): boolean {
  return GESUNDHEIT_WERT_RE.test(v);
}

// ─── JSON-Schema für die KI (strict) ────────────────────────────────────────

function feldSchema(f: Feld): Record<string, unknown> {
  const d = { description: f.beschreibung };
  switch (f.typ) {
    case "text":
      return { type: ["string", "null"], ...d };
    case "betrag":
    case "zahl":
      return { type: ["number", "null"], ...d };
    case "ganzzahl":
      return { type: ["integer", "null"], ...d };
    case "datum":
      return { type: ["string", "null"], description: `${f.beschreibung}, Format JJJJ-MM-TT` };
    case "janein":
      return { type: ["boolean", "null"], description: `${f.beschreibung}; null, wenn das Dokument es nicht eindeutig sagt` };
    case "auswahl":
      return { type: ["string", "null"], enum: [...(f.optionen ?? []).map((o) => o.wert), null], ...d };
    case "liste":
      return { type: ["array", "null"], items: { type: "string", enum: (f.optionen ?? []).map((o) => o.wert) }, ...d };
  }
}

/** Schema der Antwort: Sparte, Felder (alle Pflicht, null wenn nicht im Dokument) und unsichere Felder. */
export function auslesenSchema(): Record<string, unknown> {
  const props = Object.fromEntries(FELDER.map((f) => [f.key, feldSchema(f)]));
  return {
    type: "object",
    properties: {
      sparte: { type: "string", enum: [...AUSLESEN_SPARTEN, "andere"], description: "Sparte des Vertrags laut Dokument; sonstige für jede andere Versicherung; andere, wenn es keine Versicherungspolice ist" },
      felder: { type: "object", properties: props, required: FELDER.map((f) => f.key), additionalProperties: false },
      unsicher: { type: "array", items: { type: "string", enum: FELDER.map((f) => f.key) }, description: "Felder, deren Wert du nicht sicher ablesen konntest" },
    },
    required: ["sparte", "felder", "unsicher"],
    additionalProperties: false,
  };
}

// ─── Nachfilter ─────────────────────────────────────────────────────────────

export type FeldStatus = "ok" | "pruefen" | "korrigiert";
export type FeldWert = string | number | boolean | string[];
export type Felder = Record<string, { w: FeldWert; s: FeldStatus }>;

/** Datum aus JJJJ-MM-TT oder TT.MM.JJJJ, nur plausible Jahre. */
export function normDatum(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  let iso: string | null = m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  if (!iso) {
    m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
    if (m) iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return null;
  const y = d.getUTCFullYear();
  return y >= 1950 && y <= 2100 ? iso : null;
}

/** Versicherungsnummer: nur die letzten 4 Zeichen (Buchstaben/Ziffern), maskiert. */
export function maskiereNummer(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const z = v.replace(/[^0-9a-z]/gi, "");
  if (z.length < 4) return null;
  return `…${z.slice(-4)}`;
}

const SF_RE = /^(?:SF\s*)?(\d{1,2}(?:\/2)?|½|S|M|0)$/i;
function normSf(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = SF_RE.exec(v.trim());
  if (!m) return null;
  const k = m[1].toUpperCase();
  return /^(S|M|0)$/.test(k) ? k : `SF ${k}`;
}

/** Einen Wert nach Feldtyp prüfen; null = verwerfen. */
export function pruefeWert(f: Feld, v: unknown): FeldWert | null {
  if (v === null || v === undefined) return null;
  switch (f.typ) {
    case "text": {
      if (typeof v !== "string") return null;
      if (f.key === "versicherungsnummer") return maskiereNummer(v);
      if (f.key === "sf_haftpflicht" || f.key === "sf_kasko") return normSf(v);
      const t = v.replace(/\s+/g, " ").trim().slice(0, 80);
      if (!t || hatGesundheitsbegriff(t)) return null;
      return t;
    }
    case "betrag":
    case "zahl": {
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/\./g, "").replace(",", ".")) : NaN;
      if (!Number.isFinite(n) || n < 0 || n > 1e9) return null;
      return Math.round(n * 100) / 100;
    }
    case "ganzzahl": {
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      if (!Number.isFinite(n) || n < 0 || n > 1e7) return null;
      return Math.round(n);
    }
    case "datum":
      return normDatum(v);
    case "janein":
      return typeof v === "boolean" ? v : null;
    case "auswahl":
      return typeof v === "string" && (f.optionen ?? []).some((o) => o.wert === v) ? v : null;
    case "liste": {
      if (!Array.isArray(v)) return null;
      const erlaubt = new Set((f.optionen ?? []).map((o) => o.wert));
      const l = [...new Set(v.filter((x): x is string => typeof x === "string" && erlaubt.has(x)))];
      return l.length ? l : null;
    }
  }
}

export type Bereinigt = { sparte: AuslesenSparte | "andere" | null; felder: Felder; verworfen: number };

/**
 * KI-Antwort auf die Whitelist der Sparte reduzieren. Unbekannte Felder, Felder anderer Sparten, falsche Typen und
 * Werte mit Gesundheitsbegriffen fallen weg (verworfen zählt sie, ohne Inhalt). Unsichere Felder: „pruefen“.
 */
export function bereinige(roh: unknown, sparte: AuslesenSparte): Bereinigt {
  const o = roh && typeof roh === "object" && !Array.isArray(roh) ? (roh as Record<string, unknown>) : {};
  const kiSparte = isAuslesenSparte(o.sparte) ? o.sparte : o.sparte === "andere" ? "andere" : null;
  const quelle = o.felder && typeof o.felder === "object" && !Array.isArray(o.felder) ? (o.felder as Record<string, unknown>) : {};
  const unsicher = new Set(Array.isArray(o.unsicher) ? o.unsicher.filter((x): x is string => typeof x === "string") : []);
  const erlaubt = new Set(felderFuer(sparte).map((f) => f.key));
  const felder: Felder = {};
  let verworfen = Object.keys(o).filter((k) => !["sparte", "felder", "unsicher"].includes(k)).length;
  for (const [k, v] of Object.entries(quelle)) {
    const f = feld(k);
    if (!f || !erlaubt.has(k)) {
      if (v !== null && v !== undefined) verworfen++;
      continue;
    }
    const w = pruefeWert(f, v);
    if (w === null) {
      if (v !== null && v !== undefined) verworfen++;
      continue;
    }
    felder[k] = { w, s: unsicher.has(k) ? "pruefen" : "ok" };
  }
  return { sparte: kiSparte, felder, verworfen };
}

/** Korrektur des Vermittlers: Werte prüfen wie die KI-Werte (gleiche Whitelist, gleicher Filter). */
export function korrigiere(alt: Felder, eingaben: Record<string, unknown>, sparte: AuslesenSparte): Felder {
  const erlaubt = new Set(felderFuer(sparte).map((f) => f.key));
  const neu: Felder = {};
  for (const [k, v] of Object.entries(alt)) if (erlaubt.has(k)) neu[k] = v;
  for (const [k, roh] of Object.entries(eingaben)) {
    const f = feld(k);
    if (!f || !erlaubt.has(k)) continue;
    if (roh === null || roh === "") {
      delete neu[k];
      continue;
    }
    const w = pruefeWert(f, roh);
    if (w === null) continue;
    const vorher = alt[k]?.w;
    neu[k] = { w, s: JSON.stringify(vorher) === JSON.stringify(w) && alt[k]?.s !== "pruefen" ? (alt[k]?.s ?? "korrigiert") : "korrigiert" };
  }
  return neu;
}

/** Felder aus der Datenbank (JSON) lesen, nur Whitelist. */
export function felderAus(json: unknown, sparte: AuslesenSparte): Felder {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const erlaubt = new Set(felderFuer(sparte).map((f) => f.key));
  const out: Felder = {};
  for (const [k, x] of Object.entries(json as Record<string, unknown>)) {
    const f = feld(k);
    if (!f || !erlaubt.has(k) || !x || typeof x !== "object") continue;
    const { w, s } = x as { w?: unknown; s?: unknown };
    const wert = pruefeWert(f, w);
    if (wert === null) continue;
    out[k] = { w: wert, s: s === "pruefen" || s === "korrigiert" ? s : "ok" };
  }
  return out;
}

/** Monatsbetrag aus Beitrag und Zahlweise (gerundet auf Cent); null ohne beides. */
export function monatsbetrag(f: Felder): number | null {
  const b = f.beitrag?.w;
  const z = f.zahlweise?.w;
  if (typeof b !== "number" || typeof z !== "string" || !RATEN[z]) return null;
  return Math.round((b / RATEN[z]) * 100) / 100;
}

const euro = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
const tag = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

/** Anzeige eines Werts. */
export function zeigeWert(f: Feld, w: FeldWert): string {
  switch (f.typ) {
    case "betrag":
      return f.einheit === "€" || !f.einheit ? euro(w as number) : f.einheit === "Mark" ? `${new Intl.NumberFormat("de-DE").format(w as number)} Mark` : `${euro(w as number)} ${f.einheit.replace(/^€/, "")}`.replace(/\s+\//, "/");
    case "zahl":
    case "ganzzahl":
      return `${new Intl.NumberFormat("de-DE").format(w as number)}${f.einheit ? ` ${f.einheit}` : ""}`;
    case "datum":
      return tag(w as string);
    case "janein":
      return w ? "ja" : "nein";
    case "auswahl":
      return f.optionen?.find((o) => o.wert === w)?.label ?? String(w);
    case "liste":
      return (w as string[]).map((x) => f.optionen?.find((o) => o.wert === x)?.label ?? x).join(", ");
    case "text":
      return String(w);
  }
}
