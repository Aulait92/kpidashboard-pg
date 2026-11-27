// AGB je Angebot nur mit dem, was gilt (Ole, 26.11.2026): ohne Pay-per-Lead keine Teile zu Pay-per-Lead und keine
// Umsatzsteuer auf Leads, Vorauszahlung nur, wenn gewählt oder wählbar. Gemischte Angebote zeigen beides, die öffentliche
// Seite bleibt vollständig je Paket, die archivierte Fassung „Stand 25.11.2026“ wird gleich gefiltert.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/angebot/[token]/actions", () => ({ acceptOfferAction: async () => ({}) }));

import { OfferDocument, type OfferDoc } from "@/components/offer-document";
import AgbPage from "@/app/rechtliches/agb/page";
import {
  AGB,
  AGB_NUR_LEADS,
  AGB_REGELN,
  agbFiltern,
  agbFuerAngebot,
  agbMerkmaleAus,
  agbMerkmaleGespeichert,
  agbOeffentlichJePaket,
  agbPplSoftware,
  agbRegelTrifft,
  LEGAL_VERSION,
  PPL_KUNDENKONTO_BEDINGUNGEN,
  type LegalSection,
} from "@/lib/legal-texts";
import { AGB_2026_11_25, AGB_ARCHIV_STAND } from "@/lib/agb-2026-11-25";
import { agbDesAngebots, agbNachweis } from "@/lib/agb-angebot";

const plain = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const text = (s: LegalSection[]) => s.flatMap((x) => [x.title, ...x.items.map((i) => (typeof i === "string" ? i : `${i.sub}: ${i.text}`))]).join("\n");
const titel = (s: LegalSection[]) => s.map((x) => x.title);
const subs = (s: LegalSection[], t: string) => s.find((x) => x.title === t)!.items.flatMap((i) => (typeof i === "string" ? [] : [i.sub]));

// Alles, was nur mit Pay-per-Lead gilt (Paketbeschreibung, Lead-Preise, Lieferung, Reklamation, Nachliefern,
// Ersatzleads, Exklusivität je Lead, Umsatzsteuer auf Leads)
const PPL_MUSTER = /Pay-per-Lead|per Stück|Preis je Lead|Nachliefer|liefert er nach|Ersatzlead|Reklamation|reklamier|Mindestabnahme|Umsatzsteuer auf Leads|§ 4 Nr\. 11|umsatzsteuerfrei|exklusiv nur an einen Kunden/;
const VORAUS_MUSTER = /Vorauszahlung|im Voraus gezahlt|Zahlungszeitraum|bezahlten Zeitraums/;

const BETREUUNG_TITEL = [
  "Geltungsbereich",
  "Vertragsschluss und Rangfolge",
  "Leistungen: Leadgenerierung",
  "Leistungen: Software",
  "Mitwirkung des Kunden",
  "Vergütung und Zahlung",
  "Pause und Urlaub",
  "Testphasen und kostenlose Zeiträume",
  "Angebote vor einer Kündigung",
  "Laufzeit und Kündigung",
  "Datenschutz",
  "Kundendaten: Zusicherung und Freistellung",
  "Daten bei Vertragsende",
  "Haftung",
  "Vertraulichkeit",
  "Änderungen dieser AGB",
  "Schlussbestimmungen",
];

