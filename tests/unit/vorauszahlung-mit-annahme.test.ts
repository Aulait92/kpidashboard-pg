// Vorauszahlung mit Annahme fällig (Ole, 19.11.2026): reine Regeln und Texte (ohne Datenbank).
import { describe, expect, it } from "vitest";
import { addMonthsIso, contractSummaryLines, ersterVorauszahlungszeitraum, vorauszahlungFaellig, VORAUSZAHLUNG_MIT_ANNAHME, type ContractSummaryInput } from "@/lib/vertrag-laufzeit";
import { vorauszahlungMitAnnahme } from "@/lib/offer-pricing";
import { vorauszahlungAnteilCent } from "@/lib/billing";
import { OFFER_MAIL_VORAUSZAHLUNG } from "@/lib/email";
import { AGB } from "@/lib/legal-texts";
import { hatGedankenstrich } from "@/lib/gedankenstriche";

describe("erster Zeitraum und Verlängerung", () => {
  it("Start in der Zukunft: Zeitraum ab Start, Verlängerung genau 12 bzw. 6 Monate später", () => {
    expect(ersterVorauszahlungszeitraum("2027-01-01", 12, "2026-11-19")).toEqual({ fromIso: "2027-01-01", toIso: "2027-12-31", renewalIso: "2028-01-01" });
    expect(ersterVorauszahlungszeitraum("2027-01-15", 6, "2026-11-19")).toEqual({ fromIso: "2027-01-15", toIso: "2027-07-14", renewalIso: "2027-07-15" });
    // Kürzere Monate: wie Stripe am Monatsletzten
    expect(addMonthsIso("2026-08-31", 6)).toBe("2027-02-28");
    expect(ersterVorauszahlungszeitraum("2026-08-31", 6, "2026-08-01").renewalIso).toBe("2027-02-28");
  });

  it("Start in der Vergangenheit: nächster Monatserster (heute, wenn heute der 1. ist), ohne Start: heute", () => {
    expect(ersterVorauszahlungszeitraum("2026-11-10", 12, "2026-11-19")).toEqual({ fromIso: "2026-12-01", toIso: "2027-11-30", renewalIso: "2027-12-01" });
    expect(ersterVorauszahlungszeitraum("2026-11-10", 12, "2026-12-01").fromIso).toBe("2026-12-01");
    expect(ersterVorauszahlungszeitraum("2026-12-10", 6, "2026-12-19")).toEqual({ fromIso: "2027-01-01", toIso: "2027-06-30", renewalIso: "2027-07-01" });
    expect(ersterVorauszahlungszeitraum(null, 12, "2026-11-19")).toEqual({ fromIso: "2026-11-19", toIso: "2027-11-18", renewalIso: "2027-11-19" });
    // Start heute: ab heute
    expect(ersterVorauszahlungszeitraum("2026-11-19", 12, "2026-11-19").fromIso).toBe("2026-11-19");
  });
});

