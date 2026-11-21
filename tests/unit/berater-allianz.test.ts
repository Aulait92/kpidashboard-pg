// Berater-App-Kalender mit Allianz-Person (21.11.2026): reine Helfer.
import { describe, expect, it } from "vitest";
import { allianzFuerBerater } from "@/lib/calendar/berater-allianz";
import { appBusyFilter } from "@/lib/calendar/app-kalender";
import type { AllianzCalendar } from "@/lib/calendar/allianz-online";

const cal: AllianzCalendar = {
  vtnr: "101511203",
  pageUrl: null,
  orgId: "org",
  orgName: "Agentur",
  templateId: "tpl",
  templateName: "Online-Beratung",
  durationMin: 60,
  leadTimeMin: 0,
  followupMin: 0,
  bookingDayEarliest: 2,
  templates: [],
  resources: [
    { id: "res-a", name: "Anna Berater" },
    { id: "res-b", name: "Bernd Berater" },
  ],
  resourceId: null,
};

describe("allianzFuerBerater", () => {
  it("schränkt den Agentur-Kalender auf die Person ein, ohne ihn zu ändern", () => {
    const a = allianzFuerBerater(cal, "res-a");
    expect(a).toMatchObject({ orgId: "org", templateId: "tpl", resourceId: "res-a" });
    expect(cal.resourceId).toBeNull();
  });
  it("ohne Person oder mit unbekannter Person: null (nie still „alle frei“)", () => {
    expect(allianzFuerBerater(cal, null)).toBeNull();
    expect(allianzFuerBerater(cal, "")).toBeNull();
    expect(allianzFuerBerater(cal, "res-x")).toBeNull();
  });
});

describe("appBusyFilter", () => {
  it("Agentur: nur Termine im Agentur-Kalender, nicht die der Berater", () => {
    expect(appBusyFilter("kunde1")).toEqual({ customerId: "kunde1", calendarKey: null });
  });
  it("Berater: eigene Termine und Agentur-Termine seiner Leads", () => {
    expect(appBusyFilter("user:u1")).toEqual({ OR: [{ calendarKey: "user:u1" }, { calendarKey: null, lead: { assignedUserId: "u1" } }] });
  });
});
