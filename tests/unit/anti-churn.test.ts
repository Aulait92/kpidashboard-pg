// Anti-Churn beim Kündigen (Ole, 15.11.2026): passende Alternativen je Grund, Halteangebote nur wenn eingeschaltet und
// erlaubt, Werktage.
import { describe, expect, it } from "vitest";
import { CHURN_OFFERS, CHURN_REASONS, offersFor } from "@/lib/anti-churn";
import { addWorkdays } from "@/lib/anti-churn-server";
import { enabledKinds, HALTE_DEFAULTS } from "@/lib/halteangebote";

const all = enabledKinds(HALTE_DEFAULTS);

describe("Anti-Churn", () => {
  it("ohne Halteangebote: feste Alternativen je Grund", () => {
    expect(offersFor("zu_teuer")).toEqual(["budget", "module", "pause"]);
    expect(offersFor("zu_teuer", { hasModules: false, canPause: false })).toEqual(["budget"]);
    expect(offersFor("keine_zeit")).toEqual(["pause", "rueckruf"]);
    expect(offersFor("zu_wenig_leads")).toEqual(["check", "termin"]);
    expect(offersFor(null)).toEqual(["rueckruf"]);
    for (const r of CHURN_REASONS) expect(offersFor(r.key).length).toBeGreaterThan(0);
  });

  it("Halteangebote je Grund (alle eingeschaltet, Rabatte erlaubt)", () => {
    const ctx = { enabled: all, discountOk: true, hasModules: true, canPause: true };
    expect(offersFor("zu_teuer", ctx)).toEqual(["rabatt", "budget", "module", "pause"]);
    expect(offersFor("zu_wenig_leads", ctx)).toEqual(["neustart", "termin"]);
    expect(offersFor("leads_passen_nicht", ctx)).toEqual(["neuausrichtung", "termin"]);
    // Kein Coaching bei zu wenigen Abschlüssen
    expect(offersFor("zu_wenig_abschluesse", ctx)).toEqual(["produktwechsel", "rueckruf"]);
    expect(offersFor("zu_wenig_abschluesse", ctx)).not.toContain("termin");
    expect(offersFor("keine_zeit", ctx)).toEqual(["pause_gratis", "rueckruf"]);
    expect(offersFor("app_passt_nicht", ctx)).toEqual(["einrichtung", "rueckruf"]);
    expect(offersFor("aufhoeren", ctx)).toEqual(["nur_bestand", "rueckruf"]);
    expect(offersFor("anderes", ctx)).toEqual(["rueckruf"]);
  });

  it("ohne Rabatt-Berechtigung: kein Nachlass, normale Pause statt Pause ohne Kosten", () => {
    const ctx = { enabled: all, discountOk: false };
    expect(offersFor("zu_teuer", ctx)).toEqual(["budget", "module", "pause"]);
    expect(offersFor("keine_zeit", ctx)).toEqual(["pause", "rueckruf"]);
    // Neustart und Neuausrichtung bleiben (ohne Gratismonat bzw. Gutschrift, siehe Texte)
    expect(offersFor("zu_wenig_leads", ctx)[0]).toBe("neustart");
    expect(offersFor("keine_zeit", { ...ctx, discountOk: true, canPause: false })).toEqual(["rueckruf"]);
  });

  it("abgeschaltete Angebote fallen weg, Nur Bestand nicht bei „Nur Betreuung“", () => {
    const off = { ...all, rabatt: false, budget: false, neustart: false, einrichtung: false, nur_bestand: false };
    expect(offersFor("zu_teuer", { enabled: off, discountOk: true, hasModules: false, canPause: false })).toEqual(["rueckruf"]);
    expect(offersFor("zu_wenig_leads", { enabled: off })).toEqual(["check", "termin"]);
    expect(offersFor("app_passt_nicht", { enabled: off })).toEqual(["termin", "rueckruf"]);
    expect(offersFor("aufhoeren", { enabled: all, service: true })).toEqual(["rueckruf"]);
  });

  it("feste Texte ohne Garantie-Versprechen und ohne Gedankenstriche", () => {
    const text = [...CHURN_REASONS.map((r) => r.label), ...Object.values(CHURN_OFFERS).flatMap((o) => [o.title, o.text, o.cta])].join(" ");
    expect(text).not.toMatch(/garantie|[–—]/i);
  });

  it("zählt Werktage", () => {
    expect(addWorkdays(new Date("2026-11-13T10:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-11-16"); // Fr → Mo
    expect(addWorkdays(new Date("2026-11-16T10:00:00Z"), 2).toISOString().slice(0, 10)).toBe("2026-11-18");
  });
});
