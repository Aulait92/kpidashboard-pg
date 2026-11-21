// Eigene Adressen der Funnels (Ole, 20.11.2026): beitrag.pkv-tarife.com zeigt den PKV-Funnel (/f/pkv-beitrag), ohne
// dass dort andere Seiten der App erreichbar sind. Zuordnung über FUNNEL_HOSTS („host=funnel,host2=funnel2“), Standard
// beitrag.pkv-tarife.com=pkv-beitrag. Dazu die Besucher-ID für Messung und A/B-Tests: seit 20.11.2026 ohne Cookie
// (Auflage L4, docs/recht/pkv-funnel.md), je Seitenaufruf auf dem Server erzeugt und nur im Seitenzustand gehalten.
// Reine Funktionen ohne Imports: läuft in der Middleware (src/middleware.ts) und in Tests.

export const FUNNEL_HOSTS_DEFAULT = "beitrag.pkv-tarife.com=pkv-beitrag";

/**
 * Früherer Cookie mit der Besucher-ID (bis 20.11.2026). Wird nicht mehr gesetzt (L4); ein vorhandener wird gelöscht.
 */
export const ALTER_BESUCH_COOKIE = "pf_bid";

/** Pfade, die die Funnel-Adresse außer dem Funnel selbst braucht (Next.js-Dateien, Icons, Marken-Dateien, Messung, Fehlerberichte). */
const SUPPORT = ["/_next", "/api/funnel", "/icon", "/apple-icon", "/favicon.ico", "/marken", "/monitoring", "/api/csp-report"];
/** Unterseiten des Funnels, auf der Funnel-Adresse ohne /f/<funnel> erreichbar (z. B. /partner → /f/pkv-beitrag/partner). */
const UNTERSEITEN = ["/partner", "/go"];

const under = (p: string, prefix: string) => p === prefix || p.startsWith(`${prefix}/`);

export function parseFunnelHosts(raw: string | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (raw ?? FUNNEL_HOSTS_DEFAULT).split(",")) {
    const [h, f] = part.split("=").map((s) => s?.trim().toLowerCase());
    if (h && f && /^[a-z0-9.-]+$/.test(h) && /^[a-z0-9-]+$/.test(f)) out.set(h.replace(/:\d+$/, ""), f);
  }
  return out;
}

export type FunnelHostDecision =
  | { kind: "pass" }
  | { kind: "rewrite"; pathname: string; funnel: string }
  | { kind: "serve"; funnel: string }
  | { kind: "redirect"; location: string }
  | { kind: "robots" };

/**
 * Entscheidung je Anfrage auf einer Funnel-Adresse: / → Funnel (intern umschreiben), /f/<funnel> und Hilfspfade
 * ausliefern, robots.txt sperrt alles (Werbe-Landingpage, nicht indexieren), alles andere → / (Query bleibt).
 */
export function decideFunnelHost(input: { host: string; pathname: string; search?: string; hosts?: string | null }): FunnelHostDecision {
  const host = input.host.toLowerCase().replace(/:\d+$/, "");
  const funnel = parseFunnelHosts(input.hosts).get(host);
  if (!funnel) return { kind: "pass" };
  const path = input.pathname || "/";
  if (path === "/robots.txt") return { kind: "robots" };
  if (path === "/" || path === "") return { kind: "rewrite", pathname: `/f/${funnel}`, funnel };
  if (UNTERSEITEN.includes(path)) return { kind: "rewrite", pathname: `/f/${funnel}${path}`, funnel };
  if (under(path, `/f/${funnel}`)) return { kind: "serve", funnel };
  if (SUPPORT.some((p) => under(path, p))) return { kind: "serve", funnel };
  return { kind: "redirect", location: `/${input.search ?? ""}` };
}

/** Besucher-ID vom Browser (Seitenzustand), nur im erwarteten Format. */
export function gueltigeBesuchId(raw: string | null | undefined): string | null {
  return raw && /^[a-z0-9-]{16,64}$/i.test(raw) ? raw : null;
}

export function neueBesuchId(): string {
  return crypto.randomUUID();
}
