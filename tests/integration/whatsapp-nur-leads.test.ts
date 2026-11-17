// WhatsApp nur für Leads (Ole, 16.11.2026, Sicherheitsauftrag Coexistence, lib/whatsapp/nur-leads.ts):
// Assistent und jede automatische Nachricht nur in Lead-Chats. Unbekannte Kontakte („Neuer Kontakt“) bekommen
// nichts, bis der Vermittler sie als Lead übernimmt. Coexistence-Abgleich (history, smb_app_state_sync) legt
// weder Chats noch Leads an, Echos pausieren den Assistenten.
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
vi.mock("@/lib/push", () => {
  const rec = async () => ({ sent: 0, removed: 0, errors: [] });
  return { sendToAdmins: rec, sendToBuyersOfCustomer: rec, sendToUser: rec };
});
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async () => {
        st.ai++;
        return { content: [{ type: "text", text: "Gern helfe ich Ihnen weiter." }], stop_reason: "end_turn" };
      },
    };
  },
}));
vi.mock("@/lib/whatsapp/erstinfo-pdf", () => ({ sendErstinfoPdf: async () => "already", sendErstinfo: async () => "already" }));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { runBotTurn } from "@/lib/whatsapp/bot";
import { runOutreach } from "@/lib/whatsapp/outreach";
import { sendWhatsAppNotice } from "@/lib/whatsapp/templates";
import { processNewLead } from "@/lib/lead-intake";
import { alsLeadUebernehmen, pruefeAutomatik, WhatsAppKeinLeadError } from "@/lib/whatsapp/nur-leads";
import { leadOrigin } from "@/lib/lead-herkunft";
import { refCodeOf } from "@/lib/empfehlung/shared";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4917${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;

describe("WhatsApp nur für Leads", () => {
  let customerId = "";
  const pnid = `pnid-nl-${uid()}`;
  const business = "4930123456789";

  const value = (extra: Record<string, unknown>) => ({ messaging_product: "whatsapp", metadata: { phone_number_id: pnid, display_phone_number: business }, ...extra });
  const inbound = (from: string, text: string, name = "Kontakt") =>
    handleInboundPayload({
      entry: [{ changes: [{ field: "messages", value: value({ contacts: [{ profile: { name } }], messages: [{ from, id: `wamid.in-${uid()}`, type: "text", text: { body: text } }] }) }] }],
    });
  const conv = (phone: string) => prisma.conversation.findUnique({ where: { customerId_contactPhone: { customerId, contactPhone: phone } } });

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    const c = await makeCustomer({ name: `Agentur Meier ${uid()}`, leadAddress: "sie", empfehlungEnabled: true });
    customerId = c.id;
    await makeBuyer(customerId, "owner");
    await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: true, outreachDelayMin: 0, followUpSequencesEnabled: false, systemPrompt: "Test" } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: pnid, apiKeyEnc: encryptSecret("k") } });
    await prisma.messageTemplate.create({ data: { customerId, name: `pg_outreach_${uid()}`, language: "de", purpose: "outreach", category: "marketing", status: "approved", headerFormat: "DOCUMENT", body: "Guten Tag, hier ist der Assistent. Wie können wir helfen?" } });
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    st.ai = 0;
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
  });

  it("(a) History-Import und Adressbuch: keine Chats, keine Leads, keine Nachrichten, nur die Nummern", async () => {
    const alt = newPhone();
    const kontakt = newPhone();
    const res = await handleInboundPayload({
      entry: [
        {
          changes: [
            {
              field: "history",
              value: value({
                history: [{ metadata: { phase: 0, chunk_order: 1, progress: 100 }, threads: [{ id: alt, messages: [{ from: alt, id: `wamid.hist-${uid()}`, type: "text", text: { body: "Alter privater Chat" } }] }] }],
                // Selbst falls Nachrichten auf oberster Ebene mitkämen: Abgleich wird nie als Nachricht verarbeitet
                messages: [{ from: alt, id: `wamid.hist-${uid()}`, type: "text", text: { body: "Alter privater Chat" } }],
              }),
            },
            { field: "smb_app_state_sync", value: value({ state_sync: [{ type: "contact", action: "add", contact: { full_name: "Oma Erna", phone_number: kontakt }, metadata: { timestamp: "1" } }] }) },
          ],
        },
      ],
    });
    expect(res.errors).toEqual([]);
    expect(await prisma.conversation.count({ where: { customerId, contactPhone: { in: [alt, kontakt] } } })).toBe(0);
    expect(await prisma.lead.count({ where: { customerId, phone: { in: [alt, kontakt] } } })).toBe(0);
    expect(await prisma.message.count({ where: { conversation: { customerId }, body: "Alter privater Chat" } })).toBe(0);
    expect(waSend).not.toHaveBeenCalled();
    expect(st.ai).toBe(0);
    const rows = await prisma.whatsAppAppContact.findMany({ where: { customerId, phone: { in: [alt, kontakt] } }, orderBy: { source: "asc" } });
    expect(rows.map((r) => [r.phone, r.source])).toEqual([
      [kontakt, "contact"],
      [alt, "history"],
    ]);
  });

  it("(b) Unbekannter Kontakt schreibt: kein Assistent, keine Automatik, „Neuer Kontakt“ wartet auf den Vermittler", async () => {
    const phone = newPhone();
    const res = await inbound(phone, "Hallo, sehen wir uns Samstag?", "Freund Max");
    expect(res.errors).toEqual([]);
    const c = await conv(phone);
    expect(c).toMatchObject({ leadId: null, botActive: false, needsAttention: true });
    expect(c!.attentionReason).toMatch(/^Neuer Kontakt: „Hallo, sehen wir uns Samstag\?“/);
    expect(waSend).not.toHaveBeenCalled();
    expect(st.ai).toBe(0);
    expect(await prisma.lead.count({ where: { customerId, phone } })).toBe(0);

    // Auch wenn jemand den Assistenten von Hand anschaltet: runBotTurn sendet ohne Lead nichts
    await prisma.conversation.update({ where: { id: c!.id }, data: { botActive: true } });
    await runBotTurn(c!.id);
    expect(st.ai).toBe(0);
    expect(waSend).not.toHaveBeenCalled();
    await prisma.conversation.update({ where: { id: c!.id }, data: { botActive: false } });

    // Automatische Vorlagen (Nachfassen, Erinnerung, Erstanschreiben) an den unbekannten Kontakt: verweigert
    for (const purpose of ["followup_nudge", "reminder", "outreach", "campaign_review"] as const) {
      await expect(sendWhatsAppNotice({ customerId, to: phone, purpose, params: ["Max"], text: "Hallo" })).rejects.toBeInstanceOf(WhatsAppKeinLeadError);
    }
    // „Stopp“ in einem privaten Chat: keine automatische Bestätigung, keine Sperre
    await inbound(phone, "Stopp");
    expect(waSend).not.toHaveBeenCalled();
    expect((await conv(phone))!.optedOutAt).toBeNull();
  });

  it("(c) Lead aus dem Formular: Erstanschreiben, Antwort, Assistent antwortet", async () => {
    const phone = newPhone();
    const lead = await prisma.lead.create({ data: { customerId, name: "Nina Winter", phone, status: "Neuer Lead" } });
    const r = await runOutreach(customerId, { leadIds: [lead.id] });
    expect(r.sent).toBe(1);
    expect(waSend).toHaveBeenCalledTimes(1);
    expect(waSend.mock.calls[0][0]).toBe("template");
    const c = await conv(phone);
    expect(c).toMatchObject({ leadId: lead.id, botActive: true });

    waSend.mockClear();
    await inbound(phone, "Ja gern, ich habe eine Frage zur Zahnzusatz.", "Nina Winter");
    expect(st.ai).toBeGreaterThan(0);
    expect(waSend.mock.calls.some((x) => x[0] === "text")).toBe(true);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("Im Gespräch");
  });

  it("(c2) Rennen: Kontakt schreibt vor dem Lead-Import, der Assistent antwortet, sobald der Lead da ist", async () => {
    const phone = newPhone();
    await inbound(phone, "Hallo, ich habe gerade das Formular ausgefüllt.", "Paul Rasch");
    expect(st.ai).toBe(0);
    expect(waSend).not.toHaveBeenCalled();
    expect(await conv(phone)).toMatchObject({ botActive: false, leadId: null });

    const lead = await prisma.lead.create({ data: { customerId, name: "Paul Rasch", phone, status: "Neuer Lead" } });
    await processNewLead(lead.id);
    const c = await conv(phone);
    expect(c).toMatchObject({ leadId: lead.id, botActive: true, needsAttention: false });
    expect(st.ai).toBeGreaterThan(0);
    // Antwort im offenen Fenster (Freitext), kein zusätzliches Erstanschreiben als Vorlage
    expect(waSend.mock.calls.some((x) => x[0] === "text")).toBe(true);
    expect(waSend.mock.calls.some((x) => x[0] === "template")).toBe(false);
    // Hat schon geschrieben: Phase „Im Gespräch“, damit entfällt das Erstanschreiben (wie bisher)
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("Im Gespräch");
  });

  it("(d) Echo aus der Business-App pausiert den Assistenten sofort; Echos an private Chats werden nicht gespeichert", async () => {
    const phone = newPhone();
    const lead = await prisma.lead.create({ data: { customerId, name: "Eva Echo", phone, status: "Neuer Lead" } });
    await runOutreach(customerId, { leadIds: [lead.id] });
    expect((await conv(phone))!.botActive).toBe(true);
    waSend.mockClear();

    const echoId = `wamid.echo-${uid()}`;
    await handleInboundPayload({
      entry: [{ changes: [{ field: "smb_message_echoes", value: value({ message_echoes: [{ from: business, to: phone, id: echoId, type: "text", text: { body: "Ich melde mich gleich selbst." } }] }) }] }],
    });
    const c = await conv(phone);
    expect(c!.botActive).toBe(false);
    expect(await prisma.message.findUnique({ where: { waMessageId: echoId } })).toMatchObject({ direction: "outbound", sentBy: "app" });

    await inbound(phone, "Super, danke!", "Eva Echo");
    expect(st.ai).toBe(0);
    expect(waSend).not.toHaveBeenCalled();
    expect((await conv(phone))!.attentionReason).toMatch(/^Neue Nachricht/);

    // Echo an eine private Nummer (kein Chat, kein Lead): nichts gespeichert
    const privat = newPhone();
    const pid = `wamid.echo-${uid()}`;
    await handleInboundPayload({
      entry: [{ changes: [{ field: "smb_message_echoes", value: value({ message_echoes: [{ from: business, to: privat, id: pid, type: "text", text: { body: "Bis später, Schatz" } }] }) }] }],
    });
    expect(await conv(privat)).toBeNull();
    expect(await prisma.message.findUnique({ where: { waMessageId: pid } })).toBeNull();
  });

  it("(e) Schalter „Assistent auch für neue Kontakte“: antwortet neuen Nummern, nie Kontakten aus der Business-App", async () => {
    await prisma.agentConfig.update({ where: { customerId }, data: { newContactsBot: true } });
    try {
      const phone = newPhone();
      await inbound(phone, "Guten Tag, ich suche eine Hundeversicherung.", "Neu Kunde");
      expect(await conv(phone)).toMatchObject({ botActive: true, leadId: null });
      expect(st.ai).toBeGreaterThan(0);
      expect(waSend.mock.calls.some((x) => x[0] === "text")).toBe(true);

      // Kontakt aus dem Adressbuch der Business-App (Coexistence): bleibt privat
      st.ai = 0;
      waSend.mockClear();
      const app = newPhone();
      await handleInboundPayload({
        entry: [{ changes: [{ field: "smb_app_state_sync", value: value({ state_sync: [{ type: "contact", action: "add", contact: { full_name: "Tante", phone_number: app } }] }) }] }],
      });
      await inbound(app, "Hallo, alles gut bei dir?", "Tante");
      expect(await conv(app)).toMatchObject({ botActive: false, leadId: null });
      expect(st.ai).toBe(0);
      expect(waSend).not.toHaveBeenCalled();
    } finally {
      await prisma.agentConfig.update({ where: { customerId }, data: { newContactsBot: false } });
    }
  });

  it("(f) „Als Lead übernehmen“: Lead (eigener Kontakt) angelegt, Assistent an, offene Nachricht beantwortet", async () => {
    const phone = newPhone();
    await inbound(phone, "Hallo, mein Nachbar meinte, Sie helfen bei Versicherungen.", "Lisa Nachbar");
    expect(st.ai).toBe(0);
    const before = await conv(phone);
    const r = await alsLeadUebernehmen({ conversationId: before!.id, customerId, userId: null });
    expect(r.ok).toBe(true);
    const c = await conv(phone);
    expect(c).toMatchObject({ botActive: true, needsAttention: false });
    expect(c!.leadId).toBeTruthy();
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: c!.leadId! } });
    expect(lead).toMatchObject({ phone, name: "Lisa Nachbar", adChannel: "Eigener Kontakt", outreachStatus: "skipped_contact" });
    expect(leadOrigin(lead)).toBe("eigen");
    expect(st.ai).toBeGreaterThan(0);
    expect(waSend.mock.calls.some((x) => x[0] === "text")).toBe(true);
    expect(waSend.mock.calls.some((x) => x[0] === "template")).toBe(false);
    // Fremder Kunde: nicht möglich
    expect(await alsLeadUebernehmen({ conversationId: before!.id, customerId: "fremd", userId: null })).toMatchObject({ ok: false });
  });

  it("(g) Empfehlungs-Code „(Ref …)“: Lead „Empfehlung“, der Assistent antwortet wie bisher", async () => {
    const link = await prisma.referralLink.create({ data: { customerId, token: `tok${uid()}${uid()}`, kind: "general" } });
    const phone = newPhone();
    await inbound(phone, `Hallo, ich komme auf Empfehlung und würde gern mit Ihnen sprechen. (Ref ${refCodeOf(link.token)})`, "Ref Kontakt");
    const c = await conv(phone);
    expect(c!.leadId).toBeTruthy();
    expect(c!.botActive).toBe(true);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: c!.leadId! } });
    expect(lead.source).toBe("Empfehlung");
    expect(st.ai).toBeGreaterThan(0);
    expect(waSend.mock.calls.some((x) => x[0] === "text")).toBe(true);
  });

  it("Support-Nummer: keine automatischen Vorlagen", async () => {
    await expect(pruefeAutomatik({ customerId: SUPPORT_CUSTOMER_ID, to: "4915112345678", purpose: "reminder", leadId: null, conversationId: null })).rejects.toBeInstanceOf(WhatsAppKeinLeadError);
  });
});
