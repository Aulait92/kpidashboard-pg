// Testlead (Ole, 16.11.2026, lib/testlead.ts) gegen eine echte Datenbank, WhatsApp, Push und KI gemockt:
// echter Ablauf (processNewLead → Erstanschreiben, Antwort → Assistent), Rückfrage bei echten Kunden, Einrichtungsschritt,
// Logzeilen ohne Nummern, frischer Chat bei erneutem Test, zählt nicht in Zahlen und Umsatz, nie an Meta, löschbar.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = { ai: 0 };
const waSend = vi.fn();
vi.mock("@/lib/whatsapp/dialog360", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/dialog360")>();
  return {
    ...real,
    sendText: (...a: unknown[]) => waSend("text", ...a),
    sendTemplate: (...a: unknown[]) => waSend("template", ...a),
    sendButtons: (...a: unknown[]) => waSend("buttons", ...a),
    sendDocument: (...a: unknown[]) => waSend("document", ...a),
  };
});
const pushes: unknown[] = [];
vi.mock("@/lib/push", () => {
  const rec = async (...a: unknown[]) => {
    pushes.push(a);
    return { sent: 1, removed: 0, errors: [] };
  };
  return { sendToAdmins: rec, sendToBuyersOfCustomer: rec, sendToUser: rec };
});
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async () => {
        st.ai++;
        return { content: [{ type: "text", text: "Danke, wann passt Ihnen ein kurzes Telefonat?" }], stop_reason: "end_turn" };
      },
    };
  },
}));
vi.mock("@/lib/whatsapp/erstinfo-pdf", () => ({ sendErstinfoPdf: async () => "already", sendErstinfo: async () => "already" }));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { createTestLead, deleteTestLead, testLeadProducts } from "@/lib/testlead";
import { alsLeadUebernehmen } from "@/lib/whatsapp/nur-leads";
import { computeKpis } from "@/lib/kpis";
import { detectForCustomer, sendDue } from "@/lib/capi/server";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4917${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;
const ADMIN = { id: null, email: "admin@test.local", role: "ADMIN" };
const D = 86_400_000;

describe("Testlead", () => {
  let customerId = "";
  const pnid = `pnid-tl-${uid()}`;
  const logs: string[] = [];
  let logSpy: ReturnType<typeof vi.spyOn>;

  const inbound = (from: string, text: string) =>
    handleInboundPayload({
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: { messaging_product: "whatsapp", metadata: { phone_number_id: pnid, display_phone_number: "4930123456789" }, contacts: [{ profile: { name: "Ole" } }], messages: [{ from, id: `wamid.in-${uid()}`, type: "text", text: { body: text } }] },
            },
          ],
        },
      ],
    });

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    process.env.APP_URL ||= "http://localhost:3000";
    const c = await makeCustomer({ name: `Agentur Test ${uid()}`, leadAddress: "sie", capiEnabled: true, metaDatasetId: "998877665544332" });
    customerId = c.id;
    await makeBuyer(customerId, "owner");
    await prisma.onboarding.create({ data: { customerId } });
    await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: true, outreachDelayMin: 0, followUpSequencesEnabled: false, systemPrompt: "Test" } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: pnid, apiKeyEnc: encryptSecret("k") } });
    await prisma.messageTemplate.create({ data: { customerId, name: `pg_outreach_${uid()}`, language: "de", purpose: "outreach", category: "marketing", status: "approved", headerFormat: "DOCUMENT", body: "Guten Tag {{1}}, hier ist der Assistent. Wie können wir helfen?" } });
    logSpy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(" ")));
  });
  afterAll(async () => {
    logSpy.mockRestore();
    await cleanupCustomer(customerId);
  });
  beforeEach(() => {
    st.ai = 0;
    logs.length = 0;
    pushes.length = 0;
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
  });

  it("echter Kunde: ohne Häkchen „Verstanden, an echten Kunden senden“ kein Lead", async () => {
    const phone = newPhone();
    const r = await createTestLead({ customerId, name: "Test Lead", product: "PKV Wechsel", phone }, ADMIN);
    expect(r).toEqual({ ok: false, error: "Echter Kunde: Bitte „Verstanden, an echten Kunden senden“ anhaken.", needsConfirm: true });
    expect(await prisma.lead.count({ where: { customerId, phone } })).toBe(0);
    expect(waSend).not.toHaveBeenCalled();
  });

  it("läuft durch den echten Ablauf: Push, Erstanschreiben (Vorlage), Antwort → Assistent; Logzeilen ohne Nummer", async () => {
    const phone = newPhone();
    const r = await createTestLead({ customerId, name: "", product: "PKV Wechsel", phone, confirmed: true }, ADMIN);
    expect(r).toMatchObject({ ok: true, outreach: "WhatsApp-Erstanschreiben ist raus." });
    if (!r.ok) return;
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: r.leadId } });
    expect(lead).toMatchObject({ isTest: true, name: "Test Lead", source: "PKV Wechsel", phone, outreachStatus: "sent", externalId: null });
    expect(await prisma.revenue.count({ where: { leadId: lead.id } })).toBe(0);
    expect(pushes.length).toBeGreaterThan(0);
    // Fenster zu: Erstanschreiben als Vorlage an die eigene Nummer
    expect(waSend).toHaveBeenCalledWith("template", "k", phone, expect.any(String), "de", expect.anything());
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { customerId_contactPhone: { customerId, contactPhone: phone } } });
    expect(conv.leadId).toBe(lead.id);
    // Einrichtungsschritt „Testlead durchgespielt“
    expect((await prisma.onboarding.findUniqueOrThrow({ where: { customerId } })).testLeadAt).not.toBeNull();

    // Antwort von der eigenen Nummer → Assistent antwortet
    waSend.mockClear();
    await inbound(phone, "Hallo, ja gern");
    expect(st.ai).toBeGreaterThan(0);
    expect(waSend).toHaveBeenCalledWith("text", "k", phone, expect.any(String));

    const mine = logs.filter((l) => l.startsWith(`[testlead ${lead.id}]`));
    for (const step of ["intake", "process", "notify push", "outreach sent", "bot turn", "bot reply sent"]) {
      expect(mine.some((l) => l.includes(`] ${step}`))).toBe(true);
    }
    expect(mine.find((l) => l.includes("outreach sent"))).toMatch(/waMessageId=wamid\.out-/);
    expect(mine.join("\n")).not.toContain(phone);
    expect(mine.join("\n")).not.toContain("Hallo, ja gern");
  });

  it("offenes Fenster: Erstanschreiben als Sitzungsnachricht; erneuter Test ersetzt den vorigen und beginnt den Chat frisch", async () => {
    const phone = newPhone();
    // Admin schreibt zuerst selbst an die Nummer des Kunden (öffnet das 24-Stunden-Fenster): „Neuer Kontakt“
    await inbound(phone, "Hallo");
    const first = await createTestLead({ customerId, name: "Ole", product: "Zahnzusatz", phone, confirmed: true }, ADMIN);
    expect(first.ok).toBe(true);
    expect(waSend.mock.calls.some((c) => c[0] === "template")).toBe(false);
    expect(waSend.mock.calls.some((c) => (c[0] === "text" || c[0] === "buttons") && c[2] === phone)).toBe(true);

    waSend.mockClear();
    const second = await createTestLead({ customerId, name: "Ole", product: "Zahnzusatz", phone, confirmed: true }, ADMIN);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(await prisma.lead.count({ where: { id: first.leadId } })).toBe(0);
    const conv = await prisma.conversation.findUniqueOrThrow({ where: { customerId_contactPhone: { customerId, contactPhone: phone } }, include: { messages: true } });
    expect(conv.leadId).toBe(second.leadId);
    expect(conv.windowExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    // Verlauf frisch: nur das neue Erstanschreiben
    expect(conv.messages.filter((m) => m.direction === "inbound")).toHaveLength(0);
    expect(conv.messages.filter((m) => m.direction === "outbound").length).toBeGreaterThan(0);
    expect(waSend).toHaveBeenCalled();
  });

  it("Nummer eines echten Leads: abgebrochen; echte Leads lassen sich so nicht löschen", async () => {
    const phone = newPhone();
    const real = await prisma.lead.create({ data: { customerId, phone, name: "Echt", source: "PKV Wechsel", status: "Neuer Lead", outreachAt: new Date() } });
    const r = await createTestLead({ customerId, product: "PKV Wechsel", phone, confirmed: true }, ADMIN);
    expect(r).toMatchObject({ ok: false });
    expect(await deleteTestLead(real.id, { customerId })).toEqual({ ok: false, error: "Nur Testleads lassen sich löschen." });
    await prisma.lead.delete({ where: { id: real.id } });
  });

  it("zählt nicht in Zahlen (Leads, Kosten pro Lead) und Umsatz, nie an Meta", async () => {
    const range = { from: new Date(Date.now() - D), to: new Date(Date.now() + D) };
    const before = await computeKpis({ range, customerId, origin: "paid" });
    const beforeAll = await computeKpis({ range, customerId });
    const real = await prisma.lead.create({ data: { customerId, phone: newPhone(), name: "Echt", source: "PKV Wechsel", status: "Neuer Lead", outreachAt: new Date() } });
    await prisma.revenue.create({ data: { customerId, leadId: real.id, amount: 40, occurredAt: new Date() } });
    const metaId = `1${String(Date.now()).slice(-9)}${String(++seq).padStart(6, "0")}`;
    const test = await prisma.lead.create({ data: { customerId, isTest: true, externalId: metaId, phone: newPhone(), name: "Test", source: "PKV Wechsel", status: "Termin vereinbart", reached: true, outreachAt: new Date() } });
    await prisma.revenue.create({ data: { customerId, leadId: test.id, amount: 99, occurredAt: new Date() } });

    const after = await computeKpis({ range, customerId, origin: "paid" });
    const afterAll = await computeKpis({ range, customerId });
    expect(after.totalLeads).toBe(before.totalLeads + 1);
    expect(afterAll.totalLeads).toBe(beforeAll.totalLeads + 1);
    expect(Number(after.revenue) - Number(before.revenue)).toBe(40);

    // Meta-Rückmeldung: Stufen eines Testleads werden nie erkannt, ein Ereignis im Postausgang wird übersprungen
    process.env.META_ACCESS_TOKEN = "EAAtesttoken0123456789abcdef";
    vi.stubGlobal("fetch", async (u: string) => {
      throw new Error(`Unerwarteter Aufruf: ${u}`);
    });
    await detectForCustomer(customerId);
    expect(await prisma.capiEvent.count({ where: { leadId: test.id } })).toBe(0);
    await prisma.capiEvent.create({ data: { customerId, leadId: test.id, stage: "lead", eventTime: new Date(), status: "queued" } });
    await sendDue();
    expect(await prisma.capiEvent.findFirst({ where: { leadId: test.id }, select: { status: true, error: true } })).toEqual({ status: "skipped", error: "Testlead" });
    vi.unstubAllGlobals();
    delete process.env.META_ACCESS_TOKEN;

    // Löschen entfernt Lead, Chats und Postausgang
    expect(await deleteTestLead(test.id, { customerId })).toEqual({ ok: true, customerId });
    expect(await prisma.lead.count({ where: { id: test.id } })).toBe(0);
    expect(await prisma.capiEvent.count({ where: { leadId: test.id } })).toBe(0);
  });
});

