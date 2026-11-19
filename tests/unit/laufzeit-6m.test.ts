// Laufzeit 6 Monate (Ole, 18.11.2026): Setup 1.490 €, Mindestlaufzeit 6 Monate, Vorauszahlung 6 Monate im Voraus mit
// 1 Monat geschenkt (5 Monatsbeträge). Eine Logik für 6 und 12 Monate (12: jährlich, 3 geschenkt seit 19.11.2026). Geprüft: Preise,
// Beträge und Ersparnis, Kundenwahl, Stripe-Rhythmus (Monat × 6), Abrechnungstag, Kündigung, Erinnerung, Altdaten.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/angebot/[token]/actions", () => ({ acceptOfferAction: async () => ({}) }));

import { AcceptForm, type OfferChoiceProps } from "@/app/angebot/[token]/accept-form";
import { OfferDocument, type OfferDoc } from "@/components/offer-document";
import {
  computeOfferPrice,
  normalizeTerm,
  offerAddOns,
  PRICE_LIST,
  prepayPossible,
  resolveOfferChoice,
  rhythmusAusStripe,
  rhythmusFaktor,
  rhythmusFuer,
  rhythmusMonatsAnteil,
  setupForChoice,
  setupForTerm,
  stripeRecurring,
  TERM_6M_AB,
  TERM_MONTHS,
  TERM_OPTIONS,
  termOptionsFor,
  vorauszahlungBetraege,
  jahreswahlBetraege,
  type OfferChoiceSnapshot,
} from "@/lib/offer-pricing";
import { abrechnungsplan, abrechnungstagSaetze, anteilCent } from "@/lib/abrechnungstag";
import { cancelDate, cancelDateText, contractSummaryLines, vorauszahlungFaellig, type ContractSummaryInput } from "@/lib/vertrag-laufzeit";
import { erinnerungAbsaetze, erinnerungFaellig, laufenderZeitraum, VORAUSZAHLUNG_ERINNERUNG_TAGE } from "@/lib/vorauszahlung-erinnerung";
import { bestandTerms } from "@/lib/bestand/terms";
import { bookingTerms } from "@/lib/empfehlung/shared";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { paketDaten } from "@/lib/vertrieb/verkaufspraesentation";

const katze = [{ name: "TKV-Katze", dailyBudget: 30 }]; // 900 € Budget → 990 € im Monat (bis 18.11.2026: 1.000 €)

describe("Preise und Setup 6 Monate", () => {
  it("Setup 1.490 € netto, Mindestlaufzeit 6 Monate, Laufzeit wird erkannt", () => {
    expect(PRICE_LIST.setup6m).toBe(1490);
    expect(setupForTerm("6m")).toBe(1490);
    expect(TERM_MONTHS["6m"]).toBe(6);
    expect(normalizeTerm("6m")).toBe("6m");
    expect(TERM_OPTIONS).toEqual(["12m", "6m", "3m", "none"]);
    const p = computeOfferPrice({ term: "6m", products: katze });
    expect(p).toMatchObject({ listSetup: 1490, setupFee: 1490, monthlyTotal: 990, annual: false, annualTotal: null, prepayMonths: 0 });
    // weitere Produkte: keine Einrichtung, Empfehlungsrabatt gilt auch für 6 Monate
    expect(setupForChoice("6m", 2)).toBe(1490);
    expect(setupForChoice("6m", 1, 300)).toBe(1190);
  });

  it("andere Laufzeiten unverändert", () => {
    expect([setupForTerm("12m"), setupForTerm("3m"), setupForTerm("none")]).toEqual([990, 1990, 2490]);
  });
});

