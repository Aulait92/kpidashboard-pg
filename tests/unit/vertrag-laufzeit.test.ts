import { describe, expect, it } from "vitest";
import {
  naechsteRegulaereRechnung,
  berlinEndOfDay,
  cancelDate,
  cancelDateText,
  contractSummaryLines,
  hasPriceStep,
  periodEndIso,
  priceStepAckText,
  priceStepDates,
} from "@/lib/vertrag-laufzeit";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

// Intl setzt geschützte Leerzeichen vor „€“
const nb = (s: string) => s.replace(/\u00a0/g, " ");

describe("periodEndIso (§ 188 BGB)", () => {
  it("endet mit dem Tag vor demselben Datum", () => {
    expect(periodEndIso("2027-03-15", 1)).toBe("2027-04-14");
    expect(periodEndIso("2027-03-15", 3)).toBe("2027-06-14");
    expect(periodEndIso("2027-03-01", 1)).toBe("2027-03-31");
    expect(periodEndIso("2026-11-20", 12)).toBe("2027-11-19");
    expect(periodEndIso("2026-12-10", 2)).toBe("2027-02-09");
  });
  it("fehlt das Datum, endet der Zeitraum mit dem Monatsletzten", () => {
    expect(periodEndIso("2027-01-31", 1)).toBe("2027-02-28");
    expect(periodEndIso("2028-01-31", 1)).toBe("2028-02-29");
    expect(periodEndIso("2027-01-29", 1)).toBe("2027-02-28");
    // Abrechnungsmonate zählen vom Starttag, nicht vom verkürzten Februar
    expect(periodEndIso("2027-01-31", 2)).toBe("2027-03-30");
  });
});

describe("berlinEndOfDay", () => {
  it("00:00 Uhr Berliner Zeit am Folgetag (Sommer- und Winterzeit)", () => {
    expect(berlinEndOfDay("2027-09-30").toISOString()).toBe("2027-09-30T22:00:00.000Z");
    expect(berlinEndOfDay("2026-12-14").toISOString()).toBe("2026-12-14T23:00:00.000Z");
    expect(berlinEndOfDay("2027-03-27").toISOString()).toBe("2027-03-27T23:00:00.000Z");
    expect(berlinEndOfDay("2027-03-28").toISOString()).toBe("2027-03-28T22:00:00.000Z");
  });
});

describe("cancelDate", () => {
  it("ohne Laufzeit: Ende des laufenden Abrechnungsmonats", () => {
    const c = cancelDate({ startIso: "2026-10-15", term: "none", annual: false, todayIso: "2026-11-20" });
    expect(c).toMatchObject({ effectiveIso: "2026-12-14", reason: "abrechnungsmonat" });
    // am letzten Tag des Abrechnungsmonats: noch zu diesem Tag
    expect(cancelDate({ startIso: "2026-10-15", term: "none", annual: false, todayIso: "2026-11-14" }).effectiveIso).toBe("2026-11-14");
    // vor dem Start: Ende des ersten Abrechnungsmonats
    expect(cancelDate({ startIso: "2026-12-01", term: "none", annual: false, todayIso: "2026-11-20" }).effectiveIso).toBe("2026-12-31");
  });
  it("3 und 12 Monate: Ende der Mindestlaufzeit, danach monatlich", () => {
    expect(cancelDate({ startIso: "2026-11-01", term: "3m", annual: false, todayIso: "2026-11-15" })).toMatchObject({
      effectiveIso: "2027-01-31",
      reason: "mindestlaufzeit",
      minTermEndIso: "2027-01-31",
    });
    expect(cancelDate({ startIso: "2026-11-01", term: "3m", annual: false, todayIso: "2027-02-10" })).toMatchObject({ effectiveIso: "2027-02-28", reason: "abrechnungsmonat" });
    expect(cancelDate({ startIso: "2026-11-20", term: "12m", annual: false, todayIso: "2027-11-19" })).toMatchObject({ effectiveIso: "2027-11-19", reason: "mindestlaufzeit" });
    expect(cancelDate({ startIso: "2026-11-20", term: "12m", annual: false, todayIso: "2027-11-20" })).toMatchObject({ effectiveIso: "2027-12-19", reason: "abrechnungsmonat" });
  });
  it("jährliche Vorauszahlung: Frist 1 Monat zum Ende des Zahlungsjahres", () => {
    const base = { startIso: "2026-01-15", term: "12m" as const, annual: true };
    expect(cancelDate({ ...base, todayIso: "2026-12-14" })).toMatchObject({ effectiveIso: "2027-01-14", deadlineIso: "2026-12-14", reason: "zahlungsjahr", missedDeadline: false });
    // einen Tag zu spät: ein Jahr später
    expect(cancelDate({ ...base, todayIso: "2026-12-15" })).toMatchObject({ effectiveIso: "2028-01-14", deadlineIso: "2027-12-14", missedDeadline: true });
    // im zweiten Jahr rechtzeitig
    expect(cancelDate({ ...base, todayIso: "2027-03-01" })).toMatchObject({ effectiveIso: "2028-01-14", missedDeadline: false });
  });
  it("ohne Startdatum: Ende des Kalendermonats", () => {
    expect(cancelDate({ startIso: null, term: "none", annual: false, todayIso: "2026-11-15" })).toMatchObject({ effectiveIso: "2026-11-30", reason: "kalendermonat" });
  });
  it("Text nennt das Datum eindeutig", () => {
    const c = cancelDate({ startIso: "2026-11-01", term: "3m", annual: false, todayIso: "2026-11-15" });
    expect(cancelDateText(c, "2026-11-01")).toBe("Ihr Vertrag endet am 31.01.2027, zum Ende der Mindestlaufzeit (Start 01.11.2026).");
    const late = cancelDate({ startIso: "2026-01-15", term: "12m", annual: true, todayIso: "2026-12-20" });
    expect(cancelDateText(late, "2026-01-15")).toContain("14.01.2028");
  });
});

