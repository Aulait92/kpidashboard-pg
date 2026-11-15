// Angebote im Termin (Ole, 15.11.2026): Typen und reine Funktionen (Bereinigen, Summe, Stufe/Sparte/Baustein
// umschalten). Ohne KI und ohne Server-Importe, damit auch die Demo im Browser damit rechnen kann (/demo/beratung).
// Auslesen per KI: src/lib/angebote.ts.

const MAX_ITEMS = 20; // z. B. 4 Sparten mit je 4 Stufen (Allianz Basis, Smart, Komfort, Premium)

/**
 * Zusatzbaustein mit eigenem Monatsbeitrag aus dem Tarifrechner (Ole, 15.11.2026): Im Termin schaltet der Berater
 * Bausteine per Klick an oder ab, der Beitrag rechnet sich neu. Negativer Beitrag = Ersparnis (z. B. höhere SB).
 */
export type Baustein = { name: string; beitrag: number; aktiv: boolean };

export type AngebotItem = {
  sparte: string;
  gesellschaft: string | null;
  tarif: string | null;
  beitragMonat: number | null;
  selbstbeteiligung: string | null;
  leistungen: string[];
  ausschluesse: string[];
  empfohlen: boolean;
  /** Im Termin gewählte Stufe (Standard: die Empfehlung); Beitrag und Leistungen richten sich danach */
  gewaehlt: boolean;
  /** Vergleichsmerkmale je Stufe, z. B. Versicherungssumme: 75 Mio. €; „ja“/„nein“ werden zu ✓/— */
  merkmale: { name: string; wert: string }[];
  /** Beitrag pro Monat = beitragMonat (ohne Bausteine) + aktive Bausteine */
  bausteine: Baustein[];
};

export type AngeboteDaten = { items: AngebotItem[]; quelle: string[] };

const str = (v: unknown, max = 120): string | null => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
const list = (v: unknown, n: number): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, 160)).filter((x): x is string => !!x).slice(0, n) : [];
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")) : NaN;
  return Number.isFinite(n) && n >= 0 && n < 100000 ? Math.round(n * 100) / 100 : null;
};

const signed = (v: unknown): number | null => {
  if (typeof v === "string" && /^\s*[-−]/.test(v)) {
    const n = num(v.replace(/^\s*[-−]/, ""));
    return n == null ? null : -n;
  }
  const n = typeof v === "number" && v < 0 ? num(-v) : null;
  return n != null ? -n : num(v);
};

const MAX_BAUSTEINE = 6;

function cleanBausteine(v: unknown): Baustein[] {
  return (Array.isArray(v) ? v : []).slice(0, MAX_BAUSTEINE).flatMap((x): Baustein[] => {
    if (!x || typeof x !== "object") return [];
    const r = x as Record<string, unknown>;
    const name = str(r.name, 60);
    const beitrag = signed(r.beitrag);
    return name && beitrag != null && Math.abs(beitrag) < 10000 ? [{ name, beitrag, aktiv: r.aktiv !== false }] : [];
  });
}

function cleanMerkmale(v: unknown): { name: string; wert: string }[] {
  return (Array.isArray(v) ? v : []).slice(0, 14).flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const r = x as Record<string, unknown>;
    const name = str(r.name, 60);
    const wert = str(r.wert, 40) ?? "nein";
    return name ? [{ name, wert }] : [];
  });
}

/** Beitrag pro Monat mit den aktiven Bausteinen; null ohne Grundbeitrag. */
export function beitragEffektiv(i: Pick<AngebotItem, "beitragMonat" | "bausteine">): number | null {
  if (i.beitragMonat == null) return null;
  const n = i.beitragMonat + i.bausteine.filter((b) => b.aktiv).reduce((s, b) => s + b.beitrag, 0);
  return Math.max(0, Math.round(n * 100) / 100);
}

/** Gespeicherte bzw. eingegebene Angebote defensiv lesen. Genau eine Empfehlung je Sparte höchstens. */
export function cleanAngebote(raw: unknown): AngeboteDaten {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const items = (Array.isArray(o.items) ? o.items : []).slice(0, MAX_ITEMS).flatMap((x): AngebotItem[] => {
    if (!x || typeof x !== "object") return [];
    const r = x as Record<string, unknown>;
    const sparte = str(r.sparte, 60);
    if (!sparte) return [];
    return [
      {
        sparte,
        gesellschaft: str(r.gesellschaft, 60),
        tarif: str(r.tarif, 80),
        beitragMonat: num(r.beitragMonat),
        selbstbeteiligung: str(r.selbstbeteiligung, 60),
        leistungen: list(r.leistungen, 6),
        ausschluesse: list(r.ausschluesse, 4),
        empfohlen: r.empfohlen === true,
        gewaehlt: typeof r.gewaehlt === "boolean" ? r.gewaehlt : r.empfohlen === true,
        merkmale: cleanMerkmale(r.merkmale),
        bausteine: cleanBausteine(r.bausteine),
      },
    ];
  });
  const quelle = Array.isArray(o.quelle) ? o.quelle.map((q) => str(q, 120)).filter((q): q is string => !!q).slice(0, 10) : [];
  return { items, quelle };
}

/** Gewählte Angebote: je Sparte die im Termin gewählte Stufe, sonst die Empfehlung. */
export function gewaehlte(d: AngeboteDaten): AngebotItem[] {
  return d.items.filter((i) => i.gewaehlt);
}

/** Summe der gewählten Angebote je Monat (für die Präsentation); null ohne Beiträge. */
export function summeEmpfohlen(d: AngeboteDaten): number | null {
  const rec = gewaehlte(d).filter((i) => i.beitragMonat != null);
  return rec.length ? Math.round(rec.reduce((s, i) => s + (beitragEffektiv(i) ?? 0), 0) * 100) / 100 : null;
}

/** Stufe im Termin wählen: diese an, die anderen derselben Sparte ab. Herausnehmen geht über sparteSchalten. null, wenn es sie nicht gibt. */
export function tarifWaehlen(d: AngeboteDaten, item: number): AngeboteDaten | null {
  const it = d.items[item];
  if (!it) return null;
  return { ...d, items: d.items.map((x, i) => (x.sparte === it.sparte ? { ...x, gewaehlt: i === item } : x)) };
}

/** Ganze Sparte im Termin ab- bzw. wieder zuwählen (dann mit der Empfehlung, sonst der ersten Stufe). */
export function sparteSchalten(d: AngeboteDaten, item: number): AngeboteDaten | null {
  const it = d.items[item];
  if (!it) return null;
  const gleiche = d.items.filter((x) => x.sparte === it.sparte);
  const an = !gleiche.some((x) => x.gewaehlt);
  const ziel = an ? (gleiche.find((x) => x.empfohlen) ?? gleiche[0]) : null;
  return { ...d, items: d.items.map((x) => (x.sparte !== it.sparte ? x : { ...x, gewaehlt: x === ziel })) };
}

/** Baustein an- bzw. abschalten (Index im Angebot und im Baustein); null, wenn es ihn nicht gibt. */
export function bausteinSchalten(d: AngeboteDaten, item: number, baustein: number, aktiv: boolean): AngeboteDaten | null {
  const it = d.items[item];
  if (!it?.bausteine[baustein]) return null;
  return {
    ...d,
    items: d.items.map((x, i) => (i === item ? { ...x, bausteine: x.bausteine.map((b, j) => (j === baustein ? { ...b, aktiv } : b)) } : x)),
  };
}
