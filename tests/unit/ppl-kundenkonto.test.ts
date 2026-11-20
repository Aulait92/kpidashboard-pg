// Pay-per-Lead + Software, Variante „Kampagnen im eigenen Werbekonto“ (Ole, 20.11.2026; lib/ppl/kundenkonto.ts):
// Prüfung der Produkte (Startpaket ab 1.500 €), Software inklusive ab 1.500 € Leadumsatz im Monat, Rechenregeln der
// wöchentlichen Abrechnung (Gutschrift nur im selben Monat), Rechnungspositionen, Texte in Annahme, Angebot, Mail,
// Formularwerte; bisheriges Verhalten (Pool) unverändert. Keine Gedankenstriche, nie „Garantie“.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  beispielRechnung,
  kundenkontoAus,
  kundenkontoFaellig,
  kundenkontoMailAbsatz,
  kundenkontoSoftwareZeile,
  kundenkontoVertragszeilen,
  MINDESTBESTELLUNG_KUNDENKONTO,
  normalizePplModell,
  pruefeKundenkontoProdukte,
  rechnungsPositionen,
  softwareInklusive,
  startMengeFuer,
  wochenAbrechnung,
} from "@/lib/ppl/kundenkonto";
import { contractSummaryLines } from "@/lib/vertrag-laufzeit";
import { offerSummaryInput } from "@/lib/offers";
import { OfferDocument, type OfferDoc } from "@/components/offer-document";
import { baueAngebotsMail } from "@/lib/email";
import { entwurfZuFormWerte, formWerteZuInput, standardFormWerte, type OfferEntwurf } from "@/lib/offer-form-werte";
import { PPL_KUNDENKONTO_BEDINGUNGEN, AGB } from "@/lib/legal-texts";
import { paketDaten, verkaufsFolien, type AngebotFuerFolien } from "@/lib/vertrieb/verkaufspraesentation";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { PRICE_LIST } from "@/lib/offer-pricing";

