// Support-Nummer: Kunde/Interessent über die Telefonnummer, Filter, Zuordnen von Hand und
// WhatsApp-Terminbestätigung nach Calendly-Buchung (Ole, 15.11.2026).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sent: { to: string; name: string; components: unknown }[] = [];
vi.mock("@/lib/whatsapp/dialog360", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/dialog360")>()),
  sendTemplate: vi.fn(async (_k: string, to: string, name: string, _l: string, components: unknown) => {
    sent.push({ to, name, components });
    return { messageId: `wamid.t-${sent.length}-${Math.random().toString(36).slice(2, 6)}`, raw: {} };
  }),
  listTemplates: vi.fn(async () => []),
  createTemplate: vi.fn(async (_k: string, input: { name: string; language: string }) => ({ name: input.name, language: input.language, status: "PENDING", category: "UTILITY", rejectedReason: null })),
}));
vi.mock("@/lib/push", () => ({ sendToAdmins: vi.fn(async () => ({ sent: 0, failed: 0 })), sendToBuyersOfCustomer: vi.fn(async () => ({ sent: 0, failed: 0 })), sendToUser: vi.fn(async () => ({ sent: 0, failed: 0 })) }));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import { assignSupportConversation, refreshSupportLinks, supportBadge, SUPPORT_BADGE_SELECT, supportKindWhere } from "@/lib/whatsapp/support-contacts";
import { ERINNERUNG_TEMPLATE_NAME, GLEICH_TEMPLATE_NAME, runSalesWhatsAppReminders, sendTerminConfirmation, syncSupportTemplates, TERMIN_TEMPLATE_NAME } from "@/lib/vertrieb/termin-whatsapp";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const tag = Math.random().toString(36).slice(2, 8);
const PH_I = `49176${Math.floor(1e6 + Math.random() * 8e6)}`;
const PH_K = `49177${Math.floor(1e6 + Math.random() * 8e6)}`;
const PH_U = `49178${Math.floor(1e6 + Math.random() * 8e6)}`;

