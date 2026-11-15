// Leads ohne WhatsApp sofort zum Vermittler (Ole, 15.11.2026): Status „failed“ 131026 auf das Erstanschreiben
// → Lead markiert, Assistent aus, Push, E-Mail genau einmal, ganz oben auf der Anrufliste. Andere Codes auf das
// Erstanschreiben → sofort auf die Anrufliste plus Admin-Alarm (einmal je Kunde/Code/Tag). 131050 → Abmeldung.
// Kampagnen-Empfänger mit 131026 → künftig nur E-Mail, mit 131050 → WhatsApp-Einwilligung „nein“.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const pushes: Array<{ to: string; title: string; body: string; url?: string }> = [];
vi.mock("@/lib/push", () => ({
  sendToAdmins: vi.fn(async (p: { title: string; body: string; url?: string }) => {
    pushes.push({ to: "admins", ...p });
    return { sent: 1, removed: 0, errors: [] };
  }),
  sendToBuyersOfCustomer: vi.fn(async (_c: string, p: { title: string; body: string; url?: string }) => {
    pushes.push({ to: "buyers", ...p });
    return { sent: 1, removed: 0, errors: [] };
  }),
  sendToUser: vi.fn(async (u: string, p: { title: string; body: string; url?: string }) => {
    pushes.push({ to: u, ...p });
    return { sent: 1, removed: 0, errors: [] };
  }),
}));
const mails: Array<{ userId: string; to: string; subject: string; text: string }> = [];
vi.mock("@/lib/mail/postfach", async (orig) => {
  const real = await orig<typeof import("@/lib/mail/postfach")>();
  return {
    ...real,
    sendViaPostfach: vi.fn(async (userId: string, m: { to: string; subject: string; text: string }) => {
      mails.push({ userId, ...m });
      return { ok: true as const, from: "berater@test.local" };
    }),
  };
});
const waSend = vi.fn();
vi.mock("@/lib/whatsapp/dialog360", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/dialog360")>();
  return { ...real, sendTemplate: (...a: unknown[]) => waSend(...a), sendText: (...a: unknown[]) => waSend(...a), sendButtons: (...a: unknown[]) => waSend(...a) };
});
vi.mock("@/lib/whatsapp/bot", () => ({ runBotTurn: vi.fn(async () => {}) }));

import { prisma } from "@/lib/prisma";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { getCallbackLeads } from "@/lib/whatsapp/outreach";
import { sendWhatsAppNotice } from "@/lib/whatsapp/templates";
import { WhatsAppUnavailableError } from "@/lib/whatsapp/stopp";
import { restartSilentSequence } from "@/lib/lead-sequences";
import { keinWhatsAppQuote } from "@/lib/whatsapp/kein-whatsapp";
import { encryptSecret } from "@/lib/encryption";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 10);
const failed = (pnid: string, id: string, code: number, title: string) => ({
  entry: [{ changes: [{ value: { metadata: { phone_number_id: pnid }, statuses: [{ id, status: "failed", recipient_id: "x", errors: [{ code, title }] }] } }] }],
});

