// Native Push für die App-Store-App: iOS über APNs (Token-Auth, HTTP/2),
// Android über Firebase Cloud Messaging (HTTP v1). Ohne Schlüssel in den
// Umgebungsvariablen wird still übersprungen – Web-Push läuft unabhängig davon.
//
// APNs:  APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY (Inhalt der .p8),
//        APNS_BUNDLE_ID (Standard de.performancegrowth.app), APNS_PRODUCTION=1 für
//        TestFlight/App Store (sonst Sandbox).
// FCM:   FIREBASE_SERVICE_ACCOUNT (JSON des Dienstkontos, einzeilig oder Base64).

import crypto from "node:crypto";
import http2 from "node:http2";
import { prisma } from "@/lib/prisma";

export type NativePayload = { title: string; body: string; url?: string; tag?: string; badge?: number | null };
export type NativeOutcome = { sent: number; removed: number; errors: string[] };

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

// ─── APNs ──────────────────────────────────────────────────────────────

export function apnsConfigured(): boolean {
  return !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_PRIVATE_KEY);
}

function pem(raw: string): string {
  const s = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  return s.trim();
}

let apnsJwt: { token: string; at: number } | null = null;
/** ES256-JWT für APNs; Apple erlaubt Wiederverwendung bis 60 Min., wir erneuern nach 50. */
export function apnsToken(now = Date.now()): string {
  if (apnsJwt && now - apnsJwt.at < 50 * 60_000) return apnsJwt.token;
  const header = b64url(JSON.stringify({ alg: "ES256", kid: process.env.APNS_KEY_ID }));
  const claims = b64url(JSON.stringify({ iss: process.env.APNS_TEAM_ID, iat: Math.floor(now / 1000) }));
  const sig = crypto.sign("sha256", Buffer.from(`${header}.${claims}`), { key: pem(process.env.APNS_PRIVATE_KEY ?? ""), dsaEncoding: "ieee-p1363" });
  apnsJwt = { token: `${header}.${claims}.${b64url(sig)}`, at: now };
  return apnsJwt.token;
}

export function apnsBody(p: NativePayload) {
  return {
    aps: {
      alert: { title: p.title, body: p.body },
      sound: "default",
      ...(p.badge != null ? { badge: p.badge } : {}),
      ...(p.tag ? { "thread-id": p.tag } : {}),
    },
    ...(p.url ? { url: p.url } : {}),
  };
}

type ApnsResult = { status: number; reason?: string };
type ApnsSender = (token: string, body: unknown, collapseId?: string) => Promise<ApnsResult>;

const apnsHttp2: ApnsSender = (deviceToken, body, collapseId) =>
  new Promise((resolve, reject) => {
    const host = process.env.APNS_PRODUCTION === "1" ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com";
    const client = http2.connect(host);
    client.on("error", reject);
    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${apnsToken()}`,
      "apns-topic": process.env.APNS_BUNDLE_ID || "de.performancegrowth.app",
      "apns-push-type": "alert",
      "apns-priority": "10",
      ...(collapseId ? { "apns-collapse-id": collapseId.slice(0, 64) } : {}),
      "content-type": "application/json",
    });
    let status = 0;
    let data = "";
    req.setTimeout(10_000, () => req.close(http2.constants.NGHTTP2_CANCEL));
    req.on("response", (h) => (status = Number(h[":status"] ?? 0)));
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      client.close();
      let reason: string | undefined;
      try {
        reason = data ? (JSON.parse(data) as { reason?: string }).reason : undefined;
      } catch {
        reason = data.slice(0, 200);
      }
      resolve({ status, reason });
    });
    req.on("error", (e) => {
      client.close();
      reject(e);
    });
    req.end(JSON.stringify(body));
  });

let apnsSender: ApnsSender = apnsHttp2;
/** Nur für Tests. */
export function __setApnsSender(fn: ApnsSender | null) {
  apnsSender = fn ?? apnsHttp2;
}

/** true = Token ist ungültig und soll gelöscht werden. */
export function apnsTokenDead(r: ApnsResult): boolean {
  return r.status === 410 || (r.status === 400 && (r.reason === "BadDeviceToken" || r.reason === "DeviceTokenNotForTopic"));
}

// ─── FCM ───────────────────────────────────────────────────────────────

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

export function fcmAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  try {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const a = JSON.parse(json) as ServiceAccount;
    return a.project_id && a.client_email && a.private_key ? a : null;
  } catch {
    return null;
  }
}

let fcmAccess: { token: string; exp: number } | null = null;
async function fcmAccessToken(a: ServiceAccount, now = Date.now()): Promise<string> {
  if (fcmAccess && fcmAccess.exp - 60_000 > now) return fcmAccess.token;
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: a.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }),
  );
  const sig = crypto.sign("sha256", Buffer.from(`${header}.${claims}`), pem(a.private_key));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${b64url(sig)}` }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token) throw new Error(`FCM-Anmeldung fehlgeschlagen (${res.status} ${body.error ?? ""})`.trim());
  fcmAccess = { token: body.access_token, exp: now + (body.expires_in ?? 3600) * 1000 };
  return fcmAccess.token;
}

