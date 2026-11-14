// Prämie „Bestandskunden-Modul N Monate gratis“ (Kollegen empfehlen, Ole 14.11.2026):
// Modul nicht gebucht → buchen + N Monatsbeiträge gutschreiben, gratis bis +N Monate;
// schon gebucht → gutschreiben; kostenlos (Makler/Bestandsschutz) → Admin-Aufgabe;
// mehrere Empfehlungen addieren sich; Hinweis 7 Tage vor Ende genau einmal (AGB, 14.11.2026).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const billing = vi.hoisted(() => ({ credits: [] as { stripeCustomerId: string; amountEur: number; fallId: string }[], booked: [] as string[] }));

vi.mock("@/lib/billing", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/billing")>();
  const { prisma } = await import("@/lib/prisma");
  return {
    ...orig,
    billingEnabled: () => true,
    addGarantieGutschrift: async (o: { stripeCustomerId: string; amountEur: number; fallId: string }) => {
      billing.credits.push({ stripeCustomerId: o.stripeCustomerId, amountEur: o.amountEur, fallId: o.fallId });
      return `ii_${o.fallId}`;
    },
    // Stripe-Teil ist in tests/integration/preise.test.ts geprüft; hier nur die Wirkung am Kunden
    setBestandModule: async (customerId: string, mode: string) => {
      billing.booked.push(`${customerId}:${mode}`);
      await prisma.customer.update({ where: { id: customerId }, data: { existingCustomersEnabled: true, bestandMonthly: 149, bestandGrandfathered: false } });
      return { ok: true, changed: true };
    },
  };
});

import { prisma } from "@/lib/prisma";
import { addMonths, remindBestandFreeEnd, rewardReferralForOffer } from "@/lib/kollegen";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const DAY = 24 * 60 * 60 * 1000;

describe("Empfehlungsprämie: Bestandskunden-Modul gratis", () => {
  const customers: string[] = [];
  const contacts: string[] = [];

  beforeAll(async () => {
    requireTestDb();
    await prisma.referralSettings.deleteMany({});
    await prisma.referralSettings.create({ data: { id: "default", rewardKind: "bestand", rewardMonths: 3, benefitKind: "setup_discount", benefitAmount: 300 } });
  });
  beforeEach(() => {
    billing.credits = [];
    billing.booked = [];
  });
  afterAll(async () => {
    await prisma.offer.deleteMany({ where: { salesContactId: { in: contacts } } });
    await prisma.salesTask.deleteMany({ where: { title: { contains: "Bestandskunden-Modul" }, note: { contains: "Praemie-Test" } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
    for (const id of customers) await cleanupCustomer(id);
    await prisma.referralSettings.deleteMany({});
  });

  async function referrer(extra: Record<string, unknown> = {}) {
    const c = await makeCustomer({ stripeCustomerId: `cus_b_${uid()}`, ...extra });
    customers.push(c.id);
    await makeBuyer(c.id, "owner");
    return c;
  }

  /** Empfehlung + angenommenes Angebot des Neukunden; danach Prämie wie im Stripe-Webhook. */
  async function winReferral(referrerId: string) {
    const contact = await prisma.salesContact.create({ data: { name: `Praemie-Test ${uid()}`, email: `p-${uid()}@kollegen-agentur.test` } });
    contacts.push(contact.id);
    await prisma.colleagueReferral.create({ data: { referrerId, contactId: contact.id, name: "Kai", consentAt: new Date(Date.now() - 1000), consentText: "ok", createdAt: new Date(Date.now() - 1000) } });
    const n = uid();
    const offer = await prisma.offer.create({
      data: { number: `PB-${n}`, token: `pb-${n}-${uid()}-${uid()}`, contactName: "Kai", company: `Praemie-Test ${n}`, term: "none", products: [], setupFee: 2190, monthlyFee: 1000, softwareFee: 0, validUntil: new Date(Date.now() + 10 * DAY), salesContactId: contact.id, status: "accepted", acceptedAt: new Date() },
    });
    return rewardReferralForOffer(offer.id);
  }

  it("Modul nicht gebucht: wird gebucht, 3 × 149 € gutgeschrieben, gratis bis +3 Monate", async () => {
    const c = await referrer();
    const now = new Date();
    expect(await winReferral(c.id)).toBe("credited");
    expect(billing.booked).toEqual([`${c.id}:book`]);
    expect(billing.credits).toHaveLength(1);
    expect(billing.credits[0]).toMatchObject({ stripeCustomerId: c.stripeCustomerId, amountEur: 447 });
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.bestandFreeUntil).not.toBeNull();
    const diff = after.bestandFreeUntil!.getTime() - addMonths(now, 3).getTime();
    expect(Math.abs(diff)).toBeLessThan(60 * 1000);
    const ref = await prisma.colleagueReferral.findFirstOrThrow({ where: { referrerId: c.id } });
    expect(ref.rewardStatus).toBe("credited");
    expect(Number(ref.rewardAmount)).toBe(447);

    // zweite Empfehlung: addiert sich (Gratiszeit +3 Monate, nochmal 3 Beiträge)
    expect(await winReferral(c.id)).toBe("credited");
    expect(billing.booked).toHaveLength(1); // nicht noch einmal gebucht
    expect(billing.credits).toHaveLength(2);
    const again = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(again.bestandFreeUntil!.getTime()).toBe(addMonths(after.bestandFreeUntil!, 3).getTime());
  });

  it("Modul schon gebucht (bezahlt): 3 Monatsbeiträge gutschreiben, keine Gratiszeit", async () => {
    const c = await referrer({ existingCustomersEnabled: true, bestandMonthly: 129 });
    expect(await winReferral(c.id)).toBe("credited");
    expect(billing.booked).toHaveLength(0);
    expect(billing.credits[0].amountEur).toBe(387);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).bestandFreeUntil).toBeNull();
  });

  it("Modul kostenlos (Makler inklusive bzw. Bestandsschutz): Admin-Aufgabe, nichts gebucht", async () => {
    const makler = await referrer({ existingCustomersEnabled: true, bestandMonthly: 0 });
    expect(await winReferral(makler.id)).toBe("manual");
    const schutz = await referrer({ existingCustomersEnabled: true, bestandGrandfathered: true });
    expect(await winReferral(schutz.id)).toBe("manual");
    expect(billing.credits).toHaveLength(0);
    expect(billing.booked).toHaveLength(0);
    const tasks = await prisma.salesTask.count({ where: { title: { startsWith: "Prämie entscheiden" }, doneAt: null, note: { contains: "Praemie-Test" } } });
    expect(tasks).toBeGreaterThanOrEqual(2);
  });

  it("Hinweis 7 Tage vor Ende der Gratiszeit genau einmal", async () => {
    const now = new Date();
    const soon = await referrer({ existingCustomersEnabled: true, bestandMonthly: 149, bestandFreeUntil: new Date(now.getTime() + 6 * DAY) });
    const later = await referrer({ existingCustomersEnabled: true, bestandMonthly: 149, bestandFreeUntil: new Date(now.getTime() + 10 * DAY) });
    expect(await remindBestandFreeEnd(now)).toBeGreaterThanOrEqual(1);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: soon.id } })).bestandFreeReminded).not.toBeNull();
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: later.id } })).bestandFreeReminded).toBeNull();
    expect(await remindBestandFreeEnd(now)).toBe(0);
  });
});
