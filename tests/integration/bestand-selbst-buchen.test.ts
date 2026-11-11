// Bestandskunden-Modul im Kundenbereich selbst buchen und kündigen (Ole, 11.11.2026).
// Stripe ist gemockt; geprüft werden Abo-Positionen, Kundenakte und Änderungsprotokoll.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Item = { id: string; quantity: number; current_period_end: number; price: { product: string; unit_amount: number; recurring: { interval: string } } };
const PERIOD_END = Math.floor(Date.UTC(2026, 11, 1, 0, 0, 0) / 1000); // 01.12.2026
const st = vi.hoisted(() => ({
  sub: null as null | { id: string; status: string; schedule: null; default_payment_method: string | null; items: { data: Item[] } },
  customerPm: null as string | null,
  calls: [] as { method: string; args: unknown[] }[],
}));

vi.mock("stripe", () => {
  const s = st;
  const log = (method: string, args: unknown[]) => s.calls.push({ method, args });
  class FakeStripe {
    products = {
      search: async () => ({ data: [] }),
      create: async (p: { metadata: { pg_key: string } }) => ({ id: `prod_${p.metadata.pg_key}` }),
    };
    tax = { registrations: { list: async () => ({ data: [{ id: "taxreg_1" }] }) } };
    customers = {
      update: async () => ({}),
      retrieve: async () => ({ id: "cus", invoice_settings: { default_payment_method: s.customerPm } }),
    };
    subscriptions = { list: async () => ({ data: s.sub ? [s.sub] : [] }) };
    subscriptionItems = {
      create: async (p: { quantity: number; proration_behavior: string; price_data: Item["price"] }) => {
        log("subscriptionItems.create", [p]);
        s.sub?.items.data.push({ id: `si_${s.sub.items.data.length + 1}`, quantity: p.quantity, current_period_end: PERIOD_END, price: { ...p.price_data } });
        return {};
      },
      update: async (id: string, p: unknown) => {
        log("subscriptionItems.update", [id, p]);
        return {};
      },
      del: async (id: string, p: unknown) => {
        log("subscriptionItems.del", [id, p]);
        if (s.sub) s.sub.items.data = s.sub.items.data.filter((i) => i.id !== id);
        return {};
      },
    };
  }
  return { default: FakeStripe };
});