describe("Testlead bei Testkunden und internen Kunden (Ole, 17.11.2026)", () => {
  const ids: string[] = [];
  const product = `Katzenkrankenversicherung ${uid()}`;
  let productId = "";
  let otherId = "";

  beforeAll(async () => {
    requireTestDb();
    productId = (await prisma.product.create({ data: { name: product, active: true } })).id;
    otherId = (await makeCustomer({ name: `Anderer ${uid()}` })).id;
    ids.push(otherId);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterAll(async () => {
    for (const id of ids) await cleanupCustomer(id);
    await prisma.product.delete({ where: { id: productId } }).catch(() => {});
  });

  it.each([
    ["Testkunde", { isTest: true }],
    ["interner Kunde", { plan: "internal" }],
  ])("%s: alle aktiven Produkte wählbar, ohne Bestätigung, ohne Buchung; echter Lead derselben Nummer wird ersetzt", async (_l, extra) => {
    const c = await makeCustomer({ name: `Ole Agentur ${uid()}`, ...extra });
    ids.push(c.id);
    expect(await testLeadProducts(c.id)).toContain(product);

    const phone = newPhone();
    const real = await prisma.lead.create({ data: { customerId: c.id, phone, name: "Echt", source: "PKV Wechsel", status: "Neuer Lead", outreachAt: new Date() } });
    const otherLeads = await prisma.lead.count({ where: { customerId: otherId } });
    const r = await createTestLead({ customerId: c.id, product, phone }, ADMIN);
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(await prisma.lead.count({ where: { id: real.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "lead.test_mark", entityId: real.id } })).toBe(1);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: r.leadId } });
    expect(lead).toMatchObject({ isTest: true, source: product, customerId: c.id });
    expect(lead.formData).toEqual(expect.arrayContaining([{ label: "Tierart", value: "Katze" }]));
    expect(await prisma.customerProduct.count({ where: { customerId: c.id } })).toBe(0);
    expect(await prisma.revenue.count({ where: { customerId: c.id } })).toBe(0);
    expect(await prisma.lead.count({ where: { customerId: otherId } })).toBe(otherLeads);
  });

  it("eingehender Chat beim Testkunden: „Als Lead übernehmen“ legt einen Testlead an, beim echten Kunden nicht", async () => {
    for (const [extra, isTest] of [[{ isTest: true }, true], [{}, false]] as const) {
      const c = await makeCustomer({ name: `Sandbox ${uid()}`, ...extra });
      ids.push(c.id);
      const conv = await prisma.conversation.create({ data: { customerId: c.id, contactPhone: newPhone(), contactName: "Ole" } });
      const r = await alsLeadUebernehmen({ conversationId: conv.id, customerId: c.id, userId: null });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: r.leadId } })).isTest).toBe(isTest);
    }
  });
});