const nb = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");
const text = (html: string) => nb(html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'")).replace(/\s+/g, " ");
const sauber = (t: string) => {
  expect(hatGedankenstrich(t)).toBe(false);
  expect(t).not.toMatch(/garantie/i);
};

const privat = { name: "Privatschutz", preis: 35, menge: 43 };
const spar = { name: "Kindersparplan", preis: 65, menge: 10 };

describe("Produkte und Startpaket", () => {
  it("Schwelle zentral 1.500 €, Startmenge für 35 € = 43 Leads", () => {
    expect(MINDESTBESTELLUNG_KUNDENKONTO).toBe(1500);
    expect(startMengeFuer(35)).toBe(43);
    expect(startMengeFuer(65)).toBe(24);
  });

  it("gültig ab 1.500 € Summe aus Menge × Preis", () => {
    const r = pruefeKundenkontoProdukte([
      { name: "Privatschutz", preis: "35", menge: "30" },
      { name: "Kindersparplan", preis: "65,00", menge: "8" },
    ]);
    expect(r).toEqual({ ok: true, produkte: [{ name: "Privatschutz", preis: 35, menge: 30 }, { name: "Kindersparplan", preis: 65, menge: 8 }], startUmsatz: 1570 });
  });

  it("lehnt ab: leer, unter 1.500 €, ohne Startmenge, ohne Preis, doppelt", () => {
    expect(pruefeKundenkontoProdukte([]).ok).toBe(false);
    const unter = pruefeKundenkontoProdukte([{ name: "Privatschutz", preis: 35, menge: 42 }]);
    expect(unter.ok).toBe(false);
    if (!unter.ok) expect(nb(unter.error)).toBe("Das Startpaket braucht mindestens 1.500,00 € Leadumsatz, bisher 1.470,00 €.");
    expect(pruefeKundenkontoProdukte([{ name: "Privatschutz", preis: 35, menge: "" }]).ok).toBe(false);
    expect(pruefeKundenkontoProdukte([{ name: "Privatschutz", preis: 0, menge: 100 }]).ok).toBe(false);
    expect(pruefeKundenkontoProdukte([{ name: "Privatschutz", preis: 35, menge: 2.5 }]).ok).toBe(false);
    expect(pruefeKundenkontoProdukte([privat, { ...privat, name: "privatschutz" }]).ok).toBe(false);
  });

  it("Variante nur bei Paket ppl_software und pplModell kundenkonto", () => {
    expect(kundenkontoAus({ package: "ppl_software", pplModell: "kundenkonto", pplProdukte: [privat] })).toEqual({ produkte: [privat], startUmsatz: 1505 });
    expect(kundenkontoAus({ package: "ppl_software", pplModell: null, pplProdukte: [privat] })).toBeNull();
    expect(kundenkontoAus({ package: "software", pplModell: "kundenkonto", pplProdukte: [privat] })).toBeNull();
    expect(normalizePplModell(undefined)).toBe("pool");
    expect(normalizePplModell("kundenkonto")).toBe("kundenkonto");
  });
});

describe("Software inklusive ab 1.500 € Leadumsatz im Monat", () => {
  it("Schwelle", () => {
    expect(softwareInklusive(1500)).toBe(true);
    expect(softwareInklusive(1499.99)).toBe(false);
    expect(softwareInklusive(3500)).toBe(true);
    expect(softwareInklusive(Number.NaN)).toBe(false);
  });

  it("inklusive: Software als eigene Position, Leadteil sinkt", () => {
    // 100 Leads × 35 € = 3.500 €, Meta 1.400 € → Vergütung 2.100 € brutto
    const r = rechnungsPositionen({ verguetungBrutto: 2100, leadumsatzMonatBrutto: 3500, softwareNetto: 349 });
    expect(r.inklusive).toBe(true);
    expect(r.software).toEqual({ netto: 349, brutto: 415.31 });
    expect(r.leadteil.brutto).toBe(1684.69);
    expect(r.gesamtBrutto).toBe(2100);
  });

  it("darunter: Software zusätzlich zum Listenpreis", () => {
    const r = rechnungsPositionen({ verguetungBrutto: 600, leadumsatzMonatBrutto: 1400, softwareNetto: 349 });
    expect(r.inklusive).toBe(false);
    expect(r.leadteil.brutto).toBe(600);
    expect(r.gesamtBrutto).toBe(1015.31);
  });
});

describe("Wöchentliche Abrechnung (Rechenregel)", () => {
  it("Leads × Preis abzüglich Meta", () => {
    expect(wochenAbrechnung({ leads: [{ preis: 35, anzahl: 100 }], metaKostenBrutto: 1400 })).toEqual({ leadUmsatz: 3500, meta: 1400, betrag: 2100, gutschriftDanach: 0 });
  });

  it("Meta teurer: keine Auszahlung, Gutschrift nur verrechnet", () => {
    const w1 = wochenAbrechnung({ leads: [{ preis: 35, anzahl: 10 }], metaKostenBrutto: 400 });
    expect(w1).toEqual({ leadUmsatz: 350, meta: 400, betrag: 0, gutschriftDanach: 50 });
    const w2 = wochenAbrechnung({ leads: [{ preis: 35, anzahl: 20 }], metaKostenBrutto: 300, gutschriftVorher: w1.gutschriftDanach });
    expect(w2.betrag).toBe(350);
  });

  it("Rechenbeispiel ohne Ergebnisversprechen", () => {
    expect(nb(beispielRechnung({ preis: 35 })!.text)).toBe(
      "Rechenbeispiel für eine Woche: 20 Leads × 35,00 € = 700,00 €. Haben Sie in dieser Woche 300,00 € an Meta gezahlt, buchen wir 400,00 € ab.",
    );
  });
});

const kk = { produkte: [privat, spar], startUmsatz: 2155 };

describe("Texte", () => {
  it("Vertragszeilen: Werbekonto und Budget, Obergrenze, Abrechnung, Startpaket, Voraussetzung", () => {
    const z = kundenkontoVertragszeilen(kk).map(nb);
    expect(z).toHaveLength(5);
    expect(z[0]).toBe("Paket: Pay-per-Lead + Software, Kampagnen im eigenen Werbekonto (Partnerzugriff für uns), ohne Einrichtungsgebühr. Das Werbebudget zahlen Sie direkt an Meta, es wird voll angerechnet.");
    expect(z[1]).toBe("Sie zahlen höchstens diesen Preis je Lead inkl. USt.: Privatschutz 35,00 €, Kindersparplan 65,00 €. Das ist eine Preisobergrenze: keine Zusage zu Leadzahlen oder Ergebnissen.");
    expect(z[2]).toContain("wöchentlich per Lastschrift");
    expect(z[2]).toContain("§ 13b");
    expect(z[2]).toContain("19 % USt.");
    expect(z[3]).toBe("Startpaket: 43 Leads Privatschutz und 10 Leads Kindersparplan, zusammen 2.155,00 € Leadumsatz inkl. USt. (mindestens 1.500,00 €). Abgerechnet wird nach Lieferung, keine Vorauszahlung.");
    expect(z[4]).toContain("§ 34f");
    expect(z[4]).toContain("Besonderen Bedingungen");
    expect(nb(kundenkontoSoftwareZeile(349, "01.12.2026"))).toBe(
      "Software: inklusive, solange Sie mindestens 1.500,00 € Leads im Monat beziehen, sonst 349,00 € netto im Monat. Abgebucht wird sie monatlich im Voraus ab 01.12.2026 und in Monaten mit Software inklusive mit Ihrer Leadabrechnung verrechnet.",
    );
    expect(z.join(" ")).not.toMatch(/Marge/);
    z.forEach(sauber);
  });

  it("Das vereinbaren Sie mit dem Klick: Variante statt Pool-Hinweis, bisher unverändert", () => {
    const basis = {
      term: "none" as const,
      startIso: "2026-12-01",
      setup: 0,
      monthlyTotal: 349,
      intro: null,
      annual: false,
      freeMonths: 0,
      paket: "ppl_software",
    };
    const neu = contractSummaryLines({ ...basis, kundenkonto: kk }).map(nb);
    expect(neu.some((l) => l.startsWith("Paket: Pay-per-Lead + Software, Kampagnen im eigenen Werbekonto"))).toBe(true);
    expect(neu.some((l) => l.includes("Leads bestellen Sie wie gewohnt per Stück"))).toBe(false);
    expect(neu.some((l) => l.startsWith("Software: inklusive, solange Sie mindestens 1.500,00 € Leads im Monat beziehen, sonst 349,00 € netto im Monat. Abgebucht wird sie monatlich im Voraus ab 01.12.2026"))).toBe(true);
    expect(neu.some((l) => l.startsWith("Monatlich:"))).toBe(false);
    neu.forEach(sauber);
    const alt = contractSummaryLines(basis).map(nb);
    expect(alt[0]).toBe("Paket: Pay-per-Lead + Software (Software ohne Betreuung und ohne eigene Kampagnen), ohne Einrichtungsgebühr.");
    expect(alt.some((l) => l.includes("Leads bestellen Sie wie gewohnt per Stück"))).toBe(true);
    expect(alt.some((l) => l.includes("Werbekonto"))).toBe(false);
  });

  it("Annahme: Startpaket statt 0 €", () => {
    expect(nb(Object.values(kundenkontoFaellig(kk)).join(""))).toBe("Startpaket: 2.155,00 € Leadumsatz inkl. USt., abgerechnet wöchentlich nach Lieferung, keine Vorauszahlung");
  });

  it("Angebotsmail: Absatz Sie und Du", () => {
    const sie = nb(kundenkontoMailAbsatz(kk, 349, false));
    expect(sie).toContain("Ihr eigenes Meta-Werbekonto");
    expect(sie).toContain("Startpaket ab 1.500,00 € Leadumsatz");
    expect(sie).toContain("Software inklusive, solange Sie mindestens 1.500,00 € Leads im Monat beziehen, sonst 349,00 € netto im Monat.");
    const du = nb(kundenkontoMailAbsatz(kk, 349, true));
    expect(du).toContain("dein eigenes Meta-Werbekonto");
    expect(du).toContain("solange du mindestens");
    [sie, du].forEach(sauber);
    const mail = baueAngebotsMail({
      greeting: "Hallo Frau Pay,",
      number: "PG-2026-0701",
      offerUrl: "https://example.test/angebot/x",
      validUntil: new Date("2026-12-03T12:00:00Z"),
      kundenkonto: { angebot: kk, softwareNetto: 349 },
    });
    expect(nb(mail.text)).toContain("Kampagnen im eigenen Werbekonto: Die Werbung läuft über Ihr eigenes Meta-Werbekonto");
  });

  it("Besondere Bedingungen: eigener Abschnitt, AGB unverändert", () => {
    const alles = nb(PPL_KUNDENKONTO_BEDINGUNGEN.flatMap((s) => s.items.map((i) => (typeof i === "string" ? i : i.text))).join(" "));
    for (const teil of ["gültiger Telefonnummer", "30 Tagen", "7 Tagen", "zweite Quelle", "nicht ausgezahlt", "Kalendermonat", "Ausfallzeit", "unwirtschaftlich", "Nutzungsrecht", "Partnerzugriff", "§ 34f", "Versicherer", "zurückgegeben", "§ 4 Nr. 11", "19 %"]) {
      expect(alles).toContain(teil);
    }
    sauber(alles);
    expect(AGB.some((s) => s.title.includes("Werbekonto"))).toBe(false);
  });
});

const doc = (o: Partial<OfferDoc> = {}): OfferDoc =>
  ({
    number: "PG-2026-0701",
    version: 1,
    status: "sent",
    contactName: "Paula Pay",
    company: "Agentur Pay",
    street: null,
    zip: null,
    city: null,
    package: "ppl_software",
    vermittlerTyp: "makler",
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
    createdAt: new Date("2026-11-20T16:00:00Z"),
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
    customerChoosesStart: true,
    pplProductKey: null,
    pplLabel: null,
    pplPrice: null,
    pplQuantity: null,
    pplModell: "kundenkonto",
    pplProdukte: [privat],
    ...o,
  }) as OfferDoc;

describe("Angebotsdokument", () => {
  it("Variante: Startpaket, Software inklusive, Preis je Lead, Abrechnung, Besondere Bedingungen", () => {
    const t = text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc() })));
    expect(t).toContain("Startpaket 1.505,00 €");
    expect(t).toContain("Software inklusive");
    expect(t).toContain("Privatschutz: höchstens 35,00 € inkl. USt.");
    expect(t).toContain("Rechenbeispiel für eine Woche");
    expect(t).toContain("Besondere Bedingungen: Kampagnen im eigenen Werbekonto");
    expect(t).not.toContain("Leads bestellen Sie wie gewohnt per Stück");
    expect(t).not.toMatch(/Marge/);
  });

  it("bisher (Pool) unverändert: keine Werbekonto-Texte", () => {
    const t = text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc({ pplModell: null, pplProdukte: null }) })));
    expect(t).toContain("Leads bestellen Sie wie gewohnt per Stück");
    expect(t).not.toContain("Kampagnen im eigenen Werbekonto");
    expect(t).not.toContain("Startpaket");
  });

  it("offerSummaryInput liefert die Variante", () => {
    const i = offerSummaryInput({ ...doc(), monthlyFee: 349, seatMonthly: 49, bestandMonthly: null } as never);
    expect(i.kundenkonto).toEqual({ produkte: [privat], startUmsatz: 1505 });
  });
});

