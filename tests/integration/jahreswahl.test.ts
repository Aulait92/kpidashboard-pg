// Jahreszahlung im Angebot zur Wahl (Ole, 18.11.2026): „Jahreszahlung anbieten (3 Monate geschenkt, bis 18.11.2026: 2)“ heißt, der Kunde
// wählt bei der Annahme monatlich (vorausgewählt) oder jährlich im Voraus. Geprüft: Speichern der Wahl, Stripe-Zeitplan
// je Wahl (Monats- bzw. Jahrespreise, gemockt, kein Netz), Abrechnungstag (gratis und anteilig), Abschlussbonus gleich
// für beide, Überweisung mit Jahresabo, Übernahme ins Kundenkonto, Auftragsbestätigung, feste Alt-Angebote.
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
        return { id: `cus_jw_${++n}` };
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
        return { id: `sub_sched_jw_${++n}`, subscription: null };
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
  return { calls, fake: proxy([]), mails: [] as { to: string; subject: string; list?: string[] }[] };
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
import { zugesagterBonus } from "./zugesagter-bonus";
import { createCheckoutForOffer, createScheduleForOffer } from "@/lib/billing";
import { richteUeberweisungEin } from "@/lib/ueberweisung";
import { abrechnungsplan, anteilCent } from "@/lib/abrechnungstag";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { requireTestDb } from "./db";

type Item = { quantity: number; price_data: { product: string; unit_amount: number; recurring?: { interval: string } } };
type AddItem = { price_data: { unit_amount: number }; period: unknown };
type Params = {
  start_date: number | "now";
  metadata: Record<string, string>;
  default_settings: { collection_method: string; invoice_settings?: { days_until_due?: number } };
  phases: { items: Item[]; add_invoice_items?: AddItem[] }[];
};

const uid = () => Math.random().toString(36).slice(2, 8);
const noon = (iso: string) => Math.floor(new Date(`${iso}T12:00:00Z`).getTime() / 1000);
/** Erster des übernächsten Monats: in der Zukunft, im wählbaren Startbereich, Abrechnungstag 15 liegt danach. */
function zukunftErster(): string {
  const [y, m] = addDaysIso(berlinTodayIso(), 40).split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}
const contacts: string[] = [];

/** 30 € am Tag → 990 € Paket (Listenpreis seit 18.11.2026), 5 aktive Verkäufer → 2 × 49 €: monatlich gesamt 1.088 €, jährlich 9 × 1.088 € = 9.792 €. */
async function angebot(extra: Partial<Parameters<typeof createOffer>[1]> = {}) {
  const tag = uid();
  const contact = await prisma.salesContact.create({ data: { name: `Jahreswahl ${tag}`, email: `jw-${tag}@example.test` } });
  contacts.push(contact.id);
  const input = {
    contactName: "Jana Jahr",
    company: `Agentur ${tag}`,
    email: `jana-${tag}@example.test`,
    term: "12m",
    products: [{ name: "TKV-Katze", dailyBudget: 30 }],
    seats: 5,
    startDate: zukunftErster(),
    annual: true,
    abschlussBonus: 0,
    ...extra,
  } as Parameters<typeof createOffer>[1];
  const offer = await createOffer({ salesContactId: contact.id }, input, null);
  // Abschlussbonus seit 21.11.2026 nur noch als Altfall (schon zugesagt): nach dem Anlegen setzen
  return Number(input.abschlussBonus ?? 0) > 0 ? zugesagterBonus(offer.id, Number(input.abschlussBonus), input.abschlussBonusBis ?? null) : offer;
}

const accept = (token: string, extra: { term?: string; annual?: boolean | null } = {}) =>
  acceptOffer(token, { name: "Jana Jahr", ip: "127.0.0.1", agent: "vitest", termsAccepted: true, business: { company: "Agentur Jahr", confirmed: true }, ...extra });

const checkout = (id: string) => ({ id: `cs_${id}`, mode: "setup", setup_intent: "seti_1", customer: null }) as unknown as Stripe.Checkout.Session;
const zeitplan = () => st.calls.filter((c) => c.path === "subscriptionSchedules.create").at(-1)!.args[0] as Params;
const summe = (items: Item[]) => items.reduce((s, i) => s + i.price_data.unit_amount * i.quantity, 0);

