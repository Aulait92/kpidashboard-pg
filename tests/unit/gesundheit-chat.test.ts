// Gesundheitsangaben im Chat (Art. 9 DSGVO, Rechtsprüfung 16.11.2026): Sätze mit eindeutigen Begriffen gehen
// nicht an die KI, Tierangaben bleiben (Art. 4 Nr. 15 DSGVO: nur natürliche Personen).
import { describe, expect, it } from "vitest";
import { GESUNDHEITS_REGEL, HEALTH_REDACTED, istTierLead, redactHealthText } from "@/lib/gesundheitsdaten";

describe("Gesundheitsangaben in Chatnachrichten", () => {
  it("blendet Sätze mit Gesundheitsangaben einer Person aus, der Rest bleibt", () => {
    const t = redactHealthText("Ich hatte letztes Jahr einen Bandscheibenvorfall und war in Reha. Passt Dienstag um 10?");
    expect(t).toBe(`${HEALTH_REDACTED} Passt Dienstag um 10?`);
    expect(t).not.toMatch(/bandscheib|reha/i);
  });
  it("mehrere Sätze hintereinander: ein Platzhalter", () => {
    expect(redactHealthText("Ich habe Diabetes. Außerdem nehme ich Medikamente gegen Bluthochdruck.\nRufen Sie mich an.")).toBe(`${HEALTH_REDACTED} Rufen Sie mich an.`);
  });
  it("ohne Gesundheitsangaben unverändert", () => {
    const s = "Gern, morgen ab 17 Uhr. Ich bin 34 und arbeite als Erzieherin.";
    expect(redactHealthText(s)).toBe(s);
  });
  it("Tier-Leads und Sätze über Tiere bleiben unverändert", () => {
    const s = "Meine Katze hat Diabetes und wurde operiert.";
    expect(redactHealthText(s)).toBe(s);
    expect(redactHealthText("Sie hat Diabetes und bekommt Medikamente.", { tier: true })).toBe("Sie hat Diabetes und bekommt Medikamente.");
    expect(istTierLead("Katzenversicherung (TKV)")).toBe(true);
    expect(istTierLead("Hunde-OP")).toBe(true);
    expect(istTierLead("Zahnzusatz")).toBe(false);
    expect(istTierLead(null)).toBe(false);
  });
  it("Prompt-Regel kennt den Platzhalter, keine Gedankenstriche", () => {
    expect(GESUNDHEITS_REGEL).toContain(HEALTH_REDACTED);
    expect(HEALTH_REDACTED).not.toMatch(/[–—]/);
  });
});
