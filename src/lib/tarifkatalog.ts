// Tarifkatalog für die Terminvorbereitung (Ole, 15.11.2026, docs/ux/2026-11-15-aufraeumen-und-terminvorbereitung.md
// Teil 4): Tarife und Merkmale kommen fertig aus JSON-Dateien unter data/tarifkatalog/ (per Commit gepflegt, keine
// DB), der Vermittler trägt nur noch Beiträge ein. Keine Preise im Katalog.
//
// Format (Recherche, data/tarifkatalog/README):
// - schema.json: { sparten: [ { key, label, merkmale: [ { key, label, kurz, standard? } ], bausteine: [ { key, label, kurz } ] } ] }
// - <gesellschaft>/<sparte>.json: { gesellschaft, sparte, produkt, inAllenTarifen, tarife: [ { name, kurz, stufe, empfohlen?,
//   werte: { merkmal: string|null }, bausteine: { baustein: "inklusive"|"optional"|"nein" }, quelle, stand } ], offen }
//
// Reine Funktionen (auch im Browser): Einlesen und Prüfen, Vorauswahl, Grenzen und Tausch der Merkmale.
// Laden von der Platte: lib/tarifkatalog-laden.ts.

export type BausteinStatus = "inklusive" | "optional" | "nein";
export type SchemaEintrag = { key: string; label: string; kurz: string; standard?: boolean };
export type KatalogSparte = {
  key: string;
  label: string;
  merkmale: SchemaEintrag[];
  bausteine: SchemaEintrag[];
  /** Produkt im Lead (katze, hund, pferd, privatschutz) und Wort im Leadformular für die Vorauswahl */
  produkt?: string | null;
  formularMatch?: string | null;
};
export type KatalogTarif = {
  /** „allianz/hausrat/komfort“ */
  id: string;
  /** Schlüssel der Gesellschaft (Ordnername), z. B. „allianz“ */
  gesellschaft: string;
  gesellschaftName: string;
  sparte: string;
  produkt: string;
  name: string;
  kurz: string;
  stufe: number | null;
  empfohlen: boolean;
  werte: Record<string, string | null>;
  bausteine: Record<string, BausteinStatus>;
  quelle: string | null;
  stand: string | null;
  inAllenTarifen: string[];
  /** Produktlinie für einen Bündelrabatt (z. B. „Komfort“); ohne Angabe der Kurzname */
  linie: string | null;
};

/**
 * Bündelrabatt einer Gesellschaft (vorbereitet, Ole 15.11.2026; Berechnung und Anzeige folgen): z. B. Allianz
 * PrivatSchutz, ab 2 Produkten der Linien Komfort/Premium mit 3 Jahren Laufzeit 5 bis 20 % auf die Einzelprämien.
 * Datei: data/tarifkatalog/<gesellschaft>/buendel.json.
 */
export type BuendelRegel = { linien: string[]; mindestLaufzeitJahre: number | null; sparten: string[]; staffel: { anzahl: number; prozent: number; abAnzahl?: boolean }[] };
export type Katalog = { sparten: KatalogSparte[]; tarife: KatalogTarif[]; buendel: Record<string, BuendelRegel> };

/**
 * Grenzen der Vergleichsfolie (gemessen, lib/praesentation.ts GRENZEN): 3 Tarife (4 Stufen einer Gesellschaft, dann
 * eine Merkmalzeile weniger), 5 Merkmale, 2 Bausteine. Tarif-Kurzname einzeilig (≤ 18 Zeichen).
 */
export const AUSWAHL_GRENZEN = { tarife: 3, stufen: 4, merkmale: 5, bausteine: 2, kurzname: 18 } as const;

