// AGB ohne Garantien (Ole, 26.11.2026): öffentliche AGB und neue Angebote ohne Abschnitt „Garantien“, Verträge aus
// Angeboten vor GUARANTEES_UNTIL behalten die archivierte Fassung „Stand 25.11.2026“ mit Garantien.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

vi.mock("@/app/angebot/[token]/actions", () => ({ acceptOfferAction: async () => ({}) }));

import { OfferDocument, type OfferDoc } from "@/components/offer-document";
import { AGB, agbFuerAngebot, LEGAL_VERSION } from "@/lib/legal-texts";
import { AGB_2026_11_25, AGB_ARCHIV_STAND, agbMitGarantien } from "@/lib/agb-2026-11-25";
import { GUARANTEES_UNTIL } from "@/lib/garantien";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");

const doc = (o: Partial<OfferDoc> = {}): OfferDoc => ({
  number: "PG-2026-0172",
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
  products: [{ name: "Katzenversicherung (TKV)", dailyBudget: 30 }],
  setupFee: 990,
  monthlyFee: 1000,
  softwareFee: 349,
  introMonthlyFee: null,
  introMonths: null,
  specialTerms: null,
  startDate: new Date("2027-01-01T12:00:00Z"),
  validUntil: new Date("2026-12-10T12:00:00Z"),
  createdAt: new Date("2026-11-26T14:49:00Z"),
  acceptedAt: null,
  acceptedName: null,
  termsUrl: "https://app.example/rechtliches/agb",
  dpaUrl: "https://app.example/rechtliches/avv",
  seats: 1,
  seatsIncluded: 3,
  seatMonthly: 49,
  bestandMonthly: null,
  annualPrepay: false,
  annualFreeMonths: 3,
  annualChoice: false,
  ...o,
});

describe("Öffentliche AGB ohne Garantien", () => {
  it("neuer Stand 26.11.2026", () => {
    expect(LEGAL_VERSION).toBe("26.11.2026");
  });

  it("kein Abschnitt „Garantien“ und kein Hinweis darauf, Nummern fortlaufend", () => {
    expect(AGB.map((s) => s.title)).not.toContain("Garantien");
    expect(JSON.stringify(AGB)).not.toMatch(/garanti/i);
    expect(AGB.map((s) => s.title)).toEqual([
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
    ]);
  });

  it("alle Varianten (Leadangebote, eigenes Werbekonto) ohne Garantien", () => {
    for (const o of [{ package: "ppl" }, { package: "ppl_software" }, { package: "ppl_software", kundenkonto: true }, { package: "software" }, { package: "service" }]) {
      expect(JSON.stringify(agbFuerAngebot(o).agb)).not.toMatch(/garanti/i);
    }
  });

  it("die Seite /rechtliches/agb verlinkt die archivierte Fassung nicht", () => {
    expect(readFileSync("src/app/rechtliches/agb/page.tsx", "utf8")).not.toMatch(/agb-2026-11-25|AGB_2026_11_25/);
  });
});

describe("Archivierte Fassung „Stand 25.11.2026“", () => {
  it("unveränderter Abschnitt „Garantien“ an alter Stelle (§ 11)", () => {
    expect(AGB_ARCHIV_STAND).toBe("25.11.2026");
    const i = AGB_2026_11_25.findIndex((s) => s.title === "Garantien");
    expect(i + 1).toBe(11);
    const g = AGB_2026_11_25[i];
    const subs = g.items.flatMap((it) => (typeof it === "string" ? [] : [it.sub]));
    expect(subs).toEqual([
      "Gemeinsame Voraussetzungen",
      "Wahrgenommene Termine",
      "Lead-Garantie",
      "Break-even-Garantie (Vertreter mit Abschlussprovision)",
      "Vertrags-Garantie (Makler, statt Break-even)",
      "Übergang",
    ]);
    expect(String(g.items[0])).toContain("vor dem 22.11.2026, 19:15 Uhr");
  });

  it("sonst gleiche Abschnitte wie die aktuellen AGB", () => {
    expect(AGB_2026_11_25.filter((s) => s.title !== "Garantien").map((s) => s.title)).toEqual(AGB.map((s) => s.title));
  });

  it("gilt für Angebote vor GUARANTEES_UNTIL (erste Version), nicht für Leadangebote", () => {
    const vorher = new Date(GUARANTEES_UNTIL.getTime() - 60_000);
    const nachher = new Date(GUARANTEES_UNTIL.getTime() + 60_000);
    expect(agbMitGarantien({ package: "software", createdAt: vorher })).toBe(true);
    expect(agbMitGarantien({ package: "service", createdAt: vorher })).toBe(true);
    expect(agbMitGarantien({ package: "software", createdAt: nachher })).toBe(false);
    expect(agbMitGarantien({ package: "software", createdAt: nachher, garantieStichtag: vorher })).toBe(true);
    expect(agbMitGarantien({ package: "ppl_software", createdAt: vorher })).toBe(false);
    expect(agbMitGarantien({ package: "ppl", createdAt: vorher })).toBe(false);
  });
});

