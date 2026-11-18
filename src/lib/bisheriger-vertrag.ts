// Vergleich mit dem bisherigen Vertrag (Paket P3b, Ole 17.11.2026, docs/plan-lead-verlauf.md): Spalte „Ihr bisheriger
// Vertrag“ auf der Vergleichsfolie, ein- und ausblendbar. Quellen in dieser Reihenfolge:
//   1. von Hand (Vermittler trägt ein bzw. korrigiert: Versicherer, Tarif aus dem Katalog, Beitrag, Summe, SB),
//   2. Policen-Auszug (lib/policen/auslesen, nur das bereinigte Feldobjekt aus der Datenbank),
//   3. Chat (Lead.vorvertraege, Gesellschaft und Tarifname, falls genannt).
// Ist der Tarif im Tarifkatalog, kommen dessen Merkmale in die Spalte, sonst nur die Werte der Police. Unbekanntes ist
// neutral „laut Police prüfen“, nie „nicht enthalten“ (auch ein „nein“ aus der Police nicht: maschinell gelesen).
// Darunter Beitragsunterschied pro Jahr und Kündigungstermin (Ablauf bzw. Hauptfälligkeit, Frist).
// Gesundheitssparten (Kranken, BU, Leben, Pflege, Unfall) erst nach Freischaltung der Gesundheitsunterlagen.
//
// Rein, ohne Datenbank (auch im Browser für die Live-Vorschau). Laden: lib/bisheriger-vertrag-server.ts.
// Bewusst ohne Import aus lib/policen/auslesen (Importgrenze, tests/unit/policen-auslesen-grenze.test.ts).

import { gesellschaftAusText, SPARTEN_GRUPPEN, type Katalog, type KatalogTarif, type SchemaEintrag } from "@/lib/tarifkatalog";
import type { Vorvertraege, VertragSparte } from "@/lib/whatsapp/vorvertraege";

/** Unbekannter Wert in der Spalte (neutral, nie „nicht enthalten“). */
export const WERT_PRUEFEN = "laut Police prüfen";

export type BisherQuelle = "hand" | "police" | "chat";

export type BisherVertrag = {
  quelle: BisherQuelle;
  /** null = automatisch (auf der Folie, sobald etwas bekannt ist); sonst vom Vermittler geschaltet */
  zeigen: boolean | null;
  gesellschaft: string | null;
  tarif: string | null;
  /** Treffer im Tarifkatalog („huk-coburg/haftpflicht/classic“) */
  katalogId: string | null;
  /** Merkmale (Schlüssel der Sparte) aus Katalog bzw. Police; was fehlt, ist unbekannt */
  werte: Record<string, string>;
  /** Beitrag in der Zahlweise */
  beitrag: number | null;
  zahlweise: "monat" | "jahr";
  /** Versicherungs- bzw. Deckungssumme und Selbstbeteiligung in Euro */
  summe: number | null;
  sb: number | null;
  /** Ablauf bzw. Hauptfälligkeit (JJJJ-MM-TT) */
  ablauf: string | null;
  /** In der Police genannter nächster Kündigungstermin (JJJJ-MM-TT) */
  kuendbarZum: string | null;
  fristMonate: number | null;
  /** Werte aus der Police, vom Vermittler noch nicht geprüft (Hinweis in der Vorbereitung) */
  ungeprueft?: boolean;
};

// ─── Gesundheitssparten ─────────────────────────────────────────────────────────────────────

/** Sparten des Tarifkatalogs mit Gesundheitsbezug (wie lib/policen/regeln.ts: Kranken, BU, Leben, Pflege, Unfall). */
const GESUNDHEIT = new Set([
  ...SPARTEN_GRUPPEN.filter((g) => ["Leben und Arbeitskraft", "Gesundheit", "Vorsorge"].includes(g.label)).flatMap((g) => g.keys),
  "unfall",
]);
export const istGesundheitssparte = (key: string) => GESUNDHEIT.has(key);

