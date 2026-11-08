// Google-Kalender-Anbindung je Kunde (OAuth2, Freebusy + Event-Anlage mit
// Meet-Link). Tokens liegen verschlüsselt in GoogleCalendarConnection; der
// Access-Token wird bei Bedarf über den Refresh-Token erneuert. Raw fetch
// (kein SDK) — passend zum Rest der Codebase.

import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";
// calendar.events: Termine anlegen; calendar.freebusy: belegte Zeiten lesen
// (ohne Termininhalte — datensparsam). freeBusy funktioniert NICHT mit
// calendar.events allein.
export const GOOGLE_SCOPE = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
].join(" ");

/** Hat die gespeicherte Verbindung alle aktuell nötigen Berechtigungen? */
export function hasRequiredScopes(scope: string | null | undefined): boolean {
  const have = new Set((scope ?? "").split(/\s+/));
  return GOOGLE_SCOPE.split(" ").every((s) => have.has(s));
}

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
      scope: GOOGLE_SCOPE,
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

type Busy = { start: string; end: string };

/** Termine sind deutsche Ortszeit — unabhängig von der Server-Zeitzone (UTC). */
const TZ = "Europe/Berlin";

/** Berlin-Kalenderdatum (Y/M/D + Wochentag) zu einem Zeitpunkt. */
function berlinParts(d: Date): { y: number; m: number; day: number; dow: number } {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    day: Number(get("day")),
    dow: dows.indexOf(get("weekday")),
  };
}

/** UTC-Zeitpunkt für eine Berliner Wanduhrzeit (berücksichtigt Sommer-/Winterzeit). */
function berlinTime(y: number, m: number, day: number, hour: number): Date {
  const guess = Date.UTC(y, m - 1, day, hour);
  const wall = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(new Date(guess));
  const g = (t: string) => Number(wall.find((x) => x.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  return new Date(guess - (asUtc - guess));
}

/**
 * Belegte Zeiten im Hauptkalender. Wirft bei jedem Fehler (fehlende
 * Berechtigung, API-Fehler) — niemals still "alles frei" annehmen, sonst
 * drohen Doppelbuchungen.
 */
async function getBusy(token: string, timeMin: Date, timeMax: Date): Promise<Busy[]> {
  const res = await fetch(`${CAL_BASE}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: TZ,
      items: [{ id: "primary" }],
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    calendars?: { primary?: { busy?: Busy[]; errors?: unknown[] } };
  };
  const cal = json.calendars?.primary;
  if (!res.ok || !cal || (cal.errors && cal.errors.length > 0)) {
    throw new Error(
      `Google-Verfügbarkeit nicht abrufbar (${res.status}) — Kalender ggf. neu verbinden.`,
    );
  }
  return cal.busy ?? [];
}

const overlaps = (busy: Busy[], start: Date, end: Date) =>
  busy.some((b) => new Date(b.start) < end && new Date(b.end) > start);

/** Freie Slots der nächsten Werktage (10/14/16 Uhr Berliner Zeit), die nicht belegt sind. */
export async function suggestSlots(
  customerId: string,
  durationMin = 30,
  count = 3,
): Promise<Slot[]> {
  const token = await getAccessToken(customerId);
  const now = new Date();
  const timeMin = new Date(now.getTime() + 60 * 60 * 1000);
  const timeMax = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
  const busy = await getBusy(token, timeMin, timeMax);

  const slots: Slot[] = [];
  const hours = [10, 14, 16];
  for (let d = 0; d < 10 && slots.length < count; d++) {
    const { y, m, day, dow } = berlinParts(
      new Date(now.getTime() + d * 24 * 60 * 60 * 1000),
    );
    if (dow === 0 || dow === 6) continue;
    for (const h of hours) {
      if (slots.length >= count) break;
      const start = berlinTime(y, m, day, h);
      if (start.getTime() < timeMin.getTime()) continue;
      const end = new Date(start.getTime() + durationMin * 60000);
      if (!overlaps(busy, start, end)) {
        slots.push({ start: start.toISOString(), end: end.toISOString() });
      }
    }
  }
  return slots;
}

/** Fehler, wenn der gewünschte Slot inzwischen belegt ist. */
export class SlotBusyError extends Error {
  constructor() {
    super("SLOT_BUSY");
  }
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
  /** Lead als Teilnehmer eintragen → Google verschickt die Einladung per Mail. */
  attendeeEmail?: string | null;
}): Promise<{ appointmentId: string; meetUrl: string | null; start: string }> {
  const token = await getAccessToken(opts.customerId);
  const start = new Date(opts.start);
  const end = new Date(start.getTime() + (opts.durationMin ?? 30) * 60000);
  if (start.getTime() < Date.now()) throw new Error("Startzeit liegt in der Vergangenheit.");
  // Unmittelbar vor dem Anlegen erneut prüfen — der Slot kann seit dem
  // Vorschlag belegt worden sein (oder der Bot nennt eine eigene Zeit).
  const busy = await getBusy(token, start, end);
  if (overlaps(busy, start, end)) throw new SlotBusyError();
  const body: Record<string, unknown> = {
    summary: opts.summary,
    description: opts.description ?? "",
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
  if (opts.attendeeEmail) {
    body.attendees = [{ email: opts.attendeeEmail }];
  }
  if (opts.mode === "video") {
    body.conferenceData = {
      createRequest: {
        requestId: `wa-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }
  // sendUpdates=all: Google mailt dem Teilnehmer die Einladung (inkl. Meet-Link).
  const qs = `conferenceDataVersion=1${opts.attendeeEmail ? "&sendUpdates=all" : ""}`;
  const res = await fetch(
    `${CAL_BASE}/calendars/primary/events?${qs}`,
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
