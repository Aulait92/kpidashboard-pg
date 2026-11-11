import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Datenbank nachgebildet: zwei Geräte (iOS + Android) eines Käufers.
const db = vi.hoisted(() => ({
  devices: [] as Array<{ id: string; userId: string; platform: string; token: string }>,
  deleted: [] as string[],
  touched: [] as string[],
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    deviceToken: {
      findMany: vi.fn(async () => db.devices),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        db.deleted.push(where.id);
        return {};
      }),
      update: vi.fn(async ({ where }: { where: { id: string } }) => {
        db.touched.push(where.id);
        return {};
      }),
    },
    user: { findUnique: vi.fn(async () => ({ role: "BUYER", customerId: "c1", teamRole: "owner" })) },
    lead: { count: vi.fn(async () => 3) },
  },
}));

import {
  __resetNativePushCache,
  __setApnsSender,
  apnsBody,
  apnsConfigured,
  apnsToken,
  apnsTokenDead,
  fcmAccount,
  fcmMessage,
  sendToDevices,
} from "@/lib/native-push";

const ec = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const ecPem = ec.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const rsaPem = rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const ENV_KEYS = ["APNS_KEY_ID", "APNS_TEAM_ID", "APNS_PRIVATE_KEY", "APNS_BUNDLE_ID", "APNS_PRODUCTION", "FIREBASE_SERVICE_ACCOUNT"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  __resetNativePushCache();
  __setApnsSender(null);
  db.devices = [];
  db.deleted = [];
  db.touched = [];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

function setApns() {
  process.env.APNS_KEY_ID = "KEY1234567";
  process.env.APNS_TEAM_ID = "TEAM123456";
  // wie in Railway: Zeilenumbrüche als \n
  process.env.APNS_PRIVATE_KEY = ecPem.replace(/\n/g, "\\n");
}
function setFcm(base64 = false) {
  const json = JSON.stringify({ project_id: "pg-test", client_email: "push@pg-test.iam.gserviceaccount.com", private_key: rsaPem });
  process.env.FIREBASE_SERVICE_ACCOUNT = base64 ? Buffer.from(json).toString("base64") : json;
}

describe("APNs", () => {
  it("ist ohne Schlüssel nicht konfiguriert", () => {
    expect(apnsConfigured()).toBe(false);
    setApns();
    expect(apnsConfigured()).toBe(true);
  });

  it("signiert ein gültiges ES256-JWT und nutzt es wieder", () => {
    setApns();
    const now = Date.UTC(2026, 10, 11, 10);
    const t = apnsToken(now);
    const [h, c, s] = t.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(JSON.parse(Buffer.from(c, "base64url").toString())).toEqual({ iss: "TEAM123456", iat: Math.floor(now / 1000) });
    const sig = Buffer.from(s, "base64url");
    expect(sig.length).toBe(64); // ieee-p1363 (r||s), nicht DER
    expect(crypto.verify("sha256", Buffer.from(`${h}.${c}`), { key: ec.publicKey, dsaEncoding: "ieee-p1363" }, sig)).toBe(true);
    expect(apnsToken(now + 49 * 60_000)).toBe(t);
    expect(apnsToken(now + 51 * 60_000)).not.toBe(t);
  });

  it("baut den Inhalt mit Zähler, Gruppe und Ziel-URL", () => {
    expect(apnsBody({ title: "Neuer Lead", body: "Max", url: "/buyer/leads/1", tag: "lead-1", badge: 4 })).toEqual({
      aps: { alert: { title: "Neuer Lead", body: "Max" }, sound: "default", badge: 4, "thread-id": "lead-1" },
      url: "/buyer/leads/1",
    });
    expect(apnsBody({ title: "a", body: "b", badge: null })).toEqual({ aps: { alert: { title: "a", body: "b" }, sound: "default" } });
  });

  it("erkennt tote Tokens", () => {
    expect(apnsTokenDead({ status: 410, reason: "Unregistered" })).toBe(true);
    expect(apnsTokenDead({ status: 400, reason: "BadDeviceToken" })).toBe(true);
    expect(apnsTokenDead({ status: 400, reason: "DeviceTokenNotForTopic" })).toBe(true);
    expect(apnsTokenDead({ status: 400, reason: "PayloadTooLarge" })).toBe(false);
    expect(apnsTokenDead({ status: 429, reason: "TooManyRequests" })).toBe(false);
  });
});

describe("FCM", () => {
  it("liest das Dienstkonto als JSON oder Base64", () => {
    expect(fcmAccount()).toBeNull();
    setFcm();
    expect(fcmAccount()?.project_id).toBe("pg-test");
    setFcm(true);
    expect(fcmAccount()?.client_email).toContain("pg-test");
    process.env.FIREBASE_SERVICE_ACCOUNT = "kaputt";
    expect(fcmAccount()).toBeNull();
  });

  it("baut die Nachricht für den Kanal „leads“ mit Zähler", () => {
    const m = fcmMessage("tok", { title: "T", body: "B", url: "/buyer", tag: "x", badge: 2 }).message;
    expect(m.token).toBe("tok");
    expect(m.data).toEqual({ url: "/buyer", badge: "2" });
    expect(m.android.notification).toEqual({ channel_id: "leads", tag: "x", notification_count: 2 });
  });
});

describe("sendToDevices", () => {
  const dev = (id: string, platform: string) => ({ id, userId: "u1", platform, token: `${platform}-token-${id}-xxxxxxxxxxxx` });

  it("überspringt still ohne Schlüssel (keine DB-Abfrage)", async () => {
    db.devices = [dev("1", "ios")];
    const out = await sendToDevices(["u1"], { title: "a", body: "b" });
    expect(out).toEqual({ sent: 0, removed: 0, errors: [] });
  });

  it("schickt an iOS, setzt den Zähler und löscht tote Tokens", async () => {
    setApns();
    db.devices = [dev("ok", "ios"), dev("tot", "ios"), dev("andr", "android")];
    const seen: Array<{ token: string; body: unknown; collapse?: string }> = [];
    __setApnsSender(async (token, body, collapse) => {
      seen.push({ token, body, collapse });
      return token.includes("tot") ? { status: 410, reason: "Unregistered" } : { status: 200 };
    });
    const out = await sendToDevices(["u1"], { title: "Neuer Lead", body: "Max", url: "/buyer", tag: "lead-9" });
    expect(out).toEqual({ sent: 1, removed: 1, errors: [] }); // Android ohne FCM-Schlüssel übersprungen
    expect(seen).toHaveLength(2);
    expect((seen[0].body as { aps: { badge: number } }).aps.badge).toBe(3);
    expect(seen[0].collapse).toBe("lead-9");
    expect(db.deleted).toEqual(["tot"]);
    expect(db.touched).toEqual(["ok"]);
  });

  it("meldet andere APNs-Fehler, ohne zu löschen", async () => {
    setApns();
    db.devices = [dev("1", "ios")];
    __setApnsSender(async () => ({ status: 403, reason: "InvalidProviderToken" }));
    const out = await sendToDevices(["u1"], { title: "a", body: "b" });
    expect(out.errors).toEqual(["APNs 403 InvalidProviderToken"]);
    expect(db.deleted).toEqual([]);
  });

  it("schickt über FCM (Anmeldung einmal) und löscht abgemeldete Tokens", async () => {
    setFcm();
    db.devices = [dev("a", "android"), dev("b", "android"), dev("i", "ios")];
    const calls: Array<{ url: string; body: string; auth?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: unknown; headers: Record<string, string> }) => {
        calls.push({ url, body: String(init.body), auth: init.headers.authorization });
        if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }), { status: 200 });
        if (String(init.body).includes("-token-b-"))
          return new Response(JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }), { status: 404 });
        return new Response(JSON.stringify({ name: "projects/pg-test/messages/1" }), { status: 200 });
      }),
    );
    const out = await sendToDevices(["u1"], { title: "T", body: "B", url: "/buyer/leads" });
    expect(out).toEqual({ sent: 1, removed: 1, errors: [] }); // iOS ohne APNs-Schlüssel übersprungen
    const oauth = calls.filter((c) => c.url.includes("oauth2"));
    expect(oauth).toHaveLength(1);
    const assertion = new URLSearchParams(oauth[0].body).get("assertion")!;
    const [h, c, s] = assertion.split(".");
    expect(crypto.verify("sha256", Buffer.from(`${h}.${c}`), rsa.publicKey, Buffer.from(s, "base64url"))).toBe(true);
    expect(JSON.parse(Buffer.from(c, "base64url").toString()).scope).toContain("firebase.messaging");
    const sends = calls.filter((x) => x.url.includes("fcm.googleapis.com/v1/projects/pg-test/messages:send"));
    expect(sends).toHaveLength(2);
    expect(sends[0].auth).toBe("Bearer ya29.test");
    expect(JSON.parse(sends[0].body).message.android.notification.notification_count).toBe(3);
    expect(db.deleted).toEqual(["b"]);
    expect(db.touched).toEqual(["a"]);
  });
});
