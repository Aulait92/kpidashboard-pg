import { describe, expect, it } from "vitest";
import { nextPrefix, phoneDigitsKey, phoneDigitsWhere, phoneMatches, phoneQuery } from "@/lib/telefonsuche";

// Telefonsuche (Ole, 16.11.2026): Schlüssel und Suchbedingung ohne Datenbank.
describe("Telefonsuche", () => {
  const SCHREIBWEISEN = ["+49 152 58142143", "0049 152 58142143", "0152-581 42 143", "015258142143", "(0152) 581/42143", "+49 (0) 152 581 42 143", "4915258142143", "0152.581.42.143"];

  it("jede Schreibweise ergibt denselben gespeicherten Schlüssel", () => {
    for (const s of SCHREIBWEISEN) expect(phoneDigitsKey(s), s).toBe("15258142143");
    expect(phoneDigitsKey("+43 664 1234567")).toBe("436641234567");
    expect(phoneDigitsKey("123")).toBeNull();
  });

  it("jede Schreibweise als Suche passt auf die Nummer", () => {
    for (const s of SCHREIBWEISEN) {
      const q = phoneQuery(s);
      expect(q, s).not.toBeNull();
      expect(phoneMatches(q!, "+4915258142143"), s).toBe(true);
      expect(phoneMatches(q!, "+4915258142144"), s).toBe(false);
    }
  });

  it("Endziffern ab 5 Ziffern, Anfang mit Vorwahl", () => {
    expect(phoneQuery("42143")).toEqual({ key: "42143", mode: "end" });
    expect(phoneMatches(phoneQuery("42143")!, "0152 58142143")).toBe(true);
    expect(phoneMatches(phoneQuery("42144")!, "0152 58142143")).toBe(false);
    expect(phoneQuery("0152 581")).toEqual({ key: "152581", mode: "start", tail: "0152581" });
    // Endziffern mit führender 0: auch als Ende gesucht
    expect(phoneMatches(phoneQuery("020978")!, "0170 20020978")).toBe(true);
    expect(phoneQuery("0209")).toBeNull();
    expect(phoneQuery("0152 58142143")).toEqual({ key: "15258142143", mode: "start" });
    expect(phoneMatches(phoneQuery("0152 581")!, "+49 152 58142143")).toBe(true);
    expect(phoneQuery("4214")).toBeNull();
    expect(phoneQuery("+49 15")).toBeNull();
  });

  it("keine Telefonsuche bei Text", () => {
    expect(phoneQuery("Müller 0152")).toBeNull();
    expect(phoneQuery("max@0152.de")).toBeNull();
    expect(phoneQuery("")).toBeNull();
  });

  it("Bereich für den Index", () => {
    expect(nextPrefix("15258")).toBe("15259");
    expect(nextPrefix("1529")).toBe("153");
    expect(nextPrefix("999")).toBeNull();
    expect(phoneDigitsWhere({ key: "15258", mode: "start" })).toEqual({ phoneDigits: { gte: "15258", lt: "15259", startsWith: "15258" } });
    // Endziffern über die umgekehrten Ziffern: 42143 → 34124
    expect(phoneDigitsWhere({ key: "42143", mode: "end" })).toEqual({ phoneDigitsRev: { gte: "34124", lt: "34125", startsWith: "34124" } });
  });
});
