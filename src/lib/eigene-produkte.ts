// Eigene Produkte der Kunden (Sparte „Sonstiges“, Ole 14.11.2026): Name und Standardsätze, gespeichert in
// Customer.customProducts. Beim Abschluss vorbelegt und als eigene Auswahl angeboten; die Sätze landen am
// Vertrag (LeadContract.rateAbschluss/rateBestand), damit spätere Änderungen alte Verträge nicht umrechnen.

export type EigenesProdukt = { name: string; rateAbschluss: number; rateBestand: number };

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
    const a = clamp(o.rateAbschluss, 2);
    const b = clamp(o.rateBestand, 1);
    if (name.length >= 2 && a != null && b != null && !out.some((p) => p.name.toLowerCase() === name.toLowerCase())) out.push({ name, rateAbschluss: a, rateBestand: b });
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
export function encodeSparte(sparte: string, p?: { productName: string; rateAbschluss: string; rateBestand: string } | null): string {
  if (sparte !== "sonstiges" || !p || !normName(p.productName)) return sparte;
  return `sonstiges:${JSON.stringify({ n: normName(p.productName), a: p.rateAbschluss, b: p.rateBestand })}`;
}

export function decodeSparte(v: string | null | undefined): { sparte: string | null; product: EigenesProdukt | null } {
  if (!v) return { sparte: null, product: null };
  if (!v.startsWith("sonstiges:")) return { sparte: v, product: null };
  try {
    const o = JSON.parse(v.slice("sonstiges:".length)) as { n?: unknown; a?: unknown; b?: unknown };
    const name = typeof o.n === "string" ? normName(o.n) : "";
    const a = prozentAnteil(o.a, 200);
    const b = prozentAnteil(o.b, 100);
    if (name.length < 2 || a === "invalid" || b === "invalid") return { sparte: "sonstiges", product: null };
    return { sparte: "sonstiges", product: { name, rateAbschluss: a ?? 0, rateBestand: b ?? 0 } };
  } catch {
    return { sparte: "sonstiges", product: null };
  }
}
