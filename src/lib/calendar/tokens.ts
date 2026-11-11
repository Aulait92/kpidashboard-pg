// Gemeinsame Token-Ablage für Kalender-Anbindungen (Google/Microsoft).
// Tokens liegen ausschließlich app-seitig verschlüsselt in der DB.

import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";

export type CalendarProvider = "google" | "microsoft";

// Kalender-Schlüssel: die customerId (Kalender der Agentur, CalendarConnection)
// oder „user:<userId>" (eigener Kalender eines Team-Mitglieds, AdvisorCalendar).
// Die Adapter (Google/Microsoft) reichen den Schlüssel nur durch.
const USER_PREFIX = "user:";
export const userCalendarKey = (userId: string) => `${USER_PREFIX}${userId}`;
export const userIdOfKey = (key: string): string | null => (key.startsWith(USER_PREFIX) ? key.slice(USER_PREFIX.length) : null);

export async function loadConnection(key: string) {
  const userId = userIdOfKey(key);
  const conn = userId
    ? await prisma.advisorCalendar.findUnique({ where: { userId } })
    : await prisma.calendarConnection.findUnique({ where: { customerId: key } });
  if (!conn || conn.status !== "connected") {
    throw new Error(userId ? "Kalender des Beraters nicht verbunden." : "Kalender für diesen Kunden nicht verbunden.");
  }
  return conn;
}

/** Gewählter Unterkalender (Outlook) bzw. „primary". */
export async function calendarIdOf(key: string): Promise<string | null> {
  const userId = userIdOfKey(key);
  const conn = userId
    ? await prisma.advisorCalendar.findUnique({ where: { userId }, select: { calendarId: true } })
    : await prisma.calendarConnection.findUnique({ where: { customerId: key }, select: { calendarId: true } });
  return conn?.calendarId ?? null;
}

export async function setCalendarId(key: string, calendarId: string): Promise<void> {
  const userId = userIdOfKey(key);
  if (userId) await prisma.advisorCalendar.update({ where: { userId }, data: { calendarId } });
  else await prisma.calendarConnection.update({ where: { customerId: key }, data: { calendarId } });
}

/** Noch mindestens 60 s gültiger Access-Token, sonst null. */
export function cachedAccessToken(conn: {
  accessTokenEnc: string | null;
  tokenExpiresAt: Date | null;
}): string | null {
  if (
    conn.accessTokenEnc &&
    conn.tokenExpiresAt &&
    conn.tokenExpiresAt.getTime() > Date.now() + 60_000
  ) {
    return decryptSecret(conn.accessTokenEnc);
  }
  return null;
}

export function refreshTokenOf(conn: { refreshTokenEnc: string | null }): string {
  if (!conn.refreshTokenEnc) throw new Error("Kein Refresh-Token. Kalender neu verbinden.");
  return decryptSecret(conn.refreshTokenEnc);
}

/** Tokens nach Code-Tausch speichern (Verbindung anlegen/ersetzen). */
export async function saveConnection(opts: {
  /** Kalender-Schlüssel (customerId oder user:<id>). */
  customerId: string;
  provider: CalendarProvider;
  accessToken: string;
  refreshToken?: string | null;
  expiresInSec?: number | null;
  scope: string;
  accountEmail?: string | null;
}): Promise<void> {
  const data = {
    provider: opts.provider,
    accessTokenEnc: encryptSecret(opts.accessToken),
    tokenExpiresAt: new Date(Date.now() + (opts.expiresInSec ?? 3600) * 1000),
    scope: opts.scope,
    accountEmail: opts.accountEmail ?? null,
    status: "connected",
  };
  const userId = userIdOfKey(opts.customerId);
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { customerId: true } });
    if (!user?.customerId) throw new Error("Login gehört zu keinem Kunden.");
    const refreshTokenEnc = opts.refreshToken ? encryptSecret(opts.refreshToken) : null;
    await prisma.advisorCalendar.upsert({
      where: { userId },
      create: { userId, customerId: user.customerId, ...data, refreshTokenEnc },
      update: { ...data, calendarId: "primary", refreshTokenEnc },
    });
    return;
  }
  await prisma.calendarConnection.upsert({
    where: { customerId: opts.customerId },
    create: {
      customerId: opts.customerId,
      ...data,
      refreshTokenEnc: opts.refreshToken ? encryptSecret(opts.refreshToken) : null,
    },
    update: {
      ...data,
      // Neu verbinden = Hauptkalender des (evtl. anderen) Kontos; eine alte Kalender-Auswahl
      // (z. B. Outlook-ID oder Unterkalender) würde sonst weiterverwendet und Termine landen unsichtbar.
      calendarId: "primary",
      // Beim Anbieterwechsel alten Refresh-Token nie weiterverwenden.
      refreshTokenEnc: opts.refreshToken ? encryptSecret(opts.refreshToken) : null,
    },
  });
}

/** Nach Refresh: neuen Access- (und ggf. rotierten Refresh-)Token speichern. */
export async function updateTokens(
  key: string,
  accessToken: string,
  expiresInSec?: number | null,
  refreshToken?: string | null,
): Promise<void> {
  const data = {
    accessTokenEnc: encryptSecret(accessToken),
    tokenExpiresAt: new Date(Date.now() + (expiresInSec ?? 3600) * 1000),
    ...(refreshToken ? { refreshTokenEnc: encryptSecret(refreshToken) } : {}),
  };
  const userId = userIdOfKey(key);
  if (userId) await prisma.advisorCalendar.update({ where: { userId }, data });
  else await prisma.calendarConnection.update({ where: { customerId: key }, data });
}

export type Busy = { start: Date; end: Date };

export type NewEvent = {
  start: Date;
  end: Date;
  summary: string;
  description: string;
  /** Teilnehmer (Lead, Berater) — der Kalender verschickt Einladungen. */
  attendeeEmails: string[];
  /** true = Meet/Teams-Link vom Kalender erzeugen lassen. */
  video: boolean;
  /** Ort des Termins, z. B. fester Webex-Link. */
  location?: string | null;
};

export type CreatedEvent = { eventId: string; videoUrl: string | null };

/** Antwortstatus der Teilnehmer eines Termins (E-Mail klein geschrieben). */
export type AttendeeResponses = {
  /** Event existiert nicht mehr (im Kalender gelöscht). */
  gone: boolean;
  responses: Map<string, "accepted" | "declined" | "tentative" | "none">;
};
