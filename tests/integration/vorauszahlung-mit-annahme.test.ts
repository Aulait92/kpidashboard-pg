// Vorauszahlung mit Annahme fällig (Ole, 19.11.2026): Bei Annahme mit Vorauszahlung kommen Setup (minus Bonus) und
// der volle Betrag des ersten Zeitraums sofort auf eine Rechnung (Bezahlseite bzw. Rechnung per Überweisung),
// Leistungszeitraum Start bis Start + Laufzeit. Das Stripe-Abo beginnt erst mit der Verlängerung (genau Start + 12 bzw.
// 6 Monate), davor gibt es kein Abo: keine Doppelberechnung, keine 0-€-Rechnung. Monatszahler unverändert. Start in der
// Vergangenheit: Zeitraum ab dem nächsten Monatsersten (wie der verschobene Start). Änderungen im bezahlten Zeitraum
// anteilig. „Wieder öffnen“ setzt bei 12 Monaten gespeicherte 2 geschenkte Monate auf 3 (Änderungsprotokoll).
// Stripe gemockt (kein Netz).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => {
  const calls: { path: string; args: unknown[] }[] = [];
  let n = 0;
  const state = { schedule: null as unknown };
  const answer = (path: string, args: unknown[]): unknown => {
    switch (path) {
      case "products.search": {
        // Je Produktschlüssel eine eigene ID (metadata['pg_key']:'software' …)
        const key = /pg_key'\]:'([a-z_]+)'/.exec(String((args[0] as { query: string }).query))?.[1] ?? "x";
        return { data: [{ id: `prod_${key}` }] };
      }
      case "tax.registrations.list":
        return { data: [] };
      case "taxRates.list":
        return { data: [{ id: "txr_19", metadata: { pg_key: "ust19" } }] };
      case "accounts.retrieveCurrent":
        return { settings: { invoices: { default_account_tax_ids: [] } } };
      case "taxIds.list":
        return { data: [] };
      case "customers.create":
        return { id: `cus_pp_${++n}` };
      case "customers.createFundingInstructions":
        return { bank_transfer: { financial_addresses: [{ type: "iban", iban: { iban: "DE89370400440532013000" } }] } };
      case "coupons.create":
        return { id: `co_${++n}` };
      case "checkout.sessions.create":
        return { id: `cs_pp_${++n}`, url: "https://checkout.stripe.test/x" };
      case "paymentIntents.retrieve":
        return { id: args[0], payment_method: "pm_sepa" };
      case "invoices.create":
        return { id: `in_pp_${++n}` };
      case "invoices.finalizeInvoice":
        return { id: args[0], status: "open" };
      case "subscriptionSchedules.create":
        return { id: `sub_sched_pp_${++n}`, subscription: null };
      case "subscriptions.list":
        return { data: [] };
      case "subscriptionSchedules.list":
        return { data: state.schedule ? [state.schedule] : [] };
      case "subscriptionSchedules.retrieve":
        return state.schedule;
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
  return { calls, state, fake: proxy([]), mails: [] as { subject: string; list?: string[] }[] };
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
vi.mock("@/lib/whatsapp/template-submit", () => ({ submitTemplatesAfterModule: vi.fn(async () => undefined) }));

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { acceptOffer, createOffer } from "@/lib/offers";
import { zugesagterBonus } from "./zugesagter-bonus";
import { createCheckoutForOffer, createScheduleForOffer, setBestandModule } from "@/lib/billing";
import { richteUeberweisungEin } from "@/lib/ueberweisung";
import { startNachZahlungVerschieben } from "@/lib/angebot-zahlungserinnerung-server";
import { angebotAblehnen, angebotWiederOeffnen } from "@/lib/vertrieb/angebot-ablehnen-server";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

type Line = { quantity: number; price_data: { product: string; unit_amount: number; recurring?: unknown } };
type SessionParams = {
  mode: string;
  line_items: Line[];
  discounts?: { coupon: string }[];
  metadata: Record<string, string>;
  invoice_creation: { invoice_data: { description: string; custom_fields?: { name: string; value: string }[] } };
};
type ScheduleParams = {
  start_date: number | "now";
  metadata: Record<string, string>;
  default_settings: { collection_method: string };
  phases: { items: Line[]; add_invoice_items?: unknown[] }[];
};

const uid = () => Math.random().toString(36).slice(2, 8);
const de = (iso: string) => iso.split("-").reverse().join(".");
const noon = (iso: string) => Math.floor(Date.parse(`${iso}T12:00:00Z`) / 1000);
/** Gleicher Tag n Monate später (Starttage hier immer am 1.) */
const plusMonate = (iso: string, n: number) => {
  const [y, m] = iso.split("-").map(Number);
  const t = m - 1 + n;
  return `${y + Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
};
const tagVorher = (iso: string) => new Date(Date.parse(`${iso}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
function zukunftErster(): string {
  const [y, m] = addDaysIso(berlinTodayIso(), 40).split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}
const last = (path: string) => st.calls.filter((c) => c.path === path).at(-1)?.args[0];
const all = (path: string) => st.calls.filter((c) => c.path === path).map((c) => c.args[0]);
const summe = (items: Line[]) => items.reduce((s, i) => s + i.price_data.unit_amount * i.quantity, 0);

const contacts: string[] = [];
const customers: string[] = [];

/** 30 € am Tag → 990 € Paket, 5 aktive Verkäufer (3 inklusive) → 2 × 49 €: monatlich 1.088 €. */
async function angebot(extra: Partial<Parameters<typeof createOffer>[1]> = {}) {
  const tag = uid();
  const contact = await prisma.salesContact.create({ data: { name: `Voraus ${tag}`, email: `vz-${tag}@example.test` } });
  contacts.push(contact.id);
  const input = {
    contactName: "Vera Voraus",
    company: `Agentur ${tag}`,
    email: `vera-${tag}@example.test`,
    term: "12m",
    products: [{ name: "TKV-Katze", dailyBudget: 30 }],
    seats: 5,
    startDate: zukunftErster(),
    annual: true,
    abschlussBonus: 300,
    abschlussBonusBis: addDaysIso(berlinTodayIso(), 2),
    customerChoice: false,
    ...extra,
  } as Parameters<typeof createOffer>[1];
  const offer = await createOffer({ salesContactId: contact.id }, input, null);
  // Abschlussbonus seit 21.11.2026 nur noch als Altfall (schon zugesagt): nach dem Anlegen setzen
  return Number(input.abschlussBonus ?? 0) > 0 ? zugesagterBonus(offer.id, Number(input.abschlussBonus), input.abschlussBonusBis ?? null) : offer;
}
/** Annahme, standardmäßig mit Vorauszahlung (Angebote bieten sie zur Wahl an, monatlich vorausgewählt) */
const accept = (token: string, extra: { annual?: boolean | null } = {}) =>
  acceptOffer(token, { name: "Vera Voraus", ip: "127.0.0.1", agent: "vitest", termsAccepted: true, business: { company: "Agentur Voraus", confirmed: true }, annual: true, ...extra });
/** Abgeschlossene Bezahlseite wie im Webhook: Metadaten der erzeugten Seite */
const bezahlt = (p: SessionParams) => ({ id: `cs_paid_${uid()}`, mode: p.mode, payment_intent: "pi_1", customer: null, metadata: p.metadata }) as unknown as Stripe.Checkout.Session;

beforeAll(() => {
  requireTestDb();
  process.env.STRIPE_SECRET_KEY = "sk_test_vorauszahlung";
  process.env.APP_URL = process.env.APP_URL || "https://app.test";
});
afterAll(async () => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.UEBERWEISUNG;
  const offers = await prisma.offer.findMany({ where: { salesContactId: { in: contacts } }, select: { id: true } });
  const obs = await prisma.onboarding.findMany({ where: { offerId: { in: offers.map((o) => o.id) } }, select: { customerId: true } });
  await prisma.onboarding.deleteMany({ where: { offerId: { in: offers.map((o) => o.id) } } }).catch(() => {});
  for (const ob of obs) if (ob.customerId) await prisma.customer.delete({ where: { id: ob.customerId } }).catch(() => {});
  for (const id of customers) await cleanupCustomer(id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: offers.map((o) => o.id) } } }).catch(() => {});
  await prisma.offer.deleteMany({ where: { salesContactId: { in: contacts } } });
  await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
});
beforeEach(() => {
  st.calls.length = 0;
  st.mails.length = 0;
  st.state.schedule = null;
});

