import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { DUPLICATE_ACROSS_PRODUCTS, ingestPoolLead } from "@/lib/ppl/engine";
import { weekRange } from "@/lib/ppl/periods";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const product = `PKV-Test-${Math.random().toString(36).slice(2, 7)}`;
// Zufällige Nummern: Dubletten gelten produktübergreifend (gemeinsame Test-DB)
const run = String(Math.floor(Math.random() * 1e5)).padStart(5, "0");
const fields = (n: number, extra: Record<string, string> = {}) => ({
  vorname: "Test", nachname: `Person${n}`, telefon: `01511${run}${String(n).padStart(2, "0")}`, email: `p${n}-${product}@test.local`,
  postleitzahl: "80331", beitrag: "900 €", situation: "Angestellt", ...extra,
});

describe("Pay-per-Lead: Eingang, Verteilung, Dubletten", () => {
  const ids: string[] = [];
  beforeAll(async () => {
    requireTestDb();
    for (let i = 0; i < 2; i++) ids.push((await makeCustomer()).id);
    const [a, b] = ids;
    const subA = await prisma.leadSubscription.create({ data: { customerId: a, productKey: product, price: 50, period: "week", delivery: "email", deliveryEmail: "a@test.local" } });
    await prisma.leadSubscription.create({ data: { customerId: b, productKey: product, price: 45, period: "month", goal: 2, plzRanges: "80000-85999", acceptWeak: false, delivery: "email", deliveryEmail: "b@test.local" } });
    const { start, end } = weekRange();
    await prisma.leadOrder.create({ data: { subscriptionId: subA.id, periodStart: start, periodEnd: end, quantity: 2, amount: 100, status: "paid" } });
  });
  afterAll(async () => {
    await prisma.poolLead.deleteMany({ where: { productKey: product } });
    for (const id of ids) await cleanupCustomer(id);
  });

  it("verteilt nach d'Hondt, beachtet Filter, parkt bei vollen Kontingenten", async () => {
    const results = [];
    for (let i = 1; i <= 5; i++) results.push(await ingestPoolLead({ productKey: product, via: "webhook", fields: fields(i) }));
    expect(results.slice(0, 4).every((r) => r.status === "delivered")).toBe(true);
    expect(results[4].status).toBe("parked");
    const [a, b] = ids;
    expect(await prisma.lead.count({ where: { customerId: a } })).toBe(2);
    expect(await prisma.lead.count({ where: { customerId: b } })).toBe(2);
    const rev = await prisma.revenue.aggregate({ where: { customerId: b }, _sum: { amount: true } });
    expect(Number(rev._sum.amount)).toBe(90);
  });

  it("erkennt Dubletten (Telefon oder E-Mail, 30 Tage, über alle Produkte) und ungültige Leads", async () => {
    const dupPhone = await ingestPoolLead({ productKey: product, via: "webhook", fields: { ...fields(1), email: `neu-${product}@test.local` } });
    expect(dupPhone.status).toBe("duplicate");
    const dupMail = await ingestPoolLead({ productKey: product, via: "webhook", fields: { ...fields(2), telefon: `01702${run}99` } });
    expect(dupMail.status).toBe("duplicate");
    // anderes Produkt: auch Dublette (wie der alte Verteil-Zap), Grund nennt das Produkt
    expect(DUPLICATE_ACROSS_PRODUCTS).toBe(true);
    const other = await ingestPoolLead({ productKey: `${product}-anders`, via: "webhook", fields: fields(3) });
    expect(other.status).toBe("duplicate");
    expect(other.reason).toContain(`(${product})`);
    // über die E-Mail allein ebenfalls
    const otherMail = await ingestPoolLead({ productKey: `${product}-anders`, via: "webhook", fields: { ...fields(4), telefon: `01703${run}99` } });
    expect(otherMail.status).toBe("duplicate");
    // neue Person im anderen Produkt: keine Dublette
    const fresh = await ingestPoolLead({ productKey: `${product}-anders`, via: "webhook", fields: fields(20) });
    expect(fresh.status).not.toBe("duplicate");
    // älter als 30 Tage: keine Dublette mehr
    await prisma.poolLead.create({ data: { productKey: `${product}-alt`, via: "airtable", phone: `491704${run}55`, status: "delivered", createdAt: new Date(Date.now() - 31 * 86_400_000) } });
    const old = await ingestPoolLead({ productKey: `${product}-anders`, via: "webhook", fields: { ...fields(21), telefon: `01704${run}55` } });
    expect(old.status).not.toBe("duplicate");
    await prisma.poolLead.deleteMany({ where: { productKey: `${product}-alt` } });
    await prisma.poolLead.deleteMany({ where: { productKey: `${product}-anders` } });
    const invalid = await ingestPoolLead({ productKey: product, via: "webhook", fields: { vorname: "Ohne", nachname: "Kontakt" } });
    expect(invalid.status).toBe("invalid");
  });

  it("schwache Leads nur an Bezüge, die sie nehmen", async () => {
    // Kontingente sind voll → schwacher Lead bleibt geparkt mit Grund
    const r = await ingestPoolLead({ productKey: product, via: "webhook", fields: fields(9, { beitrag: "500" }) });
    expect(r.status).toBe("parked");
  });
});
