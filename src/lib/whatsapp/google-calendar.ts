// Google-Kalender-Anbindung je Kunde (OAuth2, Freebusy + Event-Anlage mit
// Meet-Link). Tokens liegen verschlüsselt in GoogleCalendarConnection; der
// Access-Token wird bei Bedarf über den Refresh-Token erneuert. Raw fetch
// (kein SDK) — passend zum Rest der Codebase.

import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";
export const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events";

function clientConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google-OAuth-Env fehlt (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI).",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/** Consent-URL, zu der der Admin den Kunden-Kalender verbindet. */
export function authUrl(customerId: string): string {
  const { clientId, redirectUri } = clientConfig();
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPE,
    state: customerId,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

/** OAuth-Callback: Code gegen Tokens tauschen und verschlüsselt speichern. */
export async function exchangeCode(
  code: string,
  customerId: string,
): Promise<void> {
  const { clientId, clientSecret, redirectUri } = clientConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(`Google-Token-Tausch fehlgeschlagen (${res.status}).`);
  }
  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000);
  await prisma.googleCalendarConnection.upsert({
    where: { customerId },
    create: {
      customerId,
      accessTokenEnc: encryptSecret(json.access_token),
      refreshTokenEnc: json.refresh_token
        ? encryptSecret(json.refresh_token)
        : null,
      tokenExpiresAt: expiresAt,
      scope: GOOGLE_SCOPE,
      status: "connected",
    },
    update: {
      accessTokenEnc: encryptSecret(json.access_token),
      ...(json.refresh_token
        ? { refreshTokenEnc: encryptSecret(json.refresh_token) }
        : {}),
      tokenExpiresAt: expiresAt,
      status: "connected",
    },
  });
}

async function getAccessToken(customerId: string): Promise<string> {
  const conn = await prisma.googleCalendarConnection.findUnique({
    where: { customerId },
  });
  if (!conn || conn.status !== "connected") {
    throw new Error("Google-Kalender für diesen Kunden nicht verbunden.");
  }
  if (
    conn.accessTokenEnc &&
    conn.tokenExpiresAt &&
    conn.tokenExpiresAt.getTime() > Date.now() + 60_000
  ) {
    return decryptSecret(conn.accessTokenEnc);
  }
  if (!conn.refreshTokenEnc) throw new Error("Kein Google-Refresh-Token.");
  const { clientId, clientSecret } = clientConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decryptSecret(conn.refreshTokenEnc),
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(`Google-Token-Refresh fehlgeschlagen (${res.status}).`);
  }
  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000);
  await prisma.googleCalendarConnection.update({
    where: { customerId },
    data: {
      accessTokenEnc: encryptSecret(json.access_token),
      tokenExpiresAt: expiresAt,
    },
  });
  return json.access_token;
}

export type Slot = { start: string; end: string };

/** Freie Slots der nächsten 7 Werktage (10/14/16 Uhr), die nicht belegt sind. */
export async function suggestSlots(
  customerId: string,
  durationMin = 30,
  count = 3,
): Promise<Slot[]> {
  const token = await getAccessToken(customerId);
  const now = new Date();
  const timeMin = new Date(now.getTime() + 60 * 60 * 1000);
  const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const res = await fetch(`${CAL_BASE}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: "primary" }],
    }),
  });
  const json = (await res.json()) as {
    calendars?: { primary?: { busy?: { start: string; end: string }[] } };
  };
  const busy = json.calendars?.primary?.busy ?? [];
  const slots: Slot[] = [];
  const hours = [10, 14, 16];
  for (let d = 0; d < 7 && slots.length < count; d++) {
    const day = new Date(now);
    day.setDate(now.getDate() + d);
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue;
    for (const h of hours) {
      if (slots.length >= count) break;
      const start = new Date(day);
      start.setHours(h, 0, 0, 0);
      if (start.getTime() < timeMin.getTime()) continue;
      const end = new Date(start.getTime() + durationMin * 60000);
      const overlaps = busy.some(
        (b) => new Date(b.start) < end && new Date(b.end) > start,
      );
      if (!overlaps) slots.push({ start: start.toISOString(), end: end.toISOString() });
    }
  }
  return slots;
}

/** Termin anlegen: Kalender-Event (Meet bei Video) + Appointment-Zeile. */
export async function bookAppointment(opts: {
  customerId: string;
  leadId?: string | null;
  conversationId?: string | null;
  start: string;
  durationMin?: number;
  mode: "phone" | "video";
  summary: string;
  description?: string;
}): Promise<{ appointmentId: string; meetUrl: string | null; start: string }> {
  const token = await getAccessToken(opts.customerId);
  const start = new Date(opts.start);
  const end = new Date(start.getTime() + (opts.durationMin ?? 30) * 60000);
  const body: Record<string, unknown> = {
    summary: opts.summary,
    description: opts.description ?? "",
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
  if (opts.mode === "video") {
    body.conferenceData = {
      createRequest: {
        requestId: `wa-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }
  const res = await fetch(
    `${CAL_BASE}/calendars/primary/events?conferenceDataVersion=1`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const json = (await res.json()) as {
    id?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  };
  if (!res.ok || !json.id) {
    throw new Error(`Google-Event fehlgeschlagen (${res.status}).`);
  }
  const meetUrl =
    json.hangoutLink ??
    json.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")
      ?.uri ??
    null;

  const appt = await prisma.appointment.create({
    data: {
      customerId: opts.customerId,
      leadId: opts.leadId ?? null,
      conversationId: opts.conversationId ?? null,
      mode: opts.mode,
      startsAt: start,
      endsAt: end,
      calendarEventId: json.id,
      meetUrl,
      status: "booked",
    },
  });
  return { appointmentId: appt.id, meetUrl, start: start.toISOString() };
}
