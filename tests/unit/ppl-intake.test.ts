import { describe, expect, it } from "vitest";
import { classifyIntake, type IntakeFacts } from "@/lib/ppl/intake";
import { aggregateReport, buckets, intakeRejectCategory } from "@/lib/ppl/auswertung";

const base: IntakeFacts = { dublette: false, consent: "Zugestimmt", hasBezug: false, assigned: false, deliveryOk: false, hasBuyer: false, weak: false, civilServant: false, ageHours: 48 };

describe("PPL-Eingang aus Airtable: Ergebnis und Grund", () => {
  it("zugewiesen / ausgeliefert / mit Bezug → geliefert (auch ältere Leads ohne Bezug-Link)", () => {
    expect(classifyIntake({ ...base, hasBezug: true, assigned: true, deliveryOk: true })).toEqual({ outcome: "geliefert", reason: null });
    expect(classifyIntake({ ...base, assigned: true, deliveryOk: true })).toEqual({ outcome: "geliefert", reason: null });
    expect(classifyIntake({ ...base, hasBuyer: true })).toEqual({ outcome: "geliefert", reason: null });
  });
  it("Ablehnungen durch uns", () => {
    expect(classifyIntake({ ...base, dublette: true })).toEqual({ outcome: "abgelehnt", reason: "Dublette" });
    expect(classifyIntake({ ...base, consent: "Abgelehnt", assigned: true })).toEqual({ outcome: "abgelehnt", reason: "Weitergabe abgelehnt" });
    expect(classifyIntake({ ...base, civilServant: true })).toEqual({ outcome: "abgelehnt", reason: "Beamter" });
    expect(classifyIntake({ ...base, weak: true })).toEqual({ outcome: "abgelehnt", reason: "schwach" });
    expect(classifyIntake({ ...base })).toEqual({ outcome: "abgelehnt", reason: "kein Abnehmer" });
  });
  it("noch offen: Zustimmung ausstehend oder frisch eingegangen", () => {
    expect(classifyIntake({ ...base, consent: "Ausstehend", assigned: true })).toEqual({ outcome: "offen", reason: "wartet auf Zustimmung" });
    expect(classifyIntake({ ...base, consent: "Ausstehend" })).toEqual({ outcome: "offen", reason: "wartet auf Zustimmung" });
    expect(classifyIntake({ ...base, ageHours: 1 })).toEqual({ outcome: "offen", reason: "in Bearbeitung" });
    // Dublette steht schon fest, auch wenn frisch
    expect(classifyIntake({ ...base, dublette: true, ageHours: 1 }).reason).toBe("Dublette");
  });
  it("Grund → Kategorie der Auswertung", () => {
    expect(intakeRejectCategory("Dublette")).toBe("dublette");
    expect(intakeRejectCategory("Weitergabe abgelehnt")).toBe("weitergabe");
    expect(intakeRejectCategory("Beamter")).toBe("beamter");
    expect(intakeRejectCategory("schwach")).toBe("schwach");
    expect(intakeRejectCategory("kein Abnehmer")).toBe("kein_abnehmer");
  });
  it("Auswertung: Eingang, offen, Ablehnungen und Leadpreis vor Ablehnung aus dem Airtable-Eingang", () => {
    const bs = buckets("tag", new Date("2026-11-11T10:00:00Z"), 1);
    const at = new Date("2026-11-11T08:00:00Z");
    const sales = Array.from({ length: 6 }, () => ({ at, product: "Wechsel", amount: 50, cancelled: false }));
    const intake = [
      ...Array.from({ length: 6 }, () => ({ at, product: "Wechsel", outcome: "geliefert", reason: null })),
      { at, product: "Wechsel", outcome: "abgelehnt", reason: "Dublette" },
      { at, product: "Wechsel", outcome: "abgelehnt", reason: "kein Abnehmer" },
      { at, product: "Wechsel", outcome: "abgelehnt", reason: "Weitergabe abgelehnt" },
      { at, product: "Wechsel", outcome: "offen", reason: "wartet auf Zustimmung" },
    ];
    const [r] = aggregateReport({ buckets: bs, sales, pool: [], intake, costs: [{ at, product: "Wechsel", amount: 100 }], other: [], product: null, poolSince: new Date("2026-06-01") });
    expect(r).toMatchObject({ received: 10, delivered: 6, pending: 1, rejectedTotal: 3, cplBefore: 10 });
    expect(r.rejected).toMatchObject({ dublette: 1, kein_abnehmer: 1, weitergabe: 1 });
  });
});
