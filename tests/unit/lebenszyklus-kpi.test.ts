// Kennzahlen zu Kündigung, Ruhephase und Reaktivierung (lib/lebenszyklus-kpi.ts), MRR-Brücke mit Reaktivierung,
// Ruhezeiten im Umsatzbuch und Buchungszeile „Reaktiviert“. Rein, ohne Datenbank.
import { describe, expect, it } from "vitest";
import { dormancyStats, dormantGaps, lifecycleMonths, reactivationByCancelMonth, reasonsComeback, type LcEvent } from "@/lib/lebenszyklus-kpi";
import { churnedCustomers, mrrBridge, mrrMovement, newCustomers, retainerRows, type LedgerRow } from "@/lib/revenue-ledger";
import { buildBuchungen, type BuchungSources } from "@/lib/admin-buchungen";

const at = (s: string) => new Date(s);
const ev = (customerId: string, kind: string, iso: string, o: Partial<LcEvent> = {}): LcEvent => ({ customerId, kind, at: at(iso), mrr: null, churnReason: null, ...o });
const row = (month: string, customerId: string, amount: number): LedgerRow => ({ month, customerId, stream: "service", amount, recurring: true });

// a: zahlt Jun–Jul, ruht Aug, kommt im Sep zurück; b: neu im Sep; c: zahlt Jun–Aug, ruht ab Sep
const rows: LedgerRow[] = [
  row("2026-06", "a", 1000), row("2026-07", "a", 1000), row("2026-09", "a", 500), row("2026-10", "a", 1000),
  row("2026-09", "b", 400), row("2026-10", "b", 600),
  row("2026-06", "c", 800), row("2026-07", "c", 800), row("2026-08", "c", 800),
];
const events: LcEvent[] = [
  ev("a", "cancelled", "2026-07-10T10:00:00Z", { mrr: 1000, churnReason: "zu_teuer" }),
  ev("a", "dormant", "2026-08-01T03:00:00Z", { mrr: 1000 }),
  ev("a", "reactivated", "2026-09-15T10:00:00Z", { mrr: 1000, churnReason: "zu_teuer" }),
  ev("c", "cancelled", "2026-08-05T10:00:00Z", { mrr: 800, churnReason: "keine_zeit" }),
  ev("c", "dormant", "2026-09-01T03:00:00Z", { mrr: 800 }),
];

