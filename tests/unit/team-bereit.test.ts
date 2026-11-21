// Lead-Verteilung erst nach Kalender und App (Ole, 21.11.2026)
import { describe, expect, it } from "vitest";
import { bereitFuerLeads, wartetText } from "@/lib/team-bereit";

describe("Team: bereit für Leads", () => {
  it("Inhaber immer, Berater erst mit Kalender und App", () => {
    expect(bereitFuerLeads({ owner: true, kalender: false, push: false })).toEqual({ bereit: true, fehlt: [] });
    expect(bereitFuerLeads({ owner: false, kalender: false, push: false }).fehlt).toEqual(["kalender", "app"]);
    expect(bereitFuerLeads({ owner: false, kalender: true, push: false })).toEqual({ bereit: false, fehlt: ["app"] });
    expect(bereitFuerLeads({ owner: false, kalender: true, push: true }).bereit).toBe(true);
  });
  it("Hinweis in der Teamliste", () => {
    expect(wartetText(["kalender", "app"])).toBe("bekommt Leads nach: Kalender verbinden, App aufs Handy mit Mitteilungen");
    expect(wartetText([])).toBeNull();
  });
});
