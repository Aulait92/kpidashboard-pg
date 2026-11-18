// Tarifauswahl je Termin (neue Terminvorbereitung, Ole 15.11.2026): je Sparte die gewählten Tarife als Schnappschuss
// aus dem Katalog (ein Katalog-Update ändert keine alte Präsentation), Beitrag und Zahlweise, Empfehlung, „In
// Präsentation“, Bausteine mit Preis, dazu die Merkmale und Bausteine auf der Folie (Grenzen wie die Vergleichsfolie).
// Daraus entstehen die Angebote (AngeboteDaten) für Präsentation, Kundenlink und PDF.
//
// Reine Funktionen (auch im Browser für Live-Vorschau und Summen). Speichern: lib/tarifauswahl-server.ts.

import { beitragAus, cleanAngebote, kuerzen, beitragEffektiv, type AngebotItem, type AngeboteDaten, type Baustein, type BeitragsUebersicht } from "@/lib/angebote-daten";
import { spaltenNamen } from "@/lib/praesentation";
import type { KombiRegel } from "@/lib/kombi-rabatt";
import { cleanSchutz, schutzZeilen, type SchutzEintrag } from "@/lib/schutz-ueberblick";
import { bisherSichtbar, bisherSpalte, cleanBisher, type BisherSpalte, type BisherVertrag } from "@/lib/bisheriger-vertrag";
import {
  AUSWAHL_GRENZEN,
  gesellschaftAusText,
  sparteAusText,
  sparteVon,
  standardBausteine,
  standardMerkmale,
  vorauswahl,
  type BausteinStatus,
  type BuendelRegel,
  type Katalog,
  type KatalogTarif,
  type SchemaEintrag,
  type Vertrieb,
} from "@/lib/tarifkatalog";

export type Zahlweise = "monat" | "jahr";

export type TarifWahl = {
  /** Katalog-ID („allianz/hausrat/komfort“), „eigen:<id>“ oder „alt:<n>“ (aus einem früher ausgelesenen Angebot) */
  id: string;
  herkunft: "katalog" | "eigen" | "angebot";
  /** Anzeigename der Gesellschaft („Allianz“) */
  gesellschaft: string;
  /** Schlüssel der Gesellschaft im Katalog, falls bekannt */
  gesellschaftKey: string | null;
  name: string;
  /** Kurzname für die Folie (≤ 18 Zeichen, ohne Spartenwort) */
  kurz: string;
  stand: string | null;
  /** Stufe im Katalog (1 = kleinste), für die Reihenfolge der Spalten */
  stufe?: number | null;
  werte: Record<string, string | null>;
  bausteinStatus: Record<string, BausteinStatus>;
  /** Beitrag in der Zahlweise, ohne Bausteine */
  beitrag: number | null;
  zahlweise: Zahlweise;
  zeigen: boolean;
  /** Bausteine mit Preis (in der Zahlweise des Tarifs) und an/aus */
  bausteine: Record<string, { an: boolean; beitrag: number | null }>;
  inAllen: string[];
  /**
   * Beitrag ist ein Richtwert, noch nicht vom Vermittler bestätigt (Pilot „Beiträge rechnen“, docs/preise-pilot.md):
   * Herkunft („Aus dem Angebot gelesen“) und Zeitpunkt. Bestätigen oder selbst ändern entfernt die Markierung.
   */
  preisPruefen?: { quelle: string; am: string } | null;
  /** Werte aus dem Katalog sind nicht an der Quelle gegengeprüft (KatalogTarif.ungeprueft): „bitte prüfen“ an der Karte */
  werteUngeprueft?: boolean;
  /** Für einen späteren Bündelrabatt (lib/tarifkatalog.ts BuendelRegel): Produktlinie und Vertragslaufzeit */
  linie?: string | null;
  laufzeitJahre?: number | null;
  /** Nur aus älteren Angeboten: Texte für die Folien wie bisher */
  leistungen?: string[];
  ausschluesse?: string[];
  selbstbeteiligung?: string | null;
};

