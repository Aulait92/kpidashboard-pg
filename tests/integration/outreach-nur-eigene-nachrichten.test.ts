// Erstanschreiben: nur Nachrichten vom Lead gelten als „schon im Gespräch“ (Ole, 22.11.2026, Defontaine)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Erstanschreiben nach korrigierter Nummer", () => {
  it("eigene, nicht zugestellte Nachrichten im Chat verhindern das Erstanschreiben nicht", () => {
    const src = readFileSync("src/lib/whatsapp/outreach.ts", "utf8");
    expect(src).toContain('_count: { select: { messages: { where: { direction: "inbound" } } } }');
  });
});
