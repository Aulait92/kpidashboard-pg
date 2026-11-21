import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mails: nichts echt senden, Aufrufe mitschreiben; Adressen mit „kaputt“ schlagen fehl
const sent: { to: string; subject: string; text: string; attachments?: { filename: string; content: string | Buffer }[] }[] = [];
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendPlainMail: vi.fn(async (o: { to: string | string[]; subject: string; text: string; attachments?: { filename: string; content: string | Buffer }[] }) => {
    const to = [o.to].flat().join(",");
    sent.push({ to, subject: o.subject, text: o.text, attachments: o.attachments });
    return to.includes("kaputt") ? { ok: false as const, error: "Mailbox rejected" } : { ok: true as const, id: "x" };
  }),
}));
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn(async () => {}), sendToCustomer: vi.fn(async () => {}) }));

import { prisma } from "@/lib/prisma";
import { ingestPoolLead, quotaFor } from "@/lib/ppl/engine";
import { sendTestLead } from "@/lib/ppl/test-lead";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const product = `PKV-Slack-${Math.random().toString(36).slice(2, 7)}`;
const productFail = `${product}-F`;
const productMuted = `${product}-M`;
const run = String(Math.floor(Math.random() * 1e5)).padStart(5, "0");
const fields = (n: number) => ({
  vorname: "Erika", nachname: `Musterfrau${n}`, telefon: `01522${run}${String(n).padStart(2, "0")}`, email: `slack${n}-${run}@test.local`,
  postleitzahl: "36251", ort: "Bad Hersfeld", beitrag: "900 €", situation: "Angestellt",
});

const slack: string[] = [];
const realFetch = globalThis.fetch;
async function waitFor(n: number) {
  for (let i = 0; i < 60 && slack.length < n; i++) await new Promise((r) => setTimeout(r, 50));
}

