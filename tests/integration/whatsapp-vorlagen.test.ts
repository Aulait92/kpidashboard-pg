import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push", () => ({
  sendToUser: vi.fn(async () => {}),
  sendToBuyersOfCustomer: vi.fn(async () => {}),
  sendToAdmins: vi.fn(async () => ({ sent: 0, removed: 0, errors: [] })),
}));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import { sendToAdmins } from "@/lib/push";
import { handleInboundPayload } from "@/lib/whatsapp/gateway";
import { resubmitTemplate, submitTemplatesForCustomer, syncTemplates } from "@/lib/whatsapp/template-submit";
import { completeSelfConnect } from "@/lib/whatsapp/self-connect";
import { loadOnboarding, onboardingChecklist } from "@/lib/onboarding";
import { plannedTemplates, purposesFor, templateNameFor } from "@/lib/whatsapp/template-plan";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ENV = { ...process.env };

/** 360dialog nachgebildet: Vorlagen (Liste/Einreichen), Partner-API, Webhook, Senden. */
type Remote = { name: string; language: string; status: string; category: string; rejected_reason?: string };
let remote: Remote[] = [];
let created: Array<{ name: string; category: string; components: Array<{ type: string; text?: string; format?: string; example?: { header_handle?: string[] }; buttons?: unknown[] }> }> = [];
/** Text (BODY) eines Antrags; das Erstanschreiben hat davor den Dokument-Kopf. */
const bodyText = (c: { components: Array<{ type: string; text?: string }> }) => c.components.find((x) => x.type === "BODY")?.text ?? "";
/** Alle geplanten Namen (v4, mit A/B-Fassungen). */
const plannedNames = (bestand: boolean) => plannedTemplates(purposesFor({ bestand })).map((t) => templateNameFor(t.purpose, undefined, t.form, t.variant, t.kopf));
const sent: Array<Record<string, unknown>> = [];
let listFails = false;
/** Höchstens so viele Vorlagen je Abruf (wie ein Server mit Obergrenze); null = alle */
let listCap: number | null = null;
/** Diese Namen gibt es bei Meta, die Liste zeigt sie aber nicht (Live-Test 17.11.2026) */
let hidden: string[] = [];
let posts: string[] = [];
const API_KEY = "d360-secret-key";

function json(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}
function fake360(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  const method = init?.method ?? "GET";
  if (url.includes("/v1/configs/templates")) {
    const key = new Headers(init?.headers).get("D360-API-KEY");
    if (key !== API_KEY) return json({ error: "unauthorized" }, 401);
    if (method === "GET") {
      if (listFails) return json({ error: "boom" }, 500);
      const u = new URL(url);
      const visible = remote.filter((t) => !hidden.includes(t.name));
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const limit = Math.min(Number(u.searchParams.get("limit") ?? 1000), listCap ?? Infinity);
      return json({ count: remote.length, waba_templates: visible.slice(offset, offset + limit) });
    }
    const body = JSON.parse(String(init?.body));
    posts.push(body.name);
    if (remote.some((t) => t.name === body.name)) return json({ meta: { developer_message: `The template name: \`${body.name}\` you have provided is already in use. Please choose a different name.` } }, 400);
    created.push(body);
    remote.push({ name: body.name, language: body.language, status: "submitted", category: body.category });
    return json({ id: `t${created.length}`, name: body.name, language: body.language, status: "submitted", category: body.category });
  }
  if (url.includes("/api_keys")) return json({ id: "k1", api_key: API_KEY, address: "https://waba-v2.360dialog.io" });
  if (url.includes("/channels?")) return json({ partner_channels: [{ id: "chV1", setup_info: { phone_number: "4915112345678", phone_name: "Agentur Test" } }] });
  if (url.includes("/v1/configs/webhook")) return json({});
  if (url.includes("/messages")) {
    sent.push(JSON.parse(String(init?.body)));
    return json({ messages: [{ id: `wamid.${sent.length}` }] });
  }
  return Promise.resolve(new Response("not found", { status: 404 }));
}

let customerId = "";

async function connect(extra: Record<string, unknown> = {}) {
  return prisma.whatsAppAccount.create({
    data: { customerId, provider: "360dialog", status: "connected", apiKeyEnc: encryptSecret(API_KEY), phoneNumberId: `pn-${customerId}`, ...extra },
  });
}

beforeAll(() => requireTestDb());
beforeEach(async () => {
  process.env.AUTH_SECRET = "test-secret-test-secret-test-secret-123456";
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.DIALOG360_PARTNER_ID = "PaRtNeR1";
  process.env.DIALOG360_PARTNER_API_KEY = "partner-key";
  process.env.APP_URL = "https://app.example.de";
  process.env.WHATSAPP_WEBHOOK_SECRET = "wh-secret";
  remote = [];
  created = [];
  sent.length = 0;
  listFails = false;
  listCap = null;
  hidden = [];
  posts = [];
  vi.stubGlobal("fetch", vi.fn(fake360));
  vi.mocked(sendToAdmins).mockClear();
  customerId = (await makeCustomer({ name: "Allianz Anid Brand", leadAddress: "du" })).id;
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await prisma.salesTask.deleteMany({ where: { title: { contains: "Allianz Anid Brand" } } });
  await cleanupCustomer(customerId);
});
afterAll(() => {
  process.env = { ...ENV };
});

