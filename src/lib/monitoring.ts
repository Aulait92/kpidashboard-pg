// Fehlerüberwachung mit Sentry (Datenregion EU). Ohne SENTRY_DSN passiert
// nichts außer einem Log-Eintrag – lokal und in Tests bleibt alles still.
//
// Datenschutz: Wir senden nur technische Fehlerinformationen. Cookies,
// Header, Request-Body, Query-Parameter, Nutzerdaten und geheime Link-Tokens
// im Pfad werden entfernt, damit keine Lead- oder Kundendaten bei Sentry landen.

import * as Sentry from "@sentry/nextjs";
import { scrubBreadcrumb, scrubSentryEvent } from "@/lib/sentry-redact";

let initialized = false;

/** DSN für die Server-Seite (in der Produktion bisher nur als NEXT_PUBLIC_SENTRY_DSN gesetzt). */
export const sentryDsn = () => process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || "";

export function initSentry() {
  if (initialized || !sentryDsn()) return;
  initialized = true;
  Sentry.init({
    dsn: sentryDsn(),
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.RAILWAY_SERVICE_NAME ?? "production",
    release: process.env.RAILWAY_GIT_COMMIT_SHA,
    tracesSampleRate: 0,
    // Nichts Personenbezogenes erfassen (Chats, Prompts, Formulare, Header …).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    // Cookies, Header, Body, Query, Nutzer und geheime Link-Tokens im Pfad entfernen (src/lib/sentry-redact.ts).
    beforeSend: (event) => scrubSentryEvent(event, { server: true }),
    beforeSendTransaction: (event) => scrubSentryEvent(event, { server: true }),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });
}

/**
 * Meldet einen abgefangenen Fehler (z. B. in Cronjobs oder Webhooks, die
 * Fehler bewusst nicht weiterwerfen). `where` beschreibt die Stelle.
 */
export function reportError(err: unknown, where: string, extra?: Record<string, string | number | boolean | null>) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[fehler] ${where}: ${message}`);
  if (!sentryDsn()) return;
  initSentry();
  Sentry.withScope((scope) => {
    scope.setTag("where", where);
    if (extra) scope.setContext("details", extra);
    Sentry.captureException(err instanceof Error ? err : new Error(message));
  });
}
