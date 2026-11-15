// Halteangebote beim Kündigen (Ole, 15.11.2026): Annahme je Angebot mit Wirkung in der Datenbank (RetentionOffer,
// Bindung, Pause, Aufgaben, Änderungsprotokoll), Stripe gemockt (Gutschein am Abo, nur Betreuung, pause_collection),
// Regeln (Kundendauer, einmal in 12 Monaten), Kündigung trotz Angebot, Rückkehrangebot nach Vertragsende.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Item = { id: string; quantity: number; price: { product: string; unit_amount: number; recurring: { interval: string } } };
type Sub = { id: string; status: string; schedule: null; discounts: string[]; cancel_at: number | null; cancel_at_period_end: boolean; items: { data: Item[] } };
const st = vi.hoisted(() => ({
  subs: new Map<string, Sub>(),
  coupons: new Map<string, Record<string, unknown>>(),
  calls: [] as { method: string; args: unknown[] }[],
}));
const sent = vi.hoisted(() => ({
  mails: [] as { to: string | string[]; subject: string; paragraphs: string[] }[],
  pushes: [] as { title: string; body?: string }[],
}));

vi.mock("stripe", () => {
  class FakeStripe {
    products = {
      search: async () => ({ data: [] }),
      create: async (p: { metadata: { pg_key: string } }) => ({ id: `prod_${p.metadata.pg_key}` }),
    };
    tax = { registrations: { list: async () => ({ data: [{ id: "taxreg_1" }] }) } };
    coupons = {
      retrieve: async (id: string) => {
        const c = st.coupons.get(id);
        if (!c) throw Object.assign(new Error("No such coupon"), { code: "resource_missing" });
        return c;
      },
      create: async (p: Record<string, unknown>) => {
        st.calls.push({ method: "coupons.create", args: [p] });
        st.coupons.set(String(p.id), p);
        return p;
      },
    };
    subscriptions = {
      list: async (p: { customer: string }) => ({ data: st.subs.has(p.customer) ? [st.subs.get(p.customer)!] : [] }),
      update: async (id: string, p: Record<string, unknown>, opts?: unknown) => {
        st.calls.push({ method: "subscriptions.update", args: [id, p, opts] });
        const sub = [...st.subs.values()].find((s) => s.id === id);
        if (sub && Array.isArray(p.discounts)) sub.discounts = (p.discounts as { coupon?: string; discount?: string }[]).map((d) => d.discount ?? `di_${d.coupon}`);
        if (sub && typeof p.cancel_at === "number") sub.cancel_at = p.cancel_at;
        return sub;
      },
    };
    subscriptionSchedules = { list: async () => ({ data: [] }) };
  }
  return { default: FakeStripe };
});
vi.mock("@/lib/push", () => ({
  sendToAdmins: vi.fn(async (p: { title: string; body?: string }) => {
    sent.pushes.push(p);
    return { sent: 0, removed: 0, errors: [] };
  }),
}));
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendCustomerMail: vi.fn(async (o: (typeof sent.mails)[number]) => {
    sent.mails.push(o);
    return { ok: true };
  }),
}));
vi.mock("@/lib/help-call", () => ({
  helpCallSlots: vi.fn(async () => []),
  bookHelpCall: vi.fn(async (_c: string, startIso: string) => ({ ok: true, start: new Date(startIso), url: "https://meet.test/x" })),
}));

import { prisma } from "@/lib/prisma";
import { recordChurnIntent } from "@/lib/anti-churn-server";
import { acceptHalteOffer, churnOfferViews, saveHalteSettings } from "@/lib/halteangebote-server";
import { commitEndIso, HALTE_DEFAULTS } from "@/lib/halteangebote";
import { berlinTodayIso } from "@/lib/offer-pricing";
import { cancelContract, contractCancelInfo } from "@/lib/vertrag-kuendigung";
import { reactivateCustomer, sendWinbackOffers } from "@/lib/ruhend";
import { bookHelpCall } from "@/lib/help-call";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const DAY = 86_400_000;
const customers: string[] = [];
const contacts: string[] = [];
const offers: string[] = [];

