// Eigene Adresse für die Seiten der Endkunden (Ole, 15.11.2026): Leads und Bestandskunden sehen
// dein-beratungstermin.de statt app.performancegrowth.de. Gesteuert über PUBLIC_BOOKING_URL
// (z. B. https://www.dein-beratungstermin.de); ohne die Variable ändert sich nichts.
//
// Reine Funktionen ohne Imports: läuft in der Middleware (src/middleware.ts) und in Tests.
// Links bauen: src/lib/public-url.ts. Einrichtung (DNS, Railway): docs/buchungsdomain.md.

export type BookingHost = {
  /** z. B. https://www.dein-beratungstermin.de (ohne / am Ende) */
  origin: string;
  /** z. B. www.dein-beratungstermin.de */
  host: string;
  /** Gegenstück mit/ohne www (wird auf host umgeleitet) */
  alternate: string;
};

/** PUBLIC_BOOKING_URL lesen; null, wenn nicht gesetzt oder ungültig. */
export function parseBookingUrl(raw: string | null | undefined): BookingHost | null {
  const v = raw?.trim();
  if (!v) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (!u.hostname.includes(".")) return null;
    const host = u.host.toLowerCase();
    return {
      origin: `${u.protocol}//${host}`,
      host,
      alternate: host.startsWith("www.") ? host.slice(4) : `www.${host}`,
    };
  } catch {
    return null;
  }
}

/** Seiten für Endkunden (mit Unterseiten). Auf der Buchungsadresse erlaubt, auf der App-Adresse umgeleitet. */
export const END_CUSTOMER_PREFIXES = ["/book", "/empfehlung", "/einwilligung", "/abmelden", "/erstinformation", "/beratung", "/datenschutz", "/ihr-angebot", "/rueckruf"] as const;

/**
 * Live-Demo der Beratungspräsentation (Ole, 15.11.2026): auf der Buchungsadresse unter /demo (intern /demo/beratung),
 * auf der App-Adresse unter /demo/beratung (keine Umleitung, z. B. eingebettet in die Vertriebspräsentation).
 */
export const DEMO_PATH = "/demo/beratung";

/** Was die Seiten auf der Buchungsadresse zusätzlich brauchen (Next.js-Dateien, Icons, Abmelde-Klick, Fehlerberichte). */
const SUPPORT_PREFIXES = ["/api/abmelden", "/_next", "/icon", "/apple-icon", "/favicon.ico", "/monitoring", "/api/csp-report"] as const;

/**
 * Erste Pfadstücke, die kein Kurzlink /<slug> sein können: Seiten der Buchungsadresse und alle Bereiche der App
 * (die dort 404 bleiben, z. B. /login, /admin). Neue Ordner unter src/app hier ergänzen (Test prüft das).
 */
export const RESERVED_SEGMENTS: ReadonlySet<string> = new Set([
  // Buchungsadresse
  "book", "empfehlung", "einwilligung", "abmelden", "erstinformation", "beratung", "datenschutz", "ihr-angebot", "rueckruf", "demo", "api", "_next", "icon", "apple-icon", "monitoring",
  // App (nur auf der App-Adresse)
  "admin", "angebot", "buyer", "email-bestaetigen", "empfehlen", "feedback", "forgot-password", "login", "logout", "login-karten",
  "microsoft-freigabe", "rechner", "rechtliches", "reset-password", "sicherheit", "status", "videos", "fonts", "sw", "manifest",
  // Vertriebspräsentation für Interessenten (eigenes Material, nur auf der App-Adresse)
  "praesentation",
  // Vertriebs-Buchungsseite (eigene Marke, nur auf der App-Adresse, eingebettet auf performancegrowth.de)
  "termin",
]);

const SLUG_RE = /^[A-Za-z0-9_-]{1,80}$/;

function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Taugt der Slug für den Kurzlink /<slug>? (sonst bleibt es bei /book/<slug>) */
export function isShortSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_SEGMENTS.has(slug.toLowerCase());
}

