// Modultest Bestandskunden (18.11.2026): Geburtstagsgrüße erst am Geburtstag, kein doppeltes Anschreiben aus zwei
// gleichzeitig laufenden Kampagnen, Ablauf/Wechsel ohne erkennbare Sparte mit Thema in der WhatsApp-Vorlage.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ notices: [] as Array<{ to: string; params?: string[]; purpose?: string }> }));

vi.mock("@/lib/whatsapp/templates", async (orig) => {
  const real = await orig<typeof import("@/lib/whatsapp/templates")>();
  return {
    ...real,
    sendWhatsAppNotice: async (o: { to: string; params?: string[]; purpose?: string }) => {
      st.notices.push(o);
      return { mode: "template" as const, conversationId: null, messageId: `wamid.mt.${st.notices.length}.${Math.random().toString(36).slice(2, 8)}` };
    },
  };
});
vi.mock("@/lib/push", () => {
  const rec = async () => ({ sent: 0, removed: 0, errors: [] });
  return { sendToAdmins: rec, sendToBuyersOfCustomer: rec, sendToUser: rec };
});

import { prisma } from "@/lib/prisma";
import { createCampaign, runCampaigns } from "@/lib/bestand/campaigns";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 8);
// Montag, 16.11.2026, 10:00 Uhr Berlin
const NOW = new Date("2026-11-16T09:00:00Z");
const noSleep = async () => {};

async function setup() {
  const c = await makeCustomer({ name: `Agentur Test ${uid()}`, existingCustomersEnabled: true });
  const owner = await makeBuyer(c.id, "owner");
  await prisma.whatsAppAccount.create({ data: { customerId: c.id, status: "connected" } });
  for (const purpose of ["campaign_birthday", "campaign_renewal"]) {
    await prisma.messageTemplate.create({ data: { customerId: c.id, name: `pg_${purpose}_${uid()}`, purpose, category: "marketing", status: "approved", body: "x" } });
  }
  return { c, owner };
}

const phone = () => `49151${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

describe("Bestandskunden-Modul: Versandregeln aus dem Modultest", () => {
  const customers: string[] = [];
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    for (const id of customers) await cleanupCustomer(id);
  });
  beforeEach(() => {
    st.notices = [];
  });

  it("Geburtstag: Glückwunsch geht erst am Geburtstag raus, nicht beim Start der Kampagne", async () => {
    const { c, owner } = await setup();
    customers.push(c.id);
    const tel = phone();
    // Geburtstag am Freitag, 20.11.
    await prisma.existingCustomer.create({ data: { customerId: c.id, firstName: "Erika", lastName: "Muster", phone: tel, whatsappConsent: "ja", birthday: new Date("1980-11-20") } });
    const campaign = await createCampaign({ customerId: c.id, occasion: "birthday", segment: { birthdayDays: 30 }, topic: null, dailyLimit: 50, createdById: owner.id, channelMode: "whatsapp", now: NOW });

    await runCampaigns(NOW, { sleep: noSleep });
    expect(st.notices.filter((n) => n.to === tel)).toHaveLength(0);
    expect(await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: campaign.id } })).toMatchObject({ status: "queued" });
    expect(await prisma.customerCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).toMatchObject({ status: "running" });

    // Am Geburtstag (Freitag, 10:00 Uhr Berlin)
    await runCampaigns(new Date("2026-11-20T09:00:00Z"), { sleep: noSleep });
    expect(st.notices.filter((n) => n.to === tel)).toHaveLength(1);
    expect(await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: campaign.id } })).toMatchObject({ status: "sent" });
  });

  it("Geburtstag verpasst (Kampagne war pausiert): Empfänger wird übersprungen, Kampagne wird fertig", async () => {
    const { c, owner } = await setup();
    customers.push(c.id);
    const tel = phone();
    await prisma.existingCustomer.create({ data: { customerId: c.id, firstName: "Erika", lastName: "Muster", phone: tel, whatsappConsent: "ja", birthday: new Date("1980-11-18") } });
    const campaign = await createCampaign({ customerId: c.id, occasion: "birthday", segment: { birthdayDays: 30 }, topic: null, dailyLimit: 50, createdById: owner.id, channelMode: "whatsapp", now: NOW });
    // Erst eine Woche nach dem Geburtstag wieder aktiv
    await runCampaigns(new Date("2026-11-25T09:00:00Z"), { sleep: noSleep });
    expect(st.notices.filter((n) => n.to === tel)).toHaveLength(0);
    expect(await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: campaign.id } })).toMatchObject({ status: "skipped", reason: "Geburtstag verpasst" });
    await runCampaigns(new Date("2026-11-25T10:00:00Z"), { sleep: noSleep });
    expect(await prisma.customerCampaign.findUniqueOrThrow({ where: { id: campaign.id } })).toMatchObject({ status: "done" });
  });

  it("Zwei laufende Kampagnen mit demselben Kunden: nur eine Nachricht, die zweite wird übersprungen", async () => {
    const { c, owner } = await setup();
    customers.push(c.id);
    const tel = phone();
    // Geburtstag heute und Ablauf in 2 Wochen: in beiden Kampagnen geplant
    await prisma.existingCustomer.create({
      data: { customerId: c.id, firstName: "Erika", lastName: "Muster", phone: tel, whatsappConsent: "ja", birthday: new Date("1980-11-16"), lines: ["KFZ"], nextRenewal: new Date("2026-12-01") },
    });
    const a = await createCampaign({ customerId: c.id, occasion: "renewal", segment: { renewalDays: 60 }, topic: null, dailyLimit: 50, createdById: owner.id, channelMode: "whatsapp", now: NOW });
    const b = await createCampaign({ customerId: c.id, occasion: "birthday", segment: { birthdayDays: 30 }, topic: null, dailyLimit: 50, createdById: owner.id, channelMode: "whatsapp", now: NOW });
    await runCampaigns(NOW, { sleep: noSleep });
    expect(st.notices.filter((n) => n.to === tel)).toHaveLength(1);
    const rs = await prisma.campaignRecipient.findMany({ where: { campaignId: { in: [a.id, b.id] } } });
    expect(rs.map((r) => r.status).sort()).toEqual(["sent", "skipped"]);
    expect(rs.find((r) => r.status === "skipped")?.reason).toBe("in den letzten 30 Tagen schon angeschrieben");
  });

  it("Ablauf/Wechsel ohne erkennbare Sparte: Vorlage bekommt trotzdem ein Thema (kein „Vertrag ()“)", async () => {
    const { c, owner } = await setup();
    customers.push(c.id);
    const tel = phone();
    const e = await prisma.existingCustomer.create({
      data: { customerId: c.id, firstName: "Erika", lastName: "Muster", phone: tel, whatsappConsent: "ja", lines: ["Sonstiges"], nextRenewal: new Date("2026-12-01") },
    });
    await prisma.existingContract.create({ data: { existingCustomerId: e.id, line: "Sonstiges", renewalDate: new Date("2026-12-01") } });
    await createCampaign({ customerId: c.id, occasion: "renewal", segment: { renewalDays: 60 }, topic: null, dailyLimit: 50, createdById: owner.id, channelMode: "whatsapp", now: NOW });
    await runCampaigns(NOW, { sleep: noSleep });
    const sent = st.notices.filter((n) => n.to === tel);
    expect(sent).toHaveLength(1);
    expect(sent[0].params?.[1]).toBe("Versicherung");
  });
});
