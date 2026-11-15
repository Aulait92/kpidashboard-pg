// „Vertrag hier kündigen“ im Kundenbereich: Termin nach AGB, gespeichert, Aufgabe für Ole, Push,
// Bestätigungsmail mit Eingang und Vertragsende, zweite Kündigung ändert nichts. Stripe (gemockt): Abo(s) enden
// zum Ende des letzten Vertragstags (cancel_at), bei Fehlern bleibt die Kündigung und die Aufgabe sagt „von Hand prüfen“.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ mails: [] as { to: string | string[]; subject: string; paragraphs: string[] }[], pushes: [] as { title: string }[] }));
type Phase = { start_date: number; end_date: number; metadata: Record<string, string>; items: { price: string; quantity: number; tax_rates: string[] }[] };
type Sched = { id: string; status: string; end_behavior: string; phases: Phase[] };
type Sub = { id: string; status: string; schedule: string | null; cancel_at: number | null; cancel_at_period_end: boolean };
const st = vi.hoisted(() => ({ subs: [] as Sub[], schedules: [] as Sched[], calls: [] as { method: string; args: unknown[] }[], fail: false }));
vi.mock("stripe", () => {
  const s = st;
  const log = (method: string, args: unknown[]) => s.calls.push({ method, args });
  class FakeStripe {
    subscriptions = {
      list: async () => ({ data: s.subs }),
      update: async (...args: unknown[]) => {
        log("subscriptions.update", args);
        if (s.fail) throw new Error("Stripe nicht erreichbar");
        return {};
      },
    };
    subscriptionSchedules = {
      list: async () => ({ data: s.schedules }),
      retrieve: async (id: string) => s.schedules.find((x) => x.id === id),
      update: async (...args: unknown[]) => {
        log("subscriptionSchedules.update", args);
        return {};
      },
      release: async (...args: unknown[]) => {
        log("subscriptionSchedules.release", args);
        return {};
      },
      cancel: async (...args: unknown[]) => {
        log("subscriptionSchedules.cancel", args);
        return {};
      },
    };
  }
  return { default: FakeStripe };
});

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

