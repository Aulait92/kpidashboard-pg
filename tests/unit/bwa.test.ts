import { describe, expect, it } from "vitest";
import { buildBwa, bwaCsv, groupSmallBetrieb, type BwaItem } from "@/lib/bwa-shared";
import { betriebGroup, bwaMonths } from "@/lib/bwa";

const months = ["2026-09", "2026-10"];
const fixed = [
  { section: "umsatz" as const, line: "umsatz:ppl", label: "Pay-per-Lead" },
  { section: "direkt" as const, line: "direkt:meta", label: "Meta-Werbung Pay-per-Lead" },
  { section: "akquise" as const, line: "akquise:tools", label: "Tools & Werbung" },
];
const it_ = (month: string, line: string, net: number): BwaItem => ({ month, line, label: line, net });

describe("BWA: Aggregation", () => {
  const items = [
    it_("2026-09", "umsatz:ppl", 1000),
    it_("2026-10", "umsatz:ppl", 2000),
    it_("2026-10", "umsatz:setup", 1990),
    it_("2026-09", "direkt:meta", 400),
    it_("2026-10", "direkt:meta", 600),
    it_("2026-10", "akquise:tools", 100),
    it_("2026-10", "betrieb:Steuerberater", 250),
    it_("2026-10", "betrieb:Kontoführung", 1),
    it_("2026-10", "betrieb:Telekom", 2),
  ];
  const bwa = buildBwa({ months, current: "2026-10", items, fixedLines: fixed, bankFrom: "2026-10" });
  const row = (k: string) => bwa.rows.find((r) => r.key === k)!;

  it("Summen, Rohertrag, Ergebnis und kumuliert", () => {
    expect(row("s:umsatz").values).toEqual([1000, 3990]);
    expect(row("s:direkt").values).toEqual([400, 600]);
    expect(row("r:rohertrag").values).toEqual([600, 3390]);
    expect(row("p:rohertrag").values[0]).toBe(60);
    expect(row("s:betrieb").values).toEqual([0, 253]);
    expect(row("r:ergebnis").values).toEqual([600, 3037]);
    expect(row("r:kumuliert").values).toEqual([600, 3637]);
    expect(row("r:ergebnis").total).toBe(3637);
  });

  it("dynamische Zeilen (Einrichtung) und kleine Betriebsposten als „Sonstiges“", () => {
    expect(row("umsatz:setup").total).toBe(1990);
    expect(row("betrieb:Sonstiges").total).toBe(3);
    expect(bwa.rows.some((r) => r.key === "betrieb:Telekom")).toBe(false);
    expect(row("betrieb:Steuerberater").total).toBe(250);
  });

  it("Monate vor den Bankdaten sind unvollständig", () => {
    expect(bwa.incomplete).toEqual(["2026-09"]);
  });

  it("ein einzelner kleiner Posten bleibt sichtbar", () => {
    const g = groupSmallBetrieb([it_("2026-10", "betrieb:A", 1000), it_("2026-10", "betrieb:B", 1)], ["2026-10"]);
    expect(g.map((i) => i.line)).toEqual(["betrieb:A", "betrieb:B"]);
  });

  it("CSV: Semikolon, deutsche Zahlen, Kosten negativ, laufender Monat markiert", () => {
    const csv = bwaCsv(bwa, (m) => m);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Position;2026-09;2026-10 (bisher);Summe");
    expect(lines).toContain("Summe Umsatz;1000,00;3990,00;4990,00");
    expect(lines).toContain("Summe Direkte Kosten;-400,00;-600,00;-1000,00");
    expect(lines).toContain("Rohertragsquote;60,00 %;84,96 %;79,96 %");
  });
});

describe("BWA: Zeitraum und Gruppen", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  it("Standard laufendes Jahr, 12 Monate, früheres Jahr", () => {
    expect(bwaMonths(undefined, now)).toEqual({ key: "2026", months: ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"] });
    expect(bwaMonths("12m", now).months).toHaveLength(12);
    expect(bwaMonths("12m", now).months[0]).toBe("2025-12");
    expect(bwaMonths("2025", now).months).toHaveLength(12);
    expect(bwaMonths("2099", now).key).toBe("2026");
  });
  it("Gruppenname: Regel-Bezeichnung ohne Klammer, sonst Empfänger", () => {
    expect(betriebGroup("Kontoführung Commerzbank (umsatzsteuerfrei)", "Kontoführung")).toBe("Kontoführung Commerzbank");
    expect(betriebGroup("Standardregel", "DATEV eG")).toBe("DATEV eG");
    expect(betriebGroup(null, null)).toBe("Ohne Empfänger");
  });
});
