// Anmeldung der App-Store-Prüfer (lib/app-demo/app-review.ts): Fehlversuche zählen (Änderungsprotokoll, über alle
// Instanzen), protokollieren, Kennzeichen-Cookie setzen. Keine Sitzung, kein Zugriff auf echte Kundendaten.

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { appDemoEingerichtet } from "./db";
import { APP_REVIEW_COOKIE, APP_REVIEW_COOKIE_MAX_AGE_SEC, APP_REVIEW_EMAIL, APP_REVIEW_FENSTER_MS, APP_REVIEW_ZIEL, pruefeAppReview } from "./app-review";

export type AppReviewLoginErgebnis = { ok: true; redirectTo: string } | { ok: false; error: string };

const FALSCH = "E-Mail oder Passwort falsch.";
const ACTOR = { email: APP_REVIEW_EMAIL, role: "app-review" } as const;

export async function appReviewLogin(email: string, passwort: string): Promise<AppReviewLoginErgebnis> {
  const fehlversuche = await prisma.auditLog
    .count({ where: { action: "app_review.failed", at: { gt: new Date(Date.now() - APP_REVIEW_FENSTER_MS) } } })
    .catch(() => 0);
  const r = pruefeAppReview({ email, passwort, demoEingerichtet: appDemoEingerichtet(), fehlversuche });
  switch (r.kind) {
    case "kein-pruefer":
      return { ok: false, error: FALSCH };
    case "aus":
      // Gleiche Meldung wie bei falschem Passwort: von außen nicht erkennbar, ob es den Zugang gibt
      return { ok: false, error: FALSCH };
    case "gesperrt":
      return { ok: false, error: "Zu viele Versuche. Bitte in 15 Minuten erneut versuchen." };
    case "falsch":
      await audit("app_review.failed", { actor: ACTOR });
      return { ok: false, error: FALSCH };
    case "ok":
      await audit("app_review.login", { actor: ACTOR, details: { ziel: APP_REVIEW_ZIEL } });
      (await cookies()).set(APP_REVIEW_COOKIE, "1", {
        path: "/",
        maxAge: APP_REVIEW_COOKIE_MAX_AGE_SEC,
        // Nicht httpOnly: „Demo verlassen“ im Banner löscht es im Browser (es gewährt nichts)
        httpOnly: false,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
      return { ok: true, redirectTo: APP_REVIEW_ZIEL };
  }
}