describe("Vorauszahlung: eine Logik für 6 und 12 Monate", () => {
  it("6 Monate: 5 Monatsbeträge für 6 Monate, 1 Monat geschenkt, Ersparnis 1 × Monatspreis", () => {
    expect(vorauszahlungBetraege(1098, "6m")).toEqual({ total: 5490, savings: 1098, freeMonths: 1, months: 6, paidMonths: 5 });
    // Neue Listenpreise (18.11.2026): 990 € + 2 × 49 € = 1.088 € → 5 × 1.088 € = 5.440 €, 1.088 € geschenkt
    const p = computeOfferPrice({ term: "6m", products: katze, seats: 5, annual: true });
    expect(p).toMatchObject({ monthlyTotal: 1088, annual: true, annualTotal: 5440, annualSavings: 1088, prepayMonths: 6, prepayFreeMonths: 1 });
  });

  it("12 Monate: 9 Monatsbeträge, 3 Monate geschenkt, Ersparnis 3 × Monatspreis (Ole, 19.11.2026)", () => {
    expect(vorauszahlungBetraege(1098, "12m")).toEqual({ total: 9882, savings: 3294, freeMonths: 3, months: 12, paidMonths: 9 });
    expect(jahreswahlBetraege(1098)).toEqual({ annualTotal: 9882, savings: 3294, freeMonths: 3 });
    // Neue Listenpreise: 9 × 1.088 € = 9.792 €, 3 × 1.088 € = 3.264 € geschenkt
    const p = computeOfferPrice({ term: "12m", products: katze, seats: 5, annual: true });
    expect(p).toMatchObject({ monthlyTotal: 1088, annualTotal: 9792, annualSavings: 3264, prepayMonths: 12, prepayFreeMonths: 3 });
    // Gespeicherter Altwert (angenommen vor dem 19.11.2026) gilt weiter: 10 Monatsbeträge
    expect(vorauszahlungBetraege(1098, "12m", 2)).toEqual({ total: 10980, savings: 2196, freeMonths: 2, months: 12, paidMonths: 10 });
  });

  it("nur mit 6 oder 12 Monaten", () => {
    expect(prepayPossible("3m")).toBe(false);
    expect(prepayPossible("none")).toBe(false);
    expect(computeOfferPrice({ term: "3m", products: katze, annual: true })).toMatchObject({ annual: false, annualTotal: null });
  });

  it("gespeicherte Angebote: Zeitraum aus der Laufzeit; Altdaten ohne Laufzeit = jährlich", () => {
    const base = { monthlyFee: 1000, seats: 5, seatsIncluded: 3, seatMonthly: 49, bestandMonthly: null, annualPrepay: true };
    expect(offerAddOns({ ...base, annualFreeMonths: 1, term: "6m" })).toMatchObject({ annualTotal: 5490, annualSavings: 1098, freeMonths: 1, prepayMonths: 6 });
    expect(offerAddOns({ ...base, annualFreeMonths: 2, term: "12m" })).toMatchObject({ annualTotal: 10980, annualSavings: 2196, prepayMonths: 12 });
    // Altdaten: kein term übergeben, annualFreeMonths 2 → wie bisher 10 ×
    expect(offerAddOns({ ...base, annualFreeMonths: 2 })).toMatchObject({ annualTotal: 10980, annualSavings: 2196, freeMonths: 2 });
    // Ohne gespeicherten Wert: heutiger Standard (3 geschenkt, 9 ×)
    expect(offerAddOns({ ...base, annualFreeMonths: null })).toMatchObject({ annualTotal: 9882, freeMonths: 3 });
  });

  it("Zahlrhythmus: Stripe halbjährlich = Monat × 6, Faktor und Monatsanteil", () => {
    expect(rhythmusFuer("6m", true)).toBe("halfyear");
    expect(rhythmusFuer("12m", true)).toBe("year");
    expect(rhythmusFuer("6m", false)).toBe("month");
    expect(rhythmusFuer(undefined, true)).toBe("year");
    expect(stripeRecurring("halfyear")).toEqual({ interval: "month", interval_count: 6 });
    expect(stripeRecurring("year")).toEqual({ interval: "year" });
    expect(stripeRecurring("month")).toEqual({ interval: "month" });
    expect(rhythmusAusStripe({ interval: "month", interval_count: 6 })).toBe("halfyear");
    expect(rhythmusAusStripe({ interval: "month", interval_count: 1 })).toBe("month");
    expect(rhythmusAusStripe({ interval: "year", interval_count: 1 })).toBe("year");
    expect([rhythmusFaktor("month"), rhythmusFaktor("halfyear"), rhythmusFaktor("year")]).toEqual([1, 5, 9]);
    expect(rhythmusFaktor("year", 2)).toBe(10);
    expect(rhythmusMonatsAnteil("halfyear")).toBeCloseTo(5 / 6);
    expect(rhythmusMonatsAnteil("year")).toBeCloseTo(9 / 12);
    expect(rhythmusMonatsAnteil("year", 2)).toBeCloseTo(10 / 12);
    expect(rhythmusMonatsAnteil("month")).toBe(1);
  });
});

