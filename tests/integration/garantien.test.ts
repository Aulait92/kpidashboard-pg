// Garantien mit echter Datenbank: der tägliche Cron legt Fälle an, „Gewähren“
// schreibt die Stripe-Gutschrift (gemockt) und das Änderungsprotokoll, granted
// Monate senken das Umsatzbuch.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const stripeState = vi.hoisted(() => ({ invoiceItems: [] as { params: Record<string, unknown>; opts: Record<string, unknown> }[] }));

vi.mock("stripe", () => {
  const s = stripeState;
  class FakeStripe {
    tax = { registrations: { list: async () => ({ data: [{ id: "taxreg_1" }] }) } };
    invoiceItems = {
      create: async (params: Record<string, unknown>, opts: Record<string, unknown>) => {
        s.invoiceItems.push({ params, opts });
        return { id: `ii_${s.invoiceItems.length}` };
      },
    };
  }
  return { default: FakeStripe };
});

import { prisma } from "@/lib/prisma";
import { gewaehreFall, garantieStatus, lehneFallAb, runGarantien } from "@/lib/garantien-server";
import { loadAdminHeute } from "@/lib/admin-heute";
import { loadLedger } from "@/lib/zahlen";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const DAY = 86_400_000;
const D = (s: string) => new Date(`${s}T10:00:00Z`);
const uid = () => Math.random().toString(36).slice(2, 8);
const admin = { id: "admin-test", email: "admin@test.local", role: "ADMIN" };

async function garantieKunde(opts: { leads: number; overdue?: boolean; offerProduct?: string; makler?: boolean }) {
  const n = uid();
  const c = await makeCustomer({
    retainerMonthly: 1000,
    retainerStart: D("2026-11-20"),
    stripeCustomerId: `cus_g_${n}`,
    paymentOverdueSince: opts.overdue ? D("2026-12-20") : null,
    vermittlerTyp: opts.makler ? "makler" : "vertreter",
  });
  const offer = await prisma.offer.create({
    data: {
      number: `GT-${n}`,
      token: `gt-${n}`,
      contactName: "Garantie Test",
      term: "12m",
      products: [{ name: opts.offerProduct ?? "Katzenversicherung (TKV)", dailyBudget: 25 }],
      status: "accepted",
      acceptedAt: D("2026-11-20"),
      setupFee: 990,
      monthlyFee: 1000,
      softwareFee: 300,
      validUntil: D("2026-12-31"),
    },
  });
  await prisma.onboarding.create({ data: { customerId: c.id, offerId: offer.id, status: "live", liveAt: D("2026-11-28") } });
  await prisma.customerAdSpend.createMany({
    data: Array.from({ length: 40 }, (_, i) => ({
      customerId: c.id,
      accountId: "act_test",
      date: new Date(Date.parse("2026-12-01T12:00:00Z") + i * DAY),
      amount: 25,
    })),
  });
  await prisma.lead.createMany({
    data: Array.from({ length: opts.leads }, (_, i) => ({
      customerId: c.id,
      source: "TKV Katze",
      name: `Lead ${i}`,
      createdAt: new Date(D("2026-12-01").getTime() + (i % 25) * DAY),
      status: "Im Gespräch",
    })),
  });
  return { customerId: c.id, offerId: offer.id };
}

