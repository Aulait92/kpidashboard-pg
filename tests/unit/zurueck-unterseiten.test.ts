import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Ole, 16.11.2026: Am Handy fehlte auf Unterseiten der Weg zurück. Jede Seite im Vermittlerbereich, die nicht in der
// unteren Navigation steht, hat oben links dasselbe „Zurück“ (PageHeader back=…, ZurueckLink).
const UNTERSEITEN: Record<string, string> = {
  "einstellungen": "/buyer",
  "einstellungen/branding": "/buyer/einstellungen",
  "einstellungen/erinnerungen": "/buyer/einstellungen",
  "einstellungen/meta": "/buyer/einstellungen",
  "einstellungen/assistent": "/buyer/einstellungen",
  "konto": "/buyer/einstellungen",
  "konto/sicherheit": "/buyer/einstellungen",
  "team": "/buyer/einstellungen",
  "kalender": "/buyer/einstellungen",
  "provisionen": "/buyer/einstellungen",
  "postfach": "/buyer/einstellungen",
  // WhatsApp-Vorlagen liegen seit 17.11.2026 unter Einstellungen → Assistent
  "vorlagen": "/buyer/einstellungen/assistent",
  "empfehlen": "/buyer/einstellungen",
  "neuigkeiten": "/buyer",
  "einfuehrung": "/buyer",
  "einrichtung": "/buyer",
  "hilfe/whatsapp": "/buyer/einrichtung",
  "bestellen": "/buyer/wachstum",
};

describe("Zurück auf Unterseiten des Vermittlerbereichs", () => {
  for (const [seite, ziel] of Object.entries(UNTERSEITEN)) {
    it(`/buyer/${seite} → ${ziel}`, () => {
      const src = readFileSync(join(process.cwd(), "src/app/buyer", seite, "page.tsx"), "utf8");
      expect(src).toContain(`<PageHeader back="${ziel}"`);
    });
  }

  it("PageHeader zeigt das Zurück über ZurueckLink", () => {
    const src = readFileSync(join(process.cwd(), "src/components/buyer-shell.tsx"), "utf8");
    expect(src).toMatch(/<ZurueckLink href=\{back\} back>/);
  });
});
