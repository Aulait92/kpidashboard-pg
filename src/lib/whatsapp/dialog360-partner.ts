// 360dialog Partner-API: Kunden verbinden ihre WhatsApp-Nummer selbst
// („Integrated Onboarding“). Ablauf laut 360dialog-Doku:
//  1. Kunde öffnet https://app.360dialog.com/onboarding/<PARTNER_ID> („Direct Link“ für neue Nummern unter
//     unserem Partner; mit redirect_url, state, partner, next=signup) – Konto anlegen, Meta Embedded Signup.
//     Bis 15.11.2026 war es …/dashboard/app/<PARTNER_ID>/permissions: Nicht angemeldete Nutzer sahen dort die
//     Login-Seite, „Sign up“ führte in die allgemeine Registrierung ohne Partner (Kunde direkt bei 360dialog,
//     Tarifwahl, kein Rücksprung). Per DIALOG360_ONBOARDING_URL weiter umstellbar.
//  2. 360dialog leitet zurück an redirect_url mit ?client=<id>&channels=[<id>,…]&state=…
//  3. Backend erzeugt per Partner-API einen API-Key für den Channel:
//     POST https://hub.360dialog.io/api/v2/partners/<PARTNER_ID>/channels/<CHANNEL_ID>/api_keys
//     Header X-API-Key: <Partner-API-Key>. 409 = Channel wird noch eingerichtet
//     (Retry-After), 429 = höchstens 1 Anfrage je 30 s und Channel.
// Quellen: docs.360dialog.com/partner/onboarding/integrated-onboarding/using-custom-io,
// …/integrated-onboarding (URL-Parameter), …/partner-api/overview (Auth, Base-URL),
// …/partner-api/api-reference/channel-management (api_keys, channels).

import crypto from "node:crypto";

const HUB_DEFAULT = "https://hub.360dialog.io";
const ONBOARDING_DEFAULT = "https://app.360dialog.com/onboarding/{partner_id}";
/** Gültigkeit des signierten state (Kunde muss Konto anlegen + Meta-Login – großzügig). */
export const STATE_TTL_MS = 2 * 60 * 60 * 1000;

export type PartnerConfig = { partnerId: string; apiKey: string; hubUrl: string; onboardingUrl: string };

/** Konfiguration aus den Railway-Variablen – null = Funktion ausgeblendet. */
export function partnerConfig(): PartnerConfig | null {
  const partnerId = process.env.DIALOG360_PARTNER_ID?.trim();
  const apiKey = process.env.DIALOG360_PARTNER_API_KEY?.trim();
  if (!partnerId || !apiKey) return null;
  return {
    partnerId,
    apiKey,
    hubUrl: (process.env.DIALOG360_HUB_URL?.trim() || HUB_DEFAULT).replace(/\/$/, ""),
    onboardingUrl: process.env.DIALOG360_ONBOARDING_URL?.trim() || ONBOARDING_DEFAULT,
  };
}

export const selfConnectEnabled = () => partnerConfig() !== null;

function stateSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET fehlt.");
  return s;
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (payload: string) => crypto.createHmac("sha256", stateSecret()).update(`d360:${payload}`).digest("base64url");

/** Signierter state: Kunde, Nutzer, Ablauf. Wird von 360dialog unverändert zurückgegeben. */
export function signState(customerId: string, userId: string | null, now = Date.now()): string {
  const payload = b64(JSON.stringify({ c: customerId, u: userId, e: now + STATE_TTL_MS }));
  return `${payload}.${sign(payload)}`;
}

export function verifyState(state: string | null | undefined, now = Date.now()): { customerId: string; userId: string | null } | null {
  if (!state || state.length > 1000) return null;
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { c?: unknown; u?: unknown; e?: unknown };
    if (typeof data.c !== "string" || typeof data.e !== "number" || data.e < now) return null;
    return { customerId: data.c, userId: typeof data.u === "string" ? data.u : null };
  } catch {
    return null;
  }
}

