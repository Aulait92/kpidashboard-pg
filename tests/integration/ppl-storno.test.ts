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
      data: { customerId, productKey: "PKV-Storno-Test", price: 50, period: "week", stornoErsatz: false, stornoDays: 7, stornoReasons: ["Bestandskunde", "Nicht erreichbar"] },
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
    expect(r).toEqual({ ok: true, state: "approved", anteil: 1 });
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: leadIds[0] } });
    expect(l.status).toBe("Storno");
    expect(Number(l.creditAmount)).toBe(50);
    expect((await prisma.revenue.findFirstOrThrow({ where: { leadId: leadIds[0] } })).cancelled).toBe(true);
  });

  it("lehnt unerlaubte Gründe und abgelaufene Fenster ab, „Sonstiges“ ist ein Grenzfall: 50:50", async () => {
    expect((await requestStorno(leadIds[1], "Gefällt mir nicht", "", { role: "BUYER" })).ok).toBe(false);
    const late = await prisma.lead.create({ data: { customerId, subscriptionId: subId, deliveredAt: new Date(Date.now() - 8 * 86_400_000) } });
    expect((await requestStorno(late.id, "Bestandskunde", "", { role: "BUYER" })).ok).toBe(false);
    const r = await requestStorno(leadIds[1], "Sonstiges", "Nummer gehört jemand anderem", { role: "BUYER" });
    expect(r).toEqual({ ok: true, state: "approved", anteil: 0.5 });
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: leadIds[1] } });
    expect(l.status).toBe("Storno");
    expect(Number(l.creditAmount)).toBe(25);
    const rev = await prisma.revenue.findFirstOrThrow({ where: { leadId: leadIds[1] } });
    expect(rev.cancelled).toBe(false);
    expect(Number(rev.amount)).toBe(25);
  });

  it("50:50 zurücknehmen stellt den vollen Umsatz wieder her", async () => {
    const { undoStorno } = await import("@/lib/ppl/storno");
    expect(await undoStorno(leadIds[1], { role: "ADMIN" })).toEqual({ ok: true, already: false });
    expect(Number((await prisma.revenue.findFirstOrThrow({ where: { leadId: leadIds[1] } })).amount)).toBe(50);
    expect((await requestStorno(leadIds[1], "Sonstiges", "Nummer gehört jemand anderem", { role: "BUYER" })).ok).toBe(true);
  });

  it("Quote über 20 %: zugelassene Gründe trotzdem voll, Altfälle in Prüfung per Admin 50:50", async () => {
    await requestStorno(leadIds[2], "Nicht erreichbar", "", { role: "BUYER" });
    const r = await requestStorno(leadIds[3], "Nicht erreichbar", "", { role: "BUYER" });
    expect(r).toEqual({ ok: true, state: "approved", anteil: 1 });
    expect((await prisma.auditLog.findFirstOrThrow({ where: { entityId: leadIds[3], action: "lead.storno" } })).details).toMatchObject({ hoheQuote: true });
    const alt = await prisma.lead.create({ data: { customerId, subscriptionId: subId, deliveredAt: new Date(), stornoState: "review" } });
    await prisma.revenue.create({ data: { customerId, leadId: alt.id, amount: 50 } });
    expect(await decideStorno(alt.id, "half")).toBe(true);
    expect(Number((await prisma.lead.findUniqueOrThrow({ where: { id: alt.id } })).creditAmount)).toBe(25);
    expect(await decideStorno(alt.id, false)).toBe(false);
  });

  it("verrechnet Gutschriften mit der nächsten Bestellung", async () => {
    const r = await placeOrder({ subscriptionId: subId, weekOffset: 1, quantity: 10, autoRenew: true, markPaid: true });
    expect(r.ok).toBe(true);
    const order = await prisma.leadOrder.findFirstOrThrow({ where: { subscriptionId: subId } });
    // 10 × 50 € − 3 volle Stornos à 50 € − 2 Grenzfälle („Sonstiges“, Altfall) à 25 €
    expect(Number(order.amount)).toBe(300);
    expect(order.status).toBe("paid");
    expect(await prisma.lead.count({ where: { subscriptionId: subId, creditedAt: { not: null } } })).toBe(5);
    const again = await placeOrder({ subscriptionId: subId, weekOffset: 1, quantity: 10, autoRenew: true, markPaid: true });
    expect(again.ok).toBe(false);
  });

  it("„immer automatisch anerkennen“: auch „Sonstiges“ und hohe Quote ohne Prüfung", async () => {
    await prisma.leadSubscription.update({ where: { id: subId }, data: { stornoAutoApprove: true } });
    try {
      const other = await requestStorno(leadIds[4], "Sonstiges", "Hat nie angefragt", { role: "BUYER" });
      expect(other).toEqual({ ok: true, state: "approved", anteil: 1 });
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadIds[4] } })).status).toBe("Storno");
      // Grund-Regeln gelten weiter
      expect((await requestStorno(leadIds[5], "Gefällt mir nicht", "", { role: "BUYER" })).ok).toBe(false);
      expect((await requestStorno(leadIds[5], "Sonstiges", "", { role: "BUYER" })).ok).toBe(false);
    } finally {
      await prisma.leadSubscription.update({ where: { id: subId }, data: { stornoAutoApprove: false } });
    }
  });
});