describe("Kundenwahl auf der Angebotsseite", () => {
  const snap = (extra: Partial<OfferChoiceSnapshot> = {}): OfferChoiceSnapshot => ({
    term: "12m",
    productCount: 1,
    setupFee: 990,
    startIso: null,
    annualPrepay: false,
    annualFreeMonths: 2,
    annualChoice: true,
    choosesTerm: true,
    choosesStart: false,
    ...extra,
  });
  const today = "2026-11-20";

  it("6 Monate + Vorauszahlung: 1 Monat geschenkt, Setup 1.490 €", () => {
    expect(resolveOfferChoice(snap(), { term: "6m", annual: true }, today)).toMatchObject({ ok: true, term: "6m", setupFee: 1490, annualPrepay: true, annualFreeMonths: 1 });
    expect(resolveOfferChoice(snap(), { term: "6m", annual: false }, today)).toMatchObject({ ok: true, term: "6m", annualPrepay: false, annualFreeMonths: null });
  });

  it("12 Monate + Vorauszahlung: 2 Monate geschenkt; 3 Monate: keine Vorauszahlung", () => {
    expect(resolveOfferChoice(snap(), { term: "12m", annual: true }, today)).toMatchObject({ ok: true, annualPrepay: true, annualFreeMonths: 2 });
    expect(resolveOfferChoice(snap(), { term: "3m", annual: true }, today)).toMatchObject({ ok: true, term: "3m", annualPrepay: false, annualFreeMonths: null });
  });

  it("feste 6 Monate mit „Vorauszahlung anbieten“: gespeicherter Wert gilt", () => {
    const s = snap({ term: "6m", setupFee: 1490, annualFreeMonths: 1, choosesTerm: false });
    expect(resolveOfferChoice(s, { annual: true }, today)).toMatchObject({ ok: true, term: "6m", setupFee: 1490, annualPrepay: true, annualFreeMonths: 1 });
    expect(resolveOfferChoice(s, {}, today)).toMatchObject({ ok: true, annualPrepay: false });
  });

  it("Altangebote: 6 Monate nicht wählbar, feste Jahreszahlung nur mit 12 Monaten", () => {
    const alt = termOptionsFor(new Date(TERM_6M_AB.getTime() - 60_000));
    expect(alt).toEqual(["12m", "3m", "none"]);
    expect(termOptionsFor(TERM_6M_AB, "6m")).toEqual(TERM_OPTIONS);
    expect(termOptionsFor(TERM_6M_AB, "12m")).toEqual(["12m", "3m", "none"]);
    expect(resolveOfferChoice(snap({ termOptions: alt }), { term: "6m" }, today)).toEqual({ ok: false, error: "Bitte eine gültige Laufzeit wählen." });
    // altes Angebot mit fester Jahreszahlung (ohne Wahl): 6 Monate gewählt → monatlich, wie bei 3 Monaten
    const fest = snap({ annualPrepay: true, annualChoice: false });
    expect(resolveOfferChoice(fest, { term: "6m" }, today)).toMatchObject({ ok: true, term: "6m", annualPrepay: false });
    expect(resolveOfferChoice(fest, { term: "12m" }, today)).toMatchObject({ ok: true, annualPrepay: true, annualFreeMonths: 2 });
  });
});

