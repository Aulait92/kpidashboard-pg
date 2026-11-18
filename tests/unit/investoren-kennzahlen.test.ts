import { describe, expect, it } from "vitest";
import { bindung, gegenprobe, investorKennzahlen, kohortenAb, margeMonat, MIN_KOHORTE, type KostenMonat } from "@/lib/investoren/kennzahlen";
import { monthRange, type LedgerRow, type Stream } from "@/lib/revenue-ledger";
import { bindungZeilen, kacheln, OHNE_KOSTEN } from "@/lib/investoren/darstellung";
import type { InvestorenDaten } from "@/lib/investoren/server";

// Rechenkern der Investoren-Kennzahlen (Geld › Auswertung): Bindung 3/6/12, NRR/GRR, CLV, CAC + Amortisation,
// Kohorten erst ab 5 Kunden, Bruttomarge mit KI-Anteil, Abo vs. Pay-per-Lead.

const row = (customerId: string, month: string, stream: Stream, amount: number): LedgerRow => ({ customerId, month, stream, amount, recurring: stream !== "setup" });
const jeMonat = (customerId: string, from: string, to: string, stream: Stream, amount: number) => monthRange(from, to).map((m) => row(customerId, m, stream, amount));

// Jan–Jul 2026, Juli läuft. A Betreuung durchgehend, B Software ab Feb, C Pay-per-Lead Jan–Mär (kündigt im April),
// D Betreuung ab April (neu), E Pay-per-Lead ab Juni (neu). Dazu eine Einrichtung (nie im MRR).
const ROWS: LedgerRow[] = [
  ...jeMonat("A", "2026-01", "2026-07", "service", 1000),
  ...jeMonat("B", "2026-02", "2026-07", "software", 500),
  ...jeMonat("C", "2026-01", "2026-03", "ppl", 300),
  ...jeMonat("D", "2026-04", "2026-07", "service", 800),
  ...jeMonat("E", "2026-06", "2026-07", "ppl", 100),
  row("D", "2026-04", "setup", 990),
];
const MONTHS = monthRange("2026-01", "2026-07");
const KOSTEN: KostenMonat[] = MONTHS.map((m) => ({
  month: m,
  ppl: m === "2026-06" ? 50 : 0,
  software: m === "2026-06" ? 150 : 0,
  ki: m === "2026-06" ? 60 : 0,
  akquise: m >= "2026-04" && m <= "2026-06" ? 100 : 0,
  betrieb: 0,
}));

describe("Bindung 3/6/12 Monate", () => {
  it("Kunden gehalten, Umsatz netto (NRR) und brutto (GRR)", () => {
    const rows = [row("A", "2026-03", "service", 100), row("A", "2026-06", "service", 150), row("B", "2026-03", "service", 200), row("C", "2026-03", "ppl", 100), row("C", "2026-06", "ppl", 100)];
    const b = bindung(rows, "2026-06", 3, "2026-01");
    expect(b).toMatchObject({ basis: "2026-03", kunden: 3, gehalten: 2, ab: null });
    expect(b.kundenBindung).toBeCloseTo(2 / 3);
    expect(b.nrr).toBeCloseTo(250 / 400); // A wächst, B weg
    expect(b.grr).toBeCloseTo(200 / 400); // ohne Ausbau von A
  });

  it("zu wenig Historie: keine Zahl, sondern der Monat, ab dem sie erscheint", () => {
    const b = bindung(ROWS, "2026-06", 12, "2026-01");
    expect(b.nrr).toBeNull();
    expect(b.kundenBindung).toBeNull();
    expect(b.ab).toBe("2027-02");
  });
});

describe("Kohorten erst ab 5 Kunden", () => {
  it("kleine Startmonate werden gezählt, nicht gezeigt", () => {
    const k = kohortenAb([
      { start: "2026-01", customers: 6, values: [100, 98] },
      { start: "2026-02", customers: 2, values: [100] },
    ]);
    expect(MIN_KOHORTE).toBe(5);
    expect(k.gezeigt.map((c) => c.start)).toEqual(["2026-01"]);
    expect(k.ausgeblendet).toBe(1);
    expect(k.groesste).toEqual({ start: "2026-01", kunden: 6 });
  });
});

