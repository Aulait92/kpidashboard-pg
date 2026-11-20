// Splittests der Lead-Reise (Ole, 19.11.2026, lib/experimente.ts): feste Zuteilung, Entscheidung wie bei den
// Vorlagen-Tests, Notschalter; Journey-Texte der Fassungen (Terminvorschlag kostenlos, Vertragsfrage mit Grund).
import { describe, expect, it } from "vitest";
import { entscheide, EXPERIMENTE, experimenteAus, quoten, zuteilen } from "@/lib/experimente";
import { MIN_JE_FASSUNG } from "@/lib/whatsapp/ab-test";
import { terminVorschlagText, vertragsFrage } from "@/lib/whatsapp/gespraech";
import { vermittlerName } from "@/lib/vermittler-nennung";

describe("Zuteilung", () => {
  it("fest je Experiment und Einheit, etwa hälftig", () => {
    expect(zuteilen("komplettcheck_text", "lead_1")).toBe(zuteilen("komplettcheck_text", "lead_1"));
    const n = 2000;
    const b = Array.from({ length: n }, (_, i) => zuteilen("komplettcheck_text", `lead_${i}`)).filter((v) => v === "b").length;
    expect(b / n).toBeGreaterThan(0.45);
    expect(b / n).toBeLessThan(0.55);
  });

  it("unabhängig zwischen Experimenten (nicht immer dieselbe Fassung)", () => {
    const ids = Array.from({ length: 200 }, (_, i) => `lead_${i}`);
    const gleich = ids.filter((id) => zuteilen("komplettcheck_text", id) === zuteilen("terminvorschlag_kostenlos", id)).length;
    expect(gleich).toBeGreaterThan(60);
    expect(gleich).toBeLessThan(140);
  });
});

describe("Entscheidung", () => {
  it("zu wenig Daten: kein Gewinner", () => {
    expect(entscheide({ a: { n: 10, ziel: 1 }, b: { n: 10, ziel: 9 } }).reason).toBe("zu_wenig");
  });
  it("genug Daten, klarer Unterschied: Gewinner b", () => {
    const e = entscheide({ a: { n: 200, ziel: 60 }, b: { n: 200, ziel: 100 } });
    expect(e.reason).toBe("entschieden");
    expect(e.winner).toBe("b");
    expect(e.p).toBeLessThan(0.01);
  });
  it("genug Daten, kein Unterschied: läuft weiter", () => {
    expect(entscheide({ a: { n: MIN_JE_FASSUNG, ziel: 20 }, b: { n: MIN_JE_FASSUNG, ziel: 21 } }).reason).toBe("kein_unterschied");
  });
  it("Quoten je Fassung", () => {
    const q = quoten({ a: { n: 100, ziel: 30 }, b: { n: 50, ziel: 25 } });
    expect(q.quoteA).toBeCloseTo(0.3);
    expect(q.quoteB).toBeCloseTo(0.5);
  });
  it("Notschalter EXPERIMENTE_AUS", () => {
    expect(experimenteAus({ EXPERIMENTE_AUS: "1" })).toBe(true);
    expect(experimenteAus({})).toBe(false);
  });
  it("jedes Experiment hat ein Ziel und beide Fassungen beschrieben, ohne Gedankenstriche", () => {
    for (const d of Object.values(EXPERIMENTE)) {
      expect(["termin_gebucht", "komplettcheck_ja", "erschienen", "zusage", "ppl_erreicht", "erinnerung_optin"]).toContain(d.ziel);
      expect(d.a.length).toBeGreaterThan(5);
      expect(d.b.length).toBeGreaterThan(5);
    }
  });
});

describe("Fassungen der Journey-Texte", () => {
  const PERSON = vermittlerName("sie", { name: "Ole Kannapinn", anrede: "Herr", fallback: "Ihr Berater" });
  const PERSON_DU = vermittlerName("du", { name: "Ole Kannapinn", anrede: "Herr", fallback: "dein Berater" });
  const basis = { source: "Zahnzusatzversicherung", formular: [], person: PERSON, zeiten: ["morgen um 10 Uhr", "Freitag, 20.11. um 16 Uhr"] as [string, string], video: true };

  it("Terminvorschlag: Fassung b nennt „kostenlosen“, a nicht", () => {
    expect(terminVorschlagText({ ...basis, an: "sie" })).toContain("In einem kurzen Videotermin zeigt Ihnen Herr Kannapinn");
    expect(terminVorschlagText({ ...basis, an: "sie", kostenlos: true })).toContain("In einem kurzen, kostenlosen Videotermin zeigt Ihnen Herr Kannapinn");
    expect(terminVorschlagText({ ...basis, an: "du", person: PERSON_DU, kostenlos: true })).toContain("In einem kurzen, kostenlosen Videotermin zeigt dir Ole");
    // Zweiter Vorschlag ohne Nutzensatz bleibt gleich
    expect(terminVorschlagText({ ...basis, an: "sie", kostenlos: true, erneut: true })).toBe("Passt Ihnen morgen um 10 Uhr oder Freitag, 20.11. um 16 Uhr?");
  });

  it("Vertragsfrage mit Grund (doppelt zahlen), Du und Sie", () => {
    expect(vertragsFrage("sie", false, "Super!", PERSON)).toMatch(/^Super! Damit Herr Kannapinn sieht, ob Sie irgendwo doppelt zahlen: Welche Versicherungen haben Sie heute schon\?/);
    expect(vertragsFrage("du", true, "Danke!", PERSON_DU)).toMatch(/^Danke! Damit Ole sieht, ob du irgendwo doppelt zahlst: Welche Versicherungen habt ihr als Familie heute schon\?/);
    expect(vertragsFrage("sie", false)).toMatch(/^Super! Welche Versicherungen haben Sie heute schon\?/);
  });
});