export type SparteWahl = {
  key: string;
  label: string;
  /** Merkmal- und Baustein-Schema der Sparte (Schnappschuss, ergänzt um Merkmale älterer Angebote) */
  schema: { merkmale: SchemaEintrag[]; bausteine: SchemaEintrag[] };
  merkmale: string[];
  bausteine: string[];
  empfohlen: string | null;
  tarife: TarifWahl[];
  /**
   * Cross-Selling (Ole, 16.11.2026, Teil A3): Sparte erst bei Bedarf zeigen. In der Präsentation steht sie auf „Ihr
   * Schutz im Überblick“ mit „Mit anschauen“ und kommt erst dann in Vergleich und Beitrag.
   */
  zusatz?: boolean;
  /** Bisheriger Vertrag des Kunden (Spalte „Ihr bisheriger Vertrag“, lib/bisheriger-vertrag.ts) */
  bisher?: BisherVertrag;
};

export type Tarifauswahl = {
  v: 1;
  sparten: SparteWahl[];
  /** „Ihr Schutz im Überblick“ (Ampel je Sparte, lib/schutz-ueberblick.ts); fehlt bei älteren Auswahlen */
  schutz?: SchutzEintrag[];
};

export type MeineAuswahl = Record<string, { merkmale: string[]; bausteine: string[] }>;

// ─── Bereinigen (gespeicherte bzw. vom Browser geschickte Daten) ──────────────────────────────

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
const strs = (v: unknown, n: number, max: number): string[] =>
  (Array.isArray(v) ? v : []).map((x) => str(x, max)).filter((x): x is string => !!x).slice(0, n);

/** Geldbetrag aus Zahl oder Eingabe („11,40“, „1.234,50 €“); negativ nur mit erlaubt (Ersparnis bei Bausteinen). */
export function betrag(v: unknown, negativ = false): number | null {
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") {
    const t = v.replace(/[€\s]/g, "").replace(/−/g, "-");
    if (!t) return null;
    const norm = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
    n = Number(norm);
  } else return null;
  if (!Number.isFinite(n) || Math.abs(n) >= 100000 || (!negativ && n < 0)) return null;
  return Math.round(n * 100) / 100;
}

const STATUS = new Set(["inklusive", "optional", "nein"]);

function cleanSchema(v: unknown): SchemaEintrag[] {
  const out: SchemaEintrag[] = [];
  for (const x of (Array.isArray(v) ? v : []).slice(0, 40)) {
    const r = obj(x);
    const key = str(r.key, 80);
    const label = str(r.label, 120);
    if (key && label && !out.some((e) => e.key === key)) out.push({ key, label, kurz: str(r.kurz, 60) ?? label });
  }
  return out;
}

function cleanTarif(v: unknown): TarifWahl | null {
  const r = obj(v);
  const id = str(r.id, 200);
  const name = str(r.name, 160);
  if (!id || !name) return null;
  const werte: Record<string, string | null> = {};
  for (const [k, w] of Object.entries(obj(r.werte)).slice(0, 40)) werte[k.slice(0, 80)] = w == null ? null : str(w, 60);
  const bausteinStatus: Record<string, BausteinStatus> = {};
  for (const [k, s] of Object.entries(obj(r.bausteinStatus)).slice(0, 20)) if (typeof s === "string" && STATUS.has(s)) bausteinStatus[k.slice(0, 80)] = s as BausteinStatus;
  const bausteine: TarifWahl["bausteine"] = {};
  for (const [k, x] of Object.entries(obj(r.bausteine)).slice(0, 20)) bausteine[k.slice(0, 80)] = { an: obj(x).an === true, beitrag: betrag(obj(x).beitrag, true) };
  const herkunft = r.herkunft === "eigen" || r.herkunft === "angebot" ? r.herkunft : "katalog";
  const pp = obj(r.preisPruefen);
  const preisPruefen = str(pp.quelle, 60) && str(pp.am, 40) ? { quelle: str(pp.quelle, 60)!, am: str(pp.am, 40)! } : null;
  return {
    id,
    herkunft,
    gesellschaft: str(r.gesellschaft, 80) ?? "",
    gesellschaftKey: str(r.gesellschaftKey, 60),
    name,
    kurz: str(r.kurz, 80) ?? name,
    stand: str(r.stand, 20),
    ...(typeof r.stufe === "number" && Number.isFinite(r.stufe) ? { stufe: r.stufe } : {}),
    werte,
    bausteinStatus,
    beitrag: betrag(r.beitrag),
    zahlweise: r.zahlweise === "jahr" ? "jahr" : "monat",
    zeigen: r.zeigen !== false,
    bausteine,
    inAllen: strs(r.inAllen, 8, 120),
    ...(preisPruefen && betrag(r.beitrag) != null ? { preisPruefen } : {}),
    ...(r.werteUngeprueft === true ? { werteUngeprueft: true } : {}),
    ...(r.linie !== undefined ? { linie: str(r.linie, 40) } : {}),
    ...(typeof r.laufzeitJahre === "number" && r.laufzeitJahre > 0 && r.laufzeitJahre <= 10 ? { laufzeitJahre: Math.round(r.laufzeitJahre) } : {}),
    ...(Array.isArray(r.leistungen) ? { leistungen: strs(r.leistungen, 6, 160) } : {}),
    ...(Array.isArray(r.ausschluesse) ? { ausschluesse: strs(r.ausschluesse, 4, 160) } : {}),
    ...(r.selbstbeteiligung !== undefined ? { selbstbeteiligung: str(r.selbstbeteiligung, 60) } : {}),
  };
}