/** Anzeigenamen der Gesellschaften (Ordnernamen im Katalog), Schreibweise wie die Marke. */
const GESELLSCHAFT_NAMEN: Record<string, string> = {
  allianz: "Allianz",
  axa: "AXA",
  "signal-iduna": "SIGNAL IDUNA",
  // Tierversicherer (16.11.2026)
  agila: "AGILA",
  uelzener: "Uelzener",
  dfv: "DFV",
  barmenia: "Barmenia",
  hansemerkur: "HanseMerkur",
};
/** Reihenfolge in Listen: die drei Vertreter-Gesellschaften zuerst, dann die Tierversicherer, sonst alphabetisch. */
const REIHENFOLGE = ["allianz", "axa", "signal-iduna", "agila", "uelzener", "hansemerkur", "barmenia", "dfv"];

export function gesellschaftName(key: string): string {
  if (GESELLSCHAFT_NAMEN[key]) return GESELLSCHAFT_NAMEN[key];
  return key
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Gesellschaft aus einem Text (Kundenname, Erstinformation, Angebot), z. B. „Allianz Agentur Lohmann“ → allianz. */
export function gesellschaftAusText(text: string | null | undefined): string | null {
  const t = text ?? "";
  if (/allianz/i.test(t)) return "allianz";
  if (/\baxa\b/i.test(t)) return "axa";
  if (/signal\s*-?\s*iduna/i.test(t)) return "signal-iduna";
  if (/\bagila\b/i.test(t)) return "agila";
  if (/uelzener/i.test(t)) return "uelzener";
  if (/\bdfv\b|deutsche\s+familienversicherung/i.test(t)) return "dfv";
  if (/barmenia/i.test(t)) return "barmenia";
  if (/hanse\s*-?\s*merkur/i.test(t)) return "hansemerkur";
  return null;
}

export const sortiereGesellschaften = (keys: string[]): string[] =>
  [...new Set(keys)].sort((a, b) => {
    const ia = REIHENFOLGE.indexOf(a);
    const ib = REIHENFOLGE.indexOf(b);
    if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return gesellschaftName(a).localeCompare(gesellschaftName(b), "de");
  });

const slug = (s: string) =>
  s
    .toLocaleLowerCase("de")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const text = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * Sparten mit Merkmal-Schema, falls schema.json (noch) fehlt: aus dem Entwurf (Teil 4, fett = Standard). Damit die
 * Seite auch ohne Katalogdaten funktioniert (eigene Tarife, alte Angebote).
 */
const m = (key: string, label: string, kurz = label, standard = false): SchemaEintrag => ({ key, label, kurz, ...(standard ? { standard: true } : {}) });
const b = (key: string, label: string, kurz = label): SchemaEintrag => ({ key, label, kurz });
const TIERKRANKEN = (key: string, label: string): KatalogSparte => ({
  key,
  label,
  merkmale: [
    m("erstattung", "Erstattung", "Erstattung", true),
    m("got", "GOT bis", "GOT bis", true),
    m("jahreshoechstleistung", "Jahreshöchstleistung", "Jahreshöchstleistung", true),
    m("wartezeit", "Wartezeit", "Wartezeit", true),
    m("selbstbeteiligung", "Selbstbeteiligung", "Selbstbeteiligung", true),
    m("vorsorge", "Vorsorge-Budget"),
    m("zahn", "Zahnbehandlung"),
    m("nachbehandlung", "Nachbehandlung"),
    m("ausland", "Ausland"),
  ],
  bausteine: [b("vorsorge", "Vorsorge"), b("zahn", "Zahn")],
});
const TIERHALTER = (key: string, label: string, pferd: boolean): KatalogSparte => ({
  key,
  label,
  merkmale: [
    m("deckungssumme", "Deckungssumme", "Deckungssumme", true),
    m("selbstbeteiligung", "Selbstbeteiligung", "Selbstbeteiligung", true),
    m("mietsachschaeden", "Mietsachschäden", "Mietsachschäden", true),
    m("fremdhueten", "Fremdhüten", "Fremdhüten", true),
    m("welpen", pferd ? "Fohlen mitversichert" : "Welpen mitversichert", pferd ? "Fohlen mitversichert" : "Welpen mitversichert", true),
    m("forderungsausfall", "Forderungsausfall"),
    ...(pferd ? [m("flurschaeden", "Flurschäden"), m("reitbeteiligung", "Reitbeteiligung")] : []),
  ],
  bausteine: [b("sb", "Selbstbeteiligung")],
});
export const SPARTEN_STANDARD: KatalogSparte[] = [
  TIERKRANKEN("katze-kranken", "Katzenkranken"),
  TIERKRANKEN("katze-op", "Katzen-OP"),
  TIERKRANKEN("hund-kranken", "Hundekranken"),
  TIERKRANKEN("hund-op", "Hunde-OP"),
  TIERKRANKEN("pferd-op", "Pferde-OP"),
  TIERKRANKEN("pferd-kranken", "Pferdekranken"),
  {
    key: "haftpflicht",
    label: "Privathaftpflicht",
    merkmale: [
      m("deckungssumme", "Deckungssumme", "Deckungssumme", true),
      m("forderungsausfall", "Forderungsausfall", "Forderungsausfall", true),
      m("schluesselverlust", "Schlüsselverlust", "Schlüsselverlust", true),
      m("deliktunfaehige-kinder", "Deliktunfähige Kinder", "Deliktunfähige Kinder", true),
      m("mietsachschaeden", "Mietsachschäden", "Mietsachschäden", true),
      m("gefaelligkeit", "Gefälligkeitsschäden"),
      m("neuwert", "Neuwertentschädigung", "Neuwert"),
      m("ehrenamt", "Ehrenamt"),
      m("selbstbeteiligung", "Selbstbeteiligung"),
    ],
    bausteine: [b("schluessel-beruflich", "Beruflicher Schlüssel"), b("dienst", "Diensthaftpflicht"), b("sb", "Selbstbeteiligung 150 €", "SB 150 €")],
  },
  {
    key: "hausrat",
    label: "Hausrat",
    merkmale: [
      m("grobe-fahrlaessigkeit", "Grobe Fahrlässigkeit", "Grobe Fahrlässigkeit", true),
      m("fahrraddiebstahl", "Fahrraddiebstahl", "Fahrraddiebstahl", true),
      m("elementar", "Elementarschäden", "Elementarschäden", true),
      m("wertsachen", "Wertsachen", "Wertsachen", true),
      m("online-betrug", "Online-Betrug", "Online-Betrug", true),
      m("versicherungssumme", "Versicherungssumme"),
      m("kfz-diebstahl", "Diebstahl aus dem Auto"),
      m("ueberspannung", "Überspannung"),
      m("hotelkosten", "Hotelkosten"),
      m("aussenversicherung", "Außenversicherung"),
    ],
    bausteine: [b("fahrrad", "Fahrraddiebstahl"), b("elementar", "Elementarschäden"), b("glas", "Glasbruch"), b("sb", "Selbstbeteiligung")],
  },
  {
    key: "rechtsschutz",
    label: "Rechtsschutz",
    merkmale: [
      m("versicherungssumme", "Versicherungssumme", "Versicherungssumme", true),
      m("selbstbeteiligung", "Selbstbeteiligung", "Selbstbeteiligung", true),
      m("wartezeit", "Wartezeit", "Wartezeit", true),
      m("opfer", "Opfer-Rechtsschutz", "Opfer-Rechtsschutz", true),
      m("straf", "Straf-Rechtsschutz", "Straf-Rechtsschutz", true),
      m("mediation", "Mediation"),
      m("telefonberatung", "Telefonberatung"),
      m("lebensbereiche", "Lebensbereiche"),
    ],
    bausteine: [b("privat", "Privat"), b("beruf", "Beruf"), b("verkehr", "Verkehr"), b("wohnen", "Wohnen")],
  },
  {
    key: "wohngebaeude",
    label: "Wohngebäude",
    merkmale: [
      m("gleitender-neuwert", "Gleitender Neuwert", "Gleitender Neuwert", true),
      m("elementar", "Elementarschäden", "Elementarschäden", true),
      m("grobe-fahrlaessigkeit", "Grobe Fahrlässigkeit", "Grobe Fahrlässigkeit", true),
      m("ableitungsrohre", "Ableitungsrohre", "Ableitungsrohre", true),
      m("photovoltaik", "Photovoltaik", "Photovoltaik", true),
      m("ueberspannung", "Überspannung"),
      m("waermepumpe", "Wärmepumpe"),
      m("mietausfall", "Mietausfall"),
      m("selbstbeteiligung", "Selbstbeteiligung"),
    ],
    bausteine: [b("elementar", "Elementarschäden"), b("glas", "Glasbruch"), b("photovoltaik", "Photovoltaik")],
  },
  TIERHALTER("tierhalter-hund", "Hundehalterhaftpflicht", false),
  TIERHALTER("tierhalter-pferd", "Pferdehalterhaftpflicht", true),
  {
    key: "unfall",
    label: "Unfall",
    merkmale: [
      m("grundsumme", "Grundsumme", "Grundsumme", true),
      m("progression", "Progression", "Progression", true),
      m("unfallrente", "Unfallrente", "Unfallrente", true),
      m("gliedertaxe", "Gliedertaxe", "Gliedertaxe", true),
      m("bergungskosten", "Bergungskosten", "Bergungskosten", true),
      m("krankenhaustagegeld", "Krankenhaustagegeld"),
      m("kosmetische-op", "Kosmetische OP"),
      m("zeckenbiss", "Zeckenbiss"),
    ],
    bausteine: [b("rente", "Unfallrente", "Rente"), b("tagegeld", "Tagegeld")],
  },
];

function schemaEintraege(v: unknown, mitStandard: boolean): SchemaEintrag[] {
  const out: SchemaEintrag[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const r = obj(x);
    const key = text(r.key, 60);
    const label = text(r.label, 80);
    if (!key || !label || out.some((e) => e.key === key)) continue;
    out.push({ key, label, kurz: text(r.kurz, 28) ?? label, ...(mitStandard && r.standard === true ? { standard: true } : {}) });
  }
  return out;
}

/** schema.json defensiv lesen; ohne gültige Sparten der eingebaute Standard. */
export function parseSchema(raw: unknown): KatalogSparte[] {
  const sparten: KatalogSparte[] = [];
  for (const x of Array.isArray(obj(raw).sparten) ? (obj(raw).sparten as unknown[]) : []) {
    const r = obj(x);
    const key = text(r.key, 60);
    const label = text(r.label, 80);
    if (!key || !label || sparten.some((s) => s.key === key)) continue;
    sparten.push({ key, label, merkmale: schemaEintraege(r.merkmale, true), bausteine: schemaEintraege(r.bausteine, false), produkt: text(r.produkt, 40), formularMatch: text(r.formularMatch, 60) });
  }
  return sparten.length ? sparten : SPARTEN_STANDARD;
}

const STATUS = new Set<BausteinStatus>(["inklusive", "optional", "nein"]);

/** Eine Datei <gesellschaft>/<sparte>.json lesen. Gesellschaft und Sparte aus dem Pfad, falls in der Datei nichts steht. */
export function parseTarifDatei(raw: unknown, pfad: { gesellschaft: string; sparte: string }): KatalogTarif[] {
  const r = obj(raw);
  const gesellschaft = pfad.gesellschaft;
  const sparte = text(r.sparte, 60) ?? pfad.sparte;
  const name = text(r.gesellschaft, 60);
  // In der Datei steht der Anzeigename („Allianz“) oder der Schlüssel („allianz“)
  const gesellschaftAnzeige = name && name.toLowerCase() !== gesellschaft && !/^[a-z0-9-]+$/.test(name) ? name : gesellschaftName(gesellschaft);
  const produkt = text(r.produkt, 120) ?? "";
  const inAllen = (Array.isArray(r.inAllenTarifen) ? r.inAllenTarifen : []).map((x) => text(x, 80)).filter((x): x is string => !!x).slice(0, 8);
  const out: KatalogTarif[] = [];
  for (const x of Array.isArray(r.tarife) ? r.tarife : []) {
    const t = obj(x);
    const tname = text(t.name, 120);
    if (!tname) continue;
    const kurz = text(t.kurz, 40) ?? tname;
    const werte: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(obj(t.werte))) werte[k] = v == null ? null : typeof v === "string" ? text(v, 40) : typeof v === "number" || typeof v === "boolean" ? String(v === true ? "ja" : v === false ? "nein" : v) : null;
    const bausteine: Record<string, BausteinStatus> = {};
    for (const [k, v] of Object.entries(obj(t.bausteine))) if (typeof v === "string" && STATUS.has(v as BausteinStatus)) bausteine[k] = v as BausteinStatus;
    const id = `${gesellschaft}/${sparte}/${slug(kurz) || slug(tname)}`;
    if (out.some((o) => o.id === id)) continue;
    out.push({
      id,
      gesellschaft,
      gesellschaftName: gesellschaftAnzeige,
      sparte,
      produkt,
      name: tname,
      kurz,
      stufe: typeof t.stufe === "number" && Number.isFinite(t.stufe) ? t.stufe : null,
      empfohlen: t.empfohlen === true,
      werte,
      bausteine,
      quelle: text(t.quelle, 300),
      stand: text(t.stand, 20),
      inAllenTarifen: inAllen,
      linie: text(t.linie, 40),
    });
  }
  return out;
}