/** Link zum 360dialog-Onboarding (Konto anlegen + Meta Embedded Signup). */
export function onboardingLink(cfg: PartnerConfig, opts: { redirectUrl: string; state: string; email?: string | null; name?: string | null; customerId?: string | null; next?: "signup" | "login" }): string {
  const url = new URL(cfg.onboardingUrl.replace("{partner_id}", encodeURIComponent(cfg.partnerId)));
  url.searchParams.set("redirect_url", opts.redirectUrl);
  url.searchParams.set("state", opts.state);
  url.searchParams.set("lang", "de");
  // Nicht angemeldete Nutzer direkt zur Registrierung (statt Login-Seite), im Kontext unseres Partners
  url.searchParams.set("next", opts.next ?? "signup");
  // Kein plan_selection (15.11.2026): wirkt laut Doku nur bei Partnern mit gestaffelten Tarifen, Standard ist ohnehin
  // „regular“; bei Kunden, die selbst zahlen, lässt es sie den Tarif wählen. Partnerbezahlte Kunden sehen keine Tarifwahl.
  // Kunden-ID am 360dialog-Kunden speichern (partner_payload): so finden wir die Nummer auch ohne Rücksprung
  // („Verbindung prüfen“, lib/whatsapp/dialog360-match.ts)
  if (opts.customerId) url.searchParams.set("partner", opts.customerId);
  if (opts.email) url.searchParams.set("email", opts.email);
  if (opts.name) url.searchParams.set("name", opts.name);
  return url.toString();
}

/** channels kommt als „[a,b]“ (laut Doku) – auch „a,b“ oder JSON mit Anführungszeichen tolerieren. */
export function parseChannels(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter((s) => /^[A-Za-z0-9_-]{2,64}$/.test(s));
}

export type CreateKeyResult =
  | { kind: "ok"; apiKey: string; address: string | null }
  | { kind: "retry"; afterSeconds: number; status: number }
  | { kind: "error"; status: number; message: string };

/** API-Key für einen Channel erzeugen. Der Key ist nur in dieser Antwort lesbar. */
export async function createChannelApiKey(cfg: PartnerConfig, channelId: string): Promise<CreateKeyResult> {
  const url = `${cfg.hubUrl}/api/v2/partners/${encodeURIComponent(cfg.partnerId)}/channels/${encodeURIComponent(channelId)}/api_keys`;
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "X-API-Key": cfg.apiKey, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    return { kind: "error", status: 0, message: err instanceof Error ? err.message.slice(0, 200) : "Netzwerkfehler" };
  }
  if (res.status === 409 || res.status === 429) {
    const after = Number(res.headers.get("retry-after"));
    return { kind: "retry", afterSeconds: Number.isFinite(after) && after > 0 ? after : 30, status: res.status };
  }
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 200);
    try {
      message = (JSON.parse(text) as { meta?: { developer_message?: string } }).meta?.developer_message?.slice(0, 200) ?? message;
    } catch {
      /* Rohtext */
    }
    return { kind: "error", status: res.status, message };
  }
  try {
    const json = JSON.parse(text) as { api_key?: string; address?: string };
    if (!json.api_key) return { kind: "error", status: res.status, message: "Antwort ohne api_key" };
    return { kind: "ok", apiKey: json.api_key, address: json.address ?? null };
  } catch {
    return { kind: "error", status: res.status, message: "Antwort nicht lesbar" };
  }
}

