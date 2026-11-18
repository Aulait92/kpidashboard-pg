// Laufzeit 6 Monate (Ole, 18.11.2026): Angebot mit 6 Monaten (Setup 1.490 €), „Vorauszahlung anbieten“ (1 Monat
// geschenkt), Annahme mit Wahl, Stripe-Zeitplan (gemockt, kein Netz): 6 Monate im Voraus = Intervall Monat × 6 mit
// 5 Monatsbeträgen, Abrechnungstag, Überweisung, Kundenkonto „halfyear“, Kündigung und Erinnerung 30 Tage vor Ende.
// Jahreszahlung (12 Monate, × 10) und Altangebote bleiben unverändert.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => {
  const calls: { path: string; args: unknown[] }[] = [];
  let n = 0;
  const answer = (path: string, args: unknown[]): unknown => {
    switch (path) {
      case "products.search":
        return { data: [{ id: "prod_test" }] };
      case "tax.registrations.list":
        return { data: [] };
      case "taxRates.list":
        return { data: [{ id: "txr_19", metadata: { pg_key: "ust19" } }] };
      case "accounts.retrieveCurrent":
        return { settings: { invoices: { default_account_tax_ids: [] } } };
      case "taxIds.list":
        return { data: [] };
      case "customers.create":
        return { id: `cus_6m_${++n}` };
      case "customers.createFundingInstructions":
        return { bank_transfer: { financial_addresses: [{ type: "iban", iban: { iban: "DE89370400440532013000" } }] } };
      case "coupons.create":
        return { id: `co_${++n}` };
      case "checkout.sessions.create":
        return { id: `cs_${++n}`, url: "https://checkout.stripe.test/x" };
      case "setupIntents.retrieve":
        return { id: args[0], payment_method: "pm_sepa" };
      case "invoices.create":
        return { id: `in_setup_${++n}` };
      case "invoices.finalizeInvoice":
        return { id: args[0], status: "open" };
      case "subscriptionSchedules.create":
        return { id: `sub_sched_6m_${++n}`, subscription: null };
      default:
        return { id: `obj_${++n}`, data: [] };
    }
  };
  const proxy = (path: string[]): unknown =>
    new Proxy(function () {}, {
      get: (_t, key) => (typeof key === "string" && key !== "then" ? proxy([...path, key]) : undefined),
      apply: (_t, _this, args) => {
        const p = path.join(".");
        calls.push({ path: p, args });
        return Promise.resolve(answer(p, args));
      },
    });
  return { calls, fake: proxy([]), mails: [] as { to: string | string[]; subject: string; list?: string[]; paragraphs: string[] }[] };
});
vi.mock("stripe", () => ({
  default: function Stripe() {
    return st.fake;
  },
}));
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendCustomerMail: vi.fn(async (o: (typeof st.mails)[number]) => (st.mails.push(o), { ok: true })),
}));
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })), sendToCustomer: vi.fn(async () => ({ sent: 0 })) }));

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { acceptOffer, createOffer } from "@/lib/offers";
import { createScheduleForOffer } from "@/lib/billing";
import { richteUeberweisungEin } from "@/lib/ueberweisung";
import { addDaysIso, berlinTodayIso, TERM_6M_AB } from "@/lib/offer-pricing";
import { contractCancelInfo } from "@/lib/vertrag-kuendigung";
import { remindPrepayEnd } from "@/lib/vorauszahlung-erinnerung";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

type Item = { quantity: number; price_data: { product: string; unit_amount: number; recurring?: { interval: string; interval_count?: number } } };
type AddItem = { price_data: { unit_amount: number }; period: unknown };
type Params = {
  start_date: number | "now";
  metadata: Record<string, string>;
  default_settings: { collection_method: string; invoice_settings?: { days_until_due?: number } };
  phases: { items: Item[]; add_invoice_items?: AddItem[] }[];
};

const uid = () => Math.random().toString(36).slice(2, 8);
function zukunftErster(): string {
  const [y, m] = addDaysIso(berlinTodayIso(), 40).split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}
const contacts: string[] = [];
const customers: string[] = [];

