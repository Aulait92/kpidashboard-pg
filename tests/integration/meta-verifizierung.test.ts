// Integritätssperre bei Meta (Ole, 27.11.2026, CL Capital Living): Policen-Flow „Blocked by Integrity“ → nur einmal
// täglich neu versuchen, Sentry nur beim ersten Mal, Grund lesbar; Stand der Unternehmensverifizierung aus der
// Partner-API gecacht (nicht bei jedem Seitenaufruf); neu verifiziert → Flow sofort wieder anlegen; Anzeige-Logik.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const flowApi = { create: vi.fn(), get: vi.fn(), list: vi.fn(), upload: vi.fn(), publish: vi.fn() };
vi.mock("@/lib/policen/flow/dialog360-flows", () => ({
  createFlow: (...a: unknown[]) => flowApi.create(...a),
  getFlow: (...a: unknown[]) => flowApi.get(...a),
  listFlows: (...a: unknown[]) => flowApi.list(...a),
  uploadFlowJson: (...a: unknown[]) => flowApi.upload(...a),
  publishFlow: (...a: unknown[]) => flowApi.publish(...a),
}));
vi.mock("@/lib/whatsapp/dialog360", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/dialog360")>()),
  listTemplates: async () => [],
  createTemplate: async (_k: string, req: { name: string; category: string }) => ({ name: req.name, language: "de", status: "PENDING", category: req.category, rejectedReason: null }),
}));
const partner = { list: vi.fn() };
vi.mock("@/lib/whatsapp/dialog360-partner", async (orig) => ({
  ...(await orig<typeof import("@/lib/whatsapp/dialog360-partner")>()),
  partnerConfig: () => ({ partnerId: "p", apiKey: "k", hubUrl: "https://hub.test", onboardingUrl: "https://x" }),
  listPartnerChannels: (...a: unknown[]) => partner.list(...a),
}));
const report = vi.fn();
vi.mock("@/lib/monitoring", async (orig) => ({ ...(await orig<typeof import("@/lib/monitoring")>()), reportError: (...a: unknown[]) => report(...a) }));

import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/encryption";
import * as flow from "@/lib/policen/flow/server";
import { GRUND_INTEGRITAET, GRUND_VERIFIZIERUNG_FEHLT, STATUS_META_GESPERRT } from "@/lib/policen/flow/meta-sperre";
import { ladeMetaVerifizierung, syncMetaVerifizierung } from "@/lib/whatsapp/meta-verifizierung";
import { parsePartnerChannel } from "@/lib/whatsapp/dialog360-partner";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const uid = () => Math.random().toString(36).slice(2, 10);
const HOUR = 60 * 60 * 1000;
const SPERRE = new Error(
  '360dialog flows 400: {"error":{"message":"Blocked by Integrity","type":"OAuthException","code":139000,"error_subcode":4233020,"error_user_title":"Integrity requirements not met"}}',
);
const ABLAGE_ENV = {
  POLICEN_S3_ENDPOINT: "https://test123.eu.r2.cloudflarestorage.com",
  POLICEN_S3_BUCKET: "pg-policen-eu",
  POLICEN_S3_ACCESS_KEY_ID: "id",
  POLICEN_S3_SECRET_ACCESS_KEY: "secret",
  POLICEN_SCHLUESSEL: Buffer.alloc(32, 11).toString("base64"),
};
const kanal = (id: string, customerId: string, status: string) =>
  parsePartnerChannel({ id, waba_account: { external_id: `w-${id}`, fb_account_status: status, on_behalf_of_business_info: { name: "CL Capital Living GmbH" } }, client: { id: "c", partner_payload: customerId } })!;

