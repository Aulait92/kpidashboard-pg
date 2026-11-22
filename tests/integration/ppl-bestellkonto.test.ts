// Bestellkonto (Ole, 22.11.2026, lib/ppl/bestellkonto.ts): Hauptkunde (z. B. Nico Yagci) bestellt und bezahlt die
// Wochenbestellungen seines Vertriebspartners (z. B. Dennis Müller). Abbuchung über die Zahlungsart des Hauptkunden,
// Umsatzsteuer nach dessen Registerprüfung, Leads und Bestellung am Bezug des Partners.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const charges = vi.hoisted(() => [] as { stripeCustomerId: string; description: string; steuer?: string; metadata: Record<string, string> }[]);
vi.mock("@/lib/billing", () => ({
  billingEnabled: () => true,
  hasPaymentMethod: async (id: string | null) => id === "cus_haupt",
  chargeNow: async (o: { stripeCustomerId: string; description: string; steuer?: string; metadata: Record<string, string> }) => {
    charges.push(o);
    return { status: "paid", invoiceId: `in_${charges.length}_${Math.random().toString(36).slice(2, 8)}`, totalEur: Number.NaN };
  },
}));

import { prisma } from "@/lib/prisma";
import { placeOrder } from "@/lib/ppl/orders";
import { darfBestellen, istReinesBestellkonto, partnerBezuege, zahlerVon } from "@/lib/ppl/bestellkonto";
import { wartendeFreigeben } from "@/lib/ppl/erste-woche";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

describe("Bestellkonto: Hauptkunde bestellt für Vertriebspartner", () => {
  let hauptId = "";
  let partnerId = "";
  let subId = "";
  beforeAll(async () => {
    requireTestDb();
    hauptId = (await makeCustomer({ stripeCustomerId: "cus_haupt", vermittlerRegisterNr: "D-C9FQ-V848D-75", vermittlerRegisterStatus: "makler", vermittlerGeprueftAt: new Date() })).id;
    // Partner selbst ohne Zahlungsart und ohne Registerprüfung: bezahlt wird trotzdem, steuerfrei über den Hauptkunden
    partnerId = (await makeCustomer({ bestelltUeberId: hauptId })).id;
    subId = (await prisma.leadSubscription.create({ data: { customerId: partnerId, productKey: "PKV-Tarifoptimierung", price: 50, period: "week", delivery: "app_pdf" } })).id;
  });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { customerId: { in: [hauptId, partnerId] } } });
    await cleanupCustomer(partnerId);
    await cleanupCustomer(hauptId);
  });

  it("bucht beim Hauptkunden ab, steuerfrei nach dessen Prüfung, Bestellung am Bezug des Partners", async () => {
    const r = await placeOrder({ subscriptionId: subId, weekOffset: 1, quantity: 10, autoRenew: true, actor: { role: "BUYER" } });
    expect(r.ok).toBe(true);
    expect(charges).toHaveLength(1);
    expect(charges[0].stripeCustomerId).toBe("cus_haupt");
    expect(charges[0].steuer).toBe("steuerfrei_4_11");
    expect(charges[0].description).toContain("für Test");
    expect(charges[0].metadata).toMatchObject({ customer_id: partnerId, zahler_id: hauptId });
    const order = await prisma.leadOrder.findFirstOrThrow({ where: { subscriptionId: subId } });
    expect(order).toMatchObject({ status: "paid", quantity: 10, steuer: "steuerfrei_4_11", autoRenew: true });
  });

  it("ohne Bestellkonto zahlt der Kunde selbst (hier ohne Zahlungsart: keine Abbuchung)", async () => {
    await prisma.customer.update({ where: { id: partnerId }, data: { bestelltUeberId: null } });
    const r = await placeOrder({ subscriptionId: subId, weekOffset: 0, quantity: 10, autoRenew: false });
    expect(r).toEqual({ ok: false, error: "Bitte zuerst eine Zahlungsart hinterlegen." });
    expect(charges).toHaveLength(1);
    await prisma.leadOrder.deleteMany({ where: { subscriptionId: subId, status: "open" } });
    await prisma.customer.update({ where: { id: partnerId }, data: { bestelltUeberId: hauptId } });
  });

  it("Rechte: nur der Hauptkunde bestellt, der Partner nicht mehr selbst", () => {
    const bezug = { customerId: partnerId, customer: { bestelltUeberId: hauptId } };
    expect(darfBestellen(hauptId, bezug)).toBe(true);
    expect(darfBestellen(partnerId, bezug)).toBe(false);
    expect(darfBestellen("fremd", bezug)).toBe(false);
    expect(darfBestellen(partnerId, { customerId: partnerId, customer: { bestelltUeberId: null } })).toBe(true);
    expect(zahlerVon({ id: "p", bestelltUeber: { id: "h" } })).toEqual({ id: "h" });
    expect(zahlerVon({ id: "p", bestelltUeber: null })).toEqual({ id: "p", bestelltUeber: null });
  });

  it("reines Bestellkonto und Partnerbezüge", async () => {
    expect(await istReinesBestellkonto(hauptId)).toBe(true);
    expect(await istReinesBestellkonto(partnerId)).toBe(false);
    expect((await partnerBezuege(hauptId)).map((s) => s.id)).toEqual([subId]);
    expect(await partnerBezuege(partnerId)).toEqual([]);
  });

  it("Registerprüfung am Hauptkunden gibt wartende Bestellungen des Partners frei", async () => {
    const w = await prisma.leadOrder.create({
      data: { subscriptionId: subId, periodStart: new Date("2026-01-05T00:00:00Z"), periodEnd: new Date("2026-01-12T00:00:00Z"), quantity: 5, amount: 250, status: "wartet" },
    });
    const res = await wartendeFreigeben(hauptId, { role: "system" }, new Date("2027-03-03T10:00:00Z"));
    expect(res.waiting).toBe(0);
    expect(res.released + res.failed).toBe(1);
    expect(charges.at(-1)?.stripeCustomerId).toBe("cus_haupt");
    await prisma.leadOrder.deleteMany({ where: { id: w.id } });
  });
});