describe("Merkmale aus dem Angebot", () => {
  it("Pay-per-Lead, Kampagnen und Vorauszahlung", () => {
    expect(agbMerkmaleAus({ package: "software" })).toEqual({ paket: "software", ppl: false, kampagnen: true, vorauszahlung: "nein" });
    expect(agbMerkmaleAus({ package: "service", annualChoice: true })).toMatchObject({ ppl: false, kampagnen: true, vorauszahlung: "waehlbar" });
    expect(agbMerkmaleAus({ package: "software", annualPrepay: true, annualChoice: true })).toMatchObject({ vorauszahlung: "ja" });
    expect(agbMerkmaleAus({ package: "ppl_software", annualChoice: true })).toMatchObject({ ppl: true, kampagnen: false, vorauszahlung: "nein" });
    expect(agbMerkmaleAus({ package: "ppl" })).toMatchObject({ ppl: true, kampagnen: false });
    // gemischt: Betreuung mit Lead-Produkt
    expect(agbMerkmaleAus({ package: "software", pplProductKey: "TKV-Katze" })).toMatchObject({ ppl: true, kampagnen: true });
    expect(agbMerkmaleAus({ package: "software", pplProdukte: [{ name: "TKV", preis: 20, menge: 10 }] })).toMatchObject({ ppl: true });
    expect(agbMerkmaleAus({ package: "software", pplProdukte: [] })).toMatchObject({ ppl: false });
  });

  it("gespeicherte Merkmale lesen, Unlesbares ignorieren", () => {
    expect(agbMerkmaleGespeichert({ paket: "software", ppl: false, kampagnen: true, vorauszahlung: "nein", archiv: false, abschnitte: [] })).toEqual({
      paket: "software",
      ppl: false,
      kampagnen: true,
      vorauszahlung: "nein",
    });
    expect(agbMerkmaleGespeichert(null)).toBeNull();
    expect(agbMerkmaleGespeichert({ paket: "software", ppl: "nein" })).toBeNull();
    expect(agbMerkmaleGespeichert({ paket: "software", ppl: false, kampagnen: true, vorauszahlung: "vielleicht" })).toBeNull();
  });
});

describe("Regeln finden ihren Text", () => {
  it.each(AGB_REGELN.map((r) => [r.name, r] as const))("%s: in den AGB und in der Archivfassung", (_n, r) => {
    expect(agbRegelTrifft(AGB, r)).toBe(true);
    expect(agbRegelTrifft(AGB_2026_11_25, r)).toBe(true);
  });

  it("Original bleibt unverändert", () => {
    const vorher = JSON.stringify(AGB);
    agbFiltern(AGB, agbMerkmaleAus({ package: "service" }));
    expect(JSON.stringify(AGB)).toBe(vorher);
  });
});

describe("Betreuung + Software, Nur Betreuung (ohne Pay-per-Lead)", () => {
  for (const paket of ["software", "service"]) {
    it(`${paket}: alle 17 Abschnitte, fortlaufend, ohne Pay-per-Lead, Umsatzsteuer auf Leads und Vorauszahlung`, () => {
      const { agb } = agbFuerAngebot({ package: paket });
      expect(titel(agb)).toEqual(BETREUUNG_TITEL);
      expect(text(agb)).not.toMatch(PPL_MUSTER);
      expect(text(agb)).not.toMatch(VORAUS_MUSTER);
      expect(subs(agb, "Leistungen: Software")).toEqual(["Digitaler Assistent (KI)", "Keine Beratung", "Zugänge", "Zusatzmodule"]);
      expect(subs(agb, "Vergütung und Zahlung")).toEqual([]);
      const verg = agb.find((s) => s.title === "Vergütung und Zahlung")!.items;
      expect(verg[0]).toMatch(/Alle Preise sind netto zuzüglich Umsatzsteuer\.$/);
      expect(agb.find((s) => s.title === "Laufzeit und Kündigung")!.items).toHaveLength(3);
      expect(agb.find((s) => s.title === "Pause und Urlaub")!.items[0]).toBe(
        "Der Kunde kann die Kampagnen jederzeit pausieren. Während der Pause fällt statt der monatlichen Vergütung nur die im Angebot genannte Software-Gebühr an, tagesgenau anteilig; ohne Software fällt nichts an. Eine Pause verlängert eine Mindestlaufzeit nicht.",
      );
      // Allgemeines bei allen Angebotstypen
      expect(agb[0]).toBe(AGB[0]);
    });
  }

  it("Vorauszahlung wählbar oder gewählt: Absätze zur Vorauszahlung bleiben, Pay-per-Lead weiter nicht", () => {
    for (const o of [{ annualChoice: true }, { annualPrepay: true }]) {
      const { agb } = agbFuerAngebot({ package: "software", ...o });
      expect(titel(agb)).toEqual(BETREUUNG_TITEL);
      expect(subs(agb, "Vergütung und Zahlung")).toEqual(["Vorauszahlung"]);
      expect(text(agb)).toContain("Bei Vorauszahlung läuft der Vertrag einen Zahlungszeitraum");
      expect(text(agb)).toContain("Bei Vorauszahlung gibt es dafür keine Gutschrift.");
      expect(text(agb)).toContain("bei Vorauszahlung (jährlich bzw. für 6 Monate) zum Ende des bezahlten Zeitraums");
      expect(text(agb)).not.toMatch(PPL_MUSTER);
    }
  });
});

