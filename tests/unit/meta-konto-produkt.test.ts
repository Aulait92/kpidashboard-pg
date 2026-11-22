// Produkt-Rückfall über den Kontonamen (Ole, 22.11.2026)
import { describe, expect, it } from "vitest";
import { produktMitKonto } from "@/lib/meta";
import { classifyCampaignProduct } from "@/lib/products";

describe("produktMitKonto", () => {
  it("Kampagnenname ohne Produkt im Konto PKV-Tarifoptimierung zählt wie die PKV-Kampagnen (Wechsel)", () => {
    expect(classifyCampaignProduct("PKV HvK Geo Frankfurt + Freiburg (Nov 2026)")).toBeNull();
    expect(produktMitKonto(classifyCampaignProduct, "PKV HvK Geo Frankfurt + Freiburg (Nov 2026)", "PKV-Tarifoptimierung")).toBe("Wechsel");
  });
  it("Kampagnenname hat Vorrang; gemischtes Konto ohne Produkt bleibt ohne", () => {
    expect(produktMitKonto(classifyCampaignProduct, "Kinderwunsch Leads", "PKV-Tarifoptimierung")).toBe("Kinderwunsch");
    expect(produktMitKonto(classifyCampaignProduct, "Agency Ads Ole/Mirko", "Performance Growth Leads")).toBeNull();
    expect(produktMitKonto(classifyCampaignProduct, "Agency Ads", null)).toBeNull();
  });
});
