// Abrechnungstag im Angebot (Ole, 18.11.2026): erster Abrechnungstag, kostenloser Start bzw. anteiliger Betrag,
// Texte der Kundenseite und der Auftragsbestätigung (Sie-Form, ohne Gedankenstriche, nie „Testphase“).
import { describe, expect, it } from "vitest";
import { abrechnungsplan, abrechnungstagKurz, abrechnungstagSaetze, anteilCent, anteilVerteilen, ersterAbrechnungstag, parseAbrechnungstag } from "@/lib/abrechnungstag";
import { contractSummaryLines, priceStepAckText, type ContractSummaryInput } from "@/lib/vertrag-laufzeit";

const STRICHE = /[–—]/;

describe("ersterAbrechnungstag", () => {
  it("nimmt den nächsten Tag mit diesem Tag im Monat am oder nach dem Start", () => {
    expect(ersterAbrechnungstag("2027-01-01", 15)).toBe("2027-01-15");
    expect(ersterAbrechnungstag("2027-01-15", 15)).toBe("2027-01-15");
    expect(ersterAbrechnungstag("2027-01-20", 15)).toBe("2027-02-15");
    expect(ersterAbrechnungstag("2027-12-20", 1)).toBe("2028-01-01");
    expect(ersterAbrechnungstag("2027-01-31", 28)).toBe("2027-02-28");
  });
  it("ohne Abrechnungstag = Start (auch am 29. bis 31.)", () => {
    expect(ersterAbrechnungstag("2027-01-31", null)).toBe("2027-01-31");
    expect(ersterAbrechnungstag("2027-03-30", undefined)).toBe("2027-03-30");
  });
  it("prüft die Eingabe (1 bis 28, leer = wie Start)", () => {
    expect(parseAbrechnungstag("")).toEqual({ ok: true, day: null });
    expect(parseAbrechnungstag(null)).toEqual({ ok: true, day: null });
    expect(parseAbrechnungstag(15)).toEqual({ ok: true, day: 15 });
    expect(parseAbrechnungstag(29).ok).toBe(false);
    expect(parseAbrechnungstag(0.5).ok).toBe(false);
  });
});

describe("abrechnungsplan", () => {
  it("Start 1.1.2027, Abrechnung am 15., gratis: kostenloser Start bis 14.1.", () => {
    const p = abrechnungsplan({ startIso: "2027-01-01", billingDay: 15, freeStart: true })!;
    expect(p).toMatchObject({ firstIso: "2027-01-15", day: 15, differs: true, free: true, stubEndIso: "2027-01-14", ratio: 0 });
  });
  it("ohne Haken: Anteil = Tage bis zum Abrechnungstag / Tage des Abrechnungsmonats davor", () => {
    const p = abrechnungsplan({ startIso: "2027-01-01", billingDay: 15, freeStart: false })!;
    // 1.1. bis 14.1. = 14 Tage, Zeitraum 15.12. bis 14.1. = 31 Tage
    expect(p.ratio).toBeCloseTo(14 / 31, 10);
    expect(anteilCent(99000, p)).toBe(Math.round((99000 * 14) / 31));
  });
  it("Jahreszahlung: Anteil über das Jahr", () => {
    const p = abrechnungsplan({ startIso: "2027-01-01", billingDay: 15, annual: true })!;
    expect(p.ratio).toBeCloseTo(14 / 365, 10);
  });
  it("Abrechnungstag gleich Starttag: keine Abweichung (Verhalten wie bisher)", () => {
    const p = abrechnungsplan({ startIso: "2027-01-15", billingDay: 15, freeStart: true })!;
    expect(p).toMatchObject({ firstIso: "2027-01-15", differs: false, free: false, ratio: 0, stubEndIso: null });
    expect(abrechnungstagSaetze(p, { firstNet: 990 })).toEqual([]);
  });
  it("verteilt den Anteil centgenau auf die Positionen", () => {
    const p = abrechnungsplan({ startIso: "2027-01-01", billingDay: 15 })!;
    const lines = [29900, 69100, 4900];
    const parts = anteilVerteilen(lines, p);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(anteilCent(29900 + 69100 + 4900, p));
    expect(parts.every((c, i) => c >= 0 && c <= lines[i])).toBe(true);
  });
});

