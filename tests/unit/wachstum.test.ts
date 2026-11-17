// „Rechnet sich das?“ auf Wachstum (Ole, 18.11.2026): Ergebnis, Balken, fehlende Abschlüsse und Antwortsätze.
import { describe, expect, it } from "vitest";
import { abschluesseBisBreakEven, antwort, euroMitVorzeichen, rechnetSich } from "@/lib/wachstum";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

describe("abschluesseBisBreakEven", () => {
  it("aufgerundet, Spanne 1, mindestens 1", () => {
    expect(abschluesseBisBreakEven(1261, 1167)).toEqual({ von: 1, bis: 2 });
    expect(abschluesseBisBreakEven(400, 1167)).toEqual({ von: 1, bis: 2 });
    expect(abschluesseBisBreakEven(2334, 1167)).toEqual({ von: 1, bis: 2 });
    expect(abschluesseBisBreakEven(5000, 1000)).toEqual({ von: 4, bis: 5 });
    expect(abschluesseBisBreakEven(5001, 1000)).toEqual({ von: 5, bis: 6 });
    expect(abschluesseBisBreakEven(0, 1000)).toBeNull();
    expect(abschluesseBisBreakEven(500, null)).toBeNull();
  });
});

describe("rechnetSich", () => {
  it("noch nicht: Entwurf (2.514 + 987 − 4.762)", () => {
    const r = rechnetSich({ provision: 2514, bestand: 987, kosten: 4762, mitBestand: true, kunden: 3 });
    expect(r).toMatchObject({ status: "noch_nicht", ergebnis: -1261, fehlend: 1261, wertProKunde: 1167, abschluesse: { von: 1, bis: 2 }, ueberschuss: null });
    expect(Math.round(r.gedeckt * 100)).toBe(74);
    expect(Math.round(r.balken.provision * 100)).toBe(53);
    expect(Math.round(r.balken.offen * 100)).toBe(26);
    expect(r.ausEinemEuro!.toFixed(2)).toBe("0.74");
    const a = antwort(r, { kunden: 3, vertraege: 4, chancen: 6, mitBestand: true });
    expect(a.titel).toBe("Noch nicht ganz: 1 bis 2 Abschlüsse fehlen bis zum Break-even.");
    expect(a.text).toBe("3 neue Kunden mit 4 Verträgen haben 74 % Ihrer Kosten schon eingespielt. Dazu warten 6 offene Chancen auf Sie.");
  });
  it("lohnt sich: Gewinn grün, Überschuss über den Kosten, Euro-Satz mit bzw. ohne Bestand", () => {
    const r = rechnetSich({ provision: 5410, bestand: 1970, kosten: 4762, mitBestand: true, kunden: 6 });
    expect(r).toMatchObject({ status: "lohnt", ergebnis: 2618, wertProKunde: 1230, abschluesse: null, gedeckt: 1 });
    expect(Math.round(r.ueberschuss! * 100)).toBe(55);
    expect(r.balken.offen).toBe(0);
    const a = antwort(r, { kunden: 6, vertraege: 8, chancen: 4, mitBestand: true });
    expect([a.titel, a.betont, a.rest]).toEqual(["Ja:", "+ 2.618 € Gewinn", "aus diesem Zeitraum."]);
    expect(a.text).toBe("6 neue Kunden mit 8 Verträgen. Jeder eingesetzte Euro hat Ihnen 1,55 € gebracht, inklusive Bestand.");
    const nur = rechnetSich({ provision: 5410, bestand: 1970, kosten: 4762, mitBestand: false, kunden: 6 });
    expect(nur.ergebnis).toBe(648);
    expect(antwort(nur, { kunden: 6, vertraege: 8, chancen: 0, mitBestand: false }).text).toBe("6 neue Kunden mit 8 Verträgen. Jeder eingesetzte Euro hat Ihnen 1,14 € gebracht.");
  });
  it("„Nur Abschlussprovision“ rechnet ohne Bestand", () => {
    const r = rechnetSich({ provision: 2514, bestand: 987, kosten: 4762, mitBestand: false, kunden: 3 });
    expect(r).toMatchObject({ ergebnis: -2248, wertProKunde: 838, abschluesse: { von: 2, bis: 3 } });
    expect(r.balken.bestand).toBe(0);
  });
  it("ohne Kunden im Zeitraum: Wert aus früheren Abschlüssen, Satz ohne Kunden", () => {
    const r = rechnetSich({ provision: 0, bestand: 0, kosten: 3000, mitBestand: true, kunden: 0, wertProKundeBisher: 900 });
    expect(r).toMatchObject({ wertProKunde: 900, wertAusFrueher: true, abschluesse: { von: 3, bis: 4 } });
    expect(antwort(r, { kunden: 0, vertraege: 0, chancen: 1, mitBestand: true }).text).toBe("In diesem Zeitraum gibt es noch keinen Abschluss. Dazu wartet 1 offene Chance auf Sie.");
    const ohneWert = rechnetSich({ provision: 0, bestand: 0, kosten: 3000, mitBestand: true, kunden: 0 });
    expect(antwort(ohneWert, { kunden: 0, vertraege: 0, chancen: 0, mitBestand: true }).titel).toBe("Noch nicht ganz: Es fehlen noch 3.000 € bis zum Break-even.");
  });
  it("ohne Kosten: kein Break-even, klare Aussage", () => {
    const r = rechnetSich({ provision: 800, bestand: 0, kosten: 0, mitBestand: true, kunden: 1 });
    expect(r).toMatchObject({ status: "ohne_kosten", ausEinemEuro: null, abschluesse: null });
    expect(antwort(r, { kunden: 1, vertraege: 1, chancen: 0, mitBestand: true }).text).toBe("Für diesen Zeitraum sind noch keine Kosten erfasst.");
    expect(antwort(rechnetSich({ provision: 0, bestand: 0, kosten: 0, mitBestand: true, kunden: 0 }), { kunden: 0, vertraege: 0, chancen: 0, mitBestand: true }).titel).toBe(
      "Noch keine Zahlen für diesen Zeitraum.",
    );
  });
  it("Vorzeichen mit echtem Minus, keine Gedankenstriche in den Sätzen", () => {
    expect(euroMitVorzeichen(-1261)).toBe("− 1.261 €");
    expect(euroMitVorzeichen(2618)).toBe("+ 2.618 €");
    for (const [i, c] of [
      [{ provision: 100, bestand: 0, kosten: 5000, mitBestand: true, kunden: 1 }, { kunden: 1, vertraege: 1, chancen: 1, mitBestand: true }],
      [{ provision: 9000, bestand: 0, kosten: 5000, mitBestand: true, kunden: 1 }, { kunden: 1, vertraege: 1, chancen: 1, mitBestand: true }],
    ] as const) {
      const a = antwort(rechnetSich(i), c);
      expect(hatGedankenstrich(`${a.titel} ${a.betont ?? ""} ${a.rest} ${a.text}`)).toBe(false);
    }
    expect(antwort(rechnetSich({ provision: 100, bestand: 0, kosten: 5000, mitBestand: true, kunden: 1 }), { kunden: 1, vertraege: 1, chancen: 1, mitBestand: true }).text).toBe(
      "1 neuer Kunde mit 1 Vertrag hat 2 % Ihrer Kosten schon eingespielt. Dazu wartet 1 offene Chance auf Sie.",
    );
  });
});