/** Telefonnummer und Anzeigename des Channels (für die Anzeige „Verbunden: +49 …“). Best effort. */
export async function channelInfo(cfg: PartnerConfig, channelId: string): Promise<{ phone: string | null; name: string | null }> {
  const url = new URL(`${cfg.hubUrl}/api/v2/partners/${encodeURIComponent(cfg.partnerId)}/channels`);
  url.searchParams.set("filters", JSON.stringify({ id: channelId }));
  try {
    const res = await fetch(url, { headers: { "X-API-Key": cfg.apiKey, Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { phone: null, name: null };
    const json = (await res.json()) as { partner_channels?: Array<{ id?: string; setup_info?: { phone_number?: string; phone_name?: string } }> };
    const ch = json.partner_channels?.find((c) => c.id === channelId) ?? json.partner_channels?.[0];
    return { phone: ch?.setup_info?.phone_number ?? null, name: ch?.setup_info?.phone_name ?? null };
  } catch {
    return { phone: null, name: null };
  }
}

/** Nummer (Channel) aus der Partner-API, nur die Felder, die wir zum Zuordnen brauchen. */
export type PartnerChannel = {
  id: string;
  clientId: string | null;
  clientName: string | null;
  partnerPayload: string | null;
  contactEmail: string | null;
  phone: string | null;
  name: string | null;
  availability: string | null;
  createdAt: string | null;
  /** Unternehmensverifizierung bei Meta (waba_account.fb_account_status, z. B. verified | not_verified) */
  fbAccountStatus?: string | null;
  /** Business-Portfolio bei Meta (waba_account.on_behalf_of_business_info.name) */
  businessName?: string | null;
  /** WABA-ID bei Meta (waba_account.external_id) */
  wabaExternalId?: string | null;
};

/** Neueste Nummern des Partners (höchstens `limit`), für „Verbindung prüfen“ und die Zuordnung im Admin. */
export async function listPartnerChannels(cfg: PartnerConfig, limit = 200): Promise<PartnerChannel[]> {
  const url = new URL(`${cfg.hubUrl}/api/v2/partners/${encodeURIComponent(cfg.partnerId)}/channels`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("sort", "-created_at");
  const res = await fetch(url, { headers: { "X-API-Key": cfg.apiKey, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`360dialog ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const json = (await res.json()) as { partner_channels?: unknown[] };
  return (json.partner_channels ?? []).map((raw) => parsePartnerChannel(raw)).filter((c): c is PartnerChannel => !!c);
}

export function parsePartnerChannel(raw: unknown): PartnerChannel | null {
  const c = raw as {
    id?: unknown;
    client_id?: unknown;
    created_at?: unknown;
    availability_status?: unknown;
    setup_info?: { phone_number?: unknown; phone_name?: unknown };
    client?: { id?: unknown; name?: unknown; partner_payload?: unknown; contact_info?: { email?: unknown } };
    waba_account?: { external_id?: unknown; fb_account_status?: unknown; on_behalf_of_business_info?: { name?: unknown } };
  };
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const id = str(c?.id);
  if (!id) return null;
  return {
    id,
    clientId: str(c.client_id) ?? str(c.client?.id),
    clientName: str(c.client?.name),
    partnerPayload: str(c.client?.partner_payload),
    contactEmail: str(c.client?.contact_info?.email)?.toLowerCase() ?? null,
    phone: str(c.setup_info?.phone_number),
    name: str(c.setup_info?.phone_name),
    availability: str(c.availability_status),
    createdAt: str(c.created_at),
    fbAccountStatus: str(c.waba_account?.fb_account_status)?.toLowerCase() ?? null,
    businessName: str(c.waba_account?.on_behalf_of_business_info?.name),
    wabaExternalId: str(c.waba_account?.external_id),
  };
}

export type CreateClientResult = { kind: "ok"; clientId: string } | { kind: "exists" } | { kind: "error"; status: number; message: string };

/**
 * 360dialog-Kunden unter unserem Partner anlegen und einladen (Partner-API „Account Sharing“, Ole 15.11.2026):
 * POST /api/v2/partners/<PARTNER_ID>/account_sharing/clients { email, name, send_client_email, is_initial_onboarding_client }.
 * 360dialog schickt die Einladung (Passwort festlegen). Danach meldet sich der Kunde an und verbindet die Nummer
 * über den Partner-Link, ohne die allgemeine Registrierung (die den Partner verliert). Kunden-ID als partner_payload.
 */
export async function createPartnerClient(cfg: PartnerConfig, input: { email: string; name: string; customerId: string }): Promise<CreateClientResult> {
  const base = `${cfg.hubUrl}/api/v2/partners/${encodeURIComponent(cfg.partnerId)}`;
  let res: Response;
  try {
    res = await fetch(`${base}/account_sharing/clients`, {
      method: "POST",
      headers: { "X-API-Key": cfg.apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: input.email, name: input.name.slice(0, 120), send_client_email: true, is_initial_onboarding_client: true }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    return { kind: "error", status: 0, message: err instanceof Error ? err.message.slice(0, 200) : "Netzwerkfehler" };
  }
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 300);
    try {
      message = (JSON.parse(text) as { meta?: { developer_message?: string } }).meta?.developer_message?.slice(0, 300) ?? message;
    } catch {
      /* Rohtext */
    }
    // E-Mail hat schon ein Konto bei 360dialog: dann anmelden statt anlegen
    if (res.status === 409 || /already|exist/i.test(message)) return { kind: "exists" };
    return { kind: "error", status: res.status, message };
  }
  let clientId: string | null = null;
  try {
    clientId = (JSON.parse(text) as { id?: string }).id ?? null;
  } catch {
    clientId = null;
  }
  if (!clientId) return { kind: "error", status: res.status, message: "Antwort ohne Kunden-ID" };
  // Kunden-ID als Merkmal hinterlegen (für „Verbindung prüfen“); Fehler hier sind nicht schlimm
  await fetch(`${base}/clients/${encodeURIComponent(clientId)}`, {
    method: "PATCH",
    headers: { "X-API-Key": cfg.apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ partner_payload: input.customerId }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return { kind: "ok", clientId };
}