/** Bisheriger Vertrag für diese Sparte erlaubt? Gesundheitssparten nur mit Freischaltung (lib/policen/regeln.ts gesundheitFreigegeben). */
export const bisherErlaubt = (key: string, gesundheitFrei: boolean) => gesundheitFrei || !istGesundheitssparte(key);

// ─── Bereinigen ─────────────────────────────────────────────────────────────────────────────

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
const zahl = (v: unknown, max = 1e9): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < max ? Math.round(v * 100) / 100 : null);
const datum = (v: unknown): string | null => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
};

/** Gespeicherten bzw. vom Browser geschickten Wert lesen; null, wenn es keiner ist. */
export function cleanBisher(raw: unknown): BisherVertrag | null {
  const r = obj(raw);
  const quelle = r.quelle === "police" || r.quelle === "chat" || r.quelle === "hand" ? r.quelle : null;
  if (!quelle) return null;
  const werte: Record<string, string> = {};
  for (const [k, w] of Object.entries(obj(r.werte)).slice(0, 40)) {
    const t = str(w, 60);
    if (t) werte[k.slice(0, 80)] = t;
  }
  const frist = typeof r.fristMonate === "number" && Number.isInteger(r.fristMonate) && r.fristMonate >= 0 && r.fristMonate <= 24 ? r.fristMonate : null;
  return {
    quelle,
    zeigen: typeof r.zeigen === "boolean" ? r.zeigen : null,
    gesellschaft: str(r.gesellschaft, 60),
    tarif: str(r.tarif, 80),
    katalogId: str(r.katalogId, 200),
    werte,
    beitrag: zahl(r.beitrag, 100000),
    zahlweise: r.zahlweise === "jahr" ? "jahr" : "monat",
    summe: zahl(r.summe),
    sb: zahl(r.sb, 1e6),
    ablauf: datum(r.ablauf),
    kuendbarZum: datum(r.kuendbarZum),
    fristMonate: frist,
    ...(r.ungeprueft === true ? { ungeprueft: true } : {}),
  };
}

/** Ist etwas bekannt, das auf der Folie hilft (mehr als nur der Versicherer)? */
export const hatInhalt = (b: BisherVertrag) => b.beitrag != null || !!b.katalogId || Object.keys(b.werte).length > 0 || b.summe != null || b.sb != null;

/** Steht die Spalte auf der Folie? Automatisch, sobald etwas bekannt ist; sonst wie geschaltet. */
export const bisherSichtbar = (b: BisherVertrag | null | undefined): b is BisherVertrag => !!b && (b.zeigen ?? hatInhalt(b));

export const bisherMonat = (b: Pick<BisherVertrag, "beitrag" | "zahlweise">): number | null =>
  b.beitrag == null ? null : Math.round((b.zahlweise === "jahr" ? b.beitrag / 12 : b.beitrag) * 100) / 100;

// ─── Tarifkatalog ───────────────────────────────────────────────────────────────────────────

const norm = (s: string) =>
  s
    .toLocaleLowerCase("de")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9äöüß+]+/g, " ")
    .trim();

/**
 * Tarif im Katalog zu Gesellschaft und Tarifname (aus Police, Chat oder Eingabe): gleicher Name, sonst der längste
 * Kurzname, der als ganzes Wort im Namen steht („Privathaftpflicht Classic PLUS“ → Classic PLUS, nicht Classic).
 * Gesellschaft unbekannt bzw. kein eindeutiger Treffer: null.
 */
