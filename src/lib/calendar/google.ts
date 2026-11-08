// Google-Kalender-Adapter (OAuth2, freeBusy, Events mit Google Meet).

import {
  cachedAccessToken,
  loadConnection,
  refreshTokenOf,
  saveConnection,
  updateTokens,
  type Busy,
  type CreatedEvent,
  type NewEvent,
} from "@/lib/calendar/tokens";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";
// calendar.events: Termine anlegen; calendar.freebusy: belegte Zeiten lesen
// (ohne Termininhalte — datensparsam). freeBusy funktioniert NICHT mit
// calendar.events allein.
export const GOOGLE_SCOPE = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
].join(" ");

export function googleHasRequiredScopes(scope: string | null | undefined): boolean {
  const have = new Set((scope ?? "").split(/\s+/));
  return GOOGLE_SCOPE.split(" ").every((s) => have.has(s));
}

function clientConfig() {
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

export function googleAuthUrl(customerId: string): string {
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

export async function googleExchangeCode(code: string, customerId: string): Promise<void> {
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
  await saveConnection({
    customerId,
    provider: "google",
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresInSec: json.expires_in,
    scope: GOOGLE_SCOPE,
  });
}

async function accessToken(customerId: string): Promise<string> {
  const conn = await loadConnection(customerId);
  const cached = cachedAccessToken(conn);
  if (cached) return cached;
  const { clientId, clientSecret } = clientConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshTokenOf(conn),
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) {
    throw new Error(`Google-Token-Refresh fehlgeschlagen (${res.status}).`);
  }
  await updateTokens(customerId, json.access_token, json.expires_in);
  return json.access_token;
}

/** Belegte Zeiten. Wirft bei jedem Fehler — nie still „alles frei". */
export async function googleGetBusy(customerId: string, min: Date, max: Date): Promise<Busy[]> {
  const token = await accessToken(customerId);
  const res = await fetch(`${CAL_BASE}/freeBusy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: min.toISOString(),
      timeMax: max.toISOString(),
      items: [{ id: "primary" }],
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    calendars?: { primary?: { busy?: { start: string; end: string }[]; errors?: unknown[] } };
  };
  const cal = json.calendars?.primary;
  if (!res.ok || !cal || (cal.errors && cal.errors.length > 0)) {
    throw new Error(
      `Google-Verfügbarkeit nicht abrufbar (${res.status}) — Kalender ggf. neu verbinden.`,
    );
  }
  return (cal.busy ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}

export async function googleCreateEvent(customerId: string, ev: NewEvent): Promise<CreatedEvent> {
  const token = await accessToken(customerId);
  const body: Record<string, unknown> = {
    summary: ev.summary,
    description: ev.description,
    start: { dateTime: ev.start.toISOString() },
    end: { dateTime: ev.end.toISOString() },
  };
  if (ev.attendeeEmails.length) body.attendees = ev.attendeeEmails.map((email) => ({ email }));
  if (ev.location) body.location = ev.location;
  if (ev.video) {
    body.conferenceData = {
      createRequest: {
        requestId: `wa-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }
  // sendUpdates=all: Google mailt den Teilnehmern die Einladung (inkl. Video-Link)
  // — als echte Kalendereinladung, die auch Outlook/Exchange direkt einträgt.
  const qs = `conferenceDataVersion=1${ev.attendeeEmails.length ? "&sendUpdates=all" : ""}`;
  const res = await fetch(`${CAL_BASE}/calendars/primary/events?${qs}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    id?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  };
  if (!res.ok || !json.id) throw new Error(`Google-Event fehlgeschlagen (${res.status}).`);
  const videoUrl =
    json.hangoutLink ??
    json.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
    null;
  return { eventId: json.id, videoUrl };
}

/** Termin löschen; Google schickt den Teilnehmern eine Absage. 404/410 = schon weg. */
export async function googleDeleteEvent(customerId: string, eventId: string): Promise<void> {
  const token = await accessToken(customerId);
  const res = await fetch(
    `${CAL_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google-Termin konnte nicht gelöscht werden (${res.status}).`);
  }
}
