// Modul „Empfehlungen & Bewertungen“ vorerst aus (Ole, 15.11.2026): aktive Kunden behalten es.
import { describe, expect, it } from "vitest";
import { EMPFEHLUNG_MODULE_AVAILABLE, empfehlungVisible } from "@/lib/empfehlung/shared";

describe("empfehlungVisible", () => {
  it("aus: nur sichtbar, wenn beim Kunden schon aktiv", () => {
    expect(EMPFEHLUNG_MODULE_AVAILABLE).toBe(false);
    expect(empfehlungVisible(false)).toBe(false);
    expect(empfehlungVisible(true)).toBe(true);
  });
});
