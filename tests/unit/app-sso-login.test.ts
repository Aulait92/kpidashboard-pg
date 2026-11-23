import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Google/Microsoft-Anmeldung in der App: Einmal-Code (lib/app-handoff.ts), Callback-Zweig
// (api/auth/[provider]/callback) und Einlösen in der App (api/app/login-handoff).

type Row = { id: string; tokenHash: string; userId: string; next: string; purpose: string; expiresAt: Date; usedAt: Date | null };
const db = vi.hoisted(() => ({ rows: [] as Row[], users: new Map<string, Record<string, unknown>>() }));

vi.mock("@/lib/prisma", () => {
  const matches = (r: Row, w: Record<string, unknown>) =>
    (w.tokenHash === undefined || r.tokenHash === w.tokenHash) &&
    (!("usedAt" in w) || r.usedAt === w.usedAt) &&
    (!w.expiresAt || r.expiresAt > (w.expiresAt as { gt: Date }).gt) &&
    (!w.purpose || (w.purpose as { in: string[] }).in.includes(r.purpose));
  return {
    prisma: {
      appHandoff: {
        create: vi.fn(async ({ data }: { data: Omit<Row, "id" | "usedAt"> }) => {
          const row = { id: `h${db.rows.length + 1}`, usedAt: null, ...data };
          db.rows.push(row);
          return row;
        }),
        deleteMany: vi.fn(async () => ({ count: 0 })),
        updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: { usedAt: Date } }) => {
          const hits = db.rows.filter((r) => matches(r, where));
          for (const r of hits) r.usedAt = data.usedAt;
          return { count: hits.length };
        }),
        findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => db.rows.find((r) => r.tokenHash === where.tokenHash) ?? null),
      },
      user: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.users.get(where.id) ?? null) },
    },
  };
});