describe("WhatsApp-Vorlagen automatisch einreichen", () => {
  it("nach dem Selbst-Verbinden: 21 Zwecke in je 3 Fassungen (plus A/B) eingereicht, lokal „in Prüfung“, Beratername eingesetzt", async () => {
    const res = await completeSelfConnect({ customerId, userId: null, clientId: "cl1", channels: ["chV1"] });
    expect(res.status).toBe("connected");
    expect(created.map((c) => c.name).sort()).toEqual(plannedNames(false).sort());
    // 21 Zwecke × 3 Fassungen (inkl. Show-up: 15 Min., Wartet; Angebot senden und Nachfassen selbst gesendet; Glückwunsch; Bedenkzeit;
    // Erstanschreiben Hausrat) + A/B followup_last (3) + A/B der 6 Erstanschreiben (v11, 18); Erstanschreiben ab v7 nur mit
    // PDF-Kopf (keine _ohnepdf mehr)
    expect(created).toHaveLength(84);
    const outreach = created.find((c) => c.name === "pg_outreach_v12")!;
    expect(outreach.category).toBe("MARKETING");
    // Erstanschreiben v10: eine Zeile ohne Vermittler, feste Frage fett mit Knöpfen, nur „KI-Assistent“ in der Fußzeile
    expect(bodyText(outreach)).toBe("Hallo {{1}}, danke für deine Anfrage! *Wann passt dir ein kurzes Telefonat?*");
    expect(outreach.components.find((c) => c.type === "FOOTER")).toMatchObject({ text: "Digitaler KI-Assistent" });
    expect(bodyText(outreach)).not.toMatch(/Mensch|\[Kurzname\]/);
    expect(bodyText(outreach)).not.toContain("[Berater]");
    expect(bodyText(outreach)).not.toContain("[Firma]");
    // Erstinformation als PDF im Kopf: Beispiel ist das öffentliche PDF dieses Kunden
    expect(outreach.components[0]).toMatchObject({ type: "HEADER", format: "DOCUMENT" });
    expect(outreach.components[0].example?.header_handle?.[0]).toMatch(/^https:\/\/app\.example\.de\/erstinformation\/[A-Za-z0-9_-]+\/pdf$/);
    expect(outreach.components.map((c) => c.type)).toEqual(["HEADER", "BODY", "FOOTER", "BUTTONS"]);
    expect(outreach.components.find((c) => c.type === "BUTTONS")).toEqual({
      type: "BUTTONS",
      buttons: [{ type: "QUICK_REPLY", text: "Heute" }, { type: "QUICK_REPLY", text: "Morgen" }, { type: "QUICK_REPLY", text: "Lieber schriftlich" }],
    });
    expect(created.some((c) => c.name.includes("ohnepdf"))).toBe(false);
    // v10: eine Zeile, Thema fest, feste Frage fett; Tierkrankenversicherung mit dem Tiernamen; Fassung b „Frage zuerst“
    expect(bodyText(created.find((c) => c.name === "pg_outreach_v12_sie")!)).toBe("Hallo {{1}}, danke für Ihre Anfrage! *Wann passt Ihnen ein kurzes Telefonat?*");
    expect(bodyText(created.find((c) => c.name === "pg_outreach_v12_sie_ohne_name")!)).toBe("Hallo, danke für Ihre Anfrage! *Wann passt Ihnen ein kurzes Telefonat?*");
    expect(bodyText(created.find((c) => c.name === "pg_outreach_tkv_v12")!)).toBe("Hallo {{1}}, schön, dass du {{2}} gut absichern möchtest 🐾 *Was soll abgesichert sein?*");
    expect(bodyText(created.find((c) => c.name === "pg_outreach_tkv_v12_b_sie")!)).toBe("Hallo {{1}}, *was soll für {{2}} abgesichert sein?* 🐾");
    expect(created.find((c) => c.name === "pg_outreach_tkv_v12_sie")!.components.find((c) => c.type === "BODY")?.example).toEqual({ body_text: [["Frau Schneider", "Minka"]] });
    // ohne Namen und ohne Tier: kein Platzhalter, also kein Beispiel
    expect(created.find((c) => c.name === "pg_outreach_pkv_v12_sie_ohne_name")!.components.find((c) => c.type === "BODY")?.example).toBeUndefined();
    expect(created.find((c) => c.name === "pg_reminder_v5")!.category).toBe("UTILITY");
    expect(created.find((c) => c.name === "pg_reschedule_v4_sie")!.category).toBe("UTILITY");
    expect(created.find((c) => c.name === "pg_reminder_soon_v5")!.category).toBe("UTILITY");
    // Show-up-Paket (freigegeben 17.11.2026): 15 Minuten vorher und „wartet im Videoraum“ werden mit eingereicht
    for (const n of ["pg_reminder_start_v5", "pg_reminder_start_v5_sie", "pg_reminder_start_v5_sie_ohne_name", "pg_appt_waiting_v5", "pg_appt_waiting_v5_sie", "pg_appt_waiting_v5_sie_ohne_name"]) {
      expect(created.find((c) => c.name === n)?.category, n).toBe("UTILITY");
    }
    expect(created.find((c) => c.name === "pg_followup_nudge_v4")!.category).toBe("MARKETING");
    expect(created.find((c) => c.name === "pg_reminder_v5")!.components.find((c) => c.type === "BUTTONS")).toEqual({
      type: "BUTTONS",
      buttons: [{ type: "QUICK_REPLY", text: "Ja, passt" }, { type: "QUICK_REPLY", text: "Bitte verschieben" }],
    });

    const local = await prisma.messageTemplate.findMany({ where: { customerId } });
    expect(local).toHaveLength(84);
    // Kopf und Knöpfe gespeichert (beim Senden: PDF-Link bzw. Knopf-Payloads)
    expect(local.find((t) => t.name === "pg_outreach_tkv_v12")).toMatchObject({ headerFormat: "DOCUMENT", buttons: ["Nur Operationen", "Auch Behandlungen", "Noch unsicher"] });
    expect(local.find((t) => t.name === "pg_outreach_zahn_v12_b_sie")).toMatchObject({ headerFormat: "DOCUMENT", buttons: ["Starker Zahnersatz", "Mit Zahnreinigung", "Beides vergleichen"] });
    expect(local.find((t) => t.name === "pg_reminder_v5")?.headerFormat).toBeNull();
    expect(local.every((t) => t.auto && t.status === "pending" && t.submittedAt && t.language === "de")).toBe(true);
    const acc = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { customerId } });
    expect(acc.templatesCheckedAt).not.toBeNull();
    // Kein Secret in Datenbank-Texten
    expect(JSON.stringify(local)).not.toContain(API_KEY);
  });

  it("mit Bestandskunden-Modul: zusätzlich 4 Kampagnen-Vorlagen mit Knopf „Keine Nachrichten mehr“", async () => {
    await prisma.customer.update({ where: { id: customerId }, data: { existingCustomersEnabled: true } });
    await connect();
    const s = await submitTemplatesForCustomer(customerId);
    // 21 Zwecke × 3 Fassungen + A/B followup_last (3) + A/B Erstanschreiben (18) + 4 Kampagnen × 2 (nur gesiezt) + A/B Cross-Selling (2)
    expect(s.submitted).toHaveLength(94);
    expect(created.map((c) => c.name).sort()).toEqual(plannedNames(true).sort());
    const camp = created.find((c) => c.name === "pg_campaign_review_v4_sie")!;
    // Selbstbezeichnung nach Status laut Erstinformation, nie „Versicherungsberater“
    expect(camp.components[0].text).not.toContain("Versicherungsberater");
    expect(camp.components[0].text).not.toContain("[Rolle]");
    expect(camp.components[0].text).toMatch(/^Guten Tag \{\{1\}\}, hier ist Anid Brand( von der |, Ihr Versicherungs)/);
    expect(camp.components[0].text).not.toContain("STOPP");
    expect(camp.components[1]).toEqual({
      type: "BUTTONS",
      buttons: [{ type: "QUICK_REPLY", text: "Ja, gern" }, { type: "QUICK_REPLY", text: "Kein Bedarf" }, { type: "QUICK_REPLY", text: "Keine Nachrichten mehr" }],
    });
    expect(created.find((c) => c.name === "pg_campaign_review_v4_sie_ohne_name")!.components[1]).toEqual(camp.components[1]);
    expect(created.some((c) => c.name === "pg_campaign_review_v4")).toBe(false);
    expect(bodyText(created.find((c) => c.name === "pg_campaign_cross_sell_v4_sie")!)).toContain("eine Lücke, die erst im Schadenfall auffällt");
    expect(created.some((c) => c.name === "pg_campaign_cross_sell_v4_b_sie")).toBe(true);
  });

  it("zweiter Lauf reicht nichts doppelt ein; Freigabe → approved, Ablehnung → Aufgabe + Push", async () => {
    await connect();
    await submitTemplatesForCustomer(customerId);
    expect(created).toHaveLength(84);

    remote.find((t) => t.name === "pg_outreach_v12")!.status = "APPROVED";
    Object.assign(remote.find((t) => t.name === "pg_reminder_v5")!, { status: "REJECTED", rejected_reason: "INVALID_FORMAT" });
    const s = await submitTemplatesForCustomer(customerId);
    expect(created).toHaveLength(84);
    expect(s.approved).toEqual(["pg_outreach_v12"]);
    expect(s.rejected).toEqual(["pg_reminder_v5"]);

    const outreach = await prisma.messageTemplate.findFirstOrThrow({ where: { customerId, name: "pg_outreach_v12" } });
    expect(outreach.status).toBe("approved");
    const reminder = await prisma.messageTemplate.findFirstOrThrow({ where: { customerId, name: "pg_reminder_v5" } });
    expect(reminder.status).toBe("rejected");
    expect(reminder.rejectionReason).toBe("INVALID_FORMAT");
    const task = await prisma.salesTask.findFirst({ where: { title: "WhatsApp-Vorlage abgelehnt: Allianz Anid Brand" } });
    expect(task?.note).toContain("INVALID_FORMAT");
    expect(vi.mocked(sendToAdmins).mock.calls.some((c) => c[0].title.includes("Vorlage abgelehnt"))).toBe(true);

    // Erneuter Abgleich meldet die Ablehnung nicht noch einmal
    vi.mocked(sendToAdmins).mockClear();
    await submitTemplatesForCustomer(customerId);
    expect(await prisma.salesTask.count({ where: { title: "WhatsApp-Vorlage abgelehnt: Allianz Anid Brand" } })).toBe(1);
    expect(sendToAdmins).not.toHaveBeenCalled();

    // Neu einreichen → Revision mit neuem Namen
    const r = await resubmitTemplate(customerId, "reminder");
    expect(r).toMatchObject({ ok: true, name: "pg_reminder_v5_r2" });
    expect((await prisma.messageTemplate.findFirstOrThrow({ where: { customerId, name: "pg_reminder_v5_r2" } })).status).toBe("pending");
    // Einzelne Fassung gezielt neu einreichen
    expect(await resubmitTemplate(customerId, "reminder", new Date(), "sie")).toMatchObject({ ok: true, name: "pg_reminder_v5_sie_r2" });

    // Erstanschreiben mit PDF im Kopf abgelehnt → Revision wieder MIT Kopf (nie ohne Erstinformation, Live-Test 17.11.2026)
    Object.assign(remote.find((t) => t.name === "pg_outreach_zahn_v12")!, { status: "REJECTED", rejected_reason: "INVALID_FORMAT" });
    await submitTemplatesForCustomer(customerId);
    expect(await resubmitTemplate(customerId, "outreach_zahn")).toMatchObject({ ok: true, name: "pg_outreach_zahn_v12_r2" });
    const rev = created.find((c) => c.name === "pg_outreach_zahn_v12_r2")!;
    expect(rev.components.map((c) => c.type)).toEqual(["HEADER", "BODY", "FOOTER", "BUTTONS"]);
    expect((await prisma.messageTemplate.findFirstOrThrow({ where: { customerId, name: "pg_outreach_zahn_v12_r2" } })).headerFormat).toBe("DOCUMENT");
  });

  it("vom Admin von Hand angelegte Vorlage bleibt unberührt", async () => {
    await connect();
    await prisma.messageTemplate.create({
      data: { customerId, name: "anid_erstkontakt", language: "de", purpose: "outreach", category: "marketing", status: "approved", body: "Hallo {{1}}" },
    });
    const s = await submitTemplatesForCustomer(customerId);
    expect(s.skipped).toEqual(["outreach"]);
    expect(created.map((c) => c.name).filter((n) => /^pg_outreach_v\d/.test(n))).toEqual([]);
    expect(created).toHaveLength(78);
  });

  it("Cron: gedrosselt, Liste nicht abrufbar → Fehler nur gemeldet", async () => {
    await connect();
    const now = new Date();
    expect((await syncTemplates(now)).checked).toBeGreaterThanOrEqual(1);
    const acc = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { customerId } });
    expect(acc.templatesCheckedAt?.getTime()).toBe(now.getTime());
    // Innerhalb von 30 Minuten nicht erneut (dieses Konto)
    const before = created.length;
    await syncTemplates(new Date(now.getTime() + 60_000));
    expect(created.length).toBe(before);

    listFails = true;
    const s = await submitTemplatesForCustomer(customerId);
    expect(s.ok).toBe(false);
    expect(s.error).toContain("500");
    expect(s.error).not.toContain(API_KEY);
  });

  it("Go-live-Prüfung: Punkt „Vorlage fürs Erstanschreiben freigegeben“", async () => {
    await connect();
    await prisma.onboarding.create({ data: { customerId } });
    await submitTemplatesForCustomer(customerId);
    const item = async () => onboardingChecklist((await loadOnboarding({ customerId }))!, null).find((i) => i.key === "templates");
    expect((await item())?.done).toBe(false);
    expect((await item())?.label).toContain("noch nicht freigegeben");
    remote.find((t) => t.name === "pg_outreach_v12")!.status = "APPROVED";
    await submitTemplatesForCustomer(customerId);
    expect((await item())?.done).toBe(true);
  });

  it("Ansprache „Sie“: alle Fassungen eingereicht; Wahl je Kontakt, bis zur Freigabe die bisherige", async () => {
    await prisma.customer.update({ where: { id: customerId }, data: { leadAddress: "sie" } });
    await connect();
    await submitTemplatesForCustomer(customerId);
    const names = created.map((c) => c.name);
    // Beide Fassungen für jeden Kunden, damit ein Wechsel Sie/Du sofort greift
    expect(names).toContain("pg_outreach_v12");
    expect(names).toContain("pg_outreach_v12_sie");
    expect(names).toContain("pg_outreach_v12_sie_ohne_name");
    expect(names).toContain("pg_outreach_v12_b_sie_ohne_name");
    expect(names.some((n) => n.includes("ohnepdf"))).toBe(false);
    const sie = created.find((c) => c.name === "pg_outreach_v12_sie")!;
    expect(JSON.stringify(sie.components)).toContain("Hallo {{1}}, danke für Ihre Anfrage");
    expect(JSON.stringify(sie.components)).toContain("Frau Schneider");

    const { pickApprovedTemplate, sendWhatsAppNotice } = await import("@/lib/whatsapp/templates");
    const FRAU = { fullName: "Julia Schneider", salutation: "Frau" };
    const NUR_VORNAME = { fullName: "Julia" };
    // Nur die alte Du-Fassung freigegeben → sie geht weiter raus
    await prisma.messageTemplate.create({ data: { customerId, name: "pg_outreach_v1", language: "de", purpose: "outreach", category: "marketing", status: "approved", body: "Hallo {{1}}, du", auto: true } });
    expect((await pickApprovedTemplate(customerId, "outreach", FRAU))?.name).toBe("pg_outreach_v1");
    // Sie-Fassung mit Namen freigegeben → mit Nachnamen diese, ohne Nachnamen weiter die bisherige
    await prisma.messageTemplate.updateMany({ where: { customerId, name: "pg_outreach_v12_sie" }, data: { status: "approved" } });
    expect((await pickApprovedTemplate(customerId, "outreach", FRAU))?.name).toBe("pg_outreach_v12_sie");
    expect((await pickApprovedTemplate(customerId, "outreach", NUR_VORNAME))?.name).toBe("pg_outreach_v1");
    await prisma.messageTemplate.updateMany({ where: { customerId, name: "pg_outreach_v12_sie_ohne_name" }, data: { status: "approved" } });
    expect((await pickApprovedTemplate(customerId, "outreach", NUR_VORNAME))?.name).toBe("pg_outreach_v12_sie_ohne_name");

    // Senden außerhalb des 24-h-Fensters: Vorlage mit „Frau Schneider“ bzw. ohne Namensparameter, PDF im Kopf
    const document = { link: "https://app.example.de/erstinformation/abc123/pdf", filename: "Erstinformation.pdf" };
    // Automatische Vorlagen nur an Leads (lib/whatsapp/nur-leads.ts)
    const leadOf = async (phone: string) => (await prisma.lead.create({ data: { customerId, name: "Julia Schneider", phone } })).id;
    await sendWhatsAppNotice({ customerId, to: "4917600000011", purpose: "outreach", leadId: await leadOf("4917600000011"), params: ["Julia"], text: "x", contactName: "Julia Schneider", anrede: FRAU, document, variant: "a" });
    await sendWhatsAppNotice({ customerId, to: "4917600000012", purpose: "outreach", leadId: await leadOf("4917600000012"), params: ["Julia"], text: "x", contactName: "Julia", document, variant: "a" });
    // Ohne PDF (Erstinformation unvollständig) keine Vorlage mit Kopf: die bisherige
    await sendWhatsAppNotice({ customerId, to: "4917600000013", purpose: "outreach", leadId: await leadOf("4917600000013"), params: ["Julia"], legacyParams: ["Julia", "https://x.de/erstinformation/abc"], text: "x", contactName: "Julia Schneider", anrede: FRAU });
    type Comp = { type: string; parameters: { type: string; text?: string; document?: { link: string } }[] };
    const tpl = (i: number) => (sent[i] as { template: { name: string; components?: Comp[] } }).template;
    expect(tpl(0).name).toBe("pg_outreach_v12_sie");
    expect(tpl(0).components?.find((c) => c.type === "body")?.parameters.map((p) => p.text)).toEqual(["Frau Schneider"]);
    expect(tpl(0).components?.find((c) => c.type === "header")?.parameters[0].document?.link).toBe(document.link);
    expect(tpl(1).name).toBe("pg_outreach_v12_sie_ohne_name");
    // v10 ohne Namen hat keinen Platzhalter: nur der Kopf mit dem PDF
    expect(tpl(1).components?.map((c) => c.type)).toEqual(["header"]);
    expect(tpl(2).name).toBe("pg_outreach_v1");
    const bodies = await prisma.message.findMany({ where: { conversation: { customerId } }, orderBy: { createdAt: "asc" }, select: { body: true, purpose: true, variant: true } });
    // ab v8 mit der Fußzeile (KI-Kennzeichnung) im gespeicherten Text, v10 nur „KI-Assistent“
    expect(bodies[0].body).toBe("[Erstinformation als PDF]\nHallo Frau Schneider, danke für Ihre Anfrage! *Wann passt Ihnen ein kurzes Telefonat?*\n\nDigitaler KI-Assistent");
    expect(bodies[1].body).toBe("[Erstinformation als PDF]\nHallo, danke für Ihre Anfrage! *Wann passt Ihnen ein kurzes Telefonat?*\n\nDigitaler KI-Assistent");
    expect(bodies[2].body?.startsWith("[Erstinformation")).toBe(false);
    expect(bodies[0]).toMatchObject({ purpose: "outreach", variant: "a" });
    // ältere Fassung (v1): keine A/B-Fassung gespeichert, zählt nicht im Test der aktuellen Fassungen (Ole, 19.11.2026)
    expect(bodies[2].variant).toBeNull();

    // Wieder „Du“ → Du-Fassung (bisherige, bis v3 freigegeben ist)
    await prisma.customer.update({ where: { id: customerId }, data: { leadAddress: "du" } });
    expect((await pickApprovedTemplate(customerId, "outreach", FRAU))?.name).toBe("pg_outreach_v1");
    await prisma.messageTemplate.updateMany({ where: { customerId, name: "pg_outreach_v12" }, data: { status: "approved" } });
    expect((await pickApprovedTemplate(customerId, "outreach", FRAU))?.name).toBe("pg_outreach_v12");
  });

  it("Erstanschreiben Katze: bis zur Freigabe die freigegebene v4 bzw. v5 mit deren Parametern, dann v7/v8/v9 mit der ersten offenen Frage, v10/v11 mit fester Frage, immer mit PDF; im offenen Fenster Freitext und PDF", async () => {
    await prisma.customer.update({ where: { id: customerId }, data: { leadAddress: "sie" } });
    await connect();
    const { sendOutreach } = await import("@/lib/whatsapp/outreach");
    const { templateBodyFor, templateNamesOf } = await import("@/lib/whatsapp/template-plan");
    const v4Body = "Guten Tag {{1}}, vielen Dank für Ihre Anfrage zur {{2}}! Ich bin der digitale KI-Assistent von Anid Brand, kein Mensch, und stelle Ihnen zwei kurze Fragen, damit Sie ein passendes Angebot bekommen. Für welches Tier suchen Sie den Schutz?";
    await prisma.messageTemplate.create({ data: { customerId, name: "pg_outreach_tkv_v4_sie", language: "de", purpose: "outreach_tkv", category: "marketing", status: "approved", auto: true, headerFormat: "DOCUMENT", body: v4Body, buttons: ["Hund", "Katze"] } });
    const lead = async (name: string, phone: string) => prisma.lead.create({ data: { customerId, name, phone, source: "Katzenversicherung (TKV)", status: "Neuer Lead" } });
    type Comp = { type: string; parameters: { text?: string }[] };
    const tplOf = (to: string) => (sent.find((x) => x.to === to) as { template: { name: string; components?: Comp[] } }).template;
    const params = (to: string) => tplOf(to).components?.find((c) => c.type === "body")?.parameters.map((p) => p.text);

    const l1 = await lead("Thomas Müller", "4917600000021");
    await sendOutreach({ customerId, leadId: l1.id, phone: l1.phone!, name: l1.name, an: "sie", source: l1.source });
    expect(tplOf("4917600000021").name).toBe("pg_outreach_tkv_v4_sie");
    expect(params("4917600000021")).toEqual(["Herr Müller", "Katzenversicherung"]);

    // v5 freigegeben (mit PDF-Kopf): Produkt und „Ihre Katze“
    const v5Body = "Hallo {{1}}, danke für Ihre Anfrage zur {{2}}!\nIch bin der digitale KI-Assistent von Anid und kläre kurz zwei, drei Fragen, damit Anid Ihnen ein passendes Angebot machen kann.\n\n*Wie alt ist {{3}}?*";
    await prisma.messageTemplate.create({ data: { customerId, name: "pg_outreach_tkv_v5_sie", language: "de", purpose: "outreach_tkv", category: "marketing", status: "approved", auto: true, headerFormat: "DOCUMENT", body: v5Body } });
    const l2 = await lead("Max Weber", "4917600000022");
    await sendOutreach({ customerId, leadId: l2.id, phone: l2.phone!, name: l2.name, an: "sie", source: l2.source });
    expect(tplOf("4917600000022").name).toBe("pg_outreach_tkv_v5_sie");
    expect(params("4917600000022")).toEqual(["Herr Weber", "Katzenversicherung", "Ihre Katze"]);

    // v6 nur ohne PDF-Kopf freigegeben: wird nie gewählt (nie ohne Erstinformation), weiter v5 mit PDF
    const body = templateBodyFor("outreach_tkv", templateNamesOf("Allianz Anid Brand", undefined, "Anid Brand"), "sie");
    await prisma.messageTemplate.create({ data: { customerId, name: "pg_outreach_tkv_v6_ohnepdf_sie", language: "de", purpose: "outreach_tkv", category: "marketing", status: "approved", auto: true, body } });
    const l5 = await lead("Max Weber", "4917600000025");
    await sendOutreach({ customerId, leadId: l5.id, phone: l5.phone!, name: l5.name, an: "sie", source: l5.source });
    expect(tplOf("4917600000025").name).toBe("pg_outreach_tkv_v5_sie");
    // v7 freigegeben (mit PDF-Kopf): Thema, Vermittler, erste offene Frage ohne „?“ (steht fest in der Vorlage), nicht fett
    const { ERSTANSCHREIBEN_V7 } = await import("@/lib/whatsapp/erstanschreiben");
    await prisma.messageTemplate.create({ data: { customerId, name: "pg_outreach_tkv_v7_sie", language: "de", purpose: "outreach_tkv", category: "marketing", status: "approved", auto: true, headerFormat: "DOCUMENT", body: `Hallo {{1}}, ${ERSTANSCHREIBEN_V7.sie}` } });
    const l4 = await lead("Max Weber", "4917600000024");
    await sendOutreach({ customerId, leadId: l4.id, phone: l4.phone!, name: l4.name, an: "sie", source: l4.source });
    expect(tplOf("4917600000024").name).toBe("pg_outreach_tkv_v7_sie");
    // Erstinformation (hier unvollständig) als PDF im aktuellen Stand im Kopf
    expect((tplOf("4917600000024").components as { type: string }[] | undefined)?.[0].type).toBe("header");
    const p4 = params("4917600000024")!;
    expect([p4[0], p4[1], p4[3]]).toEqual(["Herr Weber", "Katzenversicherung", "Wie alt ist Ihre Katze"]);
    const m4 = await prisma.message.findFirstOrThrow({ where: { conversation: { customerId, contactPhone: "4917600000024" } } });
    expect(m4.body).toBe(`[Erstinformation als PDF]\nHallo Herr Weber, danke für Ihre Anfrage zum Thema Katzenversicherung! Ich bin der digitale KI-Assistent von ${p4[2]}.\n\nWie alt ist Ihre Katze?`);
    expect(m4.body).not.toContain("??");
    expect(m4.purpose).toBe("outreach_tkv");

    // v8 freigegeben (Ole, 17.11.2026): kurz, Thema fest, Vermittler und erste offene Frage, Frage fett, Fußzeile mit KI
    const { erstanschreibenV8 } = await import("@/lib/whatsapp/erstanschreiben");
    await prisma.messageTemplate.create({ data: { customerId, name: "pg_outreach_tkv_v8_sie", language: "de", purpose: "outreach_tkv", category: "marketing", status: "approved", auto: true, headerFormat: "DOCUMENT", body: `Hallo {{1}}, ${erstanschreibenV8("outreach_tkv").sie}` } });
    const l8 = await lead("Max Weber", "4917600000026");
    await sendOutreach({ customerId, leadId: l8.id, phone: l8.phone!, name: l8.name, an: "sie", source: l8.source });
    expect(tplOf("4917600000026").name).toBe("pg_outreach_tkv_v8_sie");
    const p8 = params("4917600000026")!;
    expect([p8[0], p8[2]]).toEqual(["Herr Weber", "Wie alt ist Ihre Katze"]);
    const m8 = await prisma.message.findFirstOrThrow({ where: { conversation: { customerId, contactPhone: "4917600000026" } } });
    expect(m8.body).toBe(`[Erstinformation als PDF]\nHallo Herr Weber, danke für Ihre Anfrage zur Tierkrankenversicherung! Hier schreibt der digitale Assistent von ${p8[1]}.\n\n*Wie alt ist Ihre Katze?*\n\nKI-Assistent · Oben: Erstinformation (gesetzlich)`);

    // v9 freigegeben (Ole, 18.11.2026): emotional mit dem Tier („Ihre Katze“ ohne Namen im Formular), ohne Vermittler
    const { erstanschreibenV9 } = await import("@/lib/whatsapp/erstanschreiben");
    await prisma.messageTemplate.create({ data: { customerId, name: "pg_outreach_tkv_v9_sie", language: "de", purpose: "outreach_tkv", category: "marketing", status: "approved", auto: true, headerFormat: "DOCUMENT", body: `Hallo {{1}}, ${erstanschreibenV9("outreach_tkv").sie}` } });
    const l9 = await lead("Max Weber", "4917600000027");
    await sendOutreach({ customerId, leadId: l9.id, phone: l9.phone!, name: l9.name, an: "sie", source: l9.source });
    expect(tplOf("4917600000027").name).toBe("pg_outreach_tkv_v9_sie");
    expect(params("4917600000027")).toEqual(["Herr Weber", "Ihre Katze", "Wie alt ist Ihre Katze"]);
    const m9 = await prisma.message.findFirstOrThrow({ where: { conversation: { customerId, contactPhone: "4917600000027" } } });
    expect(m9.body).toBe("[Erstinformation als PDF]\nHallo Herr Weber, schön, dass Sie Ihre Katze gut absichern möchten 🐾 *Wie alt ist Ihre Katze?*\n\nKI-Assistent · Erstinformation im PDF oben");
    // ältere Fassung: keine A/B-Fassung gespeichert
    expect(m9.variant).toBeNull();

    // v10 freigegeben (Ole, 19.11.2026): feste Frage, nur das Tier als Platzhalter, Fußzeile „KI-Assistent“, Knöpfe in der Vorlage
    const { variantForKey } = await import("@/lib/whatsapp/ab-test");
    await prisma.messageTemplate.create({ data: { customerId, name: "pg_outreach_tkv_v12_sie", language: "de", purpose: "outreach_tkv", category: "marketing", status: "approved", auto: true, headerFormat: "DOCUMENT", body, buttons: ["Nur Operationen", "Auch Behandlungen", "Noch unsicher"] } });
    const l10 = await lead("Max Weber", "4917600000028");
    await sendOutreach({ customerId, leadId: l10.id, phone: l10.phone!, name: l10.name, an: "sie", source: l10.source });
    expect(tplOf("4917600000028").name).toBe("pg_outreach_tkv_v12_sie");
    expect(params("4917600000028")).toEqual(["Herr Weber", "Ihre Katze"]);
    const m10 = await prisma.message.findFirstOrThrow({ where: { conversation: { customerId, contactPhone: "4917600000028" } } });
    expect(m10.body).toBe("[Erstinformation als PDF]\nHallo Herr Weber, schön, dass Sie Ihre Katze gut absichern möchten 🐾 *Was soll abgesichert sein?*\n\nDigitaler KI-Assistent");
    // nur Fassung a freigegeben: auch bei Zuteilung b geht a raus und zählt als a
    expect(m10.variant).toBe("a");

    // Formular beantwortet die feste Frage schon (gewünschter Schutz): weiter v9 mit der nächsten offenen Frage
    const l11 = await prisma.lead.create({ data: { customerId, name: "Max Weber", phone: "4917600000029", source: "Katzenversicherung (TKV)", status: "Neuer Lead", formData: [{ label: "Gewünschter Schutz", value: "OP-Schutz" }] } });
    await sendOutreach({ customerId, leadId: l11.id, phone: l11.phone!, name: l11.name, an: "sie", source: l11.source });
    expect(tplOf("4917600000029").name).toBe("pg_outreach_tkv_v9_sie");
    expect(params("4917600000029")).toEqual(["Herr Weber", "Ihre Katze", "Wie alt ist Ihre Katze"]);

    // Fassung b (v11) freigegeben: Leads mit Zuteilung b bekommen „Frage zuerst“, gespeichert als b
    const bodyB = templateBodyFor("outreach_tkv", templateNamesOf("Allianz Anid Brand", undefined, "Anid Brand"), "sie", "b");
    await prisma.messageTemplate.create({ data: { customerId, name: "pg_outreach_tkv_v12_b_sie", language: "de", purpose: "outreach_tkv", category: "marketing", status: "approved", auto: true, headerFormat: "DOCUMENT", body: bodyB, buttons: ["Nur Operationen", "Auch Behandlungen", "Noch unsicher"] } });
    let lb = await lead("Max Weber", "4917600000030");
    for (let i = 0; variantForKey("outreach_tkv", lb.id) !== "b" && i < 40; i++) {
      await prisma.lead.delete({ where: { id: lb.id } });
      lb = await lead("Max Weber", "4917600000030");
    }
    expect(variantForKey("outreach_tkv", lb.id)).toBe("b");
    await sendOutreach({ customerId, leadId: lb.id, phone: lb.phone!, name: lb.name, an: "sie", source: lb.source });
    expect(tplOf("4917600000030").name).toBe("pg_outreach_tkv_v12_b_sie");
    expect(params("4917600000030")).toEqual(["Herr Weber", "Ihre Katze"]);
    const mb = await prisma.message.findFirstOrThrow({ where: { conversation: { customerId, contactPhone: "4917600000030" } } });
    expect(mb.body).toBe("[Erstinformation als PDF]\nHallo Herr Weber, *was soll für Ihre Katze abgesichert sein?* 🐾\n\nDigitaler KI-Assistent");
    expect(mb.variant).toBe("b");

    // Fenster offen, Lead hat noch nicht geschrieben (Anfrage): Freitext v10 mit denselben Knöpfen interaktiv, dann das PDF
    const lf = await lead("Max Weber", "4917600000031");
    await prisma.conversation.create({ data: { customerId, contactPhone: lf.phone!, leadId: lf.id, windowExpiresAt: new Date(Date.now() + 3_600_000) } });
    const vorF = sent.length;
    const rf = await sendOutreach({ customerId, leadId: lf.id, phone: lf.phone!, name: lf.name, an: "sie", source: lf.source });
    expect(rf.mode).toBe("text");
    const outF = sent.slice(vorF) as Array<{ type: string; interactive?: { body: { text: string }; action: { buttons: { reply: { title: string } }[] } } }>;
    expect(outF[0].type).toBe("interactive");
    const fassungF = variantForKey("outreach_tkv", lf.id);
    expect(outF[0].interactive?.body.text).toBe(
      fassungF === "b"
        ? "Hallo Herr Weber, *was soll für Ihre Katze abgesichert sein?* 🐾\n\n_Digitaler KI-Assistent_"
        : "Hallo Herr Weber, schön, dass Sie Ihre Katze gut absichern möchten 🐾 *Was soll abgesichert sein?*\n\n_Digitaler KI-Assistent_",
    );
    expect(outF[0].interactive?.action.buttons.map((b) => b.reply.title)).toEqual(["Nur Operationen", "Auch Behandlungen", "Noch unsicher"]);
    expect(outF[1]).toMatchObject({ type: "document" });

    // Lead hat schon geschrieben (Fenster offen): Freitext „danke für Ihre Nachricht“, danach die Erstinformation
    const l3 = await lead("Julia Schneider", "4917600000023");
    const c3 = await prisma.conversation.create({ data: { customerId, contactPhone: l3.phone!, leadId: l3.id, windowExpiresAt: new Date(Date.now() + 3_600_000) } });
    await prisma.message.create({ data: { conversationId: c3.id, direction: "inbound", kind: "text", body: "Hallo" } });
    const before = sent.length;
    const r3 = await sendOutreach({ customerId, leadId: l3.id, phone: l3.phone!, name: l3.name, an: "sie", source: l3.source });
    expect(r3.mode).toBe("text");
    const out = sent.slice(before) as Array<{ type: string; text?: { body: string } }>;
    expect(out[0]).toMatchObject({ type: "text" });
    expect(out[0].text?.body).toMatch(/^Hallo Frau Schneider, danke für Ihre Nachricht zur Tierkrankenversicherung! Hier schreibt der digitale KI-Assistent von [^.\n]+\.\n\n\*Wie alt ist Ihre Katze\?\*$/);
    // Erstinformation unvollständig: PDF im aktuellen Stand unmittelbar als Nachricht 2 (kein Link-Rückfall)
    expect(out[1]).toMatchObject({ type: "document" });
    expect(out).toHaveLength(2);
  });

  it("Live-Test 17.11.2026: Liste seitenweise; bei Meta vorhandene Vorlagen nie erneut einreichen, Status übernehmen", async () => {
    await connect();
    await submitTemplatesForCustomer(customerId);
    expect(created).toHaveLength(84);
    // Server liefert je Abruf höchstens 20: früher fehlten die neuesten Vorlagen, sie wurden bei jedem Lauf neu eingereicht
    listCap = 20;
    remote.find((t) => t.name === "pg_outreach_privatschutz_v12_sie")!.status = "APPROVED";
    posts = [];
    const s = await submitTemplatesForCustomer(customerId);
    expect(posts).toEqual([]);
    expect(s.ok).toBe(true);
    expect(s.approved).toContain("pg_outreach_privatschutz_v12_sie");
    expect((await prisma.messageTemplate.findFirstOrThrow({ where: { customerId, name: "pg_outreach_privatschutz_v12_sie" } })).status).toBe("approved");

    // Vorlage gibt es bei Meta, die Liste zeigt sie nicht: kein erneutes Einreichen (lokal bekannt)
    hidden = ["pg_outreach_privatschutz_v12"];
    posts = [];
    const s2 = await submitTemplatesForCustomer(customerId);
    expect(posts).toEqual([]);
    expect(s2.ok).toBe(true);
    // Lokal fehlt der Datensatz auch: einmal eingereicht, „already in use“ → übernommen statt Fehler, nächster Lauf ruhig
    await prisma.messageTemplate.deleteMany({ where: { customerId, name: "pg_outreach_privatschutz_v12" } });
    posts = [];
    const s3 = await submitTemplatesForCustomer(customerId);
    expect(posts).toEqual(["pg_outreach_privatschutz_v12"]);
    expect(s3.ok).toBe(true);
    expect(await prisma.messageTemplate.findFirstOrThrow({ where: { customerId, name: "pg_outreach_privatschutz_v12" } })).toMatchObject({ status: "pending", headerFormat: "DOCUMENT" });
    posts = [];
    await submitTemplatesForCustomer(customerId);
    expect(posts).toEqual([]);
  });

  it("gleichzeitige Abgleiche je Kunde laufen nur einmal (keine doppelten Einreichungen)", async () => {
    await connect();
    const [a, b] = await Promise.all([submitTemplatesForCustomer(customerId), submitTemplatesForCustomer(customerId)]);
    expect(a).toBe(b);
    expect(posts).toHaveLength(84);
    expect(new Set(posts).size).toBe(84);
  });

  it("nicht verbunden → nichts eingereicht", async () => {
    const s = await submitTemplatesForCustomer(customerId);
    expect(s.ok).toBe(false);
    expect(created).toHaveLength(0);
  });
});