export function katalogTarifFinden(k: Pick<Katalog, "tarife">, sparte: string, gesellschaft: string | null | undefined, tarif: string | null | undefined): KatalogTarif | null {
  const g = gesellschaftAusText(gesellschaft) ?? gesellschaftAusText(tarif);
  const t = norm(tarif ?? "");
  if (!g || !t) return null;
  const kandidaten = k.tarife.filter((x) => x.sparte === sparte && x.gesellschaft === g);
  const gleich = kandidaten.find((x) => norm(x.name) === t || norm(x.kurz) === t);
  if (gleich) return gleich;
  const imNamen = kandidaten.filter((x) => norm(x.kurz) && ` ${t} `.includes(` ${norm(x.kurz)} `)).sort((a, b) => norm(b.kurz).length - norm(a.kurz).length);
  if (!imNamen.length) return null;
  if (imNamen.length > 1 && norm(imNamen[0].kurz).length === norm(imNamen[1].kurz).length) return null;
  return imNamen[0];
}

/** Werte eines Katalogtarifs als Spaltenwerte (nur bekannte). */
export function katalogWerte(t: Pick<KatalogTarif, "werte">): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, w] of Object.entries(t.werte)) if (w != null && w.trim()) out[k] = w.trim();
  return out;
}

// ─── Police ─────────────────────────────────────────────────────────────────────────────────

/** Ein ausgelesener Vertrag, wie er in der Datenbank steht (PolicenAuszug, nur die bereinigten Felder). */
export type PoliceKurz = { id: string; sparte: string; felder: unknown; geprueft: boolean; ausgelesenAt: string | null };

/** Sparte des Auslesens (haftpflicht, hausrat, kfz, wohngebaeude, rechtsschutz, pkv, bu, leben) passt zur Katalogsparte? */
export function policePasst(auslesenSparte: string, katalogSparte: string): boolean {
  if (auslesenSparte === katalogSparte) return true;
  if (auslesenSparte === "leben") return ["risikoleben", "rente", "basisrente", "sterbegeld"].includes(katalogSparte);
  if (auslesenSparte === "bu") return ["dienstunfaehigkeit", "grundfaehigkeit"].includes(katalogSparte);
  return false;
}

/** Wert eines Policenfelds (gespeichert als { w, s }); nur der Wert, ohne Status. */
function feldwert(felder: unknown, key: string): unknown {
  const f = obj(obj(felder)[key]);
  return f.w;
}

const euroText = (n: number) => {
  if (n >= 1_000_000) return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n / 1_000_000)} Mio. €`;
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: n % 1 ? 2 : 0, minimumFractionDigits: n % 1 ? 2 : 0 }).format(n)} €`;
};
export const betragText = euroText;

/** Policenfeld → Merkmal (Kurzname bzw. Name im Katalog-Schema, normalisiert). */
const POLICE_MERKMAL: Record<string, string> = {
  deckungssumme: "deckungssumme",
  versicherungssumme: "versicherungssumme",
  selbstbeteiligung: "selbstbeteiligung",
  selbstbehalt: "selbstbehalt",
  schlüsselverlust: "schluesselverlust",
  forderungsausfall: "forderungsausfall",
  elementarschäden: "elementar",
  fahrraddiebstahl: "fahrrad",
};

/** Merkmal-Schlüssel der Sparte → Policenfeld (über Kurzname bzw. Name, gleich geschrieben). */
function policeFeldFuer(m: SchemaEintrag): string | null {
  return POLICE_MERKMAL[norm(m.kurz)] ?? POLICE_MERKMAL[norm(m.label)] ?? null;
}

/** Werte aus der Police für die Merkmale der Sparte: Beträge als Text, „ja“ nur bei ja (ein „nein“ bleibt unbekannt). */
export function policeWerte(felder: unknown, merkmale: SchemaEintrag[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of merkmale) {
    const f = policeFeldFuer(m);
    if (!f) continue;
    const w = feldwert(felder, f);
    if (typeof w === "number" && Number.isFinite(w) && w >= 0) out[m.key] = w === 0 && /selbst/.test(f) ? "keine" : euroText(w);
    else if (w === true) out[m.key] = "ja";
  }
  return out;
}

