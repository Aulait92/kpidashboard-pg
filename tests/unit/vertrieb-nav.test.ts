// Vertriebs-Navigation zeigt nur existierende Seiten (Ole, 14.11.2026: LinkedIn, Empfehlungen, Unterlagen liegen unter Marketing).
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LINKS } from "@/components/vertrieb/nav";

describe("Vertriebs-Navigation", () => {
  it("jeder Reiter hat eine Seite", () => {
    for (const l of LINKS) expect(existsSync(`src/app${l.href}/page.tsx`), l.href).toBe(true);
  });
  it("keine Marketing-Reiter mehr im Vertrieb", () => {
    expect(LINKS.map((l) => l.label)).not.toEqual(expect.arrayContaining(["LinkedIn"]));
    expect(LINKS.some((l) => /linkedin|empfehlungen|unterlagen/.test(l.href))).toBe(false);
  });
});
