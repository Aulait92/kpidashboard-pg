// LinkedIn-Schnittstelle für das persönliche Profil (Ole, 14.11.2026):
// Anmelden (OpenID Connect + „Share on LinkedIn“), Posten über die Posts-API,
// Statistik je Post über memberCreatorPostAnalytics (nur mit freigeschaltetem Zugang).
// Doku: learn.microsoft.com/linkedin – Posts API, Sign In with LinkedIn v2, Post Statistics.

import crypto from "node:crypto";

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const REST = "https://api.linkedin.com/rest";

/** Versionen gelten mind. ein Jahr; bei Bedarf per LINKEDIN_API_VERSION anheben. */
export const apiVersion = () => process.env.LINKEDIN_API_VERSION ?? "202610";

export const linkedInAvailable = () => !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
/** Statistik-Zugang (r_member_postAnalytics) nur anfragen, wenn LinkedIn ihn freigeschaltet hat – sonst lehnt LinkedIn die Anmeldung ab. */
export const analyticsScopeEnabled = () => process.env.LINKEDIN_ANALYTICS === "1";

export function linkedInScopes(): string {
  return ["openid", "profile", "w_member_social", ...(analyticsScopeEnabled() ? ["r_member_postAnalytics"] : [])].join(" ");
}

export function redirectUri(origin: string): string {
  return process.env.LINKEDIN_REDIRECT_URI ?? `${origin}/api/linkedin/callback`;
}

// ─── state: an den Login gebunden und signiert ──────────────────────────
const secret = () => process.env.AUTH_SECRET ?? "dev-secret";
const sig = (v: string) => crypto.createHmac("sha256", secret()).update(`linkedin:${v}`).digest("base64url").slice(0, 32);
export const linkedInState = (userId: string) => `li:${userId}.${sig(userId)}`;
export function userFromLinkedInState(state: string): string | null {
  const m = /^li:([^.]+)\.(.+)$/.exec(state);
  if (!m) return null;
  const a = Buffer.from(sig(m[1]));
  const b = Buffer.from(m[2]);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? m[1] : null;
}

export function linkedInAuthUrl(userId: string, origin: string): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", process.env.LINKEDIN_CLIENT_ID ?? "");
  u.searchParams.set("redirect_uri", redirectUri(origin));
  u.searchParams.set("state", linkedInState(userId));
  u.searchParams.set("scope", linkedInScopes());
  return u.toString();
}

export type LinkedInToken = { accessToken: string; expiresAt: Date; scopes: string };

export async function exchangeCode(code: string, origin: string, now = new Date()): Promise<LinkedInToken> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(origin),
      client_id: process.env.LINKEDIN_CLIENT_ID ?? "",
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; scope?: string; error_description?: string };
  if (!res.ok || !data.access_token) throw new Error(`LinkedIn-Anmeldung fehlgeschlagen: ${data.error_description ?? res.status}`);
  return {
    accessToken: data.access_token,
    // Zugänge gelten 60 Tage; ohne Angabe vorsichtig 50 Tage annehmen
    expiresAt: new Date(now.getTime() + (data.expires_in ?? 50 * 86400) * 1000),
    scopes: data.scope ?? linkedInScopes(),
  };
}

export async function fetchMember(accessToken: string): Promise<{ personUrn: string; name: string | null }> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = (await res.json().catch(() => ({}))) as { sub?: string; name?: string };
  if (!res.ok || !data.sub) throw new Error(`LinkedIn-Profil nicht lesbar (${res.status})`);
  return { personUrn: `urn:li:person:${data.sub}`, name: data.name ?? null };
}

// ─── Text für die Posts-API ─────────────────────────────────────────────
// „commentary“ nutzt LinkedIns little-text-Format: Sonderzeichen müssen mit \ maskiert
// werden, sonst schneidet LinkedIn den Text ab (z. B. an einer Klammer). Hashtags werden
// als Hashtag-Vorlage geschrieben, damit sie verlinkt bleiben.
const RESERVED = /[\\|{}@[\]()<>#*_~]/g;
export function toLittleText(text: string): string {
  const parts: string[] = [];
  let last = 0;
  // #Wort (beginnt mit Buchstabe; nicht mitten im Wort oder direkt nach einem Punkt)
  const re = /(^|[^\p{L}\p{N}_.])#(\p{L}[\p{L}\p{N}_]*)/gu;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const start = m.index + m[1].length;
    parts.push(text.slice(last, start).replace(RESERVED, (c) => `\\${c}`));
    parts.push(`{hashtag|\\#|${m[2].replace(RESERVED, (c) => `\\${c}`)}}`);
    last = start + 1 + m[2].length;
  }
  parts.push(text.slice(last).replace(RESERVED, (c) => `\\${c}`));
  return parts.join("");
}

