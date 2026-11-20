// App-Kalender (Ole, 20.11.2026): Einladung per Mail statt Google/Outlook
import { describe, expect, it } from "vitest";
import { einladungIcs, organizerEmail } from "@/lib/calendar/app-kalender";

describe("App-Kalender: Einladung", () => {
  const base = {
    uid: "abc@terminbuchung",
    sequence: 0,
    start: new Date("2026-11-23T09:00:00Z"),
    end: new Date("2026-11-23T09:30:00Z"),
    summary: "Beratung, Frau Schneider",
    description: "Telefon: +49 170 1234567",
    location: "https://allianz.webex.com/meet/lohmann",
    organizer: "termin@dein-beratungstermin.de",
    attendees: ["henrik.lohmann@allianz.de"],
  };
  it("Einladung mit Organisator, Teilnehmer und Zeit (Outlook: Annehmen)", () => {
    const ics = einladungIcs({ ...base, method: "REQUEST" }).replace(/\r\n /g, "");
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("UID:abc@terminbuchung");
    expect(ics).toContain("DTSTART:20261123T090000Z");
    expect(ics).toContain("ORGANIZER;CN=Terminbuchung:mailto:termin@dein-beratungstermin.de");
    expect(ics).toContain("mailto:henrik.lohmann@allianz.de");
    expect(ics).toContain("SUMMARY:Beratung\\, Frau Schneider");
    const roh = einladungIcs({ ...base, method: "REQUEST" });
    expect(roh.split("\r\n").every((l) => Buffer.byteLength(l, "utf8") <= 76)).toBe(true);
  });
  it("Absage derselben UID", () => {
    const ics = einladungIcs({ ...base, method: "CANCEL", sequence: 5 });
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SEQUENCE:5");
    expect(ics).not.toContain("VALARM");
  });
  it("Organisator aus der Absenderadresse", () => {
    expect(organizerEmail({ BOOKING_EMAIL_FROM: "Henrik Lohmann <termin@dein-beratungstermin.de>" })).toBe("termin@dein-beratungstermin.de");
    expect(organizerEmail({})).toBe("termin@performancegrowth.de");
  });
});
