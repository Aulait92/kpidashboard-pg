import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { loadZahlen } from "@/lib/zahlen";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

// Zahlen-Seite gegen die Datenbank: Pay-per-Lead (mit Storno), Betreuung +
// Software aus Angebot (mit Pause und Einrichtung), Kosten mit Zweck.
const NOW = new Date("2026-11-10T12:00:00Z");
const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe("Zahlen-Seite: Umsatzbuch aus der Datenbank", () => {
  const ids: string[] = [];
  let offerId = "";
  const costIds: string[] = [];
  let recurringId = "";

  beforeAll(async () => {
    requireTestDb();
    const ppl = await makeCustomer();
    const retainer = await makeCustomer({ retainerMonthly: 1000, retainerStart: d("2026-10-01") });
    ids.push(ppl.id, retainer.id);
    // Pay-per-Lead: Sep 2 × 50, Okt 4 × 50 (+1 storniert), Nov bisher 1 × 50
    const rev = (customerId: string, at: string, cancelled = false) => prisma.revenue.create({ data: { customerId, amount: 50, occurredAt: d(at), cancelled } });
    await Promise.all([
      rev(ppl.id, "2026-09-05"), rev(ppl.id, "2026-09-20"),
      rev(ppl.id, "2026-10-02"), rev(ppl.id, "2026-10-09"), rev(ppl.id, "2026-10-16"), rev(ppl.id, "2026-10-23"), rev(ppl.id, "2026-10-24", true),
      rev(ppl.id, "2026-11-03"),
    ]);
    const offer = await prisma.offer.create({
      data: {
        number: `ZT-${Date.now()}`, token: `zt-${Date.now()}`, contactName: "Test", term: "12m", products: [], status: "accepted",
        setupFee: 990, monthlyFee: 1000, softwareFee: 349, validUntil: d("2026-12-31"), acceptedAt: d("2026-09-25"), paidAt: d("2026-09-26"), subscriptionStatus: "active",
      },
    });
    offerId = offer.id;
    await prisma.onboarding.create({ data: { customerId: retainer.id, offerId: offer.id } });
    // Pause 16.–31.10.: nur Software zählt
    await prisma.customerPause.create({ data: { customerId: retainer.id, startsAt: d("2026-10-16"), endsAt: d("2026-10-31"), status: "ended", kind: "customer" } });
    const c1 = await prisma.cost.create({ data: { kind: "LEAD", product: "Test", amount: 80, occurredAt: d("2026-10-10"), note: "Meta: PKV Leads (2026-10-10) [act_zt]" } });
    const c2 = await prisma.cost.create({ data: { kind: "LEAD", product: "Test", amount: 30, occurredAt: d("2026-10-11"), note: "Meta: Allianz Lead Ads Oktober (2026-10-11) [act_zt]" } });
    costIds.push(c1.id, c2.id);
    recurringId = (await prisma.recurringCost.create({ data: { name: "Instantly", monthlyAmount: 97, purpose: "akquise", startsAt: d("2026-09-01") } })).id;
    // Wirkung: Betreuungskunde meldet Ergebnisse (6 Leads, 5 mit Ergebnis, 2 Abschlüsse Privatschutz)
    const statuses = ["Abschluss", "Abschluss", "Kein Interesse", "In Beratung", "Nicht erreicht", "Neuer Lead"];
    for (let i = 0; i < statuses.length; i++) {
      await prisma.lead.create({
        data: { customerId: retainer.id, source: "Allianz Privatschutz", status: statuses[i], createdAt: d(`2026-10-0${i + 1}`), reached: i < 4, closeValue: statuses[i] === "Abschluss" ? 600 : null },
      });
    }
  });

  afterAll(async () => {
    await prisma.cost.deleteMany({ where: { id: { in: costIds } } });
    await prisma.recurringCost.deleteMany({ where: { id: recurringId } });
    for (const id of ids) await cleanupCustomer(id);
    await prisma.offer.deleteMany({ where: { id: offerId } });
  });

  it("Sicht „Kerngeschäft“: ohne Pay-per-Lead-Umsatz und -Kosten, Pay-per-Lead-Reiter unverändert", async () => {
    const [gesamt, kern] = await Promise.all([loadZahlen(NOW, "gesamt"), loadZahlen(NOW, "kern")]);
    expect(gesamt.sicht).toBe("gesamt");
    expect(kern.sicht).toBe("kern");
    const oct = kern.totals.find((t) => t.month === "2026-10")!;
    expect(oct.ppl).toBe(0);
    expect(oct.software).toBe(349);
    // MRR ohne Pay-per-Lead; Gesamtumsatz zur Einordnung bleibt sichtbar
    expect(kern.headline.mrr).toBe(1000);
    expect(kern.allRecurring.current).toBe(1150);
    expect(kern.allRecurring.pplCurrent).toBe(150);
    expect(gesamt.headline.mrr).toBe(1150);
    // Aktive Kunden im Oktober: nur der Retainer-Kunde
    expect(kern.headline.active).toBe(gesamt.headline.active - 1);
    // Direkte Pay-per-Lead-Kosten (Meta 80 €) zählen nicht in die Marge
    expect(kern.costTable.some((c) => c.purpose === "ppl")).toBe(false);
    expect(gesamt.costTable.some((c) => c.name.startsWith("Meta-Werbung für Kunden-Leads"))).toBe(true);
    expect(kern.headline.grossMargin!).toBeGreaterThan(gesamt.headline.grossMargin!);
    // Drilldown respektiert die Sicht
    expect(kern.drill.last.customers.every((c) => c.streams.every((x) => x.stream !== "ppl"))).toBe(true);
    // Pay-per-Lead-Reiter rechnet weiter mit allen Daten
    expect(kern.ppl.months.find((m) => m.month === "2026-10")).toEqual(gesamt.ppl.months.find((m) => m.month === "2026-10"));
    expect(kern.pplPilot.from).toBe("2026-06");
  });

  it("rechnet Ströme, Hochrechnung, Brücke und Kosten richtig", async () => {
    const z = await loadZahlen(NOW);
    const oct = z.totals.find((t) => t.month === "2026-10")!;
    const nov = z.totals.find((t) => t.month === "2026-11")!;
    const sep = z.totals.find((t) => t.month === "2026-09")!;

    // Pay-per-Lead: Storno nicht gezählt, Nov hochgerechnet (50 × 30/10)
    expect(oct.ppl).toBe(200);
    expect(nov.ppl).toBe(150);
    // Okt: Software voll 349, Betreuung nur 15 von 31 Tagen (Pause ab 16.)
    expect(oct.software).toBe(349);
    expect(oct.service).toBeCloseTo((651 * 15) / 31, 1);
    // Einrichtung einmalig im Monat der Zahlung, nie im MRR
    expect(sep.setup).toBe(990);
    expect(sep.recurring).toBe(100);
    // Kopfzeile: MRR = Nov (hochgerechnet), vertraglich = Software + Betreuung
    expect(z.headline.mrr).toBe(150 + 1000);
    expect(z.headline.contractual).toBe(1000);
    expect(z.headline.arr).toBe(1150 * 12);

    // MRR-Brücke Sep → Okt: Retainer-Kunde neu, Lead-Käufer ausgebaut
    expect(z.bridge).toMatchObject({ from: "2026-09", to: "2026-10", start: 100, ausbau: 100 });
    expect(z.bridge!.counts.neu).toBe(1);

    // Kosten: „Allianz Lead Ads“ = Kundengewinnung, Rest direkt; Instantly = Kundengewinnung
    const meta = z.costTable.find((c) => c.name === "Meta-Werbung für Kunden-Leads");
    const acq = z.costTable.find((c) => c.purpose === "akquise" && c.name.startsWith("Meta"));
    expect(meta?.amount).toBe(80);
    expect(acq?.amount).toBe(30);
    expect(z.costTable.find((c) => c.name === "Instantly")?.amount).toBe(97);
    // Marge Pay-per-Lead Okt = (200 − 80) / 200
    expect(z.margins.ppl).toBeCloseTo(0.6, 5);

    // Wirkung: Leads ohne Storno-Status zählen mit (NULL ≠ „approved“)
    expect(z.impact.funnel[0].v).toBeGreaterThanOrEqual(6);
    expect(z.impact.qualifying).toBe(1); // 5 von 6 = 83 % mit Ergebnis
    expect(z.impact.closes).toBe(2);
    expect(z.impact.provision).toBe(2 * 600 * 0.55); // Vertreter-Standard Privatschutz
    expect(z.impact.perEuro).toBeGreaterThan(0);
  });
});
