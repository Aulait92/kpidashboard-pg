// Usability-Check 25.11.2026: nach von, mit, bei, an (Dativ) und für (Akkusativ) heißt es „Herrn Jung“.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gebeugt } from "@/lib/ansprache";

describe("gebeugt", () => {
  it("macht aus „Herr“ „Herrn“, „Frau“ und Namen ohne Anrede bleiben", () => {
    expect(gebeugt("Herr Jung")).toBe("Herrn Jung");
    expect(gebeugt("Frau Becker")).toBe("Frau Becker");
    expect(gebeugt("Max Herrmann")).toBe("Max Herrmann");
    expect(gebeugt("Herrmann")).toBe("Herrmann");
    expect(gebeugt("Herrn Jung")).toBe("Herrn Jung");
    expect(gebeugt(null)).toBeNull();
    expect(gebeugt(undefined)).toBeUndefined();
    expect(`Abschluss mit ${gebeugt("Herr Jung")}`).toBe("Abschluss mit Herrn Jung");
  });

  it("Abschluss-Blatt: Titel, Hinweis und Meldungen gebeugt, nach dem Speichern „Schließen“ statt „Abbrechen“", () => {
    const s = readFileSync(path.resolve(__dirname, "../../src/components/abschluss-nachher.tsx"), "utf8");
    expect(s).not.toMatch(/\b(mit|von|an|bei|für) \$\{stand\.label\}/);
    expect(s).toContain("Abschluss mit ${gebeugt(stand.label)}");
    expect(s).toMatch(/Abschluss gespeichert` : ""\} schliessenText="Schließen"/);
  });

  it("keine ungebeugten Kontaktnamen nach Präposition in den bekannten Fenstern", () => {
    const stellen: [string, RegExp][] = [
      ["src/components/today-inbox.tsx", /Termin mit \$\{o\.name\}/],
      ["src/components/call-outcome.tsx", /mit \$\{t\.name\}/],
      ["src/components/lead-booking.tsx", /Termin mit \$\{target\.name\}/],
      ["src/components/next-step.tsx", /Wiedervorlage für \$\{name\}/],
      ["src/lib/komplettcheck-dauer.ts", /Komplettcheck mit \$\{name\}/],
    ];
    for (const [datei, alt] of stellen) {
      expect(readFileSync(path.resolve(__dirname, "../..", datei), "utf8"), datei).not.toMatch(alt);
    }
  });
});
