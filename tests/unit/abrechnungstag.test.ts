// Abrechnungstag im Angebot (Ole, 18.11.2026): erster Abrechnungstag, kostenloser Start bzw. anteiliger Betrag,
// Texte der Kundenseite und der Auftragsbestätigung (Sie-Form, ohne Gedankenstriche, nie „Testphase“).
import { describe, expect, it } from "vitest";
import { abrechnungsplan, abrechnungstagKurz, kostenlosTage, abrechnungstagSaetze, anteilCent, anteilVerteilen, ersterAbrechnungstag, parseAbrechnungstag } from "@/lib/abrechnungstag";
import { contractSummaryLines, priceStepAckText, type ContractSummaryInput } from "@/lib/vertrag-laufzeit";

const STRICHE = /[–—]/;
// geschütztes Leerzeichen vor „€“ als normales Leerzeichen vergleichen
const nb = (s: string) => s.replace(/\u00a0/g, " ");

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
  it("Vorauszahlung (Ole, 18.11.2026): Abrechnungstag gilt nicht, voller Betrag zum Start", () => {
    for (const freeStart of [false, true]) {
      const p = abrechnungsplan({ startIso: "2026-11-18", billingDay: 1, freeStart, annual: true })!;
      expect(p).toMatchObject({ startIso: "2026-11-18", firstIso: "2026-11-18", day: 18, differs: false, free: false, stubEndIso: null, ratio: 0, vorauszahlung: true });
      expect(anteilCent(990000, p)).toBe(0);
      expect(anteilVerteilen([300000, 690000], p)).toEqual([0, 0]);
      expect(abrechnungstagSaetze(p, { firstNet: 9900 })).toEqual([]);
    }
    expect(abrechnungstagKurz(abrechnungsplan({ startIso: "2026-11-18", billingDay: 1, annual: true }))).toBe(
      "zum Start am 18.11.2026, voller Betrag (Vorauszahlung, Abrechnungstag gilt nicht)",
    );
  });
  it("monatlich unverändert: Start 18.11., Abrechnung am 1., anteilig 13 von 30 Tagen", () => {
    const p = abrechnungsplan({ startIso: "2026-11-18", billingDay: 1, annual: false })!;
    expect(p).toMatchObject({ firstIso: "2026-12-01", differs: true, free: false, stubEndIso: "2026-11-30", vorauszahlung: false });
    expect(p.ratio).toBeCloseTo(13 / 30, 10);
    expect(abrechnungsplan({ startIso: "2026-11-18", billingDay: 1, freeStart: true })).toMatchObject({ firstIso: "2026-12-01", free: true, ratio: 0 });
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
  it("Vorauszahlung mit Abrechnungstag: voller Jahresbeitrag zum Start, nichts anteilig, kein kostenloser Start", () => {
    const i: ContractSummaryInput = { term: "12m", startIso: "2026-11-18", setup: 990, monthlyTotal: 990, intro: null, annual: true, freeMonths: 2, billingDay: 1 };
    for (const freeStart of [false, true]) {
      const lines = contractSummaryLines({ ...i, freeStart }).map(nb);
      expect(lines).toContain("Jährlich im Voraus: 9.900 € netto, jedes Jahr am 18.11. fällig, das erste Mal zum Start am 18.11.2026.");
      expect(lines).toContain("Laufzeit bis 17.11.2027. Sie verlängert sich um jeweils 12 Monate, wenn Sie nicht bis 17.10.2027 kündigen.");
      const t = lines.join(" ");
      expect(t).not.toMatch(/anteilig|kostenlos|01\.12\./);
      expect(t).not.toMatch(STRICHE);
      // wie ohne Abrechnungstag
      expect(lines).toEqual(contractSummaryLines({ ...i, billingDay: null }).map(nb));
    }
    const halb = contractSummaryLines({ ...i, term: "6m", freeMonths: 1 }).map(nb);
    expect(halb).toContain("6 Monate im Voraus: 4.950 € netto, alle 6 Monate fällig, das erste Mal zum Start am 18.11.2026, dann am 18.05.2027.");
    expect(halb).toContain("Laufzeit bis 17.05.2027. Sie verlängert sich um jeweils 6 Monate, wenn Sie nicht bis 17.04.2027 kündigen.");
    expect(halb.join(" ")).not.toMatch(/anteilig|kostenlos/);
    // Monatlich zahlt weiter ab dem Abrechnungstag, Zeit davor anteilig
    const monatlich = contractSummaryLines({ ...i, annual: false }).map(nb).join(" ");
    expect(monatlich).toContain("Monatlich: 990 € netto ab 01.12.2026, im Voraus.");
    expect(monatlich).toMatch(/Für die Zeit vom 18\.11\. bis 30\.11\. berechnen wir anteilig 429 € netto/);
  });
  it("Startpreis zählt ab dem ersten Abrechnungstag", () => {
    const i: ContractSummaryInput = { ...base, intro: { months: 3, monthly: 490 }, billingDay: 15 };
    const lines = contractSummaryLines(i);
    expect(lines).toContain("Startpreis: 490 € netto im Monat vom 15.01.2027 bis 14.04.2027 (3 Monate).");
    expect(lines.some((l) => l.includes("anteilig") && l.includes("01.01. bis 14.01."))).toBe(true);
    expect(priceStepAckText(i)).toContain("ab dem 15.04.2027");
  });
});

