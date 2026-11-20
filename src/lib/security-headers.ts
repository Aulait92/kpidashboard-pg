// Sicherheits-Header für alle Antworten (eingebunden in next.config.ts → headers()).
// Bewusst ohne "@/"-Importe, damit next.config.ts die Datei direkt laden kann.
//
// Content-Security-Policy läuft zunächst nur als „Report-Only“: Browser melden
// Verstöße an /api/csp-report, blockieren aber nichts. Umstellung auf
// erzwingend (CSP_ENFORCE=on), sobald ~2 Wochen lang keine echten Verstöße
// mehr gemeldet werden (Anleitung: docs/sicherheit-cron.md, Abschnitt CSP).

import { parseFunnelHosts } from "./funnel/host";

type Header = { key: string; value: string };
type HeaderRule = { source: string; headers: Header[]; has?: { type: "host"; value: string }[] };

/** Öffentliche Seiten, die (z. B. auf Vermittler-Websites) eingebettet werden dürfen. */
/** /demo: Live-Demo der Beratungspräsentation, eingebettet in die Vertriebspräsentation und ggf. auf der Webseite. */
export const EMBEDDABLE_PATHS = ["/book/:path*", "/rechner"] as const;

/**
 * Live-Demo (/demo, /demo/beratung) und Vertriebs-Buchungsseite (/termin, Ole 16.11.2026): nur auf unserer Webseite einbettbar. Kein X-Frame-Options,
 * dafür erzwungene CSP frame-ancestors mit genau diesen Hosts (Webseite und Lovable-Vorschau).
 */
/** /app-demo: öffentliche App-Demo zum Selbstklicken (Ole, 16.11.2026), gleiche Regeln. */
export const DEMO_PATHS = ["/demo", "/demo/:path*", "/termin", "/termin/:path*", "/app-demo", "/app-demo/:path*"] as const;
export const DEMO_FRAME_ANCESTORS = [
  "'self'",
  "https://performancegrowth.de",
  "https://www.performancegrowth.de",
  "https://id-preview--a5c5b7c8-3a9c-49e9-ab57-02f8766b662e.lovable.app",
  "https://growthspark-leads.lovable.app",
].join(" ");

/** Alle Pfade außer /book/…, /rechner, /demo/…, /termin/… und /app-demo/… (path-to-regexp mit negativem Lookahead). */
export const NOT_EMBEDDABLE_SOURCE = "/:path((?!book/|rechner(?:/|$)|demo(?:/|$)|termin(?:/|$)|app-demo(?:/|$)).*)";

export const CSP_REPORT_PATH = "/api/csp-report";

/** Eigene Funnels (lib/funnel): Meta-Pixel erlaubt (Skript und Messung bei Meta), nur dort. */
export const FUNNEL_PATHS = ["/f/:path*"] as const;
const META_PIXEL = { script: ["https://connect.facebook.net"], connect: ["https://connect.facebook.net", "https://www.facebook.com"] };

export function contentSecurityPolicy(opts: { dev?: boolean; frameAncestors?: string; metaPixel?: boolean } = {}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Next.js setzt Inline-Skripte (Hydration, Flight-Daten). Eine Nonce würde
    // jede Seite dynamisch machen – daher vorerst 'unsafe-inline' ohne Fremd-Hosts.
    "script-src": ["'self'", "'unsafe-inline'", ...(opts.dev ? ["'unsafe-eval'"] : []), ...(opts.metaPixel ? META_PIXEL.script : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    // Bilder: eigene, R2, Meta-/Werbe-Vorschauen (verschiedene CDNs) → nur https
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "media-src": ["'self'", "blob:", "https:"],
    // Sentry läuft über den Tunnel /monitoring (= 'self'); Ingest als Rückfall
    "connect-src": ["'self'", "https://*.ingest.sentry.io", "https://*.ingest.de.sentry.io", ...(opts.dev ? ["ws:"] : []), ...(opts.metaPixel ? META_PIXEL.connect : [])],
    // Sentry Session Replay nutzt einen Worker aus blob:
    "worker-src": ["'self'", "blob:"],
    // Erklärvideos in der Einrichtung (Loom/YouTube ohne Cookies)
    "frame-src": ["'self'", "https://www.loom.com", "https://www.youtube-nocookie.com"],
    "frame-ancestors": [opts.frameAncestors ?? "'none'"],
    // Formular-Weiterleitungen: Stripe Checkout/Portal, Google-/Microsoft-Login
    "form-action": [
      "'self'",
      "https://checkout.stripe.com",
      "https://billing.stripe.com",
      "https://accounts.google.com",
      "https://login.microsoftonline.com",
    ],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "manifest-src": ["'self'"],
    "report-uri": [CSP_REPORT_PATH],
    "report-to": ["csp"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

export const PERMISSIONS_POLICY = [
  "camera=()",
  // Mikrofon aus: das Diktieren von Notizen ist entfallen (Ole, 15.11.2026), nichts anderes braucht es
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "browsing-topics=()",
].join(", ");

export function securityHeaderRules(env: { dev?: boolean; enforceCsp?: boolean; funnelHosts?: string | null } = {}): HeaderRule[] {
  const cspKey = env.enforceCsp ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
  const base: Header[] = [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "Reporting-Endpoints", value: `csp="${CSP_REPORT_PATH}"` },
  ];
  const rules: HeaderRule[] = [{ source: "/:path*", headers: base }];
  // Alle Seiten außer den einbettbaren: nicht einbettbar (Clickjacking-Schutz,
  // z. B. Angebots-Annahme, Login, Kundenbereich).
  rules.push({
    source: NOT_EMBEDDABLE_SOURCE,
    headers: [
      { key: "X-Frame-Options", value: "DENY" },
      { key: cspKey, value: contentSecurityPolicy({ dev: env.dev }) },
    ],
  });
  // Buchungsseite und Rechner: öffentlich, ohne Login, werden als Link geteilt und
  // können auf Vermittler-Websites per iframe eingebunden sein. Deshalb hier kein
  // X-Frame-Options, sondern frame-ancestors für beliebige https-Seiten.
  for (const source of EMBEDDABLE_PATHS) {
    rules.push({ source, headers: [{ key: cspKey, value: contentSecurityPolicy({ dev: env.dev, frameAncestors: "'self' https:" }) }] });
  }
  // Demo: gesamte CSP wie überall (ggf. Report-Only), zusätzlich frame-ancestors immer erzwungen
  for (const source of DEMO_PATHS) {
    rules.push({
      source,
      headers: [
        { key: cspKey, value: contentSecurityPolicy({ dev: env.dev, frameAncestors: DEMO_FRAME_ANCESTORS }) },
        ...(cspKey === "Content-Security-Policy" ? [] : [{ key: "Content-Security-Policy", value: `frame-ancestors ${DEMO_FRAME_ANCESTORS}` }]),
      ],
    });
  }
  // Eigene Funnels: Meta-Pixel (lädt erst nach Einwilligung). Auf der App-Adresse unter /f/…, auf der Funnel-Adresse
  // (beitrag.pkv-tarife.com, FUNNEL_HOSTS) für alle Pfade. Später gesetzte Regeln überschreiben die CSP von oben.
  const pixelCsp: Header = { key: cspKey, value: contentSecurityPolicy({ dev: env.dev, metaPixel: true }) };
  for (const source of FUNNEL_PATHS) rules.push({ source, headers: [pixelCsp] });
  for (const host of parseFunnelHosts(env.funnelHosts).keys()) {
    rules.push({ source: "/:path*", has: [{ type: "host", value: host.replace(/\./g, "\\.") }], headers: [pixelCsp] });
  }
  return rules;
}