describe("MRR-Brücke und Bewegung", () => {
  it("Rückkehrer zählen als Reaktivierung, nicht als neu", () => {
    const b = mrrBridge(rows, "2026-08", "2026-09");
    expect(b).toMatchObject({ start: 800, neu: 400, reaktiviert: 500, gekuendigt: -800, end: 900 });
    expect(b.counts).toEqual({ neu: 1, ausbau: 0, reaktiviert: 1, verkleinert: 0, gekuendigt: 1 });
    expect(b.start + b.neu + b.ausbau + b.reaktiviert + b.verkleinert + b.gekuendigt).toBe(b.end);
  });
  it("Bewegung je Monat und Kündigungen", () => {
    const m = mrrMovement(rows, ["2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(m.map((b) => b.to)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(m[0]).toMatchObject({ gekuendigt: -1000, reaktiviert: 0 });
    expect(m[2]).toMatchObject({ ausbau: 700, reaktiviert: 0, neu: 0 });
    expect(churnedCustomers(rows, "2026-08")).toBe(1);
    expect(churnedCustomers(rows, "2026-09")).toBe(1);
    // Neue Kunden: nur der erste Monat mit Umsatz, a im Sep nicht noch einmal
    expect(newCustomers(rows, "2026-09")).toBe(1);
  });
});

describe("Ruhezeiten im Umsatzbuch", () => {
  it("vom Tag des Ruhens bis zum Tag vor der Reaktivierung, offen ohne Reaktivierung", () => {
    const g = dormantGaps(events);
    expect(g.get("a")).toEqual([{ from: at("2026-08-01T03:00:00Z"), to: at("2026-09-14T10:00:00Z") }]);
    expect(g.get("c")).toEqual([{ from: at("2026-09-01T03:00:00Z"), to: null }]);
    expect(g.has("b")).toBe(false);
  });
  it("Betreuungsgebühr ohne Ende zählt in der Ruhezeit nichts", () => {
    const r = retainerRows(
      { customerId: "a", monthly: 3000, start: at("2026-06-01T12:00:00Z"), end: null, softwareShare: 0, pauses: [], gaps: [{ from: at("2026-08-01T03:00:00Z"), to: at("2026-09-14T10:00:00Z") }] },
      ["2026-07", "2026-08", "2026-09"],
      "2026-09",
    );
    expect(r.map((x) => [x.month, x.amount])).toEqual([
      ["2026-07", 3000],
      ["2026-09", 1600], // 16 von 30 Tagen (ab 15.09.)
    ]);
  });
});

describe("Kunden je Monat, Quote, Gründe, Ruhedauer", () => {
  it("Netto = neu + reaktiviert − gekündigt; Reaktivierungs-MRR aus dem Ereignis", () => {
    const [aug, sep] = lifecycleMonths(events, rows, ["2026-08", "2026-09"]);
    expect(aug).toEqual({ month: "2026-08", neu: 0, reaktiviert: 0, reaktiviertMrr: 0, gekuendigt: 1, kuendigungenEingang: 1, netto: -1 });
    expect(sep).toEqual({ month: "2026-09", neu: 1, reaktiviert: 1, reaktiviertMrr: 1000, gekuendigt: 1, kuendigungenEingang: 0, netto: 1 });
  });
  it("Reaktivierungsquote je Kündigungsmonat und je Grund", () => {
    expect(reactivationByCancelMonth(events)).toEqual([
      { month: "2026-07", cancelled: 1, reactivated: 1, rate: 1 },
      { month: "2026-08", cancelled: 1, reactivated: 0, rate: 0 },
    ]);
    expect(reasonsComeback(events)).toEqual([
      { reason: "zu_teuer", cancelled: 1, reactivated: 1, rate: 1 },
      { reason: "keine_zeit", cancelled: 1, reactivated: 0, rate: 0 },
    ]);
  });
  it("zweite Kündigung nach Rückkehr zählt für sich", () => {
    const again = [...events, ev("a", "cancelled", "2026-10-20T10:00:00Z", { churnReason: "aufhoeren" })];
    expect(reactivationByCancelMonth(again).find((r) => r.month === "2026-10")).toEqual({ month: "2026-10", cancelled: 1, reactivated: 0, rate: 0 });
  });
  it("ruhende Konten, Ruhedauer, Zeit bis zur Reaktivierung", () => {
    const s = dormancyStats(events, at("2026-11-10T03:00:00Z"));
    expect(s.dormantNow).toBe(1);
    expect(s.reactivations).toBe(1);
    expect(s.cancelled).toBe(2);
    expect(s.rate).toBe(0.5);
    expect(s.medianDaysToReactivation).toBe(45);
    expect(s.avgDormantDays).toBe(Math.round((45.2917 + 70) / 2));
  });
});

describe("Buchungen: Reaktiviert", () => {
  const base = (): BuchungSources => ({
    customers: [
      { id: "a", name: "Agentur A", contactId: "k1", retainerMonthly: 1000, retainerEnd: null, seatMonthly: null, seatsBilled: 0, bestandMonthly: null, empfehlungMonthly: null, bestandRequestedAt: null, existingCustomersEnabled: false, bestandFreeUntil: null },
      { id: "c", name: "Agentur C", contactId: null, retainerMonthly: 800, retainerEnd: at("2026-08-31T12:00:00Z"), seatMonthly: null, seatsBilled: 0, bestandMonthly: null, empfehlungMonthly: null, bestandRequestedAt: null, existingCustomersEnabled: false, bestandFreeUntil: null },
    ],
    offers: [],
    productBookings: [],
    budgetChanges: [],
    pauses: [],
    packs: [],
    referrals: [],
    audits: [],
    tasks: [{ id: "t1", contactId: "k1", title: "Reaktivierung: Agentur A: Abrechnung und Kampagnen neu starten", createdAt: at("2026-09-15T10:00:01Z"), doneAt: null }],
    lifecycle: [
      { id: "e1", customerId: "a", kind: "dormant", at: at("2026-08-01T03:00:00Z"), mrr: 1000, details: { contractEnd: "2026-07-31" } },
      { id: "e2", customerId: "a", kind: "reactivated", at: at("2026-09-15T10:00:00Z"), mrr: 1000, details: { dormantDays: 45, package: "Betreuung + Software, Katzenversicherung" } },
      { id: "e3", customerId: "c", kind: "dormant", at: at("2026-09-01T03:00:00Z"), mrr: 800, details: { contractEnd: "2026-08-31" } },
    ],
  });
  it("Zeile mit Paket, Preis und offener Aufgabe; Vertragsende nicht doppelt", () => {
    const rows = buildBuchungen(base(), at("2026-11-14T12:00:00Z"));
    const re = rows.find((r) => r.art === "reaktivierung")!;
    expect(re).toMatchObject({ customerId: "a", title: "Konto reaktiviert", monthly: 1000, status: "aktiv", source: "lifecycle" });
    expect(re.detail).toContain("Katzenversicherung");
    expect(re.detail).toContain("ruhte 45 Tage");
    expect(re.task).toMatchObject({ open: true });
    // a: Betreuungsgebühr läuft wieder ohne Ende → Vertragsende aus dem Lebenszyklus; c: steht schon als „Vertrag beendet“
    expect(rows.filter((r) => r.art === "kuendigung").map((r) => [r.customerId, r.title])).toEqual([
      ["c", "Vertrag beendet (Betreuung)"],
      ["a", "Vertrag beendet, Konto ruht"],
    ]);
  });
});