/** Host aus den Kopfzeilen (hinter Railway: x-forwarded-host bzw. host), klein, ohne Leerzeichen. */
export function requestHost(headers: { get(name: string): string | null }): string {
  return (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim().toLowerCase();
}

function sameHost(requestHostValue: string, configured: string): boolean {
  const h = requestHostValue.toLowerCase();
  return h === configured || (!configured.includes(":") && h.replace(/:\d+$/, "") === configured);
}

/** Pfad auf der Buchungsadresse: /book/<slug> wird zum Kurzlink /<slug>, alles andere bleibt. */
export function publicPathFor(path: string): string {
  const m = /^\/book\/([^/]+)$/.exec(path);
  return m && isShortSlug(m[1]) ? `/${m[1]}` : path;
}

export type HostDecision =
  /** Keine Buchungsadresse betroffen: normale Middleware */
  | { kind: "pass" }
  /** Öffentliche Seite auf der Buchungsadresse: ausliefern */
  | { kind: "serve" }
  /** Auf der Buchungsadresse intern auf einen anderen Pfad umschreiben (Kurzlink, Startseite) */
  | { kind: "rewrite"; pathname: string }
  /** Dauerhaft umleiten (www ↔ ohne www, alte App-Links) */
  | { kind: "redirect"; location: string }
  /** robots.txt der Buchungsadresse: nichts indexieren */
  | { kind: "robots" }
  /** Alles andere auf der Buchungsadresse: 404 (keine Weiterleitung in die App) */
  | { kind: "not_found" };

/**
 * Entscheidung je Anfrage. bookingUrl = PUBLIC_BOOKING_URL; hasSession = Login-Cookie der App vorhanden.
 * Auf der App-Adresse werden nur GET/HEAD-Aufrufe der Endkunden-Seiten umgeleitet (Formulare/Server Actions
 * und API-POSTs laufen dort weiter, damit offene Seiten und alte Links funktionieren).
 */
export function decidePublicHost(input: {
  host: string;
  pathname: string;
  search?: string;
  method?: string;
  bookingUrl: string | null | undefined;
  hasSession?: boolean;
}): HostDecision {
  const cfg = parseBookingUrl(input.bookingUrl);
  if (!cfg || !input.host) return { kind: "pass" };
  const path = input.pathname || "/";
  const search = input.search ?? "";

  if (sameHost(input.host, cfg.alternate)) return { kind: "redirect", location: `${cfg.origin}${path}${search}` };

  if (sameHost(input.host, cfg.host)) {
    if (path === "/robots.txt") return { kind: "robots" };
    if (path === "/") return { kind: "rewrite", pathname: "/book" };
    if (END_CUSTOMER_PREFIXES.some((p) => underPrefix(path, p))) return { kind: "serve" };
    if (path === "/demo" || path === "/demo/") return { kind: "rewrite", pathname: DEMO_PATH };
    if (underPrefix(path, DEMO_PATH)) return { kind: "serve" };
    if (SUPPORT_PREFIXES.some((p) => underPrefix(path, p))) return { kind: "serve" };
    const m = /^\/([^/]+)\/?$/.exec(path);
    if (m && isShortSlug(m[1])) return { kind: "rewrite", pathname: `/book/${m[1]}` };
    return { kind: "not_found" };
  }

  // App-Adresse (oder andere): alte Links der Endkunden auf die Buchungsadresse umleiten
  const method = (input.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return { kind: "pass" };
  if (!END_CUSTOMER_PREFIXES.some((p) => path.startsWith(`${p}/`) && path.length > p.length + 1)) return { kind: "pass" };
  // Berater bucht aus der App für einen Lead (?lead=…, Vorbelegung nur mit Login): auf der App bleiben
  if (input.hasSession && /^\/book\/[^/]+$/.test(path) && /[?&]lead=/.test(search)) return { kind: "pass" };
  return { kind: "redirect", location: `${cfg.origin}${publicPathFor(path)}${search}` };
}

export const PUBLIC_ROBOTS_TXT = "User-agent: *\nDisallow: /\n";

/** Neutrale 404-Seite der Buchungsadresse (ohne Markennamen, ohne Anrede). */
export const PUBLIC_NOT_FOUND_HTML = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Seite nicht gefunden</title></head><body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f7fb;color:#1f2937"><main style="max-width:28rem;margin:15vh auto;padding:0 1rem"><div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:1.5rem"><h1 style="font-size:1.25rem;margin:0 0 .5rem">Seite nicht gefunden</h1><p style="margin:0;color:#6b7280;font-size:.95rem;line-height:1.5">Diese Seite gibt es nicht. Bitte den Link aus der Nachricht noch einmal prüfen.</p></div></main></body></html>`;