describe("Texte", () => {
  it("Fälligkeit mit der Annahme, sonst wie bisher zum Start", () => {
    expect(vorauszahlungFaellig("2027-01-01", 12, { mitAnnahme: true })).toBe("jedes Jahr am 01.01. fällig, das erste Mal mit der Annahme, dann am 01.01.2028");
    expect(vorauszahlungFaellig("2027-01-01", 6, { mitAnnahme: true })).toBe("alle 6 Monate fällig, das erste Mal mit der Annahme, dann am 01.07.2027");
    expect(vorauszahlungFaellig(null, 6, { mitAnnahme: true })).toBe("fällig mit der Annahme, danach alle 6 Monate");
    expect(vorauszahlungFaellig("2027-01-01", 12)).toBe("jedes Jahr am 01.01. fällig, das erste Mal zum Start am 01.01.2027");
  });

  it("Zusammenfassung am Knopf und in der Auftragsbestätigung: fester Satz, Laufzeit ab Start", () => {
    const base: ContractSummaryInput = { term: "12m", startIso: "2027-01-01", setup: 990, monthlyTotal: 1088, intro: null, annual: true, freeMonths: 3, prepayAtAcceptance: true };
    const l = contractSummaryLines(base).map((x) => x.replace(/ /g, " "));
    expect(l).toContain("Einrichtung: 990 € netto, fällig mit der Annahme.");
    expect(l).toContain("Jährlich im Voraus: 9.792 € netto, jedes Jahr am 01.01. fällig, das erste Mal mit der Annahme, dann am 01.01.2028.");
    expect(l).toContain("Die Vorauszahlung wird mit Annahme fällig, die Laufzeit beginnt mit dem Start der Kampagne.");
    expect(l).toContain("Laufzeit bis 31.12.2027. Sie verlängert sich um jeweils 12 Monate, wenn Sie nicht bis 30.11.2027 kündigen.");
    for (const x of l) expect(hatGedankenstrich(x)).toBe(false);
    // Monatszahler: kein Satz zur Vorauszahlung
    expect(contractSummaryLines({ ...base, annual: false })).not.toContain(VORAUSZAHLUNG_MIT_ANNAHME);
    // Annahme vor dem 19.11.2026: wie bisher zum Start
    expect(contractSummaryLines({ ...base, prepayAtAcceptance: false }).join(" ")).toContain("das erste Mal zum Start am 01.01.2027");
  });

  it("„Ich zahle später“ erlaubt: nicht „mit der Annahme“, sondern jetzt oder vor dem Start (Ole, 23.11.2026)", () => {
    const base: ContractSummaryInput = { term: "12m", startIso: "2027-01-01", setup: 990, monthlyTotal: 1088, intro: null, annual: true, freeMonths: 3, prepayAtAcceptance: true, payLater: true };
    const l = contractSummaryLines(base).map((x) => x.replace(/\s/g, " "));
    expect(l).toContain("Einrichtung: 990 € netto, zahlbar jetzt oder an einem späteren Tag Ihrer Wahl vor dem Start.");
    expect(l).toContain("Jährlich im Voraus: 9.792 € netto, jedes Jahr am 01.01. fällig, das erste Mal vor dem Start, dann am 01.01.2028.");
    expect(l).toContain("Die erste Zahlung ist zahlbar jetzt oder an einem späteren Tag Ihrer Wahl vor dem Start, die Laufzeit beginnt mit dem Start der Kampagne.");
    expect(l.join(" ")).not.toContain("mit der Annahme");
    for (const x of l) expect(hatGedankenstrich(x)).toBe(false);
    // Monatlich (wie im Screenshot): nur die Einrichtungszeile ändert sich
    const m = contractSummaryLines({ ...base, annual: false }).join(" ").replace(/\s/g, " ");
    expect(m).toContain("zahlbar jetzt oder an einem späteren Tag Ihrer Wahl vor dem Start");
    expect(m).not.toContain("fällig mit der Annahme");
  });

  it("gilt für offene Angebote und Annahmen ab 19.11.2026, nicht für ältere Verträge", () => {
    expect(vorauszahlungMitAnnahme({ acceptedAt: null })).toBe(true);
    expect(vorauszahlungMitAnnahme({ acceptedAt: new Date("2026-11-19T10:00:00Z"), prepayAtAcceptance: true })).toBe(true);
    expect(vorauszahlungMitAnnahme({ acceptedAt: new Date("2026-11-18T10:00:00Z"), prepayAtAcceptance: false })).toBe(false);
  });

  it("Angebotsmail und AGB: Fälligkeit mit Vertragsschluss, Übergang für ältere Verträge, ohne Gedankenstriche", () => {
    expect(OFFER_MAIL_VORAUSZAHLUNG).toBe("Zahlung im Voraus: Die Vorauszahlung wird mit Annahme fällig, die Laufzeit beginnt mit dem Start der Kampagne.");
    expect(hatGedankenstrich(OFFER_MAIL_VORAUSZAHLUNG)).toBe(false);
    const agb = JSON.stringify(AGB);
    expect(agb).toContain("Die Vorauszahlung für den ersten Zahlungszeitraum ist mit Vertragsschluss fällig, die für jeden weiteren Zahlungszeitraum zu dessen Beginn.");
    expect(agb).toContain("Zahlungszeiträume und Laufzeit beginnen mit dem Startdatum.");
    expect(agb).toContain("Für Verträge, die vor dem 19.11.2026 angenommen wurden, ist die erste Vorauszahlung zum Start fällig.");
  });
});

describe("Änderungen im bezahlten ersten Zeitraum anteilig", () => {
  it("vor dem Start voller Zeitraum, mittendrin nach Resttagen, weniger Menge als Gutschrift", () => {
    const z = { fromIso: "2027-01-01", renewalIso: "2028-01-01" };
    expect(vorauszahlungAnteilCent({ ...z, deltaQuantity: 1, unitCents: 44100, todayIso: "2026-11-19" })).toEqual({ cents: 44100, abIso: "2027-01-01" });
    // 1.7.2027 bis 1.1.2028: 184 von 365 Tagen
    expect(vorauszahlungAnteilCent({ ...z, deltaQuantity: 2, unitCents: 44100, todayIso: "2027-07-01" })).toEqual({ cents: Math.round(2 * 44100 * (184 / 365)), abIso: "2027-07-01" });
    expect(vorauszahlungAnteilCent({ ...z, deltaQuantity: -1, unitCents: 44100, todayIso: "2027-07-01" }).cents).toBe(-Math.round(44100 * (184 / 365)));
    expect(vorauszahlungAnteilCent({ ...z, deltaQuantity: 0, unitCents: 44100, todayIso: "2027-07-01" }).cents).toBe(0);
    expect(vorauszahlungAnteilCent({ ...z, deltaQuantity: 1, unitCents: 44100, todayIso: "2028-01-01" }).cents).toBe(0);
  });
});

describe("Reklamation bei Pay-per-Lead (Ole, 24.11.2026)", () => {
  it("steht nur bei Pay-per-Lead + Software, nicht bei Betreuung und nicht im eigenen Werbekonto", async () => {
    const { PPL_REKLAMATION } = await import("@/lib/vertrag-laufzeit");
    const base: ContractSummaryInput = { term: "none", startIso: "2027-01-11", setup: 0, monthlyTotal: 349, intro: null, annual: false, freeMonths: 0 };
    expect(contractSummaryLines({ ...base, paket: "ppl_software" })).toContain(PPL_REKLAMATION);
    expect(contractSummaryLines({ ...base, paket: "software" })).not.toContain(PPL_REKLAMATION);
    expect(hatGedankenstrich(PPL_REKLAMATION)).toBe(false);
  });
});
