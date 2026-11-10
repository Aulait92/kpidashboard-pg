import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { requestStorno, decideStorno } from "@/lib/ppl/storno";
import { placeOrder } from "@/lib/ppl/orders";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

describe("Pay-per-Lead: Storno und Bestellung", () => {
  let customerId = "";
  let subId = "";
  const leadIds: string[] = [];
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
    const sub = await prisma.leadSubscription.create({
      data: { customerId, productKey: "PKV-Storno-Test", price: 50, period: "week", stornoDays: 7, stornoReasons: ["Bestandskunde", "Nicht erreichbar"] },
    });
    subId = sub.id;
    for (let i = 0; i < 10; i++) {
      const l = await prisma.lead.create({ data: { customerId, source: "PKV-Storno-Test", status: "Neuer Lead", subscriptionId: sub.id, deliveredAt: new Date(Date.now() - i * 3600_000) } });
      await prisma.revenue.create({ data: { customerId, leadId: l.id, amount: 50 } });
      leadIds.push(l.id);
    }
  });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { customerId } });
    await cleanupCustomer(customerId);
  });

  it("genehmigt erlaubte Gründe sofort (ersatzlos, mit Gutschrift)", async () => {
    const r = await requestStorno(leadIds[0], "Bestandskunde", "", { role: "BUYER" });
    expect(r).toEqual({ ok: true, state: "approved" });
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: leadIds[0] } });
    expect(l.status).toBe("Storno");
    expect(Number(l.creditAmount)).toBe(50);
    expect((await prisma.revenue.findFirstOrThrow({ where: { leadId: leadIds[0] } })).cancelled).toBe(true);
  });

  it("lehnt unerlaubte Gründe und abgelaufene Fenster ab, „Sonstiges“ geht in Prüfung", async () => {
    expect((await requestStorno(leadIds[1], "Gefällt mir nicht", "", { role: "BUYER" })).ok).toBe(false);
    const late = await prisma.lead.create({ data: { customerId, subscriptionId: subId, deliveredAt: new Date(Date.now() - 8 * 86_400_000) } });
    expect((await requestStorno(late.id, "Bestandskunde", "", { role: "BUYER" })).ok).toBe(false);
    const r = await requestStorno(leadIds[1], "Sonstiges", "Nummer gehört jemand anderem", { role: "BUYER" });
    expect(r).toEqual({ ok: true, state: "review" });
    expect(await decideStorno(leadIds[1], false)).toBe(true);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadIds[1] } })).stornoState).toBe("rejected");
  });

  it("Quote über 20 % → Prüfung", async () => {
    await requestStorno(leadIds[2], "Nicht erreichbar", "", { role: "BUYER" });
    const r = await requestStorno(leadIds[3], "Nicht erreichbar", "", { role: "BUYER" });
    expect(r).toEqual({ ok: true, state: "review" });
  });

  it("verrechnet Gutschriften mit der nächsten Bestellung", async () => {
    const r = await placeOrder({ subscriptionId: subId, weekOffset: 1, quantity: 10, autoRenew: true, markPaid: true });
    expect(r.ok).toBe(true);
    const order = await prisma.leadOrder.findFirstOrThrow({ where: { subscriptionId: subId } });
    // 10 × 50 € − 2 genehmigte Stornos à 50 €
    expect(Number(order.amount)).toBe(400);
    expect(order.status).toBe("paid");
    expect(await prisma.lead.count({ where: { subscriptionId: subId, creditedAt: { not: null } } })).toBe(2);
    const again = await placeOrder({ subscriptionId: subId, weekOffset: 1, quantity: 10, autoRenew: true, markPaid: true });
    expect(again.ok).toBe(false);
  });

  it("„immer automatisch anerkennen“: auch „Sonstiges“ und hohe Quote ohne Prüfung", async () => {
    await prisma.leadSubscription.update({ where: { id: subId }, data: { stornoAutoApprove: true } });
    try {
      const other = await requestStorno(leadIds[4], "Sonstiges", "Hat nie angefragt", { role: "BUYER" });
      expect(other).toEqual({ ok: true, state: "approved" });
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadIds[4] } })).status).toBe("Storno");
      // Grund-Regeln gelten weiter
      expect((await requestStorno(leadIds[5], "Gefällt mir nicht", "", { role: "BUYER" })).ok).toBe(false);
      expect((await requestStorno(leadIds[5], "Sonstiges", "", { role: "BUYER" })).ok).toBe(false);
    } finally {
      await prisma.leadSubscription.update({ where: { id: subId }, data: { stornoAutoApprove: false } });
    }
  });
});
