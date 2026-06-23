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
    key: "nicht-erreicht",
    label: "Nicht erreicht",
    statuses: ["Nicht erreicht", "Not reached"],
    defaultStatus: "Nicht erreicht",
    winProbability: 0.1,
    accent: "border-t-orange-400",
  },
  {
    key: "wiedervorlage",
    label: "Wiedervorlage",
    statuses: ["Wiedervorlage", "Follow-up"],
    defaultStatus: "Wiedervorlage",
    winProbability: 0.15,
    accent: "border-t-orange-500",
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
    label: "Video-Sales-Call vereinbart",
    statuses: [
      "Video-Sales-Call vereinbart",
      "Video Sales Call vereinbart",
      "Video-Sales-Call",
      "Video Sales Call",
      "VSC",
      "Termin vereinbart",
      "Qualifiziert",
    ],
    defaultStatus: "Video-Sales-Call vereinbart",
    winProbability: 0.45,
    accent: "border-t-blue-500",
  },
  {
    key: "angebot-senden",
    label: "Angebot senden",
    statuses: ["Angebot senden", "Angebot vorbereiten"],
    defaultStatus: "Angebot senden",
    winProbability: 0.6,
    accent: "border-t-blue-500",
  },
  {
    key: "angebot-verschickt",
    label: "Angebot verschickt",
    statuses: [
      "Angebot verschickt",
      "Angebot raus",
      "Angebot rausgeschickt",
      "Angebot",
      "Proposal",
    ],
    defaultStatus: "Angebot verschickt",
    winProbability: 0.75,
    accent: "border-t-blue-600",
  },
  {
    key: "testlauf",
    label: "Testlauf",
    statuses: ["Testlauf", "Pilot", "Trial"],
    defaultStatus: "Testlauf",
    winProbability: 0.9,
    accent: "border-t-violet-500",
  },
  {
    key: "gewonnen",
    label: "Serienbetrieb",
    statuses: ["Serienbetrieb", "Gewonnen", "Won", "Closed Won"],
    defaultStatus: "Serienbetrieb",
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

// Phasen, in denen ein Lead noch NICHT als erreicht zählt. Alles ab
// "Setter-Call vereinbart" gilt als erreicht — wir hatten Kontakt, auch
// wenn der Deal dann später verloren geht.
const NOT_REACHED_PHASE_KEYS: ReadonlySet<string> = new Set([
  "neuer-lead",
  "nicht-erreicht",
  "wiedervorlage",
]);

export function isReachedStatus(
  status: string | null | undefined,
): boolean {
  const phase = findSalesPhaseForStatus(status);
  if (!phase) return false;
  return !NOT_REACHED_PHASE_KEYS.has(phase.key);
}

// Priorität-Score: gewichteter Deal-Wert × Urgency-Boost. Boost
// kommt aus dem zeitlichen Abstand zur nächsten geplanten Aktivität —
// Deals, die heute / diese Woche dran sind, springen nach oben.
//
// Score = 0 wenn weder Wert noch Win-Probability vorhanden — sortiert
// solche Deals ans Ende, ohne sie zu verstecken.
const URGENCY_BOOST_TODAY = 2;
const URGENCY_BOOST_THIS_WEEK = 1.5;
const URGENCY_BOOST_THIS_MONTH = 1.2;

export function priorityScore(opts: {
  value: number | null;
  status: string | null | undefined;
  nextActivityAt: Date | null;
  now: Date;
}): number {
  const base = (opts.value ?? 0) * winProbabilityFor(opts.status);
  if (base <= 0) return 0;
  let boost = 1;
  if (opts.nextActivityAt) {
    const days =
      (opts.nextActivityAt.getTime() - opts.now.getTime()) /
      (1000 * 60 * 60 * 24);
    if (days <= 1) boost = URGENCY_BOOST_TODAY;
    else if (days <= 7) boost = URGENCY_BOOST_THIS_WEEK;
    else if (days <= 30) boost = URGENCY_BOOST_THIS_MONTH;
  }
  return Math.round(base * boost);
}

// Stale = "hier liegt was brach": kein zukünftiger Termin geplant UND
// seit > 7 Tagen keine Activity (oder: Deal seit > 7 Tagen erstellt
// ohne je eine Activity bekommen zu haben). Terminale Phasen
// (Serienbetrieb, Verloren) sind nie stale — die brauchen keine
// Folge-Aktion.
const STALE_DAYS = 7;

export function isStaleDeal(opts: {
  status: string | null | undefined;
  nextActivityAt: Date | null;
  lastActivityAt: Date | null;
  createdAt: Date;
  now: Date;
}): boolean {
  const phase = findSalesPhaseForStatus(opts.status);
  if (phase?.terminal) return false;
  if (opts.nextActivityAt && opts.nextActivityAt > opts.now) return false;
  const reference = opts.lastActivityAt ?? opts.createdAt;
  const daysSince =
    (opts.now.getTime() - reference.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > STALE_DAYS;
}