describe("Pay-per-Lead", () => {
  it("Pay-per-Lead + Software: eigene Abschnitte mit Umsatzsteuer auf Leads, ohne Vorauszahlung", () => {
    const { agb } = agbFuerAngebot({ package: "ppl_software", zugaenge: true, zusatzmodule: true });
    expect(titel(agb)).toEqual([
      "Geltungsbereich",
      "Vertragsschluss und Rangfolge",
      "Leistungen: Software",
      "Leads: Bestellung, Preis und Zahlung",
      "Lieferung, Nachlieferung und Erstattung",
      "Abrechenbare Leads und Reklamation",
      "Mitwirkung des Kunden",
      "Vergütung und Zahlung",
      "Umsatzsteuer auf Leads",
      "Testphasen und kostenlose Zeiträume",
      "Laufzeit und Kündigung",
      "Datenschutz",
      "Kundendaten: Zusicherung und Freistellung",
      "Daten bei Vertragsende",
      "Haftung",
      "Vertraulichkeit",
      "Änderungen dieser AGB",
      "Schlussbestimmungen",
    ]);
    expect(text(agb)).toContain("§ 4 Nr. 11 UStG");
    expect(text(agb)).not.toMatch(VORAUS_MUSTER);
    expect(text(agb)).toContain("Zusatzmodule: Zusatzmodule gelten nur, wenn sie im Angebot vereinbart");
  });

  it("Nur Leads unverändert", () => {
    expect(agbFuerAngebot({ package: "ppl" }).agb).toBe(AGB_NUR_LEADS);
  });

  it("Kampagnen im eigenen Werbekonto: Absatz „Paket Pay-per-Lead + Software“ und Umsatzsteuer bleiben, Vorauszahlung fällt weg", () => {
    const kk = agbFuerAngebot({ package: "ppl_software", kundenkonto: true });
    expect(kk.besondere).toBe(PPL_KUNDENKONTO_BEDINGUNGEN);
    expect(subs(kk.agb, "Leistungen: Software")).toContain("Paket Pay-per-Lead + Software");
    expect(subs(kk.agb, "Vergütung und Zahlung")).toEqual(["Umsatzsteuer auf Leads"]);
    expect(text(kk.agb)).not.toMatch(VORAUS_MUSTER);
  });
});

describe("Gemischt (Betreuung mit Lead-Produkten)", () => {
  it("zeigt Betreuung und Pay-per-Lead, fortlaufend nummeriert", () => {
    const { agb } = agbFuerAngebot({ package: "software", pplProductKey: "TKV-Katze", annualChoice: true });
    expect(titel(agb)).toEqual([
      "Geltungsbereich",
      "Vertragsschluss und Rangfolge",
      "Leistungen: Leadgenerierung",
      "Leistungen: Software",
      "Leads: Bestellung, Preis und Zahlung",
      "Lieferung, Nachlieferung und Erstattung",
      "Abrechenbare Leads und Reklamation",
      ...BETREUUNG_TITEL.slice(4),
    ]);
    expect(subs(agb, "Vergütung und Zahlung")).toEqual(["Umsatzsteuer auf Leads", "Vorauszahlung"]);
    expect(text(agb)).toContain("soweit nicht unter „Umsatzsteuer auf Leads“ anders geregelt");
    // Paketbeschreibung „Pay-per-Lead + Software“ passt nicht zu einem Angebot mit Betreuung
    expect(subs(agb, "Leistungen: Software")).not.toContain("Paket Pay-per-Lead + Software");
  });
});