describe("Vorauszahlung mit Annahme: Bezahlseite und Abo", () => {
  it("12 Monate: sofort eine Rechnung über 9 × Monatspreis + Einrichtung − Bonus, Zeitraum ab Start; Abo erst ab Start + 12 Monate", async () => {
    const o = await angebot();
    expect(await accept(o.token)).toEqual({ ok: true });
    const a = await prisma.offer.findUniqueOrThrow({ where: { id: o.id } });
    expect(a).toMatchObject({ annualPrepay: true, annualFreeMonths: 3, prepayAtAcceptance: true });
    const start = a.startDate!.toISOString().slice(0, 10);
    const renewal = plusMonate(start, 12);

    expect(await createCheckoutForOffer(o.id, "sepa")).toEqual({ url: "https://checkout.stripe.test/x" });
    const p = last("checkout.sessions.create") as SessionParams;
    expect(p.mode).toBe("payment");
    // Setup 990 € (Listenpreis) mit Bonus-Gutschein 300 € auf das Setup, dazu 9 × 1.088 € = 9.792 € in den Positionen des Abos
    const [setup, ...voraus] = p.line_items;
    expect(setup.price_data).toMatchObject({ product: "prod_setup", unit_amount: 99000 });
    expect(setup.price_data.recurring).toBeUndefined();
    expect(voraus.map((l) => [l.price_data.product, l.price_data.unit_amount, l.quantity])).toEqual([
      ["prod_software", 314100, 1],
      ["prod_service", 576900, 1],
      ["prod_seat", 44100, 2],
    ]);
    expect(voraus.every((l) => l.price_data.recurring === undefined)).toBe(true);
    expect(summe(voraus)).toBe(979200);
    const coupon = last("coupons.create") as { amount_off: number; applies_to: { products: string[] } };
    expect(coupon).toMatchObject({ amount_off: 30000, applies_to: { products: ["prod_setup"] } });
    expect(p.discounts).toHaveLength(1);
    // Zu zahlen netto: 990 − 300 + 9.792 = 10.482 €
    expect(summe(p.line_items) - coupon.amount_off).toBe(1048200);
    // Leistungszeitraum Start bis Start + 12 Monate (letzter Tag inklusive) auf der Rechnung und in den Metadaten
    expect(p.metadata).toMatchObject({ pg_prepay: "979200", pg_prepay_from: start, pg_prepay_until: tagVorher(renewal), pg_prepay_renewal: renewal, pg_bonus: "30000" });
    expect(p.invoice_creation.invoice_data.custom_fields).toContainEqual({ name: "Leistungszeitraum", value: `${de(start)} bis ${de(tagVorher(renewal))}` });
    expect(p.invoice_creation.invoice_data.description).toContain(`Setup und Vorauszahlung 12 Monate (3 Monate geschenkt), Leistungszeitraum ${de(start)} bis ${de(tagVorher(renewal))}`);

    // Nach der Zahlung: Abo-Zeitplan beginnt genau mit der Verlängerung, voller Jahresbetrag, keine Einmalposten
    await createScheduleForOffer(o.id, bezahlt(p));
    const z = last("subscriptionSchedules.create") as ScheduleParams;
    expect(z.start_date).toBe(noon(renewal));
    expect(z.metadata).toMatchObject({ pg_interval: "year", pg_prepaid_from: start, pg_prepaid_until: tagVorher(renewal) });
    expect(z.phases).toHaveLength(1);
    expect(z.phases[0].add_invoice_items).toBeUndefined();
    expect(z.phases[0].items.every((i) => (i.price_data.recurring as { interval: string }).interval === "year")).toBe(true);
    expect(summe(z.phases[0].items)).toBe(979200);
    expect(z.default_settings.collection_method).toBe("charge_automatically");
    // Keine weitere Rechnung jetzt (kein Abo vor der Verlängerung, keine 0-€-Rechnung)
    expect(all("invoices.create")).toHaveLength(0);
    expect(all("subscriptions.create")).toHaveLength(0);
  });

  it("6 Monate: 5 × Monatspreis + Einrichtung sofort, Abo ab Start + 6 Monate (Monat × 6)", async () => {
    const o = await angebot({ term: "6m", abschlussBonus: 0 });
    expect(await accept(o.token)).toEqual({ ok: true });
    const a = await prisma.offer.findUniqueOrThrow({ where: { id: o.id } });
    expect(a).toMatchObject({ term: "6m", annualPrepay: true, annualFreeMonths: 1, prepayAtAcceptance: true });
    const start = a.startDate!.toISOString().slice(0, 10);
    const renewal = plusMonate(start, 6);

    await createCheckoutForOffer(o.id, "sepa");
    const p = last("checkout.sessions.create") as SessionParams;
    const [setup, ...voraus] = p.line_items;
    expect(setup.price_data).toMatchObject({ product: "prod_setup", unit_amount: 149000 });
    expect(summe(voraus)).toBe(544000);
    expect(p.discounts).toBeUndefined();
    expect(p.metadata).toMatchObject({ pg_prepay: "544000", pg_prepay_from: start, pg_prepay_renewal: renewal });
    expect(p.invoice_creation.invoice_data.description).toContain("Vorauszahlung 6 Monate (1 Monat geschenkt)");

    await createScheduleForOffer(o.id, bezahlt(p));
    const z = last("subscriptionSchedules.create") as ScheduleParams;
    expect(z.start_date).toBe(noon(renewal));
    expect(z.metadata).toMatchObject({ pg_interval: "halfyear", pg_prepaid_from: start });
    expect(z.phases[0].items.every((i) => JSON.stringify(i.price_data.recurring) === JSON.stringify({ interval: "month", interval_count: 6 }))).toBe(true);
    expect(summe(z.phases[0].items)).toBe(544000);
  });

  it("Monatszahler unverändert: nur das Setup auf der Bezahlseite, Abo ab Start", async () => {
    const o = await angebot({ customerChoice: true, abschlussBonus: 0 });
    expect(await accept(o.token, { annual: false })).toEqual({ ok: true });
    const a = await prisma.offer.findUniqueOrThrow({ where: { id: o.id } });
    expect(a).toMatchObject({ annualPrepay: false, prepayAtAcceptance: false });
    await createCheckoutForOffer(o.id, "sepa");
    const p = last("checkout.sessions.create") as SessionParams;
    expect(p.line_items).toHaveLength(1);
    expect(p.line_items[0].price_data).toMatchObject({ product: "prod_setup", unit_amount: 99000 });
    expect(p.metadata).not.toHaveProperty("pg_prepay");
    expect(p.invoice_creation.invoice_data.custom_fields ?? []).not.toContainEqual(expect.objectContaining({ name: "Leistungszeitraum" }));
    await createScheduleForOffer(o.id, bezahlt(p));
    const z = last("subscriptionSchedules.create") as ScheduleParams;
    expect(z.start_date).toBe(Math.floor(a.startDate!.getTime() / 1000));
    expect(summe(z.phases[0].items)).toBe(108800);
    expect(z.metadata).not.toHaveProperty("pg_prepaid_from");
  });

  it("Bezahlseite ohne Vorauszahlung (vor dem 19.11.2026 geöffnet): Abo wie bisher ab Start, keine Doppelberechnung", async () => {
    const o = await angebot({ abschlussBonus: 0 });
    expect(await accept(o.token)).toEqual({ ok: true });
    const a = await prisma.offer.findUniqueOrThrow({ where: { id: o.id } });
    await prisma.offer.update({ where: { id: o.id }, data: { stripeCustomerId: "cus_pp_alt" } });
    await createScheduleForOffer(o.id, { id: "cs_alt", mode: "payment", payment_intent: "pi_1", customer: null, metadata: {} } as unknown as Stripe.Checkout.Session);
    const z = last("subscriptionSchedules.create") as ScheduleParams;
    expect(z.start_date).toBe(Math.floor(a.startDate!.getTime() / 1000));
    expect(z.metadata).not.toHaveProperty("pg_prepaid_from");
    expect(summe(z.phases[0].items)).toBe(979200);
  });

  it("Startdatum in der Vergangenheit: Zeitraum ab dem nächsten Monatsersten (wie der verschobene Start), Verlängerung 12 Monate danach", async () => {
    const o = await angebot({ abschlussBonus: 0 });
    expect(await accept(o.token)).toEqual({ ok: true });
    const today = berlinTodayIso();
    const vorbei = addDaysIso(today, -10);
    await prisma.offer.update({ where: { id: o.id }, data: { startDate: new Date(`${vorbei}T12:00:00Z`) } });
    const erwartet = today.endsWith("-01") ? today : plusMonate(`${today.slice(0, 8)}01`, 1);
    const renewal = plusMonate(erwartet, 12);

    await createCheckoutForOffer(o.id, "sepa");
    const p = last("checkout.sessions.create") as SessionParams;
    expect(p.metadata).toMatchObject({ pg_prepay_from: erwartet, pg_prepay_until: tagVorher(renewal), pg_prepay_renewal: renewal });

    // Webhook-Reihenfolge: Start verschieben, dann Zeitplan
    expect(await startNachZahlungVerschieben(o.id)).toBe(erwartet);
    await createScheduleForOffer(o.id, bezahlt(p));
    const z = last("subscriptionSchedules.create") as ScheduleParams;
    expect(z.start_date).toBe(noon(renewal));
    expect(z.metadata).toMatchObject({ pg_prepaid_from: erwartet });
  });

  it("Überweisung: eine Rechnung mit Setup und Vorauszahlung (Zeitraum an jeder Position), Abo per Rechnung ab der Verlängerung", async () => {
    process.env.UEBERWEISUNG = "on";
    const o = await angebot({ allowBankTransfer: true, bankTransferDays: 10 });
    expect(await accept(o.token)).toEqual({ ok: true });
    const a = await prisma.offer.findUniqueOrThrow({ where: { id: o.id } });
    const start = a.startDate!.toISOString().slice(0, 10);
    const renewal = plusMonate(start, 12);
    expect(await richteUeberweisungEin(o.id)).toEqual({ ok: true });

    const inv = last("invoices.create") as { collection_method: string; days_until_due: number; metadata: Record<string, string>; custom_fields?: { name: string; value: string }[] };
    expect(inv).toMatchObject({ collection_method: "send_invoice", days_until_due: 10 });
    expect(inv.metadata).toMatchObject({ pg_kind: "offer_setup", pg_prepay: "979200", pg_prepay_renewal: renewal });
    expect(inv.custom_fields).toContainEqual({ name: "Leistungszeitraum", value: `${de(start)} bis ${de(tagVorher(renewal))}` });
    const items = all("invoiceItems.create") as { price_data: { product: string; unit_amount: number }; quantity?: number; period?: { start: number; end: number } }[];
    expect(items[0].price_data).toMatchObject({ product: "prod_setup", unit_amount: 99000 });
    const voraus = items.slice(1);
    expect(voraus.reduce((s, i) => s + i.price_data.unit_amount * (i.quantity ?? 1), 0)).toBe(979200);
    expect(voraus.every((i) => i.period?.start === noon(start) && i.period?.end === noon(renewal))).toBe(true);
    expect(all("invoices.finalizeInvoice")).toHaveLength(1);

    const z = last("subscriptionSchedules.create") as ScheduleParams;
    expect(z.start_date).toBe(noon(renewal));
    expect(z.default_settings.collection_method).toBe("send_invoice");
    expect(summe(z.phases[0].items)).toBe(979200);
    const b = await prisma.offer.findUniqueOrThrow({ where: { id: o.id } });
    expect(Number(b.abschlussBonusGewaehrt)).toBe(300);
    delete process.env.UEBERWEISUNG;
  });
});

