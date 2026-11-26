import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

// Benachrichtigung bei neuen Leads je Login (Ole, 26.11.2026, Anlass CL Capital Living): Inhaber bekommt mit „alle“
// jeden Lead per E-Mail, auch wenn er an die Beraterin geht; Beraterin mit „meine“ nur eigene; nie doppelt.

const mails: { to: string | string[]; subject: string; list?: string[]; paragraphs: string[] }[] = [];
const pushes: { userId: string; tag?: string }[] = [];
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  getAppUrl: () => "https://app.test",
  sendCustomerMail: async (m: (typeof mails)[number]) => {
    mails.push(m);
    return { ok: true };
  },
}));
vi.mock("@/lib/push", async (orig) => ({
  ...(await orig<typeof import("@/lib/push")>()),
  sendToUser: async (userId: string, p: { tag?: string }) => {
    pushes.push({ userId, tag: p.tag });
    return { sent: 1, removed: 0, errors: [] };
  },
}));

const an = (to: string | string[]) => [to].flat()[0];

describe("Neue Leads: E-Mail und Push je Login", () => {
  let customerId = "";
  let karsten = { id: "", email: "" };
  let lisa = { id: "", email: "" };
  let tom = { id: "", email: "" };
  const neuerLead = (assignedUserId: string | null, extra: Record<string, unknown> = {}) =>
    prisma.lead.create({
      data: { customerId, name: "Max Muster", phone: "4917100000001", email: "max@example.com", source: "PKV", assignedUserId, status: "Neuer Lead", formData: [{ label: "Beitrag", value: "Antwort-Geheim" }], ...extra },
    });

  beforeAll(async () => {
    requireTestDb();
    const c = await makeCustomer();
    customerId = c.id;
    const k = await makeBuyer(c.id, "owner", false);
    const l = await makeBuyer(c.id, "advisor", true);
    const t = await makeBuyer(c.id, "advisor", true);
    await prisma.user.update({ where: { id: k.id }, data: { displayName: "Karsten" } });
    await prisma.user.update({ where: { id: l.id }, data: { displayName: "Lisa" } });
    karsten = k;
    lisa = l;
    tom = t;
  });
  beforeEach(async () => {
    mails.length = 0;
    pushes.length = 0;
    await prisma.user.updateMany({ where: { customerId }, data: { leadMailScope: null, leadPushScope: null } });
    await prisma.customer.update({ where: { id: customerId }, data: { leadEmail: true } });
  });
  afterAll(async () => {
    await prisma.lead.deleteMany({ where: { customerId } });
    await prisma.user.deleteMany({ where: { customerId } });
    await cleanupCustomer(customerId);
  });

  it("Inhaber (Standard „alle“) bekommt die E-Mail zum Lead der Beraterin, nur Name, Produkt, Zuständige und Link", async () => {
    const { neuerLeadMail } = await import("@/lib/lead-benachrichtigung");
    const lead = await neuerLead(lisa.id);
    const ids = await neuerLeadMail(lead.id);
    expect(new Set(ids)).toEqual(new Set([karsten.id, lisa.id]));
    const k = mails.find((m) => an(m.to) === karsten.email)!;
    expect(k.subject).toBe("Neuer Lead: Max Muster (PKV)");
    expect(k.list).toEqual(["Name: Max Muster", "Produkt: PKV", "Zuständig: Lisa"]);
    expect(k.paragraphs[0]).toContain("Team");
    const text = JSON.stringify(k);
    expect(text).not.toContain("4917100000001");
    expect(text).not.toContain("max@example.com");
    expect(text).not.toContain("Antwort-Geheim");
    expect(text).toContain(`https://app.test/buyer/leads/${lead.id}`);
    // Tom (anderer Berater, „meine“) bekommt nichts
    expect(mails.some((m) => an(m.to) === tom.email)).toBe(false);
  });

  it("Beraterin mit „meine“ nur eigene; Inhaber mit „meine“ keine Leads der Beraterin", async () => {
    const { neuerLeadMail } = await import("@/lib/lead-benachrichtigung");
    await prisma.user.update({ where: { id: karsten.id }, data: { leadMailScope: "meine" } });
    const fuerTom = await neuerLead(tom.id);
    expect(await neuerLeadMail(fuerTom.id)).toEqual([tom.id]);
    expect(mails.map((m) => an(m.to))).toEqual([tom.email]);
  });

  it("keine Doppelmail: Inhaber selbst zuständig bekommt eine Mail, zweiter Lauf nichts", async () => {
    const { neuerLeadMail } = await import("@/lib/lead-benachrichtigung");
    const lead = await neuerLead(karsten.id);
    expect(await neuerLeadMail(lead.id)).toEqual([karsten.id]);
    expect(await neuerLeadMail(lead.id)).toEqual([]);
    expect(mails.filter((m) => an(m.to) === karsten.email)).toHaveLength(1);
    expect(mails[0].paragraphs[0]).toContain("für Sie");
  });

  it("„Neue Leads per E-Mail“ am Konto aus: Standard aus, ausdrückliche Wahl gilt", async () => {
    const { neuerLeadMail } = await import("@/lib/lead-benachrichtigung");
    await prisma.customer.update({ where: { id: customerId }, data: { leadEmail: false } });
    expect(await neuerLeadMail((await neuerLead(lisa.id)).id)).toEqual([]);
    await prisma.user.update({ where: { id: karsten.id }, data: { leadMailScope: "alle" } });
    expect(await neuerLeadMail((await neuerLead(lisa.id)).id)).toEqual([karsten.id]);
  });

  it("Push: Zuständige plus Inhaber mit „alle“; Inhaber mit „meine“ nur bei eigenen", async () => {
    const { neuerLeadPush } = await import("@/lib/lead-benachrichtigung");
    const lead = await neuerLead(lisa.id);
    const payload = { title: "Neuer Lead", body: "", tag: `lead-buyer:${lead.id}` };
    expect(new Set(await neuerLeadPush(lead.id, payload))).toEqual(new Set([lisa.id, karsten.id]));
    await prisma.user.update({ where: { id: karsten.id }, data: { leadPushScope: "meine" } });
    expect(await neuerLeadPush(lead.id, payload)).toEqual([lisa.id]);
    // ohne Zuständigen wie bisher an alle
    const offen = await neuerLead(null);
    expect((await neuerLeadPush(offen.id, payload)).length).toBe(3);
  });

  it("processNewLead mit Onboarding und „Neue Leads per E-Mail“: je Login genau eine Mail, keine Konto-Mail an alle", async () => {
    await prisma.onboarding.create({ data: { customerId } });
    const { processNewLead } = await import("@/lib/lead-intake");
    const lead = await neuerLead(lisa.id, { phone: "4917623458761" });
    await processNewLead(lead.id);
    const empfaenger = mails.map((m) => an(m.to)).sort();
    expect(empfaenger).toEqual([karsten.email, lisa.email].sort());
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).emailedAt).toBeNull();
    expect(pushes.filter((p) => p.tag === `lead-buyer:${lead.id}`).map((p) => p.userId).sort()).toEqual([karsten.id, lisa.id].sort());
    await prisma.onboarding.delete({ where: { customerId } });
  });

  it("Ops-Aktion lead_benachrichtigung_setzen", async () => {
    const { AKTIONEN } = await import("@/lib/ops-aktionen");
    const run = AKTIONEN.lead_benachrichtigung_setzen.run;
    const ok = await run({ customerId, name: "karsten", mail: "alle", push: "alle" });
    expect(ok.ok).toBe(true);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: karsten.id } });
    expect([u.leadMailScope, u.leadPushScope]).toEqual(["alle", "alle"]);
    expect((await run({ customerId, name: "lisa", mail: "alle" })).ok).toBe(false);
    expect((await run({ customerId, name: "lisa", mail: "aus" })).ok).toBe(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: lisa.id } })).leadMailScope).toBe("aus");
    expect((await run({ customerId, name: "test.local", mail: "aus" })).ok).toBe(false);
  });
});
