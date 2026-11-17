import * as Sentry from "@sentry/nextjs";
import { isReplayAllowedPath, redactDeep, scrubBreadcrumb, scrubSentryEvent } from "@/lib/sentry-redact";

// Session Replay nur mit Einwilligung (Rechtsprüfung docs/rechtstexte/sitzungsaufnahme-2026-11-17.md, § 25 TDDDG):
// Die Replay-Integration wird hier NICHT geladen, sondern erst nach „Ja“ in components/nutzungsanalyse.tsx
// (Sentry.addIntegration), und nur im Vermittlerbereich /buyer (Positivliste, lib/sentry-redact isReplayAllowedPath).
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  // Keine personenbezogenen Standarddaten (Nutzer samt IP, Cookies, Header, Query), Rechtsprüfung Nachtrag 16.11.2026
  dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
  // Replay (erst nach Einwilligung geladen): Sitzungen startet components/nutzungsanalyse.tsx selbst (Anteil),
  // bei Fehlern wird die Aufnahme nach Einwilligung behalten.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  // Geheime Link-Tokens im Pfad, Query und Nutzer entfernen (Fehler, Transaktionen, Breadcrumbs).
  beforeSend: (event) => scrubSentryEvent(event),
  beforeSendTransaction: (event) => scrubSentryEvent(event),
  beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
});

// Replay-Ereignis (enthält die besuchten URLs) läuft nicht durch beforeSend, aber durch Event-Prozessoren.
Sentry.addEventProcessor((event) => redactDeep(event));

export function onRouterTransitionStart(href: string, navigationType: "push" | "replace" | "traverse") {
  // Raus aus dem Vermittlerbereich (Admin, Endkundenseite, Vorschau-Link): Replay sofort beenden.
  if (!isReplayAllowedPath(href)) void Sentry.getReplay()?.stop();
  Sentry.captureRouterTransitionStart(href, navigationType);
}