async function setup(opts: { term: string; start: string; annual?: boolean; stripe?: boolean; isTest?: boolean }) {
  const contact = await prisma.salesContact.create({ data: { name: "Kündigung Test", email: `k-${uid()}@example.test` } });
  contacts.push(contact.id);
  const c = await makeCustomer({ retainerStart: new Date(`${opts.start}T12:00:00Z`), retainerMonthly: 1000, billingInterval: opts.annual ? "year" : "month", ...(opts.stripe ? { stripeCustomerId: `cus_${uid()}${uid()}` } : {}), ...(opts.isTest ? { isTest: true } : {}) });
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
    st.subs = [];
    st.schedules = [];
    st.calls = [];
    st.fail = false;
    delete process.env.STRIPE_SECRET_KEY;
  });
  afterAll(async () => {
    await prisma.salesTask.deleteMany({ where: { contactId: { in: contacts } } });
    await prisma.onboarding.deleteMany({ where: { customerId: { in: customers } } });
    for (const id of customers) await cleanupCustomer(id);
    await prisma.offer.deleteMany({ where: { id: { in: offers } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
    delete process.env.STRIPE_SECRET_KEY;
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
    expect(task?.note).toContain("Stripe bitte von Hand prüfen: Online-Abrechnung ist nicht eingerichtet.");
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

  // Ende des 30.09.2027 in Berlin (Sommerzeit) = 30.09.2027 22:00 UTC
  const END_TS = Math.floor(Date.UTC(2027, 8, 30, 22) / 1000);
  const owner = (o: { id: string; email: string }) => ({ id: o.id, email: o.email, role: "BUYER" });

  it("Stripe: laufendes Abo bekommt cancel_at zum Ende des letzten Tags, ohne Gutschrift; Aufgabe ohne Handarbeit für Stripe", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    const x = await setup({ term: "12m", start: "2026-10-01", stripe: true });
    st.subs = [{ id: "sub_1", status: "active", schedule: null, cancel_at: null, cancel_at_period_end: false }];
    expect(await cancelContract(x.customerId, { actor: owner(x.owner), now: new Date("2026-11-15T10:00:00Z") })).toMatchObject({ ok: true, effectiveIso: "2027-09-30" });
    const upd = st.calls.filter((c) => c.method === "subscriptions.update");
    expect(upd).toHaveLength(1);
    expect(upd[0].args[0]).toBe("sub_1");
    expect(upd[0].args[1]).toEqual({ cancel_at: END_TS, proration_behavior: "none" });
    const task = await prisma.salesTask.findFirst({ where: { contactId: x.contactId } });
    expect(task?.title).not.toContain("von Hand");
    expect(task?.note).toContain("Stripe: Abo endet automatisch zum Ende des 30.09.2027");
    expect(task?.note).not.toContain("Stripe bitte von Hand prüfen");
    const log = await prisma.auditLog.findFirst({ where: { action: "contract.cancel_stripe", customerId: x.customerId } });
    expect(log?.details).toMatchObject({ ok: true, manual: false, changed: ["sub_1"], endAt: new Date(END_TS * 1000).toISOString() });
  });

  it("Stripe: idempotent, steht cancel_at schon, wird nichts geändert", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    const x = await setup({ term: "12m", start: "2026-10-01", stripe: true });
    st.subs = [{ id: "sub_2", status: "active", schedule: null, cancel_at: END_TS, cancel_at_period_end: false }];
    await cancelContract(x.customerId, { actor: owner(x.owner), now: new Date("2026-11-15T10:00:00Z") });
    expect(st.calls.filter((c) => c.method === "subscriptions.update")).toHaveLength(0);
    const log = await prisma.auditLog.findFirst({ where: { action: "contract.cancel_stripe", customerId: x.customerId } });
    expect(log?.details).toMatchObject({ ok: true, changed: [], unchanged: ["sub_2"] });
  });

  it("Stripe: Startpreis-Phase läuft, der Zeitplan endet zum Termin (spätere Phasen gekürzt, end_behavior cancel); geplanter Start ebenso", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    const x = await setup({ term: "3m", start: "2026-11-01", stripe: true });
    // Effektiv 31.01.2027 → Ende 31.01.2027 23:00 UTC (Winterzeit)
    const end = Math.floor(Date.UTC(2027, 0, 31, 23) / 1000);
    const t = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
    const item = { price: "price_1", quantity: 1, tax_rates: [] as string[] };
    st.subs = [{ id: "sub_3", status: "active", schedule: "sched_1", cancel_at: null, cancel_at_period_end: false }];
    st.schedules = [
      {
        id: "sched_1",
        status: "active",
        end_behavior: "release",
        phases: [
          { start_date: t("2026-11-01T12:00:00Z"), end_date: t("2027-01-01T12:00:00Z"), metadata: {}, items: [item] },
          { start_date: t("2027-01-01T12:00:00Z"), end_date: t("2027-02-01T12:00:00Z"), metadata: { offer: "x" }, items: [item] },
        ],
      },
    ];
    expect(await cancelContract(x.customerId, { actor: owner(x.owner), now: new Date("2026-11-15T10:00:00Z") })).toMatchObject({ effectiveIso: "2027-01-31" });
    expect(st.calls.filter((c) => c.method === "subscriptions.update")).toHaveLength(0);
    const upd = st.calls.find((c) => c.method === "subscriptionSchedules.update")!;
    expect(upd.args[0]).toBe("sched_1");
    const params = upd.args[1] as { end_behavior: string; proration_behavior: string; phases: { end_date: number; start_date: number }[] };
    expect(params.end_behavior).toBe("cancel");
    expect(params.proration_behavior).toBe("none");
    expect(params.phases).toHaveLength(2);
    expect(params.phases[1].end_date).toBe(end);
    expect(params.phases[0].end_date).toBe(t("2027-01-01T12:00:00Z"));

    // Geplanter, noch nicht gestarteter Abo-Start (Kündigung vor dem Startdatum)
    st.calls = [];
    st.subs = [];
    const y = await setup({ term: "none", start: "2026-12-01", stripe: true });
    st.schedules = [{ id: "sched_2", status: "not_started", end_behavior: "release", phases: [{ start_date: t("2026-12-01T12:00:00Z"), end_date: t("2027-01-01T12:00:00Z"), metadata: {}, items: [item] }] }];
    expect(await cancelContract(y.customerId, { actor: owner(y.owner), now: new Date("2026-11-15T10:00:00Z") })).toMatchObject({ effectiveIso: "2026-12-31" });
    const upd2 = st.calls.find((c) => c.method === "subscriptionSchedules.update")!;
    expect(upd2.args[0]).toBe("sched_2");
    expect((upd2.args[1] as { phases: { end_date: number }[] }).phases[0].end_date).toBe(Math.floor(Date.UTC(2026, 11, 31, 23) / 1000));
  });

  it("Stripe-Fehler: Kündigung bleibt, Fehler gemeldet, Aufgabe „Stripe bitte von Hand prüfen“", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    const x = await setup({ term: "12m", start: "2026-10-01", stripe: true });
    st.subs = [{ id: "sub_4", status: "active", schedule: null, cancel_at: null, cancel_at_period_end: false }];
    st.fail = true;
    expect(await cancelContract(x.customerId, { actor: owner(x.owner), now: new Date("2026-11-15T10:00:00Z") })).toMatchObject({ ok: true, effectiveIso: "2027-09-30" });
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: x.customerId } })).cancelEffectiveAt).not.toBeNull();
    const task = await prisma.salesTask.findFirst({ where: { contactId: x.contactId } });
    expect(task?.title).toContain("(Stripe bitte von Hand prüfen)");
    expect(task?.note).toContain("Stripe bitte von Hand prüfen: Stripe nicht erreichbar");
    expect(sent.pushes[0]?.title).toContain("Kündigung");
    expect(sent.mails.some((m) => m.subject.startsWith("Bestätigung Ihrer Kündigung"))).toBe(true);
    const log = await prisma.auditLog.findFirst({ where: { action: "contract.cancel_stripe", customerId: x.customerId } });
    expect(log?.details).toMatchObject({ ok: false, manual: true });
  });

  it("Stripe: Testkunde ohne Stripe-Aufruf; Kunde ohne Stripe-Kunde → von Hand prüfen", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    st.subs = [{ id: "sub_5", status: "active", schedule: null, cancel_at: null, cancel_at_period_end: false }];
    const test = await setup({ term: "none", start: "2026-10-20", stripe: true, isTest: true });
    await cancelContract(test.customerId, { actor: owner(test.owner), now: new Date("2026-11-15T10:00:00Z") });
    expect(st.calls).toHaveLength(0);
    expect((await prisma.salesTask.findFirst({ where: { contactId: test.contactId } }))?.note).toContain("Testkunde: kein Stripe-Abo.");

    const manual = await setup({ term: "none", start: "2026-10-20" });
    await cancelContract(manual.customerId, { actor: owner(manual.owner), now: new Date("2026-11-15T10:00:00Z") });
    expect(st.calls).toHaveLength(0);
    expect((await prisma.salesTask.findFirst({ where: { contactId: manual.contactId } }))?.title).toContain("(Stripe bitte von Hand prüfen)");
  });
});
