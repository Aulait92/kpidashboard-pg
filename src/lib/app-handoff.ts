// Einmal-Übergabe der Anmeldung zwischen App und System-Browser.
// Google erlaubt OAuth nicht in eingebetteten Web-Ansichten („disallowed_useragent“),
// deshalb laufen Google/Microsoft im System-Browser. Zwei Richtungen:
// - browser: App → System-Browser (z. B. „Google-Kalender verbinden“). Dort ist man
//   nicht angemeldet – der Einmal-Link meldet den gleichen Login an (api/app/handoff).
// - app-sso:<anbieter>: Anmeldung mit Google/Microsoft im System-Browser → App. Der
//   Callback setzt dort KEINE Sitzung, sondern gibt der App per performancegrowth://
//   einen Einmal-Code, den die App unter api/app/login-handoff einlöst.
// Je Code: an den Login gebunden, nur gehasht gespeichert, 5 Minuten gültig, einmalig,
// und nur an der Stelle seines Zwecks einlösbar.

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const HANDOFF_TTL_MS = 5 * 60_000;

export type SsoMethod = "google" | "microsoft";
export type HandoffPurpose = "browser" | `app-sso:${SsoMethod}`;

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Form der Codes (base64url, 24 Byte = 32 Zeichen); alles andere gar nicht erst nachschlagen. */
export const HANDOFF_CODE_RE = /^[A-Za-z0-9_-]{20,100}$/;

/** Nur interne Pfade (kein //, kein Schema), sonst Startseite. */
export function safeNext(next: string | null | undefined): string {
  const n = (next ?? "").trim();
  return n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n.slice(0, 500) : "/buyer";
}

export async function createHandoff(userId: string, next: string, now = new Date(), purpose: HandoffPurpose = "browser"): Promise<string> {
  const token = crypto.randomBytes(24).toString("base64url");
  await prisma.appHandoff.create({ data: { tokenHash: sha(token), userId, next: safeNext(next), purpose, expiresAt: new Date(now.getTime() + HANDOFF_TTL_MS) } });
  // Aufräumen: abgelaufene Einträge
  await prisma.appHandoff.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - HANDOFF_TTL_MS) } } }).catch(() => {});
  return token;
}

async function redeem(token: string, purposes: HandoffPurpose[], now: Date): Promise<{ userId: string; next: string; purpose: string } | null> {
  if (!token || !HANDOFF_CODE_RE.test(token)) return null;
  const hash = sha(token);
  // Atomar: nur der erste Aufruf setzt usedAt (Zweck, Ablauf und „unbenutzt“ in derselben Bedingung).
  const res = await prisma.appHandoff.updateMany({ where: { tokenHash: hash, usedAt: null, expiresAt: { gt: now }, purpose: { in: purposes } }, data: { usedAt: now } });
  if (res.count !== 1) return null;
  const row = await prisma.appHandoff.findUnique({ where: { tokenHash: hash }, select: { userId: true, next: true, purpose: true } });
  return row ? { userId: row.userId, next: safeNext(row.next), purpose: row.purpose } : null;
}

/** Löst den Browser-Link ein (atomar, einmalig). null = ungültig/abgelaufen/benutzt. */
export async function redeemHandoff(token: string, now = new Date()): Promise<{ userId: string; next: string } | null> {
  const hit = await redeem(token, ["browser"], now);
  return hit ? { userId: hit.userId, next: hit.next } : null;
}

/** Einmal-Code nach erfolgreicher Google/Microsoft-Anmeldung im System-Browser (für die App). */
export function createAppLoginCode(userId: string, method: SsoMethod, next: string, now = new Date()): Promise<string> {
  // Ohne Ziel bleibt next leer → Startseite nach Rolle (loginTargetFor); safeNext würde /buyer erzwingen.
  return createHandoff(userId, next && safeNext(next) === next ? next : "/", now, `app-sso:${method}`);
}

/** Löst den App-Code ein (atomar, einmalig). null = ungültig/abgelaufen/benutzt/falscher Zweck. */
export async function redeemAppLoginCode(code: string, now = new Date()): Promise<{ userId: string; method: SsoMethod; next: string } | null> {
  const hit = await redeem(code, ["app-sso:google", "app-sso:microsoft"], now);
  if (!hit) return null;
  const method: SsoMethod = hit.purpose === "app-sso:microsoft" ? "microsoft" : "google";
  return { userId: hit.userId, method, next: hit.next === "/" ? "" : hit.next };
}

/** Rücksprung in die App (eigenes URL-Schema, in mobile/ registriert). */
export const APP_URL_SCHEME = "performancegrowth";

export function appLoginRedirect(params: { code: string } | { fehler: string }): string {
  const q = new URLSearchParams("code" in params ? { code: params.code } : { fehler: params.fehler });
  return `${APP_URL_SCHEME}://login?${q.toString()}`;
}