const RATEN: Record<string, number> = { monatlich: 1, vierteljaehrlich: 3, halbjaehrlich: 6, jaehrlich: 12 };

/** Bisheriger Vertrag aus einem Policen-Auszug (Merkmale aus dem Katalog, falls der Tarif dort steht; Police geht vor). */
export function ausPolice(p: PoliceKurz, sp: { key: string; schema: { merkmale: SchemaEintrag[] } }, k: Pick<Katalog, "tarife">): BisherVertrag {
  const s = (key: string) => str(feldwert(p.felder, key), 80);
  const n = (key: string) => zahl(feldwert(p.felder, key));
  const gesellschaft = s("versicherer");
  const tarif = s("tarifname");
  const kat = katalogTarifFinden(k, sp.key, gesellschaft, tarif);
  const b = n("beitrag");
  const zw = s("zahlweise");
  const rate = zw ? RATEN[zw] : undefined;
  const beitrag = b == null || !rate ? null : rate === 12 ? b : Math.round((b / rate) * 100) / 100;
  const frist = feldwert(p.felder, "kuendigungsfrist_monate");
  return {
    quelle: "police",
    zeigen: null,
    gesellschaft: kat?.gesellschaftName ?? gesellschaft,
    tarif: kat?.kurz ?? tarif,
    katalogId: kat?.id ?? null,
    werte: { ...(kat ? katalogWerte(kat) : {}), ...policeWerte(p.felder, sp.schema.merkmale) },
    beitrag,
    zahlweise: rate === 12 ? "jahr" : "monat",
    summe: n("deckungssumme") ?? n("versicherungssumme"),
    sb: n("selbstbeteiligung") ?? n("selbstbehalt"),
    ablauf: datum(feldwert(p.felder, "ablauf")),
    kuendbarZum: datum(feldwert(p.felder, "naechster_kuendigungstermin")),
    fristMonate: typeof frist === "number" && Number.isInteger(frist) && frist >= 0 && frist <= 24 ? frist : null,
    ...(p.geprueft ? {} : { ungeprueft: true }),
  };
}

// ─── Chat (Lead.vorvertraege) ───────────────────────────────────────────────────────────────

/** Katalogsparte → Sparte in den bestehenden Verträgen laut Lead (lib/whatsapp/vorvertraege.ts). */
export function vertragSparteFuer(key: string): VertragSparte | null {
  const M: Record<string, VertragSparte> = {
    haftpflicht: "Haftpflicht",
    hausrat: "Hausrat",
    wohngebaeude: "Wohngebäude",
    rechtsschutz: "Rechtsschutz",
    unfall: "Unfall",
    bu: "Berufsunfähigkeit",
    dienstunfaehigkeit: "Berufsunfähigkeit",
    grundfaehigkeit: "Berufsunfähigkeit",
    risikoleben: "Risikoleben",
    sterbegeld: "Risikoleben",
    rente: "Altersvorsorge",
    basisrente: "Altersvorsorge",
    kfz: "Kfz",
    zahnzusatz: "Zahnzusatz",
    pkv: "Private Krankenversicherung",
    krankenhauszusatz: "Krankenzusatz",
    ambulant: "Krankenzusatz",
    pflegezusatz: "Pflege",
    "tierhalter-hund": "Tierhalterhaftpflicht",
    "tierhalter-pferd": "Tierhalterhaftpflicht",
  };
  if (M[key]) return M[key];
  return /^(katze|hund|pferd)-(kranken|op)$/.test(key) ? "Tierkranken" : null;
}