/** buendel.json einer Gesellschaft lesen; null, wenn keine gültige Regel. */
export function parseBuendel(raw: unknown): BuendelRegel | null {
  const r = obj(obj(raw).buendel ?? raw);
  const staffel = (Array.isArray(r.staffel) ? r.staffel : [])
    .map((x) => obj(x))
    .filter((x) => typeof x.anzahl === "number" && typeof x.prozent === "number" && x.anzahl > 0 && x.prozent > 0 && x.prozent < 100)
    .map((x) => ({ anzahl: x.anzahl as number, prozent: x.prozent as number, ...(x.abAnzahl === true ? { abAnzahl: true } : {}) }))
    .sort((a, b) => a.anzahl - b.anzahl);
  if (!staffel.length) return null;
  const liste = (v: unknown) => (Array.isArray(v) ? v.map((x) => text(x, 60)).filter((x): x is string => !!x) : []);
  return {
    linien: liste(r.linien),
    mindestLaufzeitJahre: typeof r.mindestLaufzeitJahre === "number" ? r.mindestLaufzeitJahre : null,
    sparten: liste(r.sparten),
    staffel,
  };
}

/** Katalog aus Schema und Tarifdateien (Dateien zu unbekannten Sparten werden übersprungen; buendel.json je Gesellschaft). */
export function katalogAus(schemaRaw: unknown, dateien: { gesellschaft: string; sparte: string; json: unknown }[]): Katalog {
  const sparten = parseSchema(schemaRaw);
  const keys = new Set(sparten.map((s) => s.key));
  const buendel: Record<string, BuendelRegel> = {};
  for (const d of dateien) {
    if (d.sparte !== "buendel") continue;
    const r = parseBuendel(d.json);
    if (r) buendel[d.gesellschaft] = r;
  }
  const tarife = dateien.filter((d) => d.sparte !== "buendel").flatMap((d) => parseTarifDatei(d.json, d)).filter((t) => keys.has(t.sparte));
  return { sparten, tarife, buendel };
}

