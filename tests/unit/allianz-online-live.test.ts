import { describe, expect, it, vi } from "vitest";

// Echter Lese-Test gegen eine öffentliche Vertreter-Seite (nur von Hand):
//   ALLIANZ_LIVE=vertretung.allianz.de/<name> npx vitest run tests/unit/allianz-online-live.test.ts
// Gibt nur Anzahl und Zeitraum der freien Slots aus, keine Zugangsdaten.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { busyFromSlots, fetchFreeSlots, resolveAllianzCalendar } from "@/lib/calendar/allianz-online";
import { DEFAULT_LEAD_TIMES, leadTimeWindows } from "@/lib/calendar/lead-times";
import { addDaysYmd, berlinMidnight, berlinYmd } from "@/lib/absence";

const target = process.env.ALLIANZ_LIVE;

describe.skipIf(!target)("Allianz-Online-Kalender live (nur lesen)", () => {
  it("löst die Seite auf und liest freie Slots der nächsten 6 Wochen", async () => {
    const cal = await resolveAllianzCalendar(target!);
    const now = new Date();
    const slots = (await fetchFreeSlots(cal, now, new Date(now.getTime() + 42 * 24 * 60 * 60 * 1000))).sort();
    console.log(
      `[live] Termin-Art „${cal.templateName}“ (${cal.durationMin} Min., frühester Buchungstag +${cal.bookingDayEarliest}) · ` +
        `${slots.length} freie Slots · ${slots[0] ?? "-"} bis ${slots.at(-1) ?? "-"}`,
    );
    // Wie viele Standard-Lead-Zeiten (Mo–Fr 10/14/16, 30 Min.) wären in 14 Tagen frei?
    const knownFrom = berlinMidnight(addDaysYmd(berlinYmd(now), cal.bookingDayEarliest));
    const max = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const busy = busyFromSlots({ ...cal, slots, min: now, max, knownFrom, fallbackFree: leadTimeWindows(DEFAULT_LEAD_TIMES, now, knownFrom, 60) });
    const leadSlots = leadTimeWindows(DEFAULT_LEAD_TIMES, knownFrom, max, 30);
    const free = leadSlots.filter((w) => !busy.some((b) => b.start < w.end && b.end > w.start));
    console.log(`[live] Lead-Zeiten ab frühestem Buchungstag (14 Tage): ${free.length} von ${leadSlots.length} frei`);
    expect(cal.templates.length).toBeGreaterThan(0);
  }, 60_000);
});
