import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Push und Telegram gemockt: keine externen Aufrufe
const push = vi.hoisted(() => ({ sendToAdmins: vi.fn(async () => ({ sent: 1, removed: 0, errors: [] as string[] })) }));
vi.mock("@/lib/push", async (orig) => ({ ...(await orig<typeof import("@/lib/push")>()), sendToAdmins: push.sendToAdmins }));
const tg = vi.hoisted(() => ({ sendTelegramText: vi.fn(async () => ({ messageId: 1 })) }));
vi.mock("@/lib/telegram", async (orig) => ({ ...(await orig<typeof import("@/lib/telegram")>()), sendTelegramText: tg.sendTelegramText }));

import { prisma } from "@/lib/prisma";
import { assignPendingLeads, ingestLead, type IncomingLead } from "@/lib/lead-intake";
import { handleInboundLead } from "@/lib/vertrieb/inbound";
import { ladeMetaLeads } from "@/lib/vertrieb/meta-leads";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 10);
const ziffern = () => String(Date.now()) + String(Math.floor(Math.random() * 1e5)).padStart(5, "0");
const vertriebForm = `9${ziffern().slice(0, 14)}`;
const kundenForm = `8${ziffern().slice(0, 14)}`;
const emails: string[] = [];

const lead = (over: Partial<IncomingLead> = {}, mail = `vermittler-${uid()}@example.com`): IncomingLead => {
  emails.push(mail);
  return {
    externalId: ziffern(),
    formId: vertriebForm,
    pageId: "page-1",
    createdAt: new Date().toISOString(),
    campaignName: "Vermittler Okt",
    adName: "Video A",
    // Eigener Nachname je Lead (Name + Ort erkennt sonst denselben Kontakt)
    fields: { full_name: `Max Muster${uid().replace(/\d/g, "x")}`, email: mail, phone_number: "0171 1234567", agentur: "Allianz Muster", city: "Köln", "wie_viele_leads?": "20" },
    ...over,
  };
};