describe("Coexistence und Abmelde-Knopf", () => {
  it("Echo aus der Business-App → ausgehende Nachricht „App“, Assistent pausiert", async () => {
    const acc = await connect();
    // Echo in einem Lead-Chat (Echos an private Nummern ohne Lead speichert die App nicht, whatsapp-nur-leads.test.ts)
    await prisma.lead.create({ data: { customerId, name: "Lena Lead", phone: "4917600000001" } });
    await handleInboundPayload({
      entry: [{ changes: [{ value: { metadata: { phone_number_id: acc.phoneNumberId }, message_echoes: [{ from: "4915112345678", to: "4917600000001", id: "wamid.echo1", type: "text", text: { body: "Hallo, hier direkt vom Handy" } }] } }] }],
    });
    const conv = await prisma.conversation.findFirstOrThrow({ where: { customerId, contactPhone: "4917600000001" }, include: { messages: true } });
    expect(conv.botActive).toBe(false);
    expect(conv.messages).toHaveLength(1);
    expect(conv.messages[0]).toMatchObject({ direction: "outbound", sentBy: "app", body: "Hallo, hier direkt vom Handy" });
    // Doppelt zugestellt → nicht doppelt gespeichert
    await handleInboundPayload({
      entry: [{ changes: [{ value: { metadata: { phone_number_id: acc.phoneNumberId }, message_echoes: [{ from: "4915112345678", to: "4917600000001", id: "wamid.echo1", type: "text", text: { body: "Hallo, hier direkt vom Handy" } }] } }] }],
    });
    expect(await prisma.message.count({ where: { conversationId: conv.id } })).toBe(1);
  });

  it("Knopf „Keine Nachrichten mehr“ auf eine Kampagne → wie STOPP: gesperrt, Assistent schweigt", async () => {
    await prisma.customer.update({ where: { id: customerId }, data: { existingCustomersEnabled: true } });
    const acc = await connect();
    const phone = "4917600000002";
    const ec = await prisma.existingCustomer.create({ data: { customerId, firstName: "Erika", lastName: "Muster", phone, lines: ["KFZ"] } });
    const campaign = await prisma.customerCampaign.create({ data: { customerId, name: "Jahresgespräch", occasion: "review", segment: {}, status: "running" } });
    await prisma.campaignRecipient.create({ data: { campaignId: campaign.id, existingCustomerId: ec.id, status: "sent", sentAt: new Date() } });

    await handleInboundPayload({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: acc.phoneNumberId },
                contacts: [{ profile: { name: "Erika" } }],
                messages: [{ from: phone, id: "wamid.btn1", type: "button", button: { text: "Keine Nachrichten mehr", payload: "Keine Nachrichten mehr" } }],
              },
            },
          ],
        },
      ],
    });
    expect((await prisma.existingCustomer.findUniqueOrThrow({ where: { id: ec.id } })).optOutAt).not.toBeNull();
    const conv = await prisma.conversation.findFirstOrThrow({ where: { customerId, contactPhone: phone }, include: { messages: { orderBy: { createdAt: "asc" } } } });
    expect(conv.botActive).toBe(false);
    expect(conv.messages[0]).toMatchObject({ direction: "inbound", kind: "button", body: "Keine Nachrichten mehr" });
    const rec = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: campaign.id } });
    expect(rec).toMatchObject({ status: "replied", reason: "Stopp" });
  });
});

