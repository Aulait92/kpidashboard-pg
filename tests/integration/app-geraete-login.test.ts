import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { GERAETE_LOGIN_MAX, GERAETE_LOGIN_TTL_MS, beendeGeraeteLogin, gibGeraeteLogin, loeseGeraeteLoginEin } from "@/lib/app-geraete-login";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

// Face-ID-Anmeldung der App (lib/app-geraete-login.ts): Schlüssel nur gehasht, tauscht sich bei jeder Nutzung aus,
// gilt nur mit gleicher Sitzungsversion, lässt sich beenden.
describe("App: Face-ID-Anmeldung je Gerät", () => {
  let customerId = "";
  let userId = "";
  let otherUserId = "";
  beforeAll(async () => {
    requireTestDb();
    const c = await makeCustomer();
    customerId = c.id;
    userId = (await makeBuyer(c.id, "owner")).id;
    otherUserId = (await makeBuyer(c.id, "advisor")).id;
  });
  afterAll(async () => {
    await cleanupCustomer(customerId);
  });

  const sv = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id }, select: { sessionVersion: true } })).sessionVersion;

  it("speichert nur den Hash und tauscht den Schlüssel beim Einlösen aus", async () => {
    const g = await gibGeraeteLogin(userId, await sv(userId), "ios");
    const row = await prisma.appGeraeteLogin.findUniqueOrThrow({ where: { id: g.id } });
    expect(row.tokenHash).not.toBe(g.token);
    expect(row.platform).toBe("ios");

    const r = await loeseGeraeteLoginEin(g.token);
    expect(r?.user.id).toBe(userId);
    expect(r?.neu.token).toBeTruthy();
    expect(r?.neu.token).not.toBe(g.token);
    // Der alte Schlüssel gilt nicht mehr, der neue schon
    expect(await loeseGeraeteLoginEin(g.token)).toBeNull();
    const r2 = await loeseGeraeteLoginEin(r!.neu.token);
    expect(r2?.user.id).toBe(userId);
    expect((await prisma.appGeraeteLogin.findUniqueOrThrow({ where: { id: r2!.neu.id } })).platform).toBe("ios");
  });

  it("bei zwei gleichzeitigen Aufrufen gewinnt nur einer", async () => {
    const g = await gibGeraeteLogin(userId, await sv(userId), "ios");
    const [a, b] = await Promise.all([loeseGeraeteLoginEin(g.token), loeseGeraeteLoginEin(g.token)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
  });

  it("gilt nach „Überall abmelden“ (neue Sitzungsversion) nicht mehr", async () => {
    const g = await gibGeraeteLogin(userId, await sv(userId), "ios");
    await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    expect(await loeseGeraeteLoginEin(g.token)).toBeNull();
  });

  it("läuft ohne Nutzung ab", async () => {
    const start = new Date();
    const g = await gibGeraeteLogin(userId, await sv(userId), null, start);
    expect(await loeseGeraeteLoginEin(g.token, new Date(start.getTime() + GERAETE_LOGIN_TTL_MS + 1000))).toBeNull();
  });

  it("lässt sich beenden, aber nur vom eigenen Login", async () => {
    const g = await gibGeraeteLogin(userId, await sv(userId), "ios");
    expect(await beendeGeraeteLogin(otherUserId, g.id)).toBe(false);
    expect(await beendeGeraeteLogin(userId, g.id)).toBe(true);
    expect(await loeseGeraeteLoginEin(g.token)).toBeNull();
  });

  it("weist falsche Formen ohne Datenbankabfrage ab", async () => {
    expect(await loeseGeraeteLoginEin("")).toBeNull();
    expect(await loeseGeraeteLoginEin("kurz")).toBeNull();
    expect(await loeseGeraeteLoginEin("x".repeat(43) + "!")).toBeNull();
  });

  it("hält höchstens GERAETE_LOGIN_MAX Geräte aktiv", async () => {
    const s = await sv(otherUserId);
    const erste = await gibGeraeteLogin(otherUserId, s, "ios", new Date(Date.now() - 60_000));
    for (let i = 0; i < GERAETE_LOGIN_MAX; i++) await gibGeraeteLogin(otherUserId, s, "ios");
    const aktiv = await prisma.appGeraeteLogin.count({ where: { userId: otherUserId, revokedAt: null } });
    expect(aktiv).toBe(GERAETE_LOGIN_MAX);
    expect(await loeseGeraeteLoginEin(erste.token)).toBeNull();
  });

  it("wird mit dem Login gelöscht", async () => {
    const extra = await makeBuyer(customerId, "advisor");
    const g = await gibGeraeteLogin(extra.id, 0, "ios");
    await prisma.user.delete({ where: { id: extra.id } });
    expect(await prisma.appGeraeteLogin.findUnique({ where: { id: g.id } })).toBeNull();
  });
});