const ctxState = vi.hoisted(() => ({ ctx: null as null | { customerId: string; email: string; preview: boolean; userId: string | null; teamRole: "owner" | "advisor" } }));
vi.mock("@/lib/buyer-context", () => ({ getBuyerContext: async () => ctxState.ctx }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma } from "@/lib/prisma";
import { bookBestandModuleAction, cancelBestandModuleAction } from "@/app/buyer/bestand/actions";
import { canSelfBookBestand, selfBookBestand, selfCancelBestand } from "@/lib/bestand/self-service";
import { expireBestandCancellations } from "@/lib/billing";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const software = () => ({ id: "si_sw", quantity: 1, current_period_end: PERIOD_END, price: { product: "prod_software", unit_amount: 34900, recurring: { interval: "month" } } });

describe("Bestandskunden-Modul selbst buchen/kündigen", () => {
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
    st.calls = [];
    st.customerPm = null;
    st.sub = { id: "sub_1", status: "active", schedule: null, default_payment_method: "pm_sepa", items: { data: [software()] } };
  });

  async function customer(extra: Record<string, unknown> = {}) {
    const c = await makeCustomer({ stripeCustomerId: `cus_${uid()}`, plan: "software", ...extra });
    customers.push(c.id);
    const owner = await makeBuyer(c.id, "owner");
    return { c, owner };
  }

  it("Buchen: Position anteilig angelegt, Modul frei, Audit mit Kunde als Auslöser", async () => {
    const { c, owner } = await customer();
    expect(await canSelfBookBestand(c.id)).toEqual({ ok: true });
    const res = await selfBookBestand(c.id, { id: owner.id, email: "inhaber@example.de", role: "kunde" });
    expect(res).toEqual({ ok: true });
    const created = st.calls.find((x) => x.method === "subscriptionItems.create")!.args[0] as { proration_behavior: string; price_data: { product: string; unit_amount: number } };
    expect(created).toMatchObject({ proration_behavior: "create_prorations", price_data: { product: "prod_bestand", unit_amount: 14900 } });
    const after = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.existingCustomersEnabled).toBe(true);
    expect(Number(after.bestandMonthly)).toBe(149);
    const log = await prisma.auditLog.findFirst({ where: { customerId: c.id, action: "billing.bestand" }, orderBy: { at: "desc" } });
    expect(log?.actorRole).toBe("kunde");
    // schon gebucht → nicht erneut buchbar
    expect(await canSelfBookBestand(c.id)).toEqual({ ok: false, reason: "Das Modul ist bereits gebucht." });
  });

  it("Jahreszahler: Position im Jahresintervall (10 × Monatspreis)", async () => {
    const { c, owner } = await customer({ billingInterval: "year" });
    st.sub!.items.data = [{ ...software(), price: { product: "prod_software", unit_amount: 349000, recurring: { interval: "year" } } }];
    expect(await selfBookBestand(c.id, { id: owner.id, role: "kunde" })).toEqual({ ok: true });
    const created = st.calls.find((x) => x.method === "subscriptionItems.create")!.args[0] as { price_data: { unit_amount: number; recurring: { interval: string } } };
    expect(created.price_data.recurring.interval).toBe("year");
    expect(created.price_data.unit_amount).toBe(149000);
  });

  it("Voraussetzungen fehlen → nichts gebucht, Rückfall auf Anfrage", async () => {
    const service = await customer({ plan: "service" });
    expect(await canSelfBookBestand(service.c.id)).toEqual({ ok: false, reason: "Das Modul gibt es nur im Paket mit Software." });

    const overdue = await customer({ paymentOverdueSince: new Date() });
    const r = await selfBookBestand(overdue.c.id, { id: overdue.owner.id, role: "kunde" });
    expect(r).toMatchObject({ ok: false, fallback: true, error: "Es ist noch eine Rechnung offen." });

    const noStripe = await customer({ stripeCustomerId: null });
    expect(await canSelfBookBestand(noStripe.c.id)).toMatchObject({ ok: false, reason: "Für Ihr Konto ist keine Online-Abrechnung eingerichtet." });

    st.sub = null;
    const noSub = await customer();
    expect(await canSelfBookBestand(noSub.c.id)).toEqual({ ok: false, reason: "Ihr Abo läuft noch nicht." });

    st.sub = { id: "sub_2", status: "past_due", schedule: null, default_payment_method: "pm", items: { data: [software()] } };
    const pastDue = await customer();
    expect(await canSelfBookBestand(pastDue.c.id)).toEqual({ ok: false, reason: "Es ist noch eine Rechnung offen." });

    st.sub = { id: "sub_3", status: "active", schedule: null, default_payment_method: null, items: { data: [software()] } };
    const noPm = await customer();
    expect(await canSelfBookBestand(noPm.c.id)).toEqual({ ok: false, reason: "Für Ihr Konto ist keine Zahlungsart hinterlegt." });
    st.customerPm = "pm_card";
    expect(await canSelfBookBestand(noPm.c.id)).toEqual({ ok: true });

    expect(st.calls.filter((x) => x.method === "subscriptionItems.create")).toHaveLength(0);
    for (const x of [service, overdue, noStripe, noSub, pastDue]) {
      const a = await prisma.customer.findUniqueOrThrow({ where: { id: x.c.id } });
      expect(a.existingCustomersEnabled).toBe(false);
    }
  });

  it("Kündigen: Position ohne Gutschrift entfernt, Zugang bis Periodenende, dann aus; Zurücknehmen ohne Doppelberechnung", async () => {
    const { c, owner } = await customer();
    await selfBookBestand(c.id, { id: owner.id, role: "kunde" });
    st.calls = [];

    const res = await selfCancelBestand(c.id, { id: owner.id, role: "kunde" });
    expect(res).toMatchObject({ ok: true });
    expect((res as { until: Date }).until.getTime()).toBe(PERIOD_END * 1000);
    const del = st.calls.find((x) => x.method === "subscriptionItems.del")!;
    expect(del.args[1]).toEqual({ proration_behavior: "none" });
    let a = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(a.existingCustomersEnabled).toBe(true);
    expect(a.bestandCancelAt?.getTime()).toBe(PERIOD_END * 1000);

    // Zurücknehmen: Position wieder an, ohne anteilige Berechnung (Zeitraum ist bezahlt)
    expect(await canSelfBookBestand(c.id)).toEqual({ ok: true });
    expect(await selfBookBestand(c.id, { id: owner.id, role: "kunde" })).toEqual({ ok: true });
    const re = st.calls.find((x) => x.method === "subscriptionItems.create")!.args[0] as { proration_behavior: string };
    expect(re.proration_behavior).toBe("none");
    a = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(a.bestandCancelAt).toBeNull();

    // Erneut kündigen, Periodenende vorbei → Cron schaltet ab
    await selfCancelBestand(c.id, { id: owner.id, role: "kunde" });
    expect(await expireBestandCancellations(new Date(PERIOD_END * 1000 - 1000))).toBe(0);
    expect(await expireBestandCancellations(new Date(PERIOD_END * 1000 + 1000))).toBeGreaterThanOrEqual(1);
    a = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(a.existingCustomersEnabled).toBe(false);
    expect(a.bestandMonthly).toBeNull();
    expect(a.bestandCancelAt).toBeNull();
    const modes = (await prisma.auditLog.findMany({ where: { customerId: c.id, action: "billing.bestand" } })).map((l) => (l.details as { mode: string }).mode).sort();
    expect(modes).toEqual(["book", "book", "cancel_at_period_end", "cancel_at_period_end", "expired"]);
  });

  it("Server-Aktion: nur Inhaber, nur mit Bestätigung, nicht in der Admin-Vorschau", async () => {
    const { c, owner } = await customer();
    const advisor = await makeBuyer(c.id, "advisor");
    const confirmed = () => {
      const fd = new FormData();
      fd.set("confirm", "on");
      return fd;
    };
    ctxState.ctx = { customerId: c.id, email: "berater@example.de", preview: false, userId: advisor.id, teamRole: "advisor" };
    expect(await bookBestandModuleAction({}, confirmed())).toEqual({ error: "Bitte den Inhaber fragen – nur er kann Module buchen." });
    expect(await cancelBestandModuleAction({}, confirmed())).toEqual({ error: "Bitte den Inhaber fragen – nur er kann Module kündigen." });
    ctxState.ctx = { customerId: c.id, email: "admin@example.de", preview: true, userId: null, teamRole: "owner" };
    expect(await bookBestandModuleAction({}, confirmed())).toEqual({ error: "In der Vorschau nicht möglich." });
    ctxState.ctx = { customerId: c.id, email: "inhaber@example.de", preview: false, userId: owner.id, teamRole: "owner" };
    expect(await bookBestandModuleAction({}, new FormData())).toEqual({ error: "Bitte bestätigen Sie die kostenpflichtige Buchung." });
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).existingCustomersEnabled).toBe(false);
    expect(await bookBestandModuleAction({}, confirmed())).toEqual({ ok: true });
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).existingCustomersEnabled).toBe(true);
    const cancelled = await cancelBestandModuleAction({}, confirmed());
    expect(cancelled).toMatchObject({ ok: true, until: new Date(PERIOD_END * 1000).toISOString() });
    ctxState.ctx = null;
  });

  it("Kündigen ohne gebuchtes Modul (z. B. Bestandsschutz) geht nicht", async () => {
    const { c, owner } = await customer({ existingCustomersEnabled: true, bestandGrandfathered: true });
    expect(await selfCancelBestand(c.id, { id: owner.id, role: "kunde" })).toEqual({ ok: false, error: "Das Modul ist nicht gebucht – bitte bei uns melden." });
  });
});
