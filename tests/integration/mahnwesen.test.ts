// Überweisung nur auf Anfrage und Mahnwesen (Ole, 17.11.2026): Rechnung per Überweisung (send_invoice,
// customer_balance/eu_bank_transfer DE, Zahlungsziel aus dem Angebot), keine Doppelnachricht mit der
// Zahlungserinnerung zum Angebot (Fall Anid), Mahnstufen ohne Doppelversand, Abbruch bei Zahlung, Stopp je Kunde,
// Anruf-Aufgabe und Bankabgleich (eindeutig → paid out of band, unsicher → Vorschlag).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_fake_mahnwesen";
  process.env.MAHNWESEN = "on";
  const calls: { path: string; args: unknown[] }[] = [];
  const invoiceStatus = new Map<string, string>();
  let n = 0;
  const answer = (path: string, args: unknown[]): unknown => {
    switch (path) {
      case "products.search":
        return { data: [{ id: "prod_test" }] };
      case "tax.registrations.list":
        return { data: [] };
      case "taxRates.list":
        return { data: [{ id: "txr_test", metadata: { pg_key: "ust19" } }] };
      case "accounts.retrieveCurrent":
        return { settings: { invoices: { default_account_tax_ids: ["txi_1"] } } };
      case "customers.create":
        return { id: `cus_test_${Date.now()}_${++n}` };
      case "customers.createFundingInstructions":
        return { bank_transfer: { financial_addresses: [{ type: "iban", iban: { iban: "DE89370400440532013000" } }] } };
      case "coupons.create":
        return { id: `co_${++n}` };
      case "invoices.create":
        return { id: `in_setup_${++n}` };
      case "invoices.finalizeInvoice":
        return { id: args[0], status: "open" };
      case "subscriptionSchedules.create":
        return { id: `sub_sched_${Date.now()}_${++n}`, subscription: null };
      case "invoices.retrieve":
        return { id: args[0], status: invoiceStatus.get(String(args[0])) ?? "open" };
      case "invoices.pay":
        invoiceStatus.set(String(args[0]), "paid");
        return { id: args[0], status: "paid" };
      case "invoices.list":
        return { data: [], async *[Symbol.asyncIterator]() {} };
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
        const r = answer(p, args);
        // invoices.list ist synchron auto-paginierbar (for await), alles andere ein Promise
        return p === "invoices.list" ? r : Promise.resolve(r);
      },
    });
  return {
    calls,
    invoiceStatus,
    fake: proxy([]),
    mails: [] as { to: string | string[]; subject: string; paragraphs: string[]; attachments?: unknown[] }[],
    pushes: [] as { title: string; tag?: string }[],
    wa: [] as { to: string; name: string; components: unknown }[],
  };
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
vi.mock("@/lib/push", async (orig) => ({
  ...(await orig<typeof import("@/lib/push")>()),
  sendToAdmins: vi.fn(async (p: { title: string; tag?: string }) => (st.pushes.push(p), { sent: 0, removed: 0, errors: [] })),
}));
vi.mock("@/lib/whatsapp/dialog360", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/dialog360")>()),
  sendTemplate: vi.fn(async (_k: string, to: string, name: string, _l: string, components: unknown) => {
    st.wa.push({ to, name, components });
    return { messageId: `wamid.m-${st.wa.length}-${Math.random().toString(36).slice(2, 6)}`, raw: {} };
  }),
}));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import { runZahlungserinnerungen } from "@/lib/angebot-zahlungserinnerung-server";
import { richteUeberweisungEin, setzeUeberweisungKunde } from "@/lib/ueberweisung";
import { bankAbgleichLauf, ladeOffenePosten, mahnfallAusRechnung, rechnungBezahlt, runMahnlauf, setzeMahnStopp, vorschlagEntscheiden } from "@/lib/mahnwesen-server";
import { RECHNUNG_FAELLIG_TEMPLATE } from "@/lib/mahnwesen";
import { runDunningCron } from "@/lib/pause";
import { requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const DAY = 86_400_000;
// 10:00 Berlin (Winterzeit) an einem Tag
const um10 = (iso: string) => new Date(`${iso}T09:00:00Z`);
const contactIds: string[] = [];
const customerIds: string[] = [];

async function contact() {
  const tag = uid();
  const c = await prisma.salesContact.create({
    data: { name: `Mahn ${tag}`, email: `mahn-${tag}@example.test`, firstName: "Max", lastName: `Muster${tag}`, salutation: "Herr", phone: `+49176${Math.floor(1e6 + Math.random() * 8e6)}` },
  });
  contactIds.push(c.id);
  return c;
}

async function acceptedOffer(p: { allowBankTransfer?: boolean; days?: number; zahlweise?: string | null; paymentStatus?: string } = {}) {
  const tag = uid();
  const c = await contact();
  return prisma.offer.create({
    data: {
      salesContactId: c.id,
      number: `PG-M-${tag}`,
      token: `tok-${tag}-${uid()}${uid()}${uid()}`,
      status: "accepted",
      contactName: `Max Muster${tag}`,
      company: `Agentur ${tag}`,
      email: `kunde-${tag}@example.test`,
      term: "12m",
      products: [{ name: "TKV", dailyBudget: 30 }],
      setupFee: 990,
      monthlyFee: 1190,
      softwareFee: 190,
      validUntil: new Date(Date.now() + 14 * DAY),
      acceptedAt: new Date("2026-11-10T10:00:00Z"),
      startDate: new Date("2027-01-01T12:00:00Z"),
      allowBankTransfer: p.allowBankTransfer ?? false,
      bankTransferDays: p.days ?? 14,
      zahlweise: p.zahlweise ?? null,
      paymentStatus: p.paymentStatus ?? "none",
    },
  });
}

async function kundeMitKontakt(extra: Record<string, unknown> = {}) {
  const c = await contact();
  const stripeCustomerId = `cus_m_${uid()}${uid()}`;
  const customer = await prisma.customer.create({ data: { name: `Kunde ${uid()}`, stripeCustomerId, ...extra } });
  customerIds.push(customer.id);
  await prisma.salesContact.update({ where: { id: c.id }, data: { customerId: customer.id } });
  return { customer, contact: c, stripeCustomerId };
}

function invoice(p: { id?: string; customer: string; due: string; amount?: number; method?: "send_invoice" | "charge_automatically"; offerId?: string }) {
  return {
    id: p.id ?? `in_${uid()}${uid()}`,
    number: `PGM-${uid().toUpperCase()}-0001`,
    status: "open" as const,
    collection_method: p.method ?? ("send_invoice" as const),
    due_date: Math.floor(new Date(`${p.due}T12:00:00Z`).getTime() / 1000),
    amount_remaining: p.amount ?? 141610,
    currency: "eur",
    hosted_invoice_url: "https://invoice.stripe.test/i/x",
    invoice_pdf: null,
    metadata: (p.offerId ? { offer_id: p.offerId } : {}) as Record<string, string>,
    customer_email: `rechnung-${uid()}@example.test`,
    customer: p.customer,
  };
}

describe("Überweisung und Mahnwesen", () => {
  beforeAll(async () => {
    requireTestDb();
    process.env.APP_URL = "https://app.test";
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    await prisma.customer.upsert({ where: { id: SUPPORT_CUSTOMER_ID }, create: { id: SUPPORT_CUSTOMER_ID, name: "performancegrowth Support", plan: "internal" }, update: {} });
    await prisma.whatsAppAccount.upsert({
      where: { customerId: SUPPORT_CUSTOMER_ID },
      create: { customerId: SUPPORT_CUSTOMER_ID, status: "connected", apiKeyEnc: encryptSecret("k") },
      update: { status: "connected", apiKeyEnc: encryptSecret("k") },
    });
  });
  beforeEach(() => {
    st.mails.length = 0;
    st.pushes.length = 0;
    st.wa.length = 0;
    st.calls.length = 0;
  });
  afterAll(async () => {
    await prisma.mahnfall.deleteMany({ where: { OR: [{ customerId: { in: customerIds } }, { stripeCustomerId: { startsWith: "cus_m_" } }, { stripeCustomerId: { startsWith: "cus_test_" } }] } });
    await prisma.bankTransaction.deleteMany({ where: { accountKey: "test:mahnwesen" } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contactIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    await prisma.conversation.deleteMany({ where: { customerId: SUPPORT_CUSTOMER_ID } });
    await prisma.messageTemplate.deleteMany({ where: { customerId: SUPPORT_CUSTOMER_ID } });
    await prisma.whatsAppAccount.deleteMany({ where: { customerId: SUPPORT_CUSTOMER_ID } });
    delete process.env.MAHNWESEN;
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("ohne Freigabe am Angebot keine Überweisung", async () => {
    const o = await acceptedOffer({ allowBankTransfer: false });
    const r = await richteUeberweisungEin(o.id);
    expect(r.ok).toBe(false);
    expect(st.calls.filter((c) => c.path === "invoices.create")).toHaveLength(0);
  });

  it("Überweisung gewählt: Rechnung mit Zahlungsziel aus dem Angebot, Abo per Rechnung, Zahlungserinnerung zum Angebot stoppt", async () => {
    const o = await acceptedOffer({ allowBankTransfer: true, days: 10 });
    // Vorher läuft die Zahlungserinnerung „Zahlung einrichten“ (Kontrollfall)
    const kontrolle = await acceptedOffer({ allowBankTransfer: true, days: 10 });

    const r = await richteUeberweisungEin(o.id, um10("2026-11-18"));
    expect(r).toEqual({ ok: true });
    const inv = st.calls.find((c) => c.path === "invoices.create")!.args[0] as Record<string, unknown>;
    expect(inv).toMatchObject({
      collection_method: "send_invoice",
      days_until_due: 10,
      payment_settings: {
        payment_method_types: ["customer_balance"],
        payment_method_options: { customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "eu_bank_transfer", eu_bank_transfer: { country: "DE" } } } },
      },
      metadata: { offer_id: o.id, pg_kind: "offer_setup" },
    });
    expect(st.calls.some((c) => c.path === "invoices.sendInvoice")).toBe(true);
    const sched = st.calls.find((c) => c.path === "subscriptionSchedules.create")!.args[0] as { default_settings: Record<string, unknown> };
    expect(sched.default_settings).toMatchObject({ collection_method: "send_invoice", invoice_settings: { days_until_due: 10 } });
    expect(sched.default_settings).not.toHaveProperty("default_payment_method");

    const after = await prisma.offer.findUniqueOrThrow({ where: { id: o.id } });
    expect(after.zahlweise).toBe("ueberweisung");
    expect(after.paymentStatus).toBe("processing");
    expect(after.stripeSetupInvoiceId).toMatch(/^in_setup_/);
    expect(after.ueberweisungIban).toBe("DE89370400440532013000");

    // Zweiter Klick legt nichts doppelt an
    st.calls.length = 0;
    expect(await richteUeberweisungEin(o.id)).toEqual({ ok: true });
    expect(st.calls.filter((c) => c.path === "invoices.create")).toHaveLength(0);

    // Keine Doppelnachricht: Zahlungserinnerung zum Angebot nur noch für den Kontrollfall
    await runZahlungserinnerungen(um10("2026-11-18"));
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: o.id } })).paymentReminderCount).toBe(0);
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: kontrolle.id } })).paymentReminderCount).toBe(1);
    expect(st.mails.filter((m) => m.to === o.email)).toHaveLength(0);

    // Stattdessen übernimmt das Mahnwesen die Setup-Rechnung
    const fall = await mahnfallAusRechnung(invoice({ id: after.stripeSetupInvoiceId!, customer: after.stripeCustomerId!, due: "2026-11-28", offerId: o.id }));
    expect(fall).toBeTruthy();
    // Kunde aus dem Onboarding übernimmt Freigabe, Zahlungsziel und Zahlweise
    const kunde = await prisma.customer.findFirst({ where: { stripeCustomerId: after.stripeCustomerId! } });
    expect(kunde).toMatchObject({ allowBankTransfer: true, bankTransferDays: 10, zahltPerUeberweisung: true });
    customerIds.push(kunde!.id);
  });

  it("Setup-Rechnung eines Angebots, dessen Zahlung noch nicht eingerichtet ist: kein Mahnfall (Angebots-Erinnerung läuft)", async () => {
    const o = await acceptedOffer({ paymentStatus: "failed" });
    expect(await mahnfallAusRechnung(invoice({ customer: `cus_m_${uid()}`, due: "2026-11-20", offerId: o.id, method: "charge_automatically" }), { fehlgeschlagen: true })).toBeNull();
  });

  it("Mahnstufen nacheinander, kein Doppelversand, Mail + WhatsApp am Fälligkeitstag, Anruf-Aufgabe, Abbruch bei Zahlung", async () => {
    await prisma.messageTemplate.upsert({
      where: { customerId_name_language: { customerId: SUPPORT_CUSTOMER_ID, name: RECHNUNG_FAELLIG_TEMPLATE, language: "de" } },
      create: { customerId: SUPPORT_CUSTOMER_ID, name: RECHNUNG_FAELLIG_TEMPLATE, language: "de", purpose: "rechnung_zahlung", category: "utility", status: "approved", body: "x", auto: true },
      update: { status: "approved" },
    });
    const { customer, contact: c, stripeCustomerId } = await kundeMitKontakt();
    const inv = invoice({ customer: stripeCustomerId, due: "2026-12-01" });
    const id = (await mahnfallAusRechnung(inv, { now: um10("2026-11-20") }))!;
    // Gleiche Rechnung noch einmal (Webhook + Abgleich): ein Fall
    await mahnfallAusRechnung(inv, { now: um10("2026-11-21") });
    expect(await prisma.mahnfall.count({ where: { stripeInvoiceId: inv.id } })).toBe(1);

    const lauf = async (iso: string) => {
      await Promise.all([runMahnlauf(um10(iso), { abgleich: false }), runMahnlauf(um10(iso), { abgleich: false })]);
      return prisma.mahnfall.findUniqueOrThrow({ where: { id } });
    };
    const mails = () => st.mails.filter((m) => [m.to].flat().includes(inv.customer_email));
    expect((await lauf("2026-11-27")).stufe).toBe(0);
    expect((await lauf("2026-11-28")).stufe).toBe(1);
    expect(mails()).toHaveLength(1);
    expect(mails()[0].subject).toMatch(/^Erinnerung: Rechnung/);

    const f2 = await lauf("2026-12-01");
    expect(f2.stufe).toBe(2);
    expect(mails()[1].subject).toMatch(/^Zahlungserinnerung/);
    expect(st.wa.filter((w) => w.to === c.phone!.replace(/\D/g, ""))).toMatchObject([{ name: RECHNUNG_FAELLIG_TEMPLATE }]);

    expect((await lauf("2026-12-08")).stufe).toBe(3);
    expect(mails()[2].subject).toMatch(/^1\. Mahnung/);
    expect((await lauf("2026-12-15")).stufe).toBe(4);
    expect(mails()[3].subject).toMatch(/^2\. Mahnung/);
    const f5 = await lauf("2026-12-22");
    expect(f5.stufe).toBe(5);
    expect(mails()).toHaveLength(4);
    const task = await prisma.salesTask.findUniqueOrThrow({ where: { id: f5.anrufAufgabeId! } });
    expect(task).toMatchObject({ type: "ANRUF", contactId: c.id, doneAt: null });
    expect(task.title).toBe(`Kunde anrufen: ${customer.name}`);

    // Übersicht zeigt Mahnstufe
    const op = await ladeOffenePosten(um10("2026-12-22"), { customerId: customer.id });
    expect(op.posten).toMatchObject([{ stufe: 5, stufeLabel: "Kunde anrufen" }]);

    // Zahlung eingegangen (Webhook): Fall geschlossen, Aufgabe erledigt, nichts mehr
    expect(await rechnungBezahlt(inv.id, "stripe", um10("2026-12-23"))).toBe(true);
    expect(await rechnungBezahlt(inv.id, "stripe")).toBe(false);
    expect((await prisma.salesTask.findUniqueOrThrow({ where: { id: task.id } })).doneAt).not.toBeNull();
    expect((await prisma.mahnfall.findUniqueOrThrow({ where: { id } })).status).toBe("bezahlt");
  });

  it("Abbruch bei Zahlung vor der ersten Stufe und Stopp je Kunde", async () => {
    const a = await kundeMitKontakt();
    const invA = invoice({ customer: a.stripeCustomerId, due: "2026-12-01" });
    await mahnfallAusRechnung(invA);
    await rechnungBezahlt(invA.id, "stripe");
    await runMahnlauf(um10("2026-12-01"), { abgleich: false });
    expect(st.mails.filter((m) => [m.to].flat().includes(invA.customer_email))).toHaveLength(0);

    const b = await kundeMitKontakt();
    const invB = invoice({ customer: b.stripeCustomerId, due: "2026-12-01" });
    const idB = (await mahnfallAusRechnung(invB))!;
    expect(await setzeMahnStopp(b.customer.id, true, "Ratenzahlung vereinbart", { role: "ADMIN", email: "ole@test" })).toEqual({ ok: true });
    await runMahnlauf(um10("2026-12-01"), { abgleich: false });
    expect((await prisma.mahnfall.findUniqueOrThrow({ where: { id: idB } })).stufe).toBe(0);
    expect(await prisma.auditLog.count({ where: { customerId: b.customer.id, action: "billing.mahnstopp" } })).toBe(1);
    await setzeMahnStopp(b.customer.id, false, null);
    await runMahnlauf(um10("2026-12-01"), { abgleich: false });
    expect((await prisma.mahnfall.findUniqueOrThrow({ where: { id: idB } })).stufe).toBe(2);
  });

  it("fehlgeschlagene Lastschrift: Zahlungserinnerung am Tag des Fehlschlags, ohne Erinnerung vorab", async () => {
    const k = await kundeMitKontakt();
    const inv = invoice({ customer: k.stripeCustomerId, due: "2026-11-01", method: "charge_automatically" });
    // Ohne Fehlschlag (z. B. SEPA in Bearbeitung) kein Fall
    expect(await mahnfallAusRechnung(inv)).toBeNull();
    const id = (await mahnfallAusRechnung(inv, { fehlgeschlagen: true, pmType: "sepa_debit", now: um10("2026-12-03") }))!;
    const f = await prisma.mahnfall.findUniqueOrThrow({ where: { id } });
    expect(f).toMatchObject({ art: "lastschrift" });
    await runMahnlauf(um10("2026-12-03"), { abgleich: false });
    expect((await prisma.mahnfall.findUniqueOrThrow({ where: { id } })).stufe).toBe(2);
    expect(st.mails.filter((m) => [m.to].flat().includes(inv.customer_email)).map((m) => m.subject)).toEqual([expect.stringMatching(/^Zahlung nicht erfolgreich/)]);
  });

  it("Bankabgleich: eindeutig → in Stripe außerhalb bezahlt und Mahnlauf gestoppt; unsicher → Vorschlag zur Bestätigung", async () => {
    const k = await kundeMitKontakt();
    const eindeutig = invoice({ customer: k.stripeCustomerId, due: "2026-12-01", amount: 99_123 });
    const unsicher = invoice({ customer: k.stripeCustomerId, due: "2026-12-01", amount: 55_321 });
    const idE = (await mahnfallAusRechnung(eindeutig))!;
    const idU = (await mahnfallAusRechnung(unsicher))!;
    const now = um10("2026-12-05");
    const [txE, txU] = await Promise.all([
      prisma.bankTransaction.create({
        data: { accountKey: "test:mahnwesen", externalId: uid(), source: "csv", bookingDate: new Date("2026-12-04"), amount: 991.23, counterparty: "Muster GmbH", purpose: `Rechnung ${eindeutig.number.replace(/-/g, " ")}`, status: "ignoriert" },
      }),
      prisma.bankTransaction.create({
        data: { accountKey: "test:mahnwesen", externalId: uid(), source: "csv", bookingDate: new Date("2026-12-04"), amount: 500, counterparty: "Muster GmbH", purpose: `Teilzahlung ${unsicher.number}`, status: "ignoriert" },
      }),
      // Auszahlung von Stripe selbst: nie zuordnen
      prisma.bankTransaction.create({
        data: { accountKey: "test:mahnwesen", externalId: uid(), source: "csv", bookingDate: new Date("2026-12-04"), amount: 553.21, counterparty: "STRIPE PAYMENTS", purpose: "Payout", status: "ignoriert" },
      }),
    ]);
    const r = await bankAbgleichLauf(now);
    expect(r.zugeordnet).toBe(1);
    expect(st.calls.find((c) => c.path === "invoices.pay")?.args.slice(0, 2)).toEqual([eindeutig.id, { paid_out_of_band: true }]);
    expect(await prisma.mahnfall.findUniqueOrThrow({ where: { id: idE } })).toMatchObject({ status: "bezahlt", bezahltVia: "bank" });
    expect((await prisma.bankTransaction.findUniqueOrThrow({ where: { id: txE.id } })).mahnfallId).toBe(idE);

    const v = await prisma.zahlungsVorschlag.findMany({ where: { mahnfallId: idU } });
    expect(v).toMatchObject([{ bankTransactionId: txU.id, status: "offen" }]);
    // Zweiter Lauf: kein doppelter Vorschlag
    await bankAbgleichLauf(now);
    expect(await prisma.zahlungsVorschlag.count({ where: { mahnfallId: idU } })).toBe(1);
    // Bestätigen → bezahlt (von Hand), Mahnlauf gestoppt
    expect(await vorschlagEntscheiden(v[0].id, true, { role: "ADMIN", email: "ole@test" })).toEqual({ ok: true });
    expect(await prisma.mahnfall.findUniqueOrThrow({ where: { id: idU } })).toMatchObject({ status: "bezahlt", bezahltVia: "manuell" });
  });

  it("Kundenakte: Überweisung erlauben und Zahlungsziel ändern mit Audit-Eintrag", async () => {
    const k = await kundeMitKontakt();
    expect(await setzeUeberweisungKunde(k.customer.id, { allow: true, days: "21" }, { role: "ADMIN", email: "ole@test" })).toEqual({ ok: true, hinweis: undefined });
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: k.customer.id } })).toMatchObject({ allowBankTransfer: true, bankTransferDays: 21 });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { customerId: k.customer.id, action: "billing.ueberweisung" } });
    expect(log.details).toMatchObject({ erlaubt: { from: false, to: true }, zahlungsziel: { from: 14, to: 21 } });
  });

  it("keine Doppelmahnung mit dem alten Zahlungsverzug: keine 21-Tage-Warnung im Mahnlauf, Leads-Pause standardmäßig aus", async () => {
    const k = await kundeMitKontakt({ paymentOverdueSince: new Date(Date.now() - 31 * DAY) });
    await prisma.user.create({ data: { email: `owner-${uid()}@example.test`, passwordHash: "x", role: "BUYER", customerId: k.customer.id, teamRole: "owner" } });
    await mahnfallAusRechnung(invoice({ customer: k.stripeCustomerId, due: "2026-11-01" }));
    await runDunningCron(new Date(), true);
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: k.customer.id } });
    expect(c.paymentWarnedAt).toBeNull();
    expect(st.mails.filter((m) => m.subject === "Offene Rechnung: bitte begleichen")).toHaveLength(0);
    expect(await prisma.customerPause.count({ where: { customerId: k.customer.id } })).toBe(0);
    await prisma.user.deleteMany({ where: { customerId: k.customer.id } });
  });
});