describe("Änderungen im schon bezahlten Zeitraum", () => {
  it("Modul im ersten Zeitraum gebucht: in den Zeitplan ab der Verlängerung und anteilig bis dahin als offener Posten", async () => {
    const c = await makeCustomer({ stripeCustomerId: `cus_pp_mod_${uid()}`, billingInterval: "year", prepayFreeMonths: 3 });
    customers.push(c.id);
    // Bezahlter Zeitraum seit 91 Tagen: Rest bis zur Verlängerung anteilig
    const from = addDaysIso(berlinTodayIso(), -91);
    const [y, m, d] = from.split("-").map(Number);
    const renewal = new Date(Date.UTC(y + 1, m - 1, d)).toISOString().slice(0, 10);
    st.state.schedule = {
      id: "sub_sched_prepaid",
      status: "not_started",
      metadata: { pg_prepaid_from: from, pg_prepaid_until: tagVorher(renewal) },
      default_settings: {},
      phases: [
        {
          start_date: noon(renewal),
          end_date: noon(renewal) + 365 * 86_400,
          metadata: {},
          items: [{ price: { id: "price_sw", product: "prod_software", recurring: { interval: "year" }, unit_amount: 314100 }, quantity: 1 }],
        },
      ],
    };
    const r = await setBestandModule(c.id, "book");
    expect(r).toMatchObject({ ok: true, changed: true });
    // Zeitplan: Modul mit 9 × 149 € ab der Verlängerung
    const upd = st.calls.find((x) => x.path === "subscriptionSchedules.update")!;
    expect(upd.args[0]).toBe("sub_sched_prepaid");
    const phases = (upd.args[1] as { phases: { items: { price_data?: { product: string; unit_amount: number } }[] }[] }).phases;
    expect(phases[0].items.find((i) => i.price_data?.product === "prod_bestand")?.price_data?.unit_amount).toBe(134100);
    // Anteil: 134.100 Cent × Resttage / Tage des Zeitraums
    const tage = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
    const erwartet = Math.round(134100 * (tage(berlinTodayIso(), renewal) / tage(from, renewal)));
    const item = last("invoiceItems.create") as { amount: number; currency: string; period: { start: number; end: number }; metadata: Record<string, string> };
    expect(item).toMatchObject({ amount: erwartet, currency: "eur", period: { start: noon(berlinTodayIso()), end: noon(renewal) } });
    expect(item.metadata).toMatchObject({ pg_kind: "vorauszahlung_anteil", pg_key: "bestand", pg_from_qty: "0", pg_to_qty: "1" });
    expect(r.ok && r.note).toBe(`Bis ${de(tagVorher(renewal))} anteilig mit der nächsten Rechnung, ab ${de(renewal)} im Abo.`);
  });
});

