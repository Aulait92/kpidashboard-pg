// Gründe für „Disqualifiziert“ (Ole, 13.11.2026): zeigen pro Kunde und Produkt, woher schlechte
// Leads kommen – Grundlage, um Formular oder Zielgruppe nachzuschärfen. Rein, auch im Browser nutzbar.

import { lostReasonLabel } from "@/lib/lead-lost";

export const DISQUALIFY_REASONS = [
  { key: "falsche_nummer", label: "Falsche Nummer / nicht erreichbar" },
  { key: "doppelt", label: "Doppelt eingetragen" },
  { key: "fake", label: "Fake- oder Spaß-Eintrag" },
  { key: "kein_bedarf", label: "Kein Bedarf / passt nicht" },
  { key: "region", label: "Außerhalb meiner Region" },
  { key: "sonstiges", label: "Sonstiges" },
] as const;

export type DisqualifyReason = (typeof DISQUALIFY_REASONS)[number]["key"];
export const isDisqualifyReason = (v: unknown): v is DisqualifyReason => DISQUALIFY_REASONS.some((r) => r.key === v);
/** Label eines alten Grundes oder eines Verloren-Grundes (lib/lead-lost.ts, seit 14.11.2026 auch bei „Disqualifiziert“). */
export const disqualifyLabel = (key: string | null | undefined) => DISQUALIFY_REASONS.find((r) => r.key === key)?.label ?? lostReasonLabel(key);