describe("Meta-Formular → Vertrieb", () => {
  let customerId = "";
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
    await prisma.vertriebLeadForm.create({ data: { formId: vertriebForm, formName: "Vermittler-Formular" } });
    await prisma.leadSource.create({ data: { formId: kundenForm, customerId, productKey: "Privatschutz" } });
  });
  beforeEach(() => {
    push.sendToAdmins.mockClear();
    tg.sendTelegramText.mockClear();
  });
  afterAll(async () => {
    await prisma.salesContact.deleteMany({ where: { email: { in: emails } } });
    await prisma.salesInboundLead.deleteMany({ where: { email: { in: emails } } });
    await prisma.vertriebLeadForm.deleteMany({ where: { formId: { in: [vertriebForm, `${vertriebForm}1`] } } });
    await prisma.unassignedLead.deleteMany({ where: { formId: `${vertriebForm}1` } });
    await prisma.lead.deleteMany({ where: { customerId } });
    await prisma.leadSource.deleteMany({ where: { customerId } });
    await cleanupCustomer(customerId);
  });

  it("Lead eines Vertriebsformulars → Kontakt, Eingang, Aufgabe, Push; kein Kunden-Lead", async () => {
    const inc = lead();
    const res = await ingestLead(inc, "meta");
    expect(res.status).toBe("vertrieb");
    expect(await prisma.lead.count({ where: { externalId: inc.externalId! } })).toBe(0);
    const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: res.contactId! }, include: { tasks: true, inboundLeads: true } });
    expect(c.name).toBe("Allianz Muster");
    expect(c.firstName).toBe("Max");
    expect(c.city).toBe("Köln");
    expect(c.customerSource).toBe("META_ADS");
    expect(c.tasks).toHaveLength(1);
    expect(c.tasks[0].type).toBe("ANRUF");
    expect(c.inboundLeads[0]).toMatchObject({ externalId: inc.externalId, source: "META_ADS", form: "Vermittler-Formular", ad: "Video A" });
    expect(c.inboundLeads[0].answers).toContain("wie viele leads?: 20");
    expect(push.sendToAdmins).toHaveBeenCalledTimes(1);
    expect(push.sendToAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Neuer Vermittler-Lead", body: `${inc.fields.full_name}, Allianz Muster, Köln`, url: `/admin/neu/vertrieb/kontakte/${c.id}` }),
    );
    const f = await prisma.vertriebLeadForm.findUniqueOrThrow({ where: { formId: vertriebForm } });
    expect(f.lastLeadAt).not.toBeNull();
  });

  it("gleiche Lead-ID zweimal (Meta erneut, oder Zap mit ID) → ein Kontakt, ein Eingang, ein Push", async () => {
    const inc = lead();
    const a = await ingestLead(inc, "meta");
    const b = await ingestLead(inc, "meta");
    expect(b.status).toBe("duplicate");
    // Zap mit derselben ID über /api/vertrieb/leads/webhook
    const z = await handleInboundLead({ id: inc.externalId, full_name: "Max Muster", email: emails.at(-1), agentur: "Allianz Muster" }, "META_ADS", { notify: true });
    expect("duplicate" in z && z.duplicate).toBe(true);
    expect(await prisma.salesInboundLead.count({ where: { contactId: a.contactId! } })).toBe(1);
    expect(await prisma.salesTask.count({ where: { contactId: a.contactId! } })).toBe(1);
    expect(push.sendToAdmins).toHaveBeenCalledTimes(1);
  });

  it("Zap ohne Lead-ID und danach direkt (oder umgekehrt) → kein doppelter Kontakt", async () => {
    const mail = `vermittler-${uid()}@example.com`;
    const zap = await handleInboundLead({ full_name: "Erika Beispiel", email: mail, phone: "0171 7654321", agentur: "Agentur Beispiel" }, "META_ADS", { notify: true });
    expect("contactId" in zap && zap.created).toBe(true);
    const inc = lead({}, mail);
    const direkt = await ingestLead(inc, "meta");
    expect(direkt.status).toBe("duplicate");
    expect(await prisma.salesContact.count({ where: { email: mail } })).toBe(1);
    const eingaenge = await prisma.salesInboundLead.findMany({ where: { email: mail } });
    expect(eingaenge).toHaveLength(1);
    // Die Lead-ID wird nachgetragen: ein späterer Zap mit ID ist ebenfalls Dublette
    expect(eingaenge[0].externalId).toBe(inc.externalId);
    expect(push.sendToAdmins).toHaveBeenCalledTimes(1);
  });

  it("Telegram zusätzlich, wenn eingerichtet; abschaltbar", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test";
    process.env.TELEGRAM_ADMIN_USER_ID = "42";
    try {
      await ingestLead(lead(), "meta");
      expect(tg.sendTelegramText).toHaveBeenCalledWith(expect.objectContaining({ chatId: "42", text: expect.stringContaining("Neuer Vermittler-Lead") }));
      tg.sendTelegramText.mockClear();
      process.env.VERTRIEB_LEAD_TELEGRAM = "aus";
      await ingestLead(lead(), "meta");
      expect(tg.sendTelegramText).not.toHaveBeenCalled();
    } finally {
      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_ADMIN_USER_ID;
      delete process.env.VERTRIEB_LEAD_TELEGRAM;
    }
  });

  it("Kundenformulare unverändert: Kunden-Lead, kein Vertriebskontakt, kein Vermittler-Push", async () => {
    const inc = lead({ formId: kundenForm });
    const res = await ingestLead(inc, "meta");
    expect(res.status).toBe("created");
    expect(await prisma.lead.count({ where: { externalId: inc.externalId!, customerId } })).toBe(1);
    expect(await prisma.salesInboundLead.count({ where: { externalId: inc.externalId! } })).toBe(0);
    expect(push.sendToAdmins).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Neuer Vermittler-Lead" }));
  });

  it("wartende Leads (ohne Zuordnung) gehen beim Zuordnen in den Vertrieb", async () => {
    const formId = `${vertriebForm}1`;
    const inc = lead({ formId });
    expect((await ingestLead(inc, "meta")).status).toBe("unassigned");
    await prisma.vertriebLeadForm.create({ data: { formId } });
    expect(await assignPendingLeads(formId)).toBe(1);
    expect(await prisma.unassignedLead.count({ where: { formId, resolvedAt: null } })).toBe(0);
    expect(await prisma.salesInboundLead.count({ where: { externalId: inc.externalId! } })).toBe(1);
  });

  it("Ansicht Meta-Leads: Leads im Zeitraum mit Stand und Trichter", async () => {
    const d = await ladeMetaLeads({});
    expect(d.gesamt).toBeGreaterThan(0);
    expect(d.trichter[0].anzahl).toBe(d.gesamt);
    const z = d.zeilen.find((x) => x.formular === "Vermittler-Formular")!;
    expect(z.stand.key).toBe("neu");
    expect(z.naechster.title).toBe("Neuen Meta Ads-Lead anrufen");
    expect(z.naechster.rot).toBe(false);
  });
});