describe("Wieder öffnen: Jahreszahlung mit 3 geschenkten Monaten", () => {
  it("12 Monate mit gespeicherten 2 → 3, mit Eintrag im Änderungsprotokoll; 6 Monate bleiben", async () => {
    const o = await angebot({ customerChoice: true, abschlussBonus: 0 });
    await prisma.offer.update({ where: { id: o.id }, data: { status: "sent", annualFreeMonths: 2 } });
    expect(await angebotAblehnen(o.id, { grund: "PREIS" })).toMatchObject({ ok: true });
    expect(await angebotWiederOeffnen(o.id)).toEqual({ ok: true, status: "sent" });
    const b = await prisma.offer.findUniqueOrThrow({ where: { id: o.id } });
    expect(b.annualFreeMonths).toBe(3);
    const log = await prisma.auditLog.findFirst({ where: { action: "offer.jahr_3_monate", entityId: o.id } });
    expect(log?.details).toMatchObject({ alt: 2, neu: 3, anlass: "wieder geöffnet" });

    const sechs = await angebot({ term: "6m", customerChoice: true, abschlussBonus: 0 });
    await prisma.offer.update({ where: { id: sechs.id }, data: { status: "sent" } });
    await angebotAblehnen(sechs.id, { grund: "PREIS" });
    await angebotWiederOeffnen(sechs.id);
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: sechs.id } })).annualFreeMonths).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "offer.jahr_3_monate", entityId: sechs.id } })).toBe(0);
  });
});
