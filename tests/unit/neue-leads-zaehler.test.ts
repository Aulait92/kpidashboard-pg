import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { istWartenderNeuerLead } from "@/lib/neue-leads-shared";

// Ole, 19.11.2026 („3x ja“): Zähler an Kontakte = Karte „Neue Leads“ auf Heute, „Nächste Tage“ zugeklappt,
// Benachrichtigungs-Hinweis als schmale Zeile ohne Primärknopf.
const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("Neue Leads: eine Regel für Heute und den Zähler an Kontakte", () => {
  it("nur Leads, die auf den Vermittler warten (urgent), nicht die vom Assistenten betreuten", () => {
    expect(istWartenderNeuerLead({ urgent: true })).toBe(true);
    expect(istWartenderNeuerLead({ urgent: false })).toBe(false);
    expect(istWartenderNeuerLead({})).toBe(false);
  });

  it("Heute und Navigation nutzen dieselbe Funktion", () => {
    expect(src("src/components/today-inbox.tsx")).toContain("calls.filter(istWartenderNeuerLead)");
    const layout = src("src/app/buyer/layout.tsx");
    expect(layout).toContain("wartendeNeueLeads(ctx)");
    expect(layout).not.toMatch(/reached: false/);
    expect(src("src/lib/inbox.ts")).toContain("callbackLeadsFor(ctx)");
  });
});

describe("Heute: Nächste Tage zugeklappt", () => {
  it("als <details> ohne open", () => {
    const s = src("src/components/today-inbox.tsx");
    expect(s).toMatch(/<details data-upcoming className=/);
    expect(s).not.toMatch(/<details data-upcoming open/);
  });
});

describe("Hinweis „Benachrichtigungen einschalten“", () => {
  it("schmale Zeile ohne großen Primärknopf", () => {
    const s = src("src/components/push-prompt.tsx");
    expect(s).toContain("data-push-hint");
    expect(s).not.toContain('variant="primary"');
  });
});