export const sparteVon = (k: Katalog, key: string): KatalogSparte | undefined => k.sparten.find((s) => s.key === key);

/** Tarife einer Sparte, nach Gesellschaft (Vertreter-Gesellschaften zuerst) und Stufe sortiert. */
export function tarifeFuer(k: Katalog, sparte: string, gesellschaften?: string[] | null): KatalogTarif[] {
  const ord = sortiereGesellschaften(k.tarife.map((t) => t.gesellschaft));
  return k.tarife
    .filter((t) => t.sparte === sparte && (!gesellschaften?.length || gesellschaften.includes(t.gesellschaft)))
    .sort((a, b) => ord.indexOf(a.gesellschaft) - ord.indexOf(b.gesellschaft) || (a.stufe ?? 99) - (b.stufe ?? 99));
}

export type Vertrieb = {
  /** Vertreter (auch Mehrfachvertreter) sehen nur ihre Gesellschaft(en); Makler wählen frei. */
  rolle: "vertreter" | "makler";
  /** Schlüssel der Gesellschaften (Vertreter: seine; Makler: bevorzugte, leer = alle) */
  gesellschaften: string[];
};

/**
 * Vorauswahl je Sparte: Vertreter bekommen 3 Stufen seiner Gesellschaft rund um die empfohlene (sonst die mittlere)
 * Stufe, Stern auf der Empfehlung. Makler bekommen je Gesellschaft die empfohlene bzw. mittlere Stufe (höchstens 3).
 */
