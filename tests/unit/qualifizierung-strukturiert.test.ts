import { describe, expect, it } from "vitest";
import {
  cleanQualificationData,
  mergeQualificationData,
  qualificationLines,
  qualificationPoints,
} from "@/lib/whatsapp/qualification";

describe("Qualifizierung strukturiert", () => {
  it("behält nur bekannte, nicht leere Punkte und kürzt Leerraum", () => {
    expect(
      cleanQualificationData({ lebenssituation: "  Alleinerziehend ", interesse: ["Unfall", "Haftpflicht"], foo: "x", kinder: "", wunsch: 3 }),
    ).toEqual({ lebenssituation: "Alleinerziehend", interesse: "Unfall, Haftpflicht" });
    expect(cleanQualificationData(null)).toEqual({});
    expect(cleanQualificationData("Text")).toEqual({});
    expect(cleanQualificationData(["a"])).toEqual({});
  });

  it("neue Angaben ergänzen die bisherigen, leer ergibt null", () => {
    expect(mergeQualificationData({ lebenssituation: "Single", interesse: "Hausrat" }, { interesse: "Hausrat, Haftpflicht", wunsch: "Videocall" })).toEqual({
      lebenssituation: "Single",
      interesse: "Hausrat, Haftpflicht",
      wunsch: "Videocall",
    });
    expect(mergeQualificationData(null, {})).toBeNull();
  });

  it("zeigt die Punkte in fester Reihenfolge mit Beschriftung", () => {
    const data = { wunsch: "Videocall", kinder: "Sohn, 9", vorhanden: "Haftpflicht (über 10 Jahre alt)", interesse: "Unfall, Haftpflicht", lebenssituation: "Alleinerziehend" };
    expect(qualificationPoints(data).map((p) => `${p.label}: ${p.value}`)).toEqual([
      "Lebenssituation: Alleinerziehend",
      "Interesse: Unfall, Haftpflicht",
      "Vorhanden: Haftpflicht (über 10 Jahre alt)",
      "Kinder: Sohn, 9",
      "Wunsch: Videocall",
    ]);
    expect(qualificationLines({ wunsch: "Telefon" })).toBe("Wunsch: Telefon");
  });
});