describe("Formularwerte", () => {
  const initial = { contactName: "Paula Pay", company: "Agentur Pay", email: "paula@example.test" };
  it("Standard: Pool, Vorschlag Privatschutz 35 € × 43", () => {
    const w = standardFormWerte(initial, null);
    expect(w.pplModell).toBe("pool");
    expect(w.kkProdukte).toEqual([{ name: "Privatschutz", preis: "35", menge: "43" }]);
    const ein = formWerteZuInput({ ...w, pkg: "ppl_software", term: "none" }, { referral: false, ueberweisungVerfuegbar: false });
    expect(ein.pplModell).toBe("pool");
    expect(ein.kundenkontoProdukte).toBeNull();
  });

  it("kundenkonto: Produkte statt erster Woche, Entwurf zurück in dieselben Werte", () => {
    const w = { ...standardFormWerte(initial, null), pkg: "ppl_software" as const, term: "none" as const, pplModell: "kundenkonto" as const, wocheProdukt: "TKV-Katze", wochePreis: "17" };
    const ein = formWerteZuInput(w, { referral: false, ueberweisungVerfuegbar: false });
    expect(ein.pplModell).toBe("kundenkonto");
    expect(ein.kundenkontoProdukte).toEqual([{ name: "Privatschutz", preis: "35", menge: "43" }]);
    expect(ein.ersteWoche).toBeNull();
    const entwurf = {
      contactName: "Paula Pay", company: "Agentur Pay", email: "paula@example.test", street: null, zip: null, city: null,
      package: "ppl_software", vermittlerTyp: "vertreter", term: "none", products: [], setupFee: 0, monthlyFee: 349,
      introMonthlyFee: null, introMonths: null, specialTerms: null, isTest: false, startDate: new Date("2026-12-01T12:00:00Z"),
      billingDay: null, billingFreeStart: false, paymentInArrears: false, customerChoosesTerm: false, customerChoosesStart: true,
      customerChoosesProducts: false, seats: 3, bestandMonthly: null, empfehlungMonthly: null, annualPrepay: false, annualChoice: false,
      setupDiscount: null, allowPayLater: false, allowBankTransfer: false, bankTransferDays: 14, abschlussBonus: null, abschlussBonusBis: null,
      pplProductKey: null, pplLabel: null, pplPrice: null, pplQuantity: null, pplModell: "kundenkonto", pplProdukte: [spar, privat],
      validUntil: new Date("2026-12-03T12:00:00Z"),
    } satisfies OfferEntwurf;
    const zurueck = entwurfZuFormWerte(entwurf, null, new Date("2026-11-20T12:00:00Z"));
    expect(zurueck.pplModell).toBe("kundenkonto");
    expect(zurueck.kkProdukte).toEqual([{ name: "Kindersparplan", preis: "65", menge: "10" }, { name: "Privatschutz", preis: "35", menge: "43" }]);
  });
});

