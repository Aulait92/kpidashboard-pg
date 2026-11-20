// Erinnerung vor Ablauf des Abschlussbonus (Ole, 18.11.2026): nur verschickte Angebote, Mail am Tag vor Ablauf
// (lange Frist), Mail und Push am letzten Tag, WhatsApp um 13 Uhr nur mit „WhatsApp erlaubt“ und freigegebener
// Vorlage, „später zahlen“ nur wenn erlaubt, Stopp bei Annahme, Ablehnung und Antwort, je Schritt höchstens einmal.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  mails: [] as { to: string; subject: string; greeting: string; paragraphs: string[]; button?: { label: string; url: string } }[],
  pushes: [] as { title: string; body: string; url?: string; tag?: string }[],
  wa: [] as { to: string; name: string; components: { parameters: { text: string }[] }[] }[],
}));
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendCustomerMail: vi.fn(async (o: (typeof st.mails)[number]) => (st.mails.push(o), { ok: true })),
}));
vi.mock("@/lib/push", async (orig) => ({
  ...(await orig<typeof import("@/lib/push")>()),
  sendToAdmins: vi.fn(async (p: (typeof st.pushes)[number]) => (st.pushes.push(p), { sent: 0, removed: 0, errors: [] })),
}));
vi.mock("@/lib/whatsapp/dialog360", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/dialog360")>()),
  sendTemplate: vi.fn(async (_k: string, to: string, name: string, _l: string, components: (typeof st.wa)[number]["components"]) => {
    st.wa.push({ to, name, components });
    return { messageId: `wamid.b-${st.wa.length}-${Math.random().toString(36).slice(2, 6)}`, raw: {} };
  }),
}));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { berlinTagesendeIso, eur } from "@/lib/offer-pricing";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import { runBonusErinnerungen, setzeWhatsappErlaubt, whatsappErlaubtStand } from "@/lib/vertrieb/bonus-erinnerung-server";
import { BONUS_TEMPLATE_DU, BONUS_TEMPLATE_SIE, BONUS_TEMPLATE_SPAETER_SIE, BONUS_VORLAGEN } from "@/lib/vertrieb/bonus-erinnerung";
import { requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
const contactIds: string[] = [];
const DAY = 86_400_000;
const B = eur(300);
// Frist: Fr 20.11.2026 23:59 Berlin (UTC+1)
const FRIST = "2026-11-20";
const VORTAG_9 = new Date("2026-11-19T08:05:00Z"); // Do 9:05 Berlin
const LETZTER_9 = new Date("2026-11-20T08:05:00Z"); // Fr 9:05 Berlin
const LETZTER_13 = new Date("2026-11-20T12:05:00Z"); // Fr 13:05 Berlin

async function sentOffer(
  p: { sentAt?: Date; status?: string; allowPayLater?: boolean; du?: boolean; isTest?: boolean; whatsapp?: boolean | null; salutation?: string | null; bonus?: number | null } = {},
) {
  const tag = uid();
  const contact = await prisma.salesContact.create({
    data: {
      name: `Agentur Bonus ${tag}`,
      email: `bonus-${tag}@example.test`,
      salutation: p.salutation === undefined ? "Herr" : p.salutation,
      firstName: "Bernd",
      lastName: `Bonus${tag}`,
      phone: `+49176${Math.floor(1e6 + Math.random() * 8e6)}`,
      whatsappErlaubt: p.whatsapp === undefined ? true : p.whatsapp,
    },
  });
  contactIds.push(contact.id);
  const sentAt = p.sentAt ?? new Date("2026-11-16T09:00:00Z");
  const offer = await prisma.offer.create({
    data: {
      salesContactId: contact.id,
      number: `PG-B-${tag}`,
      token: `tok-${tag}-${uid()}${uid()}${uid()}`,
      status: p.status ?? "sent",
      contactName: `Bernd Bonus${tag}`,
      company: `Agentur Bonus ${tag}`,
      email: `kunde-${tag}@example.test`,
      term: "12m",
      products: [{ name: "TKV", dailyBudget: 30 }],
      setupFee: 990,
      monthlyFee: 1190,
      softwareFee: 190,
      validUntil: new Date(sentAt.getTime() + 14 * DAY),
      sentAt: p.status === "draft" ? null : sentAt,
      createdAt: new Date(sentAt.getTime() - 60_000),
      abschlussBonus: p.bonus === undefined ? 300 : p.bonus,
      abschlussBonusBis: berlinTagesendeIso(FRIST),
      allowPayLater: p.allowPayLater ?? false,
      isTest: p.isTest ?? false,
      mailDu: p.du ?? false,
    },
  });
  return { offer, contact };
}

const mailsTo = (email: string | null) => st.mails.filter((m) => m.to === email);
const waTo = (phone: string | null) => st.wa.filter((w) => w.to === phone!.replace(/\D/g, ""));
const pushesFor = (id: string) => st.pushes.filter((p) => p.tag === `bonus-heute:${id}`);

/** Ganze Abfolge: Vortag 9 Uhr, letzter Tag 9 Uhr und 13 Uhr (jeweils zweimal, gegen Doppelversand). */
async function abfolge() {
  for (const t of [VORTAG_9, LETZTER_9, LETZTER_13]) {
    await Promise.all([runBonusErinnerungen(t), runBonusErinnerungen(t)]);
    await runBonusErinnerungen(new Date(t.getTime() + 30 * 60_000));
  }
}

async function vorlagenStatus(status: "approved" | "pending") {
  for (const v of BONUS_VORLAGEN) {
    await prisma.messageTemplate.upsert({
      where: { customerId_name_language: { customerId: SUPPORT_CUSTOMER_ID, name: v.name, language: "de" } },
      create: { customerId: SUPPORT_CUSTOMER_ID, name: v.name, language: "de", purpose: v.purpose, category: "utility", status, body: v.body, auto: true },
      update: { status },
    });
  }
}

describe("Bonus-Erinnerung", () => {
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
  });
  beforeEach(async () => {
    st.mails.length = 0;
    st.pushes.length = 0;
    st.wa.length = 0;
    await vorlagenStatus("approved");
  });
  afterAll(async () => {
    await prisma.salesContact.deleteMany({ where: { id: { in: contactIds } } });
    await prisma.conversation.deleteMany({ where: { customerId: SUPPORT_CUSTOMER_ID } });
    await prisma.messageTemplate.deleteMany({ where: { customerId: SUPPORT_CUSTOMER_ID } });
    await prisma.whatsAppAccount.deleteMany({ where: { customerId: SUPPORT_CUSTOMER_ID } });
  });

  it("lange Frist: beide Mails, Push einmal, eine WhatsApp; je Schritt nur einmal", async () => {
    const { offer, contact } = await sentOffer();
    await abfolge();
    const mails = mailsTo(offer.email);
    expect(mails.map((m) => m.subject)).toEqual([`Noch bis morgen: ${B} Abschlussbonus`, `Heute bis 23:59 Uhr: ${B} Abschlussbonus`]);
    expect(mails[0].greeting).toBe(`Hallo Herr ${contact.lastName},`);
    expect(mails[0].paragraphs[0]).toMatch(/gilt noch bis morgen, Freitag, 20\. November, 23:59 Uhr\.$/);
    expect(mails[1].button).toEqual({ label: "Angebot annehmen", url: `https://app.test/angebot/${offer.token}` });
    for (const m of mails) expect([m.subject, ...m.paragraphs].join(" ")).not.toMatch(/[–—]/);
    expect(pushesFor(offer.id)).toHaveLength(1);
    expect(pushesFor(offer.id)[0]).toMatchObject({ title: `⏰ Bonus läuft heute ab: ${offer.contactName}`, url: `/admin/neu/vertrieb/kontakte/${contact.id}` });
    const wa = waTo(contact.phone);
    expect(wa.map((w) => w.name)).toEqual([BONUS_TEMPLATE_SIE]);
    expect(wa[0].components[0].parameters.map((p) => p.text)).toEqual([`Herr ${contact.lastName}`, B, `https://app.test/angebot/${offer.token}`]);
    const fresh = await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } });
    expect(fresh.bonusMailVorabAt?.toISOString()).toBe(VORTAG_9.toISOString());
    expect(fresh.bonusMailLetzterAt?.toISOString()).toBe(LETZTER_9.toISOString());
    expect(fresh.bonusPushAt?.toISOString()).toBe(LETZTER_9.toISOString());
    expect(fresh.bonusWhatsAppStatus).toBe("sent");
  });

  it("kurze Frist (2 Tage nach Versand): nur die Mail am letzten Tag", async () => {
    const { offer } = await sentOffer({ sentAt: new Date("2026-11-18T10:00:00Z") });
    await abfolge();
    expect(mailsTo(offer.email).map((m) => m.subject)).toEqual([`Heute bis 23:59 Uhr: ${B} Abschlussbonus`]);
    expect(pushesFor(offer.id)).toHaveLength(1);
  });

  it("Frist am Versandtag: gar nichts (die Angebotsmail kam gerade erst)", async () => {
    const { offer } = await sentOffer({ sentAt: new Date("2026-11-20T07:00:00Z") });
    await abfolge();
    expect(mailsTo(offer.email)).toHaveLength(0);
    expect(pushesFor(offer.id)).toHaveLength(0);
  });

  it("Entwurf, Testangebot und Angebot ohne Bonus bekommen nichts", async () => {
    const draft = await sentOffer({ status: "draft" });
    const test = await sentOffer({ isTest: true });
    const ohne = await sentOffer({ bonus: null });
    await abfolge();
    for (const o of [draft, test, ohne]) {
      expect(mailsTo(o.offer.email)).toHaveLength(0);
      expect(pushesFor(o.offer.id)).toHaveLength(0);
      expect(waTo(o.contact.phone)).toHaveLength(0);
    }
  });

  it("ohne WhatsApp-Erlaubnis keine WhatsApp (Mails und Push trotzdem)", async () => {
    const { offer, contact } = await sentOffer({ whatsapp: null });
    await abfolge();
    expect(waTo(contact.phone)).toHaveLength(0);
    expect(mailsTo(offer.email)).toHaveLength(2);
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } })).bonusWhatsAppStatus).toBe("nicht_erlaubt");
  });

  it("WhatsApp erlaubt automatisch nach Terminbestätigung per WhatsApp; von Hand entfernt gilt", async () => {
    const { contact } = await sentOffer({ whatsapp: null });
    expect(await whatsappErlaubtStand(contact.id)).toEqual({ erlaubt: false, quelle: null });
    await prisma.salesMeeting.create({
      data: { contactId: contact.id, title: "Meta-Leads-Call", startAt: new Date("2026-11-10T10:00:00Z"), endAt: new Date("2026-11-10T10:30:00Z"), waConfirmStatus: "sent" },
    });
    expect(await whatsappErlaubtStand(contact.id)).toEqual({ erlaubt: true, quelle: "termin" });
    await setzeWhatsappErlaubt(contact.id, false);
    expect(await whatsappErlaubtStand(contact.id)).toEqual({ erlaubt: false, quelle: "manuell" });
  });

  it("Vorlage noch nicht freigegeben: keine WhatsApp, nur protokolliert", async () => {
    await vorlagenStatus("pending");
    const { offer, contact } = await sentOffer();
    await abfolge();
    expect(waTo(contact.phone)).toHaveLength(0);
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } })).bonusWhatsAppStatus).toBe("no_template");
    const log = await prisma.salesActivity.findMany({ where: { contactId: contact.id, outcome: { contains: "nicht freigegeben" } } });
    expect(log).toHaveLength(1);
  });

  it("später zahlen an: Satz in Mail und Vorlage; aus: weggelassen; Du-Form", async () => {
    const an = await sentOffer({ allowPayLater: true });
    const aus = await sentOffer({ du: true });
    await abfolge();
    expect(mailsTo(an.offer.email)[1].paragraphs).toContain("Sie können jetzt annehmen und erst später zahlen.");
    expect(waTo(an.contact.phone).map((w) => w.name)).toEqual([BONUS_TEMPLATE_SPAETER_SIE]);
    const ausMails = mailsTo(aus.offer.email);
    expect(ausMails.flatMap((m) => m.paragraphs).join(" ")).not.toMatch(/später zahlen/);
    expect(ausMails[1].greeting).toBe("Hallo Bernd,");
    expect(ausMails[1].paragraphs[0]).toMatch(/Dein Abschlussbonus von 300\s€/);
    expect(waTo(aus.contact.phone).map((w) => w.name)).toEqual([BONUS_TEMPLATE_DU]);
    expect(waTo(aus.contact.phone)[0].components[0].parameters[0].text).toBe("Bernd");
  });

  it("angenommen bzw. abgelehnt stoppt alles", async () => {
    const accepted = await sentOffer();
    const declined = await sentOffer();
    await runBonusErinnerungen(VORTAG_9);
    expect(mailsTo(accepted.offer.email)).toHaveLength(1);
    await prisma.offer.update({ where: { id: accepted.offer.id }, data: { status: "accepted", acceptedAt: VORTAG_9 } });
    await prisma.offer.update({ where: { id: declined.offer.id }, data: { status: "declined", declinedAt: VORTAG_9 } });
    st.mails.length = 0;
    await runBonusErinnerungen(LETZTER_9);
    await runBonusErinnerungen(LETZTER_13);
    for (const o of [accepted, declined]) {
      expect(mailsTo(o.offer.email)).toHaveLength(0);
      expect(pushesFor(o.offer.id)).toHaveLength(0);
      expect(waTo(o.contact.phone)).toHaveLength(0);
    }
  });

  it("Antwort per WhatsApp: keine Mail und keine WhatsApp mehr, Push an Ole bleibt", async () => {
    const { offer, contact } = await sentOffer();
    const conv = await prisma.conversation.create({
      data: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: contact.phone!.replace(/\D/g, ""), salesContactId: contact.id, status: "open" },
    });
    await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", kind: "text", body: "Ich schaue es mir an", createdAt: new Date("2026-11-17T10:00:00Z") } });
    await abfolge();
    expect(mailsTo(offer.email)).toHaveLength(0);
    expect(waTo(contact.phone)).toHaveLength(0);
    expect(pushesFor(offer.id)).toHaveLength(1);
    expect(pushesFor(offer.id)[0].body).toMatch(/hat geantwortet/);
  });

  it("neuere Version ersetzt das Angebot: nichts", async () => {
    const { offer, contact } = await sentOffer();
    await prisma.offer.create({
      data: {
        salesContactId: contact.id,
        number: `${offer.number}-2`,
        token: `${offer.token}-v2`,
        status: "draft",
        contactName: offer.contactName,
        term: "12m",
        products: [],
        setupFee: 990,
        monthlyFee: 1190,
        softwareFee: 190,
        validUntil: offer.validUntil,
        createdAt: new Date(offer.createdAt.getTime() + DAY),
      },
    });
    await abfolge();
    expect(mailsTo(offer.email)).toHaveLength(0);
    expect(pushesFor(offer.id)).toHaveLength(0);
  });
});
