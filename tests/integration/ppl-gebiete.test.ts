import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ingestPoolLead } from "@/lib/ppl/engine";
import { loadCustomerOverview, loadPplReport } from "@/lib/ppl/auswertung";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

// Heinrich-Fall: Gebietskunde mit Menge je PLZ-Gebiet bekommt Leads aus seinem
// Gebiet zuerst (bis 100 % der Gebietsmenge), danach normale Verteilung.
const product = `PKV-Gebiet-${Math.random().toString(36).slice(2, 7)}`;
const fields = (n: number, plz: string) => ({
  vorname: "Test", nachname: `Gebiet${n}`, telefon: `01522${String(n).padStart(6, "0")}`, email: `g${n}-${product}@test.local`, postleitzahl: plz, beitrag: "900 €", situation: "Angestellt",
});

describe("Pay-per-Lead: Gebietsvorrang mit Menge je Gebiet", () => {
  let heinrich = "";
  let andere = "";
  beforeAll(async () => {
    requireTestDb();
    heinrich = (await makeCustomer()).id;
    andere = (await makeCustomer()).id;
    // Großer Kunde ohne Gebiet: würde nach d'Hondt sonst fast alles bekommen
    await prisma.leadSubscription.create({ data: { customerId: andere, productKey: product, price: 40, period: "month", goal: 100, delivery: "email", deliveryEmail: "x@test.local" } });
    const h = await prisma.leadSubscription.create({ data: { customerId: heinrich, productKey: product, price: 55, period: "month", delivery: "email", deliveryEmail: "h@test.local" } });
    await prisma.subscriptionArea.create({ data: { subscriptionId: h.id, label: "Hamburg", plzRanges: "20000-22999", quantity: 2 } });
  });
  afterAll(async () => {
    await prisma.poolLead.deleteMany({ where: { productKey: product } });
    await cleanupCustomer(heinrich);
    await cleanupCustomer(andere);
  });

  it("Leads aus dem Gebiet gehen an Heinrich bis zur Gebietsmenge, danach an andere", async () => {
    const r1 = await ingestPoolLead({ productKey: product, via: "webhook", fields: fields(1, "20095") });
    const r2 = await ingestPoolLead({ productKey: product, via: "webhook", fields: fields(2, "22041") });
    const r3 = await ingestPoolLead({ productKey: product, via: "webhook", fields: fields(3, "21029") });
    const owner = async (leadId?: string) => (await prisma.lead.findUniqueOrThrow({ where: { id: leadId! } })).customerId;
    expect(await owner(r1.leadId)).toBe(heinrich);
    expect(await owner(r2.leadId)).toBe(heinrich);
    // Gebiet voll (2/2) und kein weiteres Kontingent → der andere Kunde bekommt ihn
    expect(await owner(r3.leadId)).toBe(andere);
    expect(await prisma.poolLead.count({ where: { productKey: product, areaId: { not: null } } })).toBe(2);
  });

  it("Leads außerhalb seiner Gebiete bekommt Heinrich nie", async () => {
    const r = await ingestPoolLead({ productKey: product, via: "webhook", fields: fields(4, "80331") });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: r.leadId! } })).customerId).toBe(andere);
  });

  it("Übersicht und Auswertung zählen die Lieferungen", async () => {
    const rows = await loadCustomerOverview();
    const h = rows.find((r) => r.customerId === heinrich);
    expect(h?.month).toMatchObject({ ordered: 2, delivered: 2 });
    const rep = await loadPplReport("tag", null);
    const today = rep.rows[rep.rows.length - 1];
    expect(today.delivered).toBeGreaterThanOrEqual(4);
  });
});
