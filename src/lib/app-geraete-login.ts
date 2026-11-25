// Dauerhafte Anmeldung in der App-Store-App, entsperrt mit Face ID (Ole, 25.11.2026: „In der App muss man sich bei
// jedem Öffnen einloggen. Und Face ID wäre auch gut“).
//
// Warum: Die App ist eine Hülle um app.performancegrowth.de. Das Sitzungs-Cookie liegt im WebView, und iOS hält es
// dort nicht zuverlässig über einen Neustart der App. Deshalb bekommt die App nach dem Login einen eigenen
// Geräte-Schlüssel, den sie im Schlüsselbund des Handys hinter Face ID ablegt (Plugin NativeBiometric,
// src/lib/native-bridge.ts). Beim Öffnen: Face ID → Schlüssel aus dem Schlüsselbund → hier einlösen → Sitzungs-Cookie.
//
// Regeln je Schlüssel:
// - Nur der SHA-256-Hash liegt in der Datenbank, der Klartext nur im Schlüsselbund des Geräts.
// - Jede Nutzung tauscht ihn aus (der alte gilt danach nicht mehr) und verlängert die Laufzeit.
// - Gültig nur, solange die Sitzungsversion des Logins gleich ist: „Überall abmelden“, Passwortwechsel, 2FA-Änderung
//   und das Löschen eines Logins beenden auch die Face-ID-Anmeldung (lib/auth.ts, invalidateUserSessions).
// - Ausgegeben wird er nur an eine bereits vollständig angemeldete Sitzung (inkl. 2FA). Das Einlösen ersetzt deshalb
//   den 2FA-Schritt, wie ein vertrautes Gerät.

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

/** Laufzeit ohne Nutzung; jede Nutzung verlängert sie. */
export const GERAETE_LOGIN_TTL_MS = 90 * 24 * 60 * 60_000;
/** Höchstens so viele aktive Geräte je Login; ältere werden beim Ausgeben beendet. */
export const GERAETE_LOGIN_MAX = 10;

/** Form der Schlüssel (base64url, 32 Byte = 43 Zeichen); alles andere gar nicht erst nachschlagen. */
export const GERAETE_LOGIN_RE = /^[A-Za-z0-9_-]{40,100}$/;

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export type GeraeteLogin = { id: string; token: string };

type Plattform = "ios" | "android" | null;

/** Neuer Schlüssel für ein Gerät. Nur aufrufen, wenn der Login gerade vollständig angemeldet ist. */
export async function gibGeraeteLogin(userId: string, sessionVersion: number, platform: Plattform, now = new Date()): Promise<GeraeteLogin> {
  const token = crypto.randomBytes(32).toString("base64url");
  const row = await prisma.appGeraeteLogin.create({
    data: { tokenHash: sha(token), userId, sessionVersion, platform, expiresAt: new Date(now.getTime() + GERAETE_LOGIN_TTL_MS), lastUsedAt: now },
    select: { id: true },
  });
  // Nur die neuesten GERAETE_LOGIN_MAX bleiben aktiv
  const aktiv = await prisma.appGeraeteLogin.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { lastUsedAt: "desc" },
    select: { id: true },
  });
  const zuViel = aktiv.slice(GERAETE_LOGIN_MAX).map((r) => r.id);
  if (zuViel.length) await prisma.appGeraeteLogin.updateMany({ where: { id: { in: zuViel } }, data: { revokedAt: now } });
  // Aufräumen: lange beendete oder abgelaufene Einträge
  const alt = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
  await prisma.appGeraeteLogin.deleteMany({ where: { OR: [{ revokedAt: { lt: alt } }, { expiresAt: { lt: alt } }] } }).catch(() => {});
  return { id: row.id, token };
}

export type Eingeloest = {
  user: { id: string; email: string; role: string; customerId: string | null; sessionVersion: number };
  neu: GeraeteLogin;
};

/**
 * Schlüssel einlösen: prüfen, sofort beenden (atomar, nur der erste Aufruf gewinnt) und einen neuen ausgeben.
 * null = unbekannt, abgelaufen, schon benutzt, Login gelöscht oder Sitzungsversion geändert.
 */
export async function loeseGeraeteLoginEin(token: string, now = new Date()): Promise<Eingeloest | null> {
  if (!token || !GERAETE_LOGIN_RE.test(token)) return null;
  const hash = sha(token);
  const row = await prisma.appGeraeteLogin.findUnique({
    where: { tokenHash: hash },
    select: {
      id: true,
      sessionVersion: true,
      platform: true,
      revokedAt: true,
      expiresAt: true,
      user: { select: { id: true, email: true, role: true, customerId: true, sessionVersion: true } },
    },
  });
  if (!row || row.revokedAt || row.expiresAt <= now) return null;
  // Atomar beenden: bei zwei gleichzeitigen Aufrufen bekommt nur einer einen neuen Schlüssel
  const done = await prisma.appGeraeteLogin.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: now, lastUsedAt: now } });
  if (done.count !== 1) return null;
  if (row.user.sessionVersion !== row.sessionVersion) return null;
  const neu = await gibGeraeteLogin(row.user.id, row.user.sessionVersion, row.platform === "ios" || row.platform === "android" ? row.platform : null, now);
  return { user: row.user, neu };
}

/** Face-ID-Anmeldung dieses Geräts beenden (Abmelden oder in den Einstellungen ausgeschaltet). */
export async function beendeGeraeteLogin(userId: string, id: string, now = new Date()): Promise<boolean> {
  if (!id || id.length > 60) return false;
  const res = await prisma.appGeraeteLogin.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: now } });
  return res.count === 1;
}
