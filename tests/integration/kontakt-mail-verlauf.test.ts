// Alle E-Mails im Kontaktverlauf (Ole, 15.11.2026): Terminbestätigung mit „automatisch“ und Status, Resend-Webhook
// (zugestellt, unzustellbar), Kampagnen-Mail an Bestandskunden ohne Lead im Bestand-Verlauf, Bounce und Abmeldung,
// manuelle Mail nicht doppelt, Fehlversuch mit Grund, Kontext für den WhatsApp-Assistenten.
// Versand gemockt: Resend (lib/mail-guard) und SMTP (nodemailer); der Protokollweg (sendViaPostfach,
// sendeKontaktMailResend) läuft echt.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  resend: [] as Array<{ to: unknown; subject?: string; text?: string }>,
  resendFail: null as null | string,
  smtp: [] as Array<{ to: string; subject: string; text: string; messageId?: string }>,
  smtpFail: null as null | string,
  system: [] as string[],
  n: 0,
}));

vi.mock("@/lib/mail-guard", () => ({
  mailClient: () => ({
    emails: {
      send: async (args: { to: unknown; subject?: string; text?: string }) => {
        st.resend.push(args);
        if (st.resendFail) return { data: null, error: { message: st.resendFail } };
        return { data: { id: `re_${++st.n}_${Math.random().toString(36).slice(2, 8)}` }, error: null };
      },
    },
  }),
  wasBlocked: () => false,
  mailAllowed: () => true,
  MAIL_BLOCKED_TEXT: "gesperrt",
}));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: async (o: { to: string; subject: string; text: string; messageId?: string }) => {
        if (st.smtpFail) throw new Error(st.smtpFail);
        st.smtp.push(o);
        return {};
      },
      verify: async () => true,
    }),
  },
}));
vi.mock("@/lib/calendar/add-to-calendar", async (orig) => {
  const real = await orig<typeof import("@/lib/calendar/add-to-calendar")>();
  return {
    ...real,
    customerEventById: async (id: string) => ({
      uid: id,
      start: new Date("2026-11-20T09:00:00Z"),
      end: new Date("2026-11-20T09:30:00Z"),
      summary: "Beratung",
      description: "",
      location: "",
      manageUrl: `https://app.test/book/manage/tok${id}`,
      token: `tok${id}`,
      advisorName: "Susanne Meier",
      mode: "phone" as const,
      videoUrl: null,
    }),
  };
});
vi.mock("@/lib/push", () => {
  const rec = async () => ({ sent: 0, removed: 0, errors: [] });
  return { sendToAdmins: rec, sendToBuyersOfCustomer: rec, sendToUser: rec };
});
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (req: { system: string }) => {
        st.system.push(req.system);
        return { content: [{ type: "text", text: "Gern, bis dann." }], stop_reason: "end_turn" };
      },
    };
  },
}));
vi.mock("@/lib/whatsapp/gateway", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/gateway")>();
  return { ...real, sendWhatsAppMessage: async () => ({ id: "m1" }) };
});
vi.mock("@/lib/whatsapp/erstinfo-pdf", () => ({ sendErstinfoPdf: async () => {}, sendErstinfo: async () => {} }));

import { prisma } from "@/lib/prisma";
import { sendLeadEmail } from "@/lib/calendar/lead-email";
import { sendViaPostfach } from "@/lib/mail/postfach";
import { letzteAutomatischeMails, verarbeiteResendEreignis, naechsterStatus } from "@/lib/mail/kontakt-mail";
import { loadLeadHistory } from "@/lib/lead-history";
import { createCampaign, recordEmailReply, runCampaigns } from "@/lib/bestand/campaigns";
import { unsubscribe } from "@/lib/bestand/abmelden";
import { signLink } from "@/lib/bestand/links";
import { runBotTurn } from "@/lib/whatsapp/bot";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
// Montag, 16.11.2026, 10:00 Uhr Berlin (Versandfenster der E-Mail-Kampagnen)
const NOW = new Date("2026-11-16T09:00:00Z");
const noSleep = async () => {};

