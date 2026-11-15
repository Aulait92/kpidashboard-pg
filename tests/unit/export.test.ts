// Datenexport: CSV für Excel (Formel-Schutz, Semikolon, BOM).
import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/export/csv";

describe("CSV", () => {
  it("maskiert Trennzeichen und Anführungszeichen, schützt vor Formeln, lässt Telefonnummern", () => {
    expect(csvCell('Müller; "Max"')).toBe('"Müller; ""Max"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("@SUM")).toBe("'@SUM");
    expect(csvCell("-x")).toBe("'-x");
    expect(csvCell("+4915112345678")).toBe("+4915112345678");
    expect(csvCell(-12.5)).toBe("-12.5");
    expect(csvCell(null)).toBe("");
    expect(csvCell(true)).toBe("ja");
    expect(csvCell(new Date("2026-11-15T10:00:00Z"))).toBe("15.11.2026");
  });
  it("Kopfzeile, BOM, CRLF", () => {
    const s = toCsv(["A", "B"], [["1", "zwei\nZeilen"]]);
    expect(s.startsWith("﻿A;B\r\n1;")).toBe(true);
    expect(s).toContain('"zwei\nZeilen"');
  });
});
