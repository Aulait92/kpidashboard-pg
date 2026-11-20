// Meta-Freigabe (Ole, 20.11.2026): Der Kunde hat unserem Business freigegeben, unser Systemnutzer sieht das Asset aber
// erst nach der Zuweisung. Erkennen, ob das Asset bei uns angekommen ist, und ehrlich „angekommen“ statt Fehler zeigen.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { assetInListe, FREIGABE_ANGEKOMMEN, istBerechtigungsfehler, SYSTEMNUTZER_AUFGABEN } from "@/lib/selbst-einrichtung";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

describe("Freigabe angekommen", () => {
  it("findet das Werbekonto mit und ohne act_ sowie die Seite", () => {
    expect(assetInListe("adAccount", "837321052753778", [{ id: "act_1" }, { id: "act_837321052753778" }])).toBe(true);
    expect(assetInListe("adAccount", "837321052753778", [{ id: "act_9", account_id: "837321052753778" }])).toBe(true);
    expect(assetInListe("adAccount", "837321052753778", [{ id: "act_837321052753779" }])).toBe(false);
    expect(assetInListe("page", "910306212158285", [{ id: "910306212158285" }])).toBe(true);
    expect(assetInListe("page", "910306212158285", [])).toBe(false);
  });
  it("nur Berechtigungsfehler lösen das Nachziehen aus", () => {
    expect(istBerechtigungsfehler("(#100) Unsupported get request. Object with ID 'act_1' does not exist, cannot be loaded due to missing permissions")).toBe(true);
    expect(istBerechtigungsfehler("Ad account owner has NOT grant ads_management or ads_read permission")).toBe(true);
    expect(istBerechtigungsfehler("HTTP 500")).toBe(false);
  });
  it("Texte für den Kunden: Sie-Form, ohne Gedankenstriche; Werbekonto mit Kampagnenrechten", () => {
    for (const t of Object.values(FREIGABE_ANGEKOMMEN)) {
      expect(hatGedankenstrich(t)).toBe(false);
      expect(t).toContain("Sie müssen nichts mehr tun");
    }
    expect(SYSTEMNUTZER_AUFGABEN.adAccount).toContain("ADVERTISE");
  });
});