/** Kunde mit Vertrag (Start vor `ageDays` Tagen), Angebot, Kontakt, Inhaber und laufendem Stripe-Abo (Software + Betreuung). */
async function setup(o: { ageDays?: number; serviceItem?: boolean; interval?: string } = {}) {
  const n = uid();
  const start = new Date(Date.now() - (o.ageDays ?? 200) * DAY);
  const c = await makeCustomer({ retainerStart: start, retainerMonthly: 1000, stripeCustomerId: `cus_h_${n}`, billingInterval: o.interval ?? "month", isTest: false });
  customers.push(c.id);
  const contact = await prisma.salesContact.create({ data: { name: "Halte Test", email: `halte-${n}@example.test`, customerId: c.id } });
  contacts.push(contact.id);
  const owner = await makeBuyer(c.id, "owner");
  const offer = await prisma.offer.create({
    data: { number: `HA-${n}`, token: `ha-${n}`, contactName: "Halte Test", term: "none", products: [], status: "accepted", setupFee: 990, monthlyFee: 1000, softwareFee: 349, validUntil: new Date("2027-12-31") },
  });
  offers.push(offer.id);
  await prisma.onboarding.create({ data: { customerId: c.id, offerId: offer.id, salesContactId: contact.id } });
  const items: Item[] = [{ id: `si_sw_${n}`, quantity: 1, price: { product: "prod_software", unit_amount: 34900, recurring: { interval: o.interval ?? "month" } } }];
  if (o.serviceItem !== false) items.push({ id: `si_sv_${n}`, quantity: 1, price: { product: "prod_service", unit_amount: 65100, recurring: { interval: o.interval ?? "month" } } });
  st.subs.set(`cus_h_${n}`, { id: `sub_${n}`, status: "active", schedule: null, discounts: [], cancel_at: null, cancel_at_period_end: false, items: { data: items } });
  const actor = { id: owner.id, email: owner.email, role: "BUYER" };
  return { customerId: c.id, contactId: contact.id, owner, actor, startIso: berlinTodayIso(start), sub: st.subs.get(`cus_h_${n}`)! };
}

const tasksOf = (contactId: string) => prisma.salesTask.findMany({ where: { contactId }, orderBy: { createdAt: "asc" } });

