// Modul „Empfehlungen & Bewertungen“: Selbstbuchung mit Testphase (Stripe gemockt),
// Nachfrage nach dem Abschluss (alle bekommen dieselbe Nachricht mit Google-Link – kein
// Gating), Kritik → Aufgabe + keine Empfehlungsanfrage, Empfehlungsseite → Lead,
// Dank an Empfehlende, Modul aus = nichts passiert.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Item = { id: string; quantity: number; current_period_end?: number; price: { product: string; unit_amount: number; recurring: { interval: string } } };
const state = vi.hoisted(() => ({
  sub: null as null | { id: string; status: string; schedule: null; items: { data: Item[] } },
  stripe: [] as { method: string; args: unknown[] }[],
  notices: [] as { customerId: string; to: string; purpose: string; params: string[]; text: string }[],
  messages: [] as { customerId: string; to: string; body: string }[],
  pushes: [] as { title: string }[],
}));

vi.mock("stripe", () => {
  const s = state;
  class FakeStripe {
    products = {
      search: async () => ({ data: [] }),
      create: async (p: { metadata: { pg_key: string } }) => ({ id: `prod_${p.metadata.pg_key}` }),
    };
    tax = { registrations: { list: async () => ({ data: [{ id: "taxreg_1" }] }) } };
    subscriptions = { list: async () => ({ data: s.sub ? [s.sub] : [] }) };
    subscriptionItems = {
      create: async (p: { price_data: { product: string; unit_amount: number; recurring: { interval: string } }; quantity: number }) => {
        s.stripe.push({ method: "create", args: [p] });
        s.sub?.items.data.push({ id: `si_${s.stripe.length}`, quantity: p.quantity, price: { product: p.price_data.product, unit_amount: p.price_data.unit_amount, recurring: p.price_data.recurring } });
        return {};
      },
      update: async (...args: unknown[]) => {
        s.stripe.push({ method: "update", args });
        return {};
      },
      del: async (id: string, opts: unknown) => {
        s.stripe.push({ method: "del", args: [id, opts] });
        if (s.sub) s.sub.items.data = s.sub.items.data.filter((i) => i.id !== id);
        return {};
      },
    };
  }
  return { default: FakeStripe };
});

vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return {
    ...real,
    sendWhatsAppNotice: async (o: { customerId: string; to: string; purpose: string; params: string[]; text: string }) => {
      state.notices.push(o);
      return { mode: "template" as const, conversationId: `conv_${state.notices.length}` };
    },
  };
});
vi.mock("@/lib/whatsapp/gateway", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/gateway")>();
  return {
    ...real,
    sendWhatsAppMessage: async (o: { customerId: string; to: string; body: string }) => {
      state.messages.push(o);
      return { messageId: "wamid.test" };
    },
  };
});
vi.mock("@/lib/push", () => {
  const rec = async (...args: unknown[]) => {
    const payload = args[args.length - 1] as { title: string };
    state.pushes.push({ title: payload?.title ?? "" });
    return { sent: 0, removed: 0, errors: [] };
  };
  return { sendToAdmins: rec, sendToBuyersOfCustomer: rec, sendToUser: rec };
});
vi.mock("@/lib/lead-intake", async (orig) => ({ ...(await orig<typeof import("@/lib/lead-intake")>()), processNewLead: async () => {} }));