describe("Konditionen am Annahme-Knopf", () => {
  const base = { term: "12m" as const, startIso: "2026-12-01", setup: 990, monthlyTotal: 1349, intro: null, annual: false, freeMonths: 2 };
  it("Startpreis: Datum und Betrag des Übergangs", () => {
    const i = { ...base, intro: { months: 2, monthly: 499 } };
    expect(hasPriceStep(i)).toBe(true);
    expect(priceStepDates(i.startIso, 2)).toEqual({ introEndIso: "2027-01-31", regularFromIso: "2027-02-01" });
    const lines = contractSummaryLines(i).map(nb);
    expect(lines).toContain("Startpreis: 499 € netto im Monat vom 01.12.2026 bis 31.01.2027 (2 Monate).");
    expect(lines).toContain("Danach automatisch 1.349 € netto im Monat ab 01.02.2027.");
    expect(lines.some((l) => l.includes("Mindestlaufzeit 12 Monate bis 30.11.2027"))).toBe(true);
    expect(nb(priceStepAckText(i))).toBe("Mir ist bewusst: Nach dem Startpreis gilt ab dem 01.02.2027 automatisch die reguläre Vergütung von 1.349 € netto im Monat.");
  });
  it("ohne Startpreis kein Pflicht-Häkchen; Jahreszahlung mit Frist", () => {
    expect(hasPriceStep(base)).toBe(false);
    expect(hasPriceStep({ ...base, intro: { months: 2, monthly: 1349 } })).toBe(false);
    const lines = contractSummaryLines({ ...base, annual: true }).map(nb);
    expect(lines).toContain("Jährlich im Voraus: 13.490 € netto, jedes Jahr am 01.12. fällig, das erste Mal zum Start am 01.12.2026.");
    expect(lines).toContain("Laufzeit bis 30.11.2027. Sie verlängert sich um jeweils 12 Monate, wenn Sie nicht bis 31.10.2027 kündigen.");
  });
  it("ohne Gedankenstriche", () => {
    for (const l of [...contractSummaryLines({ ...base, intro: { months: 3, monthly: 0 } }), ...contractSummaryLines({ ...base, term: "none", setup: 0 })]) {
      expect(hatGedankenstrich(l)).toBe(false);
    }
  });
});

describe("naechsteRegulaereRechnung (Konto: nächste Rechnung)", () => {
  it("monatlich im Voraus: nächster Abrechnungstag ab heute, Monatsende wie Stripe", () => {
    expect(naechsteRegulaereRechnung({ anchorIso: "2026-05-03", monate: 1, ab: 0, todayIso: "2026-11-19" })).toBe("2026-12-03");
    expect(naechsteRegulaereRechnung({ anchorIso: "2026-05-03", monate: 1, ab: 0, todayIso: "2026-12-03" })).toBe("2026-12-03");
    expect(naechsteRegulaereRechnung({ anchorIso: "2026-01-31", monate: 1, ab: 0, todayIso: "2026-02-10" })).toBe("2026-02-28");
    expect(naechsteRegulaereRechnung({ anchorIso: "2026-12-01", monate: 1, ab: 0, todayIso: "2026-11-19" })).toBe("2026-12-01");
  });
  it("Vorauszahlung: erst die Verlängerung; nach Vertragsende keine Rechnung", () => {
    expect(naechsteRegulaereRechnung({ anchorIso: "2026-11-01", monate: 12, ab: 1, todayIso: "2026-11-19" })).toBe("2027-11-01");
    expect(naechsteRegulaereRechnung({ anchorIso: "2026-05-03", monate: 1, ab: 0, todayIso: "2026-11-19", endIso: "2026-12-02" })).toBeNull();
    expect(naechsteRegulaereRechnung({ anchorIso: "2026-05-03", monate: 1, ab: 0, todayIso: "2026-11-19", endIso: "2027-01-02" })).toBe("2026-12-03");
  });
});
