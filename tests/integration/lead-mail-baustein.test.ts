// Lead-Mail-Baustein (Ole, 17.11.2026, Paket P0): ein Versandweg für Mails an Leads. Postfach verbunden → Versand
// über das Postfach; sonst Resend von unserer Versanddomain mit „Name | Agentur“ und Antwort an den Berater; Signatur
// aus den Anbieterangaben mit Erstinfo-Link; Erinnerung mit „Morgen um 10 Uhr“; Team: der zuständige Berater.
// Versand gemockt: Resend (lib/mail-guard) und SMTP (nodemailer), Protokoll und Datenbank echt.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type ResendMail = { from: string; to: string; replyTo?: string; subject: string; text: string; html?: string; attachments?: { filename: string }[] };
type SmtpMail = { from: unknown; to: string; subject: string; text: string; html?: string; attachments?: { filename: string }[] };
const st = vi.hoisted(() => ({ resend: [] as ResendMail[], smtp: [] as SmtpMail[] }));

vi.mock("@/lib/mail-guard", () => ({
  mailClient: () => ({
    emails: {
      send: async (args: ResendMail) => {
        st.resend.push(args);
        return { data: { id: `re_${Math.random().toString(36).slice(2, 10)}` }, error: null };
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
      sendMail: async (o: SmtpMail) => {
        st.smtp.push(o);
        return {};
      },
      verify: async () => true,
    }),
  },
}));
vi.mock("@/lib/push", () => {
  const rec = async () => ({ sent: 0, removed: 0, errors: [] });
  return { sendToAdmins: rec, sendToBuyersOfCustomer: rec, sendToUser: rec };
});

import { prisma } from "@/lib/prisma";
import { sendLeadEmail, BROWSER_HINWEIS } from "@/lib/calendar/lead-email";
import { hatGedankenstrich } from "@/lib/gedankenstriche";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
// Dienstag, 17.11.2026, 18:00 Uhr Berlin; Termin am Mittwoch, 18.11., 10:00 Uhr
const NOW = new Date("2026-11-17T17:00:00Z");
const START = new Date("2026-11-18T09:00:00Z");
const FROM = "termine@dein-beratungstermin.de";

describe("Lead-Mail-Baustein", () => {
  const customers: string[] = [];
  const ENV = { ...process.env };
  beforeAll(() => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
  });
  afterAll(async () => {
    for (const id of customers) await cleanupCustomer(id);
    process.env = { ...ENV };
  });
  beforeEach(() => {
    st.resend = [];
    st.smtp = [];
    process.env.APP_URL = "https://app.test";
    delete process.env.PUBLIC_BOOKING_URL;
    process.env.RESEND_API_KEY = "re_test";
    process.env.BOOKING_EMAIL_FROM = FROM;
    delete process.env.LEAD_EMAIL_FROM;
  });

  async function setup(opts: { assigned?: { displayName: string; email: string } } = {}) {
    const c = await makeCustomer({ name: `Kannapinn Versicherungen ${uid()}`, leadAddress: "sie" });
    customers.push(c.id);
    const owner = await makeBuyer(c.id, "owner");
    await prisma.agentConfig.create({ data: { customerId: c.id, advisorEmail: "ole@kannapinn.test" } });
    const erst = await prisma.erstinformation.create({
      data: {
        customerId: c.id,
        token: `tok${uid()}${uid()}`,
        name: "Ole Kannapinn",
        anrede: "Herr",
        firma: "Kannapinn Versicherungen GmbH",
        anschrift: "Hauptstraße 1\n80331 München",
        telefon: "089 123456",
      },
    });
    let advisorId: string | null = null;
    if (opts.assigned) {
      const adv = await makeBuyer(c.id, "advisor");
      await prisma.user.update({ where: { id: adv.id }, data: { displayName: opts.assigned.displayName, email: opts.assigned.email } });
      advisorId = adv.id;
    }
    const phone = `49151${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    const email = `julia${uid()}@example.org`;
    const lead = await prisma.lead.create({
      data: {
        customerId: c.id,
        name: "Julia Schneider",
        phone,
        email,
        status: "Neuer Lead",
        formData: [{ label: "Anrede", value: "Frau" }],
        ...(advisorId ? { assignedUserId: advisorId } : {}),
      },
    });
    const conv = await prisma.conversation.create({
      data: { customerId: c.id, contactPhone: phone, contactEmail: email, contactName: "Julia Schneider", leadId: lead.id, botActive: true, status: "open", lastMessageAt: NOW },
    });
    const appt = await prisma.appointment.create({
      data: {
        customerId: c.id,
        leadId: lead.id,
        conversationId: conv.id,
        mode: "video",
        meetUrl: "https://meet.example/abc",
        startsAt: START,
        endsAt: new Date(START.getTime() + 30 * 60_000),
        status: "booked",
        manageToken: `mt_${uid()}${uid()}`,
      },
    });
    return { c, owner, advisorId, lead, appt, erstUrl: `https://app.test/erstinformation/${erst.token}`, email };
  }

  it("ohne Postfach: Resend mit „Name | Agentur“, Antwort an den Berater, Signatur mit Erstinfo-Link, Browser-Hinweis", async () => {
    const { appt, lead, erstUrl, email } = await setup();
    expect(await sendLeadEmail(appt.id, "booked", { now: NOW })).toEqual({ sent: true });
    expect(st.smtp).toHaveLength(0);
    expect(st.resend).toHaveLength(1);
    const m = st.resend[0];
    expect(m.from).toBe(`"Ole Kannapinn | Kannapinn Versicherungen GmbH" <${FROM}>`);
    expect(m.replyTo).toBe("ole@kannapinn.test");
    expect(m.to).toBe(email);
    expect(m.subject).toBe("Ihr Termin mit Herrn Kannapinn: Mittwoch, 18. November um 10:00 Uhr");
    expect(m.text.startsWith("Guten Tag Frau Schneider,")).toBe(true);
    expect(m.text).toContain("Ihre Videoberatung mit Herrn Kannapinn ist gebucht");
    expect(m.text).toContain(BROWSER_HINWEIS);
    // Link zur Erstinformation im Text und in der Signatur, .ics und Verschieben bleiben
    expect(m.text).toContain(`finden Sie hier: ${erstUrl}`);
    expect(m.text).toContain(`Verschieben oder absagen: https://app.test/book/manage/${appt.manageToken}`);
    expect(m.text.trimEnd().endsWith(["Viele Grüße", "Ole Kannapinn", "Kannapinn Versicherungen GmbH", "Hauptstraße 1, 80331 München", "Telefon: 089 123456", `Erstinformation: ${erstUrl}`].join("\n"))).toBe(true);
    expect(m.html).toContain(`href="${erstUrl}"`);
    expect(m.attachments?.map((x) => x.filename)).toContain("termin.ics");
    expect(hatGedankenstrich(m.subject + m.text)).toBe(false);
    expect(await prisma.contactMail.findFirstOrThrow({ where: { leadId: lead.id } })).toMatchObject({ provider: "resend", kind: "terminbestaetigung", status: "versendet" });
  });

  it("Erinnerung: Betreff „Morgen um 10 Uhr: Ihr Videotermin mit Herrn Kannapinn“ mit Link, Verschieben und Signatur", async () => {
    const { appt, erstUrl } = await setup();
    expect(await sendLeadEmail(appt.id, "reminder", { now: NOW })).toEqual({ sent: true });
    const m = st.resend[0];
    expect(m.subject).toBe("Morgen um 10 Uhr: Ihr Videotermin mit Herrn Kannapinn");
    expect(m.text).toContain("https://meet.example/abc");
    expect(m.text).toContain(`Verschieben oder absagen: https://app.test/book/manage/${appt.manageToken}`);
    expect(m.text).toContain(`Erstinformation: ${erstUrl}`);
    // Zwei Tage vorher: Datum statt „Morgen“
    st.resend = [];
    await sendLeadEmail(appt.id, "reminder", { now: new Date(NOW.getTime() - 86_400_000) });
    expect(st.resend[0].subject).toBe("Mittwoch, 18. November um 10 Uhr: Ihr Videotermin mit Herrn Kannapinn");
  });

  it("Postfach verbunden: Versand über das Postfach, eigene Signatur bzw. die aus den Anbieterangaben", async () => {
    const { c, owner, appt, lead, erstUrl } = await setup();
    await prisma.mailConnection.create({ data: { userId: owner.id, customerId: c.id, provider: "smtp", email: "ole@kannapinn.test", fromName: "Ole Kannapinn", smtpHost: "smtp.kannapinn.test", smtpPort: 587, smtpUser: "u", status: "ok" } });
    expect(await sendLeadEmail(appt.id, "booked", { now: NOW })).toEqual({ sent: true });
    expect(st.resend).toHaveLength(0);
    expect(st.smtp).toHaveLength(1);
    expect(st.smtp[0].subject).toBe("Ihr Termin mit Herrn Kannapinn: Mittwoch, 18. November um 10:00 Uhr");
    expect(st.smtp[0].text).toContain(`Erstinformation: ${erstUrl}`);
    expect(st.smtp[0].html).toContain("Termin verschieben oder absagen");
    expect(st.smtp[0].attachments?.map((x) => x.filename)).toContain("termin.ics");
    expect(await prisma.contactMail.findFirstOrThrow({ where: { leadId: lead.id } })).toMatchObject({ provider: "postfach", kind: "terminbestaetigung" });

    await prisma.user.update({ where: { id: owner.id }, data: { mailSignature: "Beste Grüße\nOle Kannapinn\nwww.kannapinn.test" } });
    await sendLeadEmail(appt.id, "reminder", { now: NOW });
    expect(st.smtp).toHaveLength(2);
    expect(st.smtp[1].text.trimEnd().endsWith("Beste Grüße\nOle Kannapinn\nwww.kannapinn.test")).toBe(true);
  });

  it("ohne Postfach und ohne Absender-Adresse: bewusst nicht gesendet", async () => {
    const { appt } = await setup();
    delete process.env.BOOKING_EMAIL_FROM;
    expect(await sendLeadEmail(appt.id, "booked", { now: NOW })).toEqual({ sent: false, reason: "not_configured" });
    expect(st.resend).toHaveLength(0);
    expect(st.smtp).toHaveLength(0);
  });

  it("Team: der zuständige Berater wird genannt, Antwort an ihn; sein Postfach, nicht das des Inhabers", async () => {
    const { c, owner, advisorId, appt } = await setup({ assigned: { displayName: "Max Berater", email: `max${uid()}@kannapinn.test` } });
    // Inhaber hat ein Postfach, der Berater (noch) nicht → Resend im Namen des Beraters
    await prisma.mailConnection.create({ data: { userId: owner.id, customerId: c.id, provider: "smtp", email: "ole@kannapinn.test", smtpHost: "smtp.kannapinn.test", smtpPort: 587, smtpUser: "u", status: "ok" } });
    expect(await sendLeadEmail(appt.id, "reminder", { now: NOW })).toEqual({ sent: true });
    expect(st.smtp).toHaveLength(0);
    const m = st.resend[0];
    const adv = await prisma.user.findUniqueOrThrow({ where: { id: advisorId! } });
    expect(m.from).toBe(`"Max Berater | Kannapinn Versicherungen GmbH" <${FROM}>`);
    expect(m.replyTo).toBe(adv.email);
    expect(m.subject).toBe("Morgen um 10 Uhr: Ihr Videotermin mit Max Berater");
    expect(m.text).toContain("Ihre Videoberatung mit Max Berater");
    expect(m.text).toContain("Viele Grüße\nMax Berater\nKannapinn Versicherungen GmbH");
    expect(m.text).not.toContain("Kannapinn ist");

    // Berater verbindet sein Postfach → Versand von dort
    await prisma.mailConnection.create({ data: { userId: advisorId!, customerId: c.id, provider: "smtp", email: adv.email, smtpHost: "smtp.kannapinn.test", smtpPort: 587, smtpUser: "m", status: "ok" } });
    st.resend = [];
    await sendLeadEmail(appt.id, "booked", { now: NOW });
    expect(st.resend).toHaveLength(0);
    expect(st.smtp).toHaveLength(1);
    expect(st.smtp[0].subject).toContain("Ihr Termin mit Max Berater");
  });
});