describe("Support-Nummer: Kunde oder Interessent", () => {
  let customerId = "";
  const contactIds: string[] = [];
  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    await prisma.customer.upsert({ where: { id: SUPPORT_CUSTOMER_ID }, create: { id: SUPPORT_CUSTOMER_ID, name: "performancegrowth Support", plan: "internal" }, update: {} });
    await prisma.whatsAppAccount.upsert({
      where: { customerId: SUPPORT_CUSTOMER_ID },
      create: { customerId: SUPPORT_CUSTOMER_ID, status: "connected", apiKeyEnc: encryptSecret("k") },
      update: { status: "connected", apiKeyEnc: encryptSecret("k"), templatesCheckedAt: null },
    });
    customerId = (await makeCustomer()).id;
    const i = await prisma.salesContact.create({ data: { name: `Interessent ${tag}`, email: `i-${tag}@example.test`, phone: `0${PH_I.slice(2, 5)} ${PH_I.slice(5)}`, stage: "TERMIN" } });
    const k = await prisma.salesContact.create({ data: { name: `Kunde ${tag}`, email: `k-${tag}@example.test`, phone: `+${PH_K}`, stage: "GEWONNEN", customerId } });
    contactIds.push(i.id, k.id);
    for (const p of [PH_I, PH_K, PH_U]) await prisma.conversation.create({ data: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: p, botActive: false, lastMessageAt: new Date() } });
  });
  afterAll(async () => {
    await prisma.conversation.deleteMany({ where: { customerId: SUPPORT_CUSTOMER_ID } });
    await prisma.messageTemplate.deleteMany({ where: { customerId: SUPPORT_CUSTOMER_ID } });
    await prisma.whatsAppAccount.deleteMany({ where: { customerId: SUPPORT_CUSTOMER_ID } });
    await prisma.salesContact.deleteMany({ where: { id: { in: contactIds } } });
    await cleanupCustomer(customerId);
  });

  it("ordnet über die Nummer zu und filtert", async () => {
    await refreshSupportLinks(new Date());
    const conv = (p: string) => prisma.conversation.findFirstOrThrow({ where: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: p }, select: { id: true, ...SUPPORT_BADGE_SELECT } });
    expect(supportBadge(await conv(PH_I)).kind).toBe("interessent");
    expect(supportBadge(await conv(PH_K))).toMatchObject({ kind: "kunde", href: `/admin/kunden/${customerId}` });
    expect(supportBadge(await conv(PH_U)).kind).toBe("unbekannt");
    const phones = async (k: "kunde" | "interessent" | "unbekannt") => (await prisma.conversation.findMany({ where: supportKindWhere(k), select: { contactPhone: true } })).map((c) => c.contactPhone);
    expect(await phones("kunde")).toContain(PH_K);
    expect(await phones("kunde")).not.toContain(PH_I);
    expect(await phones("interessent")).toContain(PH_I);
    expect(await phones("interessent")).not.toContain(PH_K);
    expect(await phones("unbekannt")).toContain(PH_U);
  });

  it("Zuordnung von Hand bleibt stehen, Lösen ordnet wieder automatisch zu", async () => {
    const u = await prisma.conversation.findFirstOrThrow({ where: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: PH_U } });
    expect(await assignSupportConversation(u.id, { type: "customer", id: customerId })).toBe(true);
    await refreshSupportLinks(new Date(Date.now() + 7 * 3600_000));
    const after = await prisma.conversation.findUniqueOrThrow({ where: { id: u.id }, select: { ...SUPPORT_BADGE_SELECT, contactLinkManual: true } });
    expect(after.contactLinkManual).toBe(true);
    expect(supportBadge(after).kind).toBe("kunde");
    await assignSupportConversation(u.id, null);
    expect(supportBadge(await prisma.conversation.findUniqueOrThrow({ where: { id: u.id }, select: SUPPORT_BADGE_SELECT })).kind).toBe("unbekannt");
  });

  it("Terminbestätigung: erst nach Freigabe der Vorlage, dann einmal", async () => {
    const meeting = await prisma.salesMeeting.create({ data: { contactId: contactIds[0], title: "Kennenlernen", startAt: new Date(Date.now() + 2 * 86400_000) } });
    const inv = { name: "Max Muster", reschedule_url: "https://calendly.com/r/1" };
    expect(await sendTerminConfirmation(meeting.id, inv, { type: "zoom", join_url: "https://zoom.us/j/1" })).toBe("no_template");
    expect(await syncSupportTemplates(new Date())).toMatchObject({ status: "pending" });
    await prisma.messageTemplate.update({ where: { customerId_name_language: { customerId: SUPPORT_CUSTOMER_ID, name: TERMIN_TEMPLATE_NAME, language: "de" } }, data: { status: "approved" } });
    expect(await sendTerminConfirmation(meeting.id, inv, { type: "zoom", join_url: "https://zoom.us/j/1" })).toBe("sent");
    expect(sent.at(-1)).toMatchObject({ to: PH_I, name: TERMIN_TEMPLATE_NAME });
    expect(await sendTerminConfirmation(meeting.id, inv, null)).toBe("sent");
    expect(sent).toHaveLength(1);
    const conv = await prisma.conversation.findFirstOrThrow({ where: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: PH_I }, include: { messages: true } });
    expect(conv.messages.at(-1)?.body).toContain("Guten Tag Max Muster");
    expect(conv.messages.at(-1)?.body).toContain("per Video: https://zoom.us/j/1");
    expect((await prisma.salesMeeting.findUniqueOrThrow({ where: { id: meeting.id } })).waConfirmStatus).toBe("sent");
  });

  it("Erinnerungen 24 Stunden und 1 Stunde vorher: erst nach Freigabe, je Art einmal, Abmeldung zählt", async () => {
    const now = new Date();
    const h = 3600_000;
    const PH_X = `49179${Math.floor(1e6 + Math.random() * 8e6)}`;
    const PH_STOP = `49170${Math.floor(1e6 + Math.random() * 8e6)}`;
    const mk = (startH: number, bookedH: number, phone: string, extra: Record<string, unknown> = {}) =>
      prisma.salesMeeting.create({
        data: { contactId: contactIds[0], title: "Meta-Leads-Call", startAt: new Date(now.getTime() + startH * h), createdAt: new Date(now.getTime() - bookedH * h), inviteePhone: `+${phone}`, inviteeName: "Max Muster", ...extra },
      });
    const day = await mk(23, 72, PH_X, { manageToken: `tok-${tag}-a`, joinUrl: "https://meet.google.com/abc" });
    const soon = await mk(0.75, 48, PH_X, { rescheduleUrl: "https://calendly.com/r/2" });
    const fresh = await mk(20, 1, PH_X);
    const stop = await mk(22, 72, PH_STOP);
    await prisma.conversation.create({ data: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: PH_STOP, botActive: false, optedOutAt: now } });
    const ours = () => sent.filter((x) => x.to === PH_X || x.to === PH_STOP).map((x) => x.name);
    const link = (t: string) => `https://app.example/termin/verwalten/${t}`;

    // Vorlagen eingereicht, aber noch nicht freigegeben: nichts senden, nichts markieren
    await syncSupportTemplates(now, { force: true });
    expect((await prisma.messageTemplate.findMany({ where: { customerId: SUPPORT_CUSTOMER_ID }, select: { name: true } })).map((t) => t.name)).toEqual(
      expect.arrayContaining([TERMIN_TEMPLATE_NAME, ERINNERUNG_TEMPLATE_NAME, GLEICH_TEMPLATE_NAME]),
    );
    await runSalesWhatsAppReminders(now, link);
    expect(ours()).toEqual([]);
    expect((await prisma.salesMeeting.findUniqueOrThrow({ where: { id: day.id } })).waReminderAt).toBeNull();

    await prisma.messageTemplate.updateMany({ where: { customerId: SUPPORT_CUSTOMER_ID, name: { in: [ERINNERUNG_TEMPLATE_NAME, GLEICH_TEMPLATE_NAME] } }, data: { status: "approved" } });
    await runSalesWhatsAppReminders(now, link);
    expect(ours().sort()).toEqual([ERINNERUNG_TEMPLATE_NAME, GLEICH_TEMPLATE_NAME].sort());
    const params = (name: string) => JSON.stringify(sent.find((x) => x.to === PH_X && x.name === name)?.components);
    expect(params(ERINNERUNG_TEMPLATE_NAME)).toContain(link(`tok-${tag}-a`));
    expect(params(ERINNERUNG_TEMPLATE_NAME)).toContain("per Video: https://meet.google.com/abc");
    expect(params(GLEICH_TEMPLATE_NAME)).toContain("https://calendly.com/r/2");
    // kurzfristig gebucht: keine 24-Stunden-Erinnerung; abgemeldet: nichts; beide markiert
    expect((await prisma.salesMeeting.findUniqueOrThrow({ where: { id: fresh.id } })).waReminderAt).not.toBeNull();
    expect((await prisma.salesMeeting.findUniqueOrThrow({ where: { id: stop.id } })).waReminderAt).not.toBeNull();
    expect((await prisma.salesMeeting.findUniqueOrThrow({ where: { id: soon.id } })).waSoonAt).not.toBeNull();
    // zweiter Lauf: kein Doppelversand
    await runSalesWhatsAppReminders(now, link);
    expect(ours()).toHaveLength(2);
  });

  it("ohne Nummer wird nichts gesendet", async () => {
    const c = await prisma.salesContact.create({ data: { name: `Ohne ${tag}`, email: `o-${tag}@example.test`, stage: "TERMIN" } });
    contactIds.push(c.id);
    const m = await prisma.salesMeeting.create({ data: { contactId: c.id, title: "Kennenlernen", startAt: new Date(Date.now() + 86400_000) } });
    expect(await sendTerminConfirmation(m.id, {}, null)).toBe("no_phone");
  });
});
