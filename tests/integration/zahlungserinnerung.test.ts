// Zahlungserinnerung (Ole, 16.11.2026): Cron-Lauf ohne Doppelversand, Aufgabe und Push für Ole, Stopp nach
// Zahlung, Sperrliste, „Später zahlen“ nur mit Freigabe am Angebot, Startverschiebung bei Zahlung nach dem Start.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  mails: [] as { to: string; subject: string; greeting: string; paragraphs: string[]; button?: { url: string } }[],
  pushes: [] as { title: string; tag?: string }[],
  wa: [] as { to: string; name: string; components: unknown }[],
}));
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendCustomerMail: vi.fn(async (o: (typeof st.mails)[number]) => (st.mails.push(o), { ok: true })),
}));
vi.mock("@/lib/push", async (orig) => ({
  ...(await orig<typeof import("@/lib/push")>()),
  sendToAdmins: vi.fn(async (p: { title: string; tag?: string }) => (st.pushes.push(p), { sent: 0, removed: 0, errors: [] })),
}));
vi.mock("@/lib/whatsapp/dialog360", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/dialog360")>()),
  sendTemplate: vi.fn(async (_k: string, to: string, name: string, _l: string, components: unknown) => {
    st.wa.push({ to, name, components });
    return { messageId: `wamid.z-${st.wa.length}-${Math.random().toString(36).slice(2, 6)}`, raw: {} };
  }),
}));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import { runZahlungserinnerungen, setzeErinnerungAdmin, setzeErinnerungPerToken, startNachZahlungVerschieben } from "@/lib/angebot-zahlungserinnerung-server";
import { ZAHLUNG_TEMPLATE_SIE } from "@/lib/angebot-zahlungserinnerung";
import { requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const contactIds: string[] = [];
const DAY = 86_400_000;
// Fester Zeitpunkt im Versandfenster: Mi 18.11.2026, 10:00 Berlin
const NOW = new Date("2026-11-18T09:00:00Z");

async function acceptedOffer(p: { acceptedAt?: Date; start?: string; allowPayLater?: boolean; isTest?: boolean; phone?: string | null; du?: boolean } = {}) {
  const tag = uid();
  const contact = await prisma.salesContact.create({
    data: { name: `Zahlung ${tag}`, email: `zahlung-${tag}@example.test`, firstName: "Paula", lastName: `Pay${tag}`, phone: p.phone === undefined ? `+49176${Math.floor(1e6 + Math.random() * 8e6)}` : p.phone },
  });
  contactIds.push(contact.id);
  const offer = await prisma.offer.create({
    data: {
      salesContactId: contact.id,
      number: `PG-T-${tag}`,
      token: `tok-${tag}-${uid()}${uid()}${uid()}`,
      status: "accepted",
      contactName: `Paula Pay${tag}`,
      company: `Agentur ${tag}`,
      email: `kunde-${tag}@example.test`,
      term: "12m",
      products: [{ name: "TKV", dailyBudget: 30 }],
      setupFee: 990,
      monthlyFee: 1190,
      softwareFee: 190,
      validUntil: new Date(NOW.getTime() + 14 * DAY),
      acceptedAt: p.acceptedAt ?? new Date(NOW.getTime() - 4 * DAY),
      startDate: new Date(`${p.start ?? "2027-01-01"}T12:00:00Z`),
      allowPayLater: p.allowPayLater ?? false,
      isTest: p.isTest ?? false,
      mailDu: p.du ?? false,
    },
  });
  return { offer, contact };
}

const mailsTo = (email: string | null) => st.mails.filter((m) => m.to === email);

describe("Zahlungserinnerung", () => {
  beforeAll(async () => {
    requireTestDb();
    process.env.APP_URL = "https://app.test";
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    await prisma.customer.upsert({ where: { id: SUPPORT_CUSTOMER_ID }, create: { id: SUPPORT_CUSTOMER_ID, name: "performancegrowth Support", plan: "internal" }, update: {} });
    await prisma.whatsAppAccount.upsert({
      where: { customerId: SUPPORT_CUSTOMER_ID },
      create: { customerId: SUPPORT_CUSTOMER_ID, status: "connected", apiKeyEnc: encryptSecret("k") },
      update: { status: "connected", apiKeyEnc: encryptSecret("k") },
    });
    await prisma.messageTemplate.upsert({
      where: { customerId_name_language: { customerId: SUPPORT_CUSTOMER_ID, name: ZAHLUNG_TEMPLATE_SIE, language: "de" } },
      create: { customerId: SUPPORT_CUSTOMER_ID, name: ZAHLUNG_TEMPLATE_SIE, language: "de", purpose: "vertrieb_zahlung", category: "utility", status: "approved", body: "x", auto: true },
      update: { status: "approved" },
    });
  });
  beforeEach(() => {
    st.mails.length = 0;
    st.pushes.length = 0;
    st.wa.length = 0;
  });
  afterAll(async () => {
    await prisma.salesContact.deleteMany({ where: { id: { in: contactIds } } });
    await prisma.salesCampaign.deleteMany({ where: { name: { startsWith: "Zahlung-Test " } } });
    await prisma.conversation.deleteMany({ where: { customerId: SUPPORT_CUSTOMER_ID } });
    await prisma.messageTemplate.deleteMany({ where: { customerId: SUPPORT_CUSTOMER_ID } });
    await prisma.whatsAppAccount.deleteMany({ where: { customerId: SUPPORT_CUSTOMER_ID } });
  });

  it("Cron: erste Erinnerung per Mail und WhatsApp, Aufgabe, kein Doppelversand, Push nach 7 Tagen einmalig", async () => {
    const { offer, contact } = await acceptedOffer();
    // Zwei Läufe gleichzeitig und ein dritter danach: genau eine Mail
    await Promise.all([runZahlungserinnerungen(NOW), runZahlungserinnerungen(NOW)]);
    await runZahlungserinnerungen(new Date(NOW.getTime() + 10 * 60_000));
    const mails = mailsTo(offer.email);
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toBe(`Zahlung für Ihr Angebot ${offer.number} einrichten`);
    expect(mails[0].button?.url).toBe(`https://app.test/angebot/${offer.token}/zahlen`);
    expect(mails[0].paragraphs.join(" ")).toMatch(/Ihr Start ist am 01\.01\.2027/);
    expect(st.wa.filter((w) => w.to === contact.phone!.replace(/\D/g, ""))).toMatchObject([{ name: ZAHLUNG_TEMPLATE_SIE }]);
    const after1 = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(after1.paymentReminderCount).toBe(1);
    expect(after1.paymentReminderLastAt?.toISOString()).toBe(NOW.toISOString());
    const tasks = await prisma.salesTask.findMany({ where: { contactId: contact.id } });
    expect(tasks.map((t) => t.title)).toEqual([`Zahlung offen: ${offer.company}`]);

    // 7 Tage später: zweite Erinnerung (wöchentlich) und einmaliger Push
    const later = new Date(NOW.getTime() + 7 * DAY);
    await runZahlungserinnerungen(later);
    await runZahlungserinnerungen(new Date(later.getTime() + 60_000));
    expect(mailsTo(offer.email)).toHaveLength(2);
    expect(mailsTo(offer.email)[1].subject).toMatch(/^Erinnerung: Zahlung/);
    expect(st.pushes.filter((p) => p.tag === `zahlung-offen:${offer.id}`)).toHaveLength(1);
    expect(await prisma.salesTask.count({ where: { contactId: contact.id } })).toBe(1);
  });

  it("Stopp sofort nach Zahlung bzw. Mandat und bei Ablehnung; Testangebote nie", async () => {
    const paid = await acceptedOffer();
    await prisma.offer.update({ where: { id: paid.offer.id }, data: { paymentStatus: "processing" } });
    const declined = await acceptedOffer();
    await prisma.offer.update({ where: { id: declined.offer.id }, data: { status: "declined" } });
    const test = await acceptedOffer({ isTest: true });
    await runZahlungserinnerungen(NOW);
    for (const o of [paid, declined, test]) expect(mailsTo(o.offer.email)).toHaveLength(0);
  });

  it("neuere Version ersetzt das angenommene Angebot: keine Erinnerung", async () => {
    const { offer, contact } = await acceptedOffer();
    await prisma.offer.create({
      data: {
        salesContactId: contact.id, number: `${offer.number}-2`, version: 2, token: `${offer.token}-v2`, status: "sent", contactName: offer.contactName, email: offer.email,
        term: "12m", products: [], setupFee: 0, monthlyFee: 0, softwareFee: 0, validUntil: offer.validUntil, createdAt: new Date(offer.createdAt.getTime() + 1000),
      },
    });
    await runZahlungserinnerungen(NOW);
    expect(mailsTo(offer.email)).toHaveLength(0);
  });

  it("Sperrliste: keine Mail und keine WhatsApp, Aufgabe für Ole trotzdem", async () => {
    const { offer, contact } = await acceptedOffer();
    const campaign = await prisma.salesCampaign.create({ data: { name: `Zahlung-Test ${uid()}` } });
    await prisma.salesCampaignLead.create({ data: { contactId: contact.id, campaignId: campaign.id, unsubscribed: true } });
    await runZahlungserinnerungen(NOW);
    expect(mailsTo(offer.email)).toHaveLength(0);
    expect(st.wa.filter((w) => w.to === contact.phone!.replace(/\D/g, ""))).toHaveLength(0);
    expect(await prisma.salesTask.count({ where: { contactId: contact.id } })).toBe(1);
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } })).paymentReminderCount).toBe(1);
  });

  it("„Später zahlen“ nur mit Freigabe am Angebot; Datum vom Admin immer; mit Datum vorher keine Erinnerung", async () => {
    const off = await acceptedOffer({ allowPayLater: false });
    const r = await setzeErinnerungPerToken(off.offer.token, "2026-12-07", NOW);
    expect(r.ok).toBe(false);
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: off.offer.id } })).paymentReminderAt).toBeNull();
    // Admin darf trotzdem (Fall Ole: Start 01.01.2027, erinnern am 07.12.2026)
    expect(await setzeErinnerungAdmin(off.offer.id, { date: "2026-12-07" }, NOW)).toEqual({ ok: true });
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: off.offer.id } })).paymentReminderAt?.toISOString().slice(0, 10)).toBe("2026-12-07");

    const on = await acceptedOffer({ allowPayLater: true, du: true });
    expect((await setzeErinnerungPerToken(on.offer.token, "2026-12-19", NOW)).ok).toBe(false); // nach Start − 14
    expect((await setzeErinnerungPerToken(on.offer.token, "2026-11-18", NOW)).ok).toBe(false); // heute
    expect(await setzeErinnerungPerToken(on.offer.token, "2026-12-07", NOW)).toEqual({ ok: true });

    await runZahlungserinnerungen(NOW);
    expect(mailsTo(off.offer.email)).toHaveLength(0);
    expect(mailsTo(on.offer.email)).toHaveLength(0);
    const at = new Date("2026-12-07T09:30:00Z");
    await runZahlungserinnerungen(at);
    expect(mailsTo(off.offer.email)).toHaveLength(1);
    expect(mailsTo(on.offer.email)).toHaveLength(1);
    // Du-Form, Vorlage ohne Freigabe: keine WhatsApp in Du-Form
    expect(mailsTo(on.offer.email)[0].greeting).toBe("Hallo Paula,");
    expect(mailsTo(on.offer.email)[0].paragraphs[0]).toMatch(/^du hast/);
    expect(st.wa.filter((w) => w.to === on.contact.phone!.replace(/\D/g, ""))).toHaveLength(0);
    // Neues Datum startet die Erinnerungen von vorn
    await setzeErinnerungAdmin(off.offer.id, { date: "2026-12-14" }, at);
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: off.offer.id } })).paymentReminderCount).toBe(0);
  });

  it("Zahlung nach dem Start: Start auf den nächsten Monatsersten, Mail an den Kunden, nur einmal", async () => {
    const { offer, contact } = await acceptedOffer({ start: "2026-11-01", acceptedAt: new Date("2026-10-20T10:00:00Z") });
    expect(await startNachZahlungVerschieben(offer.id, NOW)).toBe("2026-12-01");
    const o = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(o.startDate?.toISOString().slice(0, 10)).toBe("2026-12-01");
    expect(o.startShiftedFrom?.toISOString().slice(0, 10)).toBe("2026-11-01");
    expect((await prisma.salesContact.findUniqueOrThrow({ where: { id: contact.id } })).contractStart?.toISOString().slice(0, 10)).toBe("2026-12-01");
    expect(mailsTo(offer.email).map((m) => m.subject)).toEqual(["Ihr neues Startdatum: 01.12.2026"]);
    expect(await startNachZahlungVerschieben(offer.id, NOW)).toBeNull();
    // Start noch in der Zukunft: bleibt
    const fut = await acceptedOffer({ start: "2027-01-01" });
    expect(await startNachZahlungVerschieben(fut.offer.id, NOW)).toBeNull();
  });
});
