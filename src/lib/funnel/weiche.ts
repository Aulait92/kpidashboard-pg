// Weiche eigener Funnel gegen Perspective (Ole, 21.11.2026): Die PKV-Anzeigen zeigen auf beitrag.pkv-tarife.com/go.
// Jeder Aufruf geht zufällig zu WEICHE_ANTEIL_EIGEN (Standard 50 %) in unseren Funnel, sonst zu Perspective. Ohne
// Cookie (keine Einwilligung nötig, L4): Neu laden kann die Seite wechseln. Query (utm_*, fbclid, campaign_id …) wird
// mitgegeben. Gemessen wird je Aufruf (FunnelEreignis schritt „weiche“, variante „eigen“ | „perspective“); Vergleich
// über Leads und Erreichbarkeit (Perspective-Leads kommen als PoolLead mit externalId „perspective:…“).

export const PERSPECTIVE_URL_DEFAULT = "https://start.pkv-tarife.com/beitrag-halbieren/";
export type WeichenArm = "eigen" | "perspective";

/** Anteil für unseren Funnel aus der Umgebung (0 bis 1, Standard 0,5). (rein) */
export function anteilEigen(raw: string | null | undefined): number {
  const n = Number(String(raw ?? "").replace(",", "."));
  return raw != null && raw !== "" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
}

/** Arm aus einer Zufallszahl [0, 1). (rein) */
export function weichenArm(zufall: number, anteil: number): WeichenArm {
  return zufall < anteil ? "eigen" : "perspective";
}

/** Ziel-URL je Arm, Query unverändert angehängt. (rein) */
export function weichenZiel(arm: WeichenArm, search: string, opts: { perspectiveUrl?: string | null } = {}): string {
  const q = search.startsWith("?") ? search.slice(1) : search;
  if (arm === "eigen") return `/${q ? `?${q}` : ""}`;
  const base = opts.perspectiveUrl?.trim() || PERSPECTIVE_URL_DEFAULT;
  if (!q) return base;
  return `${base}${base.includes("?") ? "&" : "?"}${q}`;
}
