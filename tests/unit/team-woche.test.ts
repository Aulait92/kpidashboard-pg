import { describe, expect, it } from "vitest";
import { teamWocheInhalt, vorwoche } from "@/lib/team-woche";

// Ole, 27.11.2026: Wochen-Mail „Ihr Team diese Woche“ an Inhaber mit Team
describe("Wochen-Mail Team", () => {
  it("Vorwoche: Montag bis Sonntag vor dem Montag", () => {
    const w = vorwoche(new Date("2026-11-30T07:30:00Z")); // Montag
    expect(w.montag).toBe("2026-11-30");
    expect(w.bis.toISOString()).toBe("2026-11-29T23:00:00.000Z");
    expect(w.von.toISOString()).toBe("2026-11-22T23:00:00.000Z");
  });
  it("Inhalt: Summen, je Person sortiert, Anrufliste bei fälligen Wiedervorlagen", () => {
    const w = vorwoche(new Date("2026-11-30T07:30:00Z"));
    const m = teamWocheInhalt(
      [
        { name: "Niemand zugeteilt", anrufe: 0, termine: 0, neueLeads: 2, faellig: 1 },
        { name: "Lisa Kern", anrufe: 1, termine: 0, neueLeads: 3, faellig: 4 },
        { name: "Max Berger", anrufe: 7, termine: 2, neueLeads: 5, faellig: 0 },
      ],
      { ...w, appUrl: "https://app.example" },
    );
    expect(m.subject).toBe("Ihr Team diese Woche: 8 Anrufe, 2 Termine");
    expect(m.list[0]).toBe("Max Berger: 7 Anrufe eingetragen, 2 Termine, 5 neue Leads");
    expect(m.list[1]).toBe("Lisa Kern: 1 Anruf eingetragen, 0 Termine, 3 neue Leads, 4 Wiedervorlagen fällig");
    expect(m.list[2]).toContain("Niemand zugeteilt");
    expect(m.paragraphs[0]).toContain("23.11. bis 29.11.");
    expect(m.button.url).toBe("https://app.example/buyer?anrufliste=1");
    expect(JSON.stringify(m)).not.toMatch(/[–—]/);
  });
});
