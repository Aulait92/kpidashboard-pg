// Kalenderschritt im Onboarding (Ole, 21.11.2026): ohne Google/Microsoft gehört ein Video-Link (z. B. Webex) dazu.
import { describe, expect, it } from "vitest";
import { kalenderSchrittFertig } from "@/lib/onboarding";

const agent = (o: Partial<{ availabilityIcsUrlEnc: string | null; allianzCalendarEnc: string | null; videoRoomUrl: string | null }> = {}) => ({
  availabilityIcsUrlEnc: null,
  allianzCalendarEnc: null,
  videoRoomUrl: null,
  ...o,
});

describe("kalenderSchrittFertig", () => {
  it("Google bzw. Microsoft: fertig auch ohne Video-Link (Meet/Teams)", () => {
    expect(kalenderSchrittFertig({ calendarConnection: { status: "connected", provider: "google" }, agentConfig: agent() })).toBe(true);
    expect(kalenderSchrittFertig({ calendarConnection: { status: "connected", provider: "microsoft" }, agentConfig: null })).toBe(true);
  });

  it("App-Kalender, ICS oder Allianz-Kalender: erst mit Video-Link fertig", () => {
    expect(kalenderSchrittFertig({ calendarConnection: { status: "connected", provider: "app" }, agentConfig: agent() })).toBe(false);
    expect(kalenderSchrittFertig({ calendarConnection: { status: "connected", provider: "app" }, agentConfig: agent({ videoRoomUrl: "https://allianz.webex.com/meet/max.muster" }) })).toBe(true);
    expect(kalenderSchrittFertig({ calendarConnection: null, agentConfig: agent({ allianzCalendarEnc: "x" }) })).toBe(false);
    expect(kalenderSchrittFertig({ calendarConnection: null, agentConfig: agent({ availabilityIcsUrlEnc: "x", videoRoomUrl: " https://x.webex.com/meet/a " }) })).toBe(true);
  });

  it("ohne Zeitenquelle nie fertig, auch mit Video-Link", () => {
    expect(kalenderSchrittFertig({ calendarConnection: { status: "error", provider: "google" }, agentConfig: agent({ videoRoomUrl: "https://x" }) })).toBe(false);
  });
});
