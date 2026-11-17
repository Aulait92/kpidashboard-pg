import { describe, expect, it } from "vitest";
import { bookingSentence, type BookingPreview } from "@/lib/produkt-buchen-shared";

const basis = { overIndividual: false, bookingPricing: "individual", extraMonthly: 350, monthlyTo: 1800 } as unknown as BookingPreview;

describe("Produkt buchen: neuer Monatspreis Betreuung klar genannt", () => {
  it("individueller Preis bekannt: voraussichtlich bisher + Aufschlag", () => {
    const s = bookingSentence({ ...basis, manualReason: "individual_terms", feeFrom: 1100 } as BookingPreview);
    expect(s).toContain("1.450 € netto im Monat (bisher 1.100 €)");
    expect(s).not.toMatch(/[–—]/);
  });
  it("ohne bekannten Preis: Aufschlag nennen", () => {
    expect(bookingSentence({ ...basis, manualReason: "annual", feeFrom: null } as BookingPreview)).toContain("350 € netto im Monat dazu");
  });
});
