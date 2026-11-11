import { describe, expect, it } from "vitest";
import { aggregateReport, buckets, periodStats, rejectCategory } from "@/lib/ppl/auswertung";

describe("Pay-per-Lead-Auswertung", () => {
  it("ordnet Ablehnungsgründe der Engine zu", () => {
    expect(rejectCategory("delivered", null)).toBeNull();
    expect(rejectCategory("duplicate", "schon am 01.11.")).toBe("dublette");
    expect(rejectCategory("invalid", "keine Telefonnummer")).toBe("ungueltig");
    expect(rejectCategory("parked", "kein passender Bezug (PLZ, schwach)")).toBe("gebiet");
    expect(rejectCategory("parked", "kein passender Bezug (schwach)")).toBe("schwach");
    expect(rejectCategory("parked", "kein passender Bezug (Beamter)")).toBe("beamter");
    expect(rejectCategory("parked", "alle Kontingente voll")).toBe("kein_abnehmer");
  });

  it("Zeiträume: 14 Tage / 12 Wochen / 12 Monate, letzter ist der laufende", () => {
    const now = new Date("2026-11-11T10:00:00Z");
    const d = buckets("tag", now);
    expect(d).toHaveLength(14);
    expect(d[13]).toMatchObject({ key: "2026-11-11", current: true });
    const w = buckets("woche", now);
    expect(w[11].key).toBe("2026-11-09");
    const m = buckets("monat", now);
    expect(m.map((x) => x.key).slice(-2)).toEqual(["2026-10", "2026-11"]);
    expect(m[11].start.toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });

  it("rechnet Leadpreis vor/nach Ablehnung und Reklamation, Gewinn und Marge", () => {
    const now = new Date("2026-11-11T10:00:00Z");
    const bs = buckets("tag", now, 1);
    const at = new Date("2026-11-11T08:00:00Z");
    const sales = Array.from({ length: 10 }, (_, i) => ({ at, product: "Wechsel", amount: 50, cancelled: i < 2 }));
    const pool = [
      { at, product: "Wechsel", status: "duplicate", reason: null },
      { at, product: "Wechsel", status: "parked", reason: "kein passender Bezug (schwach)" },
    ];
    const rows = aggregateReport({
      buckets: bs,
      sales,
      pool,
      costs: [{ at, product: "Wechsel", amount: 240 }],
      other: [{ at, amount: 10 }],
      product: null,
      poolSince: new Date("2026-01-01"),
    });
    expect(rows[0]).toMatchObject({
      received: 12,
      delivered: 10,
      rejectedTotal: 2,
      complaints: 2,
      cplBefore: 20,
      cplAfterReject: 24,
      cplAfterComplaints: 30,
      revenue: 400,
      spend: 250,
      profit: 150,
      margin: 37.5,
    });
    expect(rows[0].rejected).toMatchObject({ dublette: 1, schwach: 1 });
  });

  it("vor der Umstellung: Eingang unbekannt, Leadpreis vor Ablehnung leer; Produktfilter ohne sonstige Kosten", () => {
    const bs = buckets("tag", new Date("2026-11-11T10:00:00Z"), 1);
    const at = new Date("2026-11-11T08:00:00Z");
    const rows = aggregateReport({
      buckets: bs,
      sales: [{ at, product: "Wechsel", amount: 50, cancelled: false }, { at, product: "Neugeschäft", amount: 60, cancelled: false }],
      pool: [],
      costs: [{ at, product: "Wechsel", amount: 20 }, { at, product: "Neugeschäft", amount: 30 }],
      other: [{ at, amount: 99 }],
      product: "Wechsel",
      poolSince: null,
    });
    expect(rows[0]).toMatchObject({ received: null, delivered: 1, cplBefore: null, cplAfterReject: 20, revenue: 50, spend: 20, otherCost: 0 });
  });

  it("„liegt zurück“: weniger geliefert als anteilig bestellt (mindestens 1 Lead)", () => {
    expect(periodStats(20, 0.5, Array.from({ length: 9 }, () => ({ amount: 50, cancelled: false }))).behind).toBe(true);
    expect(periodStats(20, 0.5, Array.from({ length: 10 }, () => ({ amount: 50, cancelled: false }))).behind).toBe(false);
    expect(periodStats(null, 0.5, []).behind).toBe(false);
    expect(periodStats(10, 1, [{ amount: 50, cancelled: true }])).toMatchObject({ delivered: 1, complaints: 1, revenue: 0 });
  });
});