import { prisma } from "@/lib/prisma";
import { PRICE_LIST } from "@/lib/offer-pricing";
import { bookEmpfehlung, cancelEmpfehlung, processEmpfehlungBilling } from "@/lib/empfehlung/module";
import {
  googleLinkFor,
  googleRedirect,
  handleReviewReply,
  loadEmpfehlungStats,
  scheduleReviewRequests,
  sendDueReferrals,
  sendDueReviews,
  sendReferralThanks,
  setReviewOptOut,
  submitReferral,
  countReferralVisit,
  generalLinkOf,
  loadReferralPage,
  openRewards,
  planReferralRewards,
  sendReferralLinkNow,
  sendReferralUpdates,
  settleReward,
  claimPersonalLink,
  handleReferralInbound,
  sendAfterAppointmentReferrals,
} from "@/lib/empfehlung/requests";
import { DAY_MS, UNHAPPY_TASK, isFollowUpTask, isRewardTask, refCodeOf } from "@/lib/empfehlung/shared";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const NUM = () => `4915${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
// Dienstag, 17.11.2026, 11:00 Uhr Berlin (Versandfenster Mo–Sa 9–19 Uhr)
const NOW = new Date("2026-11-17T10:00:00Z");
const GOOGLE = "https://g.page/r/test-agentur/review";
const periodEnd = Math.floor(new Date("2026-12-01T00:00:00Z").getTime() / 1000);

describe("Empfehlungen & Bewertungen", () => {
  const customers: string[] = [];

  beforeAll(() => {
    requireTestDb();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock";
    delete process.env.ANTHROPIC_API_KEY; // Einordnung der Antworten über die Regeln (deterministisch)
  });
  afterAll(async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const names = (await prisma.customer.findMany({ where: { id: { in: customers } }, select: { name: true } })).map((c) => c.name);
    for (const n of names) await prisma.salesTask.deleteMany({ where: { title: { contains: n } } });
    for (const id of customers) await cleanupCustomer(id);
  });
  beforeEach(async () => {
    // Jeder Test für sich: Module der vorherigen Testkunden aus (Cron-Funktionen laufen über alle Kunden)
    if (customers.length) {
      await prisma.customer.updateMany({ where: { id: { in: customers } }, data: { empfehlungEnabled: false, empfehlungCancelAt: null, empfehlungTrialEndsAt: null, empfehlungMonthly: null } });
    }
    state.stripe = [];
    state.notices = [];
    state.messages = [];
    state.pushes = [];
    state.sub = {
      id: "sub_1",
      status: "active",
      schedule: null,
      items: { data: [{ id: "si_sw", quantity: 1, current_period_end: periodEnd, price: { product: "prod_software", unit_amount: 34900, recurring: { interval: "month" } } }] },
    };
  });

  async function customer(extra: Record<string, unknown> = {}) {
    const c = await makeCustomer({ plan: "software", stripeCustomerId: `cus_e_${uid()}`, ...extra });
    customers.push(c.id);
    await makeBuyer(c.id, "owner");
    return c.id;
  }
  async function closedLead(customerId: string, phone: string, name: string, daysAgo = 8) {
    return prisma.lead.create({
      data: { customerId, name, phone, status: "Abschluss", source: "Katzenversicherung (TKV)", closedAt: new Date(NOW.getTime() - daysAgo * DAY_MS) },
    });
  }
  async function activeModule(extra: Record<string, unknown> = {}) {
    const id = await customer({ empfehlungEnabled: true, empfehlungMonthly: 59, empfehlungSince: new Date(NOW.getTime() - 30 * DAY_MS), ...extra });
    await prisma.reviewSettings.create({ data: { customerId: id, googleReviewUrl: GOOGLE } });
    return id;
  }

  // ─── Buchen, Testphase, Kündigen ───

  it("erste Buchung: 30 Tage Testphase ohne Stripe-Position, idempotent, Ole informiert", async () => {
    const id = await customer();
    const r = await bookEmpfehlung(id, { acknowledged: true, now: NOW });
    expect(r).toMatchObject({ ok: true, state: "trial" });
    const c = await prisma.customer.findUniqueOrThrow({ where: { id } });
    expect(c.empfehlungEnabled).toBe(true);
    expect(c.empfehlungMonthly).toBeNull();
    expect(c.empfehlungTrialEndsAt?.getTime()).toBe(NOW.getTime() + PRICE_LIST.empfehlungTrialDays * DAY_MS);
    expect(state.stripe).toHaveLength(0);
    expect(await bookEmpfehlung(id, { acknowledged: true, now: NOW })).toMatchObject({ ok: true, state: "trial" });
    expect(await prisma.auditLog.count({ where: { action: "empfehlung.book", customerId: id } })).toBe(1);
    expect(await prisma.salesTask.count({ where: { title: { contains: c.name } } })).toBe(1);
    expect(state.pushes.some((p) => p.title.includes("Testphase"))).toBe(true);
  });

  it("ohne Bestätigung oder im Paket ohne Software: keine Buchung", async () => {
    const id = await customer();
    expect(await bookEmpfehlung(id, { acknowledged: false, now: NOW })).toMatchObject({ ok: false });
    const service = await customer({ plan: "service" });
    expect(await bookEmpfehlung(service, { acknowledged: true, now: NOW })).toMatchObject({ ok: false });
  });

  it("Erinnerung 3 Tage vor Ende (einmal), danach automatisch kostenpflichtig (anteilig, einmal)", async () => {
    const id = await customer();
    await bookEmpfehlung(id, { acknowledged: true, now: NOW });
    const end = NOW.getTime() + PRICE_LIST.empfehlungTrialDays * DAY_MS;
    expect((await processEmpfehlungBilling(new Date(end - 2 * DAY_MS))).reminded).toBeGreaterThanOrEqual(1);
    const before = state.pushes.length;
    await processEmpfehlungBilling(new Date(end - DAY_MS));
    expect(state.pushes.filter((p, i) => i >= before && p.title.includes("Testphase"))).toHaveLength(0);

    const after = new Date(end + 3600_000);
    await processEmpfehlungBilling(after);
    const creates = state.stripe.filter((c) => c.method === "create");
    expect(creates).toHaveLength(1);
    const p = creates[0].args[0] as { proration_behavior: string; price_data: { unit_amount: number; product: string } };
    expect(p.proration_behavior).toBe("create_prorations");
    expect(p.price_data.unit_amount).toBe(PRICE_LIST.empfehlungModuleMonthly * 100);
    expect(p.price_data.product).toBe("prod_empfehlung");
    expect(Number((await prisma.customer.findUniqueOrThrow({ where: { id } })).empfehlungMonthly)).toBe(PRICE_LIST.empfehlungModuleMonthly);
    await processEmpfehlungBilling(new Date(after.getTime() + 3600_000));
    expect(state.stripe.filter((c) => c.method === "create")).toHaveLength(1);
  });

  it("ohne laufendes Abo: Modul bleibt frei, Ole bekommt „Preis anpassen“", async () => {
    const id = await customer();
    await bookEmpfehlung(id, { acknowledged: true, now: NOW });
    state.sub = null;
    await processEmpfehlungBilling(new Date(NOW.getTime() + 31 * DAY_MS));
    const c = await prisma.customer.findUniqueOrThrow({ where: { id } });
    expect(c.empfehlungEnabled).toBe(true);
    expect(await prisma.salesTask.count({ where: { title: { startsWith: `Preis anpassen ${c.name}` } } })).toBe(1);
  });

  it("Kündigung in der Testphase: endet mit der Testphase ohne Kosten; zweite Buchung ohne Testphase", async () => {
    const id = await customer();
    await bookEmpfehlung(id, { acknowledged: true, now: NOW });
    const r = await cancelEmpfehlung(id, { now: NOW });
    expect(r.ok).toBe(true);
    const c = await prisma.customer.findUniqueOrThrow({ where: { id } });
    expect(c.empfehlungCancelAt?.getTime()).toBe(c.empfehlungTrialEndsAt?.getTime());
    await processEmpfehlungBilling(new Date(c.empfehlungTrialEndsAt!.getTime() + 1000));
    expect(state.stripe).toHaveLength(0);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id } })).empfehlungEnabled).toBe(false);

    const again = await bookEmpfehlung(id, { acknowledged: true, now: new Date(NOW.getTime() + 40 * DAY_MS) });
    expect(again).toMatchObject({ ok: true, state: "active" });
    expect(state.stripe.filter((x) => x.method === "create")).toHaveLength(1);
  });

  // ─── Nachfrage nach dem Abschluss ───

  it("Modul aus: keine Anfragen, nichts gesendet", async () => {
    const id = await customer();
    await prisma.reviewSettings.create({ data: { customerId: id, googleReviewUrl: GOOGLE } });
    await closedLead(id, `4915${uid()}11`, "Anna Aus");
    await scheduleReviewRequests(NOW);
    await sendDueReviews(NOW);
    expect(await prisma.reviewRequest.count({ where: { customerId: id } })).toBe(0);
    expect(state.notices.filter((n) => n.customerId === id)).toHaveLength(0);
  });

  it("alle bekommen dieselbe Nachricht mit Google-Link (direkter Draht zuerst), keine Doppelversendung", async () => {
    const id = await activeModule();
    const a = await closedLead(id, `4915${uid()}21`, "Anna Alpha");
    const b = await closedLead(id, `4915${uid()}22`, "Bernd Beta");
    expect(await scheduleReviewRequests(NOW)).toBeGreaterThanOrEqual(2);
    expect(await scheduleReviewRequests(NOW)).toBe(0);
    await sendDueReviews(NOW);
    const mine = state.notices.filter((n) => n.customerId === id);
    expect(mine.map((n) => n.purpose)).toEqual(["review_request", "review_request"]);
    // Gating-frei: Jeder Link führt zur selben Google-Seite
    const reqs = await prisma.reviewRequest.findMany({ where: { customerId: id } });
    for (const r of reqs) {
      expect(mine.some((n) => n.params[1] === googleLinkFor(r.token))).toBe(true);
      expect(await googleRedirect(r.token)).toBe(GOOGLE);
    }
    const text = mine[0].text;
    expect(text.indexOf("antworten Sie mir einfach direkt hier")).toBeLessThan(text.indexOf("/empfehlung/g/"));
    expect((await prisma.reviewRequest.findFirstOrThrow({ where: { leadId: a.id } })).googleClicks).toBe(1);
    await sendDueReviews(new Date(NOW.getTime() + 3600_000));
    expect(state.notices.filter((n) => n.customerId === id)).toHaveLength(2);
    expect(b.id).toBeTruthy();
  });

  it("„Nicht anfragen“ je Kontakt: keine Nachfrage", async () => {
    const id = await activeModule();
    const a = await closedLead(id, `4915${uid()}31`, "Clara Off");
    expect((await setReviewOptOut(id, a.id, true, NOW)).ok).toBe(true);
    await scheduleReviewRequests(NOW);
    await sendDueReviews(NOW);
    expect(state.notices.filter((n) => n.customerId === id)).toHaveLength(0);
    expect((await prisma.reviewRequest.findUniqueOrThrow({ where: { leadId: a.id } })).status).toBe("off");
  });

  it("Kritik → Aufgabe „unzufrieden“, Push, keine Empfehlungsanfrage; Lob → Dank mit Empfehlungslink (kein zweiter Google-Link)", async () => {
    const id = await activeModule();
    const sad = await closedLead(id, `4915${uid()}41`, "Dora Kritisch");
    const happy = await closedLead(id, `4915${uid()}42`, "Emil Froh");
    await scheduleReviewRequests(NOW);
    await sendDueReviews(NOW);
    const convSad = await prisma.conversation.create({ data: { customerId: id, contactPhone: sad.phone!, leadId: sad.id } });
    const convHappy = await prisma.conversation.create({ data: { customerId: id, contactPhone: happy.phone!, leadId: happy.id } });

    const r1 = await handleReviewReply(convSad.id, sad.phone!, "Leider bin ich unzufrieden, niemand hat sich gemeldet.", new Date(NOW.getTime() + 3600_000));
    expect(r1).toMatchObject({ handled: true, sentiment: "negative" });
    const leadSad = await prisma.lead.findUniqueOrThrow({ where: { id: sad.id } });
    expect(leadSad.followUpNote?.startsWith(UNHAPPY_TASK)).toBe(true);
    expect(leadSad.followUpNote).toContain("unzufrieden");
    expect(state.pushes.some((p) => p.title.includes("unzufrieden"))).toBe(true);
    const rrSad = await prisma.reviewRequest.findUniqueOrThrow({ where: { leadId: sad.id } });
    expect(rrSad.referralStatus).toBe("skipped");

    const r2 = await handleReviewReply(convHappy.id, happy.phone!, "Alles super, danke!", new Date(NOW.getTime() + 3600_000));
    expect(r2).toMatchObject({ handled: true, sentiment: "positive" });
    const thanks = state.messages.find((m) => m.to === happy.phone);
    expect(thanks?.body).toContain("Vielen Dank");
    expect(thanks?.body).not.toContain("/empfehlung/g/");
    // Der beste Moment ist das Lob: der persönliche Empfehlungslink geht gleich mit
    expect(thanks?.body).toMatch(/\/empfehlung\/[\w-]+ /);
    const rrHappy = await prisma.reviewRequest.findUniqueOrThrow({ where: { leadId: happy.id } });
    expect(rrHappy.referralStatus).toBe("sent");
    expect((await prisma.referralLink.findUniqueOrThrow({ where: { leadId: happy.id } })).lastOccasion).toBe("lob");
    // Nur die erste Antwort zählt
    expect((await handleReviewReply(convHappy.id, happy.phone!, "Noch was", new Date(NOW.getTime() + 7200_000))).handled).toBe(false);

    // Tag 21: keine zweite Bitte (der Zufriedene hat den Link schon, der Kritische bekommt keine)
    const day21 = new Date(NOW.getTime() + 14 * DAY_MS);
    await sendDueReferrals(day21);
    expect(state.notices.filter((n) => n.customerId === id && n.purpose === "referral_request")).toHaveLength(0);
  });

  it("„Bei Lob direkt um Empfehlung bitten“ aus: einfacher Dank, Bitte um Empfehlung an Tag 21", async () => {
    const id = await activeModule();
    await prisma.reviewSettings.update({ where: { customerId: id }, data: { referralOnPraise: false } });
    const happy = await closedLead(id, `4915${uid()}43`, "Emma Später");
    await scheduleReviewRequests(NOW);
    await sendDueReviews(NOW);
    const conv = await prisma.conversation.create({ data: { customerId: id, contactPhone: happy.phone!, leadId: happy.id } });
    await handleReviewReply(conv.id, happy.phone!, "Alles super, danke!", new Date(NOW.getTime() + 3600_000));
    expect(state.messages.find((m) => m.to === happy.phone)?.body).not.toContain("/empfehlung/");
    await sendDueReferrals(new Date(NOW.getTime() + 14 * DAY_MS));
    const referrals = state.notices.filter((n) => n.customerId === id && n.purpose === "referral_request");
    expect(referrals.map((n) => n.to)).toEqual([happy.phone]);
    expect(referrals[0].params[1]).toMatch(/\/empfehlung\/[\w-]+$/);
  });

  it("Empfehlungslink mit Anlass: passender Text, Aufgabe zum Nachfassen (ohne andere Wiedervorlage zu überschreiben)", async () => {
    const id = await activeModule();
    const a = await closedLead(id, `4915${uid()}81`, "Anna Schaden", 25);
    const r = await sendReferralLinkNow(id, { leadId: a.id }, undefined, "schaden");
    expect(r).toMatchObject({ ok: true, followUp: true });
    const n = state.notices.find((x) => x.to === a.phone && x.purpose === "referral_request");
    expect(n?.text).toContain("Schaden");
    const la = await prisma.lead.findUniqueOrThrow({ where: { id: a.id } });
    expect(isFollowUpTask(la.followUpNote)).toBe(true);
    expect(la.followUpAt!.getTime()).toBeGreaterThan(Date.now() + 47 * 3600_000);
    expect((await prisma.referralLink.findUniqueOrThrow({ where: { leadId: a.id } })).lastOccasion).toBe("schaden");

    const b = await closedLead(id, `4915${uid()}82`, "Bernd Belegt", 25);
    await prisma.lead.update({ where: { id: b.id }, data: { followUpAt: NOW, followUpNote: "Police nachreichen" } });
    expect(await sendReferralLinkNow(id, { leadId: b.id })).toMatchObject({ ok: true, followUp: false });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: b.id } })).followUpNote).toBe("Police nachreichen");
  });

  it("Angebot auf der Seite, einzelne Besucher, Rückmeldung nur mit Einwilligung, Trichter", async () => {
    const id = await activeModule();
    await prisma.reviewSettings.update({ where: { customerId: id }, data: { offerKind: "kfz" } });
    const rec = await closedLead(id, `4915${uid()}91`, "Rita Empfiehlt", 25);
    const link = await prisma.referralLink.create({ data: { customerId: id, leadId: rec.id, token: `tok-of-${uid()}-abcdef`, lastSentAt: NOW, views: 1 } });
    const page = (await loadReferralPage(link.token))!;
    expect(page.offer?.headline).toBe("Kostenloser Kfz-Check");
    expect(page.statusUpdates).toBe(true);
    expect(page.rewardText).toBeNull();

    // Besucher: je Person einmal, Link-Vorschauen zählen nicht
    await countReferralVisit(page, { ip: "1.1.1.1", userAgent: "Mozilla/5.0 (iPhone)" });
    await countReferralVisit(page, { ip: "1.1.1.1", userAgent: "Mozilla/5.0 (iPhone)" });
    await countReferralVisit(page, { ip: "2.2.2.2", userAgent: "Mozilla/5.0 (Android)" });
    await countReferralVisit(page, { ip: "3.3.3.3", userAgent: "WhatsApp/2.23" });
    expect(await prisma.referralVisit.count({ where: { linkId: link.id } })).toBe(2);
    const stored = await prisma.referralVisit.findFirstOrThrow({ where: { linkId: link.id } });
    expect(stored.visitorHash).not.toContain("1.1.1.1");

    // Ohne Einwilligung: keine Rückmeldung
    await submitReferral(link.token, { name: "Otto Ohne", phone: `4915${uid()}92`, email: null, topic: null, message: null, consent: true }, NOW);
    expect(await sendReferralUpdates(NOW)).toBe(0);
    // Mit Einwilligung: „gemeldet“, nach dem Termin „Termin“, je Stufe einmal
    await submitReferral(link.token, { name: "Mia Mit", phone: `4915${uid()}93`, email: null, topic: null, message: null, consent: true, statusConsent: true }, NOW);
    const mia = await prisma.lead.findFirstOrThrow({ where: { referralLinkId: link.id, name: "Mia Mit" } });
    expect(JSON.stringify(mia.formData)).toContain("Kostenloser Kfz-Check");
    expect(await sendReferralUpdates(NOW)).toBe(1);
    expect(await sendReferralUpdates(NOW)).toBe(0);
    await prisma.appointment.create({ data: { customerId: id, leadId: mia.id, mode: "phone", startsAt: new Date(NOW.getTime() + DAY_MS) } });
    expect(await sendReferralUpdates(NOW)).toBe(1);
    expect(await sendReferralUpdates(NOW)).toBe(0);
    const ups = state.notices.filter((n) => n.purpose === "referral_update");
    expect(ups.map((n) => n.to)).toEqual([rec.phone, rec.phone]);
    expect(ups[0].params[1]).toBe("Mia hat sich über Ihren Link bei mir gemeldet.");
    expect(ups[1].params[1]).toMatch(/Termin/);
    expect(ups.some((n) => n.text.includes("Otto"))).toBe(false);

    const s = await loadEmpfehlungStats(id, 90, new Date(NOW.getTime() + 1000));
    expect(s.funnel).toMatchObject({ linksSent: 1, linksOpened: 1, leads: 2, closings: 0 });
  });

  it("Allgemeiner Link (Aufsteller, Signatur): ein Link je Vertreter, Lead ohne Empfehlenden, keine Rückmeldung", async () => {
    const id = await activeModule();
    const g1 = await generalLinkOf(id);
    const g2 = await generalLinkOf(id);
    expect(g2.id).toBe(g1.id);
    const page = (await loadReferralPage(g1.token))!;
    expect(page).toMatchObject({ general: true, recommender: null, statusUpdates: false });
    await submitReferral(g1.token, { name: "Gabi Aufsteller", phone: `4915${uid()}95`, email: null, topic: null, message: null, consent: true, statusConsent: true }, NOW);
    const lead = await prisma.lead.findFirstOrThrow({ where: { referralLinkId: g1.id } });
    expect(JSON.stringify(lead.formData)).toContain("allgemeiner Link");
    expect(lead.referralStatusConsent).toBe(false);
    expect(await sendReferralUpdates(NOW)).toBe(0);
  });

  it("Dankeschön: nur eingeschaltet und bestätigt, erst nach dem Gespräch, nie bei Selbstempfehlung, von Hand erledigt", async () => {
    const id = await activeModule();
    const rec = await closedLead(id, `49151${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`, "Dana Dank", 25);
    const link = await prisma.referralLink.create({ data: { customerId: id, leadId: rec.id, token: `tok-rw-${uid()}-abcdef` } });
    // Aus: nichts
    await submitReferral(link.token, { name: "Vor Her", phone: `4915${uid()}02`, email: null, topic: null, message: null, consent: true }, new Date(NOW.getTime() - DAY_MS));
    expect(await planReferralRewards(NOW)).toBe(0);
    expect((await loadReferralPage(link.token))!.rewardText).toBeNull();

    await prisma.reviewSettings.update({ where: { customerId: id }, data: { rewardKind: "gutschein", rewardAmount: 15, rewardNote: "Wunschgutschein", rewardTrigger: "termin", rewardConfirmedAt: new Date(Date.now() - 1000) } });
    expect((await loadReferralPage(link.token))!.rewardText).toContain("Wunschgutschein über 15 €");
    await submitReferral(link.token, { name: "Neu Kunde", phone: `4915${uid()}03`, email: null, topic: null, message: null, consent: true }, NOW);
    await submitReferral(link.token, { name: "Dana Selbst", phone: rec.phone!, email: null, topic: null, message: null, consent: true }, new Date(NOW.getTime() + 31 * DAY_MS));
    const neu = await prisma.lead.findFirstOrThrow({ where: { referralLinkId: link.id, name: "Neu Kunde" } });
    const selbst = await prisma.lead.findFirstOrThrow({ where: { referralLinkId: link.id, name: "Dana Selbst" } });
    expect(selbst.referralRewardStatus).toBe("entfaellt");
    // Noch kein Gespräch → nichts fällig
    expect(await planReferralRewards(NOW)).toBe(0);
    await prisma.appointment.create({ data: { customerId: id, leadId: neu.id, mode: "phone", startsAt: NOW, status: "completed" } });
    await prisma.appointment.create({ data: { customerId: id, leadId: selbst.id, mode: "phone", startsAt: NOW, status: "completed" } });
    expect(await planReferralRewards(NOW)).toBe(1);
    expect(await planReferralRewards(NOW)).toBe(0);
    const open = await openRewards(id);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ referred: "Neu", recommender: "Dana Dank", label: "Wunschgutschein über 15 €" });
    // Aufgabe am Kontakt der Empfehlenden
    expect(isRewardTask((await prisma.lead.findUniqueOrThrow({ where: { id: rec.id } })).followUpNote)).toBe(true);
    expect(await settleReward(id, neu.id, "erledigt", NOW)).toBe(true);
    expect(await settleReward(id, neu.id, "erledigt", NOW)).toBe(false);
    expect(await openRewards(id)).toHaveLength(0);
  });

  it("WhatsApp-Knopf: Anfrage mit Code → Lead „Empfehlung“ am Chat, ohne Erstanschreiben; ohne Code oder bei bekanntem Kontakt nichts", async () => {
    const id = await activeModule();
    await prisma.whatsAppAccount.create({ data: { customerId: id, status: "connected", phoneNumber: "+49 30 1234567" } });
    await prisma.reviewSettings.update({ where: { customerId: id }, data: { offerKind: "ordner" } });
    const rec = await closedLead(id, NUM(), "Wanda Wirbt", 25);
    const link = await prisma.referralLink.create({ data: { customerId: id, leadId: rec.id, token: `Wa${uid()}tok-abcdefgh12` } });
    const page = (await loadReferralPage(link.token))!;
    expect(page.whatsappUrl).toMatch(/^https:\/\/wa\.me\/49301234567\?text=/);
    const text = decodeURIComponent(page.whatsappUrl!.split("text=")[1]);
    expect(text).toContain("Empfehlung von Wanda");
    expect(text).toContain(`(Ref ${refCodeOf(link.token)})`);

    const from = NUM();
    const conv = await prisma.conversation.create({ data: { customerId: id, contactPhone: from, contactName: "Tom Tippt" } });
    expect((await handleReferralInbound(conv.id, from, "Hallo, eine Frage", "Tom Tippt", NOW)).leadId).toBeNull();
    const r = await handleReferralInbound(conv.id, from, text, "Tom Tippt", NOW);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: r.leadId! } });
    expect(lead).toMatchObject({ source: "Empfehlung", name: "Tom Tippt", phone: from, referralLinkId: link.id, outreachStatus: "skipped_contact", referralRewardStatus: null });
    expect(JSON.stringify(lead.formData)).toContain("Empfehlung von Wanda Wirbt");
    expect(JSON.stringify(lead.formData)).toContain("Kostenloser Versicherungs-Check");
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } })).leadId).toBe(lead.id);
    // Zweite Nachricht mit Code: kein zweiter Lead
    expect((await handleReferralInbound(conv.id, from, text, "Tom Tippt", NOW)).leadId).toBeNull();
    expect(await prisma.lead.count({ where: { referralLinkId: link.id } })).toBe(1);
    // Die Empfehlende schreibt selbst mit ihrem Code: Lead ja, Dankeschön nein
    const convSelf = await prisma.conversation.create({ data: { customerId: id, contactPhone: `x${rec.phone}`, contactName: "Wanda" } });
    const self = await handleReferralInbound(convSelf.id, rec.phone!, text, "Wanda", NOW);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: self.leadId! } })).referralRewardStatus).toBe("entfaellt");
  });

  it("Aufsteller: Kunde holt mit seiner Handynummer den persönlichen Link; unbekannte Nummer oder kein allgemeiner Link → nichts", async () => {
    const id = await activeModule();
    const general = await generalLinkOf(id);
    const kunde = await closedLead(id, NUM(), "Karl Kunde", 25);
    const offen = await prisma.lead.create({ data: { customerId: id, name: "Ina Interessent", phone: NUM(), status: "Neuer Lead", source: "TKV" } });
    const token = await claimPersonalLink(general.token, kunde.phone!, NOW);
    expect(token).toBeTruthy();
    const personal = await prisma.referralLink.findUniqueOrThrow({ where: { token: token! } });
    expect(personal).toMatchObject({ leadId: kunde.id, kind: "contact", lastOccasion: "aufsteller" });
    expect(await claimPersonalLink(general.token, kunde.phone!, NOW)).toBe(token);
    expect(await claimPersonalLink(general.token, offen.phone!, NOW)).toBeNull();
    expect(await claimPersonalLink(general.token, "4915900000000", NOW)).toBeNull();
    expect(await claimPersonalLink(token!, kunde.phone!, NOW)).toBeNull();
  });

  it("Nach dem Termin: nur eingeschaltet, nur Kunden, einmal je Termin, höchstens alle 180 Tage, nicht bei Kritik", async () => {
    const id = await activeModule();
    const kunde = await closedLead(id, NUM(), "Tina Termin", 60);
    const kritisch = await closedLead(id, NUM(), "Kurt Kritik", 60);
    const offen = await prisma.lead.create({ data: { customerId: id, name: "Olaf Offen", phone: NUM(), status: "Im Gespräch", source: "TKV" } });
    await prisma.lead.update({ where: { id: kritisch.id }, data: { followUpAt: NOW, followUpNote: `${UNHAPPY_TASK}: „Test“` } });
    const mk = (leadId: string) => prisma.appointment.create({ data: { customerId: id, leadId, mode: "phone", startsAt: new Date(NOW.getTime() - 5 * 3600_000), status: "completed" } });
    const a1 = await mk(kunde.id);
    await mk(kritisch.id);
    await mk(offen.id);
    // „stattgefunden“ vor 3 Stunden (Prisma setzt updatedAt selbst → direkt in der Datenbank)
    const at = new Date(NOW.getTime() - 3 * 3600_000);
    await prisma.$executeRaw`UPDATE "Appointment" SET "updatedAt" = ${at} WHERE "customerId" = ${id}`;

    // Aus (Standard): nichts
    expect(await sendAfterAppointmentReferrals(NOW)).toEqual({ sent: 0, skipped: 0 });
    await prisma.reviewSettings.update({ where: { customerId: id }, data: { referralAfterAppointment: true } });
    expect(await sendAfterAppointmentReferrals(NOW)).toEqual({ sent: 1, skipped: 2 });
    const sent = state.notices.filter((n) => n.customerId === id && n.purpose === "referral_request");
    expect(sent.map((n) => n.to)).toEqual([kunde.phone]);
    expect(sent[0].text).toContain("danke für das gute Gespräch");
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: a1.id } })).referralAskedAt).not.toBeNull();
    // Einmal je Termin; neuer Termin innerhalb von 180 Tagen → übersprungen
    expect(await sendAfterAppointmentReferrals(NOW)).toEqual({ sent: 0, skipped: 0 });
    await mk(kunde.id);
    await prisma.$executeRaw`UPDATE "Appointment" SET "updatedAt" = ${at} WHERE "customerId" = ${id} AND "referralAskedAt" IS NULL`;
    expect(await sendAfterAppointmentReferrals(NOW)).toEqual({ sent: 0, skipped: 1 });
  });

  it("offene Aufgabe „unzufrieden“ hält die Empfehlungsanfrage zurück", async () => {
    const id = await activeModule();
    const l = await closedLead(id, `4915${uid()}51`, "Frieda Offen", 25);
    await prisma.reviewRequest.create({
      data: { customerId: id, leadId: l.id, token: `tok-open-${uid()}-xx`, status: "sent", reviewDueAt: NOW, reviewSentAt: NOW, referralDueAt: NOW },
    });
    await prisma.lead.update({ where: { id: l.id }, data: { followUpNote: `${UNHAPPY_TASK}: „Test“`, followUpAt: NOW } });
    await sendDueReferrals(NOW);
    expect(state.notices.filter((n) => n.customerId === id)).toHaveLength(0);
    expect((await prisma.reviewRequest.findUniqueOrThrow({ where: { leadId: l.id } })).referralStatus).toBe("waiting");
  });

  it("Empfehlungsseite → Lead mit Quelle „Empfehlung“; Abschluss → Dank an den Empfehlenden (einmal); Auswertung", async () => {
    const id = await activeModule();
    const rec = await closedLead(id, `4915${uid()}61`, "Gerd Empfiehlt", 25);
    const link = await prisma.referralLink.create({ data: { customerId: id, leadId: rec.id, token: `tok-ref-${uid()}-abcdef` } });
    expect(await submitReferral(link.token, { name: "Hanna Neu", phone: `4915${uid()}62`, email: null, topic: "TKV", message: null, consent: false }, NOW)).toMatchObject({ ok: false, error: "consent" });
    const r = await submitReferral(link.token, { name: "Hanna Neu", phone: `4915${uid()}62`, email: null, topic: "TKV", message: "Bitte anrufen", consent: true }, NOW);
    expect(r.ok).toBe(true);
    const lead = await prisma.lead.findFirstOrThrow({ where: { referralLinkId: link.id } });
    expect(lead.source).toBe("Empfehlung");
    expect(JSON.stringify(lead.formData)).toContain("Empfehlung von Gerd Empfiehlt");

    await prisma.lead.update({ where: { id: lead.id }, data: { status: "Abschluss", closedAt: NOW, closeValue: 300 } });
    expect(await sendReferralThanks(NOW)).toBe(1);
    expect(await sendReferralThanks(NOW)).toBe(0);
    const thanks = state.notices.filter((n) => n.purpose === "referral_thanks");
    expect(thanks.map((n) => n.to)).toEqual([rec.phone]);
    expect(thanks[0].text).not.toContain("Hanna");

    const s = await loadEmpfehlungStats(id, 90, new Date(NOW.getTime() + 1000));
    expect(s.referralLeads).toBe(1);
    expect(s.referralClosings).toBe(1);
    expect(s.referralProvision).toBeGreaterThan(0);
  });

  it("Modul beendet: Empfehlungsseite nicht mehr aktiv", async () => {
    const id = await activeModule();
    const rec = await closedLead(id, `4915${uid()}71`, "Ida Alt", 25);
    const link = await prisma.referralLink.create({ data: { customerId: id, leadId: rec.id, token: `tok-off-${uid()}-abcdef` } });
    await prisma.customer.update({ where: { id }, data: { empfehlungEnabled: false } });
    expect(await submitReferral(link.token, { name: "X", phone: "491511234567", email: null, topic: null, message: null, consent: true }, NOW)).toMatchObject({ ok: false, error: "unavailable" });
  });
});
