export const PRODUCTS = ["Wechsel", "Neugeschäft", "Kinderwunsch"] as const;
export type Product = (typeof PRODUCTS)[number];

// Display-Label für die UI. Intern heißt das Produkt weiterhin "Wechsel"
// (Lead.source, Pool-Key, Schema-Spalten leadGoalWechsel etc.), nach außen
// zeigen wir aber "Tarifoptimierung" — das ist die Produktbezeichnung,
// unter der der Kunde es in Airtable und im Vertrieb kennt. Diese
// Indirektion vermeidet die Schema-Migration und das Risiko von Datenverlust
// auf den Customer-Goal-Spalten.
const DISPLAY_LABELS: Record<string, string> = {
  Wechsel: "Tarifoptimierung",
  "PKV Wechsel": "PKV Tarifoptimierung",
  "PKV-Wechsel": "PKV-Tarifoptimierung",
};

export function displayProduct(source: string | null | undefined): string {
  if (!source) return "–";
  return DISPLAY_LABELS[source] ?? source;
}
