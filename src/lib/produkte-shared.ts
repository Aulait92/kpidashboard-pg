// Typen und Konstanten des Tabs „Produkte“ (auch im Browser nutzbar, ohne Datenbank).

export const LOW_SAMPLE = 10;
export const NO_PRODUCT = "Ohne Produkt";

export type ProductStats = {
  key: string;
  label: string;
  leads: number;
  cost: number | null;
  cpl: number | null;
  appointments: number;
  appointmentRate: number | null;
  closes: number;
  closeRate: number | null;
  premiumsReported: number;
  premiumSum: number;
  provision: number;
  pplRevenue: number;
  lowSample: boolean;
};

export type MatrixCell = { leads: number; cost: number | null; costShared: boolean; cpl: number | null; closes: number; closeRate: number | null; lowSample: boolean };
export type MatrixRow = { customerId: string; name: string; leads: number; cells: Record<string, MatrixCell> };

export const PRODUKT_RANGES = [
  { key: "30", label: "Letzte 30 Tage" },
  { key: "90", label: "Letzte 90 Tage" },
  { key: "monat", label: "Dieser Monat" },
  { key: "vormonat", label: "Letzter Monat" },
  { key: "jahr", label: "Dieses Jahr" },
  { key: "max", label: "Seit Juni 2026" },
] as const;
export type ProduktRange = (typeof PRODUKT_RANGES)[number]["key"];

export type ProdukteData = { range: ProduktRange; from: string; to: string; products: ProductStats[]; matrix: MatrixRow[]; productOrder: { key: string; label: string }[] };
