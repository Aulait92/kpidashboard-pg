// Datei-Auswahl (components/ui/file-drop.tsx): reine Helfer für Größe, Formate und Prüfung.
import { describe, expect, it } from "vitest";
import { acceptLabel, acceptTokens, fileHint, formatBytes, matchesAccept, MB, validateFile, validateFiles } from "@/lib/file-upload";

const f = (name: string, size = 1000, type = "") => ({ name, size, type });

describe("formatBytes", () => {
  it("zeigt KB und MB auf Deutsch", () => {
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(-5)).toBe("0 KB");
    expect(formatBytes(NaN)).toBe("0 KB");
    expect(formatBytes(100)).toBe("1 KB");
    expect(formatBytes(850 * 1024)).toBe("850 KB");
    expect(formatBytes(5 * MB)).toBe("5 MB");
    expect(formatBytes(1.5 * MB)).toBe("1,5 MB");
    expect(formatBytes(12.34 * MB)).toBe("12,3 MB");
  });
});

describe("accept", () => {
  it("zerlegt und benennt Formate", () => {
    expect(acceptTokens(" .PDF, application/pdf ,")).toEqual([".pdf", "application/pdf"]);
    expect(acceptTokens(undefined)).toEqual([]);
    expect(acceptLabel(".pdf,application/pdf")).toBe("PDF");
    expect(acceptLabel(".xlsx,.csv,.txt")).toBe("XLSX, CSV, TXT");
    expect(acceptLabel("image/png,image/jpeg,image/webp")).toBe("PNG, JPG, WebP");
    expect(acceptLabel(".pdf,.png,.jpg,.jpeg,.docx,.xlsx,application/pdf,image/png,image/jpeg")).toBe("PDF, PNG, JPG, DOCX, XLSX");
    expect(acceptLabel("image/*")).toBe("Bilder");
    expect(acceptLabel("")).toBe("");
  });

  it("prüft Endung, genauen Typ und Gruppe", () => {
    expect(matchesAccept(f("a.pdf", 1, "application/pdf"), ".pdf,application/pdf")).toBe(true);
    expect(matchesAccept(f("A.PDF"), ".pdf")).toBe(true);
    expect(matchesAccept(f("scan.pdf", 1, ""), "application/pdf")).toBe(true); // Typ aus der Endung
    expect(matchesAccept(f("a.docx", 1, "application/msword"), ".pdf,application/pdf")).toBe(false);
    expect(matchesAccept(f("pdf"), ".pdf")).toBe(false);
    expect(matchesAccept(f("bild.heic", 1, "image/heic"), "image/*")).toBe(true);
    expect(matchesAccept(f("bild.heic", 1, "image/heic"), "image/png,image/jpeg")).toBe(false);
    expect(matchesAccept(f("liste.csv", 1, "application/vnd.ms-excel"), ".csv,text/csv")).toBe(true);
    expect(matchesAccept(f("egal.xyz"), "")).toBe(true);
  });
});

describe("validateFile / validateFiles", () => {
  const pdf = { accept: ".pdf,application/pdf", maxBytes: 5 * MB };

  it("klare Meldungen für Format, Größe und leere Dateien", () => {
    expect(validateFile(f("e.pdf", 2 * MB, "application/pdf"), pdf)).toBeNull();
    expect(validateFile(f("e.docx", 1000), pdf)).toBe("„e.docx“ hat ein anderes Format. Möglich: PDF.");
    expect(validateFile(f("gross.pdf", 12.3 * MB, "application/pdf"), pdf)).toBe("„gross.pdf“ ist zu groß (12,3 MB). Höchstens 5 MB.");
    expect(validateFile(f("leer.pdf", 0), pdf)).toBe("„leer.pdf“ ist leer.");
    expect(validateFile(f("bild.png", 1_600_000, "image/png"), { accept: "image/png", maxBytes: 1_500_000, maxLabel: "1,5 MB" })).toBe(
      "„bild.png“ ist zu groß (1,5 MB). Höchstens 1,5 MB.",
    );
    expect(validateFile(f("x.bin", 10), { accept: "application/x-unbekannt" })).toBe("„x.bin“ hat ein Format, das hier nicht geht.");
  });

  it("Hinweistext", () => {
    expect(fileHint(pdf)).toBe("PDF, höchstens 5 MB");
    expect(fileHint({ accept: ".csv" })).toBe("CSV");
    expect(fileHint({})).toBe("");
  });

  it("mehrere Dateien: passende behalten, Fehler sammeln", () => {
    const rules = { accept: "image/png,image/jpeg", maxBytes: 8 * MB, multiple: true };
    const r = validateFiles([f("a.png", 10, "image/png"), f("b.gif", 10, "image/gif"), f("c.jpg", 9 * MB, "image/jpeg")], rules);
    expect(r.ok.map((x) => x.name)).toEqual(["a.png"]);
    expect(r.errors).toHaveLength(2);

    expect(validateFiles([f("a.pdf", 1), f("b.pdf", 1)], { accept: ".pdf" })).toEqual({ ok: [], errors: ["Bitte nur eine Datei auswählen."] });

    const many = validateFiles([f("1.pdf"), f("2.pdf"), f("3.pdf")], { accept: ".pdf", multiple: true, maxFiles: 2 });
    expect(many.ok.map((x) => x.name)).toEqual(["1.pdf", "2.pdf"]);
    expect(many.errors).toEqual(["Höchstens 2 Dateien auf einmal."]);
  });
});
