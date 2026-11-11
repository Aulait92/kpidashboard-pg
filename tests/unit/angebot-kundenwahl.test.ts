// Kunde wählt Laufzeit und Startdatum auf der Angebotsseite (11.11.2026) und
// Startwert der Angebotsnummer (weiter nach Papierkram).
import { afterEach, describe, expect, it } from "vitest";
import {
  addDaysIso,
  berlinTodayIso,
  isIsoDate,
  resolveOfferChoice,
  setupForChoice,
  startDateBounds,
  type OfferChoiceSnapshot,
} from "@/lib/offer-pricing";
import { nextNumberAfter, offerNumberStart } from "@/lib/offers";

const TODAY = "2026-11-11";
const snap = (extra: Partial<OfferChoiceSnapshot> = {}): OfferChoiceSnapshot => ({
  term: "12m",
  productCount: 1,
  setupFee: 990,
  startIso: "2026-12-01",
  annualPrepay: false,
  annualFreeMonths: null,
  choosesTerm: true,
  choosesStart: true,
  ...extra,
});

describe("Kundenwahl: Preise je Laufzeit", () => {
  it("Setup je Laufzeit aus der Preisliste, weitere Produkte kommen dazu", () => {
    expect(setupForChoice("12m", 1)).toBe(990);
    expect(setupForChoice("3m", 1)).toBe(1990);
    expect(setupForChoice("none", 1)).toBe(2490);
    expect(setupForChoice("3m", 2)).toBe(1990 + 990);
  });

  it("Wahl 3 Monate → Setup 1.990 €, Start übernommen", () => {
    const r = resolveOfferChoice(snap(), { term: "3m", startDate: "2026-12-15" }, TODAY);
    expect(r).toEqual({ ok: true, term: "3m", setupFee: 1990, startIso: "2026-12-15", annualPrepay: false, annualFreeMonths: null });
  });

  it("Ohne Wahl bleibt der Vorschlag (Setup neu aus der Liste)", () => {
    const r = resolveOfferChoice(snap(), {}, TODAY);
    expect(r).toMatchObject({ ok: true, term: "12m", setupFee: 990, startIso: "2026-12-01" });
  });

  it("Jahreszahlung nur, wenn im Angebot vereinbart und 12 Monate gewählt", () => {
    const base = snap({ annualPrepay: true, annualFreeMonths: 2 });
    expect(resolveOfferChoice(base, { term: "12m" }, TODAY)).toMatchObject({ ok: true, annualPrepay: true, annualFreeMonths: 2 });
    expect(resolveOfferChoice(base, { term: "3m" }, TODAY)).toMatchObject({ ok: true, annualPrepay: false, annualFreeMonths: null });
    expect(resolveOfferChoice(snap(), { term: "12m" }, TODAY)).toMatchObject({ ok: true, annualPrepay: false });
  });

  it("Unbekannte Laufzeit wird abgelehnt (manipulierte Eingabe)", () => {
    expect(resolveOfferChoice(snap(), { term: "24m" }, TODAY)).toMatchObject({ ok: false });
  });

  it("Sonderpreis: Laufzeit gesperrt, Setup bleibt, andere Laufzeit abgelehnt", () => {
    const locked = snap({ choosesTerm: false, setupFee: 500 });
    expect(resolveOfferChoice(locked, { term: "12m", startDate: "2026-12-10" }, TODAY)).toMatchObject({
      ok: true,
      term: "12m",
      setupFee: 500,
      startIso: "2026-12-10",
    });
    expect(resolveOfferChoice(locked, { term: "none" }, TODAY)).toMatchObject({ ok: false, error: expect.stringMatching(/fest vereinbart/) });
  });

  it("Ohne Freigabe: Startdatum fest, Abweichung abgelehnt", () => {
    const fixed = snap({ choosesTerm: false, choosesStart: false });
    expect(resolveOfferChoice(fixed, {}, TODAY)).toMatchObject({ ok: true, startIso: "2026-12-01" });
    expect(resolveOfferChoice(fixed, { startDate: "2026-12-20" }, TODAY)).toMatchObject({ ok: false });
  });
});

describe("Kundenwahl: Startdatum", () => {
  it("Bereich heute + 7 bis heute + 90 Tage, Vorschlag eingeschoben", () => {
    expect(startDateBounds(TODAY, "2026-12-01")).toEqual({ min: "2026-11-18", max: "2027-02-09", preset: "2026-12-01" });
    // Vorschlag liegt in der Vergangenheit → frühestmöglicher Tag
    expect(startDateBounds(TODAY, "2026-11-01").preset).toBe("2026-11-18");
    // Vorschlag zu spät → spätester Tag
    expect(startDateBounds(TODAY, "2027-06-01").preset).toBe("2027-02-09");
    // Ohne Vorgabe: 1. des Folgemonats
    expect(startDateBounds(TODAY, null).preset).toBe("2026-12-01");
  });

  it("Bewusst früherer Start vom Admin (ab heute) bleibt wählbar", () => {
    expect(startDateBounds(TODAY, "2026-11-14")).toMatchObject({ min: "2026-11-14", preset: "2026-11-14" });
    expect(resolveOfferChoice(snap({ startIso: "2026-11-14" }), { startDate: "2026-11-14" }, TODAY)).toMatchObject({ ok: true });
  });

  it("Grenzen: 6 Tage und 91 Tage abgelehnt, 7 und 90 Tage erlaubt", () => {
    expect(resolveOfferChoice(snap(), { startDate: addDaysIso(TODAY, 6) }, TODAY)).toMatchObject({ ok: false });
    expect(resolveOfferChoice(snap(), { startDate: addDaysIso(TODAY, 7) }, TODAY)).toMatchObject({ ok: true });
    expect(resolveOfferChoice(snap(), { startDate: addDaysIso(TODAY, 90) }, TODAY)).toMatchObject({ ok: true });
    expect(resolveOfferChoice(snap(), { startDate: addDaysIso(TODAY, 91) }, TODAY)).toMatchObject({ ok: false });
  });

  it("Ungültige Daten werden abgelehnt", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("1.12.2026")).toBe(false);
    expect(resolveOfferChoice(snap(), { startDate: "2026-13-01" }, TODAY)).toMatchObject({ ok: false });
  });

  it("Heute in Berlin: kurz nach Mitternacht schon der neue Tag", () => {
    expect(berlinTodayIso(new Date("2026-11-11T23:30:00Z"))).toBe("2026-11-12");
    expect(addDaysIso("2026-12-28", 7)).toBe("2027-01-04");
  });
});

describe("Angebotsnummer mit Startwert", () => {
  afterEach(() => {
    delete process.env.OFFER_NUMBER_START;
  });

  it("Startwert aus OFFER_NUMBER_START, ungültig → 1", () => {
    expect(offerNumberStart()).toBe(1);
    process.env.OFFER_NUMBER_START = "141";
    expect(offerNumberStart()).toBe(141);
    process.env.OFFER_NUMBER_START = "abc";
    expect(offerNumberStart()).toBe(1);
  });

  it("n = max(letzte + 1, Startwert)", () => {
    expect(nextNumberAfter(null, "PG-2026-", 141)).toBe("PG-2026-0141");
    expect(nextNumberAfter("PG-2026-0007", "PG-2026-", 141)).toBe("PG-2026-0141");
    expect(nextNumberAfter("PG-2026-0150", "PG-2026-", 141)).toBe("PG-2026-0151");
    expect(nextNumberAfter(null, "PG-2026-", 1)).toBe("PG-2026-0001");
  });
});