describe("Angebotsdokument (Seite und PDF)", () => {
  it("neues Angebot (z. B. PG-2026-0172 vom 26.11.2026, 15:49 Uhr): kein Garantie-Abschnitt, aktuelle AGB ohne Garantien", () => {
    const t = text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc() })));
    expect(t).not.toMatch(/garanti/i);
    expect(t).not.toContain(`Stand ${AGB_ARCHIV_STAND}`);
    expect(t).toContain("§ 11 Datenschutz");
  });

  it("neues Angebot mit Sondervereinbarung: Garantie nur im Angebotstext (2.2), kein Verweis auf AGB-Abschnitt", () => {
    const t = text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc({ specialTerms: "Lead-Garantie: vollständiger Text hier." }) })));
    expect(t).toContain("2.2 Sondervereinbarung");
    expect(t).not.toMatch(/Abschnitt „Garantien“/);
    expect(t).not.toMatch(/§ \d+ Garantien/);
  });

  it("altes Angebot mit Garantie: Verweis zeigt auf den Abschnitt in der archivierten Fassung", () => {
    const alt = doc({ status: "accepted", createdAt: new Date("2026-11-20T10:00:00Z"), acceptedAt: new Date("2026-11-21T10:00:00Z"), acceptedName: "Test Kunde" });
    const t = text(renderToStaticMarkup(createElement(OfferDocument, { offer: alt })));
    expect(t).toContain("2.2 Ihre Garantien");
    expect(t).toContain("Details in den AGB (Abschnitt „Garantien“)");
    expect(t).toContain(`Allgemeine Geschäftsbedingungen (AGB, Stand ${AGB_ARCHIV_STAND})`);
    expect(t).toContain("§ 11 Garantien");
    expect(t).toContain("Gemeinsame Voraussetzungen:");
    expect(t).toContain("Übergang:");
  });

  it("neue Version eines alten Angebots (garantieStichtag) behält die archivierte Fassung", () => {
    const v2 = { ...doc({ version: 2 }), garantieStichtag: new Date("2026-11-20T10:00:00Z") } as OfferDoc;
    const t = text(renderToStaticMarkup(createElement(OfferDocument, { offer: v2 })));
    expect(t).toContain("§ 11 Garantien");
  });
});

describe("Verlinkung", () => {
  it("Annahme-Link alter Angebote und Konto & Rechnungen zeigen auf /angebot/[token]/agb", () => {
    expect(readFileSync("src/app/angebot/[token]/page.tsx", "utf8")).toMatch(/agbMitGarantien\(offer\) \? `\/angebot\/\$\{token\}\/agb`/);
    const konto = readFileSync("src/app/buyer/konto/page.tsx", "utf8");
    expect(konto).toMatch(/offer\.status === "accepted" && agbMitGarantien\(offer\)/);
    expect(konto).toContain("Ihre AGB (Stand {AGB_ARCHIV_STAND})");
    const seite = readFileSync("src/app/angebot/[token]/agb/page.tsx", "utf8");
    expect(seite).toMatch(/if \(!agbMitGarantien\(offer\)\) redirect\("\/rechtliches\/agb"\)/);
    expect(seite).toMatch(/index: false/);
  });
});