/** Gespeicherte bzw. geschickte Auswahl defensiv lesen; null, wenn es keine ist. */
export function cleanTarifauswahl(raw: unknown): Tarifauswahl | null {
  const o = obj(raw);
  if (o.v !== 1 || !Array.isArray(o.sparten)) return null;
  const sparten: SparteWahl[] = [];
  for (const x of o.sparten.slice(0, 12)) {
    const r = obj(x);
    const key = str(r.key, 80);
    const label = str(r.label, 80);
    if (!key || !label || sparten.some((s) => s.key === key)) continue;
    const s = obj(r.schema);
    const schema = { merkmale: cleanSchema(s.merkmale), bausteine: cleanSchema(s.bausteine) };
    const mk = new Set(schema.merkmale.map((e) => e.key));
    const bk = new Set(schema.bausteine.map((e) => e.key));
    const tarife: TarifWahl[] = [];
    for (const t of (Array.isArray(r.tarife) ? r.tarife : []).slice(0, 8)) {
      const c = cleanTarif(t);
      if (c && !tarife.some((y) => y.id === c.id)) tarife.push(c);
    }
    const empfohlen = str(r.empfohlen, 200);
    sparten.push({
      key,
      label,
      schema,
      merkmale: [...new Set(strs(r.merkmale, 10, 80).filter((k) => mk.has(k)))].slice(0, AUSWAHL_GRENZEN.merkmale),
      bausteine: [...new Set(strs(r.bausteine, 10, 80).filter((k) => bk.has(k)))].slice(0, AUSWAHL_GRENZEN.bausteine),
      empfohlen: empfohlen && tarife.some((t) => t.id === empfohlen) ? empfohlen : null,
      tarife,
      ...(r.zusatz === true ? { zusatz: true } : {}),
      ...(cleanBisher(r.bisher) ? { bisher: cleanBisher(r.bisher)! } : {}),
    });
  }
  return { v: 1, sparten, ...(Array.isArray(o.schutz) ? { schutz: cleanSchutz(o.schutz) } : {}) };
}

// ─── Katalog → Auswahl ───────────────────────────────────────────────────────────────────────

export function tarifAusKatalog(t: KatalogTarif): TarifWahl {
  return {
    id: t.id,
    herkunft: "katalog",
    gesellschaft: t.gesellschaftName,
    gesellschaftKey: t.gesellschaft,
    name: t.name,
    kurz: t.kurz,
    stand: t.stand,
    stufe: t.stufe,
    werte: { ...t.werte },
    bausteinStatus: { ...t.bausteine },
    beitrag: null,
    zahlweise: "monat",
    zeigen: true,
    bausteine: {},
    inAllen: [...t.inAllenTarifen],
    linie: t.linie ?? t.kurz,
    ...(t.ungeprueft ? { werteUngeprueft: true } : {}),
  };
}

export type EigenerTarifDaten = { id: string; gesellschaft: string; name: string; kurz: string; werte: Record<string, string | null> };

export function tarifAusEigenem(e: EigenerTarifDaten): TarifWahl {
  return {
    id: `eigen:${e.id}`,
    herkunft: "eigen",
    gesellschaft: e.gesellschaft,
    gesellschaftKey: gesellschaftAusText(e.gesellschaft),
    name: e.name,
    kurz: e.kurz,
    stand: null,
    werte: { ...e.werte },
    bausteinStatus: {},
    beitrag: null,
    zahlweise: "monat",
    zeigen: true,
    bausteine: {},
    inAllen: [],
  };
}

