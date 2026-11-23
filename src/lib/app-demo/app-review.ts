// Zugang für die App-Store-Prüfung (Apple/Google, Ole 23.11.2026): Die Prüfer melden sich in der App mit E-Mail und
// Passwort an und sehen den Kundenbereich mit Beispieldaten.
//
// Sicherster Weg: KEIN echtes Konto. Die reservierte E-Mail führt bei richtigem Passwort in die öffentliche App-Demo
// (/app-demo, eigene Demo-Datenbank, nur lesend, nichts geht nach außen: lib/app-demo/*). Es entsteht keine Sitzung,
// kein Login-Cookie und kein Zugriff auf echte Kundendaten. Das Passwort steht nur in APP_REVIEW_PASSWORT (Railway);
// fehlt es, ist zu kurz oder ist die Demo nicht eingerichtet, ist dieser Zugang aus.
//
// Damit die Prüfer nach einem Neustart der App nicht wieder auf der Anmeldung landen, setzt die Anmeldung das
// Kennzeichen-Cookie pg_app_review. Ohne Sitzung leitet die Middleware /buyer/… dann in die Demo. Das Cookie gewährt
// nichts, was nicht ohnehin öffentlich ist (die Demo braucht keine Anmeldung); es ist darum bewusst nicht signiert.

import { createHash, timingSafeEqual } from "node:crypto";
import { APP_REVIEW_COOKIE } from "./weiche";

export { APP_REVIEW_COOKIE };

/** Reservierte Prüfer-E-Mail (nur in App Store Connect / Play Console eintragen). */
export const APP_REVIEW_EMAIL = "appreview@performancegrowth.de";
export const APP_REVIEW_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30;
/** Ziel nach der Anmeldung. */
export const APP_REVIEW_ZIEL = "/app-demo";
/** Mindestlänge des Passworts: kürzer heißt „nicht eingerichtet“. */
export const APP_REVIEW_MIN_LAENGE = 12;
/** Fehlversuche je 15 Minuten über alle IPs (zusätzlich zur Drossel je IP), danach gesperrt. */
export const APP_REVIEW_MAX_FEHLVERSUCHE = 10;
export const APP_REVIEW_FENSTER_MS = 15 * 60_000;

type Env = Record<string, string | undefined>;

/** Ist die E-Mail die reservierte Prüfer-Adresse? (Groß/Klein und Leerzeichen egal) */
export function istAppReviewEmail(email: string, env: Env = process.env): boolean {
  const e = email.trim().toLowerCase();
  const eigene = env.APP_REVIEW_EMAIL?.trim().toLowerCase();
  return e === APP_REVIEW_EMAIL || (!!eigene && e === eigene);
}

/** Passwort aus der Umgebung, wenn der Zugang eingerichtet ist; sonst null (Zugang aus). */
export function appReviewPasswort(env: Env = process.env): string | null {
  const p = env.APP_REVIEW_PASSWORT;
  if (!p || p.trim().length < APP_REVIEW_MIN_LAENGE) return null;
  return p;
}

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest();

/** Vergleich in konstanter Zeit (über Hashes, damit auch die Länge nichts verrät). */
export function passwortStimmt(eingabe: string, soll: string): boolean {
  return timingSafeEqual(sha(eingabe), sha(soll));
}

export type AppReviewPruefung =
  | { kind: "kein-pruefer" } // andere E-Mail: normale Anmeldung
  | { kind: "ok" }
  | { kind: "falsch" }
  | { kind: "aus" } // Passwort oder Demo nicht eingerichtet
  | { kind: "gesperrt" };

/**
 * Entscheidung für eine Anmeldung (rein, getestet). Die reservierte E-Mail erreicht nie die echte Anmeldung,
 * auch wenn der Zugang aus ist.
 */
export function pruefeAppReview(opts: { email: string; passwort: string; demoEingerichtet: boolean; fehlversuche: number; env?: Env }): AppReviewPruefung {
  const env = opts.env ?? process.env;
  if (!istAppReviewEmail(opts.email, env)) return { kind: "kein-pruefer" };
  const soll = appReviewPasswort(env);
  if (!soll || !opts.demoEingerichtet) return { kind: "aus" };
  if (opts.fehlversuche >= APP_REVIEW_MAX_FEHLVERSUCHE) return { kind: "gesperrt" };
  return passwortStimmt(opts.passwort, soll) ? { kind: "ok" } : { kind: "falsch" };
}
