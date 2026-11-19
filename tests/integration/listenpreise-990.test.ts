// Neue Listenpreise 990/1.390/1.790 € (Ole, 18.11.2026): Die Migration 20261118999500_listenpreise_990 setzt offene
// Angebote zum alten Listenpreis auf den neuen; Sonderkonditionen, angenommene und Testangebote bleiben. Geprüft gegen
// die echte Datenbank: Migration (erneut ausgeführt, idempotent), Angebotsdokument, Annahme und Stripe-Zeitplan
// (gemockt, kein Netz) sowie die Diagnose q=preise-offen (nur lesend).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => {
  const calls: { path: string; args: unknown[] }[] = [];
  let n = 0;
  const answer = (path: string): unknown => {
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
        return { id: `cus_lp_${++n}` };
      case "setupIntents.retrieve":
        return { id: "seti_1", payment_method: "pm_sepa" };
      case "subscriptionSchedules.create":
        return { id: `sub_sched_lp_${++n}`, subscription: null };
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
        return Promise.resolve(answer(p));
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

import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { acceptOffer, createOffer } from "@/lib/offers";
import { createScheduleForOffer } from "@/lib/billing";
import { OfferDocument, toOfferDoc } from "@/components/offer-document";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { GET } from "@/app/api/ops/diagnose/route";
import { requireTestDb } from "./db";

const MIGRATION = fs.readFileSync(path.join(process.cwd(), "prisma/migrations/20261118999500_listenpreise_990/migration.sql"), "utf8");
const TOKEN = "test-read-token-0123456789-0123456789-preise";
const uid = () => Math.random().toString(36).slice(2, 8);
const contacts: string[] = [];
const offerIds: string[] = [];
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ");
function zukunftErster(): string {
  const [y, m] = addDaysIso(berlinTodayIso(), 40).split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

/** Angebot wie mit dem alten Code angelegt: Monatspreis-Stand 1.000 € (bzw. wie angegeben). */
async function angebot(extra: Partial<Parameters<typeof createOffer>[1]> = {}, stand: number | null = 1000) {
  const tag = uid();
  const contact = await prisma.salesContact.create({ data: { name: `Listenpreis ${tag}`, email: `lp-${tag}@example.test` } });
  contacts.push(contact.id);
  const o = await createOffer(
    { salesContactId: contact.id },
    {
      contactName: "Lena Liste",
      company: `Agentur ${tag}`,
      email: `lena-${tag}@example.test`,
      term: "12m",
      products: [{ name: "TKV-Katze", dailyBudget: 30 }],
      startDate: zukunftErster(),
      annual: true,
      abschlussBonus: 0,
      ...extra,
    },
    null,
  );
  offerIds.push(o.id);
  if (stand != null) await prisma.offer.update({ where: { id: o.id }, data: { monthlyFee: stand } });
  return o;
}
const fee = async (id: string) => Number((await prisma.offer.findUniqueOrThrow({ where: { id }, select: { monthlyFee: true } })).monthlyFee);
const accept = (token: string, annual: boolean | null = null) =>
  acceptOffer(token, { name: "Lena Liste", ip: "127.0.0.1", agent: "vitest", termsAccepted: true, business: { company: "Agentur Liste", confirmed: true }, annual });
const checkout = (id: string) => ({ id: `cs_${id}`, mode: "setup", setup_intent: "seti_1", customer: null }) as unknown as Stripe.Checkout.Session;
type Item = { quantity: number; price_data: { unit_amount: number; recurring?: { interval: string } } };
const zeitplanItems = () => (st.calls.filter((c) => c.path === "subscriptionSchedules.create").at(-1)!.args[0] as { phases: { items: Item[] }[] }).phases[0].items;
const summe = (items: Item[]) => items.reduce((s, i) => s + i.price_data.unit_amount * i.quantity, 0);

describe("Listenpreise 990: offene Angebote, Sonderkonditionen, angenommene", () => {
  const before = process.env.OPS_READ_TOKEN;
  beforeAll(() => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_listenpreise";
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
    process.env.OPS_READ_TOKEN = TOKEN;
  });
  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    process.env.OPS_READ_TOKEN = before;
    const obs = await prisma.onboarding.findMany({ where: { offerId: { in: offerIds } }, select: { customerId: true } });
    await prisma.onboarding.deleteMany({ where: { offerId: { in: offerIds } } }).catch(() => {});
    for (const ob of obs) if (ob.customerId) await prisma.customer.delete({ where: { id: ob.customerId } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { entityId: { in: offerIds } } });
    await prisma.offer.deleteMany({ where: { salesContactId: { in: contacts } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } }).catch(() => {});
  });
  beforeEach(() => {
    st.calls.length = 0;
    st.mails.length = 0;
  });

  it("neue Angebote bekommen den neuen Listenpreis", async () => {
    const o = await angebot({}, null);
    expect(Number(o.monthlyFee)).toBe(990);
    const zweite = await angebot({ products: [{ name: "TKV-Katze", dailyBudget: 150 }] }, null);
    expect(Number(zweite.monthlyFee)).toBe(1390);
  });

  it("Migration: offen + Listenpreis → neu; Sonderkondition, angenommen, Test, Nur Betreuung bleiben; zweimal ausgeführt ändert nichts", async () => {
    const offen = await angebot();
    const entwurf = await angebot({ products: [{ name: "TKV-Katze", dailyBudget: 150 }] }, 1400);
    await prisma.offer.update({ where: { id: entwurf.id }, data: { status: "draft" } });
    const zwei = await angebot({ products: [{ name: "TKV-Katze", dailyBudget: 30 }, { name: "Hund", dailyBudget: 20 }] }, 1350);
    const sonder = await angebot({ monthlyOverride: 900 }, null);
    const sonderHoch = await angebot({ monthlyOverride: 1400 }, null); // 1.400 € bei Budget der ersten Stufe: bewusst so vereinbart
    const angenommen = await angebot();
    await prisma.offer.update({ where: { id: angenommen.id }, data: { status: "accepted", acceptedAt: new Date() } });
    const ersetzt = await angebot();
    await prisma.offer.update({ where: { id: ersetzt.id }, data: { status: "superseded" } });
    const test = await angebot({ test: true }, 1000);
    const service = await angebot({ package: "service" }, null);

    await prisma.$executeRawUnsafe(MIGRATION);
    expect(await fee(offen.id)).toBe(990);
    expect(await fee(entwurf.id)).toBe(1390);
    expect(await fee(zwei.id)).toBe(1340);
    expect(await fee(sonder.id)).toBe(900);
    expect(await fee(sonderHoch.id)).toBe(1400);
    expect(await fee(angenommen.id)).toBe(1000);
    expect(await fee(ersetzt.id)).toBe(1000);
    expect(await fee(test.id)).toBe(1000);
    expect(await fee(service.id)).toBe(700);

    const log = await prisma.auditLog.findMany({ where: { action: "offer.listenpreis_990", entityId: { in: offerIds } }, select: { entityId: true, details: true } });
    expect(log.map((l) => l.entityId).sort()).toEqual([offen.id, entwurf.id, zwei.id].sort());
    expect(log.find((l) => l.entityId === offen.id)!.details).toEqual({ number: offen.number, alt: 1000, neu: 990 });

    // zweites Mal: nichts mehr zu tun
    await prisma.$executeRawUnsafe(MIGRATION);
    expect(await fee(offen.id)).toBe(990);
    expect(await prisma.auditLog.count({ where: { action: "offer.listenpreis_990", entityId: { in: offerIds } } })).toBe(3);
  });

  it("Angebotsseite/PDF: umgestelltes Angebot zeigt den neuen Preis und die neue Staffel, Sonderkondition und Altvertrag bleiben", async () => {
    const offen = await angebot();
    const sonder = await angebot({ monthlyOverride: 1200 }, null);
    const alt = await angebot();
    await prisma.offer.update({ where: { id: alt.id }, data: { status: "accepted", acceptedAt: new Date() } });
    await prisma.$executeRawUnsafe(MIGRATION);

    const html = async (id: string) => text(renderToStaticMarkup(createElement(OfferDocument, { offer: toOfferDoc(await prisma.offer.findUniqueOrThrow({ where: { id } })) })));
    const t = await html(offen.id);
    expect(t).toMatch(/990 € netto pro Monat/);
    expect(t).toMatch(/bis 3\.000 €: 990 €; über 3\.000 bis 6\.000 €: 1\.390 €/);
    // Vorauszahlung zur Wahl: 9 × 990 € (3 Monate geschenkt seit 19.11.2026)
    expect(t).toMatch(/8\.910 €/);
    expect(t).not.toMatch(/1\.000 € netto pro Monat/);
    // Satz unter dem Werbebudget (Ole, 18.11.2026): Preisstufe statt „richtet sich nach“, ohne „,00“
    expect(t).toMatch(/30 € pro Tag, etwa 900 € im Monat\. Das Werbebudget zahlen Sie direkt an Meta/);
    expect(t).toMatch(/Damit gilt für Betreuung und Software die Preisstufe bis 3\.000 € Werbebudget im Monat: 990 € netto im Monat\./);
    expect(t).not.toMatch(/richtet sich nach diesem Werbebudget/);
    expect(t).not.toMatch(/\d,00 €/);

    const s = await html(sonder.id);
    expect(s).toMatch(/1\.200 € netto pro Monat/);
    expect(s).toMatch(/Sonderkondition/);
    expect(s).toMatch(/Für Betreuung und Software gilt Ihr vereinbarter Preis: 1\.200 € netto im Monat\./);
    expect(s).not.toMatch(/Damit gilt für Betreuung und Software die Preisstufe/);

    const a = await html(alt.id);
    expect(a).toMatch(/1\.000 € netto pro Monat/);
    expect(a).toMatch(/bis 3\.000 €: 1\.000 €; über 3\.000 bis 6\.000 €: 1\.400 €/);
    expect(a).not.toMatch(/Sonderkondition/);
    expect(a).toMatch(/Damit gilt für Betreuung und Software die Preisstufe bis 3\.000 € Werbebudget im Monat: 1\.000 € netto im Monat\./);
  });

  it("Annahme und Stripe: umgestelltes Angebot rechnet 990 € ab (monatlich und jährlich 9 × 990 € = 8.910 €)", async () => {
    const m = await angebot();
    const j = await angebot();
    await prisma.$executeRawUnsafe(MIGRATION);

    expect(await accept(m.token, false)).toEqual({ ok: true });
    expect(st.mails.find((x) => x.subject.startsWith("Ihre Auftragsbestätigung"))!.list!.join(" ")).toMatch(/Monatlich: 990\s€ netto ab/);
    await prisma.offer.update({ where: { id: m.id }, data: { stripeCustomerId: "cus_lp_m" } });
    await createScheduleForOffer(m.id, checkout(m.id));
    const mi = zeitplanItems();
    expect(mi.every((i) => i.price_data.recurring?.interval === "month")).toBe(true);
    expect(summe(mi)).toBe(99000);
    const contact = await prisma.salesContact.findFirstOrThrow({ where: { offers: { some: { id: m.id } } }, select: { monthlyValue: true } });
    expect(contact.monthlyValue).toBe(990);

    expect(await accept(j.token, true)).toEqual({ ok: true });
    await prisma.offer.update({ where: { id: j.id }, data: { stripeCustomerId: "cus_lp_j" } });
    await createScheduleForOffer(j.id, checkout(j.id));
    const ji = zeitplanItems();
    expect(ji.every((i) => i.price_data.recurring?.interval === "year")).toBe(true);
    expect(summe(ji)).toBe(891000);
  });

  it("Sonderkondition wird zum vereinbarten Preis abgerechnet", async () => {
    const o = await angebot({ monthlyOverride: 1200, annual: false }, null);
    await prisma.$executeRawUnsafe(MIGRATION);
    expect(await accept(o.token)).toEqual({ ok: true });
    await prisma.offer.update({ where: { id: o.id }, data: { stripeCustomerId: "cus_lp_s" } });
    await createScheduleForOffer(o.id, checkout(o.id));
    expect(summe(zeitplanItems())).toBe(120000);
  });

  it("Diagnose q=preise-offen: umgestellte und noch alte offene Angebote mit Nummer, Name, alt, neu (nur lesend)", async () => {
    const um = await angebot();
    await prisma.$executeRawUnsafe(MIGRATION);
    const nachher = await angebot(); // nach der Migration mit altem Preis angelegt (z. B. alter Code beim Livegang)
    const req = (q: string) => new Request(`https://app.test/api/ops/diagnose?q=${q}`, { headers: { authorization: `Bearer ${TOKEN}` } });
    const r = await GET(req("preise-offen"));
    expect(r.status).toBe(200);
    type Zeile = { nummer: string; ansprechpartner: string; firma: string | null; alt: number; neu: number; statusJetzt?: string; monatlichJetzt?: number };
    const j = (await r.json()) as { data: { umgestellt: { liste: Zeile[] }; nochAlt: { anzahl: number; liste: Zeile[] } } };
    expect(j.data.umgestellt.liste.find((z) => z.nummer === um.number)).toMatchObject({ ansprechpartner: "Lena Liste", firma: um.company, alt: 1000, neu: 990, statusJetzt: "draft", monatlichJetzt: 990 });
    expect(j.data.nochAlt.liste.find((z) => z.nummer === nachher.number)).toMatchObject({ ansprechpartner: "Lena Liste", alt: 1000, neu: 990 });
    expect(j.data.nochAlt.liste.find((z) => z.nummer === um.number)).toBeUndefined();
    expect(JSON.stringify(j)).not.toContain(nachher.token);
    // nur lesend: Preis unverändert
    expect(await fee(nachher.id)).toBe(1000);
  });
});