/** Tarif einfügen: Stufen derselben Gesellschaft bleiben aufsteigend (Basis vor Smart), sonst hinten anfügen. */
export function tarifEinfuegen(sp: SparteWahl, t: TarifWahl): void {
  const g = (x: TarifWahl) => (x.gesellschaftKey ?? x.gesellschaft).toLowerCase();
  const i = t.stufe == null ? -1 : sp.tarife.findIndex((x) => g(x) === g(t) && x.stufe != null && x.stufe > t.stufe!);
  if (i < 0) sp.tarife.push(t);
  else sp.tarife.splice(i, 0, t);
}

/** Kurzname für die Folie: ohne Spartenwort vorn, höchstens 18 Zeichen an einer Wortgrenze. */
export function kurzName(name: string, sparteLabel?: string | null): string {
  let n = name.replace(/\s+/g, " ").trim();
  const s = (sparteLabel ?? "").trim();
  if (s && n.toLowerCase().startsWith(`${s.toLowerCase()} `)) n = n.slice(s.length).trim();
  return kuerzen(n, AUSWAHL_GRENZEN.kurzname) || name.slice(0, AUSWAHL_GRENZEN.kurzname);
}

/** Neue Sparte mit Vorauswahl aus dem Katalog (Vertreter: 3 Stufen seiner Gesellschaft, Stern auf der Empfehlung). */
export function sparteNeu(k: Katalog, key: string, v: Vertrieb, meine?: MeineAuswahl | null): SparteWahl | null {
  const s = sparteVon(k, key);
  if (!s) return null;
  const { tarife, empfohlen } = vorauswahl(k, key, v);
  return {
    key,
    label: s.label,
    schema: { merkmale: s.merkmale.map(({ key, label, kurz }) => ({ key, label, kurz })), bausteine: s.bausteine.map(({ key, label, kurz }) => ({ key, label, kurz })) },
    merkmale: standardMerkmale(s, meine?.[key]?.merkmale),
    bausteine: standardBausteine(s, tarife, meine?.[key]?.bausteine),
    empfohlen,
    tarife: tarife.map(tarifAusKatalog),
  };
}

/** Start für einen Termin ohne gespeicherte Auswahl: je gefragter Sparte die Vorauswahl. */
export function startAuswahl(k: Katalog, sparten: string[], v: Vertrieb, meine?: MeineAuswahl | null): Tarifauswahl {
  return { v: 1, sparten: sparten.map((s) => sparteNeu(k, s, v, meine)).filter((s): s is SparteWahl => !!s) };
}

// ─── Grenzen ────────────────────────────────────────────────────────────────────────────────

/** Längster Wert, mit dem 4 Spalten noch passen */
export const WERT_KURZ_BEI_VIER = 16;

const gesKey = (t: TarifWahl) => (t.gesellschaftKey ?? t.gesellschaft).toLowerCase();

/** Spaltennamen der Vergleichsfolie (wie lib/praesentation.ts). */
export const spaltenFuer = (sp: SparteWahl, tarife = sp.tarife.filter((t) => t.zeigen)) =>
  spaltenNamen(tarife.map((t) => ({ tarif: t.kurz, gesellschaft: t.gesellschaft })), sparteLabelFuerFolie(sp));

const sparteLabelFuerFolie = (sp: SparteWahl) => sp.label;

/**
 * Grenzen je Sparte (gemessen an der Vergleichsfolie): 3 Tarife, bei Stufen einer Gesellschaft bis 4; mit 4 Spalten
 * oder einem langen (zweizeiligen) Tarifnamen eine Merkmalzeile weniger; 2 Bausteine. Mit der Spalte „Ihr bisheriger
 * Vertrag“ höchstens 3 Tarife und eine Merkmalzeile weniger (Platz für Beitragsunterschied und Kündigung).
 */
export function grenzenFuer(sp: SparteWahl): { tarife: number; merkmale: number; bausteine: number } {
  // 4 Spalten nur mit kurzen Werten (gemessen mit dem echten Katalog: Hausrat mit Werten bis 24 Zeichen ragt sonst
  // über die Fußzeile, mit 3 Spalten passt jede Sparte)
  const langeWerte = sp.tarife.some((t) => sp.merkmale.some((k) => (t.werte[k] ?? "").length > WERT_KURZ_BEI_VIER));
  const bisher = bisherSichtbar(sp.bisher);
  const eineGesellschaft = new Set(sp.tarife.map(gesKey)).size <= 1 && !langeWerte && !bisher;
  const gezeigt = sp.tarife.filter((t) => t.zeigen);
  const max = eineGesellschaft ? AUSWAHL_GRENZEN.stufen : AUSWAHL_GRENZEN.tarife;
  const lang = spaltenFuer(sp, gezeigt.slice(0, bisher ? AUSWAHL_GRENZEN.tarife : 4)).some((n) => n.length > AUSWAHL_GRENZEN.kurzname);
  return {
    tarife: max,
    merkmale: AUSWAHL_GRENZEN.merkmale - (gezeigt.length >= 4 && !bisher ? 1 : 0) - (lang ? 1 : 0) - (bisher ? 1 : 0),
    bausteine: AUSWAHL_GRENZEN.bausteine,
  };
}

