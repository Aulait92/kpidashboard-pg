// Zahlung nachträglich (Ole, 19.11.2026): Sonderkondition am Angebot (Offer.paymentInArrears). Bei Annahme nichts fällig
// (Setup 0 €), nur die Zahlungsart wird hinterlegt (Bezahlseite im Modus „setup“). Das Stripe-Abo beginnt einen Monat nach
// dem Start (erste Rechnung Start + 1 Monat, dann monatlich); jede Rechnung nennt den abgelaufenen Leistungsmonat
// (invoice.created). Kündigung zum Ende eines Leistungsmonats: Die Abbuchung für den letzten Monat kommt noch, danach endet
// das Abo genau am Ende dieses Stripe-Zeitraums (keine weitere Rechnung). Nur monatlich, Start am 1. bis 28.
// Stripe gemockt (kein Netz).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const st = vi.hoisted(() => {
  const calls: { path: string; args: unknown[] }[] = [];
  let n = 0;
  const state = { subs: [] as unknown[], schedules: [] as unknown[] };
  const answer = (path: string, args: unknown[]): unknown => {
    switch (path) {
      case "products.search": {
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
        return { id: `cus_na_${++n}` };
      case "checkout.sessions.create":
        return { id: `cs_na_${++n}`, url: "https://checkout.stripe.test/na" };
      case "setupIntents.retrieve":
        return { id: args[0], payment_method: "pm_sepa" };
      case "subscriptionSchedules.create":
        return { id: `sub_sched_na_${++n}`, subscription: null };
      case "subscriptions.list":
        return { data: state.subs };
      case "subscriptionSchedules.list":
        return { data: state.schedules };
      case "subscriptionSchedules.retrieve":
        return state.schedules.find((s) => (s as { id: string }).id === args[0]);
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
import { acceptOffer, createOffer, nachtraeglichFehler } from "@/lib/offers";
import { arrearsCancelTs, arrearsInvoiceText, createCheckoutForOffer, createScheduleForOffer, endSubscriptionsAt, labelArrearsInvoice } from "@/lib/billing";
import { handleStripeEvent, HANDLED_EVENTS } from "@/lib/billing-webhook";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { offerMailNachtraeglich } from "@/lib/email";
import { berlinEndOfDay, contractSummaryLines, naechsteNachtraeglicheAbbuchung, type ContractSummaryInput } from "@/lib/vertrag-laufzeit";
import { nachtraeglichLetzteZahlungText } from "@/lib/vertrag-kuendigung";
import { OfferDocument, type OfferDoc } from "@/components/offer-document";
import { AGB } from "@/lib/legal-texts";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { requireTestDb } from "./db";

type Line = { quantity: number; price_data: { product: string; unit_amount: number; recurring?: { interval: string; interval_count?: number } } };
type ScheduleParams = {
  start_date: number | "now";
  metadata: Record<string, string>;
  default_settings: { collection_method: string; description: string };
  phases: { items: Line[]; add_invoice_items?: unknown[]; metadata: Record<string, string> }[];
};

const uid = () => Math.random().toString(36).slice(2, 8);
const noon = (iso: string) => Math.floor(Date.parse(`${iso}T12:00:00Z`) / 1000);
const plusMonate = (iso: string, n: number) => {
  const [y, m] = iso.split("-").map(Number);
  const t = m - 1 + n;
  return `${y + Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
};
function zukunftErster(): string {
  const [y, m] = addDaysIso(berlinTodayIso(), 40).split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}
const last = (path: string) => st.calls.filter((c) => c.path === path).at(-1)?.args;
const all = (path: string) => st.calls.filter((c) => c.path === path).map((c) => c.args);
const nb = (s: string) => s.replace(/\u00a0/g, " ");
const summe = (items: Line[]) => items.reduce((s, i) => s + i.price_data.unit_amount * i.quantity, 0);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ");

const contacts: string[] = [];

/** Sonderangebot wie für Oles Kunden: Setup 0 €, 990 € netto im Monat, 3 Monate Mindestlaufzeit, nachträglich. */
async function angebot(extra: Partial<Parameters<typeof createOffer>[1]> = {}) {
  const tag = uid();
  const contact = await prisma.salesContact.create({ data: { name: `Nachtr ${tag}`, email: `na-${tag}@example.test` } });
  contacts.push(contact.id);
  return createOffer(
    { salesContactId: contact.id },
    {
      contactName: "Nora Nachher",
      company: `Agentur ${tag}`,
      email: `nora-${tag}@example.test`,
      term: "3m",
      products: [{ name: "TKV-Katze", dailyBudget: 30 }],
      seats: 3,
      setupOverride: 0,
      monthlyOverride: 990,
      startDate: zukunftErster(),
      abschlussBonus: 0,
      customerChoice: false,
      paymentInArrears: true,
      ...extra,
    },
    null,
  );
}
const accept = (token: string, extra: { annual?: boolean | null; startDate?: string | null } = {}) =>
  acceptOffer(token, { name: "Nora Nachher", ip: "127.0.0.1", agent: "vitest", termsAccepted: true, business: { company: "Agentur Nachher", confirmed: true }, ...extra });
const eingerichtet = (p: { mode: string; metadata: Record<string, string> }) =>
  ({ id: `cs_ok_${uid()}`, mode: p.mode, setup_intent: "seti_1", customer: null, metadata: p.metadata }) as unknown as Stripe.Checkout.Session;

beforeAll(() => {
  requireTestDb();
  process.env.STRIPE_SECRET_KEY = "sk_test_nachtraeglich";
  process.env.APP_URL = process.env.APP_URL || "https://app.test";
});
afterAll(async () => {
  delete process.env.STRIPE_SECRET_KEY;
  const offers = await prisma.offer.findMany({ where: { salesContactId: { in: contacts } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: offers.map((o) => o.id) } } }).catch(() => {});
  await prisma.offer.deleteMany({ where: { salesContactId: { in: contacts } } });
  await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
  await prisma.stripeEvent.deleteMany({ where: { id: { startsWith: "evt_na_" } } }).catch(() => {});
});
beforeEach(() => {
  st.calls.length = 0;
  st.mails.length = 0;
  st.state.subs = [];
  st.state.schedules = [];
});

describe("Zahlung nachträglich: Annahme und Abo", () => {
  it("Annahme: nichts fällig, nur Zahlungsart; Abo ab Start + 1 Monat, monatlich 990 €, Leistungszeitraum = Vormonat", async () => {
    const o = await angebot();
    expect(o.paymentInArrears).toBe(true);
    expect(await accept(o.token)).toEqual({ ok: true });
    const a = await prisma.offer.findUniqueOrThrow({ where: { id: o.id } });
    expect(a).toMatchObject({ paymentInArrears: true, annualPrepay: false, prepayAtAcceptance: false, billingDay: null });
    expect(Number(a.setupFee)).toBe(0);
    const start = a.startDate!.toISOString().slice(0, 10);
    const erste = plusMonate(start, 1);

    // Bezahlseite nur zum Hinterlegen der Zahlungsart (keine Zahlung bei Annahme)
    expect(await createCheckoutForOffer(o.id, "sepa")).toEqual({ url: "https://checkout.stripe.test/na" });
    const [p] = last("checkout.sessions.create") as [{ mode: string; line_items?: unknown; metadata: Record<string, string> }];
    expect(p.mode).toBe("setup");
    expect(p.line_items).toBeUndefined();
    expect(all("invoices.create")).toHaveLength(0);

    await createScheduleForOffer(o.id, eingerichtet(p));
    const [z] = last("subscriptionSchedules.create") as [ScheduleParams];
    // Erste Rechnung genau einen Monat nach dem Start (gleicher Tag, mittags wie das Startdatum)
    expect(z.start_date).toBe(noon(erste));
    expect(z.metadata).toMatchObject({ pg_arrears: "1", pg_arrears_start: start, pg_first_billing: erste });
    expect(z.phases).toHaveLength(1);
    expect(z.phases[0].metadata).toMatchObject({ pg_arrears: "1" });
    expect(z.phases[0].add_invoice_items).toBeUndefined();
    expect(z.phases[0].items.every((i) => i.price_data.recurring?.interval === "month" && (i.price_data.recurring.interval_count ?? 1) === 1)).toBe(true);
    expect(summe(z.phases[0].items)).toBe(99000);
    expect(z.default_settings.collection_method).toBe("charge_automatically");
    expect(z.default_settings.description).toContain("nachträglich für den abgelaufenen Leistungsmonat");
    // Kein Abo, keine Rechnung vor der ersten nachträglichen Abbuchung
    expect(all("subscriptions.create")).toHaveLength(0);
    expect(all("invoices.create")).toHaveLength(0);

    // Auftragsbestätigung mit den Konditionen
    const mail = st.mails.find((m) => m.subject.startsWith("Ihre Auftragsbestätigung"));
    expect(mail?.list?.map(nb)).toContain("Bei Annahme fällig: 0 €, ohne Einrichtungsgebühr.");
    expect(mail?.list?.join(" ")).toContain(`jeweils nachträglich für den abgelaufenen Monat, erstmals am ${erste.split("-").reverse().join(".")}`);
  });

  it("Rechnung (invoice.created): Leistungszeitraum ist der abgelaufene Monat, mit „(nachträglich)“", async () => {
    expect(HANDLED_EVENTS).toContain("invoice.created");
    const draft = (meta: Record<string, string>, status = "draft") =>
      ({
        id: `in_${uid()}`,
        status,
        created: noon("2027-01-01"),
        description: null,
        custom_fields: [{ name: "Steuernummer", value: "12/345/67890" }],
        parent: { type: "subscription_details", subscription_details: { metadata: meta, subscription: "sub_1" } },
        lines: { data: [{ period: { start: noon("2027-01-01"), end: noon("2027-02-01") }, parent: { type: "subscription_item_details" } }] },
      }) as unknown as Stripe.Invoice;
    expect(await labelArrearsInvoice(draft({ pg_arrears: "1" }))).toBe(true);
    const [id, upd] = last("invoices.update") as [string, { description: string; custom_fields: { name: string; value: string }[] }];
    expect(id).toMatch(/^in_/);
    expect(upd.description).toBe("Vergütung nachträglich für den Leistungszeitraum 01.12.2026 bis 31.12.2026");
    expect(upd.custom_fields).toEqual([
      { name: "Steuernummer", value: "12/345/67890" },
      { name: "Leistungszeitraum", value: "01.12.2026 bis 31.12.2026 (nachträglich)" },
    ]);
    // Februar (kurzer Monat) und Jahreswechsel
    expect(arrearsInvoiceText("2027-03-01").field.value).toBe("01.02.2027 bis 28.02.2027 (nachträglich)");
    expect(arrearsInvoiceText("2027-01-15").field.value).toBe("15.12.2026 bis 14.01.2027 (nachträglich)");

    // Normale Abos und fertige Rechnungen bleiben unberührt
    st.calls.length = 0;
    expect(await labelArrearsInvoice(draft({ offer_id: "x" }))).toBe(false);
    expect(await labelArrearsInvoice(draft({ pg_arrears: "1" }, "open"))).toBe(false);
    expect(all("invoices.update")).toHaveLength(0);

    // Über den Webhook
    await handleStripeEvent({ id: `evt_na_${uid()}`, type: "invoice.created", data: { object: draft({ pg_arrears: "1" }) } } as unknown as Stripe.Event);
    expect(all("invoices.update")).toHaveLength(1);
  });

  it("Kündigung zum Ende der Mindestlaufzeit: letzte nachträgliche Abbuchung am 01.03., danach keine Rechnung mehr", async () => {
    // Start 01.12.2026, Abo ab 01.01.2027 (Anker mittags), Mindestlaufzeit bis 28.02.2027
    const anchor = noon("2027-01-01");
    st.state.subs = [
      { id: "sub_na", status: "active", schedule: null, billing_cycle_anchor: anchor, cancel_at: null, cancel_at_period_end: false, metadata: { pg_arrears: "1" } },
      { id: "sub_normal", status: "active", schedule: null, billing_cycle_anchor: anchor, cancel_at: null, cancel_at_period_end: false, metadata: {} },
    ];
    const endAt = berlinEndOfDay("2027-02-28");
    const res = await endSubscriptionsAt("cus_na", endAt, new Date("2027-01-10T10:00:00Z"));
    expect(res).toMatchObject({ ok: true, changed: ["sub_na", "sub_normal"] });
    const updates = all("subscriptions.update") as [string, { cancel_at: number; proration_behavior: string }][];
    const na = updates.find((u) => u[0] === "sub_na")![1];
    // Abrechnungstage 01.01., 01.02., 01.03. (bezahlt Februar) liegen vor dem Ende; Ende genau am Ende dieses Zeitraums
    expect(na).toEqual({ cancel_at: noon("2027-04-01"), proration_behavior: "none" });
    expect(noon("2027-03-01")).toBeLessThan(na.cancel_at);
    // Ohne nachträgliche Zahlung wie bisher: Ende des letzten Vertragstags
    expect(updates.find((u) => u[0] === "sub_normal")![1].cancel_at).toBe(Math.floor(endAt.getTime() / 1000));

    // Später gekündigt (nach der Mindestlaufzeit, zum 31.05.): letzte Abbuchung 01.06., Ende 01.07.
    expect(arrearsCancelTs(anchor, Math.floor(berlinEndOfDay("2027-05-31").getTime() / 1000))).toBe(noon("2027-07-01"));
    // Abo noch nicht gestartet (Zeitplan): endet einen Monat nach dem Folgetag des Vertragsendes
    st.calls.length = 0;
    st.state.subs = [];
    st.state.schedules = [{ id: "sched_na", status: "not_started", end_behavior: "release", metadata: { pg_arrears: "1" }, phases: [{ start_date: anchor, end_date: anchor + 30 * 86400, items: [{ price: "price_1", quantity: 1 }] }] }];
    expect(await endSubscriptionsAt("cus_na", endAt, new Date("2026-12-10T10:00:00Z"))).toMatchObject({ ok: true, changed: ["sched_na"] });
    const [, upd] = last("subscriptionSchedules.update") as [string, { phases: { end_date: number }[]; end_behavior: string }];
    expect(upd.end_behavior).toBe("cancel");
    expect(upd.phases.at(-1)!.end_date).toBe(noon("2027-04-01"));
  });

  it("Validierung: nur monatlich, nicht mit Vorauszahlung oder Abrechnungstag, Start am 1. bis 28.", async () => {
    await expect(angebot({ term: "12m", annual: true })).rejects.toThrow(/nur mit monatlicher Zahlung/);
    await expect(angebot({ billingDay: 15 })).rejects.toThrow(/Abrechnungstag/);
    const [y, m] = zukunftErster().split("-");
    await expect(angebot({ startDate: `${y}-${m}-29` })).rejects.toThrow(/1\. und 28\./);
    expect(nachtraeglichFehler({ annual: false, billingDay: null, startIso: "2026-12-01" })).toBeNull();
    expect(nachtraeglichFehler({ annual: false, billingDay: null, billingFreeStart: true })).toMatch(/kostenlosem Start/);
    // Testangebot: Schalter wirkt nicht
    const t = await angebot({ test: true });
    expect(t.paymentInArrears).toBe(false);
    // Kunde wählt den Start selbst: 29. wird bei der Annahme abgelehnt
    const frei = await angebot({ customerChoice: true });
    const tag29 = `${y}-${m}-29`;
    const r = await accept(frei.token, { startDate: tag29 });
    expect(r.ok).toBe(false);
  });

  it("Regression: Angebot ohne den Schalter bleibt wie bisher (Abo ab Start, keine Markierung)", async () => {
    const o = await angebot({ paymentInArrears: undefined, setupOverride: 990, abschlussBonus: 0 });
    expect(o.paymentInArrears).toBe(false);
    expect(await accept(o.token)).toEqual({ ok: true });
    const a = await prisma.offer.findUniqueOrThrow({ where: { id: o.id } });
    await createCheckoutForOffer(o.id, "sepa");
    const [p] = last("checkout.sessions.create") as [{ mode: string; metadata: Record<string, string> }];
    expect(p.mode).toBe("payment");
    await createScheduleForOffer(o.id, { id: `cs_${uid()}`, mode: "payment", payment_intent: "pi_1", customer: null, metadata: p.metadata } as unknown as Stripe.Checkout.Session);
    const [z] = last("subscriptionSchedules.create") as [ScheduleParams];
    expect(z.start_date).toBe(Math.floor(a.startDate!.getTime() / 1000));
    expect(z.metadata.pg_arrears).toBeUndefined();
    expect(z.phases[0].metadata.pg_arrears).toBeUndefined();
    expect(z.default_settings.description).not.toContain("nachträglich");
  });
});

describe("Zahlung nachträglich: Texte", () => {
  const beispiel: ContractSummaryInput = { term: "3m", startIso: "2026-12-01", setup: 0, monthlyTotal: 990, intro: null, annual: false, freeMonths: 0, paymentInArrears: true };

  it("Zusammenfassung am Knopf und in der Auftragsbestätigung (Beispiel Start 01.12.2026)", () => {
    const lines = contractSummaryLines(beispiel).map(nb);
    expect(lines).toEqual([
      "Bei Annahme fällig: 0 €, ohne Einrichtungsgebühr.",
      "Monatlich: 990 € netto, jeweils nachträglich für den abgelaufenen Monat, erstmals am 01.01.2027.",
      "Mindestlaufzeit 3 Monate bis 28.02.2027, danach monatlich kündbar zum Ende des jeweiligen Leistungsmonats. Auch danach zahlen Sie nachträglich, die Zahlung für den letzten Monat folgt nach Vertragsende.",
      "Kündigen können Sie jederzeit im Kundenbereich unter Konto & Rechnungen oder in Textform. Alle Preise zzgl. 19 % USt.",
    ]);
    // Ohne Schalter unverändert
    expect(nb(contractSummaryLines({ ...beispiel, paymentInArrears: false })[0])).toBe("Monatlich: 990 € netto ab 01.12.2026, im Voraus.");
    for (const l of lines) {
      expect(hatGedankenstrich(l)).toBe(false);
      expect(l).not.toMatch(/Garantie/);
    }
  });

  it("Angebotsmail, Kündigung und Konto", () => {
    expect(nb(offerMailNachtraeglich({ ersteIso: "2027-01-01", setup: 0 }))).toBe("Zahlung: monatlich nachträglich für den abgelaufenen Monat, erstmals am 01.01.2027. Bei Annahme fällig: 0 €.");
    expect(nachtraeglichLetzteZahlungText("2027-02-28")).toBe("Die Vergütung für den letzten Monat buchen wir wie vereinbart nachträglich am 01.03.2027 ab, danach nichts mehr.");
    expect(naechsteNachtraeglicheAbbuchung("2026-12-01", "2026-12-15")).toEqual({ chargeIso: "2027-01-01", fromIso: "2026-12-01", toIso: "2026-12-31" });
    // Gekündigt zum 28.02.: nach der Abbuchung am 01.03. kommt nichts mehr
    expect(naechsteNachtraeglicheAbbuchung("2026-12-01", "2027-02-10", "2027-02-28")?.chargeIso).toBe("2027-03-01");
    expect(naechsteNachtraeglicheAbbuchung("2026-12-01", "2027-03-02", "2027-02-28")).toBeNull();
  });

  it("Angebotsdokument: Bei Annahme fällig 0 €, Zahlweise nachträglich, Laufzeit", () => {
    const doc: OfferDoc = {
      number: "PG-2026-0990",
      version: 1,
      status: "sent",
      contactName: "Nora Nachher",
      company: "Agentur Nachher",
      street: null,
      zip: null,
      city: null,
      package: "software",
      vermittlerTyp: "vertreter",
      term: "3m",
      products: [{ name: "TKV-Katze", dailyBudget: 30 }],
      setupFee: 0,
      monthlyFee: 990,
      softwareFee: 349,
      introMonthlyFee: null,
      introMonths: null,
      specialTerms: null,
      startDate: new Date("2026-12-01T12:00:00Z"),
      validUntil: new Date("2026-12-02T12:00:00Z"),
      createdAt: new Date("2026-11-19T16:00:00Z"),
      acceptedAt: null,
      acceptedName: null,
      termsUrl: null,
      dpaUrl: null,
      seats: 3,
      seatsIncluded: 3,
      seatMonthly: 49,
      bestandMonthly: null,
      annualPrepay: false,
      annualFreeMonths: null,
      annualChoice: false,
      customerChoosesTerm: false,
      customerChoosesStart: false,
      paymentInArrears: true,
    };
    const t = text(renderToStaticMarkup(createElement(OfferDocument, { offer: doc })));
    expect(t).toContain("Bei Annahme fällig 0 € , keine Einrichtungsgebühr");
    expect(t).toContain("Bei der Annahme hinterlegen Sie nur Ihre Zahlungsart.");
    expect(t).toContain("wird nachträglich am 01.01.2027 fällig, für den Monat 01.12.2026 bis 31.12.2026.");
    expect(t).toContain("Monatlich nachträglich: 990 € netto jeweils für den abgelaufenen Leistungsmonat, erstmals am 01.01.2027 für 01.12.2026 bis 31.12.2026.");
    expect(t).toContain("3 Monate ab Start, danach monatlich kündbar zum Ende des jeweiligen Leistungsmonats.");
    expect(t).toContain("Ab diesem Tag läuft die Leistung, bezahlt wird jeweils nachträglich für den abgelaufenen Monat, erstmals am 01.01.2027.");
    expect(t).not.toContain("monatlich im Voraus, per SEPA");
    // Ohne Schalter: wie bisher
    const normal = text(renderToStaticMarkup(createElement(OfferDocument, { offer: { ...doc, paymentInArrears: false, setupFee: 990 } })));
    expect(normal).toContain("monatlich im Voraus, per SEPA");
    expect(normal).not.toContain("Monatlich nachträglich");
  });

  it("AGB: Sonderregel für nachträgliche Zahlung, ohne Gedankenstriche", () => {
    const satz = AGB.flatMap((s) => s.items).find((i) => typeof i === "string" && i.includes("nachträgliche Zahlung")) as string;
    expect(satz).toContain("Ist im Angebot nachträgliche Zahlung vereinbart, wird die monatliche Vergütung abweichend davon jeweils nachträglich für den abgelaufenen Leistungsmonat fällig");
    expect(hatGedankenstrich(satz)).toBe(false);
  });
});
