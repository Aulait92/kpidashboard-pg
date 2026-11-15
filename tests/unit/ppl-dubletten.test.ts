import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { DUPLICATE_ACROSS_PRODUCTS, DUPLICATE_DAYS, duplicateWhere } from "@/lib/ppl/engine";

describe("Pay-per-Lead-Dubletten", () => {
  const now = new Date("2026-11-15T10:00:00Z");
  it("prüft standardmäßig über alle Produkte (wie der alte Zap)", () => {
    expect(DUPLICATE_ACROSS_PRODUCTS).toBe(true);
    const w = duplicateWhere({ productKey: "PKV", phone: "4915112345678", email: "a@b.de" }, now);
    expect(w).toEqual({
      createdAt: { gte: new Date(now.getTime() - DUPLICATE_DAYS * 86_400_000) },
      status: { in: ["delivered", "parked"] },
      OR: [{ phone: "4915112345678" }, { email: "a@b.de" }],
    });
    expect(w && "productKey" in w).toBe(false);
  });
  it("nur im selben Produkt, wenn abgeschaltet; ohne Kontakt keine Suche", () => {
    expect(duplicateWhere({ productKey: "PKV", phone: null, email: "a@b.de" }, now, false)).toMatchObject({ productKey: "PKV", OR: [{ email: "a@b.de" }] });
    expect(duplicateWhere({ productKey: "PKV", phone: null, email: null }, now)).toBeNull();
  });
});
