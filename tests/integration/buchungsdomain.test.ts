// Eigene Buchungsadresse (PUBLIC_BOOKING_URL, Ole 15.11.2026): Links in Lead-Mails, Kalender-Einladung,
// Erstinformation im WhatsApp-Erstkontakt, Empfehlung und Bestandskunden-Links zeigen auf
// dein-beratungstermin.de, wenn gesetzt, sonst wie bisher auf die App-Adresse.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ mails: [] as Array<{ to: unknown; subject: string; text: string; html: string }> }));

vi.mock("@/lib/mail-guard", () => ({
  wasBlocked: () => false,
  mailAllowed: () => true,
  MAIL_BLOCKED_TEXT: "blockiert",
  mailClient: () => ({
    emails: {
      send: async (args: { to: unknown; subject: string; text: string; html: string }) => {
        h.mails.push(args);
        return { data: { id: "mail-1" }, error: null };
      },
    },
  }),
}));
vi.mock("@/lib/push", () => ({
  sendToUser: vi.fn(async () => {}),
  sendToBuyersOfCustomer: vi.fn(async () => {}),
  sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })),
}));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { sendLeadEmail } from "@/lib/calendar/lead-email";
import { buildIcs, customerEventById } from "@/lib/calendar/add-to-calendar";
import { erstinfoUrlFor } from "@/lib/erstinformation";
import { runOutreach } from "@/lib/whatsapp/outreach";
import { referralLinkFor, googleLinkFor } from "@/lib/empfehlung/requests";
import { consentUrl, doiConfirmUrl, unsubscribePostUrl, unsubscribeUrl } from "@/lib/bestand/links";
import { bookingPageUrl } from "@/lib/public-url";
import { GET as abmeldenGet } from "@/app/api/abmelden/[token]/route";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ENV = { ...process.env };
const APP = "https://app.example.de";
const PUB = "https://www.dein-beratungstermin.de";
const uid = () => Math.random().toString(36).slice(2, 10);

let customerId = "";
const sent: Array<{ to: string; type: string; template?: { name: string; components?: { type: string; parameters: { text: string }[] }[] } }> = [];

function fake360(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("/messages")) {
    sent.push(JSON.parse(String(init?.body)));
    return Promise.resolve(new Response(JSON.stringify({ messages: [{ id: `wamid.bd${sent.length}.${uid()}` }] }), { status: 200 }));
  }
  return Promise.resolve(new Response("not found", { status: 404 }));
}

async function appointment() {
  const lead = await prisma.lead.create({ data: { customerId, name: "Julia Schneider", phone: "4917633330000", email: "julia@test.local" } });
  const conv = await prisma.conversation.create({
    data: { customerId, contactPhone: "4917633330000", contactName: "Julia Schneider", contactEmail: "julia@test.local", leadId: lead.id },
  });
  const start = new Date(Date.now() + 3 * 86_400_000);
  return prisma.appointment.create({
    data: {
      customerId,
      leadId: lead.id,
      conversationId: conv.id,
      mode: "phone",
      startsAt: start,
      endsAt: new Date(start.getTime() + 30 * 60000),
      status: "booked",
      manageToken: `tok_${uid()}${uid()}`,
    },
  });
}

beforeAll(() => requireTestDb());
beforeEach(async () => {
  process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
  process.env.APP_URL = APP;
  delete process.env.PUBLIC_BOOKING_URL;
  process.env.RESEND_API_KEY = "re_test";
  process.env.BOOKING_EMAIL_FROM = "termine@test.local";
  h.mails.length = 0;
  sent.length = 0;
  customerId = (await makeCustomer({ name: `Agentur Susanne Meier ${uid()}`, leadAddress: "sie" })).id;
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await prisma.lead.deleteMany({ where: { customerId } });
  await cleanupCustomer(customerId);
});
afterAll(() => {
  process.env = { ...ENV };
});

describe("Termin-Mail an den Lead und Kalender-Einladung", () => {
  it("mit PUBLIC_BOOKING_URL: Verwalten- und Kalender-Link auf der Buchungsadresse", async () => {
    process.env.PUBLIC_BOOKING_URL = PUB;
    const appt = await appointment();
    expect(await sendLeadEmail(appt.id, "booked")).toEqual({ sent: true });
    const m = h.mails[0];
    expect(m.text).toContain(`Verschieben oder absagen: ${PUB}/book/manage/${appt.manageToken}`);
    expect(m.text).toContain(`Zum Kalender hinzufügen: ${PUB}/book/manage/${appt.manageToken}/ics`);
    expect(m.html).toContain(`${PUB}/book/manage/${appt.manageToken}`);
    expect(`${m.text}${m.html}`).not.toContain(APP);
    // Einladung (ICS): Beschreibung und URL auf der Buchungsadresse
    const ev = await customerEventById(appt.id);
    expect(ev?.description).toContain(`${PUB}/book/manage/${appt.manageToken}`);
    expect(buildIcs(ev!)).toContain(`URL:${PUB}/book/manage/${appt.manageToken}`);
  });

  it("ohne PUBLIC_BOOKING_URL: wie bisher auf der App-Adresse", async () => {
    const appt = await appointment();
    expect(await sendLeadEmail(appt.id, "booked")).toEqual({ sent: true });
    expect(h.mails[0].text).toContain(`Verschieben oder absagen: ${APP}/book/manage/${appt.manageToken}`);
    expect(h.mails[0].text).not.toContain("dein-beratungstermin");
  });
});

