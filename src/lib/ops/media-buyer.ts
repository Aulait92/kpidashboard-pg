// Diagnose-Abfrage „media-buyer“ (Ole, 22.11.2026): nur lesend. Pools mit Ziel, Ist, Hochrechnung, Budget und
// Einstellungen, dazu die letzten Entscheidungen des Media Buyers (Budgetänderungen mit Grund). Gleiche Daten wie
// Liefern › Werbekonten › Tagesbudgets (app/admin/media-buyer/daten.ts). Keine Lead- oder Kundendaten.
//   GET /api/ops/diagnose?q=media-buyer[&pool=<Teil des Schlüssels oder Namens>][&n=50]

import { loadMediaBuyer } from "@/app/admin/media-buyer/daten";

export async function mediaBuyerStatus(p: URLSearchParams) {
  const filter = (p.get("pool") ?? "").trim().toLowerCase();
  const n = Math.min(200, Math.max(1, Number(p.get("n") ?? 50) || 50));
  const { pools, log } = await loadMediaBuyer();
  const passt = (key: string | null, label: string | null) => !filter || `${key ?? ""} ${label ?? ""}`.toLowerCase().includes(filter);
  return {
    pools: pools.filter((x) => passt(x.key, x.label)),
    entscheidungen: log.filter((l) => passt(l.poolKey, l.poolLabel)).slice(0, n),
  };
}