describe("Abrechnungstag mit 6 Monaten im Voraus", () => {
  it("gilt nicht: voller Betrag für 6 Monate zum Start, nichts anteilig (Ole, 18.11.2026)", () => {
    const plan = abrechnungsplan({ startIso: "2027-01-01", billingDay: 15, annual: true })!;
    expect(plan).toMatchObject({ firstIso: "2027-01-01", differs: false, stubEndIso: null, ratio: 0, vorauszahlung: true });
    expect(anteilCent(549000, plan)).toBe(0);
    expect(abrechnungstagSaetze(plan, { firstNet: 5490 })).toEqual([]);
    const t = contractSummaryLines({ term: "6m", startIso: "2027-01-01", setup: 1490, monthlyTotal: 1098, intro: null, annual: true, freeMonths: 1, billingDay: 15 }).join(" ").replace(/\u00a0/g, " ");
    expect(t).toContain("6 Monate im Voraus: 5.490 € netto, alle 6 Monate fällig, das erste Mal zum Start am 01.01.2027, dann am 01.07.2027.");
    expect(t).toContain("Laufzeit bis 30.06.2027.");
    expect(t).not.toMatch(/anteilig|kostenlos|15\.01\./);
    expect(hatGedankenstrich(t)).toBe(false);
  });
  it("nächste Abbuchung in kürzeren Monaten am Monatsletzten", () => {
    expect(vorauszahlungFaellig("2026-08-31", 6)).toBe("alle 6 Monate fällig, das erste Mal zum Start am 31.08.2026, dann am 28.02.2027");
    expect(vorauszahlungFaellig(null, 6)).toBe("fällig zum Start, danach alle 6 Monate");
  });
});

describe("Kündigung und Mindestlaufzeit 6 Monate", () => {
  it("monatlich mit 6 Monaten: Ende der Mindestlaufzeit, danach Ende des Abrechnungsmonats", () => {
    const c = cancelDate({ startIso: "2027-01-15", term: "6m", annual: false, todayIso: "2027-03-01" });
    expect(c).toMatchObject({ effectiveIso: "2027-07-14", reason: "mindestlaufzeit", minTermEndIso: "2027-07-14" });
    const d = cancelDate({ startIso: "2027-01-15", term: "6m", annual: false, todayIso: "2027-07-20" });
    expect(d).toMatchObject({ effectiveIso: "2027-08-14", reason: "abrechnungsmonat" });
  });

  it("6 Monate im Voraus: Ende des Zahlungszeitraums, Kündigung bis einen Monat vorher, sonst 6 Monate später", () => {
    const a = cancelDate({ startIso: "2027-01-15", term: "6m", annual: true, todayIso: "2027-05-14" });
    expect(a).toMatchObject({ effectiveIso: "2027-07-14", reason: "zahlungsjahr", deadlineIso: "2027-06-14", missedDeadline: false, prepayMonths: 6 });
    expect(cancelDateText(a, "2027-01-15")).toBe("Ihr Vertrag endet am 14.07.2027, zum Ende des Zahlungszeitraums von 6 Monaten (Kündigung bis 14.06.2027 möglich).");
    const b = cancelDate({ startIso: "2027-01-15", term: "6m", annual: true, todayIso: "2027-06-20" });
    expect(b).toMatchObject({ effectiveIso: "2028-01-14", deadlineIso: "2027-12-14", missedDeadline: true });
    expect(hatGedankenstrich(cancelDateText(b, null))).toBe(false);
    // Rhythmus vom Kunden geht vor (prepayMonths)
    expect(cancelDate({ startIso: "2027-01-15", term: "12m", annual: true, todayIso: "2027-05-14", prepayMonths: 6 }).effectiveIso).toBe("2027-07-14");
  });

  it("jährlich unverändert", () => {
    const j = cancelDate({ startIso: "2027-01-15", term: "12m", annual: true, todayIso: "2027-05-14" });
    expect(j).toMatchObject({ effectiveIso: "2028-01-14", deadlineIso: "2027-12-14" });
    expect(cancelDateText(j, null)).toMatch(/Zahlungsjahres/);
  });
});

