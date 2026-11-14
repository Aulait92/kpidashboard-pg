// Keine Gedankenstriche in Texten an Leads, Bestandskunden und Kunden (Ole, 14.11.2026, AGENTS.md).
// 1. Der Helfer ersetzt korrekt. 2. Wächter: neue Gedankenstriche in festen Texten außerhalb des
//    Admin-Bereichs fallen im Test auf (Kommentare, Bis-Striche zwischen Zahlen und „–“ als Platzhalter erlaubt).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hatGedankenstrich, ohneGedankenstriche } from "@/lib/gedankenstriche";

describe("ohneGedankenstriche", () => {
  it("ersetzt Gedankenstriche, lässt Bis-Striche und Platzhalter", () => {
    expect(ohneGedankenstriche("Hallo Frau Weber – kurze Frage")).toBe("Hallo Frau Weber, kurze Frage");
    expect(ohneGedankenstriche("Termin in 1–3 Tagen, 9 – 12 Uhr")).toBe("Termin in 1–3 Tagen, 9–12 Uhr");
    expect(ohneGedankenstriche("Gut — danke!")).toBe("Gut, danke!");
    expect(ohneGedankenstriche("Ende –.")).toBe("Ende.");
    expect(ohneGedankenstriche("– Punkt eins\n– Punkt zwei")).toBe("• Punkt eins\n• Punkt zwei");
    expect(ohneGedankenstriche("–")).toBe("–");
    expect(hatGedankenstrich("1–3 Tage")).toBe(false);
    expect(hatGedankenstrich("Hallo – Sie")).toBe(true);
  });
});

// Interne Dateien: Admin-Bereich, KI-Prompts (Ausgabe wird bereinigt), Parser für Airtable-Felder
const ALLOW = [
  "src/app/admin/",
  "src/components/admin/",
  "src/generated/",
  "src/lib/gedankenstriche.ts",
  "src/lib/linkedin/text.ts",
  "src/lib/creative-gen.ts",
  "src/lib/airtable.ts",
  "src/lib/linkedin/drafts.ts",
  "src/lib/mail/text-pdf.ts",
];
// Erlaubt: Code statt Text, Regeln für die KI, die Gedankenstriche gerade verbieten, Suchmuster (Zeichenklassen)
const LINE_OK = /console\.|RegExp|\.replace\(|\.test\(|\.match\(|\.split\(|\.indexOf\(|\.join\(|\/\[|reportError|throw new Error|Gedankenstrich|\\-–/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

describe("Wächter: keine Gedankenstriche in festen Texten", () => {
  it("außerhalb des Admin-Bereichs", () => {
    const hits: string[] = [];
    for (const p of files("src")) {
      const rel = p.replace(/\\/g, "/");
      if (ALLOW.some((a) => rel.startsWith(a) || rel === a)) continue;
      readFileSync(p, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const t = line.trim();
          if (!/[–—]/.test(t) || /^(\/\/|\*|\/\*|\{\/\*)/.test(t) || LINE_OK.test(line)) return;
          const code = line
            .replace(/\s\/\/\s.*$/, "")
            // Bis-Striche: Zahlen, Wochentage (Mo–Sa) und eingesetzte Werte (1–${n}, ${von}–${bis}, 31.12.–${d})
            .replace(/\d\s?[–—]\s?\d/g, "")
            .replace(/\b(Mo|Di|Mi|Do|Fr|Sa|So)–(Mo|Di|Mi|Do|Fr|Sa|So)\b/g, "")
            .replace(/[\d}.)]\s?–\s?\$\{/g, "")
            .replace(/\}\s?–\s?[\d$]/g, "")
            .replace(/(["'`>{(])\s*[–—]\s*(["'`<})])/g, "$1$2");
          if (/[–—]/.test(code)) hits.push(`${rel}:${i + 1}: ${t.slice(0, 120)}`);
        });
    }
    expect(hits, `Gedankenstriche gefunden (Komma, Doppelpunkt oder neuer Satz verwenden):\n${hits.join("\n")}`).toEqual([]);
  });
});