describe("Halteangebote", () => {
  beforeAll(async () => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_halte";
    process.env.APP_URL = process.env.APP_URL || "https://app.test";
    await saveHalteSettings({ ...HALTE_DEFAULTS });
  });
  beforeEach(() => {
    sent.mails = [];
    sent.pushes = [];
    st.calls = [];
  });
  afterAll(async () => {
    await prisma.salesTask.deleteMany({ where: { contactId: { in: contacts } } });
    for (const id of customers) await cleanupCustomer(id);
    await prisma.salesContact.deleteMany({ where: { id: { in: contacts } } });
    await prisma.offer.deleteMany({ where: { id: { in: offers } } });
  });

  it("zu teuer: Nachlass mit Bindung, Stripe-Gutschein, E-Mail, Aufgabe, Push, Protokoll; danach Kündigung erst zum Ende der Bindung", async () => {
    const x = await setup();
    const intent = await recordChurnIntent(x.customerId, { reason: "zu_teuer", note: null, actor: x.actor });
    const views = await churnOfferViews(x.customerId, "zu_teuer");
    expect(views.offers.map((o) => o.key)).toEqual(["rabatt", "budget", "pause"]);
    const commitIso = commitEndIso({ startIso: x.startIso, todayIso: berlinTodayIso(), months: 2, commitMonths: 3 });
    expect(views.offers[0].confirm).toContain(commitIso.split("-").reverse().join("."));

    expect(await acceptHalteOffer(x.customerId, { intentId: intent.id, kind: "rabatt" }, x.actor)).toMatchObject({ ok: false });
    const res = await acceptHalteOffer(x.customerId, { intentId: intent.id, kind: "rabatt", confirmed: true }, x.actor);
    expect(res).toMatchObject({ ok: true });

    const row = await prisma.retentionOffer.findFirstOrThrow({ where: { customerId: x.customerId } });
    expect(row).toMatchObject({ kind: "rabatt", reason: "zu_teuer", discount: true, stripeStatus: "applied", stripeCouponId: "pg-halten-abo-50-2m", percentOff: 50, months: 2 });
    expect(Number(row.mrrSaved)).toBe(1000);
    expect(st.calls.find((c) => c.method === "coupons.create")?.args[0]).toMatchObject({ percent_off: 50, duration: "repeating", duration_in_months: 2 });
    expect(x.sub.discounts).toEqual(["di_pg-halten-abo-50-2m"]);
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: x.customerId } });
    expect(berlinTodayIso(new Date(c.retentionCommitUntil!.getTime() - 1))).toBe(commitIso);

    const mail = sent.mails.find((m) => m.subject.startsWith("Bestätigung: 50 % Nachlass"))!;
    expect([mail.to].flat()).toContain(x.owner.email);
    expect(mail.paragraphs.join(" ")).toContain(`mindestens bis zum ${commitIso.split("-").reverse().join(".")}`);
    expect(sent.pushes.some((p) => p.title.startsWith("Halteangebot angenommen"))).toBe(true);
    expect((await tasksOf(x.contactId)).some((t) => t.title.includes("50 % Nachlass für 2 Monate") && !t.title.includes("von Hand"))).toBe(true);
    expect(await prisma.auditLog.count({ where: { customerId: x.customerId, action: "contract.retention_offer" } })).toBe(1);
    expect(await prisma.churnIntent.findUniqueOrThrow({ where: { id: intent.id } })).toMatchObject({ offer: "rabatt", outcome: "alternative" });

    // Doppelklick: nichts doppelt
    expect(await acceptHalteOffer(x.customerId, { intentId: intent.id, kind: "rabatt", confirmed: true }, x.actor)).toMatchObject({ ok: true, already: true });
    expect(await prisma.retentionOffer.count({ where: { customerId: x.customerId } })).toBe(1);

    // Höchstens einmal in 12 Monaten: kein zweiter Nachlass, keine Pause ohne Kosten
    const again = await recordChurnIntent(x.customerId, { reason: "zu_teuer", note: null, actor: x.actor });
    expect((await churnOfferViews(x.customerId, "zu_teuer")).offers.map((o) => o.key)).not.toContain("rabatt");
    expect(await acceptHalteOffer(x.customerId, { intentId: again.id, kind: "rabatt", confirmed: true }, x.actor)).toMatchObject({ ok: false });
    expect((await churnOfferViews(x.customerId, "keine_zeit")).offers.map((o) => o.key)).toEqual(["pause", "rueckruf"]);

    // Kündigung trotz Angebot: wirkt zum Ende der Bindung, Angebot als „später gekündigt“ markiert
    const info = await contractCancelInfo(x.customerId);
    expect(info?.next).toMatchObject({ effectiveIso: commitIso, reason: "halteangebot" });
    const cancel = await cancelContract(x.customerId, { actor: x.actor, reason: "doch zu teuer" });
    expect(cancel).toMatchObject({ ok: true, effectiveIso: commitIso });
    expect((await prisma.retentionOffer.findFirstOrThrow({ where: { customerId: x.customerId } })).cancelledLaterAt).not.toBeNull();
  });

  it("Rabatte erst ab 3 Monaten Kundendauer und nicht bei jährlicher Vorauszahlung", async () => {
    const young = await setup({ ageDays: 40 });
    const i = await recordChurnIntent(young.customerId, { reason: "zu_teuer", note: null, actor: young.actor });
    expect((await churnOfferViews(young.customerId, "zu_teuer")).offers.map((o) => o.key)).toEqual(["budget", "pause"]);
    expect(await acceptHalteOffer(young.customerId, { intentId: i.id, kind: "rabatt", confirmed: true }, young.actor)).toEqual({ ok: false, error: "Dieses Angebot ist gerade nicht verfügbar." });
    // Neustart ohne kostenlosen Betreuungsmonat
    const views = await churnOfferViews(young.customerId, "zu_wenig_leads");
    expect(views.offers[0].key).toBe("neustart");
    expect(views.offers[0].text).not.toContain("kostenlos");
    const annual = await setup({ interval: "year" });
    expect((await churnOfferViews(annual.customerId, "zu_teuer")).offers.map((o) => o.key)).not.toContain("rabatt");
    expect(await prisma.retentionOffer.count({ where: { customerId: { in: [young.customerId, annual.customerId] } } })).toBe(0);
  });

  it("zu wenige Leads: Neustart als Aufgabe, ein Monat Betreuung kostenlos nur auf die Betreuungs-Position", async () => {
    const x = await setup();
    const intent = await recordChurnIntent(x.customerId, { reason: "zu_wenig_leads", note: "kaum Anfragen", actor: x.actor });
    const res = await acceptHalteOffer(x.customerId, { intentId: intent.id, kind: "neustart" }, x.actor);
    expect(res).toMatchObject({ ok: true });
    expect(st.calls.find((c) => c.method === "coupons.create")?.args[0]).toMatchObject({ id: "pg-halten-betreuung-100-1m", percent_off: 100, duration_in_months: 1, applies_to: { products: ["prod_service"] } });
    expect(x.sub.discounts).toEqual(["di_pg-halten-betreuung-100-1m"]);
    const row = await prisma.retentionOffer.findFirstOrThrow({ where: { customerId: x.customerId } });
    expect(row).toMatchObject({ kind: "neustart", discount: true, stripeStatus: "applied", percentOff: 100, months: 1 });
    const tasks = await tasksOf(x.contactId);
    expect(tasks.some((t) => t.title.includes("Kampagne neu starten") && t.note?.includes("kaum Anfragen"))).toBe(true);
    expect(tasks.some((t) => t.title.includes("Gutschrift von Hand"))).toBe(false);

    // Ohne Betreuungs-Position im Abo: Gutschrift von Hand als Aufgabe
    const y = await setup({ serviceItem: false });
    const i2 = await recordChurnIntent(y.customerId, { reason: "zu_wenig_leads", note: null, actor: y.actor });
    await acceptHalteOffer(y.customerId, { intentId: i2.id, kind: "neustart" }, y.actor);
    expect((await prisma.retentionOffer.findFirstOrThrow({ where: { customerId: y.customerId } })).stripeStatus).toBe("manual");
    expect((await tasksOf(y.contactId)).some((t) => t.title.includes("Betreuung kostenlos (Gutschrift von Hand)"))).toBe(true);
  });

  it("Leads passen nicht: Neuausrichtung mit Wunsch, Gutschrift-Prüfung listet Leads mit falschen Daten (30 Tage), keine Geldbewegung", async () => {
    const x = await setup();
    const now = Date.now();
    await prisma.lead.createMany({
      data: [
        { customerId: x.customerId, name: "Falsch Neu", source: "Katze", status: "Disqualifiziert", lostReason: "falsche_daten", createdAt: new Date(now - 5 * DAY) },
        { customerId: x.customerId, name: "Reklamiert", source: "Katze", status: "Neu", stornoState: "requested", stornoReason: "Nummer existiert nicht", createdAt: new Date(now - 10 * DAY) },
        { customerId: x.customerId, name: "Falsch Alt", source: "Katze", status: "Disqualifiziert", lostReason: "falsche_daten", createdAt: new Date(now - 40 * DAY) },
        { customerId: x.customerId, name: "Gut", source: "Katze", status: "Abschluss", createdAt: new Date(now - 3 * DAY) },
      ],
    });
    const intent = await recordChurnIntent(x.customerId, { reason: "leads_passen_nicht", note: null, actor: x.actor });
    const res = await acceptHalteOffer(x.customerId, { intentId: intent.id, kind: "neuausrichtung", note: "lieber Hunde, Region Hamburg" }, x.actor);
    expect(res).toMatchObject({ ok: true });
    const tasks = await tasksOf(x.contactId);
    expect(tasks.find((t) => t.title.includes("neu ausrichten"))?.note).toContain("lieber Hunde, Region Hamburg");
    const credit = tasks.find((t) => t.title.includes("Gutschrift prüfen"))!;
    expect(credit.title).toContain("2 Leads");
    expect(credit.note).toContain("Falsch Neu");
    expect(credit.note).toContain("Reklamation requested");
    expect(credit.note).not.toContain("Falsch Alt");
    expect(credit.note).not.toContain("Gut ·");
    expect(await prisma.retentionOffer.findFirstOrThrow({ where: { customerId: x.customerId } })).toMatchObject({ discount: true, stripeStatus: "manual" });
    expect(st.calls).toHaveLength(0);
  });

  it("zu wenige Abschlüsse: Vorschlag aus der besten Abschlussquote aller Kunden, Umstellung als Aufgabe", async () => {
    const x = await setup();
    const other = await setup();
    const good = `HalteGut${uid()}`;
    const own = `HalteEigen${uid()}`;
    const now = Date.now();
    await prisma.lead.createMany({
      data: [
        ...Array.from({ length: 40 }, (_, i) => ({ customerId: other.customerId, source: good, status: i < 30 ? "Abschluss" : "Neu", createdAt: new Date(now - (i + 1) * DAY) })),
        ...Array.from({ length: 40 }, (_, i) => ({ customerId: x.customerId, source: own, status: i < 1 ? "Abschluss" : "Neu", createdAt: new Date(now - (i + 1) * DAY) })),
      ],
    });
    const views = await churnOfferViews(x.customerId, "zu_wenig_abschluesse");
    expect(views.offers.map((o) => o.key)).toEqual(["produktwechsel", "rueckruf"]);
    expect(views.offers[0].text).toContain(good);
    const intent = await recordChurnIntent(x.customerId, { reason: "zu_wenig_abschluesse", note: null, actor: x.actor });
    expect(await acceptHalteOffer(x.customerId, { intentId: intent.id, kind: "produktwechsel" }, x.actor)).toMatchObject({ ok: true });
    const row = await prisma.retentionOffer.findFirstOrThrow({ where: { customerId: x.customerId } });
    expect(row).toMatchObject({ kind: "produktwechsel", discount: false, stripeStatus: "none" });
    expect((row.details as { suggestion: { key: string } }).suggestion.key).toBe(good);
    expect((await tasksOf(x.contactId)).some((t) => t.title.includes(`Sparte wechseln auf ${good}`) && t.note?.includes("ohne neue Einrichtungsgebühr"))).toBe(true);
    expect(st.calls).toHaveLength(0);
  });

  it("keine Zeit: Pause ohne Kosten (höchstens 3 Monate), ganze Abrechnung ruht", async () => {
    const x = await setup();
    const intent = await recordChurnIntent(x.customerId, { reason: "keine_zeit", note: null, actor: x.actor });
    const view = (await churnOfferViews(x.customerId, "keine_zeit")).offers[0];
    expect(view).toMatchObject({ key: "pause_gratis", form: "pause" });
    const today = berlinTodayIso();
    expect(await acceptHalteOffer(x.customerId, { intentId: intent.id, kind: "pause_gratis", from: today, until: "2099-01-01" }, x.actor)).toMatchObject({ ok: false });
    const res = await acceptHalteOffer(x.customerId, { intentId: intent.id, kind: "pause_gratis", from: today, until: view.pauseMaxUntil }, x.actor);
    expect(res).toMatchObject({ ok: true });
    const pause = await prisma.customerPause.findFirstOrThrow({ where: { customerId: x.customerId } });
    expect(pause).toMatchObject({ free: true, status: "active" });
    expect(st.calls.find((c) => c.method === "subscriptions.update")?.args[1]).toEqual({ pause_collection: { behavior: "void" } });
    expect(JSON.parse(pause.billingNote!)).toMatchObject({ method: "pause_collection" });
    expect(await prisma.retentionOffer.findFirstOrThrow({ where: { customerId: x.customerId } })).toMatchObject({ kind: "pause_gratis", discount: true });
  });

  it("App passt nicht: 30 Minuten Einrichtung gebucht bzw. ohne freien Termin als Rückruf-Aufgabe", async () => {
    const x = await setup();
    const view = (await churnOfferViews(x.customerId, "app_passt_nicht")).offers[0];
    expect(view).toMatchObject({ key: "einrichtung", form: "simple" }); // keine freien Termine (gemockt)
    const intent = await recordChurnIntent(x.customerId, { reason: "app_passt_nicht", note: null, actor: x.actor });
    const start = new Date(Date.now() + 3 * DAY).toISOString();
    expect(await acceptHalteOffer(x.customerId, { intentId: intent.id, kind: "einrichtung", start }, x.actor)).toMatchObject({ ok: true });
    expect(vi.mocked(bookHelpCall).mock.calls.at(-1)?.[3]).toMatchObject({ minutes: 30 });
    const y = await setup();
    const i2 = await recordChurnIntent(y.customerId, { reason: "app_passt_nicht", note: null, actor: y.actor });
    expect(await acceptHalteOffer(y.customerId, { intentId: i2.id, kind: "einrichtung" }, y.actor)).toMatchObject({ ok: true, message: "Danke! Wir melden uns innerhalb eines Werktags für einen Termin." });
    expect((await tasksOf(y.contactId)).find((t) => t.title.includes("Termin zum Einrichten vereinbaren"))?.type).toBe("ANRUF");
  });

  it("höre auf: Paket „Nur Bestand“ als Aufgabe „Stripe umstellen“, geretteter Monatsbetrag = Paketpreis", async () => {
    const x = await setup();
    const view = (await churnOfferViews(x.customerId, "aufhoeren")).offers[0];
    expect(view.key).toBe("nur_bestand");
    const intent = await recordChurnIntent(x.customerId, { reason: "aufhoeren", note: null, actor: x.actor });
    expect(await acceptHalteOffer(x.customerId, { intentId: intent.id, kind: "nur_bestand" }, x.actor)).toMatchObject({ ok: true });
    const row = await prisma.retentionOffer.findFirstOrThrow({ where: { customerId: x.customerId } });
    expect(row).toMatchObject({ kind: "nur_bestand", stripeStatus: "manual", discount: false });
    expect(Number(row.mrrSaved)).toBe(149);
    expect(view.text).toContain("Empfehlungen & Bewertungen");
    expect((await tasksOf(x.contactId)).some((t) => t.title.includes("Nur Bestand") && t.title.includes("Stripe umstellen"))).toBe(true);
    expect(st.calls).toHaveLength(0);
  });

  it("Rückkehrangebot 30 Tage nach Vertragsende: einmal je Kunde, Reaktivierung ohne Einrichtungsgebühr", async () => {
    const x = await setup();
    const now = new Date();
    await prisma.customer.update({
      where: { id: x.customerId },
      data: { cancelRequestedAt: new Date(now.getTime() - 60 * DAY), cancelEffectiveAt: new Date(now.getTime() - 31 * DAY), dormantSince: new Date(now.getTime() - 30 * DAY), archived: true, retentionChoice: "24m", deleteAfter: new Date(now.getTime() + 600 * DAY) },
    });
    expect(await sendWinbackOffers(now, [], { only: [x.customerId] })).toBe(1);
    const mail = sent.mails.find((m) => m.subject === "Ihr Rückkehrangebot: ohne neue Einrichtungsgebühr")!;
    expect([mail.to].flat()).toContain(x.owner.email);
    expect(await sendWinbackOffers(new Date(now.getTime() + DAY), [], { only: [x.customerId] })).toBe(0);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: x.customerId } })).winbackOfferAt).not.toBeNull();

    expect(await reactivateCustomer(x.customerId, { actor: x.actor })).toMatchObject({ ok: true, already: false });
    expect((await tasksOf(x.contactId)).find((t) => t.title.startsWith("Reaktivierung"))?.note).toContain("keine neue Einrichtungsgebühr");
    const ev = await prisma.customerLifecycleEvent.findFirstOrThrow({ where: { customerId: x.customerId, kind: "reactivated" } });
    expect((ev.details as { winback?: boolean }).winback).toBe(true);
  });
});
