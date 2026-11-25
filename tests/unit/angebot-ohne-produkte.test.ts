// Usability-Check 25.11.2026: Angebot ohne Produkte zeigte „Werbebudget etwa 0 €“. Ohne Produkte bzw. Budget keine Zeile.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/angebot/[token]/actions", () => ({ acceptOfferAction: async () => ({}) }));

import { hatWerbebudget, OfferDocument, type OfferDoc } from "@/components/offer-document";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

const doc = (o: Partial<OfferDoc> = {}): OfferDoc => ({
  number: "PG-2026-0700",
  version: 1,
  status: "sent",
  contactName: "Olga Ohne",
  company: "Agentur Ohne",
  street: null,
  zip: null,
  city: null,
  package: "software",
  vermittlerTyp: "vertreter",
  term: "12m",
  products: [],
  setupFee: 990,
  monthlyFee: 1000,
  softwareFee: 349,
  introMonthlyFee: null,
  introMonths: null,
  specialTerms: null,
  startDate: new Date("2027-01-01T12:00:00Z"),
  validUntil: new Date("2026-12-02T12:00:00Z"),
  createdAt: new Date("2026-11-18T16:00:00Z"),
  acceptedAt: null,
  acceptedName: null,
  termsUrl: null,
  dpaUrl: null,
  seats: 1,
  seatsIncluded: 3,
  seatMonthly: 49,
  bestandMonthly: null,
  annualPrepay: false,
  annualFreeMonths: 3,
  annualChoice: false,
  ...o,
});

describe("Angebot ohne Produkte", () => {
  it("hatWerbebudget", () => {
    expect(hatWerbebudget([], 0)).toBe(false);
    expect(hatWerbebudget([{ dailyBudget: 0 }], 0)).toBe(false);
    expect(hatWerbebudget([{ dailyBudget: 30 }], 900)).toBe(true);
  });

  it("keine Zeile „Werbebudget etwa 0 €“, keine leere Produktzeile", () => {
    const t = text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc() })));
    expect(t).not.toMatch(/0 € im Monat/);
    expect(t).not.toMatch(/≈ 0 €/);
    expect(t).not.toMatch(/Zusammen etwa/);
  });

  it("mit Produkt bleibt die Zeile", () => {
    const t = text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc({ products: [{ name: "TKV-Katze", dailyBudget: 30 }] }) })));
    expect(t).toMatch(/Werbebudget 30 € pro Tag, etwa 900 € im Monat/);
  });

  it("Produkte wählt der Kunde: nur der Hinweis", () => {
    const t = text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc({ customerChoosesProducts: true }) })));
    expect(t).toMatch(/Produkte Produkte und Tagesbudget wählen Sie unten bei der Annahme\./);
    expect(t).not.toMatch(/≈ 0 €/);
  });
});
