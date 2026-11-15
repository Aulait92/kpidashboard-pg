// Rückmeldung an Meta (Conversions API für CRM, Ole 15.11.2026) gegen eine echte Datenbank, Meta-Aufrufe
// (graph.facebook.com) gemockt: Dataset automatisch, Stufen je Lead einmal, Nutzlast ohne Kontaktdaten und
// Produkt, nur Meta-Leads, Testkunden nie, zu alte nicht, Fehler gekürzt und ohne Token mit Wiederholung,
// Abschalten, Status, Diagnose ohne Lead-IDs, Vorschlag „Conversion Leads“.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { capiDiagnose, conversionLeadsSuggestion, loadCapiOverview, MAX_ATTEMPTS, runCapi, sendDue } from "@/lib/capi/server";
import { GET as diagnose } from "@/app/api/ops/diagnose/route";
import { eraseLead } from "@/lib/erasure";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const H = 3_600_000;
const D = 24 * H;
const TOKEN = "EAAtesttoken0123456789abcdef";
const DATASET = "998877665544332";
let seq = 0;
const leadId = () => `1${String(Date.now()).slice(-9)}${String(++seq).padStart(6, "0")}`; // 16 Ziffern

type Call = { url: string; method: string; body: URLSearchParams | null };
const calls: Call[] = [];
let failNext = 0;

function mockMeta() {
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith("https://graph.facebook.com/")) throw new Error(`Unerwarteter Aufruf: ${url}`);
    const method = init?.method ?? "GET";
    const body = init?.body instanceof URLSearchParams ? init.body : null;
    calls.push({ url, method, body });
    if (url.includes("/adspixels")) return Response.json({ data: [{ id: DATASET, name: "Pixel Test" }] });
    if (url.endsWith(`/${DATASET}/events`)) {
      if (failNext > 0) {
        failNext--;
        return Response.json({ error: { message: `Invalid OAuth access token access_token=${TOKEN} for lead 123456789012345678`, code: 190 } }, { status: 400 });
      }
      const data = JSON.parse(String(body?.get("data")).replace(/"lead_id":(\d+)/g, '"lead_id":"$1"')) as unknown[];
      return Response.json({ events_received: data.length, fbtrace_id: "x" });
    }
    return Response.json({ error: { message: "nicht gemockt" } }, { status: 404 });
  });
}

const postedEvents = () =>
  calls
    .filter((c) => c.method === "POST")
    .flatMap((c) => JSON.parse(String(c.body?.get("data")).replace(/"lead_id":(\d+)/g, '"lead_id":"$1"')) as { event_name: string; user_data: { lead_id: string }; custom_data: Record<string, unknown> }[]);

