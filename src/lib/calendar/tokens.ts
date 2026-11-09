// Gemeinsame Token-Ablage für Kalender-Anbindungen (Google/Microsoft).
// Tokens liegen ausschließlich app-seitig verschlüsselt in der DB.

import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";

export type CalendarProvider = "google" | "microsoft";

export async function loadConnection(customerId: string) {
  const conn = await prisma.calendarConnection.findUnique({ where: { customerId } });
  if (!conn || conn.status !== "connected") {
    throw new Error("Kalender für diesen Kunden nicht verbunden.");
  }
  return conn;
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
  await prisma.calendarConnection.upsert({
    where: { customerId: opts.customerId },
    create: {
      customerId: opts.customerId,
      ...data,
      refreshTokenEnc: opts.refreshToken ? encryptSecret(opts.refreshToken) : null,
    },
    update: {
      ...data,
      // Beim Anbieterwechsel alten Refresh-Token nie weiterverwenden.
      refreshTokenEnc: opts.refreshToken ? encryptSecret(opts.refreshToken) : null,
    },
  });
}

/** Nach Refresh: neuen Access- (und ggf. rotierten Refresh-)Token speichern. */
export async function updateTokens(
  customerId: string,
  accessToken: string,
  expiresInSec?: number | null,
  refreshToken?: string | null,
): Promise<void> {
  await prisma.calendarConnection.update({
    where: { customerId },
    data: {
      accessTokenEnc: encryptSecret(accessToken),
      tokenExpiresAt: new Date(Date.now() + (expiresInSec ?? 3600) * 1000),
      ...(refreshToken ? { refreshTokenEnc: encryptSecret(refreshToken) } : {}),
    },
  });
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
