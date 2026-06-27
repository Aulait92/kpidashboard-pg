export const PRODUCTS = ["Wechsel", "Neugeschäft", "Kinderwunsch"] as const;
export type Product = (typeof PRODUCTS)[number];

// Display-Label für die UI. Intern heißt das Produkt weiterhin "Wechsel"
// (Lead.source, Pool-Key, canonicalProductKey), nach außen zeigen wir aber
// "Tarifoptimierung" — die Produktbezeichnung, unter der der Kunde es in
// Airtable und im Vertrieb kennt.
const DISPLAY_LABELS: Record<string, string> = {
  Wechsel: "Tarifoptimierung",
  "PKV Wechsel": "PKV Tarifoptimierung",
  "PKV-Wechsel": "PKV-Tarifoptimierung",
};

export function displayProduct(source: string | null | undefined): string {
  if (!source) return "–";
  return DISPLAY_LABELS[source] ?? source;
}

// Normalisiert eine beliebige Produkt-Bezeichnung (Airtable-Klarname, Slug,
// Lead-Lookup) auf einen stabilen Produkt-Schlüssel. Die drei historischen
// Sparten behalten ihre Legacy-Keys ("Wechsel"/"Neugeschäft"/"Kinderwunsch"),
// damit Lead.source, DeliveryPool-Keys und die Customer-Goal-Spalten weiter
// matchen. JEDES andere Produkt (Sterbegeld, Kindersparpläne, …) behält seinen
// echten Namen als Key — so skalieren neue Produkte ohne Code-Änderung durch
// Lead-Klassifizierung, Pool-Ableitung und Budget-Steuerung.
//
// Reihenfolge: Kinderwunsch + Neugeschäft vor Wechsel, weil "wechsel" als
// Substring in einem Neugeschäft-Namen vorkommen könnte. Tarifoptimierung ist
// ein Alias auf Wechsel (gleicher Pool, gleiche Ziele).
export function canonicalProductKey(raw: string): string {
  const n = raw.toLowerCase();
  if (n.includes("kinderwunsch") || n.includes("kiwu")) return "Kinderwunsch";
  if (n.includes("neugesch") || n.includes("neuvertrag")) return "Neugeschäft";
  if (
    n.includes("wechsel") ||
    n.includes("wechsler") ||
    n.includes("tarifoptim") ||
    n.includes("tarif-optim")
  )
    return "Wechsel";
  return raw.trim();
}

// Die drei historischen Sparten, für die Legacy-Customer-Spalten und das
// bestehende Campaign-Matching (classifyProduct) gelten. Neue Produkte laufen
// über den generischen Pfad (Name-Match statt classifyProduct).
export function isLegacyProduct(key: string): boolean {
  return key === "Wechsel" || key === "Neugeschäft" || key === "Kinderwunsch";
}

// Normalisiert einen Namen fürs Keyword-Matching: lowercase + Entfernen von
// Mittelpunkt-Obfuskation (z. B. "Kinder·wunsch"). Der normale Punkt "." wird
// NICHT gestrippt — er ist ein bewusster Ausschluss-Marker (siehe
// isExcludedCampaign); Kampagnen mit Punkt werden vorher komplett übersprungen.
export function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[·•․]/g, "");
}

// Kampagnen, die NICHT in die Cost-/Spend-Berechnung einfließen sollen und im
// Sync komplett übersprungen werden (weder zugeordnet noch als „nicht
// zugeordnet" gelistet):
//   • Name enthält einen Punkt "." — bewusster „ignorieren"-Marker des Buyers.
//   • Name enthält "TEST" als eigenständiges Wort (Test-Kampagnen) — als
//     Wortgrenze, damit z. B. "Attest" nicht fälschlich ausgeschlossen wird.
const TEST_WORD_RE = /\btest\b/i;
export function isExcludedCampaign(campaignName: string): boolean {
  return campaignName.includes(".") || TEST_WORD_RE.test(campaignName);
}

