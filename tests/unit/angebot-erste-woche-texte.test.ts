// Leadkosten der ersten Woche im Angebot Pay-per-Lead + Software (Ole, 20.11.2026): Punkt in „Das vereinbaren Sie mit
// dem Klick“ (live zu Menge und Haken), Leadkosten statt „Jetzt fällig: 0 €“, Deckblatt „Erste Woche“ statt „0 €
// Einrichtung“, Angebotsmail, USt-Satz nur für die Software. Geprüft: Menge, Preis, Summe, mit/ohne Wiederholen,
// steuerfrei/steuerpflichtig, keine Gedankenstriche.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/app/angebot/[token]/actions", () => ({ acceptOfferAction: async () => ({}) }));

import { ersteWocheFaellig, ersteWocheMailzeile, ersteWocheVertragszeile } from "@/lib/ppl/erste-woche-shared";
import { contractSummaryLines, type ContractSummaryInput } from "@/lib/vertrag-laufzeit";
import { AcceptForm, type OfferChoiceProps } from "@/app/angebot/[token]/accept-form";
import { OfferDocument, type OfferDoc } from "@/components/offer-document";
import { offerSummaryInput } from "@/lib/offers";
import { baueAngebotsMail } from "@/lib/email";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

/** Geschützte Leerzeichen (Intl) als normales Leerzeichen. */
const nb = (s: string) => s.replace(/ | /g, " ");
const text = (html: string) => nb(html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'")).replace(/\s+/g, " ");

const katze = { productKey: "TKV-Katze", name: "TKV-Katze", price: 17, quantity: 30, autoRenew: true };
const spar = { productKey: "Kindersparplan", name: "Kindersparplan", price: 20, quantity: 20, autoRenew: true };

describe("Texte zur ersten Woche", () => {
  it("steuerfrei, jede Woche: Menge, Preis je Lead, Summe, Bedingung, eigene Rechnung, Abbuchung", () => {
    expect(nb(ersteWocheVertragszeile(katze))).toBe(
      "Erste Woche: 30 Leads TKV-Katze zu je 17,00 €, zusammen 510,00 €, umsatzsteuerfrei nach § 4 Nr. 11 UStG für geprüfte Versicherungsvermittler (sonst zzgl. 19 % USt.), eigene Rechnung, Abbuchung nach Prüfung Ihrer Registernummer. Danach jede Woche dieselbe Menge, in der App jederzeit änderbar.",
    );
  });
  it("ohne Wiederholen: einmalig", () => {
    const z = nb(ersteWocheVertragszeile({ ...katze, quantity: 5, autoRenew: false }));
    expect(z).toContain("Erste Woche: 5 Leads TKV-Katze zu je 17,00 €, zusammen 85,00 €");
    expect(z).toMatch(/Einmalig, ohne automatische Wiederholung\. Weitere Leads bestellen Sie in der App\.$/);
    expect(z).not.toMatch(/jede Woche/);
  });
  it("steuerpflichtig (Kindersparplan): Preis je Lead und Summe brutto, inkl. 19 % USt.", () => {
    const z = nb(ersteWocheVertragszeile(spar));
    expect(z).toContain("Erste Woche: 20 Leads Kindersparplan zu je 23,80 €, zusammen 476,00 € inkl. 19 % USt., eigene Rechnung");
    expect(z).not.toMatch(/umsatzsteuerfrei/);
  });
  it("Zeile über dem Knopf statt „Jetzt fällig: 0 €“", () => {
    const f = ersteWocheFaellig(katze);
    expect(nb(`${f.label}${f.betrag}${f.zusatz}`)).toBe("Erste Woche: 510,00 € (30 Leads, umsatzsteuerfrei), Abbuchung nach Prüfung Ihrer Registernummer");
    const s = ersteWocheFaellig(spar);
    expect(nb(`${s.label}${s.betrag}${s.zusatz}`)).toBe("Erste Woche: 476,00 € (20 Leads, inkl. 19 % USt.), Abbuchung nach Prüfung Ihrer Registernummer");
  });
  it("Angebotsmail in Sie- und Du-Form", () => {
    expect(nb(ersteWocheMailzeile({ ...katze, quantity: 20 }, false))).toBe(
      "Erste Woche: 20 Leads TKV-Katze zu je 17,00 €, zusammen 340,00 €, umsatzsteuerfrei nach § 4 Nr. 11 UStG für geprüfte Versicherungsvermittler (sonst zzgl. 19 % USt.). Die Anzahl wählen Sie bei der Annahme, abgebucht wird erst nach Prüfung Ihrer Registernummer.",
    );
    expect(nb(ersteWocheMailzeile({ ...katze, quantity: 20 }, true))).toMatch(/Die Anzahl wählst du bei der Annahme, abgebucht wird erst nach Prüfung deiner Registernummer\.$/);
  });
  it("keine Gedankenstriche", () => {
    for (const t of [ersteWocheVertragszeile(katze), ersteWocheVertragszeile({ ...spar, autoRenew: false }), ersteWocheMailzeile(katze, true), ersteWocheMailzeile(spar, false)]) {
      expect(hatGedankenstrich(t)).toBe(false);
    }
  });
});

const base: ContractSummaryInput = {
  term: "none",
  startIso: "2026-12-01",
  setup: 0,
  monthlyTotal: 349,
  intro: null,
  annual: false,
  freeMonths: 0,
  paket: "ppl_software",
};

describe("Das vereinbaren Sie mit dem Klick", () => {
  it("mit erster Woche: Punkt mit den Leadkosten, USt-Satz nur für die Software", () => {
    const lines = contractSummaryLines({ ...base, ersteWoche: katze }).map(nb);
    expect(lines).toContain(nb(ersteWocheVertragszeile(katze)));
    expect(lines.at(-1)).toBe("Kündigen können Sie jederzeit im Kundenbereich unter Konto & Rechnungen oder in Textform. Preise der Software zzgl. 19 % USt.");
    expect(lines.join(" ")).not.toMatch(/Alle Preise zzgl/);
  });
  it("ohne erste Woche (PPL): kein Leadpunkt, USt-Satz trotzdem nur für die Software", () => {
    const lines = contractSummaryLines(base);
    expect(lines.join(" ")).not.toMatch(/Erste Woche/);
    expect(lines.at(-1)).toMatch(/Preise der Software zzgl\. 19 % USt\.$/);
  });
  it("andere Pakete unverändert: Alle Preise zzgl. 19 % USt.", () => {
    expect(contractSummaryLines({ ...base, paket: "software", ersteWoche: katze }).at(-1)).toMatch(/Alle Preise zzgl\. 19 % USt\.$/);
    expect(contractSummaryLines({ ...base, paket: "software", ersteWoche: katze }).join(" ")).not.toMatch(/Erste Woche/);
  });
  it("offerSummaryInput: erste Woche aus dem Angebot, Wahl des Kunden geht vor", () => {
    const offer = {
      term: "none",
      startDate: new Date("2026-12-01T12:00:00Z"),
      setupFee: 0,
      introMonthlyFee: null,
      introMonths: null,
      annualPrepay: false,
      annualFreeMonths: null,
      package: "ppl_software",
      pplProductKey: "TKV-Katze",
      pplLabel: null,
      pplPrice: 17,
      pplQuantity: 20,
      pplAutoRenew: true,
      monthlyFee: 349,
      seats: null,
      seatsIncluded: null,
      seatMonthly: null,
      bestandMonthly: null,
    } as unknown as Parameters<typeof offerSummaryInput>[0];
    expect(offerSummaryInput(offer).ersteWoche).toEqual({ productKey: "TKV-Katze", name: "TKV-Katze", price: 17, quantity: 20, autoRenew: true });
    expect(offerSummaryInput(offer, { ersteWoche: { quantity: 40, autoRenew: false } }).ersteWoche).toMatchObject({ quantity: 40, autoRenew: false });
    expect(offerSummaryInput({ ...offer, package: "software" } as typeof offer).ersteWoche).toBeNull();
  });
});

describe("Annahme-Formular", () => {
  const choice: OfferChoiceProps = {
    choosesTerm: true,
    choosesStart: true,
    initialTerm: "none",
    options: [{ term: "none", label: "Ohne Laufzeit", setup: 0 }],
    monthlyTotal: 349,
    annualOffered: false,
    freeMonths: 0,
    start: { min: "2026-11-26", max: "2027-02-17", preset: "2026-12-01" },
    ohneEinrichtung: true,
  };
  const ersteWoche = { name: "TKV-Katze", productKey: "TKV-Katze", price: 17, quantity: 30, softwareMonatlich: 349, registerVorschlag: null };
  const render = () =>
    text(renderToStaticMarkup(createElement(AcceptForm, { token: "tok", termsUrl: "https://a/agb", dpaUrl: "https://a/avv", defaultName: "Paula Pay", pricing: base, choice, ersteWoche })));

  it("Leadkosten statt „Jetzt fällig: 0 €“, Zusatz keine Einrichtungsgebühr", () => {
    const t = render();
    expect(t).toMatch(/Erste Woche: 510,00 € \(30 Leads, umsatzsteuerfrei\), Abbuchung nach Prüfung Ihrer Registernummer Keine Einrichtungsgebühr/);
    expect(t).not.toMatch(/Jetzt fällig: 0/);
  });
  it("Zusammenfassung mit Leadpunkt zur gewählten Menge und Wiederholung", () => {
    const t = render();
    expect(t).toContain("Erste Woche: 30 Leads TKV-Katze zu je 17,00 €, zusammen 510,00 €");
    expect(t).toContain("Danach jede Woche dieselbe Menge, in der App jederzeit änderbar.");
    expect(t).toContain("Preise der Software zzgl. 19 % USt.");
    expect(t).not.toMatch(/Alle Preise zzgl/);
    expect(hatGedankenstrich(t)).toBe(false);
  });
});

describe("Angebotsdokument und Angebotsmail", () => {
  const doc = (o: Partial<OfferDoc> = {}): OfferDoc =>
    ({
      number: "PG-2026-0700",
      version: 1,
      status: "sent",
      contactName: "Paula Pay",
      company: "Agentur Pay",
      street: null,
      zip: null,
      city: null,
      package: "ppl_software",
      vermittlerTyp: "vertreter",
      term: "none",
      products: [],
      setupFee: 0,
      monthlyFee: 349,
      softwareFee: 349,
      introMonthlyFee: null,
      introMonths: null,
      specialTerms: null,
      startDate: new Date("2026-12-01T12:00:00Z"),
      validUntil: new Date("2026-12-03T12:00:00Z"),
      createdAt: new Date("2026-11-19T16:00:00Z"),
      acceptedAt: null,
      acceptedName: null,
      termsUrl: null,
      dpaUrl: null,
      seats: 3,
      seatsIncluded: 3,
      seatMonthly: 49,
      bestandMonthly: null,
      annualPrepay: false,
      annualFreeMonths: null,
      customerChoosesTerm: true,
      customerChoosesStart: true,
      pplProductKey: "TKV-Katze",
      pplLabel: null,
      pplPrice: 17,
      pplQuantity: 30,
      ...o,
    }) as OfferDoc;
  const angebotstext = (o: Partial<OfferDoc> = {}) => text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc(o) }))).split("Allgemeine Geschäftsbedingungen")[0];

  it("Deckblatt: Erste Woche mit Summe, Menge, Preis je Lead und Steuer statt 0 € Einrichtung", () => {
    const t = angebotstext();
    expect(t).toMatch(/Erste Woche 510,00 € 30 Leads TKV-Katze à 17,00 €, umsatzsteuerfrei für geprüfte Vermittler · Anzahl wählen Sie bei der Annahme/);
    expect(t).not.toMatch(/Einrichtung 0 € keine Einrichtungsgebühr/);
    expect(t).toMatch(/Leads der ersten Woche: 510,00 € \(30 Leads, umsatzsteuerfrei\), eigene Rechnung, Abbuchung nach Prüfung Ihrer Registernummer\./);
    expect(hatGedankenstrich(t)).toBe(false);
  });
  it("angenommen: keine Einrichtungsgebühr als Zusatz; steuerpflichtig mit Bruttobetrag", () => {
    expect(angebotstext({ status: "accepted", acceptedAt: new Date("2026-11-20T10:00:00Z"), acceptedName: "Paula Pay" })).toMatch(/Erste Woche 510,00 € 30 Leads TKV-Katze à 17,00 €, umsatzsteuerfrei für geprüfte Vermittler · keine Einrichtungsgebühr/);
    expect(angebotstext({ pplProductKey: "Kindersparplan", pplPrice: 20, pplQuantity: 20 })).toMatch(/Erste Woche 476,00 € 20 Leads Kindersparplan à 23,80 €, inkl. 19 % USt\./);
  });
  it("ohne erste Woche bleibt „Einrichtung 0 €“", () => {
    expect(angebotstext({ pplProductKey: null, pplPrice: null })).toMatch(/Einrichtung 0 € keine Einrichtungsgebühr/);
  });
  it("Angebotsmail mit Leadkosten, Text und HTML", () => {
    const m = baueAngebotsMail({
      greeting: "Hallo Frau Pay,",
      number: "PG-2026-0700",
      offerUrl: "https://app.example.com/angebot/tok",
      validUntil: new Date("2026-12-03T12:00:00Z"),
      ersteWoche: { productKey: "TKV-Katze", name: "TKV-Katze", price: 17, quantity: 30 },
    });
    expect(nb(m.text)).toContain("Erste Woche: 30 Leads TKV-Katze zu je 17,00 €, zusammen 510,00 €");
    expect(text(m.html)).toContain("Erste Woche: 30 Leads TKV-Katze zu je 17,00 €, zusammen 510,00 €");
    expect(hatGedankenstrich(m.text)).toBe(false);
  });
});
