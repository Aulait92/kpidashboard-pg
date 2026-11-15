// Anti-Churn beim Kündigen (Ole, 15.11.2026): passende Alternativen je Grund, keine Rabatte, Werktage.
import { describe, expect, it } from "vitest";
import { CHURN_OFFERS, CHURN_REASONS, offersFor } from "@/lib/anti-churn";
import { addWorkdays } from "@/lib/anti-churn-server";

describe("Anti-Churn", () => {
  it("bietet je Grund passende Alternativen", () => {
    expect(offersFor("zu_teuer")).toEqual(["budget", "module", "pause"]);
    expect(offersFor("zu_teuer", { hasModules: false, canPause: false })).toEqual(["budget"]);
    expect(offersFor("keine_zeit")).toEqual(["pause", "rueckruf"]);
    expect(offersFor("zu_wenig_leads")).toEqual(["check", "termin"]);
    expect(offersFor(null)).toEqual(["rueckruf"]);
    for (const r of CHURN_REASONS) expect(offersFor(r.key).length).toBeGreaterThan(0);
  });
  it("Texte ohne Rabatt-, Garantie- oder Ergebnisversprechen und ohne Gedankenstriche", () => {
    const all = [...CHURN_REASONS.map((r) => r.label), ...Object.values(CHURN_OFFERS).flatMap((o) => [o.title, o.text, o.cta])].join(" ");
    expect(all).not.toMatch(/rabatt|gratis|garantie|[–—]/i);
  });
  it("zählt Werktage", () => {
    expect(addWorkdays(new Date("2026-11-13T10:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-11-16"); // Fr → Mo
    expect(addWorkdays(new Date("2026-11-16T10:00:00Z"), 2).toISOString().slice(0, 10)).toBe("2026-11-18");
  });
});
