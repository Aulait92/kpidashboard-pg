import { describe, expect, it } from "vitest";
import { berlinMonth, describeCounts, monthRange, priceCounts } from "@/lib/whatsapp/fees";

describe("WhatsApp-Gebühren", () => {
  it("rechnet je Kategorie mit Metas Tarif", () => {
    const u = priceCounts({ marketing: 10, utility: 5, referral_conversion: 1 });
    expect(u.counts).toEqual({ marketing: 11, utility: 5, authentication: 0, service: 0 });
    expect(u.amount).toBe(Math.round((11 * 0.1131 + 5 * 0.0456) * 100) / 100);
    expect(describeCounts(u.counts)).toBe("11 × Marketing, 5 × Service-Vorlage");
  });

  it("Monatsgrenzen in Berliner Zeit", () => {
    const { from, to } = monthRange("2026-11");
    expect(from.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(monthRange("2026-07").from.toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(berlinMonth(new Date("2026-11-30T23:30:00Z"))).toBe("2026-12");
    expect(berlinMonth(new Date("2027-01-01T10:00:00Z"), -1)).toBe("2026-12");
  });
});