/** Nur für Tests. */
export function __resetNativePushCache() {
  apnsJwt = null;
  fcmAccess = null;
}

export function fcmMessage(token: string, p: NativePayload) {
  return {
    message: {
      token,
      notification: { title: p.title, body: p.body },
      data: { ...(p.url ? { url: p.url } : {}), ...(p.badge != null ? { badge: String(p.badge) } : {}) },
      android: {
        priority: "HIGH",
        notification: {
          channel_id: "leads",
          ...(p.tag ? { tag: p.tag } : {}),
          ...(p.badge != null ? { notification_count: p.badge } : {}),
        },
      },
    },
  };
}

async function sendFcm(a: ServiceAccount, token: string, p: NativePayload): Promise<{ ok: boolean; dead: boolean; error?: string }> {
  const access = await fcmAccessToken(a);
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${a.project_id}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
    body: JSON.stringify(fcmMessage(token, p)),
  });
  if (res.ok) return { ok: true, dead: false };
  const body = (await res.json().catch(() => ({}))) as { error?: { status?: string; message?: string; details?: { errorCode?: string }[] } };
  const code = body.error?.details?.find((d) => d.errorCode)?.errorCode ?? body.error?.status;
  const dead = res.status === 404 || code === "UNREGISTERED" || (res.status === 400 && code === "INVALID_ARGUMENT" && /token/i.test(body.error?.message ?? ""));
  return { ok: false, dead, error: `FCM ${res.status} ${code ?? ""}`.trim() };
}

// ─── Versand an Geräte ─────────────────────────────────────────────────

/**
 * Zähler am App-Symbol: neue Leads (noch nicht kontaktiert, letzte 14 Tage) des
 * Kunden. Für Admins kein Zähler. Fehler → kein Zähler.
 */
export async function badgeForUser(userId: string): Promise<number | null> {
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, customerId: true, teamRole: true } });
    if (!u || u.role !== "BUYER" || !u.customerId) return null;
    const since = new Date(Date.now() - 14 * 86_400_000);
    return await prisma.lead.count({
      where: {
        customerId: u.customerId,
        createdAt: { gte: since },
        firstContactAt: null,
        status: null,
        ...(u.teamRole === "advisor" ? { assignedUserId: userId } : {}),
      },
    });
  } catch {
    return null;
  }
}

const touch = (id: string) => prisma.deviceToken.update({ where: { id }, data: { lastSeenAt: new Date() } }).then(() => undefined, () => undefined);

/** Schickt an alle App-Geräte dieser Logins. Ungültige Tokens werden gelöscht. */
export async function sendToDevices(userIds: string[], payload: Omit<NativePayload, "badge">): Promise<NativeOutcome> {
  const out: NativeOutcome = { sent: 0, removed: 0, errors: [] };
  const apns = apnsConfigured();
  const fcm = fcmAccount();
  if (!userIds.length || (!apns && !fcm)) return out;
  const devices = await prisma.deviceToken.findMany({ where: { userId: { in: userIds } } });
  if (!devices.length) return out;
  const badges = new Map<string, number | null>();
  for (const d of devices) {
    if (!badges.has(d.userId)) badges.set(d.userId, await badgeForUser(d.userId));
    const p: NativePayload = { ...payload, badge: badges.get(d.userId) ?? null };
    try {
      if (d.platform === "ios") {
        if (!apns) continue;
        const r = await apnsSender(d.token, apnsBody(p), p.tag);
        if (r.status === 200) {
          out.sent++;
          await touch(d.id);
        } else if (apnsTokenDead(r)) {
          await prisma.deviceToken.delete({ where: { id: d.id } }).catch(() => {});
          out.removed++;
        } else out.errors.push(`APNs ${r.status} ${r.reason ?? ""}`.trim());
      } else if (d.platform === "android") {
        if (!fcm) continue;
        const r = await sendFcm(fcm, d.token, p);
        if (r.ok) {
          out.sent++;
          await touch(d.id);
        } else if (r.dead) {
          await prisma.deviceToken.delete({ where: { id: d.id } }).catch(() => {});
          out.removed++;
        } else out.errors.push(r.error ?? "FCM-Fehler");
      }
    } catch (err) {
      out.errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return out;
}