/** 30 € am Tag → 990 € Paket (Listenpreis seit 18.11.2026), 5 aktive Verkäufer → 2 × 49 €: monatlich 1.088 €, 6 Monate im Voraus 5.440 €. */
async function angebot(extra: Partial<Parameters<typeof createOffer>[1]> = {}) {
  const tag = uid();
  const contact = await prisma.salesContact.create({ data: { name: `Laufzeit6 ${tag}`, email: `l6-${tag}@example.test` } });
  contacts.push(contact.id);
  return createOffer(
    { salesContactId: contact.id },
    {
      contactName: "Sara Sechs",
      company: `Agentur ${tag}`,
      email: `sara-${tag}@example.test`,
      term: "6m",
      products: [{ name: "TKV-Katze", dailyBudget: 30 }],
      seats: 5,
      startDate: zukunftErster(),
      annual: true,
      abschlussBonus: 0,
      ...extra,
    },
    null,
  );
}

const accept = (token: string, extra: { term?: string; annual?: boolean | null } = {}) =>
  acceptOffer(token, { name: "Sara Sechs", ip: "127.0.0.1", agent: "vitest", termsAccepted: true, business: { company: "Agentur Sechs", confirmed: true }, ...extra });
const checkout = (id: string) => ({ id: `cs_${id}`, mode: "setup", setup_intent: "seti_1", customer: null }) as unknown as Stripe.Checkout.Session;
const zeitplan = () => st.calls.filter((c) => c.path === "subscriptionSchedules.create").at(-1)!.args[0] as Params;
const summe = (items: Item[]) => items.reduce((s, i) => s + i.price_data.unit_amount * i.quantity, 0);

beforeAll(() => {
  requireTestDb();
  process.env.STRIPE_SECRET_KEY = "sk_test_laufzeit6m";
  process.env.APP_URL = process.env.APP_URL || "https://app.test";
});
afterAll(async () => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.UEBERWEISUNG;
  const offers = await prisma.offer.findMany({ where: { salesContactId: { in: contacts } }, select: { id: true } });
  const obs = await prisma.onboarding.findMany({ where: { offerId: { in: offers.map((o) => o.id) } }, select: { customerId: true } });
  await prisma.onboarding.deleteMany({ where: { offerId: { in: offers.map((o) => o.id) } } }).catch(() => {});
  await prisma.onboarding.deleteMany({ where: { customerId: { in: customers } } }).catch(() => {});
  for (const ob of obs) if (ob.customerId) await prisma.customer.delete({ where: { id: ob.customerId } }).catch(() => {});
  for (const id of customers) await cleanupCustomer(id);
  await prisma.offer.deleteMany({ where: { salesContactId: { in: contacts } } });
  await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
});
beforeEach(() => {
  st.calls.length = 0;
  st.mails.length = 0;
});

