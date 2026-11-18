// „Weiteres Produkt per Klick anbieten“ (Ole, 18.11.2026): Texte und Schalter (lib/cross-sell-verkauf.ts)
import { describe, expect, it } from "vitest";
import { BESTAND_MODULE_AVAILABLE } from "@/lib/bestand/sichtbar";
import { crossSellLeisteText, crossSellNutzenSatz, crossSellVerkaufAn, istCrossSellAufgabe } from "@/lib/cross-sell-verkauf";
import { inSegment, naheliegendesThema } from "@/lib/bestand/campaigns";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

describe("Weiteres Produkt per Klick anbieten", () => {
  it("hinter demselben Schalter wie das Modul, nur für den Inhaber", () => {
    expect(crossSellVerkaufAn("owner")).toBe(BESTAND_MODULE_AVAILABLE);
    expect(crossSellVerkaufAn("owner", false)).toBe(false);
    expect(crossSellVerkaufAn("advisor", true)).toBe(false);
    expect(crossSellVerkaufAn("owner", true)).toBe(true);
  });
  it("Texte: Zahl, Schnitt nur wenn bekannt, ohne Preis, Garantie oder Gedankenstrich", () => {
    expect(crossSellLeisteText(12)).toBe("12 Kunden ohne weiteres Produkt");
    expect(crossSellLeisteText(1)).toBe("1 Kunde ohne weiteres Produkt");
    const mit = crossSellNutzenSatz(12, 480.4);
    expect(mit).toBe("Mit dem Bestandskunden-Modul bieten Sie diesen 12 Kunden mit einem Klick ein weiteres Produkt an, bisher bringt Ihnen ein Vertrag im Schnitt 480 € Provision.");
    expect(crossSellNutzenSatz(1, null)).toBe("Mit dem Bestandskunden-Modul bieten Sie diesem Kunden mit einem Klick ein weiteres Produkt an.");
    for (const t of [mit, crossSellNutzenSatz(3, null)]) {
      expect(hatGedankenstrich(t)).toBe(false);
      expect(t).not.toMatch(/Garantie|garantiert/i);
    }
  });
  it("Wiedervorlage erkennen (auch mit Zusatz)", () => {
    expect(istCrossSellAufgabe("Weiteres Produkt anbieten?")).toBe(true);
    expect(istCrossSellAufgabe("Weiteres Produkt anbieten? Naheliegend: Haftpflicht")).toBe(true);
    expect(istCrossSellAufgabe("Police da?")).toBe(false);
    expect(istCrossSellAufgabe(null)).toBe(false);
  });
  it("Segment „ohne weiteres Produkt“: nur Kunden aus den gefundenen Kontakten", () => {
    const now = new Date();
    const c = { lines: ["Hausrat"], birthday: null, nextRenewal: null, leadId: "l1" };
    expect(inSegment(c, "cross_sell", { ohneWeiteresProdukt: true, leadIds: ["l1"] }, now)).toBe(true);
    expect(inSegment(c, "cross_sell", { ohneWeiteresProdukt: true, leadIds: ["l2"] }, now)).toBe(false);
    expect(inSegment({ ...c, leadId: null }, "cross_sell", { ohneWeiteresProdukt: true, leadIds: ["l1"] }, now)).toBe(false);
    expect(inSegment(c, "cross_sell", {}, now)).toBe(true);
  });
  it("Thema je Kunde: naheliegende Ergänzung, sonst Absicherung", () => {
    expect(naheliegendesThema(["KFZ"], null)).toBe("Privathaftpflicht");
    expect(naheliegendesThema(["KFZ", "Haftpflicht"], null)).toBe("Hausrat");
    expect(naheliegendesThema(["KFZ"], new Set(["KFZ", "Rechtsschutz"]))).toBe("Rechtsschutz");
    expect(naheliegendesThema(["Sonstiges"], null)).toBe("Absicherung");
  });
});