describe("Jahreszahlung zur Wahl: Angebot → Annahme → Stripe", () => {
  beforeAll(() => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_jahreswahl";
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
  });
  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.UEBERWEISUNG;
    const offers = await prisma.offer.findMany({ where: { salesContactId: { in: contacts } }, select: { id: true } });
    const obs = await prisma.onboarding.findMany({ where: { offerId: { in: offers.map((o) => o.id) } }, select: { customerId: true } });
    await prisma.onboarding.deleteMany({ where: { offerId: { in: offers.map((o) => o.id) } } }).catch(() => {});
    for (const ob of obs) if (ob.customerId) await prisma.customer.delete({ where: { id: ob.customerId } }).catch(() => {});
    await prisma.offer.deleteMany({ where: { salesContactId: { in: contacts } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
  });
  beforeEach(() => {
    st.calls.length = 0;
    st.mails.length = 0;
  });

  it("Haken = angeboten: monatlich vorausgewählt, Wahl gespeichert; nur mit 12 Monaten, nicht mit Startpreis, nicht im Testangebot", async () => {
    const o = await angebot();
    expect(o).toMatchObject({ annualChoice: true, annualPrepay: false, annualFreeMonths: 3 });
    const ohne = await angebot({ annual: false });
    expect(ohne).toMatchObject({ annualChoice: false, annualPrepay: false, annualFreeMonths: null });
    await expect(angebot({ term: "3m" })).rejects.toThrow(/12 Monaten/);
    await expect(angebot({ introMonthlyFee: 500, introMonths: 3 })).rejects.toThrow(/Startpreis/);
    const test = await angebot({ test: true });
    expect(test).toMatchObject({ annualChoice: false, annualPrepay: false });
  });

  it("Kunde wählt monatlich (ohne Angabe = Vorauswahl): Monatsabo mit Monatspreisen, Auftragsbestätigung monatlich", async () => {
    const o = await angebot();
    expect(await accept(o.token)).toEqual({ ok: true });
    const a = await prisma.offer.findUniqueOrThrow({ where: { id: o.id } });
    expect(a).toMatchObject({ status: "accepted", annualChoice: true, annualPrepay: false, annualFreeMonths: null, term: "12m" });
    const mail = st.mails.find((m) => m.subject.startsWith("Ihre Auftragsbestätigung"))!;
    expect(mail.list!.join(" ")).toMatch(/Monatlich: 1\.088\s€ netto ab/);
    expect(mail.list!.join(" ")).not.toMatch(/Jährlich/);

    await prisma.offer.update({ where: { id: o.id }, data: { stripeCustomerId: "cus_jw_m" } });
    await createScheduleForOffer(o.id, checkout(o.id));
    const p = zeitplan();
    const items = p.phases[0].items;
    expect(items.every((i) => i.price_data.recurring?.interval === "month")).toBe(true);
    expect(items.map((i) => [i.price_data.unit_amount, i.quantity])).toEqual([
      [34900, 1],
      [64100, 1],
      [4900, 2],
    ]);
    expect(p.metadata.pg_interval).toBeUndefined();
  });

  it("Kunde wählt jährlich: Jahresabo, alle Positionen × 9 (Plätze inklusive), Auftragsbestätigung mit Jahresbetrag und Verlängerung", async () => {
    const o = await angebot();
    expect(await accept(o.token, { annual: true })).toEqual({ ok: true });
    const a = await prisma.offer.findUniqueOrThrow({ where: { id: o.id } });
    expect(a).toMatchObject({ annualPrepay: true, annualFreeMonths: 3, annualChoice: true });
    const text = st.mails.find((m) => m.subject.startsWith("Ihre Auftragsbestätigung"))!.list!.join(" ");
    // Seit 19.11.2026: Vorauszahlung mit der Annahme fällig, Laufzeit ab Start
    expect(text).toMatch(/Jährlich im Voraus: 9\.792\s€ netto, jedes Jahr am \d\d\.\d\d\. fällig, das erste Mal mit der Annahme, dann am/);
    expect(text).toContain("Die Vorauszahlung wird mit Annahme fällig, die Laufzeit beginnt mit dem Start der Kampagne.");
    expect(a.prepayAtAcceptance).toBe(true);
    expect(text).toMatch(/verlängert sich um jeweils 12 Monate/);
    expect(hatGedankenstrich(text)).toBe(false);

    await prisma.offer.update({ where: { id: o.id }, data: { stripeCustomerId: "cus_jw_j" } });
    // Bezahlseite ohne Vorauszahlung (Metadaten pg_prepay_*, z. B. vor dem 19.11.2026 geöffnet): Abo wie bisher ab Start
    await createScheduleForOffer(o.id, checkout(o.id));
    const p = zeitplan();
    const items = p.phases[0].items;
    expect(items.every((i) => i.price_data.recurring?.interval === "year")).toBe(true);
    expect(items.map((i) => [i.price_data.unit_amount, i.quantity])).toEqual([
      [314100, 1],
      [576900, 1],
      [44100, 2],
    ]);
    expect(summe(items)).toBe(979200);
    expect(p.metadata.pg_interval).toBe("year");
    expect(p.start_date).toBe(Math.floor(a.startDate!.getTime() / 1000));
  });

  it("Jährlich gewählt, aber 3 Monate Laufzeit gewählt: monatlich (Jahreszahlung nur mit 12 Monaten)", async () => {
    const o = await angebot();
    expect(await accept(o.token, { term: "3m", annual: true })).toEqual({ ok: true });
    const a = await prisma.offer.findUniqueOrThrow({ where: { id: o.id } });
    expect(a).toMatchObject({ term: "3m", annualPrepay: false, annualFreeMonths: null });
  });

  it("Jährlich mit Abrechnungstag (Ole, 18.11.2026): voller Jahresbeitrag zum Start, kein Anteil, kein kostenloser Start", async () => {
    for (const billingFreeStart of [false, true]) {
      const o = await angebot({ billingDay: 15, billingFreeStart, customerChoice: false });
      st.mails.length = 0;
      expect(await accept(o.token, { annual: true })).toEqual({ ok: true });
      // Auftragsbestätigung: voller Betrag zum Start, nichts anteilig oder kostenlos
      const start = o.startDate!.toISOString().slice(0, 10);
      const startDe = start.split("-").reverse().join(".");
      const mail = st.mails.find((m) => /Auftragsbestätigung/.test(m.subject))!.list!.join(" ").replace(/\u00a0/g, " ");
      const naechstes = `${startDe.slice(0, 6)}${Number(startDe.slice(6)) + 1}`;
      expect(mail).toContain(`Jährlich im Voraus: 9.792 € netto, jedes Jahr am ${startDe.slice(0, 6)} fällig, das erste Mal mit der Annahme, dann am ${naechstes}.`);
      expect(mail).not.toMatch(/anteilig|kostenlos|jeweils am 15\./);
      expect(hatGedankenstrich(mail)).toBe(false);

      await prisma.offer.update({ where: { id: o.id }, data: { stripeCustomerId: `cus_jw_${billingFreeStart ? "g" : "a"}` } });
      await createScheduleForOffer(o.id, checkout(o.id));
      const p = zeitplan();
      // Abo beginnt am Start (nicht am 15.), voller Jahresbetrag auf der ersten Rechnung
      expect(p.start_date).toBe(Math.floor(o.startDate!.getTime() / 1000));
      expect(p.metadata).toMatchObject({ pg_interval: "year" });
      expect(p.metadata).not.toHaveProperty("pg_billing_day");
      expect(p.metadata).not.toHaveProperty("pg_free_start");
      expect(p.phases.every((ph) => !ph.add_invoice_items)).toBe(true);
      expect(p.phases[0].items.every((i) => i.price_data.recurring?.interval === "year")).toBe(true);
      expect(summe(p.phases[0].items)).toBe(979200);
    }
  });

  it("Abrechnungstag beim Monatsabo unverändert: anteilig vom Monatsbetrag ab dem ersten Abrechnungstag", async () => {
    const monat = await angebot({ billingDay: 15, customerChoice: false });
    await accept(monat.token, { annual: false });
    await prisma.offer.update({ where: { id: monat.id }, data: { stripeCustomerId: "cus_jw_am" } });
    await createScheduleForOffer(monat.id, checkout(monat.id));
    const pm = zeitplan();
    const start = monat.startDate!.toISOString().slice(0, 10);
    expect(pm.start_date).toBe(noon(`${start.slice(0, 8)}15`));
    expect(pm.metadata).toMatchObject({ pg_billing_day: "15", pg_free_start: "0" });
    const planM = abrechnungsplan({ startIso: start, billingDay: 15 })!;
    expect(pm.phases[0].add_invoice_items!.reduce((s, a) => s + a.price_data.unit_amount, 0)).toBe(anteilCent(108800, planM));
    expect(pm.phases[0].items.every((i) => i.price_data.recurring?.interval === "month")).toBe(true);
  });

  it("Überweisung, jährlich mit Abrechnungstag: Kundenkonto ohne Abrechnungstag, Zeitraum ab Start", async () => {
    process.env.UEBERWEISUNG = "on";
    const o = await angebot({ billingDay: 15, allowBankTransfer: true, bankTransferDays: 10, customerChoice: false });
    expect(await accept(o.token, { annual: true })).toEqual({ ok: true });
    expect(await richteUeberweisungEin(o.id)).toEqual({ ok: true });
    const ob = await prisma.onboarding.findFirstOrThrow({ where: { offerId: o.id }, select: { customerId: true } });
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: ob.customerId! } });
    const start = o.startDate!.toISOString().slice(0, 10);
    expect(c.billingInterval).toBe("year");
    // Freimonate am Kunden eingefroren (späterer Standardwechsel ändert das Abo nicht)
    expect(c.prepayFreeMonths).toBe(3);
    expect(c.billingDay).toBeNull();
    expect(c.billingStart?.toISOString().slice(0, 10)).toBe(start);
    expect(c.retainerStart?.toISOString().slice(0, 10)).toBe(start);
    expect(zeitplan().phases.every((ph) => !ph.add_invoice_items)).toBe(true);
    delete process.env.UEBERWEISUNG;
  });

  it("Abschlussbonus gilt für beide Wahlen gleich: Setup und Gutschein auf der Bezahlseite identisch", async () => {
    const sessions: Record<string, unknown>[] = [];
    const coupons: Record<string, unknown>[] = [];
    for (const annual of [false, true]) {
      st.calls.length = 0;
      const o = await angebot({ abschlussBonus: 300, customerChoice: false });
      await prisma.offer.update({ where: { id: o.id }, data: { sentAt: new Date() } });
      expect(await accept(o.token, { annual })).toEqual({ ok: true });
      const r = await createCheckoutForOffer(o.id, "sepa");
      expect(r).toEqual({ url: "https://checkout.stripe.test/x" });
      sessions.push(st.calls.find((c) => c.path === "checkout.sessions.create")!.args[0] as Record<string, unknown>);
      coupons.push(st.calls.find((c) => c.path === "coupons.create")!.args[0] as Record<string, unknown>);
    }
    for (const c of coupons) expect(c).toMatchObject({ amount_off: 30000, duration: "once", name: "Abschlussbonus" });
    const line = (s: Record<string, unknown>) => (s.line_items as { price_data: { unit_amount: number } }[])[0].price_data.unit_amount;
    expect(line(sessions[0])).toBe(99000);
    expect(line(sessions[1])).toBe(99000);
    expect(sessions[0].mode).toBe("payment");
    expect(sessions[1].mode).toBe("payment");
  });

  it("Überweisung bei Jahreszahlung: Setup-Rechnung, Jahresabo per Rechnung mit Zahlungsziel, Kunde zahlt jährlich", async () => {
    process.env.UEBERWEISUNG = "on";
    const o = await angebot({ allowBankTransfer: true, bankTransferDays: 10, customerChoice: false });
    expect(await accept(o.token, { annual: true })).toEqual({ ok: true });
    expect(await richteUeberweisungEin(o.id)).toEqual({ ok: true });
    const inv = st.calls.find((c) => c.path === "invoices.create")!.args[0] as Record<string, unknown>;
    expect(inv).toMatchObject({ collection_method: "send_invoice", days_until_due: 10 });
    const p = zeitplan();
    expect(p.default_settings).toMatchObject({ collection_method: "send_invoice", invoice_settings: { days_until_due: 10 } });
    expect(p.phases[0].items.every((i) => i.price_data.recurring?.interval === "year")).toBe(true);
    expect(summe(p.phases[0].items)).toBe(979200);
    const ob = await prisma.onboarding.findFirstOrThrow({ where: { offerId: o.id }, select: { customerId: true } });
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: ob.customerId! } });
    expect(c.billingInterval).toBe("year");
    expect(c.zahltPerUeberweisung).toBe(true);
    delete process.env.UEBERWEISUNG;
  });

  it("Alt-Angebot mit fester Jahreszahlung bleibt jährlich; abweichende Zahlweise wird abgelehnt", async () => {
    const o = await angebot({ customerChoice: false });
    await prisma.offer.update({ where: { id: o.id }, data: { annualChoice: false, annualPrepay: true } });
    expect(await accept(o.token, { annual: false })).toEqual({ ok: false, error: "Die Zahlweise ist in diesem Angebot fest vereinbart." });
    expect(await accept(o.token)).toEqual({ ok: true });
    expect(await prisma.offer.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ annualPrepay: true, annualFreeMonths: 3 });
  });

  it("Ohne Haken: nur monatlich, eine Angabe „jährlich“ wird abgelehnt", async () => {
    const o = await angebot({ annual: false, customerChoice: false });
    expect(await accept(o.token, { annual: true })).toEqual({ ok: false, error: "Die Zahlweise ist in diesem Angebot fest vereinbart." });
    expect(await accept(o.token)).toEqual({ ok: true });
    expect(await prisma.offer.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ annualPrepay: false });
  });
});
