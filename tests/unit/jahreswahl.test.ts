// Jahreszahlung im Angebot zur Wahl (Ole, 18.11.2026): Beträge, Prüfung der Wahl (serverseitig) und Texte der
// Angebotsseite (Karten „Monatlich“ und „Jährlich im Voraus“, Zusammenfassung am Knopf, Angebotsdokument).
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/angebot/[token]/actions", () => ({ acceptOfferAction: async () => ({}) }));

import { AcceptForm, type OfferChoiceProps } from "@/app/angebot/[token]/accept-form";
import { OfferDocument, type OfferDoc } from "@/components/offer-document";
import { jahreswahlBetraege, resolveOfferChoice, type OfferChoiceSnapshot } from "@/lib/offer-pricing";
import { contractSummaryLines, type ContractSummaryInput } from "@/lib/vertrag-laufzeit";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

const TODAY = "2026-11-18";
const nb = (s: string) => s.replace(/ /g, " ");
/** Sichtbarer Text ohne Tags (React-Kommentare entfernt). */
const text = (html: string) => nb(html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));

const snap = (o: Partial<OfferChoiceSnapshot> = {}): OfferChoiceSnapshot => ({
  term: "12m",
  productCount: 1,
  setupFee: 990,
  startIso: "2027-01-01",
  annualPrepay: false,
  annualFreeMonths: 2,
  annualChoice: true,
  choosesTerm: true,
  choosesStart: false,
  ...o,
});

describe("Jahreswahl: Beträge und Prüfung der Wahl", () => {
  it("Jahresbetrag = 9 × Monatspreis inkl. Zusätze, Ersparnis = 3 Monatspreise (Ole, 19.11.2026); gespeicherte 2 bleiben", () => {
    expect(jahreswahlBetraege(1098)).toEqual({ annualTotal: 9882, savings: 3294, freeMonths: 3 });
    expect(jahreswahlBetraege(1000, null)).toEqual({ annualTotal: 9000, savings: 3000, freeMonths: 3 });
    expect(jahreswahlBetraege(1098, 2)).toEqual({ annualTotal: 10980, savings: 2196, freeMonths: 2 });
  });

  it("Wahl angeboten: ohne Angabe Vorauswahl (monatlich), jährlich nur mit 12 Monaten", () => {
    expect(resolveOfferChoice(snap(), {}, TODAY)).toMatchObject({ ok: true, annualPrepay: false, annualFreeMonths: null });
    expect(resolveOfferChoice(snap(), { annual: false }, TODAY)).toMatchObject({ ok: true, annualPrepay: false });
    expect(resolveOfferChoice(snap(), { annual: true }, TODAY)).toMatchObject({ ok: true, term: "12m", annualPrepay: true, annualFreeMonths: 2 });
    expect(resolveOfferChoice(snap(), { term: "3m", annual: true }, TODAY)).toMatchObject({ ok: true, term: "3m", annualPrepay: false, annualFreeMonths: null });
    // Vorauswahl jährlich (z. B. später so gesetzt): ohne Angabe jährlich, monatlich wählbar
    expect(resolveOfferChoice(snap({ annualPrepay: true }), {}, TODAY)).toMatchObject({ ok: true, annualPrepay: true });
    expect(resolveOfferChoice(snap({ annualPrepay: true }), { annual: false }, TODAY)).toMatchObject({ ok: true, annualPrepay: false });
  });

  it("Ohne Wahl: wie vereinbart, abweichende Angabe abgelehnt", () => {
    const fest = snap({ annualChoice: false, annualPrepay: true });
    expect(resolveOfferChoice(fest, {}, TODAY)).toMatchObject({ ok: true, annualPrepay: true });
    expect(resolveOfferChoice(fest, { annual: true }, TODAY)).toMatchObject({ ok: true, annualPrepay: true });
    expect(resolveOfferChoice(fest, { annual: false }, TODAY)).toEqual({ ok: false, error: "Die Zahlweise ist in diesem Angebot fest vereinbart." });
    const monatlich = snap({ annualChoice: false });
    expect(resolveOfferChoice(monatlich, { annual: true }, TODAY)).toEqual({ ok: false, error: "Die Zahlweise ist in diesem Angebot fest vereinbart." });
  });

  it("Zusammenfassung mit Abrechnungstag: Jahresbeitrag voll zum Start, Abrechnungstag nur bei monatlicher Zahlung", () => {
    const base: ContractSummaryInput = { term: "12m", startIso: "2027-01-01", setup: 990, monthlyTotal: 1098, intro: null, annual: true, freeMonths: 2, billingDay: 15 };
    const gratis = contractSummaryLines({ ...base, freeStart: true }).map(nb);
    const anteilig = contractSummaryLines(base).map(nb);
    for (const l of [gratis, anteilig]) {
      expect(l).toContain("Jährlich im Voraus: 10.980 € netto, jedes Jahr am 01.01. fällig, das erste Mal zum Start am 01.01.2027.");
      expect(l).toContain("Laufzeit bis 31.12.2027. Sie verlängert sich um jeweils 12 Monate, wenn Sie nicht bis 30.11.2027 kündigen.");
      expect(l.join(" ")).not.toMatch(/anteilig|kostenlos|15\.01\./);
    }
    const monatlich = contractSummaryLines({ ...base, annual: false }).map(nb).join(" ");
    // 14 von 31 Tagen des Monatsbetrags: 1.098 € × 14 / 31 = 495,87 €
    expect(monatlich).toMatch(/Monatlich: 1\.098 € netto ab 15\.01\.2027/);
    expect(monatlich).toMatch(/berechnen wir anteilig 495,87 € netto/);
    for (const l of [...gratis, ...anteilig, monatlich]) expect(hatGedankenstrich(l)).toBe(false);
  });
});

