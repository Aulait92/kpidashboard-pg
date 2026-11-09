// Fehlerüberwachung mit Sentry (Datenregion EU). Ohne SENTRY_DSN passiert
// nichts außer einem Log-Eintrag – lokal und in Tests bleibt alles still.
//
// Datenschutz: Wir senden nur technische Fehlerinformationen. Cookies,
// Header, Request-Body, Query-Parameter und Nutzerdaten werden entfernt,
// damit keine Lead- oder Kundendaten bei Sentry landen.

import * as Sentry from "@sentry/nextjs";

let initialized = false;

export function initSentry() {
  if (initialized || !process.env.SENTRY_DSN) return;
  initialized = true;
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
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
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.data;
        delete event.request.query_string;
        if (event.request.url) event.request.url = event.request.url.split("?")[0];
      }
      delete event.user;
      return event;
    },
  });
}

/**
 * Meldet einen abgefangenen Fehler (z. B. in Cronjobs oder Webhooks, die
 * Fehler bewusst nicht weiterwerfen). `where` beschreibt die Stelle.
 */
export function reportError(err: unknown, where: string, extra?: Record<string, string | number | boolean | null>) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[fehler] ${where}: ${message}`);
  if (!process.env.SENTRY_DSN) return;
  initSentry();
  Sentry.withScope((scope) => {
    scope.setTag("where", where);
    if (extra) scope.setContext("details", extra);
    Sentry.captureException(err instanceof Error ? err : new Error(message));
  });
}
