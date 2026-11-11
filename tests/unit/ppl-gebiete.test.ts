import { describe, expect, it } from "vitest";
import { effectivePlzRanges, openAreasFor, pickWithAreas, type AreaCandidate } from "@/lib/ppl/rules";

describe("Pay-per-Lead: Gebiete mit Vorrang", () => {
  const area = (id: string, plzRanges: string, quantity: number, delivered: number) => ({ id, plzRanges, quantity, delivered });

  it("findet offene Gebiete zur PLZ, volle Gebiete fallen raus", () => {
    const areas = [area("hh", "20000-22999", 10, 10), area("ki", "24000-24999|20095", 5, 1)];
    expect(openAreasFor(areas, "20095").map((a) => a.id)).toEqual(["ki"]);
    expect(openAreasFor(areas, "80331")).toEqual([]);
  });

  it("PLZ-Filter: eigener Filter vor Gebieten, sonst Gebiete zusammen", () => {
    expect(effectivePlzRanges("80000-85999", [area("a", "20000-22999", 1, 0)])).toBe("80000-85999");
    expect(effectivePlzRanges(null, [area("a", "20000-22999", 1, 0), area("b", "24000", 1, 0)])).toBe("20000-22999|24000");
    expect(effectivePlzRanges(null, [])).toBeNull();
  });

  it("Gebietskunde hat Vorrang vor Kunden ohne Gebiet, bis seine Gebietsmenge voll ist", () => {
    const heinrich: AreaCandidate = { id: "heinrich", quota: 20, delivered: 9, area: area("hh", "20000-22999", 10, 9) };
    const andere: AreaCandidate = { id: "andere", quota: 100, delivered: 0, area: null };
    expect(pickWithAreas([andere, heinrich])?.id).toBe("heinrich");
    // Gebiet voll → kein Gebiet mehr offen (openAreasFor liefert null) → normale Verteilung
    const voll: AreaCandidate = { ...heinrich, delivered: 10, area: null };
    expect(pickWithAreas([andere, voll])?.id).toBe("andere");
  });

  it("ohne offenes Kontingent beim Bezug kein Vorrang", () => {
    const zu: AreaCandidate = { id: "h", quota: 5, delivered: 5, area: area("hh", "20000", 10, 0) };
    const andere: AreaCandidate = { id: "a", quota: 3, delivered: 0, area: null };
    expect(pickWithAreas([zu, andere])?.id).toBe("a");
  });
});