describe("Meta-Unternehmensverifizierung und Flow-Backoff", () => {
  let customerId = "";
  const channelId = `ch-${uid()}`;

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    Object.assign(process.env, ABLAGE_ENV);
    customerId = (await makeCustomer({ name: `CL Test ${uid()}`, leadAddress: "sie", plan: "service" })).id;
    await prisma.whatsAppAccount.create({ data: { customerId, status: "connected", phoneNumberId: `pnid-${uid()}`, apiKeyEnc: encryptSecret("k"), dialog360ChannelId: channelId } });
  });
  afterAll(async () => {
    delete process.env.POLICEN_FLOW;
    delete process.env.POLICEN_FLOW_KUNDEN;
    for (const k of Object.keys(ABLAGE_ENV)) delete process.env[k];
    await prisma.policenFlow.deleteMany({ where: { customerId } });
    await cleanupCustomer(customerId);
  });
  beforeEach(async () => {
    process.env.POLICEN_FLOW = "1";
    process.env.POLICEN_FLOW_KUNDEN = customerId;
    for (const f of [...Object.values(flowApi), partner.list, report]) f.mockReset();
    flowApi.list.mockResolvedValue([]);
    await prisma.policenFlow.deleteMany({ where: { customerId } });
    await prisma.whatsAppAccount.update({ where: { customerId }, data: { metaBusinessStatus: null, metaBusinessName: null, metaBusinessCheckedAt: null } });
  });

  it("Status-Cache: eine Anfrage, gespeichert am Konto, nicht bei jedem Lauf erneut", async () => {
    const t0 = new Date("2026-11-27T20:00:00Z");
    partner.list.mockResolvedValue([kanal("fremd", "x", "verified"), kanal(channelId, customerId, "not_verified")]);
    const r = await syncMetaVerifizierung(t0);
    expect(r?.geprueft).toBeGreaterThanOrEqual(1);
    const acc = await prisma.whatsAppAccount.findUniqueOrThrow({ where: { customerId } });
    expect(acc).toMatchObject({ metaBusinessStatus: "not_verified", metaBusinessName: "CL Capital Living GmbH" });
    expect(acc.metaBusinessCheckedAt?.getTime()).toBe(t0.getTime());
    // Alle anderen Konten der Test-DB als frisch markieren, dann: 1 Std. später kein Abruf
    await prisma.whatsAppAccount.updateMany({ where: { metaBusinessCheckedAt: null }, data: { metaBusinessCheckedAt: t0, metaBusinessStatus: "verified" } });
    partner.list.mockClear();
    expect(await syncMetaVerifizierung(new Date(t0.getTime() + HOUR))).toEqual({ geprueft: 0, neuVerifiziert: 0 });
    expect(partner.list).not.toHaveBeenCalled();
    // Seitenaufruf liest nur den gespeicherten Stand; ohne Sperre des Formulars kein Hinweis (nicht verifiziert reicht nicht)
    expect(await ladeMetaVerifizierung(customerId)).toBeNull();
    await prisma.policenFlow.create({ data: { customerId, status: STATUS_META_GESPERRT, fehler: GRUND_VERIFIZIERUNG_FEHLT } });
    expect(await ladeMetaVerifizierung(customerId)).toBe("offen");
    expect(partner.list).not.toHaveBeenCalled();
  });

  it("Blocked by Integrity: Grund lesbar, Sentry einmal, nur einmal täglich neu; verifiziert → sofort wieder versuchen", async () => {
    await prisma.whatsAppAccount.update({ where: { customerId }, data: { metaBusinessStatus: "not_verified", metaBusinessCheckedAt: new Date() } });
    flowApi.create.mockRejectedValue(SPERRE);
    const t0 = new Date("2026-11-27T20:00:00Z");
    const e = await flow.syncPolicenFlowFuerKunde(customerId, t0);
    expect(e).toMatchObject({ status: STATUS_META_GESPERRT, fehler: GRUND_VERIFIZIERUNG_FEHLT });
    const rec = await prisma.policenFlow.findUniqueOrThrow({ where: { customerId } });
    expect(rec.fehler).toBe("Formular bei Meta gesperrt: Unternehmensverifizierung fehlt");
    expect(rec.naechsterVersuchAt?.getTime()).toBe(t0.getTime() + 24 * HOUR);
    expect(report).toHaveBeenCalledTimes(1);
    expect(await flow.aktiverFlow(customerId)).toBeNull();
    expect(await ladeMetaVerifizierung(customerId)).toBe("offen");

    // Cron-Läufe alle 30 Min. am selben Tag: kein Anlegen, kein Sentry
    for (const h of [0.5, 1, 6, 23]) {
      const r = await flow.syncPolicenFlows(new Date(t0.getTime() + h * HOUR), { limit: 500 });
      expect(r.geprueft).toBe(0);
    }
    expect(flowApi.create).toHaveBeenCalledTimes(1);
    // Direkter Aufruf innerhalb der Sperre ebenfalls ohne Anfrage
    expect((await flow.syncPolicenFlowFuerKunde(customerId, new Date(t0.getTime() + 2 * HOUR))).status).toBe(STATUS_META_GESPERRT);
    expect(flowApi.create).toHaveBeenCalledTimes(1);

    // Nach 24 Std.: genau ein neuer Versuch, wieder gesperrt, aber kein zweites Sentry
    const r24 = await flow.syncPolicenFlows(new Date(t0.getTime() + 24 * HOUR), { limit: 500 });
    expect(r24.geprueft).toBe(1);
    expect(flowApi.create).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledTimes(1);
    const t1 = new Date(t0.getTime() + 24 * HOUR);

    // Meta meldet „verified“: Abgleich hebt die Sperre auf, der nächste Lauf legt sofort an
    await prisma.whatsAppAccount.update({ where: { customerId }, data: { metaBusinessCheckedAt: new Date(0) } });
    partner.list.mockResolvedValue([kanal(channelId, customerId, "verified")]);
    const s = await syncMetaVerifizierung(new Date(t1.getTime() + HOUR));
    expect(s?.neuVerifiziert).toBeGreaterThanOrEqual(1);
    expect((await prisma.policenFlow.findUniqueOrThrow({ where: { customerId } })).naechsterVersuchAt).toBeNull();
    flowApi.create.mockResolvedValue({ id: "flow-ok", validationErrors: [] });
    flowApi.get.mockResolvedValue({ id: "flow-ok", name: "x", status: "PUBLISHED", validationErrors: [] });
    const r = await flow.syncPolicenFlows(new Date(t1.getTime() + HOUR + 60_000), { limit: 500 });
    expect(r.geprueft).toBe(1);
    const ok = await prisma.policenFlow.findUniqueOrThrow({ where: { customerId } });
    expect(ok).toMatchObject({ status: "veroeffentlicht", flowId: "flow-ok", fehler: null, naechsterVersuchAt: null });
    expect(await ladeMetaVerifizierung(customerId)).toBe("erledigt");
  });

  it("Sperre ohne bekannte fehlende Verifizierung: allgemeiner Grund", async () => {
    flowApi.create.mockRejectedValue(SPERRE);
    const e = await flow.syncPolicenFlowFuerKunde(customerId, new Date());
    expect(e.fehler).toBe(GRUND_INTEGRITAET);
  });

  it("Anzeige: nur mit Schalter, erlaubtem Kunden und bekanntem Stand", async () => {
    await prisma.whatsAppAccount.update({ where: { customerId }, data: { metaBusinessStatus: "not_verified", metaBusinessCheckedAt: new Date() } });
    await prisma.policenFlow.create({ data: { customerId, status: STATUS_META_GESPERRT, fehler: GRUND_VERIFIZIERUNG_FEHLT } });
    expect(await ladeMetaVerifizierung(customerId)).toBe("offen");
    process.env.POLICEN_FLOW_KUNDEN = "jemand-anders";
    expect(await ladeMetaVerifizierung(customerId)).toBeNull();
    process.env.POLICEN_FLOW_KUNDEN = customerId;
    delete process.env.POLICEN_FLOW;
    expect(await ladeMetaVerifizierung(customerId)).toBeNull();
    process.env.POLICEN_FLOW = "1";
    await prisma.whatsAppAccount.update({ where: { customerId }, data: { metaBusinessStatus: null } });
    expect(await ladeMetaVerifizierung(customerId)).toBeNull();
  });
});
