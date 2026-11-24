// Rangfolge Name (Ole, 19.11.2026, lib/lead-name.ts): von Hand geändert > Leadformular > WhatsApp-Profilname.
// Neue Anfrage mit derselben Nummer: neuer Name gilt (gleicher Kontakt, Verlauf), anderer Nachname: eigener Lead mit Chat.
// Platzhalternamen, keine echten Personen.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
    messages = { create: async () => ({ content: [{ type: "text", text: "Gern." }], stop_reason: "end_turn" }) };
  },
}));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { ingestLead, type IncomingLead } from "@/lib/lead-intake";
import { ansprechpartner } from "@/lib/lead-anrede";
import { kontaktParts } from "@/lib/ansprache";
import { chatFuerNeueAnfrageFrei } from "@/lib/lead-name-server";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 10);
let seq = 0;
const newPhone = () => `4917${String(Date.now()).slice(-6)}${String(++seq).padStart(3, "0")}`;

describe("Lead-Name: Rangfolge und neue Anfrage mit derselben Nummer", () => {
  let customerId = "";
  const pnid = `pnid-ln-${uid()}`;
  const formId = `form-ln-${uid()}`;

  const inc = (fields: Record<string, string>): IncomingLead => ({
    externalId: `ext-ln-${uid()}`,
    formId,
    pageId: "page-1",
    createdAt: new Date().toISOString(),
    campaignName: "Test",
    adName: null,
    fields,
  });
  const inbound = (from: string, text: string, profil: string) =>
    handleInboundPayload({
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: pnid, display_phone_number: "4930123456789" },
                contacts: [{ profile: { name: profil } }],
                messages: [{ from, id: `wamid.in-${uid()}`, type: "text", text: { body: text } }],
              },
            },
          ],
        },
      ],
    });
  const conv = (phone: string) => prisma.conversation.findUniqueOrThrow({ where: { customerId_contactPhone: { customerId, contactPhone: phone } } });
  const verlauf = async (leadId: string) => (await prisma.leadHistory.findMany({ where: { leadId } })).map((h) => h.text).join("\n");

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    customerId = (await makeCustomer({ leadAddress: "sie" })).id;
    // Assistent aus: es geht um Namen, nicht um Antworten
    await prisma.agentConfig.create({ data: { customerId, active: false, outreachEnabled: false, outreachDelayMin: 30 } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: pnid, apiKeyEnc: encryptSecret("k") } });
    await prisma.leadSource.create({ data: { formId, customerId, productKey: "Tierkranken" } });
  });
  afterAll(async () => {
    await prisma.lead.deleteMany({ where: { customerId } });
    await prisma.leadSource.deleteMany({ where: { customerId } });
    await cleanupCustomer(customerId);
  });
  beforeEach(() => {
    waSend.mockReset();
    waSend.mockImplementation(async () => ({ messageId: `wamid.out-${uid()}`, raw: {} }));
  });

  it("Profilname überschreibt den Formularnamen nicht (Chat davor und danach), Bot-Anrede aus dem Formular", async () => {
    const phone = newPhone();
    // Chat gab es schon (Profilname), dann kommt der Lead aus dem Formular
    await inbound(phone, "Hallo", "Profilname");
    expect((await conv(phone)).contactName).toBe("Profilname");
    const res = await ingestLead(inc({ full_name: "Max Platzhalter", phone_number: `+${phone}` }), "meta");
    expect(res.status).toBe("created");
    const c1 = await conv(phone);
    expect(c1.leadId).toBe(res.leadId);
    expect(c1.contactName).toBe("Max Platzhalter");

    // Weitere Nachricht mit Profilname: Name bleibt
    await inbound(phone, "Noch eine Frage", "Profilname");
    const c2 = await conv(phone);
    expect(c2.contactName).toBe("Max Platzhalter");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: res.leadId! } })).name).toBe("Max Platzhalter");

    // Anrede wie im Assistenten (bot.ts: ansprechpartner mit dem Namen am Chat als Rückfall)
    const who = await ansprechpartner({ customerId, leadId: c2.leadId, phone, name: "Profilname" });
    const k = kontaktParts(who.kontakt);
    expect(k.last).toBe("Platzhalter");
    expect(k.salutation).toBe("Herr");
  });

  it("Chat ohne Lead: Profilname füllt (sonst gibt es keinen Namen)", async () => {
    const phone = newPhone();
    await inbound(phone, "Hallo", "Nur Profil");
    expect((await conv(phone)).contactName).toBe("Nur Profil");
    await inbound(phone, "Hallo", "Neues Profil");
    expect((await conv(phone)).contactName).toBe("Neues Profil");
  });

  it("neue Anfrage, gleiche Nummer, alter Name ohne Nachnamen: gleicher Kontakt, Name der neuen Anfrage gilt, Verlauf", async () => {
    const phone = newPhone();
    const first = await ingestLead(inc({ full_name: "Tester", phone_number: `+${phone}`, anrede: "Frau" }), "meta");
    await inbound(phone, "Hallo", "Tester");
    await prisma.conversation.update({ where: { id: (await conv(phone)).id }, data: { qualified: true, qualificationSummary: "bisher" } });

    const res = await ingestLead(inc({ full_name: "Max Platzhalter", phone_number: `+${phone}` }), "meta");
    expect(res).toEqual({ status: "reentry", leadId: first.leadId });
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: first.leadId! } });
    expect(l.name).toBe("Max Platzhalter");
    expect(await prisma.lead.count({ where: { customerId, phone } })).toBe(1);
    expect(await verlauf(l.id)).toContain("Neue Anfrage als Max Platzhalter (vorher: Tester).");
    expect(l.formData).toContainEqual({ label: "Name vorher", value: "Tester" });
    const c = await conv(phone);
    expect(c.contactName).toBe("Max Platzhalter");
    expect(c.leadId).toBe(l.id);
    // Alte Anrede „Frau“ gilt nicht für den neuen Namen: Anrede aus dem neuen Vornamen
    const k = kontaktParts((await ansprechpartner({ customerId, leadId: l.id, phone, name: c.contactName })).kontakt);
    expect(k.salutation).toBe("Herr");
    expect(k.last).toBe("Platzhalter");
    // Profilname danach ändert nichts
    await inbound(phone, "Danke", "Tester");
    expect((await conv(phone)).contactName).toBe("Max Platzhalter");
  });

  it("von Hand geänderter Name bleibt: weder neue Anfrage (gleicher Nachname) noch Profilname ändern ihn", async () => {
    const phone = newPhone();
    const first = await ingestLead(inc({ full_name: "Erika Beispiel", phone_number: `+${phone}` }), "meta");
    await prisma.lead.update({ where: { id: first.leadId! }, data: { name: "Erika Beispiel-Korrigiert", contactEditedAt: new Date() } });
    await inbound(phone, "Hallo", "Profilname");
    expect((await conv(phone)).contactName).toBe("Erika Beispiel-Korrigiert");

    const res = await ingestLead(inc({ full_name: "Eri Beispiel", phone_number: `+${phone}` }), "meta");
    expect(res.status).toBe("reentry");
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: first.leadId! } });
    expect(l.name).toBe("Erika Beispiel-Korrigiert");
    expect(l.formData).toContainEqual({ label: "Name in der neuen Eintragung", value: "Eri Beispiel" });
    expect(await verlauf(l.id)).toContain("von Hand geänderte Name Erika Beispiel-Korrigiert bleibt");
    expect((await conv(phone)).contactName).toBe("Erika Beispiel-Korrigiert");
  });

  it("anderer Nachname: eigener Lead, der Chat gehört zur neuen Anfrage, Gespräch von vorn, alter Lead bleibt", async () => {
    const phone = newPhone();
    const first = await ingestLead(inc({ full_name: "Max Platzhalter", phone_number: `+${phone}` }), "meta");
    await inbound(phone, "Hallo", "Profilname");
    const c0 = await conv(phone);
    await prisma.conversation.update({ where: { id: c0.id }, data: { qualified: true, qualificationSummary: "bisher", qualificationData: { interesse: "Hund" } } });

    const res = await ingestLead(inc({ full_name: "Erika Beispiel", phone_number: `+${phone}` }), "meta");
    expect(res.status).toBe("created");
    expect(res.leadId).not.toBe(first.leadId);
    const alt = await prisma.lead.findUniqueOrThrow({ where: { id: first.leadId! } });
    expect(alt.name).toBe("Max Platzhalter");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: res.leadId! } })).name).toBe("Erika Beispiel");

    const c = await conv(phone);
    expect(c.id).toBe(c0.id);
    expect(c.leadId).toBe(res.leadId);
    expect(c.contactName).toBe("Erika Beispiel");
    expect(c.qualified).toBe(false);
    expect(c.qualificationSummary).toBeNull();
    expect(c.qualificationData).toBeNull();
    expect(await prisma.message.count({ where: { conversationId: c.id, direction: "inbound" } })).toBe(1);
    expect(await prisma.message.count({ where: { conversationId: c.id, kind: "neue_anfrage" } })).toBe(1);
    expect(await chatFuerNeueAnfrageFrei(c.id, res.leadId!)).toBe(true);
    expect(await verlauf(alt.id)).toContain("Neue Anfrage mit derselben Nummer als Erika Beispiel: eigener Kontakt angelegt.");
    expect(await verlauf(res.leadId!)).toContain("dieselbe Nummer wie Max Platzhalter");
    // Profilname danach ändert den Namen nicht
    await inbound(phone, "Hallo", "Profilname");
    expect((await conv(phone)).contactName).toBe("Erika Beispiel");
    expect(await chatFuerNeueAnfrageFrei(c.id, res.leadId!)).toBe(false);
  });

  it("anderer Nachname, aber Termin des bisherigen Leads steht aus: Chat bleibt dort, Vermittler bekommt Hinweis", async () => {
    const phone = newPhone();
    const first = await ingestLead(inc({ full_name: "Max Platzhalter", phone_number: `+${phone}` }), "meta");
    await inbound(phone, "Hallo", "Profilname");
    const c0 = await conv(phone);
    await prisma.appointment.create({
      data: { customerId, leadId: first.leadId!, conversationId: c0.id, mode: "phone", status: "booked", startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 86400000 + 1800000) },
    });

    const res = await ingestLead(inc({ full_name: "Erika Beispiel", phone_number: `+${phone}` }), "meta");
    expect(res.status).toBe("created");
    const c = await conv(phone);
    expect(c.leadId).toBe(first.leadId);
    expect(c.contactName).toBe("Max Platzhalter");
    expect(c.needsAttention).toBe(true);
    expect(c.attentionReason).toContain("Erika Beispiel");
    expect(await prisma.appointment.count({ where: { leadId: first.leadId!, status: "booked" } })).toBe(1);
    expect(await verlauf(res.leadId!)).toContain("bis dessen Termin vorbei ist");
  });
});