describe("Kein WhatsApp", () => {
  let customerId = "";
  let ownerId = "";
  const pnid = `pnid-kwa-${uid()}`;
  let n = 0;

  /** Lead mit Erstanschreiben (Vorlage, purpose outreach) wie nach runOutreach. */
  async function leadWithOutreach(extra: Record<string, unknown> = {}) {
    const phone = `4915200${String(++n).padStart(5, "0")}${Math.floor(Math.random() * 9)}`;
    const lead = await prisma.lead.create({
      data: { customerId, name: "Nina Winter", phone, email: `nina${n}@example.org`, source: "Zahnzusatzversicherung", status: "Neuer Lead", outreachAt: new Date(), outreachStatus: "sent", ...extra },
    });
    const conv = await prisma.conversation.create({ data: { customerId, contactPhone: phone, leadId: lead.id, botActive: true, status: "open", lastMessageAt: new Date() } });
    const wamid = `wamid.kwa-${uid()}`;
    await prisma.message.create({ data: { conversationId: conv.id, direction: "outbound", kind: "template", body: "Hallo", waMessageId: wamid, status: "sent", sentBy: "system", purpose: "outreach_zahn" } });
    return { lead, conv, wamid };
  }

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    customerId =(await makeCustomer({ leadAddress: "sie" })).id;
    ownerId = (await makeBuyer(customerId, "owner")).id;
    await prisma.mailConnection.create({ data: { userId: ownerId, customerId, provider: "smtp", email: "berater@test.local", fromName: "Anna Berater" } });
    await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: true, followUpSequencesEnabled: true } });
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: pnid, apiKeyEnc: encryptSecret("k") } });
  });
  afterAll(() => cleanupCustomer(customerId));
  beforeEach(() => {
    pushes.length = 0;
    mails.length = 0;
    waSend.mockReset();
    waSend.mockResolvedValue({ messageId: `wamid.out-${uid()}` });
  });

  it("131026 auf das Erstanschreiben: Lead markiert, Assistent aus, Push, E-Mail einmal, oben auf der Anrufliste", async () => {
    // Ein älterer Rückruf-Fall steht schon auf der Liste
    const old = await prisma.lead.create({ data: { customerId, name: "Alt Fall", phone: "4915299999991", status: "Neuer Lead", createdAt: new Date(Date.now() - 3 * 86_400_000), outreachAt: new Date(Date.now() - 2 * 86_400_000), outreachStatus: "sent" } });
    const { lead, conv, wamid } = await leadWithOutreach();
    await restartSilentSequence(lead.id);
    expect(await prisma.leadSequence.count({ where: { leadId: lead.id, stoppedAt: null } })).toBe(1);

    const res = await handleInboundPayload(failed(pnid, wamid, 131026, "Message undeliverable"));
    expect(res.errors).toEqual([]);

    const msg = await prisma.message.findUniqueOrThrow({ where: { waMessageId: wamid } });
    expect(msg).toMatchObject({ status: "failed", errorCode: 131026, errorTitle: "Message undeliverable" });
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(l.waUnavailableAt).not.toBeNull();
    expect(l.waUnavailableMailAt).not.toBeNull();
    expect(l.outreachStatus).toBe("no_whatsapp");
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } })).botActive).toBe(false);
    expect(await prisma.leadSequence.count({ where: { leadId: lead.id, stoppedAt: null } })).toBe(0);

    // Push an den Inhaber (kein Berater zugeteilt → alle Logins des Kunden)
    const p = pushes.find((x) => x.title.startsWith("Sofort anrufen"));
    expect(p).toMatchObject({ to: "buyers", title: "Sofort anrufen: Nina Winter hat kein WhatsApp", url: `/buyer/leads/${lead.id}` });
    expect(p!.body).toContain("+49 152");
    expect(pushes.some((x) => x.to === "admins")).toBe(false);

    // E-Mail über das Postfach des Inhabers, Sie-Form, neutral ohne bekannte Anrede, ohne Gedankenstriche
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ userId: ownerId, to: lead.email, subject: "Kurz zu Ihrer Zahnzusatzversicherung" });
    expect(mails[0].text.startsWith("Guten Tag,")).toBe(true);
    expect(mails[0].text).toMatch(/Antworten Sie gern|Termin wählen/);
    expect(mails[0].text).not.toMatch(/[–—]/);
    expect(await prisma.leadHistory.count({ where: { leadId: lead.id, kind: "email" } })).toBe(1);

    // Ganz oben auf der Anrufliste, mit Grund
    const list = await getCallbackLeads(customerId);
    expect(list[0]).toMatchObject({ id: lead.id, reason: "Kein WhatsApp: bitte direkt anrufen", urgent: true });
    expect(list.some((c) => c.id === old.id && !c.urgent)).toBe(true);

    // Kein weiteres WhatsApp an den Lead (Nachfassen, Erinnerungen …), kein Neustart des Nachfassens
    await expect(
      sendWhatsAppNotice({ customerId, to: lead.phone!, purpose: "followup_nudge", params: ["Nina"], text: "Hallo", leadId: lead.id }),
    ).rejects.toBeInstanceOf(WhatsAppUnavailableError);
    expect(waSend).not.toHaveBeenCalled();
    expect(await restartSilentSequence(lead.id)).toBeNull();

    // Doppelter Webhook: keine zweite E-Mail, kein zweiter Push
    pushes.length = 0;
    await handleInboundPayload(failed(pnid, wamid, 131026, "Message undeliverable"));
    expect(mails).toHaveLength(1);
    expect(pushes).toHaveLength(0);

    const q = await keinWhatsAppQuote({ customerId });
    expect(q.noWhatsApp).toBe(1);
    expect(q.attempted).toBeGreaterThanOrEqual(2);
  });

  it("zugeteilter Berater bekommt den Push; ohne E-Mail-Adresse keine E-Mail", async () => {
    const advisor = await makeBuyer(customerId, "advisor");
    const { lead, wamid } = await leadWithOutreach({ assignedUserId: advisor.id, email: null });
    await handleInboundPayload(failed(pnid, wamid, 131026, "Message undeliverable"));
    expect(pushes.find((x) => x.title.startsWith("Sofort anrufen"))?.to).toBe(advisor.id);
    expect(mails).toHaveLength(0);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).waUnavailableMailAt).toBeNull();
  });

  it("hat der Lead schon selbst geschrieben, ist es kein „kein WhatsApp“", async () => {
    const { lead, conv, wamid } = await leadWithOutreach();
    await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", kind: "text", body: "Hallo" } });
    await handleInboundPayload(failed(pnid, wamid, 131026, "Message undeliverable"));
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).waUnavailableAt).toBeNull();
    expect(mails).toHaveLength(0);
  });

  it("andere Codes: kein „kein WhatsApp“, aber sofort auf die Anrufliste plus Admin-Alarm (einmal je Kunde, Code und Tag)", async () => {
    const a = await leadWithOutreach();
    const b = await leadWithOutreach();
    await handleInboundPayload(failed(pnid, a.wamid, 131042, "Business eligibility payment issue"));
    await handleInboundPayload(failed(pnid, b.wamid, 131042, "Business eligibility payment issue"));
    const list = await getCallbackLeads(customerId);
    for (const x of [a, b]) {
      const l = await prisma.lead.findUniqueOrThrow({ where: { id: x.lead.id } });
      expect(l.waUnavailableAt).toBeNull();
      expect(l.outreachStatus).toBe("failed: Meta 131042");
      expect(list.find((c) => c.id === x.lead.id)?.reason).toBe("WhatsApp nicht zustellbar");
    }
    expect((await prisma.message.findUniqueOrThrow({ where: { waMessageId: a.wamid } })).errorCode).toBe(131042);
    expect(mails).toHaveLength(0);
    expect(pushes.filter((x) => x.title.startsWith("Sofort anrufen"))).toHaveLength(0);
    expect(pushes.filter((x) => x.title === "Bitte anrufen: Nina Winter" && x.to === "buyers")).toHaveLength(2);
    const adminPushes = pushes.filter((x) => x.to === "admins");
    expect(adminPushes).toHaveLength(1);
    expect(adminPushes[0].title).toContain("WhatsApp-Fehler 131042");
    const alarm = await prisma.whatsAppErrorAlert.findFirstOrThrow({ where: { customerId, code: 131042 } });
    expect(alarm.count).toBe(2);
    expect(await prisma.salesTask.count({ where: { title: { startsWith: "WhatsApp-Fehler 131042" }, note: { contains: customerId } } })).toBe(1);

    // Anderer Code am selben Tag: eigener Alarm
    const c = await leadWithOutreach();
    await handleInboundPayload(failed(pnid, c.wamid, 130429, "Rate limit hit"));
    expect(pushes.filter((x) => x.to === "admins")).toHaveLength(2);
    await prisma.salesTask.deleteMany({ where: { note: { contains: customerId } } });
  });

  it("Fehler an einer späteren Nachricht (nicht Erstanschreiben): Lead bleibt, wie er ist", async () => {
    const { lead, conv } = await leadWithOutreach();
    const wamid = `wamid.spaeter-${uid()}`;
    await prisma.message.create({ data: { conversationId: conv.id, direction: "outbound", kind: "template", body: "Erinnerung", waMessageId: wamid, status: "sent", sentBy: "system", purpose: "followup_nudge" } });
    await handleInboundPayload(failed(pnid, wamid, 131049, "Meta chose not to deliver"));
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).outreachStatus).toBe("sent");
    expect(pushes.filter((x) => x.title.startsWith("Bitte anrufen"))).toHaveLength(0);
  });

  it("131050 (Marketing abbestellt): zählt als Abmeldung, Lead auf die Anrufliste, kein Admin-Alarm", async () => {
    const { lead, conv, wamid } = await leadWithOutreach();
    await handleInboundPayload(failed(pnid, wamid, 131050, "Unable to deliver the message. This recipient has chosen to stop receiving marketing messages"));
    const c = await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } });
    expect(c.optedOutAt).not.toBeNull();
    expect(c.botActive).toBe(false);
    expect(waSend).not.toHaveBeenCalled(); // keine Bestätigung, sie käme nicht an
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).outreachStatus).toBe("skipped_optout");
    const list = await getCallbackLeads(customerId);
    expect(list.find((x) => x.id === lead.id)?.reason).toContain("Möchte keine WhatsApp-Nachrichten");
    expect(pushes.find((x) => x.title === "Bitte anrufen: Nina Winter")?.body).toContain("Möchte keine WhatsApp-Nachrichten.");
    expect(pushes.filter((x) => x.to === "admins")).toHaveLength(0);
    expect(mails).toHaveLength(0);
  });

  it("Kampagne: 131050 sperrt WhatsApp für den Bestandskunden, nächste Kampagne per E-Mail", async () => {
    const ec = await prisma.existingCustomer.create({
      data: { customerId, firstName: "Olga", lastName: "Abmeld", phone: "4915233344466", email: "olga@example.org", whatsappConsent: "ja", emailConsent: "ja" },
    });
    const conv = await prisma.conversation.create({ data: { customerId, contactPhone: ec.phone!, status: "open", botActive: false } });
    const wamid = `wamid.kampagne-${uid()}`;
    await prisma.message.create({ data: { conversationId: conv.id, direction: "outbound", kind: "template", body: "Hallo", waMessageId: wamid, status: "sent", sentBy: "system", purpose: "campaign_cross_sell" } });
    const campaign = await prisma.customerCampaign.create({ data: { customerId, name: "Hausrat 2", occasion: "cross_sell", segment: {}, status: "running" } });
    const r = await prisma.campaignRecipient.create({ data: { campaignId: campaign.id, existingCustomerId: ec.id, status: "sent", sentAt: new Date(), waMessageId: wamid } });

    await handleInboundPayload(failed(pnid, wamid, 131050, "Marketing opt out"));
    expect(await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: "failed", reason: "nicht zugestellt: WhatsApp abbestellt" });
    expect((await prisma.existingCustomer.findUniqueOrThrow({ where: { id: ec.id } })).whatsappConsent).toBe("nein");
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } })).optedOutAt).not.toBeNull();
    expect(pushes.filter((x) => x.to === "admins")).toHaveLength(0);

    const { planAudience } = await import("@/lib/bestand/campaigns");
    const plan = await planAudience(customerId, "cross_sell", {}, { now: new Date(Date.now() + 40 * 86_400_000) });
    expect(plan.recipients.find((x) => x.id === ec.id)?.channel).toBe("email");
  });

  it("Kampagne: Empfänger mit 131026 markiert, nächste Kampagne nur per E-Mail", async () => {
    const ec = await prisma.existingCustomer.create({
      data: { customerId, firstName: "Erika", lastName: "Muster", phone: "4915233344455", email: "erika@example.org", whatsappConsent: "ja", emailConsent: "ja" },
    });
    const conv = await prisma.conversation.create({ data: { customerId, contactPhone: ec.phone!, status: "open", botActive: false } });
    const wamid = `wamid.kampagne-${uid()}`;
    await prisma.message.create({ data: { conversationId: conv.id, direction: "outbound", kind: "template", body: "Hallo", waMessageId: wamid, status: "sent", sentBy: "system", purpose: "campaign_cross_sell" } });
    const campaign = await prisma.customerCampaign.create({ data: { customerId, name: "Hausrat", occasion: "cross_sell", segment: {}, status: "running" } });
    const r = await prisma.campaignRecipient.create({ data: { campaignId: campaign.id, existingCustomerId: ec.id, status: "sent", sentAt: new Date(), waMessageId: wamid } });

    await handleInboundPayload(failed(pnid, wamid, 131026, "Message undeliverable"));
    expect(await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ status: "failed", reason: "nicht zugestellt: kein WhatsApp" });
    expect((await prisma.existingCustomer.findUniqueOrThrow({ where: { id: ec.id } })).waUnavailableAt).not.toBeNull();
    // Kein Admin-Alarm für „kein WhatsApp“
    expect(pushes.filter((x) => x.to === "admins")).toHaveLength(0);

    const { planAudience } = await import("@/lib/bestand/campaigns");
    const plan = await planAudience(customerId, "cross_sell", {}, { now: new Date(Date.now() + 40 * 86_400_000) });
    expect(plan.recipients.find((x) => x.id === ec.id)?.channel).toBe("email");
  });
});
