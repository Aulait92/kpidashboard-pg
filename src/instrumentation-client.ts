import * as Sentry from "@sentry/nextjs";
import { isReplayBlockedPath, redactDeep, scrubBreadcrumb, scrubSentryEvent } from "@/lib/sentry-redact";

// Session Replay nie auf Endkundenseiten und Seiten mit geheimem Link (src/lib/sentry-redact.ts):
// dort wird die Integration gar nicht erst gestartet.
const startPath = typeof window !== "undefined" ? window.location.pathname : "/";
const replayAllowed = !isReplayBlockedPath(startPath);

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  // Session Replay nur bei Fehlern aufzeichnen. Datenschutz: alle Texte und
  // Eingaben maskiert, Bilder/Medien blockiert (keine Lead-Daten im Replay).
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: replayAllowed ? 1.0 : 0,
  integrations: replayAllowed
    ? [
        Sentry.replayIntegration({
          maskAllText: true,
          maskAllInputs: true,
          blockAllMedia: true,
          // Navigation/Netzwerk im Replay: geheime Pfadsegmente und Query entfernen.
          beforeAddRecordingEvent: (event) => redactDeep(event),
        }),
      ]
    : [],
  // Geheime Link-Tokens im Pfad, Query und Nutzer entfernen (Fehler, Transaktionen, Breadcrumbs).
  beforeSend: (event) => scrubSentryEvent(event),
  beforeSendTransaction: (event) => scrubSentryEvent(event),
  beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
});

// Replay-Ereignis (enthält die besuchten URLs) läuft nicht durch beforeSend, aber durch Event-Prozessoren.
Sentry.addEventProcessor((event) => redactDeep(event));

export function onRouterTransitionStart(href: string, navigationType: "push" | "replace" | "traverse") {
  // Wechsel aus der App auf eine Endkundenseite (z. B. Vorschau-Link): Replay sofort beenden.
  if (isReplayBlockedPath(href)) void Sentry.getReplay()?.stop();
  Sentry.captureRouterTransitionStart(href, navigationType);
}
