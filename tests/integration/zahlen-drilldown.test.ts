import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { loadZahlen } from "@/lib/zahlen";
import { loadProdukte } from "@/lib/produkte";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

// Woraus bestehen die Kopfzahlen? Drilldown je Kunde mit Quelle und Hinweisen,
// Retainer-Ende von Hand, nachgetragene Einmal-Umsätze, Hinweis auf fehlende
// Betreuungsgebühr (nur live) und Tab „Produkte“ – gegen die Datenbank.
const NOW = new Date("2026-11-10T12:00:00Z");
const d = (s: string) => new Date(`${s}T12:00:00Z`);
const uid = () => Math.random().toString(36).slice(2, 8);

describe("Zahlen-Seite: Drilldown und Nachträge", () => {
  const ids: string[] = [];
  const manualIds: string[] = [];
  let nord = "";
  let dupe = "";
  let intern = "";
  let retainer = "";
  let live = "";
  let onboardingOnly = "";

  beforeAll(async () => {
    requireTestDb();
    const tag = uid();
    nord = (await makeCustomer({ name: `Agentur Nord ${tag}`, vermittlerTyp: "vertreter" })).id;
    dupe = (await makeCustomer({ name: `Agentur Nord ${tag} (PKV)` })).id;
    intern = (await makeCustomer({ name: `Intern ${tag}`, plan: "internal" })).id;
    retainer = (await makeCustomer({ name: `Betreuung ${tag}`, plan: "service", retainerMonthly: 500, retainerStart: d("2026-09-01"), retainerEnd: d("2026-10-15") })).id;
    live = (await makeCustomer({ name: `Live ohne Betrag ${tag}`, plan: "service" })).id;
    onboardingOnly = (await makeCustomer({ name: `Im Onboarding ${tag}`, plan: "software" })).id;
    ids.push(nord, dupe, intern, retainer, live, onboardingOnly);
    await prisma.onboarding.create({ data: { customerId: live, liveAt: d("2026-10-01") } });
    await prisma.onboarding.create({ data: { customerId: onboardingOnly } });

    // Agentur Nord: 5 Leads im Oktober (3 aus Airtable, 2 aus dem Lead-Eingang), Produkt Privatschutz
    for (let i = 0; i < 5; i++) {
      const l = await prisma.lead.create({
        data: {
          customerId: nord,
          source: "Allianz Privatschutz",
          airtableId: i < 3 ? `rec${tag}${i}` : null,
          createdAt: d(`2026-10-0${i + 1}`),
          status: i === 0 ? "Abschluss" : i === 1 ? "Termin vereinbart" : null,
          closeValue: i === 0 ? 700 : null,
        },
      });
      await prisma.revenue.create({ data: { customerId: nord, leadId: l.id, amount: 40, occurredAt: d(`2026-10-0${i + 1}`) } });
    }
    await prisma.cost.create({ data: { customerId: nord, kind: "LEAD", product: "Allianz Privatschutz", amount: 100, occurredAt: d("2026-10-03"), note: "Meta: Privatschutz [act_dd]" } });
    // Dublette mit 1 Lead, interner Käufer mit 3 Leads
    await prisma.revenue.create({ data: { customerId: dupe, amount: 40, occurredAt: d("2026-10-07") } });
    for (let i = 0; i < 3; i++) await prisma.revenue.create({ data: { customerId: intern, amount: 40, occurredAt: d("2026-10-08") } });

    // Nachträge: Einrichtung im August (Kunde Nord), Sonstiges im Dezember 2025 ohne Kunde
    manualIds.push((await prisma.manualRevenue.create({ data: { month: "2026-08", customerId: nord, amount: 990, kind: "setup", note: "Papier" } })).id);
    manualIds.push((await prisma.manualRevenue.create({ data: { month: "2025-12", amount: 300, kind: "other" } })).id);
  });

  afterAll(async () => {
    await prisma.manualRevenue.deleteMany({ where: { id: { in: manualIds } } });
    await prisma.cost.deleteMany({ where: { customerId: nord } });
    for (const id of ids) await cleanupCustomer(id);
  });

  it("zeigt je Kunde Leads, Umsatz, Quelle und Hinweise", async () => {
    const z = await loadZahlen(NOW);
    expect(z.lastComplete).toBe("2026-10");
    const oct = z.drill.last;
    const n = oct.customers.find((c) => c.customerId === nord)!;
    expect(n).toMatchObject({ leads: 5, total: 200, link: true });
    expect(n.streams).toEqual([{ stream: "ppl", amount: 200, source: "Airtable-Abgleich (3), Lead-Eingang (2)" }]);
    expect(n.flags.some((f) => f.startsWith("doppelt?"))).toBe(true);

    const du = oct.customers.find((c) => c.customerId === dupe)!;
    expect(du.leads).toBe(1);
    expect(du.flags).toContain("nur 1 Lead");
    expect(du.flags.some((f) => f.includes(`Agentur Nord`))).toBe(true);
    expect(du.streams[0].source).toBe("Umsatz ohne Lead");

    expect(oct.customers.find((c) => c.customerId === intern)!.flags).toContain("intern");

    // Retainer von Hand mit Ende 15.10.: Oktober anteilig, November nichts
    const r = oct.customers.find((c) => c.customerId === retainer)!;
    expect(r.streams).toEqual([{ stream: "service", amount: Math.round(((500 * 15) / 31) * 100) / 100, source: "Retainer in Kundenakte" }]);
    expect(z.drill.current.customers.some((c) => c.customerId === retainer)).toBe(false);

    // Summe des Drilldowns = wiederkehrender Umsatz des Monats
    const t = z.totals.find((x) => x.month === "2026-10")!;
    expect(oct.total).toBeCloseTo(t.recurring, 1);
    expect(z.headline.active).toBe(oct.customers.length);
  });

  it("meldet fehlende Betreuungsgebühr nur für Kunden, die live sind", async () => {
    const z = await loadZahlen(NOW);
    const missing = z.missingRetainer.map((m) => m.customerId);
    expect(missing).toContain(live);
    expect(missing).not.toContain(onboardingOnly);
    expect(missing).not.toContain(retainer);
  });

  it("nachgetragene Einmal-Umsätze: im Umsatzbuch als Einrichtung, je Monat und im Jahr", async () => {
    const z = await loadZahlen(NOW);
    expect(z.totals.find((x) => x.month === "2026-08")!.setup).toBeGreaterThanOrEqual(990);
    const aug = z.oneTime.months.find((m) => m.month === "2026-08")!;
    expect(aug.manualSetup).toBeGreaterThanOrEqual(990);
    // Dezember 2025 liegt vor dem Umsatzbuch, steht aber in der Einmal-Übersicht
    expect(z.oneTime.months.find((m) => m.month === "2025-12")!.other).toBeGreaterThanOrEqual(300);
    expect(z.oneTime.yearKey).toBe("2026");
    expect(z.oneTime.entries.find((e) => e.id === manualIds[0])).toMatchObject({ amount: 990, kind: "setup", customerId: nord });
  });

  it("Tab Produkte: Leads, Kosten je Lead, Abschluss je Vertreter", async () => {
    const p = await loadProdukte("vormonat", NOW);
    const row = p.matrix.find((m) => m.customerId === nord)!;
    const cell = row.cells["Allianz Privatschutz"];
    expect(cell).toMatchObject({ leads: 5, closes: 1, lowSample: true });
    expect(cell.closeRate).toBeCloseTo(0.2, 5);
    expect(cell.cost).toBeGreaterThanOrEqual(100);
    const ps = p.products.find((x) => x.key === "Allianz Privatschutz")!;
    expect(ps.leads).toBeGreaterThanOrEqual(5);
    expect(ps.premiumSum).toBeGreaterThanOrEqual(700);
    // interne Käufer zählen nicht mit
    expect(p.matrix.some((m) => m.customerId === intern)).toBe(false);
  });
});