describe("6 Monate: Angebot → Annahme → Stripe", () => {
  it("Angebot mit 6 Monaten: Setup 1.490 €, Vorauszahlung angeboten mit 1 Monat geschenkt; nicht mit 3 Monaten", async () => {
    const o = await angebot();
    expect(o).toMatchObject({ term: "6m", annualChoice: true, annualPrepay: false, annualFreeMonths: 1 });
    expect(Number(o.setupFee)).toBe(1490);
    await expect(angebot({ term: "3m" })).rejects.toThrow(/6 oder 12 Monaten/);
    const zwoelf = await angebot({ term: "12m" });
    expect(zwoelf).toMatchObject({ annualChoice: true, annualFreeMonths: 2 });
    expect(Number(zwoelf.setupFee)).toBe(990);
  });

  it("Kunde wählt 6 Monate im Voraus: Abo Monat × 6, alle Positionen × 5 (Plätze inklusive), Auftragsbestätigung", async () => {
    const o = await angebot();
    expect(await accept(o.token, { annual: true })).toEqual({ ok: true });
    const a = await prisma.offer.findUniqueOrThrow({ where: { id: o.id } });
    expect(a).toMatchObject({ status: "accepted", term: "6m", annualPrepay: true, annualFreeMonths: 1 });
    const text = st.mails.find((m) => m.subject.startsWith("Ihre Auftragsbestätigung"))!.list!.join(" ");
    expect(text).toMatch(/Einrichtung: 1\.490\s€ netto/);
    expect(text).toMatch(/6 Monate im Voraus: 5\.440\s€ netto, alle 6 Monate fällig, das erste Mal zum Start am/);
    expect(text).toMatch(/verlängert sich um jeweils 6 Monate, wenn Sie nicht bis/);
    expect(hatGedankenstrich(text)).toBe(false);

    await prisma.offer.update({ where: { id: o.id }, data: { stripeCustomerId: "cus_6m_h" } });
    await createScheduleForOffer(o.id, checkout(o.id));
    const p = zeitplan();
    const items = p.phases[0].items;
    expect(items.every((i) => i.price_data.recurring?.interval === "month" && i.price_data.recurring?.interval_count === 6)).toBe(true);
    expect(items.map((i) => [i.price_data.unit_amount, i.quantity])).toEqual([
      [174500, 1],
      [320500, 1],
      [24500, 2],
    ]);
    expect(summe(items)).toBe(544000);
    expect(p.metadata.pg_interval).toBe("halfyear");
    expect(p.start_date).toBe(Math.floor(a.startDate!.getTime() / 1000));
  });

  it("Kunde wählt monatlich: Monatsabo ohne interval_count, Mindestlaufzeit 6 Monate in der Bestätigung", async () => {
    const o = await angebot();
    expect(await accept(o.token, { annual: false })).toEqual({ ok: true });
    const text = st.mails.find((m) => m.subject.startsWith("Ihre Auftragsbestätigung"))!.list!.join(" ");
    expect(text).toMatch(/Monatlich: 1\.088\s€ netto ab/);
    expect(text).toMatch(/Mindestlaufzeit 6 Monate bis/);
    await prisma.offer.update({ where: { id: o.id }, data: { stripeCustomerId: "cus_6m_m" } });
    await createScheduleForOffer(o.id, checkout(o.id));
    const items = zeitplan().phases[0].items;
    expect(items.every((i) => i.price_data.recurring?.interval === "month" && i.price_data.recurring?.interval_count === undefined)).toBe(true);
    expect(summe(items)).toBe(108800);
    expect(zeitplan().metadata.pg_interval).toBeUndefined();
  });

  it("Jahreszahlung unverändert: 12 Monate im Voraus = Intervall Jahr, × 10", async () => {
    const o = await angebot({ term: "12m" });
    expect(await accept(o.token, { annual: true })).toEqual({ ok: true });
    await prisma.offer.update({ where: { id: o.id }, data: { stripeCustomerId: "cus_6m_j" } });
    await createScheduleForOffer(o.id, checkout(o.id));
    const p = zeitplan();
    expect(p.phases[0].items.every((i) => i.price_data.recurring?.interval === "year" && i.price_data.recurring?.interval_count === undefined)).toBe(true);
    expect(summe(p.phases[0].items)).toBe(1088000);
    expect(p.metadata.pg_interval).toBe("year");
  });

  it("Laufzeitwahl: 6 Monate nur auf Nachfrage, aus einem 12-Monats-Angebot nicht wählbar (Ole, 18.11.2026)", async () => {
    const o = await angebot({ term: "12m" });
    expect(o.customerChoosesTerm).toBe(true);
    // Angebot nach der Einführung von 6 Monaten (unabhängig von der Uhrzeit des Testlaufs)
    await prisma.offer.update({ where: { id: o.id }, data: { createdAt: new Date(TERM_6M_AB.getTime() + 60_000) } });
    expect(await accept(o.token, { term: "6m", annual: true })).toMatchObject({ ok: false });
    // Steht das Angebot auf 6 Monate, ist sie wählbar
    const sechs = await angebot({ term: "6m" });
    await prisma.offer.update({ where: { id: sechs.id }, data: { createdAt: new Date(TERM_6M_AB.getTime() + 60_000) } });
    expect(await accept(sechs.token, { term: "6m", annual: true })).toEqual({ ok: true });
    const a = await prisma.offer.findUniqueOrThrow({ where: { id: sechs.id } });
    expect(a).toMatchObject({ term: "6m", annualPrepay: true, annualFreeMonths: 1 });
    expect(Number(a.setupFee)).toBe(1490);
  });

  it("Abrechnungstag gilt bei 6 Monaten im Voraus nicht: voller Betrag zum Start, kein Anteil, kein kostenloser Start", async () => {
    for (const billingFreeStart of [false, true]) {
      const o = await angebot({ billingDay: 15, billingFreeStart, customerChoice: false });
      expect(await accept(o.token, { annual: true })).toEqual({ ok: true });
      await prisma.offer.update({ where: { id: o.id }, data: { stripeCustomerId: `cus_6m_${billingFreeStart ? "g" : "a"}` } });
      await createScheduleForOffer(o.id, checkout(o.id));
      const p = zeitplan();
      expect(p.start_date).toBe(Math.floor(o.startDate!.getTime() / 1000));
      expect(p.metadata).toMatchObject({ pg_interval: "halfyear" });
      expect(p.metadata).not.toHaveProperty("pg_billing_day");
      expect(p.phases.every((ph) => !ph.add_invoice_items)).toBe(true);
      expect(p.phases[0].items.every((i) => i.price_data.recurring?.interval_count === 6)).toBe(true);
      expect(summe(p.phases[0].items)).toBe(544000);
    }
  });

  it("Überweisung: Abo Monat × 6 per Rechnung, Kundenkonto halbjährlich", async () => {
    process.env.UEBERWEISUNG = "on";
    const o = await angebot({ allowBankTransfer: true, bankTransferDays: 10, customerChoice: false });
    expect(await accept(o.token, { annual: true })).toEqual({ ok: true });
    expect(await richteUeberweisungEin(o.id)).toEqual({ ok: true });
    const p = zeitplan();
    expect(p.default_settings).toMatchObject({ collection_method: "send_invoice", invoice_settings: { days_until_due: 10 } });
    expect(p.phases[0].items.every((i) => i.price_data.recurring?.interval_count === 6)).toBe(true);
    expect(summe(p.phases[0].items)).toBe(544000);
    const ob = await prisma.onboarding.findFirstOrThrow({ where: { offerId: o.id }, select: { customerId: true } });
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: ob.customerId! } });
    expect(c.billingInterval).toBe("halfyear");
    delete process.env.UEBERWEISUNG;
  });

  it("Altangebot (vor dem Livegang) mit Laufzeitwahl: 6 Monate nicht wählbar, andere Laufzeiten wie bisher", async () => {
    const o = await angebot({ term: "12m" });
    await prisma.offer.update({ where: { id: o.id }, data: { createdAt: new Date(TERM_6M_AB.getTime() - 86_400_000) } });
    expect(await accept(o.token, { term: "6m" })).toEqual({ ok: false, error: "Bitte eine gültige Laufzeit wählen." });
    expect(await accept(o.token, { term: "3m" })).toEqual({ ok: true });
    const a = await prisma.offer.findUniqueOrThrow({ where: { id: o.id } });
    expect(a).toMatchObject({ term: "3m", annualPrepay: false });
    expect(Number(a.setupFee)).toBe(1990);
  });
});