describe("E-Mails im Kontaktverlauf", () => {
  const customers: string[] = [];
  beforeAll(() => {
    requireTestDb();
    process.env.APP_URL = "https://app.test";
    process.env.RESEND_API_KEY = "re_test";
    process.env.BOOKING_EMAIL_FROM = "termine@beratung.test";
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
  });
  afterAll(async () => {
    for (const id of customers) await cleanupCustomer(id);
  });
  beforeEach(() => {
    st.resend = [];
    st.smtp = [];
    st.resendFail = null;
    st.smtpFail = null;
    st.system = [];
  });

  async function leadWithAppointment() {
    const c = await makeCustomer({ name: `Agentur Meier ${uid()}`, leadAddress: "sie" });
    customers.push(c.id);
    const owner = await makeBuyer(c.id, "owner");
    // Vermittler laut Anbieterangaben (Name in Termin-Mails, lib/mail/lead-versand.ts)
    await prisma.erstinformation.create({ data: { customerId: c.id, token: `tok${uid()}${uid()}`, name: "Susanne Meier" } });
    const phone = `49151${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    const lead = await prisma.lead.create({ data: { customerId: c.id, name: "Nina Winter", phone, email: `nina${uid()}@example.org`, status: "Neuer Lead" } });
    const conv = await prisma.conversation.create({
      data: { customerId: c.id, contactPhone: phone, contactEmail: lead.email, contactName: "Nina Winter", leadId: lead.id, botActive: true, status: "open", lastMessageAt: new Date() },
    });
    const appt = await prisma.appointment.create({ data: { customerId: c.id, leadId: lead.id, conversationId: conv.id, mode: "phone", startsAt: new Date("2026-11-20T09:00:00Z") } });
    return { c, owner, lead, conv, appt };
  }

  it("Terminbestätigung: Eintrag im Lead-Verlauf mit „automatisch“, Art, Empfänger, Betreff, Text und Status „versendet“", async () => {
    const { lead, appt } = await leadWithAppointment();
    expect(await sendLeadEmail(appt.id, "booked")).toEqual({ sent: true });
    expect(st.resend).toHaveLength(1);
    const mails = await prisma.contactMail.findMany({ where: { leadId: lead.id } });
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ kind: "terminbestaetigung", automatic: true, recipient: lead.email, status: "versendet", provider: "resend" });
    expect(mails[0].providerMessageId).toMatch(/^re_/);
    expect(mails[0].subject).toContain("Termin mit Susanne Meier");
    expect(mails[0].body).toContain("ist gebucht");
    const history = await loadLeadHistory(lead.id, null);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ kind: "email", author: null });
    expect(history[0].text).toContain("automatisch, Terminbestätigung");
    expect(history[0].mail).toMatchObject({ automatic: true, artLabel: "Terminbestätigung", status: "versendet", statusLabel: "versendet", to: lead.email });
    // Erinnerung und Absage: eigene Art
    await sendLeadEmail(appt.id, "reminder");
    await sendLeadEmail(appt.id, "cancelled");
    const kinds = (await prisma.contactMail.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" } })).map((m) => m.kind);
    expect(kinds).toEqual(["terminbestaetigung", "terminerinnerung", "terminabsage"]);
  });

  it("Resend-Webhook: zugestellt, dann unzustellbar; ein spätes „zugestellt“ überschreibt „nicht zustellbar“ nicht", async () => {
    const { lead, appt } = await leadWithAppointment();
    await sendLeadEmail(appt.id, "rescheduled");
    const m = await prisma.contactMail.findFirstOrThrow({ where: { leadId: lead.id } });
    expect(m.kind).toBe("terminverschiebung");
    expect(await verarbeiteResendEreignis({ type: "email.delivered", data: { email_id: m.providerMessageId! } })).toBe(1);
    expect((await prisma.contactMail.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("zugestellt");
    expect(await verarbeiteResendEreignis({ type: "email.bounced", data: { email_id: m.providerMessageId!, bounce: { message: "Mailbox does not exist" } } as never })).toBe(1);
    expect(await prisma.contactMail.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({ status: "nicht_zustellbar", reason: "Mailbox does not exist" });
    expect(await verarbeiteResendEreignis({ type: "email.delivered", data: { email_id: m.providerMessageId! } })).toBe(0);
    expect(await verarbeiteResendEreignis({ type: "email.opened", data: { email_id: m.providerMessageId! } })).toBe(0);
    expect(naechsterStatus("nicht_versendet", "zugestellt")).toBeNull();
    expect(naechsterStatus("versendet", "abgemeldet")).toBe("abgemeldet");
  });

  it("Fehlgeschlagener Versand: „nicht versendet“ mit Grund, Wiederholung ohne zweiten Eintrag; nicht im Kontext des Assistenten", async () => {
    const { lead, appt } = await leadWithAppointment();
    st.resendFail = "The to address is invalid";
    expect(await sendLeadEmail(appt.id, "booked")).toEqual({ sent: false, reason: "The to address is invalid" });
    await sendLeadEmail(appt.id, "booked");
    const mails = await prisma.contactMail.findMany({ where: { leadId: lead.id } });
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ status: "nicht_versendet", reason: "The to address is invalid", automatic: true });
    const h = await loadLeadHistory(lead.id, null);
    expect(h).toHaveLength(1);
    expect(h[0].text.startsWith("E-Mail nicht versendet")).toBe(true);
    expect(await letzteAutomatischeMails({ leadId: lead.id })).toEqual([]);
  });

  it("Manuelle Mail aus dem Postfach: genau ein Eintrag, ohne „automatisch“, mit Autor; Fehlversuch mit Grund", async () => {
    const { c, owner, lead } = await leadWithAppointment();
    await prisma.mailConnection.create({ data: { userId: owner.id, customerId: c.id, provider: "smtp", email: "berater@agentur.test", smtpHost: "smtp.agentur.test", smtpPort: 587, smtpUser: "u", status: "ok" } });
    const r = await sendViaPostfach(owner.id, { to: lead.email!, subject: "Ihr Angebot", text: "Guten Tag,\n\nanbei das Angebot." }, { customerId: c.id, leadId: lead.id, art: "manuell", userId: owner.id });
    expect(r.ok).toBe(true);
    expect(st.smtp).toHaveLength(1);
    expect(await prisma.leadHistory.count({ where: { leadId: lead.id, kind: "email" } })).toBe(1);
    expect(await prisma.contactMail.count({ where: { leadId: lead.id } })).toBe(1);
    const [h] = await loadLeadHistory(lead.id, owner.id);
    expect(h.mine).toBe(true);
    expect(h.mail).toMatchObject({ automatic: false, subject: "Ihr Angebot", status: "versendet" });
    expect(h.text).toBe(`E-Mail an ${lead.email}: Ihr Angebot`);
    // Manuelle Mails zählen nicht als automatische für den Assistenten
    expect(await letzteAutomatischeMails({ leadId: lead.id })).toEqual([]);
    st.smtpFail = "ECONNREFUSED 1.2.3.4:587";
    const bad = await sendViaPostfach(owner.id, { to: lead.email!, subject: "Zweiter Versuch", text: "Hallo" }, { customerId: c.id, leadId: lead.id, art: "manuell", userId: owner.id });
    expect(bad.ok).toBe(false);
    const failed = await prisma.contactMail.findFirstOrThrow({ where: { leadId: lead.id, subject: "Zweiter Versuch" } });
    expect(failed).toMatchObject({ status: "nicht_versendet", automatic: false });
    expect(failed.reason).toContain("Mailserver ist nicht erreichbar");
  });

  it("Kampagnen-Mail an Bestandskunden ohne Lead: Eintrag im Bestand-Verlauf (nicht im Lead-Verlauf); Bounce und Abmeldung setzen den Status", async () => {
    const c = await makeCustomer({ name: `Agentur Meier ${uid()}`, existingCustomersEnabled: true, bestandMailImprint: "Agentur Meier\nHauptstr. 1, 12345 Ort" });
    customers.push(c.id);
    const owner = await makeBuyer(c.id, "owner");
    await prisma.mailConnection.create({ data: { userId: owner.id, customerId: c.id, provider: "smtp", email: `berater-${uid()}@agentur.test`, smtpHost: "smtp.agentur.test", smtpPort: 587, smtpUser: "u", status: "ok" } });
    const a = await prisma.existingCustomer.create({ data: { customerId: c.id, firstName: "Erika", lastName: `Muster${uid()}`, salutation: "Frau", email: `a${uid()}@kunde.test`, emailConsent: "ja" } });
    const b = await prisma.existingCustomer.create({ data: { customerId: c.id, firstName: "Max", lastName: `Muster${uid()}`, salutation: "Herr", email: `b${uid()}@kunde.test`, emailConsent: "ja" } });
    const campaign = await createCampaign({ customerId: c.id, occasion: "review", segment: {}, topic: null, dailyLimit: 50, createdById: owner.id, now: NOW });
    await runCampaigns(NOW, { sleep: noSleep, rand: () => 0.5 });
    expect(st.smtp.length).toBeGreaterThanOrEqual(1);
    await runCampaigns(new Date(NOW.getTime() + 7 * 60_000), { sleep: noSleep });
    expect(st.smtp).toHaveLength(2);
    const mails = await prisma.contactMail.findMany({ where: { customerId: c.id }, orderBy: { createdAt: "asc" } });
    expect(mails).toHaveLength(2);
    for (const m of mails) {
      expect(m).toMatchObject({ kind: "bestandskampagne", label: campaign.name, automatic: true, leadId: null, status: "versendet", provider: "postfach" });
      expect(m.providerMessageId).toMatch(/^bk-/);
    }
    expect(await prisma.leadHistory.count({ where: { customerId: c.id } })).toBe(0);
    const { bestandMailVerlauf } = await import("@/lib/mail/kontakt-mail");
    const va = await bestandMailVerlauf(c.id, a.id);
    expect(va).toHaveLength(1);
    expect(va[0]).toMatchObject({ artLabel: `Bestandskampagne: ${campaign.name}`, to: a.email, automatic: true });
    // Unzustellbar-Meldung zugeordnet → „nicht zustellbar“
    await recordEmailReply(c.id, { fromEmail: a.email, subject: "Undeliverable: Ihr Jahres-Check", text: "550 user unknown" }, NOW);
    expect((await bestandMailVerlauf(c.id, a.id))[0].status).toBe("nicht_zustellbar");
    // Abmeldelink → „abgemeldet“
    const rb = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: campaign.id, existingCustomerId: b.id } });
    await unsubscribe(signLink("r", rb.id), "email", { ip: null, userAgent: null }, NOW);
    expect((await bestandMailVerlauf(c.id, b.id))[0]).toMatchObject({ status: "abgemeldet", statusLabel: "abgemeldet" });
    // Assistent im Chat mit dem Bestandskunden (Antwort auf die Kampagne, ohne Lead) kennt die Kampagnen-Mail
    expect((await letzteAutomatischeMails({ existingCustomerId: b.id })).map((m) => m.art)).toEqual([`Bestandskampagne: ${campaign.name}`]);
  });

  it("WhatsApp-Assistent: die letzten automatischen Mails (14 Tage, höchstens 3) stehen im Prompt", async () => {
    const { c, lead, appt, conv } = await leadWithAppointment();
    await prisma.agentConfig.create({ data: { customerId: c.id, active: true } });
    await sendLeadEmail(appt.id, "booked");
    await sendLeadEmail(appt.id, "reminder");
    // Alte Mail (20 Tage) zählt nicht
    await prisma.contactMail.create({
      data: { customerId: c.id, leadId: lead.id, kind: "kein_whatsapp", recipient: lead.email!, subject: "Alte Mail", body: "x", createdAt: new Date(Date.now() - 20 * 86_400_000) },
    });
    await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", kind: "text", body: "Bekomme ich noch eine Bestätigung?" } });
    await runBotTurn(conv.id);
    expect(st.system).toHaveLength(1);
    const prompt = st.system[0];
    expect(prompt).toContain("automatisch bekommen");
    expect(prompt).toContain("Terminbestätigung");
    expect(prompt).toContain("Terminerinnerung");
    expect(prompt).toContain("Termin mit Susanne Meier");
    expect(prompt).not.toContain("Alte Mail");
  });
});