describe("Knopf-Antworten (v4)", () => {
  const press = (phoneNumberId: string | null, from: string, id: string, text: string, payload?: string) =>
    handleInboundPayload({
      entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId ?? undefined }, messages: [{ from, id, type: "button", button: { text, payload: payload ?? text } }] } }] }],
    });

  it("„Ja, passt“ bestätigt den Termin, kurze Antwort, kein Assistent", async () => {
    const acc = await connect();
    const phone = "4917600000031";
    const lead = await prisma.lead.create({ data: { customerId, name: "Julia Schneider", phone, status: "In Beratung" } });
    const conv = await prisma.conversation.create({ data: { customerId, contactPhone: phone, leadId: lead.id } });
    const appt = await prisma.appointment.create({ data: { customerId, leadId: lead.id, conversationId: conv.id, mode: "phone", startsAt: new Date(Date.now() + 20 * 3600_000), status: "booked" } });
    await press(acc.phoneNumberId, phone, "wamid.k1", "Ja, passt");
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).confirmedAt).not.toBeNull();
    const out = await prisma.message.findMany({ where: { conversationId: conv.id, direction: "outbound" } });
    expect(out).toHaveLength(1);
    expect(out[0].body).toMatch(/^Super, danke! Dann bis /);
    expect(await prisma.message.count({ where: { conversationId: conv.id, kind: "appointment_confirmed" } })).toBe(1);
  });

  it("„Nein, danke“ (letzte Nachricht) → Lead sauber verloren mit Grund „kein Bedarf“; getippt zählt es nicht", async () => {
    const acc = await connect();
    const phone = "4917600000032";
    const lead = await prisma.lead.create({ data: { customerId, name: "Julia Schneider", phone, status: "Im Gespräch" } });
    const conv = await prisma.conversation.create({ data: { customerId, contactPhone: phone, leadId: lead.id } });
    // Getippt „Nein, danke“ kann eine Antwort auf eine andere Frage sein: kein Verloren
    await handleInboundPayload({
      entry: [{ changes: [{ value: { metadata: { phone_number_id: acc.phoneNumberId }, messages: [{ from: phone, id: "wamid.k2a", type: "text", text: { body: "Nein, danke" } }] } }] }],
    });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).not.toBe("Kein Interesse");
    await press(acc.phoneNumberId, phone, "wamid.k2", "Nein, danke");
    const l = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(l).toMatchObject({ status: "Kein Interesse", lostReason: "kein_interesse", reached: true });
    expect(l.lostNote).toContain("kein Bedarf");
    const out = await prisma.message.findMany({ where: { conversationId: conv.id, direction: "outbound" }, orderBy: { createdAt: "asc" } });
    expect(out.at(-1)?.body).toContain("danke für deine Rückmeldung");
  });

  it("Kampagne: „Kein Bedarf“ → beantwortet, kein Lead, keine Sperre", async () => {
    await prisma.customer.update({ where: { id: customerId }, data: { existingCustomersEnabled: true } });
    const acc = await connect();
    const phone = "4917600000033";
    const ec = await prisma.existingCustomer.create({ data: { customerId, firstName: "Erika", lastName: "Muster", phone, lines: ["KFZ"] } });
    const campaign = await prisma.customerCampaign.create({ data: { customerId, name: "Lücke Hausrat", occasion: "cross_sell", segment: {}, status: "running" } });
    await prisma.campaignRecipient.create({ data: { campaignId: campaign.id, existingCustomerId: ec.id, status: "sent", sentAt: new Date() } });
    await press(acc.phoneNumberId, phone, "wamid.k3", "Kein Bedarf");
    expect(await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: campaign.id } })).toMatchObject({ status: "replied", reason: "Kein Bedarf", leadId: null });
    expect((await prisma.existingCustomer.findUniqueOrThrow({ where: { id: ec.id } })).optOutAt).toBeNull();
    expect(await prisma.lead.count({ where: { customerId, phone } })).toBe(0);
    const conv = await prisma.conversation.findFirstOrThrow({ where: { customerId, contactPhone: phone }, include: { messages: { where: { direction: "outbound" } } } });
    expect(conv.optedOutAt).toBeNull();
    expect(conv.messages[0]?.body).toContain("vielen Dank für Ihre Rückmeldung");
  });
});