/** Bisheriger Vertrag aus dem Chat: nur, wenn der Lead Gesellschaft oder Tarif genannt hat. */
export function ausChat(v: Vorvertraege | null | undefined, sp: { key: string }, k: Pick<Katalog, "tarife">): BisherVertrag | null {
  const vs = vertragSparteFuer(sp.key);
  const x = vs ? v?.liste.find((y) => y.sparte === vs && (y.gesellschaft || y.tarif)) : null;
  if (!x) return null;
  const kat = katalogTarifFinden(k, sp.key, x.gesellschaft, x.tarif);
  return {
    quelle: "chat",
    zeigen: null,
    gesellschaft: kat?.gesellschaftName ?? x.gesellschaft ?? null,
    tarif: kat?.kurz ?? x.tarif ?? null,
    katalogId: kat?.id ?? null,
    werte: kat ? katalogWerte(kat) : {},
    beitrag: null,
    zahlweise: "monat",
    summe: null,
    sb: null,
    ablauf: null,
    kuendbarZum: null,
    fristMonate: null,
  };
}

/** Vorschlag je Sparte: Police (geprüft vor ungeprüft, neueste zuerst), sonst Chat. */
export function bisherVorschlag(
  sp: { key: string; schema: { merkmale: SchemaEintrag[] } },
  q: { policen: PoliceKurz[]; vorvertraege: Vorvertraege | null },
  k: Pick<Katalog, "tarife">,
): BisherVertrag | null {
  const p = q.policen
    .filter((x) => policePasst(x.sparte, sp.key))
    .sort((a, b) => Number(b.geprueft) - Number(a.geprueft) || (b.ausgelesenAt ?? "").localeCompare(a.ausgelesenAt ?? ""))[0];
  return p ? ausPolice(p, sp, k) : ausChat(q.vorvertraege, sp, k);
}

// ─── Abgleich mit der gespeicherten Auswahl ─────────────────────────────────────────────────

type MitBisher = { key: string; schema: { merkmale: SchemaEintrag[] }; bisher?: BisherVertrag | null };

/** Vergleich ohne Schalter und unabhängig von der Reihenfolge der Schlüssel (JSONB sortiert sie um). */
const kanonisch = (v: unknown): unknown =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, x]) => x !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, x]) => [key, kanonisch(x)]),
      )
    : v;
const ohneSchalter = (b: BisherVertrag) => JSON.stringify(kanonisch({ ...b, zeigen: null }));

/**
 * Vorschläge in die Auswahl übernehmen (beim Laden der Terminvorbereitung). Von Hand Eingetragenes bleibt. Aus Police
 * bzw. Chat Übernommenes folgt der Quelle: neue bzw. korrigierte Werte kommen nach, eine gelöschte Police nimmt die
 * Spalte wieder heraus (nichts bleibt länger als die Unterlage). Der Schalter „Auf der Folie“ bleibt, wie er war.
 * Gesundheitssparten ohne Freischaltung: keine Spalte. geaendert = neu speichern.
 */
export function bisherAbgleichen<T extends MitBisher>(sparten: T[], vorschlag: (sp: T) => BisherVertrag | null, gesundheitFrei: boolean): { sparten: T[]; geaendert: boolean } {
  let geaendert = false;
  const ohne = (sp: T): T => {
    geaendert = true;
    const c = { ...sp };
    delete c.bisher;
    return c;
  };
  const out = sparten.map((sp) => {
    const alt = sp.bisher ?? null;
    if (!bisherErlaubt(sp.key, gesundheitFrei)) return alt ? ohne(sp) : sp;
    if (alt?.quelle === "hand") return sp;
    const neu = vorschlag(sp);
    if (!neu) return alt ? ohne(sp) : sp;
    if (alt && ohneSchalter(alt) === ohneSchalter(neu)) return sp;
    geaendert = true;
    return { ...sp, bisher: { ...neu, zeigen: alt?.zeigen ?? null } };
  });
  return { sparten: out, geaendert };
}

// ─── Spalte für die Folie ───────────────────────────────────────────────────────────────────

