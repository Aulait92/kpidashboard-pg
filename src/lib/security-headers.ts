// Sicherheits-Header für alle Antworten (eingebunden in next.config.ts → headers()).
// Bewusst ohne "@/"-Importe, damit next.config.ts die Datei direkt laden kann.
//
// Content-Security-Policy läuft zunächst nur als „Report-Only“: Browser melden
// Verstöße an /api/csp-report, blockieren aber nichts. Umstellung auf
// erzwingend (CSP_ENFORCE=on), sobald ~2 Wochen lang keine echten Verstöße
// mehr gemeldet werden (Anleitung: docs/sicherheit-cron.md, Abschnitt CSP).

type Header = { key: string; value: string };
type HeaderRule = { source: string; headers: Header[] };

/** Öffentliche Seiten, die (z. B. auf Vermittler-Websites) eingebettet werden dürfen. */
export const EMBEDDABLE_PATHS = ["/book/:path*", "/rechner"] as const;

/** Alle Pfade außer /book/… und /rechner (path-to-regexp mit negativem Lookahead). */
export const NOT_EMBEDDABLE_SOURCE = "/:path((?!book/|rechner(?:/|$)).*)";

export const CSP_REPORT_PATH = "/api/csp-report";

export function contentSecurityPolicy(opts: { dev?: boolean; frameAncestors?: string } = {}): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Next.js setzt Inline-Skripte (Hydration, Flight-Daten). Eine Nonce würde
    // jede Seite dynamisch machen – daher vorerst 'unsafe-inline' ohne Fremd-Hosts.
    "script-src": ["'self'", "'unsafe-inline'", ...(opts.dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    // Bilder: eigene, R2, Meta-/Werbe-Vorschauen (verschiedene CDNs) → nur https
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "media-src": ["'self'", "blob:", "https:"],
    // Sentry läuft über den Tunnel /monitoring (= 'self'); Ingest als Rückfall
    "connect-src": ["'self'", "https://*.ingest.sentry.io", "https://*.ingest.de.sentry.io", ...(opts.dev ? ["ws:"] : [])],
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
  // Diktat (Notizen per Sprache) braucht das Mikrofon – nur eigene Seiten
  "microphone=(self)",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "browsing-topics=()",
].join(", ");

export function securityHeaderRules(env: { dev?: boolean; enforceCsp?: boolean } = {}): HeaderRule[] {
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
  return rules;
}
