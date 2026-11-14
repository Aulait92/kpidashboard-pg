// Bestandskunden-Modul (Ole, 14.11.2026): Zusatzpakete (Stripe gemockt), Verbrauch erst Monat dann ältestes Paket,
// Pause am Limit mit Hinweis, automatisch nachbuchen, Umsatz/Kosten, „Letzten Import rückgängig machen“.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  invoiceItems: [] as { params: Record<string, unknown>; opts: Record<string, unknown> }[],
  invoices: [] as { params: Record<string, unknown> }[],
  failItems: false,
  notices: [] as { to: string; params: string[]; text: string; contactName?: string | null }[],
  pushes: [] as { title: string }[],
}));

vi.mock("stripe", () => {
  const s = st;
  class FakeStripe {
    products = {
      search: async () => ({ data: [] }),
      create: async (p: { metadata: { pg_key: string } }) => ({ id: `prod_${p.metadata.pg_key}` }),
    };
    tax = { registrations: { list: async () => ({ data: [{ id: "taxreg_1" }] }) } };
    customers = { retrieve: async () => ({ id: "cus", invoice_settings: { default_payment_method: "pm_1" } }) };
    subscriptions = { list: async () => ({ data: [{ id: "sub_1", status: "active", schedule: null, default_payment_method: "pm_1", items: { data: [] } }] }) };
    subscriptionSchedules = { list: async () => ({ data: [] }) };
    invoiceItems = {
      create: async (params: Record<string, unknown>, opts: Record<string, unknown>) => {
        if (s.failItems) throw new Error("Stripe kaputt");
        s.invoiceItems.push({ params, opts });
        return { id: `ii_${s.invoiceItems.length}` };
      },
    };
    invoices = {
      create: async (params: Record<string, unknown>) => {
        s.invoices.push({ params });
        return { id: `in_${s.invoices.length}` };
      },
      finalizeInvoice: async (id: string) => ({ id, status: "open" }),
      pay: async (id: string) => ({ id, status: "paid" }),
    };
  }
  return { default: FakeStripe };
});
vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return {
    ...real,
    sendWhatsAppNotice: async (o: { to: string; params: string[]; text: string; contactName?: string | null }) => {
      st.notices.push(o);
      return { mode: "template" as const, conversationId: null };
    },
  };
});
vi.mock("@/lib/push", () => {
  const rec = async (...args: unknown[]) => {
    const payload = args[args.length - 1] as { title: string };
    st.pushes.push({ title: payload?.title ?? "" });
    return { sent: 0, removed: 0, errors: [] };
  };
  return { sendToAdmins: rec, sendToBuyersOfCustomer: rec, sendToUser: rec };
});
const ctxState = vi.hoisted(() => ({ ctx: null as null | { customerId: string; email: string; preview: boolean; userId: string | null; teamRole: "owner" | "advisor" } }));
vi.mock("@/lib/buyer-context", () => ({ getBuyerContext: async () => ctxState.ctx }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma } from "@/lib/prisma";
import { runCampaigns } from "@/lib/bestand/campaigns";
import { bestandQuota, QUOTA_PAUSE } from "@/lib/bestand/quota";
import { bestandPackRevenueRows, bestandPackSpend, purchasePack, setAutoTopUp } from "@/lib/bestand/packs";
import { importRows, lastUndoableImport, undoLastImport } from "@/lib/bestand/import";
import { bookPackAction, runImportAction, undoImportAction } from "@/app/buyer/bestand/actions";
import { loadLedger } from "@/lib/zahlen";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const NUM = () => `4915${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
// Montag, 16.11.2026, 10:00 Uhr Berlin (Versandfenster Mo bis Sa 9 bis 19 Uhr)
const NOW = new Date("2026-11-16T09:00:00Z");

describe("Zusatzpakete und Kontingent", () => {
  const customers: string[] = [];
  beforeAll(() => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  });
  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    for (const id of customers) await cleanupCustomer(id);
  });
  beforeEach(() => {
    st.invoiceItems = [];
    st.invoices = [];
    st.failItems = false;
    st.notices = [];
    st.pushes = [];
  });

  async function setup(extra: Record<string, unknown> = {}, recipients = 0) {
    const c = await makeCustomer({ existingCustomersEnabled: true, stripeCustomerId: `cus_${uid()}`, plan: "software", ...extra });
    customers.push(c.id);
    const owner = await makeBuyer(c.id, "owner");
    const campaign = await prisma.customerCampaign.create({ data: { customerId: c.id, name: "Jahresgespräch", occasion: "review", segment: {}, status: "running", dailyLimit: 50, startedAt: NOW } });
    for (let i = 0; i < recipients; i++) {
      const ec = await prisma.existingCustomer.create({ data: { customerId: c.id, firstName: i === 0 ? null : `Kunde${i}`, company: i === 0 ? "Ohne Name GmbH" : null, phone: NUM(), lines: ["KFZ"] } });
      await prisma.customerCampaign.update({ where: { id: campaign.id }, data: { recipients: { create: { existingCustomerId: ec.id } } } });
    }
    return { c, owner, campaign };
  }

  it("Paket buchen: eigener Rechnungsposten, sofort frei, gültig 3 Monate", async () => {
    const { c, owner } = await setup();
    const r = await purchasePack(c.id, 2000, { actor: { id: owner.id, role: "kunde" }, now: NOW });
    expect(r).toMatchObject({ ok: true, messages: 2000, amount: 349 });
    expect(st.invoiceItems).toHaveLength(1);
    const item = st.invoiceItems[0];
    expect(item.params).toMatchObject({ customer: c.stripeCustomerId, price_data: { product: "prod_bestand_paket", unit_amount: 34900 } });
    expect(String(item.params.description)).toContain("2.000 Kampagnen-Nachrichten, gültig bis 16.02.2027");
    expect(item.opts).toEqual({ idempotencyKey: `bestand-paket-${r.ok ? r.packId : ""}` });
    const pack = await prisma.bestandMessagePack.findFirstOrThrow({ where: { customerId: c.id } });
    expect(pack).toMatchObject({ messages: 2000, source: "kauf", stripeStatus: "added", stripeInvoiceItemId: "ii_1" });
    expect(Number(pack.amount)).toBe(349);
    const q = await bestandQuota(c.id, NOW);
    expect(q).toMatchObject({ limit: 500, includedRemaining: 500, packRemaining: 2000, remaining: 2500 });
    expect(await prisma.auditLog.count({ where: { customerId: c.id, action: "bestand.paket" } })).toBe(1);
    // Unbekannte Paketgröße
    expect(await purchasePack(c.id, 1000, { now: NOW })).toEqual({ ok: false, error: "Dieses Paket gibt es nicht." });
  });

  it("Jahreszahler: eigene Rechnung sofort; ohne Online-Abrechnung: Anfrage statt Buchung; Stripe-Fehler: nichts freigeschaltet", async () => {
    const annual = await setup({ billingInterval: "year" });
    const r = await purchasePack(annual.c.id, 500, { now: NOW });
    expect(r.ok).toBe(true);
    expect(st.invoices).toHaveLength(1);
    expect(st.invoiceItems[0].params).toMatchObject({ invoice: "in_1", price_data: { product: "prod_bestand_paket", unit_amount: 9900 } });
    expect((await prisma.bestandMessagePack.findFirstOrThrow({ where: { customerId: annual.c.id } })).stripeStatus).toBe("invoiced");

    const noStripe = await setup({ stripeCustomerId: null });
    expect(await purchasePack(noStripe.c.id, 500, { now: NOW })).toMatchObject({ ok: false, fallback: true });

    const broken = await setup();
    st.failItems = true;
    const f = await purchasePack(broken.c.id, 500, { now: NOW });
    expect(f.ok).toBe(false);
    expect(await prisma.bestandMessagePack.count({ where: { customerId: broken.c.id } })).toBe(0);
  });

  it("Versand: erst Monatskontingent, dann ältestes Paket; Kunden ohne Namen neutral", async () => {
    const { c } = await setup({ bestandMessageQuota: 2 }, 4);
    const older = await prisma.bestandMessagePack.create({ data: { customerId: c.id, messages: 500, amount: 99, purchasedAt: new Date("2026-10-01T10:00:00Z"), expiresAt: new Date("2027-01-01T10:00:00Z") } });
    const newer = await prisma.bestandMessagePack.create({ data: { customerId: c.id, messages: 500, amount: 99, purchasedAt: new Date("2026-11-10T10:00:00Z"), expiresAt: new Date("2027-02-10T10:00:00Z") } });
    // abgelaufenes Paket zählt nicht
    await prisma.bestandMessagePack.create({ data: { customerId: c.id, messages: 500, amount: 99, purchasedAt: new Date("2026-07-01T10:00:00Z"), expiresAt: new Date("2026-10-01T10:00:00Z") } });
    await runCampaigns(NOW);
    const sent = await prisma.campaignRecipient.findMany({ where: { campaign: { customerId: c.id }, status: "sent" } });
    expect(sent).toHaveLength(4);
    expect(sent.filter((r) => r.packId === null)).toHaveLength(2);
    expect(sent.filter((r) => r.packId === older.id)).toHaveLength(2);
    expect(sent.some((r) => r.packId === newer.id)).toBe(false);
    const q = await bestandQuota(c.id, NOW);
    expect(q).toMatchObject({ used: 2, includedRemaining: 0, packRemaining: 998, remaining: 998, sentThisMonth: 4 });
    expect(q.packs.map((p) => p.id)).toEqual([older.id, newer.id]);
    const nameless = st.notices.find((n) => n.contactName === "Ohne Name GmbH");
    expect(nameless?.params[0]).toBe("und guten Tag");
  });

  it("Limit erreicht: Kampagne pausiert mit Hinweis, Paket setzt sie fort", async () => {
    const { c, campaign } = await setup({ bestandMessageQuota: 1 }, 2);
    await runCampaigns(NOW);
    expect(await prisma.campaignRecipient.count({ where: { campaignId: campaign.id, status: "sent" } })).toBe(1);
    await runCampaigns(NOW);
    const paused = await prisma.customerCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
    expect(paused).toMatchObject({ status: "paused", pausedReason: QUOTA_PAUSE });
    expect(st.pushes.some((p) => p.title === "Kampagne pausiert: Kontingent aufgebraucht")).toBe(true);
    expect((await purchasePack(c.id, 500, { now: NOW })).ok).toBe(true);
    expect(await prisma.customerCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).toMatchObject({ status: "running", pausedReason: null });
    await runCampaigns(NOW);
    const rest = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id, status: "sent", packId: { not: null } } });
    expect(rest).toHaveLength(1);
    // Nächster Monat: Monatskontingent wieder frei → am Kontingent pausierte Kampagnen laufen von selbst weiter
    await prisma.customerCampaign.update({ where: { id: campaign.id }, data: { status: "paused", pausedReason: QUOTA_PAUSE } });
    await prisma.bestandMessagePack.deleteMany({ where: { customerId: c.id } });
    await runCampaigns(new Date("2026-12-01T10:00:00Z"));
    expect((await prisma.customerCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).not.toBe("paused");
  });

  it("Automatisch nachbuchen bis zum Höchstbetrag, Standard aus", async () => {
    const off = await setup({ bestandMessageQuota: 0 }, 1);
    await runCampaigns(NOW);
    expect(st.invoiceItems).toHaveLength(0);
    expect((await prisma.customerCampaign.findUniqueOrThrow({ where: { id: off.campaign.id } })).pausedReason).toBe(QUOTA_PAUSE);

    const on = await setup({ bestandMessageQuota: 0 }, 1);
    expect(await setAutoTopUp(on.c.id, 50)).toMatchObject({ ok: false });
    expect(await setAutoTopUp(on.c.id, 150)).toEqual({ ok: true, max: 150 });
    await runCampaigns(NOW);
    const packs = await prisma.bestandMessagePack.findMany({ where: { customerId: on.c.id } });
    expect(packs).toHaveLength(1);
    expect(packs[0]).toMatchObject({ source: "auto", messages: 500 });
    expect(String(st.invoiceItems.at(-1)!.params.description)).toContain("automatisch nachgebucht");
    expect(await prisma.campaignRecipient.count({ where: { campaignId: on.campaign.id, status: "sent", packId: packs[0].id } })).toBe(1);
    // Höchstbetrag erreicht (99 + 99 > 150): kein zweites Paket
    const { autoTopUp } = await import("@/lib/bestand/packs");
    await prisma.bestandMessagePack.update({ where: { id: packs[0].id }, data: { messages: 1 } });
    expect(await autoTopUp(on.c.id, NOW)).toBe(false);
  });

  it("Umsatz und Kosten: Pakete mit Betrag und Kaufdatum", async () => {
    const { c } = await setup();
    await purchasePack(c.id, 500, { now: NOW });
    await purchasePack(c.id, 2000, { now: new Date("2026-11-20T10:00:00Z") });
    const spend = await bestandPackSpend(c.id, new Date("2026-11-01T00:00:00Z"), new Date("2026-12-01T00:00:00Z"));
    expect(spend.total).toBe(448);
    expect(spend.packs.map((p) => [p.messages, p.amount])).toEqual([
      [500, 99],
      [2000, 349],
    ]);
    const rows = await bestandPackRevenueRows(new Date("2026-01-01T00:00:00Z"));
    expect(rows.find((r) => r.customerId === c.id)).toEqual({ customerId: c.id, month: "2026-11", amount: 448 });
    const { ledger } = await loadLedger(new Date("2026-11-25T10:00:00Z"));
    expect(ledger.rows.filter((r) => r.customerId === c.id && r.stream === "setup").reduce((s, r) => s + r.amount, 0)).toBe(448);
  });

  it("Buchen im Kundenbereich nur durch den Inhaber mit Bestätigung", async () => {
    const { c, owner } = await setup();
    const advisor = await makeBuyer(c.id, "advisor");
    const fd = new FormData();
    fd.set("messages", "500");
    ctxState.ctx = { customerId: c.id, email: "berater@example.de", preview: false, userId: advisor.id, teamRole: "advisor" };
    expect((await bookPackAction({}, fd)).error).toMatch(/Inhaber/);
    ctxState.ctx = { customerId: c.id, email: "inhaber@example.de", preview: false, userId: owner.id, teamRole: "owner" };
    expect((await bookPackAction({}, fd)).error).toMatch(/bestätigen/);
    fd.set("confirm", "on");
    expect(await bookPackAction({}, fd)).toMatchObject({ ok: true });
    expect(await prisma.bestandMessagePack.count({ where: { customerId: c.id } })).toBe(1);
  });
});

describe("Import: Prüfung und „Letzten Import rückgängig machen“", () => {
  let customerId = "";
  let ownerId = "";
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ existingCustomersEnabled: true })).id;
    ownerId = (await makeBuyer(customerId, "owner")).id;
  });
  afterAll(() => cleanupCustomer(customerId));

  const file = (csv: string) => new File([csv], "kunden.csv", { type: "text/csv" });

  it("Server sperrt falsche Zuordnung; ohne Namen geht der Import", async () => {
    ctxState.ctx = { customerId, email: "inhaber@example.de", preview: false, userId: ownerId, teamRole: "owner" };
    const csv = "Firma;Ort;Email\nMuster GmbH;Köln;info@muster.de\nBeispiel AG;Bonn;kontakt@beispiel.de";
    const bad = new FormData();
    bad.set("file", file(csv));
    bad.set("map_firstName", "Email");
    bad.set("map_phone", "Email");
    bad.set("map_email", "Email");
    bad.set("consent", "on");
    expect((await runImportAction({}, bad)).error).toMatch(/^Vorname: .*E-Mail-Adressen/);
    expect(await prisma.existingCustomer.count({ where: { customerId } })).toBe(0);
    expect(await prisma.existingCustomerImport.count({ where: { customerId } })).toBe(0);

    const ok = new FormData();
    ok.set("file", file(csv));
    ok.set("map_company", "Firma");
    ok.set("map_city", "Ort");
    ok.set("map_email", "Email");
    ok.set("consent", "on");
    const r = await runImportAction({}, ok);
    expect(r.message).toMatch(/^2 Kunden übernommen \(2 neu/);
    const saved = await prisma.existingCustomer.findMany({ where: { customerId }, orderBy: { company: "asc" } });
    expect(saved.map((s) => [s.firstName, s.company, s.email])).toEqual([
      [null, "Beispiel AG", "kontakt@beispiel.de"],
      [null, "Muster GmbH", "info@muster.de"],
    ]);
    const run = await prisma.existingCustomerImport.findFirstOrThrow({ where: { customerId } });
    expect(run).toMatchObject({ fileName: "kunden.csv", rows: 2, created: 2, updated: 0 });
    expect(saved.every((s) => s.importId === run.id)).toBe(true);
  });

  it("Rückgängig: nur neu angelegte, angeschriebene bleiben, aktualisierte behalten den neuen Stand", async () => {
    await prisma.existingCustomer.deleteMany({ where: { customerId } });
    await prisma.existingCustomerImport.deleteMany({ where: { customerId } });
    const before = await prisma.existingCustomer.create({ data: { customerId, firstName: "Alt", lastName: "Bestand", phone: "4915100000011" } });
    const run = await prisma.existingCustomerImport.create({ data: { customerId, rows: 3 } });
    const rows = [
      { Name: "Alt Bestand", Mobil: "0151 00000011" },
      { Name: "Neu Eins", Mobil: "0151 00000012" },
      { Name: "Neu Zwei", Mobil: "0151 00000013" },
    ];
    const r = await importRows(customerId, rows, { fullName: "Name", phone: "Mobil" }, NOW, { importId: run.id });
    expect(r).toMatchObject({ created: 2, updated: 1 });
    expect((await prisma.existingCustomer.findUniqueOrThrow({ where: { id: before.id } })).importId).toBeNull();
    // Einer wurde schon angeschrieben → bleibt
    await prisma.existingCustomer.updateMany({ where: { customerId, lastName: "Zwei" }, data: { lastCampaignAt: NOW } });
    expect((await lastUndoableImport(customerId))?.removable).toBe(1);

    ctxState.ctx = { customerId, email: "inhaber@example.de", preview: false, userId: ownerId, teamRole: "owner" };
    expect((await undoImportAction({}, new FormData())).error).toMatch(/bestätigen/);
    const fd = new FormData();
    fd.set("confirm", "on");
    const res = await undoImportAction({}, fd);
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/^1 Kunden aus dem Import vom .* entfernt\. 1 bleiben/);
    const left = await prisma.existingCustomer.findMany({ where: { customerId }, orderBy: { lastName: "asc" } });
    expect(left.map((l) => l.lastName)).toEqual(["Bestand", "Zwei"]);
    expect(await prisma.existingCustomerImport.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ removed: 1, kept: 1, undoneById: ownerId });
    expect(await undoLastImport(customerId, ownerId)).toEqual({ ok: false, error: "Es gibt keinen Import, der sich rückgängig machen lässt." });
    expect(await prisma.auditLog.count({ where: { customerId, action: "bestand.import_undo" } })).toBe(1);
  });
});
