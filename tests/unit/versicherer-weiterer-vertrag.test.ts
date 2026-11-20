import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { vertraegeAusText, versichererNachfrage, versichererZuordnen } from "@/lib/whatsapp/vorvertraege";

describe("Nachfrage Gesellschaft: Lead nennt stattdessen einen weiteren Vertrag („Und PKV“)", () => {
  it("„Und PKV“ ist ein weiterer Vertrag, keine Gesellschaft", () => {
    expect(versichererZuordnen(["Berufsunfähigkeit"], "Und PKV")).toEqual({});
    expect(vertraegeAusText("Und PKV").map((v) => v.sparte)).toEqual(["Private Krankenversicherung"]);
  });
  it("zweite Nachfrage nennt beide Sparten", () => {
    expect(versichererNachfrage(["Berufsunfähigkeit", "Private Krankenversicherung"], "sie", "Herr Kannapinn")).toBe(
      "Danke! Wissen Sie noch, bei welcher Gesellschaft die Berufsunfähigkeit und die private Krankenversicherung sind? Dann kann Herr Kannapinn gezielt vergleichen.",
    );
  });
  it("Strecke: ergänzt neue Verträge, höchstens zwei Nachfragen, letzte Nachfrage zählt", () => {
    const src = readFileSync("src/lib/whatsapp/termin-strecke.ts", "utf8");
    expect(src).toContain("const f = letzte(STRECKE.versichererFrage);");
    expect(src).toContain("neu.length && neueOhne.length && bisher < 2");
    expect(src).toContain("habe ich ergänzt.");
  });
});
