// Microsoft-Kalender-Adapter (Outlook / Exchange Online / Microsoft 365) über
// Microsoft Graph: OAuth2 (Authorization Code + Refresh), belegte Zeiten über
// calendarView, Termine mit Teams-Link. Raw fetch, kein SDK.
//
// Hinweis Firmen-Tenants (z. B. Allianz): Viele Unternehmen erlauben Nutzern
// nicht, Drittanbieter-Apps selbst zuzustimmen. Dann zeigt Microsoft beim
// Verbinden „Administratorgenehmigung erforderlich" — die IT des Kunden muss
// die App einmalig freigeben (oder die Verbindung bleibt nicht möglich).

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

const GRAPH = "https://graph.microsoft.com/v1.0";
// Minimal: Kalender lesen/schreiben + Offline-Zugriff (Refresh) + eigenes
// Profil (nur für die angezeigte Konto-E-Mail).
export const MICROSOFT_SCOPE = "offline_access User.Read Calendars.ReadWrite";

function clientConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;
  // "common" = Firmen- UND private Microsoft-Konten; per Env auf
  // "organizations" oder eine Tenant-ID einschränkbar.
  const tenant = process.env.MICROSOFT_TENANT ?? "common";
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Microsoft-OAuth-Env fehlt (MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET / MICROSOFT_REDIRECT_URI).",
    );
  }
  return {
    clientId,
    clientSecret,
    redirectUri,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
  };
}

export function microsoftConfigured(): boolean {
  return !!(
    process.env.MICROSOFT_CLIENT_ID &&
    process.env.MICROSOFT_CLIENT_SECRET &&
    process.env.MICROSOFT_REDIRECT_URI
  );
}

export function microsoftAuthUrl(customerId: string): string {
  const { clientId, redirectUri, authorizeUrl } = clientConfig();
  const p = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: MICROSOFT_SCOPE,
    prompt: "select_account",
    state: customerId,
  });
  return `${authorizeUrl}?${p.toString()}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

export async function microsoftExchangeCode(code: string, customerId: string): Promise<void> {
  const { clientId, clientSecret, redirectUri, tokenUrl } = clientConfig();
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: MICROSOFT_SCOPE,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Microsoft-Token-Tausch fehlgeschlagen (${res.status}): ${json.error ?? ""} ${(json.error_description ?? "").slice(0, 200)}`,
    );
  }
  // Konto-E-Mail nur zur Anzeige im CRM.
  let accountEmail: string | null = null;
  const me = await fetch(`${GRAPH}/me?$select=mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${json.access_token}` },
  });
  if (me.ok) {
    const m = (await me.json()) as { mail?: string | null; userPrincipalName?: string };
    accountEmail = m.mail ?? m.userPrincipalName ?? null;
  }
  await saveConnection({
    customerId,
    provider: "microsoft",
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresInSec: json.expires_in,
    scope: json.scope ?? MICROSOFT_SCOPE,
    accountEmail,
  });
}

async function accessToken(customerId: string): Promise<string> {
  const conn = await loadConnection(customerId);
  const cached = cachedAccessToken(conn);
  if (cached) return cached;
  const { clientId, clientSecret, tokenUrl } = clientConfig();
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshTokenOf(conn),
      grant_type: "refresh_token",
      scope: MICROSOFT_SCOPE,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) {
    throw new Error(`Microsoft-Token-Refresh fehlgeschlagen (${res.status}).`);
  }
  // Microsoft rotiert Refresh-Tokens → den neuen mitspeichern.
  await updateTokens(customerId, json.access_token, json.expires_in, json.refresh_token);
  return json.access_token;
}

/** Graph liefert dateTime ohne Zone, wenn per Prefer UTC angefordert. */
function graphUtc(dt: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(dt) ? dt : `${dt}Z`);
}

/** Belegte Zeiten (alles außer „frei"). Wirft bei Fehlern — nie still „frei". */
export async function microsoftGetBusy(customerId: string, min: Date, max: Date): Promise<Busy[]> {
  const token = await accessToken(customerId);
  const busy: Busy[] = [];
  let url: string | null =
    `${GRAPH}/me/calendarView?startDateTime=${encodeURIComponent(min.toISOString())}` +
    `&endDateTime=${encodeURIComponent(max.toISOString())}` +
    `&$select=start,end,showAs,isCancelled&$top=250`;
  for (let page = 0; url && page < 20; page++) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' },
    });
    if (!res.ok) {
      throw new Error(
        `Outlook-Verfügbarkeit nicht abrufbar (${res.status}) — Kalender ggf. neu verbinden.`,
      );
    }
    const json = (await res.json()) as {
      value?: {
        start?: { dateTime: string };
        end?: { dateTime: string };
        showAs?: string;
        isCancelled?: boolean;
      }[];
      "@odata.nextLink"?: string;
    };
    for (const ev of json.value ?? []) {
      if (ev.isCancelled || ev.showAs === "free" || !ev.start || !ev.end) continue;
      busy.push({ start: graphUtc(ev.start.dateTime), end: graphUtc(ev.end.dateTime) });
    }
    url = json["@odata.nextLink"] ?? null;
  }
  return busy;
}

export async function microsoftCreateEvent(
  customerId: string,
  ev: NewEvent,
): Promise<CreatedEvent> {
  const token = await accessToken(customerId);
  const toGraph = (d: Date) => ({ dateTime: d.toISOString().replace("Z", ""), timeZone: "UTC" });
  const base: Record<string, unknown> = {
    subject: ev.summary,
    body: { contentType: "text", content: ev.description },
    start: toGraph(ev.start),
    end: toGraph(ev.end),
    ...(ev.location ? { location: { displayName: ev.location } } : {}),
    // Mit Teilnehmer verschickt Outlook die Einladung automatisch per Mail.
    ...(ev.attendeeEmail
      ? { attendees: [{ emailAddress: { address: ev.attendeeEmail }, type: "required" }] }
      : {}),
  };
  const create = (body: Record<string, unknown>) =>
    fetch(`${GRAPH}/me/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  let res = await create(
    ev.video ? { ...base, isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" } : base,
  );
  // Private Microsoft-Konten (outlook.com) können keine Teams-Business-Links
  // erzeugen → ohne Online-Meeting erneut versuchen statt zu scheitern.
  if (!res.ok && ev.video && res.status === 400) {
    res = await create(base);
  }
  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    onlineMeeting?: { joinUrl?: string } | null;
  };
  if (!res.ok || !json.id) throw new Error(`Outlook-Termin fehlgeschlagen (${res.status}).`);
  return { eventId: json.id, videoUrl: json.onlineMeeting?.joinUrl ?? null };
}
