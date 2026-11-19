// Komplettcheck: einmalige Nachfrage nach den Gesellschaften, wenn zu genannten Sparten der Versicherer fehlt
// (lib/whatsapp/vorvertraege.ts, Ole 19.11.2026). Erkennung ohne KI (Rückfall vertraegeAusText) und Zuordnung der Antwort.
import { describe, expect, it } from "vitest";
import { fehlendeVersicherer, vertraegeAusText, versichererAlle, versichererAus, versichererNachfrage, versichererZuordnen } from "@/lib/whatsapp/vorvertraege";

const nachfrage = (text: string, an: "sie" | "du" = "sie", person = "Herr Kannapinn") => versichererNachfrage(fehlendeVersicherer(vertraegeAusText(text)), an, person);

describe("Versicherer erkennen", () => {
  it("Kurzformen und volle Namen", () => {
    expect(versichererAus("SI")).toBe("Signal Iduna");
    expect(versichererAus("bei der Signal")).toBe("Signal Iduna");
    expect(versichererAus("Signal Iduna")).toBe("Signal Iduna");
    expect(versichererAus("huk")).toBe("HUK-Coburg");
    expect(versichererAus("HUK-Coburg")).toBe("HUK-Coburg");
    expect(versichererAus("bei der Sparkasse")).toBe("Sparkasse");
    expect(versichererAus("R+V")).toBe("R+V");
    expect(versichererAus("Württembergische")).toBe("Württembergische");
    expect(versichererAus("Alte Leipziger")).toBe("Alte Leipziger");
    for (const [t, n] of [["ERGO", "ERGO"], ["AXA", "AXA"], ["Provinzial", "Provinzial"], ["DEVK", "DEVK"], ["Gothaer", "Gothaer"], ["Debeka", "Debeka"], ["LVM", "LVM"], ["VHV", "VHV"], ["Zurich", "Zurich"], ["Generali", "Generali"], ["Barmenia", "Barmenia"], ["Continentale", "Continentale"], ["Nürnberger", "Nürnberger"], ["HanseMerkur", "HanseMerkur"], ["Uelzener", "Uelzener"], ["Agila", "Agila"], ["Petplan", "Petplan"]])
      expect(versichererAus(t), t).toBe(n);
  });

  it("Tippfehler", () => {
    expect(versichererAus("Signal Idnua")).toBe("Signal Iduna");
    expect(versichererAus("Allainz")).toBe("Allianz");
    expect(versichererAus("bei der Allinaz")).toBe("Allianz");
    expect(versichererAus("Gotaher")).toBe("Gothaer");
  });

  it("keine Fehltreffer in normalen Wörtern", () => {
    for (const t of ["Haftpflicht und Hausrat", "generell alles", "ich allein", "weiß nicht", "keine Ahnung", "Rechtsschutz"]) expect(versichererAlle(t), t).toEqual([]);
  });
});

describe("Nachfrage nach den Gesellschaften", () => {
  it("„Haftpflicht und Hausrat“: Nachfrage mit beiden", () => {
    expect(nachfrage("Haftpflicht und Hausrat")).toBe("Danke! Wissen Sie noch, bei welcher Gesellschaft die Haftpflicht und die Hausrat sind? Dann kann Herr Kannapinn gezielt vergleichen.");
    expect(nachfrage("Haftpflicht und Hausrat", "du", "Ole")).toBe("Danke! Weißt du noch, bei welcher Gesellschaft die Haftpflicht und die Hausrat sind? Dann kann Ole gezielt vergleichen.");
  });

  it("„Haftpflicht bei der Signal Iduna“: keine Nachfrage", () => {
    expect(vertraegeAusText("Haftpflicht bei der Signal Iduna")).toEqual([{ sparte: "Haftpflicht", gesellschaft: "Signal Iduna", fuer: null }]);
    expect(nachfrage("Haftpflicht bei der Signal Iduna")).toBeNull();
    expect(nachfrage("Haftpflicht bei der Signal Idnua, Hausrat Allainz")).toBeNull();
  });

  it("„Kfz bei HUK, Hausrat“: Nachfrage nur Hausrat", () => {
    expect(nachfrage("Kfz bei HUK, Hausrat")).toBe("Danke! Wissen Sie noch, bei welcher Gesellschaft die Hausrat ist? Dann kann Herr Kannapinn gezielt vergleichen.");
  });

  it("drei mit Namen, mehr als drei allgemein", () => {
    expect(nachfrage("Haftpflicht, Hausrat, Kfz")).toBe("Danke! Wissen Sie noch, bei welcher Gesellschaft die Haftpflicht, die Hausrat und die Kfz sind? Dann kann Herr Kannapinn gezielt vergleichen.");
    expect(nachfrage("Haftpflicht, Hausrat, Kfz, Rechtsschutz")).toBe("Danke! Wissen Sie noch, bei welchen Gesellschaften die Verträge sind? Dann kann Herr Kannapinn gezielt vergleichen.");
    expect(nachfrage("Haftpflicht, Hausrat, Kfz, Rechtsschutz", "du", "Ole")).toBe("Danke! Weißt du noch, bei welchen Gesellschaften die Verträge sind? Dann kann Ole gezielt vergleichen.");
  });

  it("keine Verträge: keine Nachfrage; ohne Gedankenstriche", () => {
    expect(nachfrage("keine")).toBeNull();
    for (const t of ["Haftpflicht", "Haftpflicht und Hausrat", "Haftpflicht, Hausrat, Kfz, Rechtsschutz"]) for (const an of ["sie", "du"] as const) expect(nachfrage(t, an)).not.toMatch(/[–—]/);
  });
});

describe("Antwort auf die Nachfrage zuordnen", () => {
  const beide = ["Haftpflicht", "Hausrat"] as const;
  it("je Sparte, ein Name für alle, Reihenfolge", () => {
    expect(versichererZuordnen(beide, "Haftpflicht bei der Allianz, Hausrat bei der HUK")).toEqual({ Haftpflicht: "Allianz", Hausrat: "HUK-Coburg" });
    expect(versichererZuordnen(beide, "beide bei der Signal Iduna")).toEqual({ Haftpflicht: "Signal Iduna", Hausrat: "Signal Iduna" });
    expect(versichererZuordnen(beide, "Allianz und HUK")).toEqual({ Haftpflicht: "Allianz", Hausrat: "HUK-Coburg" });
    expect(versichererZuordnen(beide, "Hausrat Allainz, Haftpflicht weiß ich nicht")).toEqual({ Hausrat: "Allianz" });
  });
  it("weiß nicht bzw. nichts erkannt: leer (weiter ohne zweite Frage)", () => {
    expect(versichererZuordnen(beide, "weiß nicht")).toEqual({});
    expect(versichererZuordnen(beide, "keine Ahnung")).toEqual({});
    expect(versichererZuordnen(["Hausrat"], "weiß ich nicht")).toEqual({});
  });
  it("unbekannte Gesellschaft bei einer offenen Sparte", () => {
    expect(versichererZuordnen(["Hausrat"], "bei der Gartenbau-Versicherung")).toEqual({ Hausrat: "Gartenbau-Versicherung" });
  });
});