// ─── Auswahl → Angebote (Präsentation) ──────────────────────────────────────────────────────

const JA = /^(ja|✓|✔|x|enthalten|inklusive|inkl\.?)$/i;
const NEIN = /^(nein|\u2014|\u2013|-|nicht enthalten|ohne)$/i;
/** Fehlender Katalogwert: neutral, nie als „nicht enthalten“ */
export const WERT_UNBEKANNT = "lt. Bedingungen";

export const monatlich = (n: number | null, zw: Zahlweise): number | null => (n == null ? null : Math.round((zw === "jahr" ? n / 12 : n) * 100) / 100);

const label = (sp: SparteWahl, key: string) => sp.schema.merkmale.find((m) => m.key === key)?.kurz ?? key;
const bLabel = (sp: SparteWahl, key: string) => sp.schema.bausteine.find((m) => m.key === key)?.kurz ?? key;

/** Bausteine eines Tarifs auf der Folie: inklusive (ohne Preis) bzw. hinzubuchbar mit Preis; ohne Preis nicht. */
export function bausteineFuer(sp: SparteWahl, t: TarifWahl, keys = sp.bausteine.slice(0, AUSWAHL_GRENZEN.bausteine)): Baustein[] {
  return keys.flatMap((k): Baustein[] => {
    const st = t.bausteinStatus[k];
    if (st === "inklusive") return [{ name: bLabel(sp, k), beitrag: 0, aktiv: true }];
    const x = t.bausteine[k];
    if (st !== "optional" || x?.beitrag == null) return [];
    return [{ name: bLabel(sp, k), beitrag: monatlich(x.beitrag, t.zahlweise)!, aktiv: x.an }];
  });
}

/** Die angezeigten Tarife einer Sparte (Schalter „In Präsentation“, höchstens die Grenze). */
export const gezeigteTarife = (sp: SparteWahl) => sp.tarife.filter((t) => t.zeigen).slice(0, grenzenFuer(sp).tarife);

/** Empfehlung der Sparte unter den gezeigten Tarifen (Stern; sonst der mittlere). */
export function empfehlungVon(sp: SparteWahl): TarifWahl | null {
  const v = gezeigteTarife(sp);
  return v.find((t) => t.id === sp.empfohlen) ?? v[Math.floor((v.length - 1) / 2)] ?? null;
}

function itemFuer(sp: SparteWahl, t: TarifWahl, empfohlen: boolean, merk: string[]): AngebotItem {
  // Kombi-Rabatt: nur Katalogtarife (bekannte Gesellschaft und Linie); eigene und ausgelesene Tarife zählen nicht
  const kombi = t.herkunft === "katalog" && t.gesellschaftKey ? { gruppe: t.gesellschaftKey, sparte: sp.key, linie: t.linie ?? t.kurz, ...(t.laufzeitJahre ? { laufzeitJahre: t.laufzeitJahre } : {}) } : null;
  const wert = (k: string) => {
    const w = t.werte[k];
    return w == null ? (t.herkunft === "angebot" ? "nein" : WERT_UNBEKANNT) : w;
  };
  const abgeleitet = merk.flatMap((k) => {
    const w = t.werte[k];
    // „optional“ = nur gegen Aufpreis wählbar (Katalog), also keine Leistung des Tarifs
    if (w == null || NEIN.test(w.trim()) || /^optional$/i.test(w.trim())) return [];
    return [JA.test(w.trim()) ? label(sp, k) : `${label(sp, k)}: ${w}`];
  });
  const sbKey = sp.schema.merkmale.find((m) => /selbstbeteiligung/i.test(m.key) || /^selbstbeteiligung$/i.test(m.label))?.key;
  const sb = t.selbstbeteiligung !== undefined ? t.selbstbeteiligung : sbKey ? (t.werte[sbKey] ?? null) : null;
  return {
    sparte: sp.label,
    gesellschaft: t.gesellschaft || null,
    tarif: t.kurz,
    beitragMonat: monatlich(t.beitrag, t.zahlweise),
    selbstbeteiligung: sb,
    leistungen: [...new Set(t.leistungen?.length ? t.leistungen : [...abgeleitet, ...t.inAllen])].slice(0, 6),
    ausschluesse: t.ausschluesse ?? [],
    empfohlen,
    gewaehlt: empfohlen,
    merkmale: merk.map((k) => ({ name: label(sp, k), wert: wert(k) })),
    bausteine: bausteineFuer(sp, t),
    ...(kombi ? { kombi } : {}),
    ...(sp.zusatz ? { zusatz: true, gewaehlt: false } : {}),
  };
}

