// „Ihre erste Woche“ im Angebot Pay-per-Lead + Software (Ole, 20.11.2026): Anzeige- und Prüfregeln ohne Datenbank,
// gemeinsam für Admin-Formular, Angebotsseite, Annahme (lib/offers.ts) und Tests. Ablauf: lib/ppl/erste-woche.ts.

import { bestellBetrag, bezugSteuer, type BestellBetrag, type Steuer } from "@/lib/ppl/steuer";

/** Mindestmenge wie bei Wochenbestellungen (lib/ppl/orders.ts MIN_ORDER; hier ohne Server-Import). */
export const ERSTE_WOCHE_MIN = 5;
export const ERSTE_WOCHE_MAX = 2000;
export const ERSTE_WOCHE_STANDARD = 20;

/** Lead-Produkte zur Auswahl im Angebot (wie Bezüge; freie Eingabe bleibt möglich). */
export const ERSTE_WOCHE_PRODUKTE = ["PKV-Tarifoptimierung", "TKV-Katze", "TKV-Hund", "TKV-Pferd", "Privatschutz", "Sterbegeld", "Kindersparplan"] as const;

export type ErsteWoche = { productKey: string; label: string | null; price: number; quantity: number };

/** Erste Woche aus einem Angebot (null = ohne). */
export function ersteWocheAus(o: { package?: string | null; pplProductKey?: string | null; pplLabel?: string | null; pplPrice?: unknown; pplQuantity?: number | null }): ErsteWoche | null {
  if (o.package !== "ppl_software" || !o.pplProductKey?.trim() || o.pplPrice == null) return null;
  const price = Number(o.pplPrice);
  if (!Number.isFinite(price) || price <= 0) return null;
  return { productKey: o.pplProductKey.trim(), label: o.pplLabel?.trim() || null, price, quantity: o.pplQuantity ?? ERSTE_WOCHE_STANDARD };
}

export const ersteWocheName = (w: Pick<ErsteWoche, "productKey" | "label">) => w.label || w.productKey;

/**
 * Betrag der ersten Woche für die Angebotsseite. Der Registerstatus ist vor der Annahme nicht geprüft: Angezeigt wird
 * nach dem Kennzeichen des Produkts (steuerfrei für geprüfte Vermittler), mit Hinweis.
 */
export function ersteWocheBetrag(w: Pick<ErsteWoche, "productKey" | "price">, quantity: number): BestellBetrag & { steuer: Steuer } {
  return bestellBetrag({ price: w.price, quantity, credit: 0, steuer: bezugSteuer({ productKey: w.productKey }) });
}

/** Menge der ersten Woche prüfen (ganze Zahl, 5 bis 2000). */
export function ersteWocheMenge(raw: unknown): number | null {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n >= ERSTE_WOCHE_MIN && n <= ERSTE_WOCHE_MAX ? n : null;
}
