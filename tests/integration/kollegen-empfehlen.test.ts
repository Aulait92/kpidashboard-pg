// „Kollegen empfehlen“: Landingpage → Vertriebskontakt mit Quelle und Aufgabe,
// Dubletten, Selbstempfehlung, Prämie nach erster Zahlung (Stripe gemockt,
// genau einmal), ohne Stripe → Admin-Aufgabe, Hinweise nur einmal.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const credit = vi.hoisted(() => ({ calls: [] as { stripeCustomerId: string; amountEur: number; fallId: string }[], enabled: true }));

vi.mock("@/lib/billing", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/billing")>();
  return {
    ...orig,
    billingEnabled: () => credit.enabled,
    addGarantieGutschrift: async (o: { stripeCustomerId: string; amountEur: number; fallId: string }) => {
      credit.calls.push({ stripeCustomerId: o.stripeCustomerId, amountEur: o.amountEur, fallId: o.fallId });
      return `ii_${o.fallId}`;
    },
  };
});

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { handleStripeEvent } from "@/lib/billing-webhook";
import { closeReferralNudge, ensureReferralCode, loadReferralNudge, submitReferral } from "@/lib/kollegen";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const DAY = 24 * 60 * 60 * 1000;

describe("Kollegen empfehlen", () => {
  const customers: string[] = [];
  const emails: string[] = [];
  let referrerId = "";
  let code = "";
  const tag = uid();

  beforeAll(async () => {
    requireTestDb();
    await prisma.referralSettings.deleteMany({});
    const c = await makeCustomer({ retainerMonthly: 1400, stripeCustomerId: `cus_ref_${tag}` });
    referrerId = c.id;
    customers.push(c.id);
    await makeBuyer(c.id, "owner");
    code = await ensureReferralCode(c.id);
  });

  beforeEach(() => {
    credit.calls = [];
    credit.enabled = true;
  });

  afterAll(async () => {
    await prisma.salesContact.deleteMany({ where: { email: { in: emails } } });
    await prisma.salesTask.deleteMany({ where: { contactId: null, title: { startsWith: "Prämie manuell gutschreiben" }, note: { contains: "Agentur Kollege" } } });
    for (const id of customers) await cleanupCustomer(id);
    await prisma.referralSettings.deleteMany({});
  });

  const form = (email: string, extra: Partial<{ name: string; company: string; phone: string; consent: boolean }> = {}) => {
    emails.push(email.toLowerCase());
    return { code, name: "Kai Kollege", company: `Agentur Kollege ${tag}`, email, phone: "0170 1234567", consent: true, ...extra };
  };

  it("der Code ist stabil je Kunde", async () => {
    expect(await ensureReferralCode(referrerId)).toBe(code);
  });

  it("Formular → Vertriebskontakt mit Quelle „Empfehlung“, Aufgabe „heute anrufen“", async () => {
    const r = await submitReferral(form(`kai-${tag}@kollegen-agentur.test`));
    expect(r.ok).toBe(true);
    const contactId = r.ok ? r.contactId! : "";
    const contact = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId }, include: { tasks: true } });
    expect(contact.customerSource).toBe("EMPFEHLUNG");
    expect(contact.customerSourceNote).toContain("Empfehlung von");
    expect(contact.tasks.some((t) => t.title === "Empfehlung – heute anrufen" && !t.doneAt)).toBe(true);
    const ref = await prisma.colleagueReferral.findFirstOrThrow({ where: { contactId } });
    expect(ref.referrerId).toBe(referrerId);
    expect(ref.consentText).toContain("einverstanden");
    expect(ref.status).toBe("open");
  });

  it("ohne Einwilligung oder Pflichtfelder wird nichts gespeichert", async () => {
    expect(await submitReferral(form(`ohne-${tag}@kollegen-agentur.test`, { consent: false }))).toMatchObject({ ok: false, code: "consent" });
    expect(await submitReferral(form(`kurz-${tag}@kollegen-agentur.test`, { phone: "12" }))).toMatchObject({ ok: false, code: "fields" });
    expect(await prisma.salesContact.count({ where: { email: { in: [`ohne-${tag}@kollegen-agentur.test`, `kurz-${tag}@kollegen-agentur.test`] } } })).toBe(0);
  });

  it("Dublette: gleiche E-Mail (andere Schreibweise) → kein zweiter Kontakt", async () => {
    const email = `doppelt-${tag}@kollegen-agentur.test`;
    const first = await submitReferral(form(email));
    const second = await submitReferral(form(email.toUpperCase()));
    expect(first.ok && second.ok).toBe(true);
    expect(await prisma.salesContact.count({ where: { email } })).toBe(1);
    const refs = await prisma.colleagueReferral.findMany({ where: { email } });
    expect(refs).toHaveLength(2);
    expect(refs.find((r) => r.existingContact)).toBeTruthy();
  });

  it("Selbstempfehlung (eigene Login-Adresse bzw. eigene Firmen-Domain) wird blockiert", async () => {
    const owner = await prisma.user.findFirstOrThrow({ where: { customerId: referrerId } });
    const domain = owner.email.split("@")[1];
    expect(await submitReferral(form(owner.email))).toMatchObject({ ok: false, code: "self" });
    expect(await submitReferral(form(`kollegin-${tag}@${domain}`))).toMatchObject({ ok: false, code: "self" });
    expect(await prisma.salesContact.count({ where: { email: owner.email } })).toBe(0);
  });

  it("ungültiger Code → keine Annahme", async () => {
    expect(await submitReferral({ ...form(`x-${tag}@kollegen-agentur.test`), code: "zzzzzzz" })).toMatchObject({ ok: false, code: "invalid" });
  });

  async function wonOffer(contactId: string, n: string) {
    return prisma.offer.create({
      data: {
        number: `KE-${n}`,
        token: `ke-${n}`,
        contactName: "Kai Kollege",
        company: `Agentur Kollege ${n}`,
        term: "none",
        products: [],
        setupFee: 990,
        monthlyFee: 1000,
        softwareFee: 0,
        validUntil: new Date("2027-01-31"),
        salesContactId: contactId,
        status: "accepted",
        acceptedAt: new Date(),
        stripeSubscriptionId: `sub_ke_${n}`,
      },
    });
  }
  const invoicePaid = (id: string, sub: string) =>
    ({
      id,
      type: "invoice.paid",
      data: { object: { id: `in_${id}`, number: `R-${id}`, customer: `cus_new_${id}`, amount_paid: 119000, amount_due: 119000, metadata: {}, parent: { subscription_details: { subscription: sub } } } },
    }) as unknown as Stripe.Event;

  it("erste Zahlung des Neukunden → genau eine Gutschrift beim Empfehler", async () => {
    const r = await submitReferral(form(`zahlt-${tag}@kollegen-agentur.test`));
    const contactId = r.ok ? r.contactId! : "";
    const n = uid();
    await new Promise((res) => setTimeout(res, 5)); // Empfehlung liegt vor der Annahme
    const offer = await wonOffer(contactId, n);
    await handleStripeEvent(invoicePaid(`evt_a_${n}`, offer.stripeSubscriptionId!));
    await handleStripeEvent(invoicePaid(`evt_b_${n}`, offer.stripeSubscriptionId!));
    expect(credit.calls).toHaveLength(1);
    expect(credit.calls[0]).toMatchObject({ stripeCustomerId: `cus_ref_${tag}`, amountEur: 1400 });
    const ref = await prisma.colleagueReferral.findFirstOrThrow({ where: { contactId } });
    expect(ref.rewardStatus).toBe("credited");
    expect(Number(ref.rewardAmount)).toBe(1400);
    expect(ref.wonAt).not.toBeNull();
    expect(ref.offerId).toBe(offer.id);
    expect(await prisma.auditLog.count({ where: { action: "referral.reward", entityId: ref.id } })).toBe(1);
  });

  it("ohne Stripe-Kunde des Empfehlers → Admin-Aufgabe „Prämie manuell gutschreiben“", async () => {
    const other = await makeCustomer({ retainerMonthly: 1000 });
    customers.push(other.id);
    await makeBuyer(other.id, "owner");
    const otherCode = await ensureReferralCode(other.id);
    const email = `manuell-${tag}@kollegen-agentur.test`;
    emails.push(email);
    const r = await submitReferral({ code: otherCode, name: "Mia Muster", company: "", email, phone: "0151 7654321", consent: true });
    const contactId = r.ok ? r.contactId! : "";
    const n = uid();
    await new Promise((res) => setTimeout(res, 5));
    const offer = await wonOffer(contactId, n);
    await handleStripeEvent(invoicePaid(`evt_m_${n}`, offer.stripeSubscriptionId!));
    expect(credit.calls).toHaveLength(0);
    const ref = await prisma.colleagueReferral.findFirstOrThrow({ where: { contactId } });
    expect(ref.rewardStatus).toBe("manual");
    expect(await prisma.salesTask.count({ where: { title: { startsWith: "Prämie manuell gutschreiben" }, doneAt: null, note: { contains: "Agentur Kollege" } } })).toBeGreaterThan(0);
  });

  it("Hinweise: 5. Abschluss einmal zeigen, nach Wegklicken nie wieder, 30 Tage Abstand", async () => {
    const c = await makeCustomer({ retainerMonthly: 1000 });
    customers.push(c.id);
    const now = new Date();
    expect(await loadReferralNudge(c.id, now)).toBeNull();
    for (let i = 0; i < 5; i++) await prisma.lead.create({ data: { customerId: c.id, source: "TKV", status: "Abschluss" } });
    const first = await loadReferralNudge(c.id, now);
    expect(first?.key).toBe("abschluss5");
    expect((await loadReferralNudge(c.id, now))?.key).toBe("abschluss5"); // bleibt bis weggeklickt
    await closeReferralNudge(c.id, "abschluss5", now);
    expect(await loadReferralNudge(c.id, now)).toBeNull();
    // gutes Feedback nach 30 Tagen: erst nach 30 Tagen Abstand
    await prisma.customerFeedback.create({ data: { customerId: c.id, kind: "day30", token: `fb-${uid()}-${uid()}-${uid()}`, score: 5, answeredAt: now } });
    expect(await loadReferralNudge(c.id, new Date(now.getTime() + 10 * DAY))).toBeNull();
    const later = await loadReferralNudge(c.id, new Date(now.getTime() + 31 * DAY));
    expect(later?.key).toBe("feedback-day30");
    expect(await prisma.referralNudge.count({ where: { customerId: c.id } })).toBe(2);
  });

  it("Programm pausiert → keine Hinweise, Landingpage nimmt nichts an", async () => {
    await prisma.referralSettings.upsert({ where: { id: "default" }, create: { id: "default", enabled: false }, update: { enabled: false } });
    expect(await submitReferral(form(`pause-${tag}@kollegen-agentur.test`))).toMatchObject({ ok: false, code: "paused" });
    await prisma.referralSettings.deleteMany({});
  });
});