describe("Archivfassung „Stand 25.11.2026“ (Garantie-Kunden)", () => {
  const alt = { createdAt: new Date("2026-11-20T10:00:00Z") };

  it("ohne Pay-per-Lead, Vorauszahlung und Testphase gefiltert, Garantien bleiben (§ 10)", () => {
    const a = agbDesAngebots({ package: "software", ...alt });
    expect(a.archiv).toBe(true);
    expect(a.stand).toBe(AGB_ARCHIV_STAND);
    expect(titel(a.abschnitte)).toEqual(titel(AGB_2026_11_25).filter((t) => t !== "Testphasen und kostenlose Zeiträume"));
    expect(titel(a.abschnitte).indexOf("Garantien") + 1).toBe(10);
    expect(text(a.abschnitte)).not.toMatch(PPL_MUSTER);
    expect(text(a.abschnitte)).not.toMatch(VORAUS_MUSTER);
    expect(text(a.abschnitte)).toContain("Lead-Garantie");
  });

  it("mit Vorauszahlung zur Wahl bleibt sie", () => {
    const a = agbDesAngebots({ package: "software", annualChoice: true, ...alt });
    expect(subs(a.abschnitte, "Vergütung und Zahlung")).toEqual(["Vorauszahlung"]);
  });
});

describe("Angenommene Angebote: gespeicherte Merkmale gelten", () => {
  it("Nachweis enthält Stand, Merkmale, Abschnitte und Hash; danach zeigt das Angebot genau diese Fassung", () => {
    const o = { package: "software", annualChoice: true, billingFreeStart: true, createdAt: new Date("2026-11-26T20:00:00Z") };
    const n = agbNachweis(o);
    expect(n.agbVersion).toBe(LEGAL_VERSION);
    expect(n.agbMerkmale).toEqual({ paket: "software", ppl: false, kampagnen: true, vorauszahlung: "waehlbar", testphase: true, archiv: false, abschnitte: BETREUUNG_TITEL });
    expect(n.agbHash).toMatch(/^[0-9a-f]{64}$/);
    // Spätere Änderung am Angebot (z. B. Vorauszahlung abgewählt) ändert die angenommene Fassung nicht
    const spaeter = agbDesAngebots({ ...o, annualChoice: false, status: "accepted", agbMerkmale: n.agbMerkmale });
    expect(agbNachweis({ ...o, annualChoice: false, status: "accepted", agbMerkmale: n.agbMerkmale }).agbHash).toBe(n.agbHash);
    expect(subs(spaeter.abschnitte, "Vergütung und Zahlung")).toEqual(["Vorauszahlung"]);
    // Ohne gespeicherte Merkmale: aus dem Angebot
    expect(subs(agbDesAngebots({ ...o, annualChoice: false, status: "accepted" }).abschnitte, "Vergütung und Zahlung")).toEqual([]);
  });

  it("andere Fassung, anderer Hash", () => {
    const a = agbNachweis({ package: "software", createdAt: new Date("2026-11-26T20:00:00Z") });
    const b = agbNachweis({ package: "software", annualChoice: true, createdAt: new Date("2026-11-26T20:00:00Z") });
    expect(a.agbHash).not.toBe(b.agbHash);
  });
});

const doc = (o: Partial<OfferDoc> = {}): OfferDoc => ({
  number: "PG-2026-0200",
  version: 1,
  status: "draft",
  contactName: "Test Kunde",
  company: "Agentur Test",
  street: null,
  zip: null,
  city: null,
  package: "software",
  vermittlerTyp: "vertreter",
  term: "12m",
  products: [{ name: "Katzenversicherung (TKV)", dailyBudget: 30 }, { name: "Zahnzusatz", dailyBudget: 20 }],
  setupFee: 990,
  monthlyFee: 1000,
  softwareFee: 349,
  introMonthlyFee: null,
  introMonths: null,
  specialTerms: null,
  startDate: new Date("2027-01-01T12:00:00Z"),
  validUntil: new Date("2026-12-10T12:00:00Z"),
  createdAt: new Date("2026-11-26T20:00:00Z"),
  acceptedAt: null,
  acceptedName: null,
  termsUrl: "https://app.example/rechtliches/agb",
  dpaUrl: "https://app.example/rechtliches/avv",
  seats: 1,
  seatsIncluded: 3,
  seatMonthly: 49,
  bestandMonthly: null,
  annualPrepay: false,
  annualFreeMonths: null,
  annualChoice: false,
  ...o,
});