describe("Texte für die Kundenseite", () => {
  it("gratis: wie von Ole formuliert, Sie-Form, kostenlos statt Testphase", () => {
    const p = abrechnungsplan({ startIso: "2027-01-01", billingDay: 15, freeStart: true });
    const t = abrechnungstagSaetze(p, { firstNet: 990 }).join(" ");
    expect(t).toBe("Start am 01.01.2027. Ihr Monatsbeitrag wird ab dem 15.01.2027 jeweils am 15. abgebucht. Die Zeit vom 01.01. bis 14.01. ist für Sie kostenlos.");
    expect(t).not.toMatch(STRICHE);
    expect(t).not.toMatch(/test/i);
  });
  it("ohne Haken: Hinweis auf den anteiligen Betrag mit der ersten Abbuchung", () => {
    const p = abrechnungsplan({ startIso: "2027-01-01", billingDay: 15, freeStart: false });
    const t = abrechnungstagSaetze(p, { firstNet: 990 }).join(" ");
    const anteil = (Math.round((99000 * 14) / 31) / 100).toFixed(2).replace(".", ",");
    expect(t).toContain("ab dem 15.01.2027 jeweils am 15. abgebucht");
    expect(t).toContain(`Für die Zeit vom 01.01. bis 14.01. berechnen wir anteilig ${anteil} € netto, zusammen mit der ersten Abbuchung.`);
    expect(t).not.toMatch(STRICHE);
  });
  it("Kurzform im Admin", () => {
    expect(abrechnungstagKurz(abrechnungsplan({ startIso: "2027-01-01", billingDay: 15, freeStart: true }))).toBe("am 15., erste Abbuchung 15.01.2027, kostenloser Start bis 14.01.");
    expect(abrechnungstagKurz(abrechnungsplan({ startIso: "2027-01-15", billingDay: 15 }))).toBe("am 15. (wie Start)");
  });
});

describe("Auftragsbestätigung und Annahme-Zusammenfassung", () => {
  const base: ContractSummaryInput = { term: "12m", startIso: "2027-01-01", setup: 1490, monthlyTotal: 990, intro: null, annual: false, freeMonths: 2 };

  it("ohne Abrechnungstag unverändert", () => {
    expect(contractSummaryLines({ ...base, billingDay: null })).toEqual(contractSummaryLines(base));
    expect(contractSummaryLines({ ...base, billingDay: 1, freeStart: true })).toEqual(contractSummaryLines(base));
  });
  it("gratis: Beitrag und Mindestlaufzeit ab dem ersten Abrechnungstag, Setup bei Annahme", () => {
    const lines = contractSummaryLines({ ...base, billingDay: 15, freeStart: true });
    expect(lines[0]).toBe("Einrichtung: 1.490 € netto, fällig mit der Annahme.");
    expect(lines).toContain("Monatlich: 990 € netto ab 15.01.2027, im Voraus.");
    expect(lines).toContain("Start am 01.01.2027. Ihr Monatsbeitrag wird ab dem 15.01.2027 jeweils am 15. abgebucht. Die Zeit vom 01.01. bis 14.01. ist für Sie kostenlos.");
    expect(lines.some((l) => l.startsWith("Mindestlaufzeit 12 Monate bis 14.01.2028"))).toBe(true);
    expect(lines.join(" ")).not.toMatch(STRICHE);
    expect(lines.join(" ")).not.toMatch(/testphase/i);
  });
  it("Startpreis zählt ab dem ersten Abrechnungstag", () => {
    const i: ContractSummaryInput = { ...base, intro: { months: 3, monthly: 490 }, billingDay: 15 };
    const lines = contractSummaryLines(i);
    expect(lines).toContain("Startpreis: 490 € netto im Monat vom 15.01.2027 bis 14.04.2027 (3 Monate).");
    expect(lines.some((l) => l.includes("anteilig") && l.includes("01.01. bis 14.01."))).toBe(true);
    expect(priceStepAckText(i)).toContain("ab dem 15.04.2027");
  });
});
