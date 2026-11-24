// iPhone-App (Ole, 24.11.2026, lib/app-store-server.ts): App-Anmeldung je Login, Hinweiskarte auf „Heute“ je Gerät,
// wegklicken, verschwindet nach der App-Anmeldung, Einrichtungsschritt erledigt, Kennzahlen.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { appKennzahlen, appSchrittErledigt, appHinweisWegklicken, ladeAppHinweis, merkeGeraet } from "@/lib/app-store-server";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const UA = {
  app: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 performancegrowthApp/1.0",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36",
  desktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
};

describe("iPhone-App: Anmeldung, Hinweiskarte, Einrichtungsschritt", () => {
  const kunden: string[] = [];
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    for (const id of kunden) await cleanupCustomer(id);
  });
  const neu = async () => {
    const c = await makeCustomer();
    kunden.push(c.id);
    const u = await makeBuyer(c.id, "owner");
    return { customerId: c.id, userId: u.id };
  };

  it("Karte je Gerät: iPhone mit Knopf, Android mit Hinweis, Computer nur nach einem iPhone, in der App nie", async () => {
    const { userId } = await neu();
    expect(await ladeAppHinweis(userId, UA.app)).toBeNull();
    expect(await ladeAppHinweis(userId, UA.iphone)).toBe("iphone");
    expect(await ladeAppHinweis(userId, UA.android)).toBe("android");
    // Noch nie mit einem iPhone da: am Computer keine Karte (der QR-Code hilft nicht)
    expect(await ladeAppHinweis(userId, UA.desktop)).toBeNull();
    await merkeGeraet(userId, UA.iphone);
    expect((await prisma.user.findUnique({ where: { id: userId } }))?.iphoneSeenAt).toBeInstanceOf(Date);
    expect(await ladeAppHinweis(userId, UA.desktop)).toBe("desktop");
  });

  it("wegklicken gilt dauerhaft für diesen Login, auf allen Geräten", async () => {
    const { userId } = await neu();
    await merkeGeraet(userId, UA.iphone);
    await appHinweisWegklicken(userId);
    for (const ua of [UA.iphone, UA.android, UA.desktop]) expect(await ladeAppHinweis(userId, ua)).toBeNull();
  });

  it("nach der ersten Anmeldung in der App ist die Karte weg und der Schritt erledigt", async () => {
    const { customerId, userId } = await neu();
    expect(await appSchrittErledigt(customerId)).toBe(false);
    // Browser auf dem Computer zählt nicht als App
    await merkeGeraet(userId, UA.desktop);
    expect((await prisma.user.findUnique({ where: { id: userId } }))?.appLoginAt).toBeNull();
    await merkeGeraet(userId, UA.app);
    const u = await prisma.user.findUnique({ where: { id: userId } });
    expect(u?.appLoginAt).toBeInstanceOf(Date);
    expect(u?.iphoneSeenAt).toBeInstanceOf(Date);
    expect(await ladeAppHinweis(userId, UA.iphone)).toBeNull();
    expect(await ladeAppHinweis(userId, UA.desktop)).toBeNull();
    expect(await appSchrittErledigt(customerId)).toBe(true);
    // Erste Anmeldung bleibt stehen
    await merkeGeraet(userId, UA.app);
    expect((await prisma.user.findUnique({ where: { id: userId } }))?.appLoginAt?.getTime()).toBe(u?.appLoginAt?.getTime());
  });

  it("App-Gerät für Mitteilungen zählt als App-Anmeldung", async () => {
    const { customerId, userId } = await neu();
    await prisma.deviceToken.create({ data: { userId, platform: "ios", token: `tok_${userId}_0123456789abcdef` } });
    expect(await ladeAppHinweis(userId, UA.iphone)).toBeNull();
    expect(await appSchrittErledigt(customerId)).toBe(true);
  });

  it("„Ich habe kein iPhone“ (Schritt übersprungen) erledigt den Schritt", async () => {
    const { customerId } = await neu();
    await prisma.onboarding.create({ data: { customerId } });
    expect(await appSchrittErledigt(customerId)).toBe(false);
    await prisma.onboarding.update({ where: { customerId }, data: { appSkippedAt: new Date() } });
    expect(await appSchrittErledigt(customerId)).toBe(true);
  });

  it("Kennzahlen: Anteil mit App-Anmeldung und mit Push-Erlaubnis", async () => {
    const c = await makeCustomer();
    kunden.push(c.id);
    const a = await makeBuyer(c.id, "owner");
    const b = await makeBuyer(c.id, "advisor");
    const d = await makeBuyer(c.id, "advisor");
    await merkeGeraet(a.id, UA.app);
    await prisma.deviceToken.create({ data: { userId: a.id, platform: "ios", token: `tok_${a.id}_0123456789abcdef` } });
    await prisma.pushSubscription.create({ data: { endpoint: `https://push.test/${b.id}`, p256dh: "x", auth: "x", userId: b.id } });
    void d;
    const k = await appKennzahlen([c.id]);
    expect(k).toEqual({ logins: 3, mitApp: 1, mitPush: 2, mitAppPush: 1, quoteApp: 33, quotePush: 67 });
  });
});