describe("Pay-per-Lead: Slack, maschinenlesbare Mail, Testdatensatz", () => {
  const ids: string[] = [];
  let subId = "";
  beforeAll(async () => {
    requireTestDb();
    process.env.SLACK_PPL_WEBHOOK_URL = "https://hooks.slack.example/services/T/B/x";
    process.env.APP_URL = "https://app.example.com";
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).startsWith("https://hooks.slack.example/")) {
        slack.push(JSON.parse(String(init?.body)).text);
        return new Response("ok");
      }
      return realFetch(url, init);
    }) as typeof fetch;
    const c = await makeCustomer({ name: `Beispiel GmbH ${run}` });
    ids.push(c.id);
    const sub = await prisma.leadSubscription.create({
      data: {
        customerId: c.id, productKey: product, label: "Beispiel (Callcenter)", price: 60, period: "once", goal: 5, delivery: "email",
        deliveryEmail: "service@example.com, kontakt@example.org, abc123@hook.example.net", emailFormat: "maschinenlesbar",
        consentText: "Ich willige in die Weitergabe an Partner aus dem Netzwerk ein.",
      },
    });
    subId = sub.id;
    await prisma.leadSubscription.create({ data: { customerId: c.id, productKey: productFail, price: 60, period: "once", goal: 5, delivery: "email", deliveryEmail: "ok@example.com, kaputt@example.com", emailFormat: "maschinenlesbar" } });
    await prisma.leadSubscription.create({ data: { customerId: c.id, productKey: productMuted, price: 60, period: "once", goal: 5, delivery: "email", deliveryEmail: "ok@example.com", slackNotify: false } });
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    delete process.env.SLACK_PPL_WEBHOOK_URL;
    await prisma.poolLead.deleteMany({ where: { productKey: { in: [product, productFail, productMuted] } } });
    await prisma.auditLog.deleteMany({ where: { action: "ppl.test", entityId: subId } });
    for (const id of ids) await cleanupCustomer(id);
  });

  it("liefert an mehrere Adressen (je eine Mail, maschinenlesbar mit lead.json) und meldet ohne volle Kontaktdaten an Slack", async () => {
    const r = await ingestPoolLead({ productKey: product, via: "webhook", fields: fields(1) });
    expect(r.status).toBe("delivered");
    const mails = sent.filter((m) => m.subject.includes(r.leadId!));
    expect(mails.map((m) => m.to)).toEqual(["service@example.com", "kontakt@example.org", "abc123@hook.example.net"]);
    for (const m of mails) {
      expect(m.subject).toBe(`Neuer Lead: ${product} (${r.leadId})`);
      expect(m.text).toContain("Telefon: +491522");
      expect(m.text).toContain("Einwilligungstext: Ich willige in die Weitergabe");
      expect(m.attachments?.[0].filename).toBe("lead.json");
      expect(JSON.parse(String(m.attachments?.[0].content)).lead_id).toBe(r.leadId);
      expect(hatGedankenstrich(m.text)).toBe(false);
    }
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: r.leadId! } });
    expect(lead.emailedAt).not.toBeNull();
    await waitFor(1);
    const msg = slack.find((t) => t.includes(product))!;
    expect(msg).toContain("PPL-Lead geliefert");
    expect(msg).toContain(`Bezieher: Beispiel GmbH ${run} (Bezug: Beispiel (Callcenter))`);
    expect(msg).toContain("Lead: Erika, 36251 Bad Hersfeld");
    expect(msg).toContain("an 3 Adressen (example.com, example.org, hook.example.net): zugestellt");
    expect(msg).toContain(`https://app.example.com/admin/neu/leads/ppl?ansicht=geliefert&q=${r.leadId}`);
    expect(msg).not.toMatch(/Musterfrau|1522|@|abc123/);
  });

  it("Dublette mit Grund an Slack", async () => {
    const before = slack.length;
    const r = await ingestPoolLead({ productKey: product, via: "webhook", fields: { ...fields(1), email: `anders-${run}@test.local` } });
    expect(r.status).toBe("duplicate");
    await waitFor(before + 1);
    expect(slack.at(-1)).toContain("PPL-Lead Dublette");
    expect(slack.at(-1)).toContain("Status: Dublette, schon am");
  });

  it("Auslieferungsfehler: Lead bleibt gespeichert, Slack bekommt eine eigene Warnung", async () => {
    const before = slack.length;
    const r = await ingestPoolLead({ productKey: productFail, via: "webhook", fields: fields(2) });
    expect(r.status).toBe("delivered");
    await waitFor(before + 2);
    const mine = slack.slice(before);
    expect(mine.some((t) => t.includes("FEHLER: example.com: Mailbox rejected"))).toBe(true);
    const warn = mine.find((t) => t.includes("Lead nicht zugestellt"));
    expect(warn).toContain(productFail);
    expect(warn).not.toContain("kaputt@");
  });

  it("Schalter je Bezug: slackNotify aus → keine Nachricht", async () => {
    const before = slack.length;
    const r = await ingestPoolLead({ productKey: productMuted, via: "webhook", fields: fields(3) });
    expect(r.status).toBe("delivered");
    await new Promise((res) => setTimeout(res, 300));
    expect(slack.slice(before).some((t) => t.includes(productMuted))).toBe(false);
  });

  it("Testdatensatz: an alle Adressen, [TEST], zählt nicht ins Kontingent, nicht in Umsatz und Statistik, steht im Protokoll", async () => {
    const sub = await prisma.leadSubscription.findUniqueOrThrow({ where: { id: subId } });
    const counts = async () => ({
      leads: await prisma.lead.count({ where: { subscriptionId: subId } }),
      pool: await prisma.poolLead.count({ where: { productKey: product } }),
      revenue: await prisma.revenue.count({ where: { customerId: sub.customerId } }),
      intake: await prisma.pplIntake.count(),
      delivered: (await quotaFor(sub))?.delivered,
    });
    const before = await counts();
    const slackBefore = slack.length;
    const r = await sendTestLead(subId, { role: "ADMIN", email: "admin@example.com" });
    expect(r.ok).toBe(true);
    expect(r.targets.map((t) => t.target)).toEqual(["service@example.com", "kontakt@example.org", "abc123@hook.example.net"]);
    const mails = sent.filter((m) => m.subject.includes(r.leadId!));
    expect(mails).toHaveLength(3);
    expect(mails[0].subject).toBe(`[TEST] Neuer Lead: ${product} (${r.leadId})`);
    expect(mails[0].text).toContain("Vorname: TEST");
    expect(mails[0].text).toContain("Nachname: Lead");
    expect(hatGedankenstrich(mails[0].text)).toBe(false);
    expect(await counts()).toEqual(before);
    const log = await prisma.auditLog.findFirst({ where: { action: "ppl.test", entityId: subId } });
    expect(log).not.toBeNull();
    expect(JSON.stringify(log!.details)).toContain("kontakt@example.org");
    await new Promise((res) => setTimeout(res, 200));
    expect(slack.length).toBe(slackBefore);
  });
});
