// Eigene Adressen der Funnels (Ole, 20.11.2026): beitrag.pkv-tarife.com zeigt den PKV-Funnel (/f/pkv-beitrag), ohne
// dass dort andere Seiten der App erreichbar sind. Zuordnung über FUNNEL_HOSTS („host=funnel,host2=funnel2“), Standard
// beitrag.pkv-tarife.com=pkv-beitrag. Dazu die Besucher-ID (Erstanbieter-Cookie) für Messung und A/B-Tests.
// Reine Funktionen ohne Imports: läuft in der Middleware (src/middleware.ts) und in Tests.

export const FUNNEL_HOSTS_DEFAULT = "beitrag.pkv-tarife.com=pkv-beitrag";

/** Cookie mit der Besucher-ID (zufällig, keine Personendaten). */
export const BESUCH_COOKIE = "pf_bid";
/** Kopfzeile, mit der die Middleware die (ggf. neue) Besucher-ID an die Seite weitergibt. */
export const BESUCH_HEADER = "x-funnel-besuch";
/**
 * Laufzeit des Besucher-Cookies. OFFEN (Datenschutz): Ob ein Mess-Cookie ohne Einwilligung zulässig ist (§ 25 Abs. 2
 * TDDDG, „unbedingt erforderlich“), prüft der Rechts-Agent. Er enthält nur eine Zufalls-ID für die eigene Messung und die
 * feste Fassung im A/B-Test; ohne Einwilligung notfalls auf 0 (nur Sitzung) stellen.
 */
export const BESUCH_COOKIE_TAGE = 30;

/** Pfade, die die Funnel-Adresse außer dem Funnel selbst braucht (Next.js-Dateien, Icons, Messung, Fehlerberichte). */
const SUPPORT = ["/_next", "/api/funnel", "/icon", "/apple-icon", "/favicon.ico", "/monitoring", "/api/csp-report"];

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
  if (under(path, `/f/${funnel}`)) return { kind: "serve", funnel };
  if (SUPPORT.some((p) => under(path, p))) return { kind: "serve", funnel };
  return { kind: "redirect", location: `/${input.search ?? ""}` };
}

/** Besucher-ID aus dem Cookie, nur im erwarteten Format (sonst neu vergeben). */
export function gueltigeBesuchId(raw: string | null | undefined): string | null {
  return raw && /^[a-z0-9-]{16,64}$/i.test(raw) ? raw : null;
}

export function neueBesuchId(): string {
  return crypto.randomUUID();
}
