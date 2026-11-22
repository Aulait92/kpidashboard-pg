// Terminbestätigung bei Kfz bittet um Fahrzeugschein und letzte Rechnung (Ole, 22.11.2026)
import { describe, expect, it } from "vitest";
import { kfzUnterlagenSatz } from "@/lib/whatsapp/reminders";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

describe("kfzUnterlagenSatz", () => {
  it("beide Ansprachen, ohne Zeilenumbruch (Vorlagen-Feld), ohne Gedankenstriche", () => {
    const sie = kfzUnterlagenSatz("sie");
    const du = kfzUnterlagenSatz("du");
    expect(sie).toContain("Fahrzeugschein (Vorderseite)");
    expect(sie).toContain("letzten Rechnung Ihrer Kfz-Versicherung");
    expect(du).toContain("schick bitte");
    for (const t of [sie, du]) {
      expect(t).not.toMatch(/\n/);
      expect(hatGedankenstrich(t)).toBe(false);
    }
  });
  it("wird in der Bestätigung genutzt (Feld {{4}} und freier Text)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/whatsapp/reminders.ts", "utf8");
    expect(src).toContain("istKfzProdukt(lead?.source");
    expect(src).toContain("${kfz ?? prepHint(an)}");
  });
});
