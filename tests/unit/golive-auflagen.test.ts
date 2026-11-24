// Go-live-Prüfung Kundenbereich 19.11.2026: Name in der Erstinformation (B1), gewählter Versicherer (W1),
// Branding der Präsentation (W1/W7), „Versicherungsvermittlerin“ (Kleinpunkt 2), Diagnose erstinfo-namen.
import { describe, expect, it } from "vitest";
import { erstinfoDaten, erstinfoName, wirktWieFirma } from "@/lib/erstinformation-shared";
import { markeFuer } from "@/lib/praesentation";
import { vermittlerBeruf } from "@/lib/vermittler-nennung";
import { erstinfoMailZeile } from "@/lib/calendar/lead-email";
import { erstinfoNameGruende } from "@/lib/ops/erstinfo-namen";

describe("B1 Vor- und Nachname in der Erstinformation", () => {
  it("nie der Firmenname als Person, Inhaber-Login als Vorschlag, sonst leer", () => {
    expect(erstinfoName(null, null, "Versicherungsbüro Sonnberg")).toBe("");
    expect(erstinfoName(null, null, "Versicherungsbüro Sonnberg", "Petra Sonnberg")).toBe("Petra Sonnberg");
    expect(erstinfoName(null, null, "Versicherungsbüro Sonnberg", "petra@example.com")).toBe("");
    expect(erstinfoName(null, { representative: "Susanne Meier" }, "Agentur Meier", "Petra Sonnberg")).toBe("Susanne Meier");
    expect(erstinfoName("S. Meier", null, "Agentur Meier", "Petra Sonnberg")).toBe("S. Meier");
    expect(erstinfoDaten(null, null, { name: "Versicherungsbüro Sonnberg", vermittlerTyp: "vertreter" }).name).toBe("");
    expect(erstinfoDaten(null, null, { name: "Versicherungsbüro Sonnberg", vermittlerTyp: "vertreter", inhaberName: "Petra Sonnberg" }).name).toBe("Petra Sonnberg");
  });

  it("Firmenwörter und Versicherermarken erkennen", () => {
    for (const n of ["Versicherungsbüro Sonnberg", "Meier GmbH", "Allianz Max Berger", "Agentur Lohmann", "Finanzkanzlei Huber"]) expect(wirktWieFirma(n)).toBe(true);
    for (const n of ["Petra Sonnberg", "Max Berger", "Anna-Lena Groß"]) expect(wirktWieFirma(n)).toBe(false);
  });

  it("Diagnose: Gründe ohne Klarnamen", () => {
    expect(erstinfoNameGruende("Versicherungsbüro Sonnberg", "Versicherungsbüro Sonnberg")).toEqual(["gleich_kundenname", "firmenwort"]);
    expect(erstinfoNameGruende("Max Berger", "Allianz Max Berger")).toEqual(["kundenname_ohne_zusatz"]);
    expect(erstinfoNameGruende("Petra Sonnberg", "Versicherungsbüro Sonnberg")).toEqual([]);
    expect(erstinfoNameGruende("", "X")).toEqual([]);
  });
});

describe("W1 gewählter Versicherer", () => {
  it("Vertreter: Gesellschaft aus der Einrichtung vor dem Kundennamen, Gespeichertes vor beidem", () => {
    expect(erstinfoDaten(null, null, { name: "Allianz Max Berger", vermittlerTyp: "vertreter", gesellschaften: ["generali"] }).versicherer).toEqual(["Generali"]);
    expect(erstinfoDaten(null, null, { name: "Allianz Max Berger", vermittlerTyp: "vertreter" }).versicherer).toEqual(["Allianz"]);
    expect(erstinfoDaten({ versicherer: ["ERGO Versicherung AG"] }, null, { name: "X", vermittlerTyp: "vertreter", gesellschaften: ["generali"] }).versicherer).toEqual(["ERGO Versicherung AG"]);
    expect(erstinfoDaten(null, null, { name: "X", vermittlerTyp: "makler", gesellschaften: ["generali"] }).versicherer).toEqual([]);
  });

  it("Präsentation: Design nach gewählter Gesellschaft, Absender aus der Erstinformation", () => {
    const generali = markeFuer({ name: "Agentur Berger", markenText: "Allianz Max Berger", gesellschaft: "generali", vermittlerTyp: "vertreter" });
    expect(generali).toMatchObject({ name: "Agentur Berger", gesellschaft: null });
    expect(markeFuer({ name: "Agentur Berger", gesellschaft: "axa", vermittlerTyp: "vertreter" }).gesellschaft).toBe("AXA");
    expect(markeFuer({ name: "Allianz Max Berger", vermittlerTyp: "vertreter" }).gesellschaft).toBe("Allianz");
    expect(markeFuer({ name: "Agentur Berger", markenText: "Allianz Max Berger", vermittlerTyp: "vertreter" }).gesellschaft).toBe("Allianz");
  });
});

describe("Kleinpunkt: Versicherungsvermittlerin", () => {
  it("bei „Frau …“ die weibliche Form", () => {
    expect(vermittlerBeruf("Frau Sonnberg")).toBe("Versicherungsvermittlerin");
    expect(vermittlerBeruf("Herrn Berger")).toBe("Versicherungsvermittler");
    expect(vermittlerBeruf("Petra Sonnberg")).toBe("Versicherungsvermittler");
    expect(erstinfoMailZeile("sie", "Frau Sonnberg")).toContain("als Versicherungsvermittlerin (PDF)");
  });
});
