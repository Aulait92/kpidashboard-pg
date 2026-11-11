import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { adoptOwnCalendar, loadTeamCalendars, remindAdvisorCalendar } from "@/lib/calendar/team";
import { bookingKeys } from "@/lib/calendar";
import { userCalendarKey } from "@/lib/calendar/tokens";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

// „Mein Kalender“: ein Kalender je Person (Inhaber = Kalender des Kundenkontos).
describe("Kalender je Person, Team-Übersicht, Erinnerung", () => {
  let customerId = "";
  let ownerId = "";
  let advisorId = "";
  let advisor2Id = "";

  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
    ownerId = (await makeBuyer(customerId, "owner")).id;
    advisorId = (await makeBuyer(customerId, "advisor")).id;
    advisor2Id = (await makeBuyer(customerId, "advisor", false)).id;
    // Altes Modell: Inhaber hat einen „eigenen Kalender“, das Kundenkonto keinen.
    await prisma.advisorCalendar.create({
      data: { userId: ownerId, customerId, provider: "google", accountEmail: "inhaber@example.test", calendarId: "primary", accessTokenEnc: "enc-a", refreshTokenEnc: "enc-r", scope: "calendar.events", status: "connected" },
    });
    await prisma.calendarConnection.create({ data: { customerId, status: "pending", bookingSlug: `slug-${customerId}` } });
    await prisma.advisorCalendar.create({ data: { userId: advisorId, customerId, provider: "microsoft", status: "connected", accessTokenEnc: "x" } });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { customerId } });
    await cleanupCustomer(customerId);
  });

  it("Team-Übersicht: Inhaber über eigenen Alt-Kalender verbunden, Berater je eigener Kalender", async () => {
    const t = await loadTeamCalendars(customerId);
    expect(t.rows).toHaveLength(3);
    const byId = new Map(t.rows.map((r) => [r.userId, r]));
    expect(byId.get(ownerId)).toMatchObject({ owner: true, connected: true, provider: "google" });
    expect(byId.get(advisorId)).toMatchObject({ owner: false, connected: true, provider: "microsoft" });
    expect(byId.get(advisor2Id)).toMatchObject({ owner: false, connected: false, receivesLeads: false });
    expect(t.anyConnected).toBe(true);
  });

  it("übernimmt den Alt-Kalender des Inhabers als Kalender des Kundenkontos (Buchungslink bleibt)", async () => {
    expect(await adoptOwnCalendar(customerId, ownerId)).toEqual({ ok: true });
    const main = await prisma.calendarConnection.findUniqueOrThrow({ where: { customerId } });
    expect(main).toMatchObject({ status: "connected", provider: "google", accountEmail: "inhaber@example.test", accessTokenEnc: "enc-a", refreshTokenEnc: "enc-r", bookingSlug: `slug-${customerId}` });
    expect(await prisma.advisorCalendar.findUnique({ where: { userId: ownerId } })).toBeNull();
    // zweites Mal: schon verbunden
    expect(await adoptOwnCalendar(customerId, ownerId)).toMatchObject({ ok: false });
    // Buchung: Berater mit eigenem Kalender + Kalender des Inhabers (Kundenkonto)
    const keys = await bookingKeys(customerId);
    expect(keys).toContain(customerId);
    expect(keys).toContain(userCalendarKey(advisorId));
    expect(keys).not.toContain(userCalendarKey(ownerId));
  });

  it("Erinnerung: nur Berater ohne Kalender, höchstens einmal pro Tag", async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const actor = { id: ownerId, email: "inhaber@example.test" };
    const now = new Date("2031-01-10T09:00:00Z");
    expect(await remindAdvisorCalendar({ customerId, targetUserId: advisorId, actor, now, send })).toMatchObject({ ok: false }); // schon verbunden
    expect(await remindAdvisorCalendar({ customerId, targetUserId: ownerId, actor, now, send })).toMatchObject({ ok: false }); // kein Berater
    expect(await remindAdvisorCalendar({ customerId, targetUserId: advisor2Id, actor, now, send })).toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].text).toContain("/buyer/kalender");
    // gleiche Stunde: gedrosselt
    expect(await remindAdvisorCalendar({ customerId, targetUserId: advisor2Id, actor, now: new Date("2031-01-10T15:00:00Z"), send })).toMatchObject({ ok: false });
    // nächster Tag: wieder möglich
    expect(await remindAdvisorCalendar({ customerId, targetUserId: advisor2Id, actor, now: new Date("2031-01-11T10:00:00Z"), send })).toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(2);
    // anderer Kunde: nicht gefunden
    expect(await remindAdvisorCalendar({ customerId: "fremd", targetUserId: advisor2Id, actor, now, send })).toMatchObject({ ok: false });
  });

  it("keine Verbindung im Team: anyConnected false", async () => {
    await prisma.calendarConnection.update({ where: { customerId }, data: { status: "pending" } });
    await prisma.advisorCalendar.deleteMany({ where: { customerId } });
    expect((await loadTeamCalendars(customerId)).anyConnected).toBe(false);
  });
});