describe("Konditionen am Annahme-Knopf", () => {
  const base: ContractSummaryInput = { term: "6m", startIso: "2027-01-15", setup: 1490, monthlyTotal: 1098, intro: null, annual: false, freeMonths: 1 };
  it("6 Monate monatlich: Mindestlaufzeit 6 Monate", () => {
    const t = contractSummaryLines(base).join(" ");
    expect(t).toMatch(/Einrichtung: 1\.490\s€ netto/);
    expect(t).toMatch(/Mindestlaufzeit 6 Monate bis 14\.07\.2027, danach kündbar zum Ende des jeweiligen Abrechnungsmonats/);
  });
  it("6 Monate im Voraus: Betrag, Verlängerung um 6 Monate, Kündigungsfrist", () => {
    const t = contractSummaryLines({ ...base, annual: true }).join(" ");
    expect(t).toMatch(/6 Monate im Voraus: 5\.490\s€ netto, alle 6 Monate fällig, das erste Mal zum Start am 15\.01\.2027, dann am 15\.07\.2027\./);
    expect(t).toMatch(/Laufzeit bis 14\.07\.2027\. Sie verlängert sich um jeweils 6 Monate, wenn Sie nicht bis 14\.06\.2027 kündigen\./);
    expect(hatGedankenstrich(t)).toBe(false);
  });
  it("12 Monate im Voraus wie bisher", () => {
    const t = contractSummaryLines({ ...base, term: "12m", annual: true, freeMonths: 2 }).join(" ");
    expect(t).toMatch(/Jährlich im Voraus: 10\.980\s€ netto, jedes Jahr am 15\.01\. fällig, das erste Mal zum Start am 15\.01\.2027\./);
    expect(t).toMatch(/verlängert sich um jeweils 12 Monate, wenn Sie nicht bis 14\.12\.2027 kündigen/);
  });
});

describe("Erinnerung 30 Tage vor Ende der Vorauszahlung", () => {
  it("fällig ab 30 Tagen vorher, einmal je Zeitraum", () => {
    expect(VORAUSZAHLUNG_ERINNERUNG_TAGE).toBe(30);
    const o = { startIso: "2027-01-15", months: 6, remindedForIso: null };
    expect(laufenderZeitraum("2027-01-15", 6, "2027-03-01")).toMatchObject({ endIso: "2027-07-14", deadlineIso: "2027-06-14", k: 1 });
    expect(erinnerungFaellig({ ...o, todayIso: "2027-06-13" })).toBeNull(); // 31 Tage vorher
    expect(erinnerungFaellig({ ...o, todayIso: "2027-06-14" })).toEqual({ endIso: "2027-07-14", deadlineIso: "2027-06-14" });
    expect(erinnerungFaellig({ ...o, todayIso: "2027-06-20", remindedForIso: "2027-07-14" })).toBeNull();
    // nächster Zeitraum: neue Erinnerung trotz alter Marke
    expect(erinnerungFaellig({ ...o, todayIso: "2027-12-20", remindedForIso: "2027-07-14" })).toEqual({ endIso: "2028-01-14", deadlineIso: "2027-12-14" });
    // jährlich
    expect(erinnerungFaellig({ startIso: "2027-01-15", months: 12, todayIso: "2027-12-15", remindedForIso: null })).toEqual({ endIso: "2028-01-14", deadlineIso: "2027-12-14" });
    expect(erinnerungFaellig({ startIso: "2027-01-15", months: 12, todayIso: "2027-06-20", remindedForIso: null })).toBeNull();
    // vor dem Start nichts
    expect(erinnerungFaellig({ ...o, startIso: "2027-08-01", todayIso: "2027-06-20" })).toBeNull();
  });

  it("Text: Ende, Verlängerung, Betrag, Kündigungsfrist; ohne Gedankenstriche", () => {
    const a = erinnerungAbsaetze({ months: 6, endIso: "2027-07-14", deadlineIso: "2027-06-14", todayIso: "2027-06-14", betrag: 5490, ueberweisung: false }).join(" ");
    expect(a).toMatch(/Ihre Vorauszahlung läuft am 14\.07\.2027 aus\. Danach verlängert sich Ihr Vertrag automatisch um weitere 6 Monate, der Betrag von 5\.490\s€ netto/);
    expect(a).toMatch(/kündigen Sie bitte bis zum 14\.06\.2027/);
    expect(hatGedankenstrich(a)).toBe(false);
    const spaet = erinnerungAbsaetze({ months: 12, endIso: "2027-07-14", deadlineIso: "2027-06-14", todayIso: "2027-06-16", betrag: null, ueberweisung: true }).join(" ");
    expect(spaet).toMatch(/um weitere 12 Monate\./);
    expect(spaet).toMatch(/Kündigungsfrist von einem Monat für dieses Ende ist bereits abgelaufen/);
  });
});