describe("kostenloser Start nie länger als im Angebot (Ole, 25.11.2026)", () => {
  it("Ole setzt 01.01., Kunde wählt 18.01. bei Abbuchung am 15.: anteilig statt geschenktem Monat", () => {
    const tage = kostenlosTage("2027-01-01", 15, true);
    expect(tage).toBe(14);
    const p = abrechnungsplan({ startIso: "2027-01-18", billingDay: 15, freeStart: true, freeMaxTage: tage })!;
    expect(p).toMatchObject({ firstIso: "2027-02-15", differs: true, free: false, stubEndIso: "2027-02-14" });
    expect(p.ratio).toBeCloseTo(28 / 31, 5);
    expect(abrechnungstagSaetze(p, { firstNet: 990 }).join(" ")).toContain("anteilig");
  });
  it("Ole setzt selbst 18.01.: seine Wahl gilt, Zeit bis 14.02. kostenlos", () => {
    const tage = kostenlosTage("2027-01-18", 15, true);
    expect(tage).toBe(28);
    expect(abrechnungsplan({ startIso: "2027-01-18", billingDay: 15, freeStart: true, freeMaxTage: tage })).toMatchObject({ free: true, ratio: 0 });
    expect(abrechnungsplan({ startIso: "2027-01-20", billingDay: 15, freeStart: true, freeMaxTage: tage })).toMatchObject({ free: true });
  });
  it("ohne Haken oder Abrechnungstag nichts einfrieren", () => {
    expect(kostenlosTage("2027-01-01", 15, false)).toBeNull();
    expect(kostenlosTage("2027-01-01", null, true)).toBeNull();
    expect(kostenlosTage(null, 15, true)).toBeNull();
    expect(kostenlosTage("2027-01-15", 15, true)).toBeNull();
  });
});

describe("ohne eingefrorenen Wert höchstens 15 Tage", () => {
  it("Kunde wählt Start 18.01., Abbuchung am 15.: kein geschenkter Monat, sondern anteilig", () => {
    const p = abrechnungsplan({ startIso: "2027-01-18", billingDay: 15, freeStart: true })!;
    expect(p).toMatchObject({ firstIso: "2027-02-15", differs: true, free: false, stubEndIso: "2027-02-14" });
    expect(p.ratio).toBeCloseTo(28 / 31, 5);
    expect(abrechnungstagSaetze(p, { firstNet: 990 }).join(" ")).toContain("anteilig");
    expect(abrechnungstagSaetze(p, { firstNet: 990 }).join(" ")).not.toContain("kostenlos");
  });
  it("bis 15 Tage bleibt der Start kostenlos", () => {
    expect(abrechnungsplan({ startIso: "2027-01-31", billingDay: 15, freeStart: true })).toMatchObject({ firstIso: "2027-02-15", free: true, ratio: 0 });
    expect(abrechnungsplan({ startIso: "2027-01-30", billingDay: 15, freeStart: true })).toMatchObject({ firstIso: "2027-02-15", free: false });
  });
});

