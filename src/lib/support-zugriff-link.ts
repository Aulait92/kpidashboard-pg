// Signierter Link zum Support-Zugriff (Ole, 25.11.2026, lib/support-zugriff.ts): gilt 15 Minuten, nur für den Admin,
// der den Zugriff mit Grund ausgelöst hat (Login wird beim Abruf zusätzlich geprüft). HMAC-SHA256 mit AUTH_SECRET über
// Protokoll-ID, Admin-ID und Ablauf. Reine Funktionen, getestet (tests/unit/support-zugriff-link.test.ts).
// Ausliefern: app/api/admin/support-zugriff/[token]/route.ts (Pfad steht in lib/sentry-redact.ts als geheim).
import crypto from "node:crypto";
import { ZUGRIFF_MINUTEN } from "@/lib/chat-dateien";

export const SUPPORT_ZUGRIFF_PFAD = "/api/admin/support-zugriff";

const signatur = (zid: string, uid: string, ablauf: number, secret: string) =>
  crypto.createHmac("sha256", secret).update(`support-zugriff:${zid}:${uid}:${ablauf}`).digest("base64url").slice(0, 43);

const geheimnis = (secret: string | undefined) => {
  if (!secret || secret.length < 16) throw new Error("AUTH_SECRET fehlt für Support-Links.");
  return secret;
};

/** Token für einen Zugriff (Protokoll-ID), gebunden an den Admin; ablauf in Sekunden seit 1970. */
export function zugriffToken(zid: string, uid: string, now = new Date(), secret = process.env.AUTH_SECRET): string {
  const ablauf = Math.floor(now.getTime() / 1000) + ZUGRIFF_MINUTEN * 60;
  return `${zid}.${uid}.${ablauf}.${signatur(zid, uid, ablauf, geheimnis(secret))}`;
}

export const zugriffPfad = (token: string) => `${SUPPORT_ZUGRIFF_PFAD}/${encodeURIComponent(token)}`;

export type TokenPruefung = { ok: true; zid: string; uid: string; ablauf: number } | { ok: false; grund: "ungueltig" | "abgelaufen" | "fremd" };

/**
 * Token prüfen: Signatur (konstante Zeit), Ablauf und Admin. adminUserId = angemeldeter Admin (null = kein Admin
 * angemeldet). Nur der Admin, für den der Link erzeugt wurde, darf ihn öffnen.
 */
export function pruefeZugriffToken(token: string, adminUserId: string | null, now = new Date(), secret = process.env.AUTH_SECRET): TokenPruefung {
  const teile = (token ?? "").split(".");
  if (teile.length !== 4 || !secret || secret.length < 16) return { ok: false, grund: "ungueltig" };
  const [zid, uid, e, t] = teile;
  if (!zid || !uid || !/^\d{9,11}$/.test(e)) return { ok: false, grund: "ungueltig" };
  const ablauf = Number(e);
  const soll = Buffer.from(signatur(zid, uid, ablauf, secret));
  const ist = Buffer.from(t);
  if (soll.length !== ist.length || !crypto.timingSafeEqual(soll, ist)) return { ok: false, grund: "ungueltig" };
  if (ablauf * 1000 < now.getTime()) return { ok: false, grund: "abgelaufen" };
  if (!adminUserId || adminUserId !== uid) return { ok: false, grund: "fremd" };
  return { ok: true, zid, uid, ablauf };
}
