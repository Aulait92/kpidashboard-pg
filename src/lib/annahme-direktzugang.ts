// „Passwort jetzt festlegen“ direkt nach der Annahme (Ole, 20.11.2026, Fall Herr Lohmann: Einladungsmail hing in der
// Quarantäne der Allianz). Der Angebotslink ist teilbar und lange gültig, deshalb steht auf der Seite nie ein
// Einladungslink. Stattdessen bekommt nur der Browser, in dem angenommen wurde, ein signiertes, httpOnly-Merkmal
// (12 Stunden). Mit diesem Merkmal erzeugt der Knopf erst beim Tippen einen frischen Link (lib/annahme-direktzugang-server.ts).
// Reine Funktionen: Signatur und Prüfung (HMAC-SHA256 mit AUTH_SECRET).

import crypto from "node:crypto";

export const ANNAHME_COOKIE = "pg_annahme";
export const ANNAHME_TTL_MS = 12 * 60 * 60 * 1000;

const mac = (secret: string, data: string) => crypto.createHmac("sha256", `annahme:${secret}`).update(data).digest("base64url");

/** Wert des Merkmals: Angebots-ID, Ablauf (ms) und Signatur. */
export function signAnnahme(offerId: string, secret: string, now: number = Date.now()): string {
  const data = `${offerId}.${now + ANNAHME_TTL_MS}`;
  return `${data}.${mac(secret, data)}`;
}

/** Gilt das Merkmal für dieses Angebot und ist es noch nicht abgelaufen? */
export function pruefeAnnahme(value: string | null | undefined, offerId: string, secret: string | null | undefined, now: number = Date.now()): boolean {
  if (!value || !secret || !offerId) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [id, exp, sig] = parts;
  if (id !== offerId || !/^\d+$/.test(exp) || Number(exp) <= now) return false;
  const expected = mac(secret, `${id}.${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