describe("Garantien: Cron → Fall → Gewähren/Ablehnen", () => {
  const customers: string[] = [];
  const offers: string[] = [];
  beforeAll(() => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  });
  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    for (const id of customers) await cleanupCustomer(id);
    await prisma.offer.deleteMany({ where: { id: { in: offers } } });
  });
  beforeEach(() => {
    stripeState.invoiceItems = [];
  });

  it("Cron legt Lead-Garantiefall an, Gewähren bucht die Gutschrift und protokolliert", async () => {
    const k = await garantieKunde({ leads: 82 });
    customers.push(k.customerId);
    offers.push(k.offerId);

    // Tag 20: läuft, noch kein Fall
    await runGarantien(D("2026-12-20"));
    expect(await prisma.garantieFall.count({ where: { customerId: k.customerId } })).toBe(0);
    const lauf = await garantieStatus(k.customerId, D("2026-12-20"));
    expect(lauf?.ergebnisse.map((e) => e.status)).toEqual(["laeuft", "laeuft"]);

    // Tag 31: 82 von 100 Leads → Anspruch für Januar
    const res = await runGarantien(D("2026-12-31"));
    expect(res.fehler).toBe(0);
    const [fall] = await prisma.garantieFall.findMany({ where: { customerId: k.customerId } });
    expect(fall).toMatchObject({ art: "lead", monat: "2027-01", status: "offen" });
    expect(fall.kennzahlen).toMatchObject({ status: "anspruch", leads: 82, minLeads: 100, betrag: 1000, startQuelle: "meta" });
    const angelegt = await prisma.auditLog.findFirst({ where: { action: "garantie.fall", entityId: fall.id } });
    expect(angelegt?.actorRole).toBe("system");

    // Erneuter Lauf: kein doppelter Fall
    await runGarantien(D("2027-01-01"));
    expect(await prisma.garantieFall.count({ where: { customerId: k.customerId } })).toBe(1);

    // Admin „Heute“ zeigt den Fall mit Gewähren/Ablehnen
    const heute = await loadAdminHeute(D("2027-01-01"));
    const item = heute.items.find((i) => i.key === `garantie:${fall.id}`);
    expect(item?.title).toMatch(/^Garantiefall: Test \w+ – Lead-Garantie \(82 von 100 Leads\) → Betreuung \+ Software im Januar 2027 kostenlos$/);
    expect(item?.quick).toEqual({ kind: "garantie", fallId: fall.id, grundVorschlag: "" });

    // Gewähren → Stripe-Gutschrift (negativer Posten) + Protokoll
    const ok = await gewaehreFall(fall.id, admin);
    expect(ok.ok).toBe(true);
    expect(stripeState.invoiceItems).toHaveLength(1);
    const { params, opts } = stripeState.invoiceItems[0];
    expect(params).toMatchObject({ customer: expect.stringMatching(/^cus_g_/), amount: -100_000, currency: "eur", tax_behavior: "exclusive" });
    expect(params.description).toBe("Lead-Garantie: Betreuung und Software Januar 2027 kostenlos");
    expect(opts).toEqual({ idempotencyKey: `garantie-${fall.id}` });
    const nachher = await prisma.garantieFall.findUniqueOrThrow({ where: { id: fall.id } });
    expect(nachher).toMatchObject({ status: "gewaehrt", stripeRef: "ii_1", entschiedenVon: "admin@test.local" });
    expect(Number(nachher.betrag)).toBe(1000);
    const log = await prisma.auditLog.findFirst({ where: { action: "garantie.gewaehrt", entityId: fall.id } });
    expect(log).toMatchObject({ actorEmail: "admin@test.local", customerId: k.customerId });
    expect(log?.details).toMatchObject({ monat: "2027-01", betrag: 1000, stripeRef: "ii_1" });

    // Doppelt gewähren geht nicht, keine zweite Gutschrift
    expect((await gewaehreFall(fall.id, admin)).ok).toBe(false);
    expect(stripeState.invoiceItems).toHaveLength(1);

    // Umsatzbuch: Januar ohne Betreuung und Software
    const { ledger } = await loadLedger(D("2027-02-15"));
    const jan = ledger.rows.filter((r) => r.customerId === k.customerId && r.month === "2027-01");
    const feb = ledger.rows.filter((r) => r.customerId === k.customerId && r.month === "2027-02");
    expect(jan).toEqual([]);
    expect(feb.reduce((n, r) => n + r.amount, 0)).toBeCloseTo(1000, 2);
  });

  it("Offene Rechnung: Fall mit „Bedingungen fehlen“, Ablehnen nur mit Begründung", async () => {
    const k = await garantieKunde({ leads: 40, overdue: true });
    customers.push(k.customerId);
    offers.push(k.offerId);
    await runGarantien(D("2026-12-31"));
    const fall = await prisma.garantieFall.findFirstOrThrow({ where: { customerId: k.customerId } });
    expect(fall.kennzahlen).toMatchObject({ status: "bedingungen_fehlen", fehlend: ["Offene Rechnung (Zahlungsverzug)"] });

    const heute = await loadAdminHeute(D("2026-12-31"));
    const item = heute.items.find((i) => i.key === `garantie:${fall.id}`);
    expect(item).toMatchObject({ tone: "info", quick: { kind: "garantie", grundVorschlag: "Bedingungen nicht erfüllt: Offene Rechnung (Zahlungsverzug)" } });

    expect((await lehneFallAb(fall.id, " ", admin)).ok).toBe(false);
    const res = await lehneFallAb(fall.id, "Rechnung seit 20.12. offen", admin);
    expect(res.ok).toBe(true);
    expect(stripeState.invoiceItems).toHaveLength(0);
    expect(await prisma.garantieFall.findUniqueOrThrow({ where: { id: fall.id } })).toMatchObject({ status: "abgelehnt", grund: "Rechnung seit 20.12. offen" });
    expect(await prisma.auditLog.findFirst({ where: { action: "garantie.abgelehnt", entityId: fall.id } })).toMatchObject({ actorEmail: "admin@test.local" });

    // Nach der Ablehnung ändert der Cron den Fall nicht mehr
    await prisma.customer.update({ where: { id: k.customerId }, data: { paymentOverdueSince: null } });
    await runGarantien(D("2027-01-02"));
    expect((await prisma.garantieFall.findUniqueOrThrow({ where: { id: fall.id } })).status).toBe("abgelehnt");
  });

  it("Makler: nach Tag 90 Vertrags-Garantie statt Break-even → Fall in „Heute“, Gewähren schreibt Betreuung + Software gut", async () => {
    const k = await garantieKunde({ leads: 60, makler: true });
    customers.push(k.customerId);
    offers.push(k.offerId);
    // Werbung bis zur Prüfung weiterlaufen lassen (ab 10.1.), 9 Abschlüsse (unter 15)
    await prisma.customerAdSpend.createMany({
      data: Array.from({ length: 51 }, (_, i) => ({
        customerId: k.customerId,
        accountId: "act_test",
        date: new Date(Date.parse("2027-01-10T12:00:00Z") + i * DAY),
        amount: 25,
      })),
    });
    const ls = await prisma.lead.findMany({ where: { customerId: k.customerId }, select: { id: true }, take: 9 });
    await prisma.lead.updateMany({ where: { id: { in: ls.map((l) => l.id) } }, data: { status: "Abschluss", closedAt: D("2027-01-15"), closeValue: 350 } });
    // Prüfung ab 1.3. fällig (90. aktiver Tag = 28.2.)
    await runGarantien(D("2027-03-02"));
    const faelle = await prisma.garantieFall.findMany({ where: { customerId: k.customerId }, orderBy: { art: "asc" } });
    expect(faelle.map((f) => f.art)).toEqual(["lead", "vertrag"]);
    const s = await garantieStatus(k.customerId, D("2027-03-02"));
    expect(s?.ergebnisse.map((e) => e.art)).toEqual(["lead", "vertrag"]);
    const vertrag = faelle.find((f) => f.art === "vertrag")!;
    expect(vertrag.monat).toBe("2027-03");
    expect((vertrag.kennzahlen as { vertraege?: number }).vertraege).toBe(9);

    const heute = await loadAdminHeute(D("2027-03-02"));
    const item = heute.items.find((i) => i.key === `garantie:${vertrag.id}`);
    expect(item?.title).toContain("Vertrags-Garantie (9 von 15 Verträgen) → Betreuung + Software im März 2027 kostenlos");

    stripeState.invoiceItems.length = 0;
    const res = await gewaehreFall(vertrag.id, admin);
    expect(res.ok).toBe(true);
    expect(stripeState.invoiceItems[0].params.amount).toBe(-100000);
    expect(String(stripeState.invoiceItems[0].params.description)).toBe("Vertrags-Garantie: Betreuung und Software März 2027 kostenlos");

    // Monat komplett aus dem Umsatzbuch
    const { ledger } = await loadLedger(D("2027-03-31"));
    expect(ledger.rows.filter((r) => r.customerId === k.customerId && r.month === "2027-03")).toEqual([]);
  });

  it("Angebote ohne Katze/TKV bekommen keine Garantie", async () => {
    const k = await garantieKunde({ leads: 10, offerProduct: "Privatschutz" });
    customers.push(k.customerId);
    offers.push(k.offerId);
    await runGarantien(D("2026-12-31"));
    expect(await prisma.garantieFall.count({ where: { customerId: k.customerId } })).toBe(0);
    expect(await garantieStatus(k.customerId, D("2026-12-31"))).toBeNull();
  });
});
