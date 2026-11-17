// Rückruf mit Uhrzeit im Kalender des Beraters (Ole, 17.11.2026): Eintrag anlegen, beim neuen Rückruf ersetzen,
// beim Erledigen löschen; ohne verbundenen Kalender nichts.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const angelegt: Array<{ key: string; summary: string; start: Date; end: Date; attendees: string[]; desc: string }> = [];
const geloescht: Array<{ key: string; id: string }> = [];
vi.mock("@/lib/calendar", async (orig) => {
  const real = await orig<typeof import("@/lib/calendar")>();
  return {
    ...real,
    adapterFor: async (key: string) => ({
      getBusy: async () => [],
      createEvent: async (ev: { summary: string; start: Date; end: Date; attendeeEmails: string[]; description: string }) => {
        angelegt.push({ key, summary: ev.summary, start: ev.start, end: ev.end, attendees: ev.attendeeEmails, desc: ev.description });
        return { eventId: `ev-${angelegt.length}`, videoUrl: null };
      },
      deleteEvent: async (id: string) => void geloescht.push({ key, id }),
    }),
  };
});

import { prisma } from "@/lib/prisma";
import { rueckrufAusKalender, rueckrufInKalender } from "@/lib/calendar/rueckruf";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

describe("Rückruf im Kalender", () => {
  let customerId = "";
  let leadId = "";
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({})).id;
    await prisma.calendarConnection.create({ data: { customerId, provider: "google", status: "connected" } });
    leadId = (await prisma.lead.create({ data: { customerId, name: "Nina Winter", phone: "+4915112345678", source: "Hausrat", status: "Im Gespräch" } })).id;
  });
  beforeEach(() => {
    angelegt.length = 0;
    geloescht.length = 0;
  });
  afterAll(async () => cleanupCustomer(customerId));

  it("trägt 15 Minuten ohne Einladung in den Kalender des Kontos ein", async () => {
    const at = new Date(Date.now() + 2 * 60 * 60 * 1000);
    expect(await rueckrufInKalender(leadId, at, { appUrl: "https://app.example.de" })).toBe("eingetragen");
    expect(angelegt).toHaveLength(1);
    expect(angelegt[0]).toMatchObject({ key: customerId, summary: "Rückruf: Nina Winter", attendees: [] });
    expect(angelegt[0].end.getTime() - angelegt[0].start.getTime()).toBe(15 * 60 * 1000);
    expect(angelegt[0].desc).toContain("/buyer/kontakte/");
    expect(await prisma.lead.findUnique({ where: { id: leadId }, select: { rueckrufEventId: true, rueckrufEventKey: true } })).toEqual({ rueckrufEventId: "ev-1", rueckrufEventKey: customerId });
  });

  it("neuer Rückruf ersetzt den alten, erledigt löscht ihn", async () => {
    await rueckrufInKalender(leadId, new Date(Date.now() + 3 * 60 * 60 * 1000));
    expect(geloescht).toEqual([{ key: customerId, id: "ev-1" }]);
    await rueckrufAusKalender(leadId);
    expect(geloescht).toHaveLength(2);
    expect((await prisma.lead.findUnique({ where: { id: leadId }, select: { rueckrufEventId: true } }))?.rueckrufEventId).toBeNull();
  });

  it("ohne verbundenen Kalender kein Eintrag", async () => {
    await prisma.calendarConnection.update({ where: { customerId }, data: { status: "disconnected" } });
    expect(await rueckrufInKalender(leadId, new Date(Date.now() + 60 * 60 * 1000))).toBe("kein_kalender");
    expect(angelegt).toHaveLength(0);
  });
});