export function vorauswahl(k: Katalog, sparte: string, v: Vertrieb): { tarife: KatalogTarif[]; empfohlen: string | null } {
  const max = AUSWAHL_GRENZEN.tarife;
  const mitte = (xs: KatalogTarif[]) => xs.find((t) => t.empfohlen) ?? xs[Math.floor((xs.length - 1) / 2)] ?? null;
  if (v.rolle === "vertreter") {
    for (const g of v.gesellschaften) {
      const alle = tarifeFuer(k, sparte, [g]);
      if (!alle.length) continue;
      const c = alle.indexOf(mitte(alle)!);
      const start = Math.max(0, Math.min(c - 1, alle.length - max));
      const tarife = alle.slice(start, start + max);
      const e = tarife.find((t) => t.empfohlen) ?? tarife[Math.floor((tarife.length - 1) / 2)];
      return { tarife, empfohlen: e?.id ?? null };
    }
    return { tarife: [], empfohlen: null };
  }
  const alle = tarifeFuer(k, sparte, v.gesellschaften.length ? v.gesellschaften : null);
  const ges = sortiereGesellschaften(alle.map((t) => t.gesellschaft));
  if (ges.length === 1) return vorauswahl(k, sparte, { rolle: "vertreter", gesellschaften: ges });
  const tarife = ges
    .slice(0, max)
    .map((g) => mitte(alle.filter((t) => t.gesellschaft === g)))
    .filter((t): t is KatalogTarif => !!t);
  return { tarife, empfohlen: tarife[Math.floor((tarife.length - 1) / 2)]?.id ?? null };
}

