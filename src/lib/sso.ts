// Anmeldung mit Microsoft oder Google (OpenID Connect, Code-Flow mit PKCE).
// Nutzt dieselben OAuth-Apps wie die Kalender-Anbindung. Das ID-Token kommt
// direkt vom Token-Endpunkt (TLS), daher genügt die Prüfung von Aussteller,
// Empfänger, Ablauf und Nonce (OIDC Core 3.1.3.7).

import crypto from "node:crypto";

export type SsoProvider = "google" | "microsoft";

const MS_CONSUMER_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";

type Config = { clientId: string; clientSecret: string; authorizeUrl: string; tokenUrl: string; extra: Record<string, string> };

function config(provider: SsoProvider): Config | null {
  if (provider === "google") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      extra: { prompt: "select_account" },
    };
  }
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const tenant = process.env.MICROSOFT_TENANT || "common";
  return {
    clientId,
    clientSecret,
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    extra: { prompt: "select_account", response_mode: "query" },
  };
}

export const ssoEnabled = (p: SsoProvider) => config(p) !== null;

export function redirectUri(origin: string, provider: SsoProvider) {
  return `${origin}/api/auth/${provider}/callback`;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

export function newPkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge, state: b64url(crypto.randomBytes(16)), nonce: b64url(crypto.randomBytes(16)) };
}

export function authorizeUrl(provider: SsoProvider, origin: string, p: { state: string; nonce: string; challenge: string }): string {
  const c = config(provider);
  if (!c) throw new Error("Anmeldung mit diesem Anbieter ist nicht eingerichtet.");
  const q = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: redirectUri(origin, provider),
    response_type: "code",
    scope: "openid email profile",
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
    ...c.extra,
  });
  return `${c.authorizeUrl}?${q.toString()}`;
}

type Claims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
  preferred_username?: string;
  tid?: string;
};

function decodeIdToken(idToken: string): Claims {
  const part = idToken.split(".")[1];
  if (!part) throw new Error("Ungültige Antwort des Anbieters.");
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Claims;
}

/** Bestätigte E-Mail aus den Claims, sonst Fehler. Exportiert für Tests. */
export function verifiedEmail(provider: SsoProvider, c: Claims, expected: { clientId: string; nonce: string; now?: number }): string {
  const now = Math.floor((expected.now ?? Date.now()) / 1000);
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(expected.clientId)) throw new Error("Anmeldung ungültig (Empfänger).");
  if (!c.exp || c.exp < now - 60) throw new Error("Anmeldung abgelaufen. Bitte erneut versuchen.");
  if (c.nonce !== expected.nonce) throw new Error("Anmeldung ungültig (Nonce).");
  if (provider === "google") {
    if (c.iss !== "https://accounts.google.com" && c.iss !== "accounts.google.com") throw new Error("Anmeldung ungültig (Aussteller).");
    if (!c.email || !(c.email_verified === true || c.email_verified === "true")) throw new Error("Die E-Mail-Adresse ist bei Google nicht bestätigt.");
    return c.email;
  }
  if (!c.tid || c.iss !== `https://login.microsoftonline.com/${c.tid}/v2.0`) throw new Error("Anmeldung ungültig (Aussteller).");
  // Firmenkonten: Anmeldename (UPN) liegt immer auf einer bestätigten Domain
  // des Tenants. Das frei setzbare email-Attribut wird bewusst nicht genutzt.
  // Private Microsoft-Konten: E-Mail ist von Microsoft bestätigt.
  const email = c.tid === MS_CONSUMER_TENANT ? (c.email ?? c.preferred_username) : c.preferred_username;
  if (!email || !email.includes("@")) throw new Error("Keine E-Mail-Adresse vom Microsoft-Konto erhalten.");
  return email;
}

export async function exchangeCode(provider: SsoProvider, origin: string, code: string, verifier: string, nonce: string): Promise<string> {
  const c = config(provider);
  if (!c) throw new Error("Anmeldung mit diesem Anbieter ist nicht eingerichtet.");
  const res = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(origin, provider),
      client_id: c.clientId,
      client_secret: c.clientSecret,
      code_verifier: verifier,
    }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: string; error_description?: string; error?: string };
  if (!res.ok || !body.id_token) throw new Error(body.error_description ?? body.error ?? `Anbieter antwortet mit ${res.status}.`);
  return verifiedEmail(provider, decodeIdToken(body.id_token), { clientId: c.clientId, nonce });
}

// Fehlercode aus dem `error`-Parameter des Anbieters. Microsoft hängt beim Abbruch
// teils weitere Parameter mit maskiertem „&“ (`&`, `%26`) an den Wert an,
// z. B. „access_denied&error_subcode=cancel&state=…“ → nur „access_denied“.
export function providerErrorCode(raw: string): string {
  return raw.split(/\\?u0026|%26|&/i)[0].trim();
}