describe("Rückmeldung an Meta", () => {
  const before = process.env.META_ACCESS_TOKEN;
  const ids: string[] = [];
  beforeAll(() => {
    requireTestDb();
    process.env.META_ACCESS_TOKEN = TOKEN;
    mockMeta();
  });
  afterEach(() => {
    calls.length = 0;
    failNext = 0;
  });
  afterAll(async () => {
    process.env.META_ACCESS_TOKEN = before;
    vi.unstubAllGlobals();
    for (const id of ids) await cleanupCustomer(id);
  });

  it("erkennt Stufen, ermittelt das Dataset und sendet nur Meta-Leads ohne Kontaktdaten und Produkt", async () => {
    const now = new Date();
    const c = await makeCustomer({ metaAdAccountId: "1234567890" });
    ids.push(c.id);
    const metaId = leadId();
    const won = await prisma.lead.create({
      data: {
        customerId: c.id,
        externalId: metaId,
        name: "Erika Mustermann",
        phone: "4915112345678",
        email: "erika@example.org",
        source: "Katzenversicherung",
        createdAt: new Date(now.getTime() - 3 * D),
        statusChangedAt: new Date(now.getTime() - 2 * H),
        status: "Abschluss",
        closedAt: new Date(now.getTime() - 2 * H),
        reached: true,
      },
    });
    const conv = await prisma.conversation.create({ data: { customerId: c.id, leadId: won.id, contactPhone: "4915112345678" } });
    await prisma.message.create({ data: { conversationId: conv.id, direction: "outbound", body: "Hallo", createdAt: new Date(now.getTime() - 3 * D + H) } });
    await prisma.message.create({ data: { conversationId: conv.id, direction: "inbound", body: "Ja gern", createdAt: new Date(now.getTime() - 3 * D + 2 * H) } });
    await prisma.appointment.create({ data: { customerId: c.id, leadId: won.id, mode: "phone", startsAt: new Date(now.getTime() - D), createdAt: new Date(now.getTime() - 2 * D) } });
    await prisma.leadContract.create({ data: { leadId: won.id, customerId: c.id, primaryLeadId: won.id, sparte: "katze", premium: 400, signedAt: new Date(now.getTime() - 2 * H) } });
    await prisma.leadContract.create({ data: { leadId: won.id, customerId: c.id, sparte: "pkv", premium: 300, signedAt: new Date(now.getTime() - 2 * H) } });
    // Nicht senden: ohne Meta-ID, fremde ID, Pay-per-Lead-Format
    const other = await prisma.lead.create({ data: { customerId: c.id, name: "Ohne ID", createdAt: new Date(now.getTime() - D) } });
    await prisma.lead.create({ data: { customerId: c.id, externalId: `perspective:${leadId()}`, createdAt: new Date(now.getTime() - D) } });
    // Eingang vor 10 Tagen: Lead „zu alt“, neuer Termin aber senden
    const oldId = leadId();
    const old = await prisma.lead.create({ data: { customerId: c.id, externalId: oldId, createdAt: new Date(now.getTime() - 10 * D), statusChangedAt: new Date(now.getTime() - 10 * D) } });
    await prisma.appointment.create({ data: { customerId: c.id, leadId: old.id, mode: "video", startsAt: new Date(now.getTime() + D), createdAt: new Date(now.getTime() - D) } });

    const r = await runCapi(now);
    expect("customers" in r && r.customers).toBeGreaterThanOrEqual(1);
    const cust = await prisma.customer.findUniqueOrThrow({ where: { id: c.id } });
    expect(cust.metaDatasetId).toBe(DATASET);
    expect(cust.metaDatasetSource).toBe("auto");

    const events = await prisma.capiEvent.findMany({ where: { customerId: c.id }, orderBy: { eventTime: "asc" } });
    const byLead = (id: string) => events.filter((e) => e.leadId === id).map((e) => `${e.stage}:${e.status}`).sort();
    expect(byLead(won.id)).toEqual(["abschluss:sent", "erreicht:sent", "lead:sent", "termin:sent"]);
    expect(byLead(old.id)).toEqual(["erreicht:sent", "lead:skipped", "termin:sent"]);
    expect(events.find((e) => e.leadId === old.id && e.stage === "lead")?.error).toBe("zu alt");
    expect(byLead(other.id)).toEqual([]);
    expect(events).toHaveLength(7);
    // Erreicht = erste eingehende WhatsApp-Nachricht
    expect(events.find((e) => e.leadId === won.id && e.stage === "erreicht")?.eventTime.getTime()).toBe(now.getTime() - 3 * D + 2 * H);
    // Wert: 400 + 12 × 300 (PKV Monatsbeitrag)
    expect(Number(events.find((e) => e.stage === "abschluss")?.value)).toBe(4000);

    // (andere Kunden in der Test-Datenbank können eigene Pakete haben)
    const posts = calls.filter((x) => x.method === "POST" && String(x.body?.get("data")).includes(metaId));
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe(`https://graph.facebook.com/v22.0/${DATASET}/events`);
    expect(posts[0].body?.get("access_token")).toBe(TOKEN);
    const raw = String(posts[0].body?.get("data"));
    expect(raw).toContain(`"lead_id":${metaId}`);
    for (const s of ["Erika", "Mustermann", "4915112345678", "erika@example.org", "Katze", "katze", "pkv", "Katzenversicherung"]) expect(raw).not.toContain(s);
    const sent = postedEvents().filter((e) => [metaId, oldId].includes(e.user_data.lead_id));
    expect(sent.map((e) => e.event_name).sort()).toEqual(["Abschluss", "Erreicht", "Erreicht", "Lead", "Termin vereinbart", "Termin vereinbart"]);
    expect(sent.find((e) => e.event_name === "Abschluss")?.custom_data).toEqual({ event_source: "crm", lead_event_source: "performancegrowth", value: 4000, currency: "EUR" });
    expect(new Set(sent.map((e) => e.user_data.lead_id))).toEqual(new Set([metaId, oldId]));
    expect(postedEvents().some((e) => e.user_data.lead_id.includes("perspective"))).toBe(false);

    // Zweiter Lauf: nichts doppelt, nichts erneut gesendet, Dataset nicht erneut gesucht
    calls.length = 0;
    await runCapi(new Date(now.getTime() + 60_000));
    expect(calls.filter((x) => x.url.includes("act_1234567890") || String(x.body?.get("data")).includes(metaId))).toHaveLength(0);
    expect(await prisma.capiEvent.count({ where: { customerId: c.id } })).toBe(7);

    // Status für den Kundenbereich
    const o = await loadCapiOverview(c.id, new Date(now.getTime() + 60_000));
    expect(o?.counts7d.sent).toBe(6);
    expect(o?.lastSent.length).toBe(6);
    expect(o?.windows.d30.stats.leads).toBe(2);
    expect(o?.windows.d30.coverage).toBe(0.5);

    // Monatsbericht: Zeile unter „Was wir für Sie getan haben“
    const { collectMeasures, CAPI_MEASURE_TEXT } = await import("@/lib/monatsbericht/server");
    const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit" }).format(now);
    expect((await collectMeasures(c.id, month)).map((m) => m.text)).toContain(CAPI_MEASURE_TEXT);
    expect((await collectMeasures(c.id, "2026-01")).map((m) => m.text)).not.toContain(CAPI_MEASURE_TEXT);
  });

  it("Testkunden und Kunden ohne Rückmeldung senden nichts", async () => {
    const now = new Date();
    const t = await makeCustomer({ metaAdAccountId: "222", metaDatasetId: DATASET, isTest: true });
    const off = await makeCustomer({ metaAdAccountId: "333", metaDatasetId: DATASET, capiEnabled: false });
    ids.push(t.id, off.id);
    await prisma.lead.create({ data: { customerId: t.id, externalId: leadId(), createdAt: new Date(now.getTime() - H) } });
    const l = await prisma.lead.create({ data: { customerId: off.id, externalId: leadId(), createdAt: new Date(now.getTime() - H) } });
    // schon wartendes Ereignis aus der Zeit vor dem Abschalten
    await prisma.capiEvent.create({ data: { customerId: off.id, leadId: l.id, stage: "lead", eventTime: new Date(now.getTime() - H) } });
    await runCapi(now);
    const own = await prisma.lead.findMany({ where: { customerId: { in: [t.id, off.id] } }, select: { externalId: true } });
    expect(postedEvents().filter((e) => own.some((o) => o.externalId === e.user_data.lead_id))).toHaveLength(0);
    expect(await prisma.capiEvent.count({ where: { customerId: t.id } })).toBe(0);
    const e = await prisma.capiEvent.findFirstOrThrow({ where: { customerId: off.id } });
    expect(e.status).toBe("skipped");
    expect(e.error).toBe("Rückmeldung abgeschaltet");
  });

  it("Fehler: gekürzt ohne Token, Wiederholung mit Abstand, höchstens 5 Versuche", async () => {
    const now = new Date();
    const c = await makeCustomer({ metaDatasetId: DATASET, metaDatasetSource: "admin" });
    ids.push(c.id);
    const l = await prisma.lead.create({ data: { customerId: c.id, externalId: leadId(), createdAt: new Date(now.getTime() - H) } });
    failNext = 1;
    await runCapi(now);
    let e = await prisma.capiEvent.findFirstOrThrow({ where: { leadId: l.id, stage: "lead" } });
    expect(e.status).toBe("failed");
    expect(e.attempts).toBe(1);
    expect(e.error).not.toContain(TOKEN);
    expect(e.error).toContain("access_token=…");
    expect(e.nextAttemptAt!.getTime()).toBeGreaterThan(now.getTime());
    // vor der Wiederholung nichts
    await sendDue(new Date(now.getTime() + 60_000));
    expect((await prisma.capiEvent.findFirstOrThrow({ where: { id: e.id } })).status).toBe("failed");
    // danach gesendet
    await sendDue(new Date(now.getTime() + 31 * 60_000));
    e = await prisma.capiEvent.findFirstOrThrow({ where: { id: e.id } });
    expect(e.status).toBe("sent");
    expect(e.error).toBeNull();

    // Dauerfehler: nach MAX_ATTEMPTS keine weitere Wiederholung
    const l2 = await prisma.lead.create({ data: { customerId: c.id, externalId: leadId(), createdAt: new Date(now.getTime() - H) } });
    failNext = 100;
    let t = now.getTime();
    await runCapi(new Date(t));
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) {
      t += 10 * H;
      await sendDue(new Date(t));
    }
    const e2 = await prisma.capiEvent.findFirstOrThrow({ where: { leadId: l2.id, stage: "lead" } });
    expect(e2.status).toBe("failed");
    expect(e2.attempts).toBe(MAX_ATTEMPTS);
    expect(e2.nextAttemptAt).toBeNull();
  });

  it("gelöschter Lead (DSGVO): Wartendes wird verworfen", async () => {
    const now = new Date();
    const c = await makeCustomer({ metaAdAccountId: "444" });
    ids.push(c.id);
    const l = await prisma.lead.create({ data: { customerId: c.id, externalId: leadId(), createdAt: new Date(now.getTime() - H) } });
    await prisma.capiEvent.create({ data: { customerId: c.id, leadId: l.id, stage: "lead", eventTime: new Date(now.getTime() - H) } });
    await eraseLead(l.id);
    const e = await prisma.capiEvent.findFirstOrThrow({ where: { leadId: l.id } });
    expect(e.status).toBe("skipped");
    expect(e.error).toBe("Lead gelöscht");
  });

  it("Diagnose ohne Lead-IDs, Vorschlag „Conversion Leads“ erst bei erfüllten Kriterien", async () => {
    const now = new Date();
    const c = await makeCustomer({ metaAdAccountId: "555", metaDatasetId: DATASET });
    ids.push(c.id);
    const n = 220;
    const metaIds = Array.from({ length: n }, () => leadId());
    await prisma.lead.createMany({
      data: metaIds.map((id, i) => ({
        customerId: c.id,
        externalId: id,
        createdAt: new Date(now.getTime() - (2 + (i % 20)) * D),
        statusChangedAt: new Date(now.getTime() - (i % 20) * D),
        status: i < 66 ? "Erreicht" : "Neuer Lead",
        reached: i < 66,
      })),
    });
    const leads = await prisma.lead.findMany({ where: { customerId: c.id }, select: { id: true, createdAt: true } });
    // Abdeckung: 50 % → noch kein Vorschlag
    await prisma.capiEvent.createMany({ data: leads.slice(0, 110).map((l) => ({ customerId: c.id, leadId: l.id, stage: "lead", eventTime: l.createdAt, status: "sent", sentAt: now })) });
    expect(await conversionLeadsSuggestion({ accountId: "acc-test", customerId: c.id }, now)).toBeNull();
    await prisma.capiEvent.createMany({ data: leads.slice(110).map((l) => ({ customerId: c.id, leadId: l.id, stage: "lead", eventTime: l.createdAt, status: "sent", sentAt: now })) });
    const m = await conversionLeadsSuggestion({ accountId: "acc-test", customerId: c.id }, now);
    expect(m?.kind).toBe("conversion_leads_vorschlag");
    expect(m?.title).toBe("Kampagne auf Conversion Leads umstellen (Stufe Erreicht)");
    expect(m?.reason).toContain("Nicht automatisch umgestellt");

    // Testkunde: nie ein Vorschlag
    await prisma.customer.update({ where: { id: c.id }, data: { isTest: true } });
    expect(await conversionLeadsSuggestion({ accountId: "acc-test", customerId: c.id }, now)).toBeNull();
    await prisma.customer.update({ where: { id: c.id }, data: { isTest: false } });

    const d = await capiDiagnose(now);
    const row = d.kunden.find((k) => k.id === c.id);
    expect(row?.datasetGesetzt).toBe(true);
    expect(row?.aktiv).toBe(true);
    const txt = JSON.stringify(d);
    for (const id of metaIds.slice(0, 20)) expect(txt).not.toContain(id);

    const tokenBefore = process.env.OPS_READ_TOKEN;
    process.env.OPS_READ_TOKEN = "test-read-token-0123456789-0123456789-abcdef";
    const res = await diagnose(new Request("https://app.test/api/ops/diagnose?q=capi", { headers: { authorization: `Bearer ${process.env.OPS_READ_TOKEN}` } }));
    process.env.OPS_READ_TOKEN = tokenBefore;
    expect(res.status).toBe(200);
    const j = (await res.json()) as { data: { kunden: { id: string }[] } };
    expect(j.data.kunden.some((k) => k.id === c.id)).toBe(true);
  });
});
