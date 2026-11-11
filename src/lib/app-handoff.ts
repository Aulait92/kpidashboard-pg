// Einmal-Übergabe der Anmeldung aus der App in den System-Browser.
// Google erlaubt OAuth nicht in eingebetteten Web-Ansichten („disallowed_useragent“),
// deshalb öffnet die App z. B. „Google-Kalender verbinden“ im System-Browser.
// Dort ist man nicht angemeldet – der Einmal-Link meldet den gleichen Login an
// und leitet zum Ziel weiter. 5 Minuten gültig, nur einmal einlösbar.

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export const HANDOFF_TTL_MS = 5 * 60_000;

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Nur interne Pfade (kein //, kein Schema), sonst Startseite. */
export function safeNext(next: string | null | undefined): string {
  const n = (next ?? "").trim();
  return n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n.slice(0, 500) : "/buyer";
}

export async function createHandoff(userId: string, next: string, now = new Date()): Promise<string> {
  const token = crypto.randomBytes(24).toString("base64url");
  await prisma.appHandoff.create({ data: { tokenHash: sha(token), userId, next: safeNext(next), expiresAt: new Date(now.getTime() + HANDOFF_TTL_MS) } });
  // Aufräumen: abgelaufene Einträge
  await prisma.appHandoff.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - HANDOFF_TTL_MS) } } }).catch(() => {});
  return token;
}

/** Löst den Token ein (atomar, einmalig). null = ungültig/abgelaufen/benutzt. */
export async function redeemHandoff(token: string, now = new Date()): Promise<{ userId: string; next: string } | null> {
  if (!token || token.length > 100) return null;
  const hash = sha(token);
  const res = await prisma.appHandoff.updateMany({ where: { tokenHash: hash, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
  if (res.count !== 1) return null;
  const row = await prisma.appHandoff.findUnique({ where: { tokenHash: hash }, select: { userId: true, next: true } });
  return row ? { userId: row.userId, next: safeNext(row.next) } : null;
}