describe("WhatsApp-Erstkontakt: Link zur Erstinformation", () => {
  async function outreachParams(): Promise<string[]> {
    vi.stubGlobal("fetch", vi.fn(fake360));
    await prisma.whatsAppAccount.create({ data: { customerId, provider: "360dialog", status: "connected", apiKeyEnc: encryptSecret("d360-bd"), phoneNumberId: `pn-bd-${uid()}` } });
    await prisma.agentConfig.create({ data: { customerId, active: true, outreachEnabled: true, outreachDelayMin: 0 } });
    await prisma.messageTemplate.create({
      data: {
        customerId,
        name: "pg_outreach_v3_sie",
        language: "de",
        purpose: "outreach",
        category: "marketing",
        status: "approved",
        auto: true,
        // Erstanschreiben nur noch mit PDF der Erstinformation im Kopf (17.11.2026)
        headerFormat: "DOCUMENT",
        body: "Guten Tag {{1}}, hier schreibt der digitale KI-Assistent von X. Erstinformation: {{2}} Haben Sie kurz Zeit?",
      },
    });
    await prisma.lead.create({ data: { customerId, name: "Max Weber", phone: "4917644440004", status: "Neuer Lead" } });
    await runOutreach(customerId);
    const t = sent.find((s) => s.to === "4917644440004");
    return t?.template?.components?.find((c) => c.type === "body")?.parameters.map((p) => p.text) ?? [];
  }

  it("mit PUBLIC_BOOKING_URL: Buchungsadresse", async () => {
    process.env.PUBLIC_BOOKING_URL = PUB;
    const params = await outreachParams();
    const e = await prisma.erstinformation.findUniqueOrThrow({ where: { customerId } });
    expect(params[1]).toBe(`${PUB}/erstinformation/${e.token}`);
    expect(await erstinfoUrlFor(customerId)).toBe(`${PUB}/erstinformation/${e.token}`);
  });

  it("ohne PUBLIC_BOOKING_URL: App-Adresse", async () => {
    const params = await outreachParams();
    expect(params[1]).toMatch(/^https:\/\/app\.example\.de\/erstinformation\/[\w-]+$/);
  });
});

describe("Empfehlung, Bestandskunden und Buchungsseite", () => {
  it("Links folgen PUBLIC_BOOKING_URL", async () => {
    expect(referralLinkFor("abc")).toBe(`${APP}/empfehlung/abc`);
    expect(unsubscribeUrl("rec1")).toMatch(new RegExp(`^${APP}/abmelden/rrec1\\.`));
    expect(bookingPageUrl("meier", { lead: "l1" })).toBe(`${APP}/book/meier?lead=l1`);

    process.env.PUBLIC_BOOKING_URL = PUB;
    expect(referralLinkFor("abc")).toBe(`${PUB}/empfehlung/abc`);
    expect(googleLinkFor("abc")).toBe(`${PUB}/empfehlung/g/abc`);
    expect(unsubscribeUrl("rec1")).toMatch(new RegExp(`^${PUB}/abmelden/rrec1\\.`));
    expect(unsubscribePostUrl("rec1")).toMatch(new RegExp(`^${PUB}/api/abmelden/rrec1\\.`));
    expect(consentUrl("ec1")).toMatch(new RegExp(`^${PUB}/einwilligung/eec1\\.`));
    expect(doiConfirmUrl("t")).toBe(`${PUB}/einwilligung/bestaetigen/t`);
    expect(bookingPageUrl("meier", { lead: "l1" })).toBe(`${PUB}/meier?lead=l1`);
  });
});

describe("Abmelde-Link (GET, z. B. aus dem Mailprogramm)", () => {
  it("leitet auf die Abmeldeseite der Buchungsadresse, nie auf die interne Adresse", async () => {
    const req = new Request("http://localhost:8080/api/abmelden/rabc.def");
    const params = Promise.resolve({ token: "rabc.def" });
    expect((await abmeldenGet(req, { params })).headers.get("location")).toBe(`${APP}/abmelden/rabc.def`);
    process.env.PUBLIC_BOOKING_URL = PUB;
    const res = await abmeldenGet(req, { params: Promise.resolve({ token: "rabc.def" }) });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${PUB}/abmelden/rabc.def`);
  });
});