describe("Zusatzmodule und Präsentation", () => {
  it("Module bei 6 Monaten im Voraus: Zahlungszeitraum statt Jahr", () => {
    const t = bestandTerms({ annual: true, monthlyNet: 149, freeMonths: 1, prepayMonths: 6 });
    expect(t.charge).toMatch(/6 Monate im Voraus: 745,00\s€ netto je 6 Monate \(1 Monat geschenkt\)/);
    expect(t.cancel).toMatch(/Zahlungszeitraums/);
    expect(bestandTerms({ annual: true, monthlyNet: 149, freeMonths: 2 }).charge).toMatch(/Jährliche Vorauszahlung: 1\.490,00\s€/);
    expect(bookingTerms({ trial: false, annual: true, prepayMonths: 6 }).lines.join(" ")).toMatch(/Ende des bezahlten Zahlungszeitraums/);
    expect(bookingTerms({ trial: false, annual: true }).lines.join(" ")).toMatch(/Abrechnungsjahres/);
  });

  it("Präsentation: Listenpreise ohne 6 Monate (nur auf Nachfrage, Ole 18.11.2026)", () => {
    const liste = paketDaten(null, "vertreter");
    expect(liste.setup.map((s) => [s.label, s.betrag])).toEqual([
      ["Ohne Laufzeit", 2490],
      ["Mit 3 Monaten", 1990],
      ["Mit 12 Monaten", 990],
    ]);
    expect(liste.jaehrlich).toBe("Jährlich im Voraus: 3 Monate geschenkt");
  });
});

const nb = (s: string) => s.replace(/ /g, " ");
const text = (html: string) => nb(html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));

