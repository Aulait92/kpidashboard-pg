import type { Instrumentation } from "next";

// Fehlerüberwachung (Sentry, EU-Region). Nur aktiv, wenn SENTRY_DSN gesetzt ist.
// Datenschutz: keine personenbezogenen Daten – Cookies, Header, Request-Body
// und Query werden vor dem Senden entfernt (siehe src/lib/monitoring.ts).
export async function register() {
  // Pflichtvariablen der Produktion prüfen, fehlende als Admin-Alarm (lib/env-check.ts). Nicht blockierend.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    void import("@/lib/env-check").then((m) => m.variablenBeimStart()).catch(() => {});
  }
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    const { initSentry } = await import("@/lib/monitoring");
    initSentry();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(err, request, context);
};