describe("Präsentation", () => {
  const angebot: AngebotFuerFolien = {
    number: "PG-2026-0701", company: "Agentur Pay", contactName: "Paula Pay", package: "ppl_software", vermittlerTyp: "vertreter", term: "none",
    products: [], setupFee: 0, monthlyFee: 349, seats: 3, seatsIncluded: 3, seatMonthly: 49, bestandMonthly: null, empfehlungMonthly: null,
    annualPrepay: false, annualFreeMonths: null, customerChoosesTerm: false, setupDiscount: null, introMonthlyFee: null, introMonths: null,
  };
  it("kurzer Absatz nur, wenn die Variante gewählt ist", () => {
    const mit = paketDaten({ ...angebot, kundenkonto: kk }, "ppl");
    expect(mit.kundenkonto).toContain("Kampagnen im eigenen Werbekonto");
    expect(verkaufsFolien("ppl", mit).some((f) => f.html.includes("data-kundenkonto"))).toBe(true);
    const ohne = paketDaten(angebot, "ppl");
    expect(ohne.kundenkonto ?? null).toBeNull();
    expect(verkaufsFolien("ppl", ohne).some((f) => f.html.includes("data-kundenkonto"))).toBe(false);
    expect(PRICE_LIST.softwareFee).toBe(349);
  });
});
