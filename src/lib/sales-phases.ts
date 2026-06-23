// Client-safe Sales-Phasen-Definitionen — keine Prisma-/Server-Imports,
// damit dieses Modul gefahrlos in Client-Components (sales-kanban-board)
// gebündelt werden kann. Server-only-Code (Sync, KPI-Aggregation) liegt
// in lib/sales.ts und re-exportiert hier definierte Typen.
//
// SALES_PIPELINE_PHASES = Spalten im Pipeline-Kanban + Phase-Default-
// Status beim Verschieben. Status-Strings müssen mit den Single-Select-
// Werten in Airtable übereinstimmen — vor dem ersten Live-Test prüfen +
// ggf. anpassen.
export type SalesPhase = {
  key: string;
  label: string;
  statuses: readonly string[];
  defaultStatus: string;
  // Win-Wahrscheinlichkeit für die gewichtete Pipeline (0..1).
  winProbability: number;
  // UI-Akzent (Tailwind border-t-Color).
  accent: string;
  // Spezial-Flag für Sieg/Niederlage — beeinflusst KPI-Buckets (Win-Rate,
  // Loss-Reasons). Ohne den Flag ist die Phase "in-progress".
  terminal?: "won" | "lost";
};

export const SALES_PIPELINE_PHASES: readonly SalesPhase[] = [
  {
    key: "neuer-lead",
    label: "Neuer Lead",
    statuses: ["Neuer Lead", "Neu", "New", "Lead"],
    defaultStatus: "Neuer Lead",
    winProbability: 0.05,
    accent: "border-t-zinc-400",
  },
  {
    key: "setter-call-vereinbart",
    label: "Setter-Call vereinbart",
    statuses: [
      "Setter-Call vereinbart",
      "Setter Call vereinbart",
      // Alte "Setter-Call erfolgreich"-Datensätze landen hier, bis der
      // Berater sie via Drag auf Video-Sales-Call schiebt.
      "Setter-Call erfolgreich",
      "Setter Call erfolgreich",
    ],
    defaultStatus: "Setter-Call vereinbart",
    winProbability: 0.2,
    accent: "border-t-amber-500",
  },
  {
    key: "video-sales-call",
    label: "Video-Sales-Call",
    statuses: [
      "Video-Sales-Call",
      "Video Sales Call",
      "VSC",
      "Termin vereinbart",
      "Qualifiziert",
    ],
    defaultStatus: "Video-Sales-Call",
    winProbability: 0.45,
    accent: "border-t-blue-500",
  },
  {
    key: "angebot-raus",
    label: "Angebot raus",
    statuses: ["Angebot raus", "Angebot rausgeschickt", "Angebot", "Proposal"],
    defaultStatus: "Angebot raus",
    winProbability: 0.75,
    accent: "border-t-blue-600",
  },
  {
    key: "gewonnen",
    label: "Gewonnen",
    statuses: ["Gewonnen", "Won", "Closed Won"],
    defaultStatus: "Gewonnen",
    winProbability: 1,
    accent: "border-t-emerald-500",
    terminal: "won",
  },
  {
    key: "verloren",
    label: "Verloren",
    statuses: ["Verloren", "Lost", "Closed Lost"],
    defaultStatus: "Verloren",
    winProbability: 0,
    accent: "border-t-rose-400",
    terminal: "lost",
  },
] as const;

export function findSalesPhaseForStatus(
  status: string | null | undefined,
): SalesPhase | null {
  if (!status) return null;
  return (
    SALES_PIPELINE_PHASES.find((p) =>
      (p.statuses as readonly string[]).includes(status),
    ) ?? null
  );
}

export function winProbabilityFor(status: string | null | undefined): number {
  return findSalesPhaseForStatus(status)?.winProbability ?? 0.1;
}