describe("Bruttomarge je Monat", () => {
  it("Umsatz minus direkte Kosten (Pay-per-Lead + Software, KI darin enthalten)", () => {
    const m = margeMonat({ month: "2026-06", ppl: 100, service: 1800, software: 500, setup: 0, recurring: 2400 }, KOSTEN[5]);
    expect(m).toMatchObject({ umsatz: 2400, direkt: 200, ki: 60 });
    expect(m!.marge).toBeCloseTo(2200 / 2400);
    expect(margeMonat({ month: "2026-06", ppl: 0, service: 0, software: 0, setup: 0, recurring: 0 }, KOSTEN[5])!.marge).toBeNull();
  });
});

describe("investorKennzahlen", () => {
  const k = investorKennzahlen({ rows: ROWS, months: MONTHS, current: "2026-07", kosten: KOSTEN, gruenderMonat: 1000 });

  it("MRR, ARR, Wachstum und aktive Kunden (Einrichtung nie im MRR)", () => {
    expect(k.lastComplete).toBe("2026-06");
    expect(k.mrr).toBe(2400);
    expect(k.arr).toBe(28800);
    expect(k.wachstum).toBeCloseTo(0);
    expect(k.aktiveKunden).toBe(4);
    expect(k.historie).toBe(6);
  });

  it("Bindung: 3 Monate gemessen, 6 und 12 erst später; Kachel nimmt die längste vorhandene", () => {
    const [b3, b6, b12] = k.bindung;
    expect(b3).toMatchObject({ monate: 3, basis: "2026-03", kunden: 3, gehalten: 2 });
    expect(b3.nrr).toBeCloseTo(1500 / 1800);
    expect(b6.ab).toBe("2026-08");
    expect(b12.ab).toBe("2027-02");
    expect(k.nrrKachel?.monate).toBe(3);
  });

  it("Kündigungsquote, CAC, Amortisation und Kundenwert", () => {
    expect(k.kuendigung!.gekuendigt).toBe(1);
    expect(k.kuendigung!.quote).toBeCloseTo(1 / 14);
    expect(k.cac).toMatchObject({ fenster: ["2026-04", "2026-05", "2026-06"], neukunden: 2, kosten: 300, cac: 150, cacMitGruender: 1650, rohertragJeKunde: 550 });
    expect(k.cac.amortisation).toBeCloseTo(150 / 550);
    expect(k.clv.laufzeit).toBeCloseTo(14);
    expect(k.clv.laufzeitGedeckelt).toBe(false);
    expect(k.clv.wert).toBe(7700);
    // einheitlich ohne Gründerzeit wie die Amortisation (Ole, 18.11.2026)
    expect(k.clv.zuCac).toBeCloseTo(7700 / 150);
  });

  it("Marge mit KI-Anteil, MRR-Bewegung und Kohorten unter 5 Kunden ausgeblendet", () => {
    expect(k.marge.letzter).toBeCloseTo(2200 / 2400);
    expect(k.marge.kiAnteil).toBeCloseTo(60 / 2400);
    const apr = k.bewegung.find((b) => b.to === "2026-04")!;
    expect(apr).toMatchObject({ start: 1800, neu: 800, gekuendigt: -300, end: 2300 });
    expect(k.bewegung).toHaveLength(5);
    expect(k.kohorten.gezeigt).toEqual([]);
    expect(k.kohorten.ausgeblendet).toBe(4);
    expect(k.kohorten.groesste).toEqual({ start: "2026-01", kunden: 2 });
  });

  it("Abo und Pay-per-Lead getrennt, auch wenn die Sicht nur das Kerngeschäft zeigt", () => {
    const kern = investorKennzahlen({ rows: ROWS.filter((r) => r.stream !== "ppl"), rowsAlle: ROWS, months: MONTHS, current: "2026-07", kosten: KOSTEN.map((c) => ({ ...c, ppl: 0 })), kostenAlle: KOSTEN, gruenderMonat: 1000 });
    expect(kern.mrr).toBe(2300);
    expect(kern.stroeme!.abo).toMatchObject({ mrr: 2300, kunden: 3 });
    expect(kern.stroeme!.ppl).toMatchObject({ mrr: 100, kunden: 1 });
    expect(kern.stroeme!.ppl.marge).toBeCloseTo(0.5);
    expect(kern.stroeme!.abo.anteil).toBeCloseTo(2300 / 2400);
  });

  it("ohne Historie: keine erfundenen Zahlen", () => {
    const leer = investorKennzahlen({ rows: jeMonat("A", "2026-07", "2026-07", "service", 1000), months: ["2026-07"], current: "2026-07", kosten: [], gruenderMonat: 1000 });
    expect(leer.mrr).toBe(1000);
    expect(leer.wachstum).toBeNull();
    expect(leer.nrrKachel).toBeNull();
    expect(leer.cac.cac).toBeNull();
    expect(leer.clv.wert).toBeNull();
    expect(leer.marge.letzter).toBeNull();
    expect(leer.stroeme).toBeNull();
    expect(leer.bindung.every((b) => b.nrr == null)).toBe(true);
  });
});