describe("Angebotsseite und PDF (gleiches Dokument)", () => {
  it("Betreuung + Software mit Zusatzsparte, ohne Vorauszahlung: nichts zu Pay-per-Lead, Umsatzsteuer auf Leads oder Vorauszahlung", () => {
    const t = plain(renderToStaticMarkup(createElement(OfferDocument, { offer: doc() })));
    expect(t).toContain("§ 1 Geltungsbereich");
    expect(t).toContain("§ 16 Schlussbestimmungen");
    expect(t).not.toMatch(PPL_MUSTER);
    expect(t).not.toMatch(VORAUS_MUSTER);
  });

  it("Nur Betreuung: ebenso", () => {
    const t = plain(renderToStaticMarkup(createElement(OfferDocument, { offer: doc({ package: "service", softwareFee: 0, seats: null, seatsIncluded: null, seatMonthly: null }) })));
    expect(t).not.toMatch(PPL_MUSTER);
    expect(t).not.toMatch(VORAUS_MUSTER);
  });

  it("mit Vorauszahlung zur Wahl: Vorauszahlung im Angebot und in den AGB", () => {
    const t = plain(renderToStaticMarkup(createElement(OfferDocument, { offer: doc({ annualChoice: true, annualFreeMonths: 3 }) })));
    expect(t).toContain("Vorauszahlung: Ist sie vereinbart");
    expect(t).not.toMatch(PPL_MUSTER);
  });

  it("Pay-per-Lead + Software: Umsatzsteuer auf Leads bleibt, fortlaufend nummeriert", () => {
    const t = plain(
      renderToStaticMarkup(
        createElement(OfferDocument, {
          offer: doc({ package: "ppl_software", term: "none", products: [], setupFee: 0, monthlyFee: 99, softwareFee: 99, pplProductKey: "TKV-Katze", pplLabel: "TKV Katze", pplPrice: 17, pplQuantity: 20 }),
        }),
      ),
    );
    expect(t).toContain("§ 9 Umsatzsteuer auf Leads");
    expect(t).toContain("§ 17 Schlussbestimmungen");
    expect(t).not.toMatch(/Vorauszahlung: Ist sie vereinbart/);
  });
});

describe("Öffentliche Seite /rechtliches/agb", () => {
  it("vollständig, gegliedert je Paket, mit Hinweis oben", async () => {
    const html = renderToStaticMarkup(await AgbPage({ searchParams: Promise.resolve({}) }));
    const t = plain(html);
    expect(t).toContain("Welche Abschnitte für Sie gelten, steht in Ihrem Angebot.");
    expect(agbOeffentlichJePaket().map((p) => p.titel)).toEqual([
      "Betreuung + Software und Nur Betreuung",
      "Pay-per-Lead + Software",
      "Pay-per-Lead + Software: Kampagnen im eigenen Werbekonto",
      "Nur Leads",
    ]);
    for (const p of agbOeffentlichJePaket()) expect(html).toContain(`data-agb-paket="${p.id}"`);
    // Jeder Absatz der allgemeinen AGB steht auf der Seite (der frühere Absatz „Paket Pay-per-Lead + Software“ ist durch
    // den eigenen Teil des Pakets ersetzt), ebenso alle Abschnitte der Leadpakete und die Besonderen Bedingungen.
    const roh = html.replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    const alle = [...AGB, ...agbPplSoftware({ zugaenge: true, zusatzmodule: true }), ...AGB_NUR_LEADS, ...PPL_KUNDENKONTO_BEDINGUNGEN];
    for (const s of alle) {
      for (const it of s.items) {
        if (typeof it !== "string" && it.sub === "Paket Pay-per-Lead + Software" && s === AGB.find((x) => x.title === "Leistungen: Software")) {
          // im Paket „Kampagnen im eigenen Werbekonto“ steht er weiter
          expect(roh).toContain(it.text);
          continue;
        }
        expect(roh).toContain(typeof it === "string" ? it : it.text);
      }
    }
  });

  it("alte Links ?paket= zeigen nur das eine Paket", async () => {
    const t = plain(renderToStaticMarkup(await AgbPage({ searchParams: Promise.resolve({ paket: "ppl" }) })));
    expect(t).not.toContain("Welche Abschnitte für Sie gelten");
    expect(t).toContain("Paket „Nur Leads“");
  });
});