/** Bündelregeln des Katalogs (je Gesellschaft) als Regeln für die Präsentation, nur für Gesellschaften der Auswahl. */
export function kombiRegelnFuer(a: Tarifauswahl, buendel: Record<string, BuendelRegel> | null | undefined, namen: Record<string, string> = {}): KombiRegel[] {
  const ges = new Set(a.sparten.flatMap((sp) => sp.tarife.map((t) => (t.herkunft === "katalog" ? t.gesellschaftKey : null)).filter((g): g is string => !!g)));
  return Object.entries(buendel ?? {})
    .filter(([g, r]) => ges.has(g) && r.staffel.length)
    .map(([g, r]) => ({
      gruppe: g,
      name: r.name ? `${namen[g] ?? ""} ${r.name}`.trim() : null,
      linien: r.linien,
      mindestLaufzeitJahre: r.mindestLaufzeitJahre,
      sparten: r.sparten,
      staffel: r.staffel,
      ...(r.einmal?.length ? { einmal: r.einmal } : {}),
    }));
}

/**
 * Angebote für Präsentation, Kundenlink und PDF (gleiches Format wie ausgelesene Angebote). Mit Bündelregeln des
 * Katalogs rechnet die Präsentation den Kombi-Rabatt; mit dem Überblick entsteht die Folie „Ihr Schutz im Überblick“.
 */
export function zuAngebote(a: Tarifauswahl, buendel?: Record<string, BuendelRegel> | null): AngeboteDaten {
  const items: AngebotItem[] = [];
  const namen: Record<string, string> = {};
  const bisher: BisherSpalte[] = [];
  for (const sp of a.sparten) {
    const g = grenzenFuer(sp);
    const v = gezeigteTarife(sp);
    const e = empfehlungVon(sp);
    const merk = sp.merkmale.slice(0, g.merkmale);
    for (const t of v) {
      items.push(itemFuer(sp, t, t === e, merk));
      if (t.gesellschaftKey) namen[t.gesellschaftKey] = t.gesellschaft;
    }
    if (v.length && bisherSichtbar(sp.bisher)) bisher.push(bisherSpalte(sp, sp.bisher, merk.map((k) => ({ key: k, name: label(sp, k) }))));
  }
  const kombi = kombiRegelnFuer(a, buendel, namen);
  const schutz = a.schutz?.length ? schutzZeilen(a.schutz, a.sparten.map((s) => s.key)) : [];
  // gleiche Prüfung wie beim Speichern ausgelesener Angebote (Längen, Anzahl)
  return cleanAngebote({ items, quelle: [], kombi, schutz, bisher });
}

/** Monatsbeitrag eines Tarifs mit den gewählten Bausteinen; null ohne Beitrag. */
export function tarifMonat(sp: SparteWahl, t: TarifWahl): number | null {
  const b = monatlich(t.beitrag, t.zahlweise);
  return b == null ? null : beitragEffektiv({ beitragMonat: b, bausteine: bausteineFuer(sp, t) });
}

/** Beitrag der Empfehlungen im Monat: Einzelsumme, Kombi-Rabatt, Endbeitrag (lib/angebote-daten.ts beitragAus). */
export type { BeitragsUebersicht };

export function beitragsUebersicht(a: Tarifauswahl, buendel?: Record<string, BuendelRegel> | null): BeitragsUebersicht {
  return beitragAus(zuAngebote(a, buendel));
}

/** Summe der Empfehlungen aller Sparten im Monat nach Kombi-Rabatt (null, solange kein Beitrag eingetragen ist). */
export const summeEmpfehlung = (a: Tarifauswahl, buendel?: Record<string, BuendelRegel> | null): number | null => beitragsUebersicht(a, buendel).endbeitrag;

