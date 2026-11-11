// 360dialog Partner-API: Kunden verbinden ihre WhatsApp-Nummer selbst
// („Integrated Onboarding“). Ablauf laut 360dialog-Doku:
//  1. Kunde öffnet https://app.360dialog.com/dashboard/app/<PARTNER_ID>/permissions
//     (mit redirect_url und state) – Konto anlegen, Meta Embedded Signup.
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
const ONBOARDING_DEFAULT = "https://app.360dialog.com/dashboard/app/{partner_id}/permissions";
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
export function onboardingLink(cfg: PartnerConfig, opts: { redirectUrl: string; state: string; email?: string | null; name?: string | null }): string {
  const url = new URL(cfg.onboardingUrl.replace("{partner_id}", encodeURIComponent(cfg.partnerId)));
  url.searchParams.set("redirect_url", opts.redirectUrl);
  url.searchParams.set("state", opts.state);
  url.searchParams.set("lang", "de");
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