const m = vi.hoisted(() => ({
  takeSsoState: vi.fn(),
  findSsoUser: vi.fn(),
  loginWithVerifiedEmail: vi.fn(),
  completeSsoLogin: vi.fn(),
  exchangeCode: vi.fn(),
  loginTargetFor: vi.fn(async (p: { role: string }) => (p.role === "ADMIN" ? "/admin/neu" : "/buyer")),
}));
class Redirect extends Error {
  constructor(public url: string) {
    super(`redirect ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));
vi.mock("@/lib/auth", () => ({ takeSsoState: m.takeSsoState, findSsoUser: m.findSsoUser, loginWithVerifiedEmail: m.loginWithVerifiedEmail, completeSsoLogin: m.completeSsoLogin }));
vi.mock("@/lib/sso", () => ({ exchangeCode: m.exchangeCode, providerErrorCode: (s: string) => s }));
vi.mock("@/lib/calendar/oauth-routes", () => ({ publicOrigin: () => "https://app.example.de" }));
vi.mock("@/lib/login-ziel-server", () => ({ loginTargetFor: m.loginTargetFor }));
vi.mock("@/lib/monitoring", () => ({ reportError: vi.fn() }));

const { HANDOFF_TTL_MS, appLoginRedirect, createAppLoginCode, createHandoff, redeemAppLoginCode, redeemHandoff } = await import("@/lib/app-handoff");
const { appLoginTarget } = await import("@/lib/native-bridge");
const callback = (await import("@/app/api/auth/[provider]/callback/route")).GET;
const loginHandoff = (await import("@/app/api/app/login-handoff/route")).GET;

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

async function redirectOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof Redirect) return e.url;
    throw e;
  }
  throw new Error("keine Weiterleitung");
}

const cb = (provider: string, query = "code=abc&state=s1") => callback(new Request(`https://app.example.de/api/auth/${provider}/callback?${query}`), { params: Promise.resolve({ provider }) });
const state = (extra: Record<string, unknown> = {}) => ({ provider: "google", state: "s1", nonce: "n", verifier: "v", next: "", ...extra });

beforeEach(() => {
  db.rows = [];
  db.users.clear();
  for (const f of Object.values(m)) f.mockClear();
  m.exchangeCode.mockResolvedValue("chef@makler.de");
  m.findSsoUser.mockResolvedValue({ ok: true, user: { id: "u1" } });
  m.loginWithVerifiedEmail.mockResolvedValue({ ok: true, payload: { userId: "u1", role: "BUYER" } });
});

describe("App-Login-Code (lib/app-handoff.ts)", () => {
  it("gehasht gespeichert, an den Login gebunden, einmalig einlösbar", async () => {
    const now = new Date("2026-11-23T10:00:00Z");
    const code = await createAppLoginCode("u1", "microsoft", "/buyer/leads", now);
    expect(code).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].tokenHash).toBe(sha(code));
    expect(JSON.stringify(db.rows)).not.toContain(code);
    expect(db.rows[0].expiresAt.getTime() - now.getTime()).toBe(HANDOFF_TTL_MS);
    expect(HANDOFF_TTL_MS).toBeLessThanOrEqual(5 * 60_000);

    expect(await redeemAppLoginCode(code, now)).toEqual({ userId: "u1", method: "microsoft", next: "/buyer/leads" });
    expect(await redeemAppLoginCode(code, now)).toBeNull();
  });

  it("nach 5 Minuten abgelaufen", async () => {
    const now = new Date("2026-11-23T10:00:00Z");
    const code = await createAppLoginCode("u1", "google", "", now);
    expect(await redeemAppLoginCode(code, new Date(now.getTime() + HANDOFF_TTL_MS + 1))).toBeNull();
  });

  it("ohne Ziel bleibt das Ziel leer (Startseite nach Rolle), fremde Ziele werden verworfen", async () => {
    const a = await createAppLoginCode("u1", "google", "");
    expect((await redeemAppLoginCode(a))?.next).toBe("");
    const b = await createAppLoginCode("u1", "google", "//evil.example");
    expect((await redeemAppLoginCode(b))?.next).toBe("");
  });

  it("Zwecke getrennt: Browser-Link ist kein App-Code und umgekehrt", async () => {
    const browser = await createHandoff("u1", "/buyer");
    const app = await createAppLoginCode("u1", "google", "");
    expect(await redeemAppLoginCode(browser)).toBeNull();
    expect(await redeemHandoff(app)).toBeNull();
    expect(await redeemHandoff(browser)).toEqual({ userId: "u1", next: "/buyer" });
    expect((await redeemAppLoginCode(app))?.userId).toBe("u1");
  });

  it("unsinnige Codes werden gar nicht nachgeschlagen", async () => {
    expect(await redeemAppLoginCode("")).toBeNull();
    expect(await redeemAppLoginCode("x".repeat(500))).toBeNull();
    expect(await redeemAppLoginCode("abc def ghi jkl mno pqr")).toBeNull();
  });

  it("Rücksprung-Adresse in die App", () => {
    expect(appLoginRedirect({ code: "abc_DEF-123" })).toBe("performancegrowth://login?code=abc_DEF-123");
    expect(appLoginRedirect({ fehler: "kein-konto" })).toBe("performancegrowth://login?fehler=kein-konto");
  });
});

describe("App: performancegrowth://login abfangen (native-bridge)", () => {
  it("Code → Einlösen in der App, Fehler → Login-Seite, Fremdes ignorieren", () => {
    const code = "A".repeat(32);
    expect(appLoginTarget(`performancegrowth://login?code=${code}`)).toBe(`/api/app/login-handoff?code=${code}`);
    expect(appLoginTarget("performancegrowth://login?code=<script>")).toBe("/login?fehler=abgelaufen");
    expect(appLoginTarget("performancegrowth://login?fehler=kein-konto")).toBe("/login?fehler=kein-konto");
    expect(appLoginTarget("performancegrowth://login?fehler=%3Cb%3E")).toBe("/login?fehler=fehlgeschlagen");
    expect(appLoginTarget("performancegrowth://anderes?code=x")).toBeNull();
    expect(appLoginTarget("https://evil.example/login?code=x")).toBeNull();
    expect(appLoginTarget("kein url")).toBeNull();
  });
});

describe("Callback: Zweig für die App", () => {
  it("mit App-Kennzeichen im signierten Status: keine Sitzung im Browser, Einmal-Code in die App", async () => {
    m.takeSsoState.mockResolvedValue(state({ app: true, next: "/buyer/termine" }));
    const url = await redirectOf(cb("google"));
    expect(url).toMatch(/^performancegrowth:\/\/login\?code=[A-Za-z0-9_-]{32}$/);
    expect(m.loginWithVerifiedEmail).not.toHaveBeenCalled();
    expect(m.findSsoUser).toHaveBeenCalledWith("chef@makler.de", "google");
    const code = new URL(url).searchParams.get("code")!;
    expect(db.rows[0]).toMatchObject({ tokenHash: sha(code), userId: "u1", purpose: "app-sso:google", next: "/buyer/termine" });
  });

  it("App, aber kein Login zur E-Mail: Fehler zurück in die App, kein Code", async () => {
    m.takeSsoState.mockResolvedValue(state({ app: true }));
    m.findSsoUser.mockResolvedValue({ ok: false, error: "x" });
    expect(await redirectOf(cb("google"))).toBe("performancegrowth://login?fehler=kein-konto");
    expect(db.rows).toHaveLength(0);
  });

  it("App, Abbruch beim Anbieter: zurück in die App", async () => {
    m.takeSsoState.mockResolvedValue(state({ app: true }));
    expect(await redirectOf(cb("google", "error=access_denied&state=s1"))).toBe("performancegrowth://login?fehler=abgebrochen");
  });

  it("ohne signierten Status (z. B. ?app=1 von außen): nie in die App umleiten", async () => {
    m.takeSsoState.mockResolvedValue(null);
    expect(await redirectOf(cb("google", "code=abc&state=s1&app=1"))).toBe("/login?fehler=abgelaufen");
    expect(db.rows).toHaveLength(0);
  });

  it("App-Status für anderen Anbieter: kein Rücksprung in die App", async () => {
    m.takeSsoState.mockResolvedValue(state({ app: true, provider: "microsoft" }));
    expect(await redirectOf(cb("google"))).toBe("/login?fehler=abgelaufen");
  });

  it("App-Status mit falschem state-Parameter: Fehler in die App, kein Code", async () => {
    m.takeSsoState.mockResolvedValue(state({ app: true }));
    expect(await redirectOf(cb("google", "code=abc&state=falsch"))).toBe("performancegrowth://login?fehler=abgelaufen");
    expect(db.rows).toHaveLength(0);
  });

  it("ohne App-Kennzeichen: normale Anmeldung im Browser wie bisher", async () => {
    m.takeSsoState.mockResolvedValue(state());
    expect(await redirectOf(cb("google"))).toBe("/buyer");
    expect(m.loginWithVerifiedEmail).toHaveBeenCalledWith("chef@makler.de", "google");
    expect(m.findSsoUser).not.toHaveBeenCalled();
    expect(db.rows).toHaveLength(0);
  });
});

describe("Einlösen in der App (api/app/login-handoff)", () => {
  const user = { id: "u1", email: "chef@makler.de", role: "BUYER", customerId: "c1", sessionVersion: 0, totpEnabledAt: null, totpSecretEnc: null };
  const go = (code: string, ip = "10.0.0.1") => loginHandoff(new Request(`https://app.example.de/api/app/login-handoff?code=${encodeURIComponent(code)}`, { headers: { "x-real-ip": ip } }));

  it("gültiger Code: Sitzung wie beim normalen Login, weiter zur Startseite; zweites Mal abgelaufen", async () => {
    db.users.set("u1", user);
    m.completeSsoLogin.mockResolvedValue({ ok: true, payload: { userId: "u1", role: "BUYER" } });
    const code = await createAppLoginCode("u1", "microsoft", "");
    expect(await redirectOf(go(code))).toBe("/buyer");
    expect(m.completeSsoLogin).toHaveBeenCalledWith(user, "microsoft");
    expect(await redirectOf(go(code))).toBe("/login?fehler=abgelaufen");
    expect(m.completeSsoLogin).toHaveBeenCalledTimes(1);
  });

  it("Admin landet auf der Admin-Startseite", async () => {
    db.users.set("a1", { ...user, id: "a1", role: "ADMIN", customerId: null });
    m.completeSsoLogin.mockResolvedValue({ ok: true, payload: { userId: "a1", role: "ADMIN" } });
    const code = await createAppLoginCode("a1", "google", "");
    expect(await redirectOf(go(code, "10.0.0.2"))).toBe("/admin/neu");
  });

  it("2FA aktiv und Gerät nicht vertraut: Code-Schritt in der App", async () => {
    db.users.set("u1", user);
    m.completeSsoLogin.mockResolvedValue({ ok: false, needsTotp: true });
    const code = await createAppLoginCode("u1", "google", "/buyer/leads");
    expect(await redirectOf(go(code, "10.0.0.3"))).toBe("/login?schritt=code&next=%2Fbuyer%2Fleads");
  });

  it("Browser-Link oder falscher Code: keine Anmeldung", async () => {
    db.users.set("u1", user);
    const browser = await createHandoff("u1", "/buyer");
    expect(await redirectOf(go(browser, "10.0.0.4"))).toBe("/login?fehler=abgelaufen");
    expect(await redirectOf(go("A".repeat(32), "10.0.0.4"))).toBe("/login?fehler=abgelaufen");
    expect(m.completeSsoLogin).not.toHaveBeenCalled();
  });

  it("Drosselung je IP", async () => {
    db.users.set("u1", user);
    m.completeSsoLogin.mockResolvedValue({ ok: true, payload: { userId: "u1", role: "BUYER" } });
    for (let i = 0; i < 20; i++) await redirectOf(go("B".repeat(32), "10.0.0.9"));
    // Auch ein gültiger Code wird dann abgewiesen (und nicht verbraucht)
    const code = await createAppLoginCode("u1", "google", "");
    expect(await redirectOf(go(code, "10.0.0.9"))).toBe("/login?fehler=abgelaufen");
    expect(m.completeSsoLogin).not.toHaveBeenCalled();
    expect(await redirectOf(go(code, "10.0.0.10"))).toBe("/buyer");
  });
});