/** Kunde mit Vertrag direkt anlegen (ohne Stripe), Inhaber mit E-Mail. */
async function kunde(opts: { term: string; start: string; interval: "month" | "halfyear" | "year"; extra?: Record<string, unknown> }) {
  const contact = await prisma.salesContact.create({ data: { name: `L6 Kunde ${uid()}`, email: `l6k-${uid()}@example.test` } });
  contacts.push(contact.id);
  const c = await makeCustomer({ retainerStart: new Date(`${opts.start}T12:00:00Z`), retainerMonthly: 1000, billingInterval: opts.interval, ...(opts.extra ?? {}) });
  customers.push(c.id);
  const owner = await makeBuyer(c.id, "owner");
  const offer = await prisma.offer.create({
    data: {
      salesContactId: contact.id,
      number: `PG-L6-${uid()}`,
      token: `tok_${uid()}_${uid()}_${uid()}_${uid()}`,
      contactName: "Sara Sechs",
      term: opts.term,
      products: [{ name: "TKV-Katze", dailyBudget: 30 }],
      setupFee: 1490,
      monthlyFee: 1000,
      softwareFee: 349,
      status: "accepted",
      startDate: new Date(`${opts.start}T12:00:00Z`),
      annualPrepay: opts.interval !== "month",
      annualFreeMonths: opts.interval === "halfyear" ? 1 : opts.interval === "year" ? 2 : null,
      validUntil: new Date(Date.now() + 86400000),
    },
  });
  await prisma.onboarding.create({ data: { customerId: c.id, offerId: offer.id, salesContactId: contact.id } });
  return { id: c.id, email: owner.email };
}

