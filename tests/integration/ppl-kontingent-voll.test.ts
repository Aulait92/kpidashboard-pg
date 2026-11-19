import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Meldung „Kontingent erreicht“: genau einmal je Bezug und Zeitraum an Admins (Push) und Slack.
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendCustomerMail: vi.fn(async () => ({ ok: true as const })),
}));
const pushes: { title: string; body: string }[] = [];
vi.mock("@/lib/push", () => ({
  sendToAdmins: vi.fn(async (p: { title: string; body: string }) => {
    pushes.push(p);
  }),
  sendToCustomer: vi.fn(async () => {}),
}));
const slacks: string[] = [];
vi.mock("@/lib/ppl/slack", async (orig) => ({
  ...(await orig<typeof import("@/lib/ppl/slack")>()),
  postSlack: vi.fn(async (text: string) => {
    slacks.push(text);
    return true;
  }),
}));

import { prisma } from "@/lib/prisma";
import { deliver, ingestPoolLead } from "@/lib/ppl/engine";
import { kontingentVollText } from "@/lib/ppl/kontingent-voll";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const rnd = () => Math.random().toString(36).slice(2, 7);
const run = String(Math.floor(Math.random() * 1e5)).padStart(5, "0");
let n = 0;
const fields = (product: string, plz = "50667") => {
  n++;
  return { vorname: "Test", nachname: `Voll${n}`, telefon: `01523${run}${String(n).padStart(2, "0")}`, email: `kv${n}-${product}@test.local`, postleitzahl: plz, beitrag: "900 €", situation: "Angestellt" };
};
const voll = () => pushes.filter((p) => /Kontingent erreicht|Gebiet voll/.test(p.body));
const vollSlack = () => slacks.filter((t) => /Kontingent erreicht|Gebiet voll/.test(t));

describe("Pay-per-Lead: Meldung Kontingent erreicht", () => {
  const customers: string[] = [];
  const products: string[] = [];
  beforeAll(() => requireTestDb());
  beforeEach(() => {
    pushes.length = 0;
    slacks.length = 0;
  });
  afterAll(async () => {
    await prisma.poolLead.deleteMany({ where: { productKey: { in: products } } });
    for (const c of customers) await cleanupCustomer(c);
  });

  it("einmalig: 24. Lead meldet nichts, 25. genau einmal, weitere keine zweite", async () => {
    const product = `PKV-Voll-${rnd()}`;
    products.push(product);
    const c = await makeCustomer({ name: "verrata24" });
    customers.push(c.id);
    const sub = await prisma.leadSubscription.create({
      data: { customerId: c.id, productKey: product, label: "tarifklar", price: 40, period: "once", goal: 25, delivery: "email", deliveryEmail: "v@test.local" },
    });
    for (let i = 1; i <= 24; i++) expect((await ingestPoolLead({ productKey: product, via: "webhook", fields: fields(product) })).status).toBe("delivered");
    expect(voll()).toHaveLength(0);
    expect(vollSlack()).toHaveLength(0);

    expect((await ingestPoolLead({ productKey: product, via: "webhook", fields: fields(product) })).status).toBe("delivered");
    expect(voll()).toHaveLength(1);
    expect(vollSlack()).toHaveLength(1);
    expect(voll()[0].body).toBe("Kontingent erreicht: verrata24 (tarifklar), " + product + ", 25 von 25 Leads geliefert (einmalig). Der Bezug bekommt keine weiteren Leads.");
    expect(hatGedankenstrich(voll()[0].body)).toBe(false);

    // 26. wird geparkt (voll); von Hand doch zugewiesen: keine zweite Meldung
    const r26 = await ingestPoolLead({ productKey: product, via: "webhook", fields: fields(product) });
    expect(r26.status).toBe("parked");
    await deliver(r26.poolLeadId, sub, null);
    expect(voll()).toHaveLength(1);
    expect(vollSlack()).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { action: "ppl.kontingent_voll", entityId: sub.id } })).toBe(1);
  });

  it("Monat: Meldung mit Monatsnamen, Slack aus (slackNotify) nur Push", async () => {
    const product = `PKV-Voll-${rnd()}`;
    products.push(product);
    const c = await makeCustomer();
    customers.push(c.id);
    await prisma.leadSubscription.create({ data: { customerId: c.id, productKey: product, price: 40, period: "month", goal: 2, slackNotify: false, delivery: "email", deliveryEmail: "m@test.local" } });
    await ingestPoolLead({ productKey: product, via: "webhook", fields: fields(product) });
    expect(voll()).toHaveLength(0);
    await ingestPoolLead({ productKey: product, via: "webhook", fields: fields(product) });
    expect(voll()).toHaveLength(1);
    const monat = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", month: "long" }).format(new Date());
    expect(voll()[0].body).toContain(`2 von 2 Leads geliefert im ${monat}.`);
    expect(vollSlack()).toHaveLength(0);
  });

  it("Gebiet mit eigener Menge voll, Bezug noch offen: eigene Meldung einmal", async () => {
    const product = `PKV-Voll-${rnd()}`;
    products.push(product);
    const c = await makeCustomer();
    customers.push(c.id);
    const sub = await prisma.leadSubscription.create({ data: { customerId: c.id, productKey: product, price: 40, period: "month", delivery: "email", deliveryEmail: "g@test.local" } });
    await prisma.subscriptionArea.create({ data: { subscriptionId: sub.id, label: "Köln", plzRanges: "50000-51999", quantity: 1 } });
    await prisma.subscriptionArea.create({ data: { subscriptionId: sub.id, label: "Bonn", plzRanges: "53000-53999", quantity: 2 } });
    await ingestPoolLead({ productKey: product, via: "webhook", fields: fields(product, "50667") });
    expect(voll()).toHaveLength(1);
    expect(voll()[0].body).toContain("Gebiet voll:");
    expect(voll()[0].body).toContain("Gebiet Köln, 1 von 1 Leads geliefert");
    await ingestPoolLead({ productKey: product, via: "webhook", fields: fields(product, "53111") });
    expect(voll()).toHaveLength(1);
    // Bonn 2/2 → Summe der Gebiete (3) erreicht: Kontingent-Meldung für den Bezug
    await ingestPoolLead({ productKey: product, via: "webhook", fields: fields(product, "53113") });
    expect(voll()).toHaveLength(2);
    expect(voll()[1].body).toContain("Kontingent erreicht:");
    expect(voll()[1].body).toContain("3 von 3 Leads geliefert im");
  });

  it("Text ohne Gedankenstriche, Bezug ohne eigenen Namen", () => {
    const t = kontingentVollText({ customer: "Kunde", label: null, product: "PKV", delivered: 5, quota: 5, zeitraum: "im November", period: "month" });
    expect(t).toBe("Kontingent erreicht: Kunde, PKV, 5 von 5 Leads geliefert im November. Der Bezug bekommt diesen Monat keine weiteren Leads.");
    expect(hatGedankenstrich(t)).toBe(false);
  });
});