// ─── Ältere Angebote (offersJson) lesen ─────────────────────────────────────────────────────

const norm = (s: string) => s.toLocaleLowerCase("de").replace(/\([^)]*\)/g, "").replace(/[^a-z0-9äöüß]+/g, " ").trim();
const slug = (s: string) => norm(s).replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/\s+/g, "-");
const istNein = (w: string | undefined) => !w || NEIN.test(w.trim());

/**
 * Früher ausgelesene bzw. eingetragene Angebote als Auswahl lesen (nichts geht verloren): je Sparte alle Stufen mit
 * Beitrag, Merkmalen, Bausteinen, Leistungen und Ausschlüssen. Merkmale, die im Katalog-Schema stehen, bekommen dessen
 * Schlüssel; die übrigen werden als eigene Merkmale ergänzt. Auf der Folie: zuerst die Merkmale mit Unterschieden.
 */
export function ausAltenAngeboten(d: AngeboteDaten, k?: Katalog | null): Tarifauswahl {
  const gruppen = new Map<string, AngebotItem[]>();
  for (const i of d.items) gruppen.set(i.sparte, [...(gruppen.get(i.sparte) ?? []), i]);
  const sparten: SparteWahl[] = [];
  let n = 0;
  for (const [sparte, items] of gruppen) {
    const key0 = sparteAusText(sparte) ?? `alt-${slug(sparte) || sparten.length}`;
    const key = sparten.some((s) => s.key === key0) ? `${key0}-${sparten.length}` : key0;
    const basis = k ? sparteVon(k, key) : undefined;
    const merkmale: SchemaEintrag[] = basis ? basis.merkmale.map(({ key, label, kurz }) => ({ key, label, kurz })) : [];
    const bausteine: SchemaEintrag[] = basis ? basis.bausteine.map(({ key, label, kurz }) => ({ key, label, kurz })) : [];
    const finde = (liste: SchemaEintrag[], name: string, praefix: string) => {
      const x = liste.find((e) => norm(e.label) === norm(name) || norm(e.kurz) === norm(name));
      if (x) return x.key;
      const neu = { key: `${praefix}${slug(name) || liste.length}`, label: name, kurz: name };
      if (!liste.some((e) => e.key === neu.key)) liste.push(neu);
      return neu.key;
    };
    const mNamen = [...new Set(items.flatMap((i) => i.merkmale.map((m) => m.name)))];
    const mKey = new Map(mNamen.map((nm) => [nm, finde(merkmale, nm, "alt-")]));
    const bNamen = [...new Set(items.flatMap((i) => i.bausteine.map((b) => b.name)))];
    const bKey = new Map(bNamen.map((nm) => [nm, finde(bausteine, nm, "alt-")]));
    const tarife = items.map((i): TarifWahl => {
      const werte: Record<string, string | null> = {};
      for (const m of i.merkmale) werte[mKey.get(m.name)!] = m.wert;
      const bausteinStatus: Record<string, BausteinStatus> = {};
      const bs: TarifWahl["bausteine"] = {};
      for (const b of i.bausteine) {
        bausteinStatus[bKey.get(b.name)!] = "optional";
        bs[bKey.get(b.name)!] = { an: b.aktiv, beitrag: b.beitrag };
      }
      return {
        id: `alt:${n++}`,
        herkunft: "angebot",
        gesellschaft: i.gesellschaft ?? "",
        gesellschaftKey: gesellschaftAusText(i.gesellschaft),
        name: i.tarif ?? sparte,
        kurz: i.tarif ?? sparte,
        stand: null,
        werte,
        bausteinStatus,
        beitrag: i.beitragMonat,
        zahlweise: "monat",
        zeigen: true,
        bausteine: bs,
        inAllen: [],
        leistungen: i.leistungen,
        ausschluesse: i.ausschluesse,
        selbstbeteiligung: i.selbstbeteiligung,
      };
    });
    // Folie wie bisher: zuerst Merkmale mit Unterschieden, dann gleiche
    const wert = (i: AngebotItem, nm: string) => i.merkmale.find((m) => m.name === nm)?.wert;
    const gleich = (nm: string) => items.every((i) => wert(i, nm) != null && norm(wert(i, nm)!) === norm(wert(items[0], nm)!));
    const reihenfolge = [...mNamen.filter((nm) => !gleich(nm)), ...mNamen.filter((nm) => gleich(nm) && !istNein(wert(items[0], nm)))];
    const empf = items.findIndex((i) => i.empfohlen);
    const sp: SparteWahl = {
      key,
      label: sparte,
      schema: { merkmale, bausteine },
      merkmale: [],
      bausteine: [...new Set(bNamen.map((nm) => bKey.get(nm)!))].slice(0, AUSWAHL_GRENZEN.bausteine),
      empfohlen: empf >= 0 ? tarife[empf].id : null,
      tarife,
    };
    sp.merkmale = [...new Set(reihenfolge.map((nm) => mKey.get(nm)!))].slice(0, grenzenFuer(sp).merkmale);
    sparten.push(sp);
  }
  return { v: 1, sparten };
}