describe("6 Monate: Kündigung und Mindestlaufzeit", () => {
  it("monatlich mit 6 Monaten: Ende der Mindestlaufzeit, danach Abrechnungsmonat", async () => {
    const k = await kunde({ term: "6m", start: "2027-01-15", interval: "month" });
    const a = await contractCancelInfo(k.id, new Date("2027-03-01T10:00:00Z"));
    expect(a).toMatchObject({ term: "6m", annual: false });
    expect(a!.next).toMatchObject({ effectiveIso: "2027-07-14", reason: "mindestlaufzeit" });
    const b = await contractCancelInfo(k.id, new Date("2027-07-20T10:00:00Z"));
    expect(b!.next).toMatchObject({ effectiveIso: "2027-08-14", reason: "abrechnungsmonat" });
  });

  it("6 Monate im Voraus: zum Ende des Zahlungszeitraums, nach Fristablauf 6 Monate später", async () => {
    const k = await kunde({ term: "6m", start: "2027-01-15", interval: "halfyear" });
    const a = await contractCancelInfo(k.id, new Date("2027-05-10T10:00:00Z"));
    expect(a).toMatchObject({ annual: true });
    expect(a!.next).toMatchObject({ effectiveIso: "2027-07-14", deadlineIso: "2027-06-14", reason: "zahlungsjahr" });
    expect(a!.nextText).toMatch(/Zahlungszeitraums von 6 Monaten/);
    const b = await contractCancelInfo(k.id, new Date("2027-06-20T10:00:00Z"));
    expect(b!.next).toMatchObject({ effectiveIso: "2028-01-14", missedDeadline: true });
  });
});

describe("Erinnerung 30 Tage vor Ende der Vorauszahlung", () => {
  const an = (email: string) => st.mails.filter((m) => [m.to].flat().includes(email));

  it("6 Monate: genau einmal je Zeitraum, mit Ende, Betrag und Kündigungsfrist", async () => {
    const k = await kunde({ term: "6m", start: "2027-01-15", interval: "halfyear", extra: { seatsBilled: 2, seatMonthly: 49 } });
    await remindPrepayEnd(new Date("2027-06-13T03:00:00Z")); // 31 Tage vorher
    expect(an(k.email)).toHaveLength(0);
    await remindPrepayEnd(new Date("2027-06-14T03:00:00Z"));
    await remindPrepayEnd(new Date("2027-06-14T03:02:00Z"));
    await remindPrepayEnd(new Date("2027-06-20T03:00:00Z"));
    const mails = an(k.email);
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toBe("Ihre Vorauszahlung läuft am 14.07.2027 aus");
    const t = mails[0].paragraphs.join(" ");
    expect(t).toMatch(/um weitere 6 Monate, der Betrag von 5\.490\s€ netto/);
    expect(t).toMatch(/bis zum 14\.06\.2027/);
    expect(hatGedankenstrich(t)).toBe(false);
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: k.id } });
    expect(c.prepayReminderFor?.toISOString().slice(0, 10)).toBe("2027-07-14");
    // nächster Zeitraum: wieder genau eine Erinnerung
    await remindPrepayEnd(new Date("2027-12-15T03:00:00Z"));
    await remindPrepayEnd(new Date("2027-12-16T03:00:00Z"));
    expect(an(k.email)).toHaveLength(2);
    expect(an(k.email)[1].subject).toBe("Ihre Vorauszahlung läuft am 14.01.2028 aus");
  });

  it("12 Monate: einmal 30 Tage vor Ende des Zahlungsjahres; gekündigt, monatlich oder Testkunde: keine Mail", async () => {
    const jahr = await kunde({ term: "12m", start: "2027-01-15", interval: "year" });
    const monat = await kunde({ term: "6m", start: "2027-01-15", interval: "month" });
    const gekuendigt = await kunde({ term: "6m", start: "2027-01-15", interval: "halfyear", extra: { cancelRequestedAt: new Date("2027-03-01T10:00:00Z") } });
    const test = await kunde({ term: "6m", start: "2027-01-15", interval: "halfyear", extra: { isTest: true } });
    await remindPrepayEnd(new Date("2027-06-20T03:00:00Z"));
    for (const k of [jahr, monat, gekuendigt, test]) expect(an(k.email)).toHaveLength(0);
    await remindPrepayEnd(new Date("2027-12-15T03:00:00Z"));
    await remindPrepayEnd(new Date("2027-12-16T03:00:00Z"));
    expect(an(jahr.email)).toHaveLength(1);
    expect(an(jahr.email)[0].paragraphs.join(" ")).toMatch(/um weitere 12 Monate, der Betrag von 10\.000\s€ netto/);
    for (const k of [monat, gekuendigt, test]) expect(an(k.email)).toHaveLength(0);
  });
});