describe("Angebotsseite: Zahlweise bei 6 Monaten", () => {
  const choice = (o: Partial<OfferChoiceProps> = {}): OfferChoiceProps => ({
    choosesTerm: true,
    choosesStart: true,
    initialTerm: "6m",
    options: [
      { term: "12m", label: "12 Monate", setup: 990 },
      { term: "6m", label: "6 Monate", setup: 1490 },
      { term: "3m", label: "3 Monate", setup: 1990 },
      { term: "none", label: "Ohne Laufzeit", setup: 2490 },
    ],
    monthlyTotal: 1098,
    annualOffered: true,
    choosesAnnual: true,
    initialAnnual: false,
    freeMonths: 1,
    start: { min: "2026-11-25", max: "2027-02-16", preset: "2027-01-01" },
    ...o,
  });
  const pricing: ContractSummaryInput = { term: "6m", startIso: "2027-01-01", setup: 1490, monthlyTotal: 1098, intro: null, annual: false, freeMonths: 1, prepayAtAcceptance: true };
  const form = (c: OfferChoiceProps, extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(createElement(AcceptForm, { token: "tok", termsUrl: "https://app.test/agb", dpaUrl: "https://app.test/avv", defaultName: "Sara Sechs", pricing, choice: c, ...extra }));

  it("Karten: Monatlich vorausgewählt oder „6 Monate im Voraus, 1 Monat geschenkt, Sie sparen 1 × Monatspreis“", () => {
    const html = form(choice(), { payment: true });
    expect(html).toContain("data-zahlweise-wahl");
    expect(html).toMatch(/name="rhythmus" checked="" value="monat"/);
    expect(html).toContain('value="voraus"');
    const t = text(html);
    expect(t).toMatch(/Laufzeit wählen 12 Monate Setup 990 € netto 6 Monate Setup 1\.490 € netto/);
    expect(t).toMatch(/6 Monate im Voraus Empfohlen 5\.490 € netto für 6 Monate 1 Monat geschenkt, Sie sparen 1\.098 €/);
    expect(t).toContain("Mindestlaufzeit 6 Monate bis 30.06.2027, danach kündbar zum Ende des jeweiligen Abrechnungsmonats.");
    expect(hatGedankenstrich(t)).toBe(false);
  });

  it("6 Monate im Voraus gewählt: Betrag, Verlängerung, Lastschrift alle 6 Monate", () => {
    const t = text(form(choice({ initialAnnual: true }), { payment: true }));
    // Seit 19.11.2026: mit der Annahme fällig, Laufzeit ab Start
    expect(t).toContain("6 Monate im Voraus: 5.490 € netto, alle 6 Monate fällig, das erste Mal mit der Annahme, dann am 01.07.2027.");
    expect(t).toContain("Die Vorauszahlung wird mit Annahme fällig, die Laufzeit beginnt mit dem Start der Kampagne.");
    expect(t).toContain("Laufzeit bis 30.06.2027. Sie verlängert sich um jeweils 6 Monate, wenn Sie nicht bis 31.05.2027 kündigen.");
    // 1.490 € Setup + 5.490 € = 6.980 € netto jetzt, danach alle 6 Monate ab der Verlängerung
    expect(t).toMatch(/Jetzt fällig \(Setup und Vorauszahlung\): 6\.980 € netto/);
    expect(t).toMatch(/Danach alle 6 Monate ab 01\.07\.2027: 5\.490 € netto/);
    expect(t).toContain("der Betrag wird alle 6 Monate automatisch eingezogen.");
    expect(hatGedankenstrich(t)).toBe(false);
  });

  it("Jahreszahlung im selben Angebot bei 12 Monaten: 2 Monate geschenkt", () => {
    const t = text(form(choice({ initialTerm: "12m", freeMonths: 2 })));
    expect(t).toMatch(/Jährlich im Voraus Empfohlen 10\.980 € netto im Jahr 2 Monate geschenkt, Sie sparen 2\.196 €/);
  });
});

describe("Angebotsdokument mit 6 Monaten", () => {
  const doc = (o: Partial<OfferDoc> = {}): OfferDoc => ({
    number: "PG-2026-0600",
    version: 1,
    status: "sent",
    contactName: "Sara Sechs",
    company: "Agentur Sechs",
    street: null,
    zip: null,
    city: null,
    package: "software",
    vermittlerTyp: "vertreter",
    term: "6m",
    products: [{ name: "TKV-Katze", dailyBudget: 30 }],
    setupFee: 1490,
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
    seats: 5,
    seatsIncluded: 3,
    seatMonthly: 49,
    bestandMonthly: null,
    annualPrepay: false,
    annualFreeMonths: 1,
    annualChoice: true,
    customerChoosesTerm: true,
    customerChoosesStart: true,
    ...o,
  });

  it("vor der Annahme: Wahl mit beiden Beträgen, Laufzeiten inkl. 6 Monate", () => {
    const t = text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc() })));
    expect(t).toMatch(/Laufzeit 6 Monate/);
    expect(t).toMatch(/Mit 6 Monaten Laufzeit/);
    expect(t).toMatch(/Wählen Sie bei der Annahme: monatlich 1\.098 € netto im Monat oder 6 Monate im Voraus 5\.490 € netto für 6 Monate/);
    expect(t).toMatch(/Bei Vorauszahlung 1 Monat geschenkt, Sie sparen 1\.098 €\./);
    expect(t).toMatch(/verlängert sich dann nach 6 Monaten um jeweils weitere 6 Monate/);
    expect(t).toMatch(/6 Monate ab Start, danach monatlich kündbar/);
    expect(t).toMatch(/Laufzeit wählen Sie unten bei der Annahme: 12 Monate \(Setup 990 €\), 6 Monate \(1\.490 €\), 3 Monate \(1\.990 €\) oder ohne Laufzeit \(2\.490 €\)/);
    const zeile = t.slice(t.indexOf("Wählen Sie bei der Annahme"), t.indexOf("keine Gutschrift.") + 17);
    expect(hatGedankenstrich(zeile)).toBe(false);
  });

  it("nach der Annahme mit Vorauszahlung: Betrag je 6 Monate, Verlängerung um 6 Monate", () => {
    // Angenommen vor dem 19.11.2026: Vorauszahlung zum Start (Text unverändert)
    const t = text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc({ status: "accepted", annualPrepay: true, acceptedAt: new Date("2026-11-18T17:00:00Z"), prepayAtAcceptance: false }) })));
    expect(t).toMatch(/6 Monate im Voraus: 5\.490 € netto je 6 Monate/);
    expect(t).toMatch(/1 Monat geschenkt \(5 statt 6 Monatsbeträge\), Ersparnis 1\.098 €/);
    expect(t).toMatch(/6 Monate ab Start, 6 Monate im Voraus bezahlt\. Danach verlängert sich der Vertrag um jeweils weitere 6 Monate/);
    expect(t).toMatch(/Betrag für 6 Monate \(5\.490 € netto/);
    // Ab 19.11.2026: Setup und Vorauszahlung bei Annahme fällig, Laufzeit ab Start
    const neu = text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc({ status: "accepted", annualPrepay: true, acceptedAt: new Date("2026-11-19T17:00:00Z"), prepayAtAcceptance: true }) })));
    expect(neu).toMatch(/Bei Annahme fällig 6\.980 € netto \(Setup 1\.490 € und Vorauszahlung für 6 Monate 5\.490 €\)/);
    expect(neu).toContain("Die Vorauszahlung wird mit Annahme fällig, die Laufzeit beginnt mit dem Start der Kampagne. Die nächste Vorauszahlung ist am 01.07.2027 fällig.");
    expect(neu).toContain("alle 6 Monate fällig, das erste Mal mit der Annahme, dann am 01.07.2027.");
    expect(neu).toContain("Die Setupgebühr und die Vorauszahlung für die ersten 6 Monate werden mit Vertragsschluss fällig");
  });

  it("Altangebot (vor der Einführung) mit Laufzeitwahl: Liste ohne 6 Monate", () => {
    const t = text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc({ term: "12m", setupFee: 990, annualFreeMonths: 2, createdAt: new Date("2026-11-17T12:00:00Z") }) })));
    expect(t).toMatch(/Laufzeit wählen Sie unten bei der Annahme: 12 Monate \(Setup 990 €\), 3 Monate \(1\.990 €\) oder ohne Laufzeit \(2\.490 €\)/);
  });
});

// 6 Monate nur auf Nachfrage (Ole, 18.11.2026): zur Wahl nur, wenn das Angebot selbst auf 6 Monate steht
import { termOptionsFor as termOptionsFor6m } from "@/lib/offer-pricing";
describe("6 Monate nur auf Nachfrage", () => {
  const neu = new Date("2026-11-19T10:00:00Z");
  it("ohne 6-Monats-Angebot nie zur Wahl", () => {
    expect(termOptionsFor6m(neu, "12m")).not.toContain("6m");
    expect(termOptionsFor6m(neu, "3m")).not.toContain("6m");
    expect(termOptionsFor6m(neu)).not.toContain("6m");
  });
  it("mit 6-Monats-Angebot zur Wahl", () => {
    expect(termOptionsFor6m(neu, "6m")).toContain("6m");
  });
});