describe("Gegenprobe mit der Übersicht", () => {
  const k = investorKennzahlen({ rows: ROWS, months: MONTHS, current: "2026-07", kosten: KOSTEN, gruenderMonat: 1000 });
  const z = {
    headline: { mrr: 2400, arr: 28800, active: 4, grossMargin: 2200 / 2400, retention: { pct: 83, lag: 3 } },
    unit: { cac: 150, cacFounder: 1650, payback: 150 / 550, paybackFounder: 1650 / 550, ltv: 7700, ltvCac: 7700 / 1650 },
    churn: { rate: 1 / 14 },
  };
  it("gleiche Definitionen ergeben gleiche Zahlen", () => {
    const g = gegenprobe(k, z);
    expect(g.filter((x) => !x.gleich)).toEqual([]);
  });
  it("Abweichung wird gemeldet", () => {
    const g = gegenprobe(k, { ...z, headline: { ...z.headline, mrr: 2500 } });
    expect(g.filter((x) => !x.gleich).map((x) => x.name)).toEqual(["MRR"]);
  });
});

describe("Darstellung ohne Kosten und noch nicht messbare Bindung (Usability-Check 18.11.2026)", () => {
  const daten = (kosten: KostenMonat[]) => ({ k: investorKennzahlen({ rows: ROWS, months: MONTHS, current: "2026-07", kosten, gruenderMonat: 1000 }) }) as unknown as InvestorenDaten;

  it("ohne erfasste Akquisekosten: „Nicht berechenbar, Kosten fehlen“ statt „0,0 Mon.“ und „CAC 0 €“", () => {
    const ks = kacheln(daten(KOSTEN.map((c) => ({ ...c, akquise: 0 }))));
    const amort = ks.find((x) => x.label === "Amortisation")!;
    expect(amort).toMatchObject({ wert: "Nicht berechenbar", hinweis: "Kosten fehlen" });
    expect(amort.zeilen.find((z) => z.label === "CAC")?.wert).toBe(OHNE_KOSTEN);
    expect(ks.find((x) => x.label === "Kundenwert : CAC")?.wert).toBe("Nicht berechenbar");
    expect(JSON.stringify(ks)).not.toMatch(/0,0\sMon\.|CAC 0\s€/);
    // mit Kosten wie bisher
    expect(kacheln(daten(KOSTEN)).find((x) => x.label === "Amortisation")?.hinweis).toMatch(/^CAC 150\s€$/);
  });

  it("Bindung: „messbar ab …“ als eigener Hinweis, nicht in der Spalte „Kunden gehalten“", () => {
    const zeilen = bindungZeilen(daten(KOSTEN).k);
    expect(zeilen[0]).toMatchObject({ zeitraum: "3 Monate", hinweis: null });
    expect(zeilen[0].kunden).toMatch(/^2 von 3/);
    expect(zeilen[2].hinweis).toMatch(/^messbar ab /);
    expect(zeilen[2].kunden).not.toMatch(/^ab /);
  });
});
