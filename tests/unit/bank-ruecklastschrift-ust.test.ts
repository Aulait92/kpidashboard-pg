// Rücklastschriften, USt-Verdacht und Steuerberater-Zeile (Ole, 25.11.2026)
import { describe, expect, it } from "vitest";
import { bankNetto, classify, endToEndRef, istRuecklastschrift, netCost, ruecklastschriftPaare, ustVerdacht } from "@/lib/bank/rules";
import { betriebGroup, bwaZeile, istSteuerberater } from "@/lib/bwa";
import { groupSmallBetrieb, type BwaItem } from "@/lib/bwa-shared";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const LS = "GC RE PHDRMUELLERSTBG";

describe("Rücklastschriften", () => {
  const lastschrift = { id: "l1", accountKey: "k", bookingDate: d("2026-05-04"), amount: -297.5, counterparty: LS, purpose: "Lastschrift PM-123 End-to-End-Ref.: D-AB12CD34 Mandatsref: X" };
  const rueck = { id: "r1", accountKey: "k", bookingDate: d("2026-05-08"), amount: 297.5, counterparty: LS, purpose: "Rückgabegrund: MD06 Rückgabe auf Verlangen End-to-End-Ref.: D-AB12CD34" };
  const andere = { id: "l2", accountKey: "k", bookingDate: d("2026-05-06"), amount: -297.5, counterparty: LS, purpose: "End-to-End-Ref.: D-ZZ99" };

  it("erkennt Rückbuchung und End-to-End-Referenz; Entgelt der Bank bleibt Kosten", () => {
    expect(istRuecklastschrift(rueck)).toBe(true);
    expect(istRuecklastschrift({ amount: -1.9, purpose: "BENACHRICHTIGUNGSENTGELT RUECKGABE VON LASTSCHRIFTEN" })).toBe(false);
    expect(istRuecklastschrift({ amount: 100, purpose: "Rechnung 12" })).toBe(false);
    expect(endToEndRef(rueck.purpose)).toBe("D-AB12CD34");
    expect(endToEndRef("End-to-End-Ref.: NOTPROVIDED")).toBeNull();
    expect(classify(rueck, []).reason).toBe("Rücklastschrift");
    expect(classify({ amount: 50, purpose: "Kunde zahlt" }, []).reason).toBe("Einnahme");
  });

  it("paart über die Referenz, nicht über die zeitlich nähere Lastschrift gleicher Höhe", () => {
    const p = ruecklastschriftPaare([lastschrift, andere, rueck]);
    expect(p).toHaveLength(1);
    expect(p[0].lastschrift?.id).toBe("l1");
    expect(p[0].ueber).toBe("referenz");
  });

  it("ohne Referenz: gleiches Konto, Betrag, Gegenpartei bis 14 Tage; sonst ohne Lastschrift", () => {
    const ohne = { ...rueck, purpose: "Rückgabegrund: AC04" };
    const l = { ...lastschrift, purpose: "Lastschrift" };
    expect(ruecklastschriftPaare([l, ohne])[0]).toMatchObject({ lastschrift: { id: "l1" }, ueber: "betrag" });
    expect(ruecklastschriftPaare([{ ...l, bookingDate: d("2026-03-01") }, ohne])[0].lastschrift).toBeNull();
  });
});

describe("USt", () => {
  it("297,50 → 250,00 und 160,65 → 135,00 netto bei inkl. USt; Beleg geht vor", () => {
    expect(netCost(-297.5, true)).toBe(250);
    expect(netCost(-160.65, true)).toBe(135);
    expect(bankNetto(-297.5, false, { netto: 250, brutto: 297.5, waehrung: "EUR" })).toEqual({ netto: 250, laut: "beleg" });
    expect(bankNetto(-297.5, false, null)).toEqual({ netto: 297.5, laut: "schaetzung" });
  });

  it("Verdacht: Steuerberater ohne USt ja; Google Cloud EMEA, Versicherung, Bankentgelt, inkl. USt nein", () => {
    expect(ustVerdacht({ action: "betrieb", vatIncluded: false, pattern: "gc re phdrmuellerstbg" }, ["GoCardless Ltd"]).verdacht).toBe(true);
    expect(ustVerdacht({ action: "betrieb", vatIncluded: false, pattern: "x", label: "Steuerberater" }).verdacht).toBe(true);
    expect(ustVerdacht({ action: "software", vatIncluded: false, pattern: "google cloud emea" }).verdacht).toBe(false);
    expect(ustVerdacht({ action: "betrieb", vatIncluded: false, pattern: "allianz versicherung" }).verdacht).toBe(false);
    expect(ustVerdacht({ action: "betrieb", vatIncluded: false, pattern: "kontoführung" }).verdacht).toBe(false);
    expect(ustVerdacht({ action: "betrieb", vatIncluded: true, pattern: "steuerberater" }).verdacht).toBe(false);
    expect(ustVerdacht({ action: "ignore", vatIncluded: false, pattern: "finanzamt" }).verdacht).toBe(false);
  });
});

describe("BWA-Zeile Steuerberater", () => {
  it("Lastschrift, Überweisung, nur im Verwendungszweck, andere Kostenart", () => {
    expect(bwaZeile({ costPurpose: "betrieb", counterparty: LS, purpose: null })).toBe("betrieb:Steuerberater");
    expect(bwaZeile({ costPurpose: "betrieb", counterparty: "PhDr. Mueller Treuhand GmbH", purpose: "RE 2026-041" })).toBe("betrieb:Steuerberater");
    expect(bwaZeile({ costPurpose: "betrieb", counterparty: "PhDr. Müller Treuhand", purpose: null })).toBe("betrieb:Steuerberater");
    expect(bwaZeile({ costPurpose: "betrieb", counterparty: "GoCardless Ltd", purpose: "gc re phdrmuellerstbg pm-1" })).toBe("betrieb:Steuerberater");
    expect(bwaZeile({ costPurpose: "software", counterparty: LS, purpose: null })).toBe("betrieb:Steuerberater");
    expect(bwaZeile({ costPurpose: "software", counterparty: "Vercel", purpose: null })).toBe("direkt:software");
    expect(betriebGroup("Standardregel", "Telekom", "Rechnung")).toBe("Telekom");
    expect(istSteuerberater("Steuerberater Jahresabschluss")).toBe(true);
  });

  it("kleiner Steuerberater-Posten wird nie zu „Sonstiges“", () => {
    const it_ = (line: string, net: number): BwaItem => ({ month: "2026-10", line, label: line, net });
    const g = groupSmallBetrieb([it_("betrieb:Miete", 10000), it_("betrieb:Steuerberater", 5), it_("betrieb:A", 1), it_("betrieb:B", 1)], ["2026-10"]);
    expect(g.map((i) => i.line)).toEqual(["betrieb:Miete", "betrieb:Steuerberater", "betrieb:Sonstiges", "betrieb:Sonstiges"]);
  });
});
