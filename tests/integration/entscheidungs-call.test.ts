import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Entscheidungs-Call (Ole, 17.11.2026): Ist er schon gebucht, nennen Angebotsmail und Zahlungserinnerung den Termin
// statt des Buchungslinks. Geprüft wird beim Versand, also nennt auch eine Erinnerung nach einer späteren Buchung den Termin.
const st = vi.hoisted(() => ({
  offerMails: [] as { to: string; text: string; html: string }[],
  mails: [] as { to: string; paragraphs: string[] }[],
}));
vi.mock("@/lib/mail-guard", () => ({
  wasBlocked: () => false,
  MAIL_BLOCKED_TEXT: "gesperrt",
  mailClient: () => ({ emails: { send: async (m: (typeof st.offerMails)[number]) => (st.offerMails.push(m), { error: null }) } }),
}));
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendCustomerMail: vi.fn(async (o: (typeof st.mails)[number]) => (st.mails.push(o), { ok: true })),
}));
vi.mock("@/lib/push", async (orig) => ({
  ...(await orig<typeof import("@/lib/push")>()),
  sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getCurrentSession: async () => ({ userId: "admin-test", email: "admin@example.test", role: "ADMIN" }),
}));

import { prisma } from "@/lib/prisma";
import { createOffer } from "@/lib/offers";
import { addDaysIso, berlinTodayIso } from "@/lib/offer-pricing";
import { sendOfferEmailAction } from "@/app/admin/vertrieb/offer-actions";
import { runZahlungserinnerungen } from "@/lib/angebot-zahlungserinnerung-server";
import { entscheidungsCallStand } from "@/lib/vertrieb/entscheidungs-call-server";
import { loadBookingType, VERTRIEB_CUSTOMER_ID } from "@/lib/vertrieb/buchung";
import { requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const DAY = 86_400_000;
const contactIds: string[] = [];
// Do 16.01.2031, 10:00 Uhr Berlin: sicher in der Zukunft, damit der Test datumsunabhängig bleibt
const CALL = new Date("2031-01-16T09:00:00Z");

async function kontakt() {
  const tag = uid();
  const c = await prisma.salesContact.create({
    data: { name: `Agentur EC ${tag}`, firstName: "Erika", lastName: `Call${tag}`, salutation: "Frau", email: `ec-${tag}@example.test` },
  });
  contactIds.push(c.id);
  return c;
}

async function angebot(contactId: string, email: string) {
  return createOffer(
    { salesContactId: contactId },
    { contactName: "Erika Call", email, term: "12m", products: [{ name: "TKV-Katze", dailyBudget: 30 }], startDate: addDaysIso(berlinTodayIso(), 20) },
    null,
  );
}

async function entscheidungsCall(contactId: string, startAt: Date, extra: Record<string, unknown> = {}) {
  const t = (await loadBookingType("entscheidung"))!;
  return prisma.salesMeeting.create({
    data: {
      contactId,
      title: t.title,
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      location: "Videocall",
      status: "GEPLANT",
      bookingTypeId: t.id,
      manageToken: `ec-${uid()}${uid()}${uid()}`,
      ...extra,
    },
  });
}

describe("Entscheidungs-Call: gebuchter Termin statt Buchungslink", () => {
  beforeAll(async () => {
    requireTestDb();
    process.env.RESEND_API_KEY = "re_test";
    process.env.APP_URL = "https://app.test";
    // Entscheidungs-Call online buchbar: Vertriebskalender verbunden
    await prisma.customer.upsert({ where: { id: VERTRIEB_CUSTOMER_ID }, create: { id: VERTRIEB_CUSTOMER_ID, name: "performancegrowth Vertrieb", plan: "internal" }, update: {} });
    await prisma.calendarConnection.upsert({
      where: { customerId: VERTRIEB_CUSTOMER_ID },
      create: { customerId: VERTRIEB_CUSTOMER_ID, provider: "google", status: "connected", accessTokenEnc: "x", scope: "calendar" },
      update: { status: "connected" },
    });
  });
  beforeEach(() => {
    st.offerMails.length = 0;
    st.mails.length = 0;
  });
  afterAll(async () => {
    delete process.env.RESEND_API_KEY;
    await prisma.offer.deleteMany({ where: { salesContactId: { in: contactIds } } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contactIds } } });
    await prisma.calendarConnection.deleteMany({ where: { customerId: VERTRIEB_CUSTOMER_ID } });
  });

  it("noch nicht gebucht: Angebotsmail mit persönlichem Buchungslink, Hinweis im Admin", async () => {
    const c = await kontakt();
    const offer = await angebot(c.id, c.email!);
    const res = await sendOfferEmailAction(offer.id);
    expect(res).toEqual({ ok: true, hinweis: "Noch kein Entscheidungs-Call gebucht: die Mail enthält den Buchungslink" });
    const m = st.offerMails[0];
    expect(m.text).toContain("Hier wählen Sie direkt einen Termin für Ihren Entscheidungs-Call:\nhttps://app.test/termin/entscheidung?k=");
    expect(m.text).not.toContain("Wir sprechen am");
    expect(m.html).toContain(">Termin wählen</a>");
  });

  it("schon gebucht: Angebotsmail nennt den Termin mit Link zum Verschieben, kein Buchungslink", async () => {
    const c = await kontakt();
    const meeting = await entscheidungsCall(c.id, CALL);
    const offer = await angebot(c.id, c.email!);
    const res = await sendOfferEmailAction(offer.id);
    expect(res).toEqual({ ok: true, hinweis: "Entscheidungs-Call ist gebucht: Do 16.01. 10 Uhr, die Mail nennt den Termin" });
    const m = st.offerMails[0];
    expect(m.text).toContain(
      `Wir sprechen am Donnerstag, 16. Januar um 10:00 Uhr per Video über Ihre Fragen und den Start. Den Link finden Sie in Ihrer Kalendereinladung. Falls etwas dazwischenkommt: https://app.test/termin/verwalten/${meeting.manageToken}`,
    );
    expect(m.text).not.toContain("/termin/entscheidung?k=");
    expect(m.html).not.toContain("/termin/entscheidung?k=");
    expect(m.html).toContain(">Termin verschieben</a>");
  });

  it("ohne Bitte um den Entscheidungs-Call: weder Termin noch Buchungslink, gemerkt am Angebot", async () => {
    const c = await kontakt();
    const offer = await angebot(c.id, c.email!);
    const res = await sendOfferEmailAction(offer.id, { ohneEntscheidungsCall: true });
    expect(res).toEqual({ ok: true });
    const m = st.offerMails[0];
    expect(m.text).not.toContain("Entscheidungs-Call");
    expect(m.text).not.toContain("/termin/entscheidung?k=");
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } })).ohneEntscheidungsCall).toBe(true);
  });

  it("zählt: Calendly (Titel), vom Team eingetragen; zählt nicht: abgesagt, vorbei, Meta-Leads-Call", async () => {
    const now = new Date("2030-06-01T08:00:00Z");
    const calendly = await kontakt();
    await prisma.salesMeeting.create({
      data: { contactId: calendly.id, title: "Entscheidungs-Call", startAt: CALL, status: "GEPLANT", location: "zoom", rescheduleUrl: "https://calendly.com/reschedulings/x" },
    });
    expect(await entscheidungsCallStand(calendly.id, now)).toEqual({ art: "gebucht", startAt: CALL, telefon: false, verschiebenUrl: "https://calendly.com/reschedulings/x" });

    const telefon = await kontakt();
    await entscheidungsCall(telefon.id, CALL, { location: "Telefon", utmSource: "admin" });
    expect(await entscheidungsCallStand(telefon.id, now)).toMatchObject({ art: "gebucht", telefon: true });

    const andere = await kontakt();
    await entscheidungsCall(andere.id, CALL, { status: "ABGESAGT" });
    await entscheidungsCall(andere.id, new Date(now.getTime() - DAY));
    const leads = (await loadBookingType(null))!;
    await prisma.salesMeeting.create({ data: { contactId: andere.id, title: leads.title, bookingTypeId: leads.id, startAt: CALL, status: "GEPLANT" } });
    expect(await entscheidungsCallStand(andere.id, now)).toMatchObject({ art: "link" });
    expect(await entscheidungsCallStand(null, now)).toEqual({ art: "keiner" });
  });

  it("später gebucht: die nächste Zahlungserinnerung nennt den Termin", async () => {
    // Mi 18.11.2026, 10:00 Berlin (Versandfenster); Angebot vor 4 Tagen angenommen, noch nicht bezahlt
    const NOW = new Date("2026-11-18T09:00:00Z");
    const c = await kontakt();
    const offer = await prisma.offer.create({
      data: {
        salesContactId: c.id,
        number: `PG-EC-${uid()}`,
        token: `tok-ec-${uid()}${uid()}${uid()}${uid()}`,
        status: "accepted",
        contactName: "Erika Call",
        email: c.email,
        term: "12m",
        products: [{ name: "TKV", dailyBudget: 30 }],
        setupFee: 990,
        monthlyFee: 1190,
        softwareFee: 190,
        validUntil: new Date(NOW.getTime() + 14 * DAY),
        acceptedAt: new Date(NOW.getTime() - 4 * DAY),
        startDate: new Date("2027-01-01T12:00:00Z"),
      },
    });
    const mails = () => st.mails.filter((m) => m.to === offer.email);

    await runZahlungserinnerungen(NOW);
    expect(mails()).toHaveLength(1);
    expect(mails()[0].paragraphs.join(" ")).not.toContain("Wir sprechen am");

    // Nach der ersten Erinnerung gebucht (Fr 27.11.2026, 10:00 Berlin)
    const meeting = await entscheidungsCall(c.id, new Date("2026-11-27T09:00:00Z"));
    await runZahlungserinnerungen(new Date(NOW.getTime() + 7 * DAY));
    expect(mails()).toHaveLength(2);
    expect(mails()[1].paragraphs).toContain(
      `Wir sprechen am Freitag, 27. November um 10:00 Uhr per Video über Ihre Fragen und den Start. Den Link finden Sie in Ihrer Kalendereinladung. Falls etwas dazwischenkommt: https://app.test/termin/verwalten/${meeting.manageToken}`,
    );
  });
});
