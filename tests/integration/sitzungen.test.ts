import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Cookie-Speicher statt echter Anfrage (next/headers gibt es nur im Request).
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (arg: string | { name: string }) => void jar.delete(typeof arg === "string" ? arg : arg.name),
  }),
  headers: async () => new Headers(),
}));

import { prisma } from "@/lib/prisma";
import {
  clearSessionVersionCache,
  completeTotpLogin,
  consumePasswordResetToken,
  getCurrentSession,
  hashPassword,
  invalidateUserSessions,
  issuePasswordResetToken,
  login,
  SESSION_COOKIE,
} from "@/lib/auth";
import { confirmTotpSetup, startTotpSetup } from "@/lib/totp-account";
import { decryptSecret } from "@/lib/encryption";
import { totpCode } from "@/lib/totp";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

// Sitzungen: Passwortänderung/2FA/„Überall abmelden“ beenden alte Sitzungen;
// Zwei-Faktor-Login auch für Kunden-Logins (Buyer).
describe("Sitzungen und Zwei-Faktor für Kunden-Logins", () => {
  let customerId = "";
  let userId = "";
  const email = `sitzung-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const pw = "altes-Passwort-123";

  beforeAll(async () => {
    requireTestDb();
    process.env.AUTH_SECRET ??= "integration-test-secret-integration-test";
    process.env.ENCRYPTION_KEY ??= crypto.randomBytes(32).toString("base64");
    customerId = (await makeCustomer()).id;
    userId = (await prisma.user.create({ data: { email, passwordHash: await hashPassword(pw), role: "BUYER", customerId } })).id;
  });
  beforeEach(() => {
    jar.clear();
    clearSessionVersionCache();
  });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorEmail: email }, { entityId: userId }] } });
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await cleanupCustomer(customerId);
  });

  it("Passwort-Reset macht eine bestehende Sitzung ungültig", async () => {
    const r = await login(email, pw);
    expect(r.ok).toBe(true);
    const oldCookie = jar.get(SESSION_COOKIE)!;
    expect((await getCurrentSession())?.userId).toBe(userId);

    const issued = await issuePasswordResetToken(email);
    expect((await consumePasswordResetToken(issued!.rawToken, "neues-Passwort-456")).ok).toBe(true);

    // Das alte Cookie (z. B. auf einem verlorenen Handy) gilt nicht mehr
    jar.set(SESSION_COOKIE, oldCookie);
    expect(await getCurrentSession()).toBeNull();
    // Neu anmelden geht mit dem neuen Passwort
    expect((await login(email, "neues-Passwort-456")).ok).toBe(true);
    expect((await getCurrentSession())?.userId).toBe(userId);
  });

  it("„Überall abmelden“ beendet andere Sitzungen, dieses Gerät bleibt angemeldet", async () => {
    expect((await login(email, "neues-Passwort-456")).ok).toBe(true);
    const otherDevice = jar.get(SESSION_COOKIE)!;
    await invalidateUserSessions(userId, { keepCurrent: true });
    expect((await getCurrentSession())?.userId).toBe(userId); // neues Cookie
    jar.set(SESSION_COOKIE, otherDevice);
    expect(await getCurrentSession()).toBeNull();
  });

  it("gelöschter Login ist sofort abgemeldet", async () => {
    const tmp = await prisma.user.create({ data: { email: `weg-${email}`, passwordHash: await hashPassword(pw), role: "BUYER", customerId } });
    expect((await login(tmp.email, pw)).ok).toBe(true);
    expect((await getCurrentSession())?.userId).toBe(tmp.id);
    await prisma.user.delete({ where: { id: tmp.id } });
    clearSessionVersionCache();
    expect(await getCurrentSession()).toBeNull();
    await prisma.auditLog.deleteMany({ where: { actorEmail: tmp.email } });
  });

  it("Kunden-Login mit Zwei-Faktor: einrichten, dann Anmeldung nur mit Code", async () => {
    expect((await login(email, "neues-Passwort-456")).ok).toBe(true);
    const beforeSetup = jar.get(SESSION_COOKIE)!;

    await startTotpSetup(userId);
    const secret = decryptSecret((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).totpSecretEnc!);
    expect(await confirmTotpSetup(userId, "000000")).toMatchObject({ error: expect.any(String) });
    const ok = await confirmTotpSetup(userId, totpCode(secret, Date.now()));
    expect(ok.backupCodes?.length).toBeGreaterThan(0);
    // Dieses Gerät bleibt angemeldet, andere Sitzungen sind beendet
    expect((await getCurrentSession())?.userId).toBe(userId);
    jar.set(SESSION_COOKIE, beforeSetup);
    expect(await getCurrentSession()).toBeNull();

    // Anmeldung: Passwort allein reicht nicht mehr
    jar.clear();
    const step1 = await login(email, "neues-Passwort-456");
    expect(step1).toMatchObject({ ok: false, needsTotp: true });
    expect(jar.has(SESSION_COOKIE)).toBe(false);
    expect(await completeTotpLogin("123456")).toMatchObject({ ok: false, needsTotp: true });
    const step2 = await completeTotpLogin(totpCode(secret, Date.now()));
    expect(step2.ok).toBe(true);
    expect((await getCurrentSession())?.role).toBe("BUYER");

    // Notfall-Code funktioniert genau einmal
    jar.clear();
    await login(email, "neues-Passwort-456");
    expect((await completeTotpLogin(ok.backupCodes![0])).ok).toBe(true);
    jar.clear();
    await login(email, "neues-Passwort-456");
    expect((await completeTotpLogin(ok.backupCodes![0])).ok).toBe(false);

    // Gerät merken: 30 Tage ohne Code, bis Sitzungsversion oder 2FA sich ändern
    jar.clear();
    await login(email, "neues-Passwort-456");
    expect((await completeTotpLogin(ok.backupCodes![1], true)).ok).toBe(true);
    const trust = [...jar.keys()].find((k) => k.startsWith("kpi_trust_"))!;
    expect(trust).toBeTruthy();
    const trustValue = jar.get(trust)!;
    jar.clear();
    jar.set(trust, trustValue);
    expect((await login(email, "neues-Passwort-456")).ok).toBe(true);
    expect((await login(email, "falsches-Passwort")).ok).toBe(false); // Passwort bleibt nötig
    await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    clearSessionVersionCache();
    jar.clear();
    jar.set(trust, trustValue);
    expect(await login(email, "neues-Passwort-456")).toMatchObject({ ok: false, needsTotp: true });
  });
});
