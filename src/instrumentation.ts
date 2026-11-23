import type { Instrumentation } from "next";

// Fehlerüberwachung (Sentry, EU-Region). Nur aktiv, wenn SENTRY_DSN gesetzt ist.
// Datenschutz: keine personenbezogenen Daten – Cookies, Header, Request-Body
// und Query werden vor dem Senden entfernt (siehe src/lib/monitoring.ts).
export async function register() {
  // Pflichtvariablen der Produktion prüfen, fehlende als Admin-Alarm (lib/env-check.ts). Nicht blockierend.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    void import("@/lib/env-check").then((m) => m.variablenBeimStart()).catch(() => {});
    // Löschprotokoll (lib/loeschprotokoll.ts): nach einer Wiederherstellung der Datenbank startet die App neu und wendet
    // alle protokollierten Löschungen erneut an (im normalen Betrieb ist nichts offen). Verzögert, nicht in der Demo.
    if (!process.env.APP_DEMO_DATABASE_URL && process.env.DATABASE_URL) {
      setTimeout(() => {
        void import("@/lib/loeschprotokoll")
          .then((m) => m.wendeLoeschprotokollAn())
          .catch((e: unknown) => console.error("[loeschprotokoll] Start-Abgleich fehlgeschlagen:", e instanceof Error ? e.name : "fehler"));
      }, 30_000).unref?.();
    }
    // Kampagnen-Läufe (Ole, 23.11.2026: „seit 20 min sucht er Angles“): Ein Neustart bricht laufende Läufe ab, ihre
    // Sperre (15 Min.) hielt sie danach fest; bei mehreren Deploys hintereinander blieb ein Lauf so lange hängen.
    // 60 Sekunden nach dem Start ist der alte Container weg: Sperren von vor dem Start freigeben, der Cron setzt fort.
    if (process.env.DATABASE_URL) {
      const start = new Date();
      setTimeout(() => {
        void import("@/lib/prisma")
          .then(({ prisma }) =>
            prisma.campaignRun.updateMany({
              where: { status: { in: ["queued", "running", "building"] }, lockedAt: { lt: start } },
              data: { lockedAt: null },
            }),
          )
          .then((r) => r.count && console.log(`[kampagnen] ${r.count} Lauf/Läufe nach Neustart freigegeben`))
          .catch(() => {});
      }, 60_000).unref?.();
    }
    // Öffentliche App-Demo: Beispieldaten in der eigenen Demo-Datenbank anlegen, falls älter als 20 Stunden
    // (nur mit APP_DEMO_DATABASE_URL, sonst nichts). Verzögert, damit der Start nicht wartet.
    if (process.env.APP_DEMO_DATABASE_URL) {
      // In Demo-Anfragen nichts nach außen (fetch, http/https), lib/app-demo/ausgang.ts
      await import("@/lib/app-demo/ausgang").then((m) => m.sperreAusgangInDerDemo());
      setTimeout(() => {
        void import("@/lib/app-demo/seed")
          .then((m) => m.appDemoAuffrischenWennNoetig())
          .then((r) => r && console.log("[app-demo] Beispieldaten:", JSON.stringify(r)))
          .catch((e: unknown) => console.error("[app-demo] Beispieldaten fehlgeschlagen:", e instanceof Error ? e.message : e));
      }, 15_000).unref?.();
    }
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
