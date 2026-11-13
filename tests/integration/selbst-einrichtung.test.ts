// Selbst-Einrichtung: Meta-Zugriff prüfen (Graph gemockt), speichern, Push an Admins;
// Erinnerungen Tag 1/3/7 genau einmal; „Heute“ erst nach 7 Tagen.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ mails: [] as { to: unknown; subject: string }[], admin: [] as { title: string }[], buyer: [] as { title: string }[] }));
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendCustomerMail: async (o: { to: unknown; subject: string }) => (sent.mails.push({ to: o.to, subject: o.subject }), { ok: true }),
}));
vi.mock("@/lib/push", async (orig) => ({
  ...(await orig<typeof import("@/lib/push")>()),
  sendToAdmins: async (p: { title: string }) => (sent.admin.push(p), { sent: 0, removed: 0, errors: [] }),
  sendToBuyersOfCustomer: async (_c: string, p: { title: string }) => (sent.buyer.push(p), { sent: 0, removed: 0, errors: [] }),
}));

import { prisma } from "@/lib/prisma";
import { checkMetaAccess, runSetupReminders, stuckSetups } from "@/lib/selbst-einrichtung";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const DAY = 86400000;
let graphMode: "ok" | "noAds" = "ok";

function fakeGraph(url: string): Response {
  const u = new URL(url);
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
  if (u.pathname.includes("/act_")) {
    return graphMode === "ok"
      ? json({ name: "Werbekonto Muster", currency: "EUR", account_status: 1 })
      : json({ error: { message: "(#200) Ad account owner has NOT grant ads_management or ads_read permission" } }, 400);
  }
  if (u.pathname.endsWith("/leadgen_forms")) return json({ data: [] });
  if (/\/\d+$/.test(u.pathname)) return json({ id: "556677889900", name: "Agentur Muster", access_token: "PAGE_TOKEN" });
  return json({ error: { message: "unknown" } }, 404);
}

describe("Selbst-Einrichtung", () => {
  const customers: string[] = [];
  const realFetch = globalThis.fetch;

  async function setup(createdDaysAgo: number, extra: Record<string, unknown> = {}) {
    const c = await makeCustomer();
    customers.push(c.id);
    const u = await makeBuyer(c.id, "owner");
    await prisma.user.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });
    const createdAt = new Date(Date.now() - createdDaysAgo * DAY);
    const ob = await prisma.onboarding.create({ data: { customerId: c.id, package: "software", createdAt, welcomeSentAt: createdAt, ...extra } });
    return { customerId: c.id, onboardingId: ob.id, email: u.email };
  }

  beforeAll(() => {
    requireTestDb();
    process.env.META_ACCESS_TOKEN = "EAAtestToken1234567890";
    process.env.APP_URL ??= "https://app.test";
    globalThis.fetch = (async (input: RequestInfo | URL) => fakeGraph(String(input instanceof Request ? input.url : input))) as typeof fetch;
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    delete process.env.META_ACCESS_TOKEN;
    for (const id of customers) await cleanupCustomer(id);
  });
  beforeEach(() => {
    sent.mails = [];
    sent.admin = [];
    sent.buyer = [];
    graphMode = "ok";
  });

  it("Zugriff da: grün, Schritt erledigt, IDs in der Kundenakte, Push an Admins", async () => {
    const { customerId } = await setup(0);
    const r = await checkMetaAccess(customerId, { adAccount: "act_123456789012", page: "556677889900" });
    expect(r.ok && r.check.ok).toBe(true);
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(c).toMatchObject({ metaAdAccountId: "123456789012", metaPageId: "556677889900" });
    const ob = await prisma.onboarding.findUniqueOrThrow({ where: { customerId } });
    expect(ob.metaAccessAt).not.toBeNull();
    expect(sent.admin.some((p) => /Meta-Zugriff bei .* ist da/.test(p.title))).toBe(true);
    // zweite Prüfung: kein zweiter Push
    await checkMetaAccess(customerId);
    expect(sent.admin.filter((p) => /Meta-Zugriff/.test(p.title))).toHaveLength(1);
  });

  it("Werberechte fehlen: verständliche Meldung, Schritt bleibt offen, IDs trotzdem gespeichert", async () => {
    graphMode = "noAds";
    const { customerId } = await setup(0);
    const r = await checkMetaAccess(customerId, { adAccount: "123456789012", page: "556677889900" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.check.ok).toBe(false);
    expect(r.check.adAccount.error).toMatch(/Kampagnen verwalten/);
    expect(r.check.page.ok).toBe(true);
    const ob = await prisma.onboarding.findUniqueOrThrow({ where: { customerId } });
    expect(ob.metaAccessAt).toBeNull();
    expect(ob.metaCheck).not.toBeNull();
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).metaAdAccountId).toBe("123456789012");
  });

  it("ungültige Eingabe: klare Meldung, nichts gespeichert", async () => {
    const { customerId } = await setup(0);
    const r = await checkMetaAccess(customerId, { adAccount: "mein konto" });
    expect(r).toMatchObject({ ok: false });
  });

  it("Erinnerungen Tag 1/3/7 jeweils genau einmal, Tag 7 mit Admin-Push", async () => {
    const { customerId, onboardingId, email } = await setup(1.2);
    const fake = (days: number) => new Date(Date.now() + days * DAY);
    // Geschäftszeiten spielen hier keine Rolle (runSetupReminders selbst prüft sie nicht)
    await runSetupReminders(fake(0));
    await runSetupReminders(fake(0.1));
    const mine = () => sent.mails.filter((m) => [m.to].flat().includes(email)).length;
    expect(mine()).toBe(1);
    await runSetupReminders(fake(2)); // Tag 3.2
    await runSetupReminders(fake(2.1));
    expect(mine()).toBe(2);
    await runSetupReminders(fake(6)); // Tag 7.2
    await runSetupReminders(fake(6.5));
    expect(mine()).toBe(3);
    const name = (await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).name;
    expect(sent.admin.filter((p) => p.title === `⏳ Einrichtung hängt: ${name}`).length).toBe(1);
    const ob = await prisma.onboarding.findUniqueOrThrow({ where: { id: onboardingId } });
    expect(Object.keys((ob.setupReminders ?? {}) as object).sort()).toEqual(["1", "3", "7"]);
  });

  it("Heute: nur Einrichtungen, die seit mindestens 7 Tagen beim Kunden hängen", async () => {
    const old = await setup(8);
    const fresh = await setup(5);
    const done = await setup(9, { questionnaireAt: new Date(), metaAccessAt: new Date(), consentAt: new Date() });
    const stuck = await stuckSetups(new Date());
    const ids = stuck.map((s) => s.customerId);
    expect(ids).toContain(old.customerId);
    expect(ids).not.toContain(fresh.customerId);
    // „done“ hat noch Kalender/WhatsApp offen → bleibt drin, aber nur mit diesen Schritten
    const d = stuck.find((s) => s.customerId === done.customerId);
    expect(d?.open.some((l) => /Fragebogen|Meta|Einwilligung/.test(l))).toBe(false);
  });
});
