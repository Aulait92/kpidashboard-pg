// Support-Nummer: Kunde/Interessent über die Telefonnummer, Filter, Zuordnen von Hand und
// WhatsApp-Terminbestätigung nach Calendly-Buchung (Ole, 15.11.2026).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sent: { to: string; name: string; components: unknown }[] = [];
const texts: { to: string; body: string }[] = [];
const failFor = new Set<string>();
vi.mock("@/lib/whatsapp/dialog360", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/dialog360")>()),
  sendText: vi.fn(async (_k: string, to: string, body: string) => {
    texts.push({ to, body });
    return { messageId: `wamid.x-${texts.length}-${Math.random().toString(36).slice(2, 6)}`, raw: {} };
  }),
  sendTemplate: vi.fn(async (_k: string, to: string, name: string, _l: string, components: unknown) => {
    if (failFor.has(to)) throw new Error(`360dialog 500: Fehler für ${to}`);
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
import {
  ERINNERUNG_TEMPLATE_NAME,
  GLEICH_TEMPLATE_NAME,
  MAX_REMINDER_TRIES,
  runSalesWhatsAppReminders,
  sendTerminConfirmation,
  syncSupportTemplates,
  TERMIN_TEMPLATE_NAME,
  urspruenglichGebucht,
} from "@/lib/vertrieb/termin-whatsapp";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { SUPPORT_STOP_CONFIRMATION } from "@/lib/whatsapp/stopp";
import { handleCalendlyWebhook } from "@/lib/vertrieb/calendly";
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
    expect(supportBadge(await conv(PH_K))).toMatchObject({ kind: "kunde", href: `/admin/neu/kunden/${customerId}` });
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
    expect(conv.messages.at(-1)?.body).toContain("Guten Tag Herr Muster");
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

  it("Fassung 2 (Ole Kannapinn): Variante nach Terminart, Anrede Frau Nachname, Rückfall auf Fassung 1 bei MARKETING", async () => {
    const PH_V = `49175${Math.floor(1e6 + Math.random() * 8e6)}`;
    const c = await prisma.salesContact.create({
      data: { name: `Agentur V2 ${tag}`, email: `v2-${tag}@example.test`, phone: `+${PH_V}`, salutation: "Frau", firstName: "Julia", lastName: `Schneider${tag}`, stage: "TERMIN" },
    });
    contactIds.push(c.id);
    const tpl = (name: string, category = "utility") =>
      prisma.messageTemplate.updateMany({ where: { customerId: SUPPORT_CUSTOMER_ID, name }, data: { status: "approved", category } });
    const ofV = () => sent.filter((x) => x.to === PH_V);
    const params = (i: number) => JSON.stringify(ofV()[i]?.components);

    // Bestätigung mit Videolink: Link-Variante, sobald freigegeben
    const now = new Date("2030-03-05T10:00:00Z"); // 11:00 Berlin
    const m = await prisma.salesMeeting.create({ data: { contactId: c.id, title: "Meta-Leads-Call", startAt: new Date("2030-03-08T09:00:00Z"), joinUrl: "https://meet.google.com/v2" } });
    await tpl("pg_vertrieb_termin_link_v2");
    expect(await sendTerminConfirmation(m.id, { name: `Julia Schneider${tag}`, reschedule_url: "https://app.example/termin/verwalten/v2" }, { type: "video", join_url: "https://meet.google.com/v2" }, now)).toBe("sent");
    expect(ofV()[0].name).toBe("pg_vertrieb_termin_link_v2");
    expect(params(0)).toContain(`Frau Schneider${tag}`);
    expect(params(0)).toContain("https://meet.google.com/v2");
    const conv = await prisma.conversation.findFirstOrThrow({ where: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: PH_V }, include: { messages: true } });
    expect(conv.messages.at(-1)?.body).toMatch(/^Guten Tag Frau Schneider\w+, danke für Ihre Buchung! .*Viele Grüße, Ole Kannapinn$/);

    // 24 Stunden vorher, Entscheidungs-Call am Telefon: Variante als MARKETING eingestuft → Fassung 1
    const day = await prisma.salesMeeting.create({
      data: { contactId: c.id, title: "Entscheidungs-Call", startAt: new Date("2030-03-06T09:00:00Z"), createdAt: new Date("2030-03-01T09:00:00Z"), location: "Telefon" },
    });
    // 1 Stunde vorher am Telefon: Fassung 2
    const soon = await prisma.salesMeeting.create({
      data: { contactId: c.id, title: "Meta-Leads-Call", startAt: new Date(now.getTime() + 50 * 60_000), createdAt: new Date("2030-03-01T09:00:00Z"), location: "Telefon" },
    });
    await tpl("pg_vertrieb_erinnerung_ent_tel_v2", "marketing");
    await tpl("pg_vertrieb_gleich_tel_v2");
    await runSalesWhatsAppReminders(now, (t) => `https://app.example/termin/verwalten/${t}`);
    expect(ofV().map((x) => x.name)).toEqual(["pg_vertrieb_termin_link_v2", ERINNERUNG_TEMPLATE_NAME, "pg_vertrieb_gleich_tel_v2"]);
    expect(params(1)).toContain("telefonisch, wir rufen Sie an");
    expect(params(2)).toContain(`Frau Schneider${tag}`);
    expect((await prisma.salesMeeting.findUniqueOrThrow({ where: { id: day.id } })).waReminderAt).not.toBeNull();
    expect((await prisma.salesMeeting.findUniqueOrThrow({ where: { id: soon.id } })).waSoonAt).not.toBeNull();
  });

  it("ohne Nummer wird nichts gesendet", async () => {
    const c = await prisma.salesContact.create({ data: { name: `Ohne ${tag}`, email: `o-${tag}@example.test`, stage: "TERMIN" } });
    contactIds.push(c.id);
    const m = await prisma.salesMeeting.create({ data: { contactId: c.id, title: "Kennenlernen", startAt: new Date(Date.now() + 86400_000) } });
    expect(await sendTerminConfirmation(m.id, {}, null)).toBe("no_phone");
  });

  // ─── Korrekturen nach der Prüfung (Ole, 17.11.2026) ───
  const rnd = (p: string) => `${p}${Math.floor(1e6 + Math.random() * 8e6)}`;
  const H = 3600_000;
  const link = (t: string) => `https://app.example/termin/verwalten/${t}`;
  const mkContact = async (phone: string | null, extra: Record<string, unknown> = {}) => {
    const c = await prisma.salesContact.create({ data: { name: `K ${Math.random().toString(36).slice(2, 8)}`, email: `${Math.random().toString(36).slice(2, 10)}@example.test`, phone, stage: "TERMIN", ...extra } });
    contactIds.push(c.id);
    return c;
  };

  it("STOPP an die Support-Nummer: Sperre, einmal Bestätigung, keine KI, danach keine Erinnerung", async () => {
    const PH_S = rnd("49172");
    const c = await mkContact(`+${PH_S}`);
    const acc = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { customerId: SUPPORT_CUSTOMER_ID } });
    const inbound = (id: string, body: string) =>
      handleInboundPayload(
        { entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: acc.phoneNumberId ?? `pn-support-${tag}` }, contacts: [{ profile: { name: "Test" } }], messages: [{ from: PH_S, id, type: "text", text: { body } }] } }] }] },
        { accountId: acc.id },
      );
    await inbound(`wamid.in1-${tag}`, "STOPP");
    const conv = await prisma.conversation.findFirstOrThrow({ where: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: PH_S }, include: { messages: true } });
    expect(conv.optedOutAt).not.toBeNull();
    expect(conv.botActive).toBe(false);
    expect(conv.attentionReason).toBe("Support: abgemeldet (STOPP)");
    expect(texts.filter((t) => t.to === PH_S)).toEqual([{ to: PH_S, body: SUPPORT_STOP_CONFIRMATION }]);
    // keine KI: außer der Bestätigung nichts Ausgehendes
    expect(conv.messages.filter((m) => m.direction === "outbound")).toHaveLength(1);
    // Zweites STOPP und eine spätere Nachricht: keine weitere Bestätigung, Sperre bleibt
    await inbound(`wamid.in2-${tag}`, "Stop");
    await inbound(`wamid.in3-${tag}`, "Danke");
    expect(texts.filter((t) => t.to === PH_S)).toHaveLength(1);
    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } })).optedOutAt).not.toBeNull();
    // Erinnerung 1 Stunde vorher wird nicht gesendet
    const now = new Date("2031-01-10T10:00:00Z");
    const m = await prisma.salesMeeting.create({
      data: { contactId: c.id, title: "Meta-Leads-Call", startAt: new Date(now.getTime() + 50 * 60_000), createdAt: new Date(now.getTime() - 72 * H), inviteePhone: `+${PH_S}` },
    });
    await runSalesWhatsAppReminders(now, link);
    expect(sent.filter((x) => x.to === PH_S)).toHaveLength(0);
    expect((await prisma.salesMeeting.findUniqueOrThrow({ where: { id: m.id } })).waSoonStatus).toBe("opted_out");
  });

  it("Calendly: Nummer aus der Buchung (auch „wir rufen an“) am Termin, Bestätigung und Erinnerung an dieselbe Nummer", async () => {
    const PH_FEST = rnd("4930");
    const PH_MOB = rnd("49173");
    const email = `cal-${tag}@example.test`;
    await mkContact(`+${PH_FEST}`, { email });
    await prisma.messageTemplate.updateMany({ where: { customerId: SUPPORT_CUSTOMER_ID, name: TERMIN_TEMPLATE_NAME }, data: { status: "approved" } });
    const start = new Date("2031-02-10T09:00:00Z");
    const ev = { uri: `https://api.calendly.com/scheduled_events/ev-${tag}`, name: "Meta-Leads-Call", start_time: start.toISOString(), location: { type: "outbound_call", location: `+${PH_MOB.slice(0, 4)} ${PH_MOB.slice(4)}` } };
    await handleCalendlyWebhook({ event: "invitee.created", payload: { uri: `https://api.calendly.com/scheduled_events/ev-${tag}/invitees/i-${tag}`, email, name: "Max Muster", reschedule_url: "https://calendly.com/r/x", scheduled_event: ev } });
    const m = await prisma.salesMeeting.findUniqueOrThrow({ where: { calendlyUri: `https://api.calendly.com/scheduled_events/ev-${tag}/invitees/i-${tag}` } });
    expect(m.inviteePhone).toBe(`+${PH_MOB}`);
    expect(m.waConfirmStatus).toBe("sent");
    await runSalesWhatsAppReminders(new Date(start.getTime() - 50 * 60_000), link);
    // Bestätigung: Telefon-Variante der Fassung 2 noch nicht freigegeben → Fassung 1; 1 Stunde vorher: Telefon-Variante (oben freigegeben)
    expect(sent.filter((x) => x.to === PH_MOB).map((x) => x.name)).toEqual([TERMIN_TEMPLATE_NAME, "pg_vertrieb_gleich_tel_v2"]);
    expect(JSON.stringify(sent.filter((x) => x.to === PH_MOB)[0].components)).toContain("telefonisch, wir rufen Sie an");
    expect(sent.filter((x) => x.to === PH_FEST)).toHaveLength(0);
  });

  it("verschoben: Fenster an der ursprünglichen Buchung, keine 24-Stunden-Erinnerung direkt nach der neuen Bestätigung", async () => {
    const now = new Date("2031-03-10T10:00:00Z");
    const c = await mkContact(null);
    const mk = async (phone: string, startIn: number, movedAgo: number) => {
      const orig = await prisma.salesMeeting.create({ data: { contactId: c.id, title: "Meta-Leads-Call", startAt: new Date(now.getTime() + 96 * H), createdAt: new Date(now.getTime() - 120 * H), status: "VERSCHOBEN" } });
      const moved = await prisma.salesMeeting.create({
        data: {
          contactId: c.id,
          title: "Meta-Leads-Call",
          startAt: new Date(now.getTime() + startIn),
          createdAt: new Date(now.getTime() - movedAgo),
          rescheduledFromId: orig.id,
          inviteePhone: `+${phone}`,
          waConfirmStatus: "sent",
          waConfirmAt: new Date(now.getTime() - movedAgo),
        },
      });
      return { orig, moved };
    };
    const PH_1 = rnd("49174");
    const PH_2 = rnd("49176");
    const PH_3 = rnd("49177");
    const soon = await mk(PH_1, 50 * 60_000, 30 * 60_000); // vor 30 Minuten auf in 50 Minuten verschoben
    const dayFresh = await mk(PH_2, 20 * H, 10 * 60_000); // vor 10 Minuten auf morgen verschoben
    const dayOld = await mk(PH_3, 20 * H, 3 * H); // vor 3 Stunden verschoben
    expect((await urspruenglichGebucht(soon.moved)).toISOString()).toBe(soon.orig.createdAt.toISOString());
    await runSalesWhatsAppReminders(now, link);
    expect(sent.filter((x) => x.to === PH_1).map((x) => x.name)).toEqual([GLEICH_TEMPLATE_NAME]);
    expect(sent.filter((x) => x.to === PH_2)).toHaveLength(0);
    expect((await prisma.salesMeeting.findUniqueOrThrow({ where: { id: dayFresh.moved.id } })).waReminderStatus).toBe("nach_bestaetigung");
    expect(sent.filter((x) => x.to === PH_3).map((x) => x.name)).toEqual([ERINNERUNG_TEMPLATE_NAME]);
    expect((await prisma.salesMeeting.findUniqueOrThrow({ where: { id: dayOld.moved.id } })).waReminderStatus).toBe("sent");
  });

  it("Sendefehler: Status am Termin, nächster Lauf versucht es erneut, höchstens 3 Versuche", async () => {
    const now = new Date("2031-04-10T10:00:00Z");
    const c = await mkContact(null);
    const PH_F = rnd("49178");
    const PH_G = rnd("49179");
    const mk = (phone: string) =>
      prisma.salesMeeting.create({ data: { contactId: c.id, title: "Meta-Leads-Call", startAt: new Date(now.getTime() + 55 * 60_000), createdAt: new Date(now.getTime() - 72 * H), inviteePhone: `+${phone}` } });
    const immer = await mk(PH_F);
    const einmal = await mk(PH_G);
    failFor.add(PH_F);
    failFor.add(PH_G);
    const r1 = await runSalesWhatsAppReminders(now, link);
    expect(r1).toMatchObject({ errors: 2, retry: 2 });
    const a = await prisma.salesMeeting.findUniqueOrThrow({ where: { id: immer.id } });
    expect(a).toMatchObject({ waSoonAt: null, waSoonStatus: "failed", waSoonTries: 1 });
    expect(a.waSoonError).toContain("360dialog 500");
    // Zweiter Lauf: einer klappt jetzt
    failFor.delete(PH_G);
    await runSalesWhatsAppReminders(new Date(now.getTime() + 5 * 60_000), link);
    expect(await prisma.salesMeeting.findUniqueOrThrow({ where: { id: einmal.id } })).toMatchObject({ waSoonStatus: "sent", waSoonError: null, waSoonTries: 2 });
    expect(sent.filter((x) => x.to === PH_G).map((x) => x.name)).toEqual([GLEICH_TEMPLATE_NAME]);
    // Dritter Versuch scheitert: Markierung bleibt, kein vierter Versuch
    await runSalesWhatsAppReminders(new Date(now.getTime() + 10 * 60_000), link);
    const b = await prisma.salesMeeting.findUniqueOrThrow({ where: { id: immer.id } });
    expect(b.waSoonTries).toBe(MAX_REMINDER_TRIES);
    expect(b.waSoonAt).not.toBeNull();
    expect(b.waSoonStatus).toBe("failed");
    await runSalesWhatsAppReminders(new Date(now.getTime() + 15 * 60_000), link);
    expect((await prisma.salesMeeting.findUniqueOrThrow({ where: { id: immer.id } })).waSoonTries).toBe(MAX_REMINDER_TRIES);
    // Erneuter Lauf sendet nichts doppelt
    expect(sent.filter((x) => x.to === PH_G)).toHaveLength(1);
    failFor.clear();
  });
});