/** Merkmale auf der Folie: „Meine Merkmale“ (zuletzt gewählt), sonst die Standard-Merkmale der Sparte, sonst die ersten. */
export function standardMerkmale(s: KatalogSparte, meine?: string[] | null, max: number = AUSWAHL_GRENZEN.merkmale): string[] {
  const keys = new Set(s.merkmale.map((x) => x.key));
  const eigene = (meine ?? []).filter((x) => keys.has(x));
  if (eigene.length) return [...new Set(eigene)].slice(0, max);
  const std = s.merkmale.filter((x) => x.standard).map((x) => x.key);
  return (std.length ? std : s.merkmale.map((x) => x.key)).slice(0, max);
}

/** Bausteine auf der Folie: „Meine Bausteine“, sonst die ersten, die ein gewählter Tarif hinzubuchen kann. */
export function standardBausteine(s: KatalogSparte, tarife: Pick<KatalogTarif, "bausteine">[], meine?: string[] | null, max: number = AUSWAHL_GRENZEN.bausteine): string[] {
  const keys = new Set(s.bausteine.map((x) => x.key));
  const eigene = (meine ?? []).filter((x) => keys.has(x));
  if (eigene.length) return [...new Set(eigene)].slice(0, max);
  const angeboten = s.bausteine.filter((x) => tarife.some((t) => t.bausteine[x.key] && t.bausteine[x.key] !== "nein")).map((x) => x.key);
  return angeboten.slice(0, max);
}