/** Spalte „Ihr bisheriger Vertrag“ in den Angeboten (AngeboteDaten.bisher), je Sparte (Anzeigename wie AngebotItem.sparte). */
export type BisherSpalte = {
  sparte: string;
  gesellschaft: string | null;
  tarif: string | null;
  beitragMonat: number | null;
  /** „Deckungssumme 50 Mio. €“, „Selbstbeteiligung 150 €“ (nur Bekanntes) */
  info: string[];
  /** Werte zu den Merkmalen der Folie (Name wie AngebotItem.merkmale) */
  merkmale: { name: string; wert: string }[];
  ablauf: string | null;
  kuendbarZum: string | null;
  fristMonate: number | null;
};

/** „Deckungssumme“ (Haftpflicht, Tierhalter, Kfz) bzw. „Versicherungssumme“. */
export const summeLabelFuer = (key: string) => (/^(haftpflicht|tierhalter-|kfz)/.test(key) ? "Deckungssumme" : "Versicherungssumme");

/**
 * Spalte aus dem bisherigen Vertrag für die gezeigten Merkmale (Schlüssel und Kurzname in Folienreihenfolge). Summe und
 * Selbstbeteiligung von Hand bzw. aus der Police gehen in die passende Zeile, sonst unter den Tarifnamen.
 */
export function bisherSpalte(sparte: { key: string; label: string }, b: BisherVertrag, merkmale: { key: string; name: string }[]): BisherSpalte {
  const art = (name: string) => {
    const f = POLICE_MERKMAL[norm(name)];
    return f === "deckungssumme" || f === "versicherungssumme" ? "summe" : f === "selbstbeteiligung" || f === "selbstbehalt" ? "sb" : null;
  };
  const sbText = (n: number) => (n === 0 ? "keine" : euroText(n));
  const zeile = (m: { key: string; name: string }) => {
    if (art(m.name) === "summe" && b.summe != null) return euroText(b.summe);
    if (art(m.name) === "sb" && b.sb != null) return sbText(b.sb);
    return b.werte[m.key] ?? WERT_PRUEFEN;
  };
  const info = [
    b.summe != null && !merkmale.some((m) => art(m.name) === "summe") ? `${summeLabelFuer(sparte.key)} ${euroText(b.summe)}` : null,
    b.sb != null && !merkmale.some((m) => art(m.name) === "sb") ? (b.sb === 0 ? "ohne Selbstbeteiligung" : `Selbstbeteiligung ${euroText(b.sb)}`) : null,
  ].filter((x): x is string => !!x);
  return {
    sparte: sparte.label,
    gesellschaft: b.gesellschaft,
    tarif: b.tarif,
    beitragMonat: bisherMonat(b),
    info,
    merkmale: merkmale.map((m) => ({ name: m.name, wert: zeile(m) })),
    ablauf: b.ablauf,
    kuendbarZum: b.kuendbarZum,
    fristMonate: b.fristMonate,
  };
}

export function cleanBisherSpalten(raw: unknown): BisherSpalte[] {
  return (Array.isArray(raw) ? raw : []).slice(0, 12).flatMap((x): BisherSpalte[] => {
    const r = obj(x);
    const sparte = str(r.sparte, 60);
    if (!sparte) return [];
    const merkmale = (Array.isArray(r.merkmale) ? r.merkmale : []).slice(0, 14).flatMap((m) => {
      const o = obj(m);
      const name = str(o.name, 60);
      return name ? [{ name, wert: str(o.wert, 60) ?? WERT_PRUEFEN }] : [];
    });
    const frist = typeof r.fristMonate === "number" && Number.isInteger(r.fristMonate) && r.fristMonate >= 0 && r.fristMonate <= 24 ? r.fristMonate : null;
    return [
      {
        sparte,
        gesellschaft: str(r.gesellschaft, 60),
        tarif: str(r.tarif, 80),
        beitragMonat: zahl(r.beitragMonat, 100000),
        info: (Array.isArray(r.info) ? r.info : []).map((i) => str(i, 60)).filter((i): i is string => !!i).slice(0, 3),
        merkmale,
        ablauf: datum(r.ablauf),
        kuendbarZum: datum(r.kuendbarZum),
        fristMonate: frist,
      },
    ];
  });
}