export const postUrl = (urn: string) => `https://www.linkedin.com/feed/update/${urn}/`;

export type PostImage = { data: Buffer; contentType: string; alt?: string };

/** Bild hochladen (Images API: initializeUpload → PUT) → urn:li:image:… */
export async function uploadImage(accessToken: string, personUrn: string, img: PostImage): Promise<string> {
  const init = await fetch(`${REST}/images?action=initializeUpload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "Linkedin-Version": apiVersion(),
    },
    body: JSON.stringify({ initializeUploadRequest: { owner: personUrn } }),
  });
  const data = (await init.json().catch(() => ({}))) as { value?: { uploadUrl?: string; image?: string } };
  if (!init.ok || !data.value?.uploadUrl || !data.value.image) {
    const err = new Error(`LinkedIn: Bild-Upload nicht möglich (${init.status})`);
    (err as Error & { status?: number }).status = init.status;
    throw err;
  }
  const put = await fetch(data.value.uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": img.contentType },
    body: new Uint8Array(img.data),
  });
  if (!put.ok) throw new Error(`LinkedIn: Bild-Upload fehlgeschlagen (${put.status})`);
  return data.value.image;
}

/** Post im Namen des Mitglieds veröffentlichen (optional mit Bild) → URN (urn:li:share:…). */
export async function publishTextPost(accessToken: string, personUrn: string, text: string, image?: PostImage | null): Promise<string> {
  const imageUrn = image ? await uploadImage(accessToken, personUrn, image) : null;
  const res = await fetch(`${REST}/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "Linkedin-Version": apiVersion(),
    },
    body: JSON.stringify({
      author: personUrn,
      commentary: toLittleText(text),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      ...(imageUrn ? { content: { media: { id: imageUrn, ...(image?.alt ? { altText: image.alt.slice(0, 4000) } : {}) } } } : {}),
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
  });
  if (res.status !== 201) {
    const body = await res.text().catch(() => "");
    const err = new Error(`LinkedIn hat den Post abgelehnt (${res.status}): ${body.slice(0, 300)}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const urn = res.headers.get("x-restli-id");
  if (!urn) throw new Error("LinkedIn hat keine Post-ID zurückgegeben");
  return urn;
}

// ─── Statistik je Post (r_member_postAnalytics) ─────────────────────────
export type PostMetrics = { impressions: number | null; membersReached: number | null; reactions: number | null; comments: number | null; reposts: number | null };
const METRICS: [keyof PostMetrics, string][] = [
  ["impressions", "IMPRESSION"],
  ["membersReached", "MEMBERS_REACHED"],
  ["reactions", "REACTION"],
  ["comments", "COMMENT"],
  ["reposts", "RESHARE"],
];

export function entityParam(urn: string): string | null {
  const kind = urn.startsWith("urn:li:share:") ? "share" : urn.startsWith("urn:li:ugcPost:") ? "ugc" : null;
  return kind ? `(${kind}:${encodeURIComponent(urn)})` : null;
}

/** Summen (TOTAL) je Kennzahl; je Kennzahl eine Anfrage (so verlangt es die API). */
export async function fetchPostMetrics(accessToken: string, urn: string): Promise<PostMetrics> {
  const entity = entityParam(urn);
  if (!entity) throw new Error("Nur Posts aus der App haben eine abrufbare Statistik");
  const out: PostMetrics = { impressions: null, membersReached: null, reactions: null, comments: null, reposts: null };
  for (const [key, type] of METRICS) {
    // Query selbst zusammensetzen: Rest.li-Klammern dürfen nicht kodiert werden
    const url = `${REST}/memberCreatorPostAnalytics?q=entity&entity=${entity}&queryType=${type}&aggregation=TOTAL`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0", "Linkedin-Version": apiVersion() },
    });
    if (!res.ok) {
      const err = new Error(`LinkedIn-Statistik nicht lesbar (${res.status})`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }
    const data = (await res.json().catch(() => ({}))) as { elements?: { count?: number }[] };
    out[key] = (data.elements ?? []).reduce((s, e) => s + (e.count ?? 0), 0);
  }
  return out;
}
