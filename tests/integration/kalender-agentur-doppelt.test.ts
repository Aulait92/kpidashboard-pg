import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { bookingKeys } from "@/lib/calendar";
import { userCalendarKey } from "@/lib/calendar/tokens";
import { encryptSecret } from "@/lib/encryption";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

// Fall CL Capital Living (26.11.2026): Lisas Google-Kalender ist zugleich Agentur-Kalender.
// Dann zählt nur Lisas Kalender mit ihren Zeiten, nicht zusätzlich die Standard-Zeiten der Agentur.
describe("Agentur-Kalender = Kalender einer Beraterin", () => {
  let customerId = "";
  let advisorId = "";

  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
    await makeBuyer(customerId, "owner", false);
    advisorId = (await makeBuyer(customerId, "advisor")).id;
    const kal = { provider: "google", accountEmail: "lisa@example.test", calendarId: "primary", accessTokenEnc: "a", refreshTokenEnc: "r", status: "connected" };
    await prisma.advisorCalendar.create({ data: { userId: advisorId, customerId, ...kal } });
    await prisma.calendarConnection.create({ data: { customerId, bookingSlug: `slug-${customerId}`, ...kal } });
  });

  afterAll(async () => {
    await cleanupCustomer(customerId);
  });

  it("gleicher Kalender: nur der Berater-Kalender", async () => {
    expect(await bookingKeys(customerId)).toEqual([userCalendarKey(advisorId)]);
  });

  it("ohne Konto-Adresse, gleiche kopierte Zugangsdaten: nur der Berater-Kalender", async () => {
    await prisma.advisorCalendar.update({ where: { userId: advisorId }, data: { accountEmail: null } });
    await prisma.calendarConnection.update({ where: { customerId }, data: { accountEmail: null } });
    expect(await bookingKeys(customerId)).toEqual([userCalendarKey(advisorId)]);
  });

  it("gleicher Token, unterschiedlich verschlüsselt: nur der Berater-Kalender", async () => {
    await prisma.advisorCalendar.update({ where: { userId: advisorId }, data: { refreshTokenEnc: encryptSecret("tok-lisa") } });
    await prisma.calendarConnection.update({ where: { customerId }, data: { refreshTokenEnc: encryptSecret("tok-lisa") } });
    expect(await bookingKeys(customerId)).toEqual([userCalendarKey(advisorId)]);
  });

  it("anderer Kalender: beide", async () => {
    await prisma.calendarConnection.update({ where: { customerId }, data: { accountEmail: "agentur@example.test", refreshTokenEnc: "r2" } });
    const keys = await bookingKeys(customerId);
    expect(keys).toContain(customerId);
    expect(keys).toContain(userCalendarKey(advisorId));
  });
});
