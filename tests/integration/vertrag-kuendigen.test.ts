// „Vertrag hier kündigen“ im Kundenbereich: Termin nach AGB, gespeichert, Aufgabe für Ole, Push,
// Bestätigungsmail mit Eingang und Vertragsende, zweite Kündigung ändert nichts.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ mails: [] as { to: string | string[]; subject: string; paragraphs: string[] }[], pushes: [] as { title: string }[] }));
vi.mock("@/lib/push", () => ({
  sendToAdmins: vi.fn(async (p: { title: string }) => {
    sent.pushes.push(p);
    return { sent: 0, removed: 0, errors: [] };
  }),
}));
vi.mock("@/lib/email", async (orig) => {
  const real = await orig<typeof import("@/lib/email")>();
  return {
    ...real,
    sendCustomerMail: vi.fn(async (o: { to: string | string[]; subject: string; paragraphs: string[] }) => {
      sent.mails.push(o);
      return { ok: true };
    }),
  };
});

import { prisma } from "@/lib/prisma";
import { cancelContract, contractCancelInfo } from "@/lib/vertrag-kuendigung";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const customers: string[] = [];
const contacts: string[] = [];
const offers: string[] = [];

async function setup(opts: { term: string; start: string; annual?: boolean }) {
  const contact = await prisma.salesContact.create({ data: { name: "Kündigung Test", email: `k-${uid()}@example.test` } });
  contacts.push(contact.id);
  const c = await makeCustomer({ retainerStart: new Date(`${opts.start}T12:00:00Z`), retainerMonthly: 1000, billingInterval: opts.annual ? "year" : "month" });
  customers.push(c.id);
  await prisma.salesContact.update({ where: { id: contact.id }, data: { customerId: c.id } });
  const owner = await makeBuyer(c.id, "owner");
  const offer = await prisma.offer.create({
    data: {
      salesContactId: contact.id,
      number: `PG-T-${uid()}`,
      token: `tok_${uid()}_${uid()}_${uid()}_${uid()}`,
      contactName: "Klara Kündig",
      term: opts.term,
      products: [{ name: "Katzenversicherung", dailyBudget: 40 }],
      setupFee: 990,
      monthlyFee: 1000,
      softwareFee: 349,
      status: "accepted",
      startDate: new Date(`${opts.start}T12:00:00Z`),
      annualPrepay: !!opts.annual,
      validUntil: new Date(Date.now() + 86400000),
    },
  });
  offers.push(offer.id);
  await prisma.onboarding.create({ data: { customerId: c.id, offerId: offer.id, salesContactId: contact.id } });
  return { customerId: c.id, owner, contactId: contact.id };
}

describe("Vertrag hier kündigen", () => {
  beforeAll(() => {
    requireTestDb();
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
  });
  beforeEach(() => {
    sent.mails = [];
    sent.pushes = [];
  });
  afterAll(async () => {
    await prisma.salesTask.deleteMany({ where: { contactId: { in: contacts } } });
    await prisma.onboarding.deleteMany({ where: { customerId: { in: customers } } });
    for (const id of customers) await cleanupCustomer(id);
    await prisma.offer.deleteMany({ where: { id: { in: offers } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
  });

  it("12 Monate Mindestlaufzeit: zum Ende der Mindestlaufzeit, Aufgabe, Push und Bestätigung; zweites Mal unverändert", async () => {
    const { customerId, owner, contactId } = await setup({ term: "12m", start: "2026-10-01" });
    const now = new Date("2026-11-15T10:30:00Z");
    const info = await contractCancelInfo(customerId, now);
    expect(info).toMatchObject({ startIso: "2026-10-01", term: "12m", annual: false, requested: null, ended: false });
    expect(info!.next.effectiveIso).toBe("2027-09-30");

    const res = await cancelContract(customerId, { actor: { id: owner.id, email: owner.email, role: "BUYER" }, reason: "Zu wenig Zeit", now });
    expect(res).toMatchObject({ ok: true, effectiveIso: "2027-09-30", already: false });
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(c.cancelRequestedAt?.toISOString()).toBe(now.toISOString());
    expect(c.cancelEffectiveAt?.toISOString().slice(0, 10)).toBe("2027-09-30");
    expect(c).toMatchObject({ cancelRequestedBy: owner.email, cancelReason: "Zu wenig Zeit" });

    const task = await prisma.salesTask.findFirst({ where: { contactId } });
    expect(task?.title).toContain("zum 30.09.2027");
    expect(task?.note).toContain("Stripe-Abo zum Termin beenden");
    expect(sent.pushes.map((p) => p.title)).toContain(`Kündigung: ${c.name}`);
    const mail = sent.mails.find((m) => m.subject === "Bestätigung Ihrer Kündigung zum 30.09.2027");
    expect(mail).toBeTruthy();
    expect([mail!.to].flat()).toContain(owner.email);
    expect(mail!.paragraphs.join(" ")).toContain("am 15.11.2026 um 11:30 Uhr");
    expect(mail!.paragraphs.join(" ")).toContain("Ihr Vertrag endet am 30.09.2027, zum Ende der Mindestlaufzeit");

    const log = await prisma.auditLog.findFirst({ where: { action: "contract.cancel", customerId } });
    expect(log?.details).toMatchObject({ effective: "2027-09-30", reason: "mindestlaufzeit" });

    // Zweite Kündigung: gleicher Termin, keine weitere Aufgabe oder Mail
    sent.mails = [];
    const again = await cancelContract(customerId, { actor: { id: owner.id, email: owner.email, role: "BUYER" }, now: new Date("2026-12-01T10:00:00Z") });
    expect(again).toMatchObject({ ok: true, effectiveIso: "2027-09-30", already: true });
    expect(await prisma.salesTask.count({ where: { contactId } })).toBe(1);
    expect(sent.mails).toHaveLength(0);
    expect((await contractCancelInfo(customerId))!.requested).toMatchObject({ atIso: "2026-11-15", effectiveIso: "2027-09-30" });
  });

  it("ohne Laufzeit: Ende des laufenden Abrechnungsmonats; Jahreszahlung nach der Frist: ein Jahr später", async () => {
    const monthly = await setup({ term: "none", start: "2026-10-20" });
    const r1 = await cancelContract(monthly.customerId, { actor: { email: monthly.owner.email, role: "BUYER" }, now: new Date("2026-11-15T09:00:00Z") });
    expect(r1).toMatchObject({ ok: true, effectiveIso: "2026-11-19" });

    const annual = await setup({ term: "12m", start: "2025-12-01", annual: true });
    const info = await contractCancelInfo(annual.customerId, new Date("2026-11-15T09:00:00Z"));
    expect(info!.next).toMatchObject({ effectiveIso: "2027-11-30", missedDeadline: true });
    expect(info!.nextText).toContain("Kündigungsfrist von einem Monat schon abgelaufen");
  });

  it("beendeter Vertrag kann nicht mehr gekündigt werden", async () => {
    const { customerId, owner } = await setup({ term: "none", start: "2026-01-01" });
    await prisma.customer.update({ where: { id: customerId }, data: { retainerEnd: new Date("2026-06-30T12:00:00Z") } });
    expect(await cancelContract(customerId, { actor: { email: owner.email, role: "BUYER" }, now: new Date("2026-11-15T09:00:00Z") })).toEqual({ ok: false, error: "Ihr Vertrag ist bereits beendet." });
  });
});