// ─── Kündigung und Beitragsunterschied ──────────────────────────────────────────────────────

const plusMonate = (iso: string, m: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  const tag = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + m);
  const letzter = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(tag, letzter));
  return d.toISOString().slice(0, 10);
};

/**
 * Nächster Kündigungstermin ab heute: genannter Termin, sonst Ablauf bzw. Hauptfälligkeit jährlich fortgeschrieben, bis
 * die Frist noch erreichbar ist. bis = spätester Eingang der Kündigung (nur mit bekannter Frist). null ohne Datum.
 */
export function naechsteKuendigung(b: Pick<BisherSpalte, "ablauf" | "kuendbarZum" | "fristMonate">, heute: string): { zum: string; bis: string | null } | null {
  const frist = b.fristMonate;
  if (b.kuendbarZum && b.kuendbarZum >= heute) return { zum: b.kuendbarZum, bis: frist != null ? plusMonate(b.kuendbarZum, -frist) : null };
  const start = b.ablauf ?? b.kuendbarZum;
  if (!start) return null;
  let zum = start;
  for (let i = 0; i < 80 && (frist != null ? plusMonate(zum, -frist) : zum) < heute; i++) zum = plusMonate(zum, 12);
  return { zum, bis: frist != null ? plusMonate(zum, -frist) : null };
}

const tagText = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

/** Hinweis zur Kündigung für die Folie (ohne Anrede; Satzanfang ergänzt der Aufrufer). */
export function kuendigungText(b: Pick<BisherSpalte, "ablauf" | "kuendbarZum" | "fristMonate">, heute: string): string {
  const k = naechsteKuendigung(b, heute);
  if (!k) return "Kündigungsfrist laut Police prüfen.";
  if (!k.bis) return `kündbar zum ${tagText(k.zum)}, Kündigungsfrist laut Police prüfen.`;
  return `kündbar zum ${tagText(k.zum)} (Kündigung bis ${tagText(k.bis)}).`;
}

/** Beitragsunterschied im Jahr: neu minus bisher (negativ = günstiger); null ohne beide Beiträge. */
export function beitragsUnterschiedJahr(neuMonat: number | null | undefined, bisherMonat: number | null | undefined): number | null {
  if (neuMonat == null || bisherMonat == null) return null;
  return Math.round((neuMonat - bisherMonat) * 12 * 100) / 100;
}

/** „23,40 € weniger im Jahr als bisher“ bzw. „… mehr …“ bzw. „gleicher Beitrag wie bisher“. */
export function unterschiedText(diff: number): string {
  const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Math.abs(diff));
  if (Math.abs(diff) < 0.01) return "gleicher Beitrag wie bisher";
  return diff < 0 ? `${eur} weniger im Jahr als bisher` : `${eur} mehr im Jahr als bisher`;
}

/** Leerer Eintrag von Hand (Formular „Bisheriger Vertrag“), vorbelegt mit dem, was schon bekannt ist. */
export function bisherHand(alt: BisherVertrag | null | undefined): BisherVertrag {
  return {
    quelle: "hand",
    zeigen: alt?.zeigen ?? null,
    gesellschaft: alt?.gesellschaft ?? null,
    tarif: alt?.tarif ?? null,
    katalogId: alt?.katalogId ?? null,
    werte: { ...(alt?.werte ?? {}) },
    beitrag: alt?.beitrag ?? null,
    zahlweise: alt?.zahlweise ?? "monat",
    summe: alt?.summe ?? null,
    sb: alt?.sb ?? null,
    ablauf: alt?.ablauf ?? null,
    kuendbarZum: alt?.kuendbarZum ?? null,
    fristMonate: alt?.fristMonate ?? null,
  };
}