// ─── Preise aus einem Angebot (PDF) übernehmen ──────────────────────────────────────────────

/**
 * Beiträge und Bausteinpreise aus ausgelesenen Angeboten den gewählten Tarifen zuordnen (Sparte, Gesellschaft,
 * Tarifname). Nur leere Beiträge werden gefüllt; Merkmale bleiben aus dem Katalog. anzahl = gefüllte Tarife.
 */
export function preiseUebernehmen(
  a: Tarifauswahl,
  items: AngebotItem[],
  /** Pilot „Beiträge rechnen“: gefüllte Beiträge als Richtwert markieren (je Sparte und Gesellschaft), Zeitpunkt */
  opts: { pruefen?: (sparte: string, gesellschaft: string | null) => boolean; am?: string } = {},
): { auswahl: Tarifauswahl; anzahl: number; sparten: string[] } {
  const neu: Tarifauswahl = structuredClone(a);
  let anzahl = 0;
  const sparten = new Set<string>();
  const benutzt = new Set<string>();
  for (const i of items) {
    if (i.beitragMonat == null) continue;
    const key = sparteAusText(i.sparte);
    const sp = neu.sparten.find((s) => s.key === key || norm(s.label) === norm(i.sparte));
    if (!sp) continue;
    const ges = gesellschaftAusText(i.gesellschaft);
    const tn = ` ${norm(i.tarif ?? "")} `;
    const kandidaten = sp.tarife.filter((t) => !benutzt.has(t.id) && (!ges || !t.gesellschaftKey || t.gesellschaftKey === ges));
    const t =
      kandidaten.find((x) => norm(x.name) === norm(i.tarif ?? "")) ??
      kandidaten.find((x) => norm(x.kurz) && tn.includes(` ${norm(x.kurz)} `)) ??
      (kandidaten.length === 1 && items.filter((y) => sparteAusText(y.sparte) === sp.key).length === 1 ? kandidaten[0] : undefined);
    if (!t) continue;
    benutzt.add(t.id);
    if (t.beitrag == null) {
      t.beitrag = i.beitragMonat;
      t.zahlweise = "monat";
      if (opts.pruefen?.(sp.key, t.gesellschaftKey)) t.preisPruefen = { quelle: PRUEF_QUELLE_ANGEBOT, am: opts.am ?? new Date().toISOString() };
      anzahl++;
      sparten.add(sp.label);
    }
    for (const b of i.bausteine) {
      const k = sp.schema.bausteine.find((e) => norm(b.name).includes(norm(e.kurz)) || norm(b.name).includes(norm(e.label)))?.key;
      if (!k || t.bausteinStatus[k] === "nein" || t.bausteinStatus[k] === "inklusive") continue;
      if (t.bausteine[k]?.beitrag != null) continue;
      t.bausteinStatus[k] = "optional";
      t.bausteine[k] = { an: b.aktiv, beitrag: t.zahlweise === "jahr" ? Math.round(b.beitrag * 1200) / 100 : b.beitrag };
    }
  }
  return { auswahl: neu, anzahl, sparten: [...sparten] };
}

// ─── Richtwerte „bitte prüfen“ ──────────────────────────────────────────────────────────────

export const PRUEF_QUELLE_ANGEBOT = "Aus dem Angebot gelesen";

/** Gezeigte Tarife mit Beitrag, den der Vermittler noch nicht bestätigt hat (Hinweis vor der Präsentation). */
export function ungepruefteBeitraege(a: Tarifauswahl): { sparte: string; label: string; tarif: string }[] {
  return a.sparten.flatMap((sp) =>
    gezeigteTarife(sp)
      .filter((t) => t.preisPruefen && t.beitrag != null)
      .map((t) => ({ sparte: sp.key, label: sp.label, tarif: t.kurz })),
  );
}