/**
 * Merkmal bzw. Baustein dazunehmen: unter der Grenze anhängen, sonst gegen das letzte tauschen (nie mehr als die
 * Grenze, damit auf der Folie nichts abgeschnitten wird). raus = das getauschte (für „Rückgängig“).
 */
export function auswahlDazu(liste: string[], key: string, max: number): { liste: string[]; raus: string | null } {
  if (liste.includes(key)) return { liste: liste.slice(0, max), raus: null };
  if (liste.length < max) return { liste: [...liste, key], raus: null };
  const kurz = liste.slice(0, max);
  const raus = kurz[kurz.length - 1] ?? null;
  return { liste: [...kurz.slice(0, -1), key], raus };
}

export const auswahlWeg = (liste: string[], key: string): string[] => liste.filter((x) => x !== key);

/** Sparte (Schlüssel) zu einem Text aus Formular, Angebot oder alter Sparte, z. B. „Privathaftpflicht“ → haftpflicht. */
export function sparteAusText(t: string | null | undefined): string | null {
  const s = (t ?? "").toLowerCase();
  if (!s.trim()) return null;
  if (/pferd/.test(s) && /halter|haftpflicht/.test(s)) return "tierhalter-pferd";
  // Pferd ohne Haftpflicht: OP-Schutz, außer ausdrücklich Kranken- bzw. Vollschutz (bei Pferden ist OP der Regelfall)
  if (/pferd/.test(s)) return /kranken|voll/.test(s) && !/\bop\b|op-|operation/.test(s) ? "pferd-kranken" : "pferd-op";
  if (/(hund|tier)\w*\s*-?\s*halter|hundehaftpflicht|tierhalter/.test(s)) return "tierhalter-hund";
  if (/katze/.test(s)) return /\bop\b|op-|operation/.test(s) ? "katze-op" : "katze-kranken";
  if (/hund/.test(s)) return /\bop\b|op-|operation/.test(s) ? "hund-op" : "hund-kranken";
  if (/hausrat/.test(s)) return "hausrat";
  if (/rechtsschutz/.test(s)) return "rechtsschutz";
  if (/geb(ä|ae|a)ude/.test(s)) return "wohngebaeude";
  if (/unfall/.test(s)) return "unfall";
  if (/haftpflicht/.test(s)) return "haftpflicht";
  return null;
}

/**
 * Sparten, deren Wort aus dem Leadformular (schema.json formularMatch) im Text vorkommt, z. B. „Hausrat, Rechtsschutz“.
 * Längere Wörter anderer Sparten zählen nicht mit („Hundehaftpflicht“, „Tierhalterhaftpflicht“ sind keine
 * Privathaftpflicht). produkt schränkt ein (z. B. privatschutz).
 */
export function spartenAusFormular(k: Pick<Katalog, "sparten">, text: string | null | undefined, produkt?: string | null): string[] {
  const roh = (text ?? "").toLocaleLowerCase("de");
  if (!roh.trim()) return [];
  const woerter = k.sparten.map((s) => s.formularMatch?.toLocaleLowerCase("de")).filter((w): w is string => !!w);
  return k.sparten
    .filter((s) => (!produkt || !s.produkt || s.produkt === produkt) && s.formularMatch)
    .filter((s) => {
      const w = s.formularMatch!.toLocaleLowerCase("de");
      let t = roh.replace(/tierhalter-?\s*haftpflicht/g, " ");
      for (const l of woerter) if (l !== w && l.includes(w)) t = t.split(l).join(" ");
      return t.includes(w);
    })
    .map((s) => s.key);
}