// Reine Keyword-Klassifizierung eines KAMPAGNEN-Namens auf eine der drei
// Legacy-Sparten (Cost-Attribution je Channel). Bewusst ohne DB-Zugriff,
// damit products.ts client-bundle-tauglich bleibt. Neue Produkte werden
// NICHT hier, sondern über den DB-gestützten loadProductMatcher() in
// product-catalog.ts erkannt (Name-/Slug-Match gegen die Produkte-Tabelle).
export function classifyCampaignProduct(campaignName: string): string | null {
  const n = normalizeForMatch(campaignName);
  // Kinderwunsch zuerst — eigenes Vertical, klar über das Keyword erkennbar.
  if (n.includes("kinderwunsch") || n.includes("kiwu")) return "Kinderwunsch";
  // Reihenfolge wichtig: "Neugeschäft" zuerst, falls "wechsel" als Substring
  // in einem Neugeschäft-Namen vorkäme.
  if (
    n.includes("neugeschäft") ||
    n.includes("neugeschaeft") ||
    n.includes("neuvertrag")
  ) {
    return "Neugeschäft";
  }
  // „Wechsel" (Vorgang) ODER „Wechsler" (Person) — letzteres enthält
  // „wechsel" NICHT als Substring. „Tarifoptimierung" zählt als Wechsel-Alias.
  if (
    n.includes("wechsel") ||
    n.includes("wechsler") ||
    n.includes("tarifoptim") ||
    n.includes("tarif-optim")
  )
    return "Wechsel";
  return null;
}

// Bearbeitungsstatus-Werte aus Airtable, die der Buyer im Lead-Detail
// selber setzen darf. Bewusst OHNE "Storno" — der Storno-Flow läuft
// separat über den StornoDialog (mit Pflicht-Grund + optionaler
// Bemerkung) und das Status-Flip übernimmt eine Airtable-Automation.
export const LEAD_STATUS_OPTIONS = [
  "Neuer Lead",
  "Nicht erreicht",
  "Erreicht",
  "Qualifiziert",
  "Termin vereinbart",
  "Angebot/Beratung läuft",
  "Abschluss",
  "Kein Interesse",
] as const;

export type LeadStatus = (typeof LEAD_STATUS_OPTIONS)[number];

export function isValidLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUS_OPTIONS as readonly string[]).includes(value);
}

// Status, die als "Lead wurde erreicht" gewertet werden — synchron zum
// REACHED_STATUSES-Set im Airtable-Sync (siehe airtable.ts). Wird beim
// Pipeline-Drag genutzt, um Lead.reached konsistent mit dem neuen Status
// zu spiegeln, damit die Erreichbarkeits-Kachel sofort stimmt.
const REACHED: ReadonlySet<LeadStatus> = new Set<LeadStatus>([
  "Erreicht",
  "Qualifiziert",
  "Termin vereinbart",
  "Angebot/Beratung läuft",
  "Abschluss",
  "Kein Interesse",
]);

export function isReachedStatus(status: LeadStatus): boolean {
  return REACHED.has(status);
}

export const CLOSED_STATUS: LeadStatus = "Abschluss";

// Pipeline-Phasen — gruppieren mehrere LEAD_STATUS_OPTIONS unter einem
// Sammel-Label. Sowohl das Pipeline-Board (Kanban-Spalten) als auch das
// Bearbeitungsstatus-Dropdown im Lead-Detail bauen darauf auf, damit beide
// dieselbe Sprache sprechen.
//
// defaultStatus = der Status, der beim Phasen-Wechsel gesetzt wird, wenn
// der Lead noch nicht in dieser Phase war. Bleibt der Lead in derselben
// Phase, behält er seinen konkreten Sub-Status (z. B. „Qualifiziert"
// innerhalb von „Im Gespräch").
export type PipelinePhase = {
  key: string;
  label: string;
  statuses: readonly LeadStatus[];
  defaultStatus: LeadStatus;
};

export const PIPELINE_PHASES: readonly PipelinePhase[] = [
  {
    key: "neu",
    label: "Neuer Lead",
    statuses: ["Neuer Lead"],
    defaultStatus: "Neuer Lead",
  },
  {
    key: "nicht-erreicht",
    label: "Nicht erreicht",
    statuses: ["Nicht erreicht"],
    defaultStatus: "Nicht erreicht",
  },
  {
    key: "gespraech",
    label: "Im Gespräch",
    statuses: ["Erreicht", "Qualifiziert"],
    defaultStatus: "Erreicht",
  },
  {
    key: "beratung",
    label: "In Beratung",
    statuses: ["Termin vereinbart", "Angebot/Beratung läuft"],
    defaultStatus: "Termin vereinbart",
  },
  {
    key: "abschluss",
    label: "Abschluss",
    statuses: ["Abschluss"],
    defaultStatus: "Abschluss",
  },
  {
    key: "kein-interesse",
    label: "Kein Interesse",
    statuses: ["Kein Interesse"],
    defaultStatus: "Kein Interesse",
  },
] as const;

export function findPhaseForStatus(
  status: string | null | undefined,
): PipelinePhase | null {
  if (!status) return null;
  return (
    PIPELINE_PHASES.find((p) =>
      (p.statuses as readonly string[]).includes(status),
    ) ?? null
  );
}
