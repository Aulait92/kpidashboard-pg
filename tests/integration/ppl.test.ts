import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ingestPoolLead } from "@/lib/ppl/engine";
import { weekRange } from "@/lib/ppl/periods";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const product = `PKV-Test-${Math.random().toString(36).slice(2, 7)}`;
const fields = (n: number, extra: Record<string, string> = {}) => ({
  vorname: "Test", nachname: `Person${n}`, telefon: `01511234${String(n).padStart(4, "0")}`, email: `p${n}-${product}@test.local`,
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

  it("erkennt Dubletten (Telefon oder E-Mail, 30 Tage, je Produkt) und ungültige Leads", async () => {
    const dupPhone = await ingestPoolLead({ productKey: product, via: "webhook", fields: { ...fields(1), email: "neu@test.local" } });
    expect(dupPhone.status).toBe("duplicate");
    const dupMail = await ingestPoolLead({ productKey: product, via: "webhook", fields: { ...fields(2), telefon: "01700000000" } });
    expect(dupMail.status).toBe("duplicate");
    // anderes Produkt: keine Dublette (nur innerhalb desselben Produkts)
    const other = await ingestPoolLead({ productKey: `${product}-anders`, via: "webhook", fields: fields(3) });
    expect(other.status).not.toBe("duplicate");
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
