// Kosten je Kunde aus Pool-Kampagnen nach Lead-Anteil (lib/ops/pool-kosten.ts, Admin v2 Paket A0).
import { describe, expect, it } from "vitest";
import { poolKostenJeKunde, verteileCent } from "@/lib/ops/pool-kosten";

describe("verteileCent", () => {
  it("verteilt genau auf den Cent, Rest nach größtem Rest", () => {
    expect(verteileCent(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(verteileCent(1000, [3, 1])).toEqual([750, 250]);
    expect(verteileCent(1, [1, 2])).toEqual([0, 1]);
    expect(verteileCent(500, [0, 0])).toEqual([0, 0]);
    expect(verteileCent(0, [2, 5])).toEqual([0, 0]);
  });
});

describe("poolKostenJeKunde", () => {
  it("teilt die Ausgaben einer Kampagne nach Lead-Anteil auf die Kunden", () => {
    const r = poolKostenJeKunde(
      [
        { kampagneId: "k1", cent: 30000 },
        { kampagneId: "k1", cent: 10000 }, // zweiter Tag derselben Kampagne
        { kampagneId: "k2", cent: 9000 },
      ],
      [
        { kampagneId: "k1", kundeId: "a" },
        { kampagneId: "k1", kundeId: "a" },
        { kampagneId: "k1", kundeId: "a" },
        { kampagneId: "k1", kundeId: "b" },
        { kampagneId: "k2", kundeId: "b" },
        { kampagneId: "k2", kundeId: "b" },
        { kampagneId: "k2", kundeId: null },
      ],
    );
    expect(r.kunden).toEqual([
      { kundeId: "a", cent: 30000, leads: 3, kampagnen: 1 },
      { kundeId: "b", cent: 16000, leads: 3, kampagnen: 2 },
    ]);
    expect(r.nichtVerteiltCent).toBe(3000);
    expect(r.ohneLeadsCent).toBe(0);
    expect(r.gesamtCent).toBe(49000);
    expect(r.kunden.reduce((s, k) => s + k.cent, 0) + r.nichtVerteiltCent + r.ohneLeadsCent).toBe(r.gesamtCent);
  });

  it("Kampagnen ohne Leads und Leads ohne Ausgaben", () => {
    const r = poolKostenJeKunde([{ kampagneId: "leer", cent: 5000 }], [{ kampagneId: "gratis", kundeId: "a" }]);
    expect(r.ohneLeadsCent).toBe(5000);
    expect(r.kunden).toEqual([{ kundeId: "a", cent: 0, leads: 1, kampagnen: 1 }]);
    expect(r.gesamtCent).toBe(5000);
  });

  it("Summe stimmt auch bei krummen Anteilen auf den Cent", () => {
    const leads = ["a", "b", "c", "a", "b", "c", "a"].map((kundeId) => ({ kampagneId: "k", kundeId }));
    const r = poolKostenJeKunde([{ kampagneId: "k", cent: 10001 }], leads);
    expect(r.kunden.map((k) => k.cent)).toEqual([4286, 2858, 2857]);
    expect(r.kunden.reduce((s, k) => s + k.cent, 0)).toBe(10001);
  });

  it("ignoriert Null- und negative Ausgaben", () => {
    const r = poolKostenJeKunde([{ kampagneId: "k", cent: 0 }, { kampagneId: "k", cent: -5 }], [{ kampagneId: "k", kundeId: "a" }]);
    expect(r.gesamtCent).toBe(0);
    expect(r.kunden[0].cent).toBe(0);
  });
});
