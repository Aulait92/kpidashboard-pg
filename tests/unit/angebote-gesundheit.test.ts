import { describe, expect, it } from "vitest";
import { gesundheitsFehler, gesundheitsSparten, istGesundheitsSparte } from "@/lib/angebote";

describe("Gesundheitssparten nach dem Auslesen (Art. 9 DSGVO)", () => {
  it("erkennt Kranken, Zahn, BU, Leben, Pflege, Krankentagegeld usw.", () => {
    for (const s of [
      "Krankenzusatz",
      "Private Krankenversicherung",
      "PKV",
      "Zahnzusatz",
      "Zahnzusatzversicherung",
      "Berufsunfähigkeit",
      "BU",
      "BUZ",
      "Dienstunfähigkeit",
      "Erwerbsunfähigkeit",
      "Grundfähigkeit",
      "Risikoleben",
      "Lebensversicherung",
      "Pflegezusatz",
      "Pflegetagegeld",
      "Krankentagegeld",
      "Krankenhaustagegeld",
      "Sterbegeld",
      "Dread Disease",
      "Schwere Krankheiten",
    ])
      expect(istGesundheitsSparte(s), s).toBe(true);
  });

  it("lässt Sach-, Haftpflicht-, Rechtsschutz-, Unfall- und Tierangebote durch", () => {
    for (const s of ["Hausrat", "Privathaftpflicht", "Rechtsschutz", "Wohngebäude", "Unfall", "Tierkranken", "Hunde-OP", "Katzenkrankenversicherung", "Tierhalterhaftpflicht", "Kfz", "Glas"])
      expect(istGesundheitsSparte(s), s).toBe(false);
  });

  it("prüft Sparte und Tarifname, meldet jede Sparte einmal", () => {
    expect(gesundheitsSparten([{ sparte: "Hausrat", tarif: "Komfort" }])).toEqual([]);
    expect(gesundheitsSparten([{ sparte: "Zusatzversicherung", tarif: "ZahnPrivat Premium" }])).toEqual(["Zusatzversicherung"]);
    expect(gesundheitsSparten([{ sparte: "Zahnzusatz" }, { sparte: "Zahnzusatz", tarif: "Plus" }, { sparte: "Hausrat" }])).toEqual(["Zahnzusatz"]);
    const text = gesundheitsFehler(["Zahnzusatz"]);
    expect(text).toBe("Angebote mit Gesundheitsangaben (Zahnzusatz) lesen wir nicht aus, bitte tragen Sie sie von Hand ein.");
    expect(text).not.toMatch(/[–—]/);
  });
});