describe("Testphasen nur mit Testphase im Angebot (Ole, 27.11.2026)", () => {
  const titel = (o: Parameters<typeof agbDesAngebots>[0]) => agbDesAngebots(o).abschnitte.map((s) => s.title);
  const basis = { package: "software", createdAt: new Date("2026-11-26T12:00:00Z"), status: "draft" };
  it("ohne Startpreis und ohne kostenlosen Start: Abschnitt fällt weg (wie Haferstroh)", () => {
    expect(titel({ ...basis, introMonthlyFee: null, introMonths: null, billingFreeStart: false })).not.toContain("Testphasen und kostenlose Zeiträume");
  });
  it("kostenloser Start bis zum Abrechnungstag (wie Niehues) oder Startpreis: Abschnitt bleibt", () => {
    expect(titel({ ...basis, introMonthlyFee: null, introMonths: null, billingFreeStart: true })).toContain("Testphasen und kostenlose Zeiträume");
    expect(titel({ ...basis, introMonthlyFee: 0, introMonths: 2, billingFreeStart: false })).toContain("Testphasen und kostenlose Zeiträume");
  });
  it("ohne Angaben (öffentliche AGB) und bei angenommenen Angeboten ohne gespeichertes Merkmal: Abschnitt bleibt", () => {
    expect(agbFuerAngebot({ package: "software" }).agb.map((s) => s.title)).toContain("Testphasen und kostenlose Zeiträume");
    expect(titel({ ...basis, status: "accepted", introMonthlyFee: null, introMonths: null, billingFreeStart: false })).toContain("Testphasen und kostenlose Zeiträume");
  });
});

describe("Laufzeit und Gutschriften nur, wo sie gelten (Ole, 27.11.2026)", () => {
  const abschnitt = (o: Parameters<typeof agbDesAngebots>[0], t: string) => text(agbDesAngebots(o).abschnitte.filter((s) => s.title === t));
  const basis = { package: "software", createdAt: new Date("2026-11-26T12:00:00Z"), status: "draft" };
  it("ohne Laufzeit: nur der Satz ohne Laufzeit", () => {
    const t = abschnitt({ ...basis, term: "none" }, "Laufzeit und Kündigung");
    expect(t).toContain("Ohne Vertragslaufzeit ist der Vertrag");
    expect(t).not.toContain("Mit 3, 6 bzw. 12 Monaten Laufzeit");
  });
  it("feste Laufzeit: nur der Satz zur Mindestlaufzeit; zur Wahl: beide", () => {
    const fest = abschnitt({ ...basis, term: "12m" }, "Laufzeit und Kündigung");
    expect(fest).not.toContain("Ohne Vertragslaufzeit ist der Vertrag");
    expect(fest).toContain("Mit 3, 6 bzw. 12 Monaten Laufzeit");
    const wahl = abschnitt({ ...basis, term: "12m", customerChoosesTerm: true }, "Laufzeit und Kündigung");
    expect(wahl).toContain("Ohne Vertragslaufzeit ist der Vertrag");
    expect(wahl).toContain("Mit 3, 6 bzw. 12 Monaten Laufzeit");
  });
  it("Gutschriften für Leads nur mit Leads per Stück", () => {
    expect(abschnitt({ ...basis, term: "none" }, "Angebote vor einer Kündigung")).not.toContain("Gutschriften für fehlerhafte Leads");
    expect(abschnitt({ ...basis, term: "none" }, "Angebote vor einer Kündigung")).toContain("Ein Anspruch auf solche Angebote besteht nicht");
  });
});