const choice = (o: Partial<OfferChoiceProps> = {}): OfferChoiceProps => ({
  choosesTerm: true,
  choosesStart: true,
  initialTerm: "12m",
  options: [
    { term: "12m", label: "12 Monate", setup: 990 },
    { term: "3m", label: "3 Monate", setup: 1990 },
    { term: "none", label: "Ohne Laufzeit", setup: 2490 },
  ],
  monthlyTotal: 1098,
  annualOffered: true,
  choosesAnnual: true,
  initialAnnual: false,
  freeMonths: 2,
  start: { min: "2026-11-25", max: "2027-02-16", preset: "2027-01-01" },
  ...o,
});
const pricing: ContractSummaryInput = { term: "12m", startIso: "2027-01-01", setup: 990, monthlyTotal: 1098, intro: null, annual: false, freeMonths: 2 };
const form = (c: OfferChoiceProps | null, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(AcceptForm, { token: "tok", termsUrl: "https://app.test/agb", dpaUrl: "https://app.test/avv", defaultName: "Jana Jahr", pricing, choice: c, ...extra }),
  );

describe("Jahreswahl: Texte der Angebotsseite", () => {
  it("zwei Karten: Monatlich vorausgewählt, Jährlich als „Empfohlen“ mit Ersparnis; Zusammenfassung monatlich", () => {
    const html = form(choice(), { payment: true });
    expect(html).toContain("data-zahlweise-wahl");
    expect(html).toMatch(/name="rhythmus" checked="" value="monat"/);
    expect(html).not.toMatch(/name="rhythmus" checked="" value="jahr"/);
    const t = text(html);
    expect(t).toContain("Zahlweise wählen");
    expect(t).toMatch(/Monatlich 1\.098 € netto im Monat/);
    expect(t).toMatch(/Jährlich im Voraus Empfohlen 10\.980 € netto im Jahr 2 Monate geschenkt, Sie sparen 2\.196 €/);
    expect(t).toContain("Monatlich: 1.098 € netto ab 01.01.2027, im Voraus.");
    expect(t).toContain("Am einfachsten per Lastschrift, der Betrag wird monatlich automatisch eingezogen.");
    expect(t).toContain("mit der hier gewählten Laufzeit und Zahlweise und dem gewählten Start");
    expect(hatGedankenstrich(t)).toBe(false);
  });

  it("Jährlich gewählt: Zusammenfassung mit Jahresbetrag und Verlängerung, Lastschrift jährlich", () => {
    const t = text(form(choice({ initialAnnual: true }), { payment: true, ueberweisungTage: 14 }));
    expect(t).toContain("Jährlich im Voraus: 10.980 € netto, jedes Jahr am 01.01. fällig, das erste Mal zum Start am 01.01.2027.");
    expect(t).toContain("Laufzeit bis 31.12.2027. Sie verlängert sich um jeweils 12 Monate, wenn Sie nicht bis 30.11.2027 kündigen.");
    expect(t).toMatch(/Jährlich im Voraus ab 01\.01\.2027: 10\.980 € netto/);
    expect(t).toContain("der Betrag wird jährlich automatisch eingezogen.");
    // Überweisung bleibt bei Jahreszahlung wählbar, wenn am Angebot freigegeben
    expect(t).toContain("Per Überweisung zahlen");
    expect(hatGedankenstrich(t)).toBe(false);
  });

  it("nur die Zahlweise zur Wahl (Laufzeit und Start fest): Karten trotzdem da", () => {
    const html = form(choice({ choosesTerm: false, choosesStart: false }));
    expect(html).toContain("data-zahlweise-wahl");
    expect(text(html)).toContain("mit der hier gewählten Zahlweise.");
  });

  it("ohne Haken bzw. andere Laufzeit: keine Karten, nur monatlich", () => {
    expect(form(choice({ annualOffered: false, choosesAnnual: false }))).not.toContain("data-zahlweise-wahl");
    const kurz = form(choice({ initialTerm: "3m" }));
    expect(kurz).not.toContain("data-zahlweise-wahl");
    expect(text(kurz)).toContain("Monatlich: 1.098 € netto ab 01.01.2027, im Voraus.");
    expect(form(null)).not.toContain("data-zahlweise-wahl");
  });
});

