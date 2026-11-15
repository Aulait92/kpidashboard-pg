// Admin → Zahlen → „Kündigung & Rückkehr“ gegen die Datenbank: Reaktivierungen neben neuen Kunden und Kündigungen,
// MRR-Bewegung mit Reaktivierung (Ruhezeit zählt keinen Umsatz), Quote je Kündigungsmonat, Gründe, ruhende Konten,
// Buchung „Reaktiviert“, Hinweis auf „Heute“ vor der Löschung; Reaktivierte zählen nicht als neue Kunden.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { loadLebenszyklus } from "@/lib/lebenszyklus";
import { loadZahlen } from "@/lib/zahlen";
import { loadBuchungen } from "@/lib/admin-buchungen";
import { dormantDeletionsDue } from "@/lib/admin-heute";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const NOW = new Date("2026-11-10T12:00:00Z");
const d = (s: string) => new Date(s.length === 10 ? `${s}T12:00:00Z` : s);

describe("Kündigung & Rückkehr: Kennzahlen aus der Datenbank", () => {
  const ids: string[] = [];
  let a = "";
  let b = "";
  let c = "";

  beforeAll(async () => {
    requireTestDb();
    // a: Betreuung seit Juni, gekündigt im Juli, ruht ab 01.08., reaktiviert am 15.09. (Ole führt die Gebühr ohne Ende weiter)
    a = (await makeCustomer({ retainerMonthly: 1000, retainerStart: d("2026-06-01") })).id;
    // b: neu im September
    b = (await makeCustomer({ retainerMonthly: 500, retainerStart: d("2026-09-01") })).id;
    // c: seit Juni, Vertrag bis 31.08., ruht seit 01.09., Löschung am 25.11.
    c = (await makeCustomer({ retainerMonthly: 800, retainerStart: d("2026-06-01"), retainerEnd: d("2026-08-31"), archived: true, dormantSince: d("2026-09-01T03:00:00Z"), retentionChoice: "3m", deleteAfter: d("2026-11-25T23:00:00Z"), cancelEffectiveAt: d("2026-08-31") })).id;
    ids.push(a, b, c);
    const ev = (customerId: string, kind: string, at: string, mrr: number, o: { churnReason?: string; details?: Record<string, unknown> } = {}) =>
      prisma.customerLifecycleEvent.create({ data: { customerId, kind, at: d(at), mrr: new Prisma.Decimal(mrr), churnReason: o.churnReason ?? null, details: (o.details ?? undefined) as Prisma.InputJsonValue | undefined } });
    await ev(a, "cancelled", "2026-07-10T10:00:00Z", 1000, { churnReason: "zu_teuer", details: { effective: "2026-07-31" } });
    await ev(a, "dormant", "2026-08-01T03:00:00Z", 1000, { details: { contractEnd: "2026-07-31" } });
    await ev(a, "reactivated", "2026-09-15T10:00:00Z", 1000, { churnReason: "zu_teuer", details: { dormantDays: 45, package: "Betreuung + Software" } });
    await ev(c, "cancelled", "2026-08-05T10:00:00Z", 800, { churnReason: "keine_zeit" });
    await ev(c, "dormant", "2026-09-01T03:00:00Z", 800, { details: { contractEnd: "2026-08-31" } });
  });

  afterAll(async () => {
    for (const id of ids) await cleanupCustomer(id);
  });

  it("Kunden je Monat, MRR-Bewegung, Quote, Gründe und ruhende Konten", async () => {
    const z = await loadLebenszyklus(NOW);
    const sep = z.months.find((m) => m.month === "2026-09")!;
    const aug = z.months.find((m) => m.month === "2026-08")!;
    expect(sep).toMatchObject({ neu: 1, reaktiviert: 1, reaktiviertMrr: 1000, gekuendigt: 1, netto: 1 });
    expect(aug).toMatchObject({ neu: 0, reaktiviert: 0, gekuendigt: 1, kuendigungenEingang: 1, netto: -1 });

    const mSep = z.movement.find((x) => x.to === "2026-09")!;
    expect(mSep.neu).toBe(500);
    expect(mSep.reaktiviert).toBeCloseTo((1000 * 16) / 30, 1); // ab 15.09., Ruhezeit ohne Umsatz
    expect(mSep.gekuendigt).toBe(-800);
    expect(z.movement.find((x) => x.to === "2026-08")!.gekuendigt).toBe(-1000);

    expect(z.stats).toMatchObject({ dormantNow: 1, reactivations: 1, cancelled: 2, rate: 0.5, medianDaysToReactivation: 45 });
    expect(z.byCancelMonth).toEqual([
      { month: "2026-08", cancelled: 1, reactivated: 0, rate: 0 },
      { month: "2026-07", cancelled: 1, reactivated: 1, rate: 1 },
    ]);
    expect(z.reasons.find((r) => r.label === "Es ist mir zu teuer")).toMatchObject({ cancelled: 1, reactivated: 1 });
    expect(z.dormant.map((r) => [r.customerId, r.retention, r.mrr])).toEqual([[c, "3m", 800]]);
    expect(z.reactivations[0]).toMatchObject({ customerId: a, mrr: 1000, dormantDays: 45 });
  });

  it("Reaktivierte zählen nicht als neue Kunden; Übersicht trennt Reaktivierung in der Brücke", async () => {
    const zahlen = await loadZahlen(NOW);
    // Gewinnung (letzte 3 abgeschlossene Monate Aug–Okt): nur b
    expect(zahlen.unit.newCustomers).toBe(1);
    // August: a ruht (kein Umsatz trotz Gebühr ohne Ende)
    const augTotal = zahlen.totals.find((t) => t.month === "2026-08")!;
    expect(augTotal.recurring).toBe(800);
  });

  it("Buchungen: „Reaktiviert“ mit Betrag; Heute: Löschung in 30 Tagen", async () => {
    const r = await loadBuchungen({ monat: "alle" }, NOW);
    const re = r.rows.find((x) => x.art === "reaktivierung" && x.customerId === a)!;
    expect(re).toMatchObject({ monthly: 1000, title: "Konto reaktiviert" });
    expect(re.detail).toContain("Betreuung + Software");
    const due = await dormantDeletionsDue(NOW);
    expect(due.find((x) => x.id === c)).toMatchObject({ mrr: 800, reason: "Gerade keine Zeit (Urlaub, Krankheit, volle Auftragslage)" });
    expect(due.some((x) => x.id === a)).toBe(false);
  });
});
