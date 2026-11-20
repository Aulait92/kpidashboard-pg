// Umsatzsteuer beim Leadverkauf (Ole, 20.11.2026; lib/ppl/steuer.ts, lib/ppl/erste-woche-shared.ts)
import { describe, expect, it } from "vitest";
import {
  bestellBetrag,
  bezugSteuer,
  bruttoJeLead,
  effektiveSteuer,
  nettoAusBrutto,
  standardSteuer,
  steuerCent,
  STEUERFREI_RECHNUNGSHINWEIS,
  vermittlerGeprueft,
} from "@/lib/ppl/steuer";
import { ersteWocheAus, ersteWocheBetrag, ersteWocheMenge } from "@/lib/ppl/erste-woche-shared";
import { steuerfreiFooter } from "@/lib/billing";

const geprueft = { vermittlerRegisterNr: "D-ABCD-12345-67", vermittlerRegisterStatus: "makler", vermittlerGeprueftAt: new Date("2026-11-20") };

describe("Steuerkennzeichen je Produkt", () => {
  it("Versicherungssparten sind steuerfrei, Kindersparplan und Unbekanntes steuerpflichtig", () => {
    for (const p of ["PKV-Tarifoptimierung", "Wechsel", "Neugeschäft", "TKV-Katze", "Hundekrankenversicherung", "TKV-Pferd", "Privatschutz", "Sterbegeld", "Zahnzusatz", "Krankenhauszusatz"]) {
      expect(standardSteuer(p), p).toBe("steuerfrei_4_11");
    }
    for (const p of ["Kindersparplan", "Kindersparpläne", "Kinderwunsch", "Solar"]) expect(standardSteuer(p), p).toBe("steuerpflichtig");
  });

  it("Kindersparplan bleibt steuerpflichtig, auch wenn am Bezug steuerfrei steht", () => {
    expect(bezugSteuer({ productKey: "Kindersparplan", steuer: "steuerfrei_4_11" })).toBe("steuerpflichtig");
    expect(effektiveSteuer({ productKey: "Kindersparplan", steuer: "steuerfrei_4_11" }, geprueft).steuer).toBe("steuerpflichtig");
  });

  it("eigene Einstellung am Bezug geht vor dem Standard", () => {
    expect(bezugSteuer({ productKey: "TKV-Katze", steuer: "steuerpflichtig" })).toBe("steuerpflichtig");
    expect(bezugSteuer({ productKey: "Solar", steuer: "steuerfrei_4_11" })).toBe("steuerfrei_4_11");
    expect(bezugSteuer({ productKey: "TKV-Katze", steuer: "quatsch" })).toBe("steuerfrei_4_11");
  });
});

describe("steuerfrei nur mit geprüftem Vermittlerstatus", () => {
  const sub = { productKey: "PKV-Tarifoptimierung" };
  it("ohne Prüfung, mit Status keiner, ohne Nummer oder ohne Datum: 19 %", () => {
    expect(effektiveSteuer(sub, null).steuer).toBe("steuerpflichtig");
    expect(effektiveSteuer(sub, { vermittlerRegisterNr: "D-ABCD-12345-67" }).steuer).toBe("steuerpflichtig"); // nur angegeben, zu prüfen
    expect(effektiveSteuer(sub, { ...geprueft, vermittlerRegisterStatus: "keiner" }).steuer).toBe("steuerpflichtig");
    expect(effektiveSteuer(sub, { ...geprueft, vermittlerRegisterNr: "12345" }).steuer).toBe("steuerpflichtig");
    expect(effektiveSteuer(sub, { ...geprueft, vermittlerGeprueftAt: null }).steuer).toBe("steuerpflichtig");
    expect(vermittlerGeprueft({ ...geprueft, vermittlerRegisterStatus: "berater" })).toBe(false);
  });
  it("geprüfter Vertreter oder Makler: steuerfrei", () => {
    expect(effektiveSteuer(sub, geprueft).steuer).toBe("steuerfrei_4_11");
    expect(effektiveSteuer(sub, { ...geprueft, vermittlerRegisterStatus: "vertreter", vermittlerRegisterNr: "d abcd 12345 67" }).steuer).toBe("steuerfrei_4_11");
  });
  it("Händler wie Pivacom oder Convexa (Status keiner): 19 %, mit Grund", () => {
    const r = effektiveSteuer(sub, { vermittlerRegisterStatus: "keiner", vermittlerGeprueftAt: new Date() });
    expect(r.steuer).toBe("steuerpflichtig");
    expect(r.grund).toContain("kein Vertreter");
  });
});