const doc = (o: Partial<OfferDoc> = {}): OfferDoc => ({
  number: "PG-2026-0999",
  version: 1,
  status: "sent",
  contactName: "Jana Jahr",
  company: "Agentur Jahr",
  street: null,
  zip: null,
  city: null,
  package: "software",
  vermittlerTyp: "vertreter",
  term: "12m",
  products: [{ name: "TKV-Katze", dailyBudget: 30 }],
  setupFee: 990,
  monthlyFee: 1000,
  softwareFee: 349,
  introMonthlyFee: null,
  introMonths: null,
  specialTerms: null,
  startDate: new Date("2027-01-01T12:00:00Z"),
  validUntil: new Date("2026-12-02T12:00:00Z"),
  createdAt: new Date("2026-11-18T12:00:00Z"),
  acceptedAt: null,
  acceptedName: null,
  termsUrl: null,
  dpaUrl: null,
  seats: 5,
  seatsIncluded: 3,
  seatMonthly: 49,
  bestandMonthly: null,
  annualPrepay: false,
  annualFreeMonths: 2,
  annualChoice: true,
  customerChoosesTerm: true,
  customerChoosesStart: true,
  ...o,
});

describe("Jahreswahl: Angebotsdokument (Seite und PDF)", () => {
  it("vor der Annahme: Zahlweise zur Wahl mit beiden Beträgen, Ersparnis und Verlängerung", () => {
    const html = renderToStaticMarkup(createElement(OfferDocument, { offer: doc() }));
    const t = text(html);
    expect(html).toContain("data-offer-zahlweise-wahl");
    expect(t).toMatch(/Wählen Sie bei der Annahme: monatlich 1\.098 € netto im Monat oder jährlich im Voraus 10\.980 € netto im Jahr/);
    expect(t).toMatch(/Bei Jahreszahlung 2 Monate geschenkt, Sie sparen 2\.196 €\./);
    expect(t).toMatch(/oder jährlich im Voraus 10\.980 €, 2 Monate geschenkt/);
    expect(t).toMatch(/Bei Jahreszahlung ist es der Jahresbetrag von 10\.980 € netto\./);
    const zeile = t.slice(t.indexOf("Wählen Sie bei der Annahme"), t.indexOf("keine Gutschrift.") + 17);
    expect(hatGedankenstrich(zeile)).toBe(false);
  });

  it("nach der Annahme: jährlich bzw. monatlich mit Hinweis „bei der Annahme gewählt“", () => {
    const jahr = text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc({ status: "accepted", annualPrepay: true }) })));
    expect(jahr).toMatch(/Jährlich im Voraus: 10\.980 € netto pro Jahr/);
    expect(jahr).toContain("Bei der Annahme gewählt.");
    expect(jahr).not.toContain("Wählen Sie bei der Annahme");
    const monat = text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc({ status: "accepted", annualFreeMonths: null }) })));
    expect(monat).toContain("Monatlich im Voraus, bei der Annahme gewählt.");
    expect(monat).not.toMatch(/Jährlich im Voraus/);
  });

  it("Abrechnungstag am 1., Start 18.11. (Ole, 18.11.2026): jährlich voller Jahresbetrag zum Start, monatlich anteilig", () => {
    const mitTag = { startDate: new Date("2026-11-18T12:00:00Z"), billingDay: 1, billingFreeStart: false };
    const jahr = text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc({ ...mitTag, status: "accepted", annualPrepay: true }) })));
    expect(jahr).toContain("18.11.2026. Ab diesem Tag läuft die Vergütung: 10.980 € netto jährlich im Voraus, jedes Jahr am 18.11. fällig, das erste Mal zum Start am 18.11.2026.");
    expect(jahr).toMatch(/Jahresbetrag \(10\.980 € netto, [\d.,]+ € brutto\) am 18\.11\.2026\./);
    expect(jahr).toContain("12 Monate ab Start, jährlich im Voraus bezahlt.");
    // Angebotsteil bis zu den Kosten im Überblick (AGB und Verkäufer-Zeile sprechen allgemein von „anteilig“ bzw. „kostenlos“)
    const konditionen = jahr.slice(jahr.indexOf("Start 18.11.2026"), jahr.indexOf("Ihre monatlichen Kosten"));
    expect(konditionen).not.toMatch(/anteilig|kostenlos|01\.12\.2026|ersten Abrechnungstag/);
    expect(hatGedankenstrich(jahr.slice(jahr.indexOf("18.11.2026. Ab diesem Tag"), jahr.indexOf("18.11.2026. Ab diesem Tag") + 160))).toBe(false);
    // Vor der Annahme (Kunde wählt): monatlich ab dem 1. mit Anteil, bei Jahreszahlung voller Betrag zum Start
    const offen = text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc(mitTag) })));
    expect(offen).toContain("Ihr Monatsbeitrag wird ab dem 01.12.2026 jeweils am 1. abgebucht.");
    expect(offen).toContain("Bei Jahreszahlung ist der volle Jahresbetrag schon zum Start am 18.11.2026 fällig.");
    expect(offen).toContain("Bei Jahreszahlung ist es der Jahresbetrag von 10.980 € netto, fällig zum Start am 18.11.2026.");
  });

  it("ohne Haken: keine Zahlweise-Zeile", () => {
    const t = text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc({ annualChoice: false, annualFreeMonths: null }) })));
    expect(t).not.toContain("Wählen Sie bei der Annahme");
    expect(t).not.toMatch(/jährlich im Voraus/i);
  });
});
