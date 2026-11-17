import { describe, expect, it } from "vitest";
import { eigeneBuchungsArt } from "@/lib/vertrieb/buchung";

describe("eigeneBuchungsArt (Calendly ablösen)", () => {
  it("erkennt unsere Buchungsseite auf der Webseite und in der App", () => {
    expect(eigeneBuchungsArt("https://performancegrowth.de/termin")).toBe("meta-leads-call");
    expect(eigeneBuchungsArt("https://performancegrowth.de/termin/")).toBe("meta-leads-call");
    expect(eigeneBuchungsArt("https://app.performancegrowth.de/termin/entscheidung")).toBe("entscheidung");
  });
  it("lässt fremde Links und Unterseiten in Ruhe", () => {
    expect(eigeneBuchungsArt("https://calendly.com/ole/15min")).toBeNull();
    expect(eigeneBuchungsArt("https://performancegrowth.de/termin/verwalten")).toBeNull();
    expect(eigeneBuchungsArt("https://example.com/termin")).toBeNull();
    expect(eigeneBuchungsArt("")).toBeNull();
    expect(eigeneBuchungsArt(null)).toBeNull();
  });
});