describe("Beträge: Anzeige = Abbuchung", () => {
  it("steuerfrei: 17,00 € je Lead, brutto = netto", () => {
    expect(bruttoJeLead(17, "steuerfrei_4_11")).toBe(17);
    const b = bestellBetrag({ price: 17, quantity: 20, credit: 0, steuer: "steuerfrei_4_11" });
    expect(b).toMatchObject({ netto: 340, steuerBetrag: 0, brutto: 340 });
    expect(b.lines).toEqual([{ description: "20 Leads", amountEur: 340 }]);
  });
  it("steuerpflichtig: 19 % je Position gerundet, Gutschrift als eigene Position", () => {
    const b = bestellBetrag({ price: 45, quantity: 10, credit: 90, steuer: "steuerpflichtig" });
    expect(b.lines.map((l) => l.amountEur)).toEqual([450, -90]);
    expect(b.netto).toBe(360);
    expect(b.steuerBetrag).toBe(68.4);
    expect(b.brutto).toBe(428.4);
    // Summe der Positionen wie Stripe: je Position netto + gerundete Steuer
    const stripe = b.lines.reduce((n, l) => n + Math.round(l.amountEur * 100) + steuerCent(Math.round(l.amountEur * 100), "steuerpflichtig"), 0) / 100;
    expect(stripe).toBe(b.brutto);
  });
  it("Gutschrift höchstens bis 0", () => {
    const b = bestellBetrag({ price: 10, quantity: 5, credit: 80, steuer: "steuerpflichtig" });
    expect(b.gutschrift).toBe(50);
    expect(b.brutto).toBe(0);
  });
  it("Kindersparplan: 65 € brutto kalkuliert → 54,62 € netto, je Lead wieder 65,00 €", () => {
    expect(nettoAusBrutto(65)).toBe(54.62);
    expect(bruttoJeLead(54.62, "steuerpflichtig")).toBe(65);
    // Rundung bei Mengen (bekannt, Ole entscheidet): 20 Leads = 1.299,96 €
    expect(bestellBetrag({ price: 54.62, quantity: 20, credit: 0, steuer: "steuerpflichtig" }).brutto).toBe(1299.96);
  });
});

describe("Rechnungshinweis", () => {
  it("Fuß beginnt mit dem Pflichthinweis § 4 Nr. 11 UStG", () => {
    expect(STEUERFREI_RECHNUNGSHINWEIS).toBe("Steuerfreie Leistung nach § 4 Nr. 11 UStG");
    expect(steuerfreiFooter("Ole Kannapinn UG")).toBe("Steuerfreie Leistung nach § 4 Nr. 11 UStG.\nOle Kannapinn UG");
  });
});

describe("erste Woche im Angebot", () => {
  it("nur Paket ppl_software mit Produkt und Preis", () => {
    expect(ersteWocheAus({ package: "software", pplProductKey: "TKV-Katze", pplPrice: 17 })).toBeNull();
    expect(ersteWocheAus({ package: "ppl_software", pplProductKey: "", pplPrice: 17 })).toBeNull();
    expect(ersteWocheAus({ package: "ppl_software", pplProductKey: "TKV-Katze", pplPrice: 17, pplQuantity: null })).toEqual({ productKey: "TKV-Katze", label: null, price: 17, quantity: 20 });
  });
  it("Menge ab 5, Betrag nach Kennzeichen des Produkts", () => {
    expect(ersteWocheMenge(4)).toBeNull();
    expect(ersteWocheMenge("5")).toBe(5);
    expect(ersteWocheBetrag({ productKey: "PKV-Tarifoptimierung", price: 17 }, 20).brutto).toBe(340);
    expect(ersteWocheBetrag({ productKey: "Kindersparplan", price: 54.62 }, 5).brutto).toBe(324.99);
  });
});
