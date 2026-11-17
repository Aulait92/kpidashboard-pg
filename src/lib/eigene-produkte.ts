// Eigene Produkte der Kunden (Sparte „Sonstiges“, Ole 14.11.2026): Name und Standardsätze, gespeichert in
// Customer.customProducts. Beim Abschluss vorbelegt und als eigene Auswahl angeboten; die Sätze landen am
// Vertrag (LeadContract.rateAbschluss/rateBestand), damit spätere Änderungen alte Verträge nicht umrechnen.

// Rechenart (Ole, 17.11.2026: „Leben, Kranken und Sach Produkte … bei jedem muss die Berechnung passen“):
//   sach    → rateAbschluss = Anteil vom Jahresbeitrag (0,2 = 20 %), Vertrag in Sparte „sonstiges“
//   leben   → rateAbschluss = Promille der Beitragssumme (25 = 25 ‰), Vertrag in Sparte „leben_bu“ (Laufzeit usw.)
//   kranken → rateAbschluss = Monatsbeiträge (6 = 6 MB), Vertrag in Sparte „krankenzusatz“ (Monatsbeitrag)
// rateBestand ist immer ein Anteil vom Jahresbeitrag pro Jahr. Die Sparte des Vertrags bestimmt die Rechnung;
// ohne Art (ältere Daten) gilt „sach“.
export type ProduktArt = "sach" | "leben" | "kranken";

export type EigenesProdukt = { name: string; art: ProduktArt; rateAbschluss: number; rateBestand: number };

export const PRODUKT_ARTEN: readonly { key: ProduktArt; label: string; sparte: "sonstiges" | "leben_bu" | "krankenzusatz"; einheit: string; kurz: string; max: number }[] = [
  { key: "sach", label: "Sach", sparte: "sonstiges", einheit: "% vom Jahresbeitrag", kurz: "%", max: 200 },
  { key: "leben", label: "Leben", sparte: "leben_bu", einheit: "‰ der Beitragssumme", kurz: "‰", max: 100 },
  { key: "kranken", label: "Kranken", sparte: "krankenzusatz", einheit: "Monatsbeiträge", kurz: "MB", max: 24 },
];

export const asArt = (v: unknown): ProduktArt => (v === "leben" || v === "kranken" ? v : "sach");
export const artInfo = (a: unknown) => PRODUKT_ARTEN.find((x) => x.key === asArt(a))!;

/** Art eines Vertrags mit eigenem Produkt aus seiner Sparte (leben_bu → leben, krankenzusatz → kranken, sonst sach). */
export const artAusSparte = (sparte: string | null | undefined): ProduktArt => (sparte === "leben_bu" ? "leben" : sparte === "krankenzusatz" ? "kranken" : "sach");

/** Eingabe des Abschluss-Satzes je Art in die gespeicherte Einheit; leer = null; ungültig = "invalid". */
export function abschlussAusEingabe(art: ProduktArt, v: unknown): number | null | "invalid" {
  if (art === "sach") return prozentAnteil(v, 200);
  if (v == null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", ".").replace(/[‰%]|MB/gi, "").trim());
  if (!Number.isFinite(n) || n < 0 || n > artInfo(art).max) return "invalid";
  return Math.round(n * 100) / 100;
}

/** Gespeicherter Abschluss-Satz als Eingabetext („20“, „25“, „6“). */
export function abschlussAnzeige(art: ProduktArt, n: number | null | undefined): string {
  if (n == null) return "";
  const v = art === "sach" ? Math.round(n * 10000) / 100 : Math.round(n * 100) / 100;
  return String(v).replace(".", ",");
}

const clamp = (n: unknown, max: number) => {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 10000) / 10000 : null;
};

export const normName = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 60);

export function asEigeneProdukte(v: unknown): EigenesProdukt[] {
  if (!Array.isArray(v)) return [];
  const out: EigenesProdukt[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const name = typeof o.name === "string" ? normName(o.name) : "";
    const art = asArt(o.art);
    const a = clamp(o.rateAbschluss, art === "sach" ? 2 : artInfo(art).max);
    const b = clamp(o.rateBestand, 1);
    if (name.length >= 2 && a != null && b != null && !out.some((p) => p.name.toLowerCase() === name.toLowerCase())) out.push({ name, art, rateAbschluss: a, rateBestand: b });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name, "de"));
}

/** Produkt hinzufügen oder Sätze aktualisieren (gleicher Name, Groß/klein egal). */
export function mitProdukt(list: EigenesProdukt[], p: EigenesProdukt): EigenesProdukt[] {
  const name = normName(p.name);
  return asEigeneProdukte([...list.filter((x) => x.name.toLowerCase() !== name.toLowerCase()), { ...p, name }]);
}

/** Eingabe in Prozent („20“ oder „20,5“) → Anteil; leer = null; ungültig = "invalid". */
export function prozentAnteil(v: unknown, max: number): number | null | "invalid" {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", ".").replace("%", "").trim());
  if (!Number.isFinite(n) || n < 0 || n > max) return "invalid";
  return Math.round(n * 100) / 10000;
}

/**
 * Sparte mit eigenem Produkt als ein Wert für den Abschluss-Dialog (läuft unverändert durch alle Aktionen bis
 * syncPrimaryContract): „sonstiges:{"n":"Hausrat Plus","a":"20","b":"10"}“ (Sätze in Prozent wie eingegeben).
 */
export function encodeSparte(sparte: string, p?: { productName: string; rateAbschluss: string; rateBestand: string; art?: ProduktArt } | null): string {
  if (sparte !== "sonstiges" || !p || !normName(p.productName)) return sparte;
  return `sonstiges:${JSON.stringify({ n: normName(p.productName), a: p.rateAbschluss, b: p.rateBestand, w: asArt(p.art) })}`;
}

export function decodeSparte(v: string | null | undefined): { sparte: string | null; product: EigenesProdukt | null } {
  if (!v) return { sparte: null, product: null };
  if (!v.startsWith("sonstiges:")) return { sparte: v, product: null };
  try {
    const o = JSON.parse(v.slice("sonstiges:".length)) as { n?: unknown; a?: unknown; b?: unknown; w?: unknown };
    const name = typeof o.n === "string" ? normName(o.n) : "";
    const art = asArt(o.w);
    const a = abschlussAusEingabe(art, o.a);
    const b = prozentAnteil(o.b, 100);
    if (name.length < 2 || a === "invalid" || b === "invalid") return { sparte: "sonstiges", product: null };
    // Leben bzw. Kranken: Vertrag in der Sparte mit der passenden Rechenart
    return { sparte: artInfo(art).sparte, product: { name, art, rateAbschluss: a ?? 0, rateBestand: b ?? 0 } };
  } catch {
    return { sparte: "sonstiges", product: null };
  }
}
