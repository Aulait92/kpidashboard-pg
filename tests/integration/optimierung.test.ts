import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { MetaApi } from "@/lib/kampagnen/builder";
import { monthRange } from "@/lib/ppl/periods";
import {
  addManualMeasure,
  approveMeasures,
  executeApprovedMeasures,
  listExecutedMeasures,
  listMetaActivities,
  loadOptimizationOverview,
  planAccount,
  rejectMeasure,
  runEarlyWarning,
  syncMetaActivities,
  syncOptimizationAccounts,
  type OptimizationDeps,
} from "@/lib/optimierung/server";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

// Optimierung je Werbekonto mit gemockter Meta-API: Trockenlauf ändert nichts, Vorschlag →
// Freigabe → Ausführung (nur PAUSED bzw. Budget), Autopilot, kein Zugriff → Aufgabe,
// Protokoll für den Monatsbericht, Frühwarnung ohne Doppelungen, Meta-Änderungsprotokoll.

const NOW = new Date("2026-11-21T10:00:00Z");
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

type Call = { method: "get" | "post"; path: string; params?: Record<string, string>; body?: Record<string, unknown> };
type FakeAd = { id: string; spend: number; leads: number; created: number; status?: string; adSet?: string };

function fakeMeta(acc: string, ads: FakeAd[], extra: (path: string, params?: Record<string, string>) => unknown = () => undefined): MetaApi & { calls: Call[] } {
  const calls: Call[] = [];
  const state = new Map(ads.map((a) => [a.id, a.status ?? "ACTIVE"]));
  return {
    calls,
    async get<T>(path: string, params?: Record<string, string>) {
      calls.push({ method: "get", path, params });
      const r = extra(path, params);
      if (r instanceof Error) throw r;
      if (r !== undefined) return r as T;
      if (path === `act_${acc}/campaigns`) return { data: [{ id: "c1", name: "PG | Test | TKV | Lead", effective_status: "ACTIVE", daily_budget: "3000" }] } as T;
      if (path === "c1/adsets") return { data: [{ id: "s1", name: "Katzenhalter", effective_status: "ACTIVE" }] } as T;
      if (path === "c1/ads" || path === "s1/ads") return { data: ads.map((a) => ({ id: a.id, name: `Anzeige ${a.id}`, adset_id: a.adSet ?? "s1", created_time: daysAgo(a.created), effective_status: state.get(a.id) })) } as T;
      if (path === "c1/insights") {
        if (!params?.fields.includes("frequency")) return { data: [] } as T; // 14 Tage davor: keine Daten
        return { data: ads.map((a) => ({ ad_id: a.id, spend: String(a.spend), impressions: "5000", clicks: "70", frequency: "1.5", actions: [{ action_type: "lead", value: String(a.leads) }] })) } as T;
      }
      if (state.has(path)) return { effective_status: state.get(path), name: `Anzeige ${path}` } as T;
      return { data: [] } as T;
    },
    async post<T>(path: string, body: Record<string, unknown>) {
      calls.push({ method: "post", path, body });
      if (body.status) state.set(path, String(body.status));
      return { success: true } as T;
    },
    async del() {},
  };
}

function deps(meta: MetaApi, over: Partial<OptimizationDeps> = {}): OptimizationDeps & { notes: string[]; refreshCalls: unknown[] } {
  const notes: string[] = [];
  const refreshCalls: unknown[] = [];
  return {
    notes,
    refreshCalls,
    meta,
    hasToken: () => true,
    agencyAccounts: () => ["777"],
    task: async (contactId, title, note) => void (await prisma.salesTask.create({ data: { contactId, type: "SONSTIGES", title, note, dueAt: NOW } })),
    notify: async (title) => void notes.push(title),
    productMatcher: async () => (name: string) => (name.toLowerCase().includes("testprodukt optimierung") ? "Testprodukt Optimierung" : null),
    refresh: async (input) => {
      refreshCalls.push(input);
      return { status: "built", runId: "run-x", note: "3 neue Anzeigen pausiert angelegt" };
    },
    ...over,
  };
}

describe("Optimierung je Werbekonto", () => {
  const ids: string[] = [];
  const names: string[] = [];
  async function customer(account: string) {
    const c = await makeCustomer({ metaAdAccountId: account });
    ids.push(c.id);
    names.push(c.name);
    await syncOptimizationAccounts();
    const a = await prisma.optimizationAccount.findUniqueOrThrow({ where: { customerId: c.id } });
    // Ziel-Leadpreis fest, damit die Prüfung nicht vom Rechner abhängt
    await prisma.optimizationAccount.update({ where: { id: a.id }, data: { targetCpl: 25 } });
    return { c, a };
  }
  const weakAndGood: FakeAd[] = [
    { id: "a1", spend: 200, leads: 1, created: 20 },
    { id: "a2", spend: 100, leads: 6, created: 20 },
  ];

  beforeAll(() => requireTestDb());
  afterAll(async () => {
    for (const n of names) await prisma.salesTask.deleteMany({ where: { title: { contains: n } } });
    await prisma.salesTask.deleteMany({ where: { title: { contains: "Testprodukt Optimierung" } } });
    await prisma.optimizationAccount.deleteMany({ where: { poolProduct: "Testprodukt Optimierung" } });
    for (const id of ids) await cleanupCustomer(id);
    await prisma.metaAdActivity.deleteMany({ where: { adAccountId: { in: ["90001", "90002", "90003", "90004", "90005"] } } });
    await prisma.optimizationSettings.deleteMany({});
  });

  it("Trockenlauf: plant, liest nur, speichert nichts", async () => {
    const { a } = await customer("90001");
    const meta = fakeMeta("90001", weakAndGood);
    const r = await planAccount(a.id, { dryRun: true, now: NOW, deps: deps(meta) });
    expect(r.problem).toBeNull();
    expect(r.measures.map((m) => m.kind)).toEqual(["anzeige_pausieren"]);
    expect(r.measures[0].targetId).toBe("a1");
    expect(r.stats).toMatchObject({ campaigns: 1, ads: 2, spend14d: 300, leads14d: 7, refCpl: 25, currentDailyBudget: 30 });
    expect(meta.calls.every((c) => c.method === "get")).toBe(true);
    expect(await prisma.optimizationMeasure.count({ where: { accountId: a.id } })).toBe(0);
    expect((await prisma.optimizationAccount.findUniqueOrThrow({ where: { id: a.id } })).lastRunAt).toBeNull();
  });

  it("Vorschlag: geplant → freigeben → ausführen (nur PAUSED), keine Doppelplanung, Protokoll", async () => {
    const { c, a } = await customer("90002");
    const meta = fakeMeta("90002", weakAndGood);
    const d = deps(meta);
    const r1 = await planAccount(a.id, { now: NOW, deps: d });
    expect(r1.saved).toBe(1);
    const r2 = await planAccount(a.id, { now: new Date(NOW.getTime() + 3600_000), deps: d });
    expect(r2.saved).toBe(0);
    const m = await prisma.optimizationMeasure.findFirstOrThrow({ where: { accountId: a.id } });
    expect(m).toMatchObject({ status: "geplant", kind: "anzeige_pausieren", customerId: c.id, decidedBy: null });
    expect(d.notes.some((n) => n.includes(a.label))).toBe(true);

    // Ohne Freigabe passiert nichts
    expect(await executeApprovedMeasures(NOW, d)).toBe(0);
    expect(meta.calls.some((x) => x.method === "post")).toBe(false);

    expect(await approveMeasures({ accountId: a.id }, { email: "ole@test.local" }, d, NOW)).toBe(1);
    expect(await executeApprovedMeasures(NOW, d)).toBe(1);
    expect(meta.calls.filter((x) => x.method === "post")).toEqual([{ method: "post", path: "a1", body: { status: "PAUSED" } }]);
    const done = await prisma.optimizationMeasure.findUniqueOrThrow({ where: { id: m.id } });
    expect(done).toMatchObject({ status: "ausgefuehrt", decidedBy: "ole@test.local" });
    expect(done.executedAt?.toISOString()).toBe(NOW.toISOString());
    expect(await executeApprovedMeasures(NOW, d)).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "optimierung.ausgefuehrt", entityId: m.id } })).toBe(1);

    const month = monthRange(NOW);
    const list = await listExecutedMeasures(c.id, month.start, month.end);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: "anzeige_pausieren", source: "automatik", account: { id: a.id, kind: "kunde" } });
    expect(list[0].reportText).not.toMatch(/[–—]/);

    const overview = await loadOptimizationOverview(NOW);
    const row = overview.rows.find((x) => x.id === a.id)!;
    expect(row.lastMeasureAt?.toISOString()).toBe(NOW.toISOString());
    expect(row.stale).toBe(false);
  });

  it("Autopilot: sofort freigegeben; Vorschläge an Ole bleiben geplant; Ablehnen", async () => {
    const { c, a } = await customer("90003");
    await prisma.optimizationAccount.update({ where: { id: a.id }, data: { autopilot: true } });
    const created = new Date(NOW.getTime() - 10 * DAY);
    for (let i = 0; i < 12; i++) {
      await prisma.lead.create({
        data: { customerId: c.id, createdAt: created, ...(i < 6 ? { status: "Disqualifiziert", disqualifyReason: "region" } : { status: "Termin vereinbart", reached: true }) },
      });
    }
    const meta = fakeMeta("90003", weakAndGood);
    const r = await planAccount(a.id, { now: NOW, deps: deps(meta) });
    expect(r.autopilot).toBe(true);
    const rows = await prisma.optimizationMeasure.findMany({ where: { accountId: a.id }, orderBy: { kind: "asc" } });
    expect(rows.map((x) => [x.kind, x.status, x.decidedBy])).toEqual([
      ["anzeige_pausieren", "freigegeben", "Autopilot"],
      ["zielgruppe_vorschlag", "geplant", null],
    ]);
    expect(rows[1].reason).toMatch(/6 von 12 Leads/);
    expect(await rejectMeasure(rows[1].id, { email: "ole@test.local" }, "passt so")).toBe(true);
    expect((await prisma.optimizationMeasure.findUniqueOrThrow({ where: { id: rows[1].id } })).status).toBe("abgelehnt");
    // Freigegeben, aber noch nicht ausgeführt: lässt sich noch stoppen
    expect(await rejectMeasure(rows[0].id, { email: "ole@test.local" }, null)).toBe(true);
  });

  it("Neue Motive: von den Agenten angelegte Kampagne → Auffrischungs-Lauf nach Freigabe", async () => {
    const { c, a } = await customer("90004");
    await prisma.campaignRun.create({
      data: { customerId: c.id, product: "TKV", status: "built", kind: "neu", steps: [], built: { campaignId: "c1", adSetIds: ["s1"], formId: "f1", imageHashes: [], creativeIds: [], adIds: [] } },
    });
    const meta = fakeMeta("90004", [
      { id: "b1", spend: 100, leads: 5, created: 35 },
      { id: "b2", spend: 100, leads: 5, created: 30 },
    ]);
    const d = deps(meta);
    await planAccount(a.id, { now: NOW, deps: d });
    const m = await prisma.optimizationMeasure.findFirstOrThrow({ where: { accountId: a.id } });
    expect(m).toMatchObject({ kind: "motiv_erneuern", targetId: "s1", major: true });
    await approveMeasures({ accountId: a.id }, { email: "ole@test.local" }, d, NOW);
    await executeApprovedMeasures(NOW, d);
    expect(d.refreshCalls).toEqual([expect.objectContaining({ customerId: c.id, campaignId: "c1", adSetId: "s1" })]);
    expect(await prisma.optimizationMeasure.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({ status: "ausgefuehrt", campaignRunId: "run-x" });
    expect(meta.calls.some((x) => x.method === "post")).toBe(false);
  });

  it("Nicht freigegeben nach 14 Tagen: verfällt, neue Planung mit frischen Zahlen", async () => {
    const { a } = await customer("90010");
    const d = deps(fakeMeta("90010", weakAndGood));
    await planAccount(a.id, { now: NOW, deps: d });
    await planAccount(a.id, { now: new Date(NOW.getTime() + 15 * DAY), deps: d });
    const rows = await prisma.optimizationMeasure.findMany({ where: { accountId: a.id, kind: "anzeige_pausieren" }, orderBy: { plannedAt: "asc" } });
    expect(rows.map((r) => [r.status, r.decidedBy])).toEqual([
      ["abgelehnt", "System"],
      ["geplant", null],
    ]);
  });

  it("Kein Zugriff: Aufgabe für Ole (einmal), keine Maßnahme", async () => {
    const { a } = await customer("90005");
    const denied = () => new Error('Meta GET act_90005/campaigns 400: {"error":{"message":"(#200) Ad account owner has NOT grant ads_management or ads_read permission","code":200}}');
    const meta = fakeMeta("90005", [], (path) => (path.startsWith("act_90005") ? denied() : undefined));
    const r = await planAccount(a.id, { now: NOW, deps: deps(meta) });
    expect(r.problem).toMatch(/kein Zugriff/);
    await planAccount(a.id, { now: new Date(NOW.getTime() + 8 * DAY), deps: deps(meta) });
    const tasks = await prisma.salesTask.findMany({ where: { title: `Werbekonto ${a.label}: kein Zugriff für die Optimierung` } });
    expect(tasks).toHaveLength(1);
    expect(await prisma.optimizationMeasure.count({ where: { accountId: a.id } })).toBe(0);
  });

  it("Ohne Token: Aufgabe statt Lauf", async () => {
    const { a } = await customer("90006");
    const r = await planAccount(a.id, { now: NOW, deps: deps(fakeMeta("90006", []), { hasToken: () => false }) });
    expect(r.problem).toMatch(/META_ACCESS_TOKEN/);
    expect(await prisma.salesTask.count({ where: { title: "Optimierung: Meta-Token fehlt (META_ACCESS_TOKEN)", doneAt: null } })).toBeGreaterThan(0);
    await prisma.salesTask.deleteMany({ where: { title: "Optimierung: Meta-Token fehlt (META_ACCESS_TOKEN)" } });
  });

  it("Maßnahme eintragen (von Hand) und Frühwarnung ab dem 20. ohne Doppelungen", async () => {
    const { c, a } = await customer("90007");
    const other = await customer("90008");
    const d = deps(fakeMeta("90007", []));
    // Vor dem 20.: keine Frühwarnung
    await runEarlyWarning(new Date("2026-11-18T10:00:00Z"), d);
    expect(await prisma.salesTask.count({ where: { title: `Kunde ${c.name}: diesen Monat noch nichts optimiert` } })).toBe(0);

    const bad = await addManualMeasure({ customerId: other.c.id, topic: "zielgruppe", title: "x", executedAt: NOW }, { email: "ole@test.local" }, NOW);
    expect(bad.ok).toBe(false);
    const ok = await addManualMeasure({ customerId: other.c.id, topic: "zielgruppe", title: "Umkreis auf 25 km verkleinert", reason: "viele Leads außerhalb", executedAt: new Date("2026-11-19T12:00:00Z") }, { email: "ole@test.local" }, NOW);
    expect(ok.ok).toBe(true);

    await runEarlyWarning(NOW, d);
    await runEarlyWarning(new Date(NOW.getTime() + DAY), d);
    expect(await prisma.salesTask.count({ where: { title: `Kunde ${c.name}: diesen Monat noch nichts optimiert` } })).toBe(1);
    expect(await prisma.salesTask.count({ where: { title: `Kunde ${other.c.name}: diesen Monat noch nichts optimiert` } })).toBe(0);
    // Erledigt geklickt: im selben Monat trotzdem keine zweite
    await prisma.salesTask.updateMany({ where: { title: `Kunde ${c.name}: diesen Monat noch nichts optimiert` }, data: { doneAt: NOW } });
    await runEarlyWarning(new Date(NOW.getTime() + 2 * DAY), d);
    expect(await prisma.salesTask.count({ where: { title: `Kunde ${c.name}: diesen Monat noch nichts optimiert` } })).toBe(1);

    const month = monthRange(NOW);
    const list = await listExecutedMeasures(other.c.id, month.start, month.end);
    expect(list).toEqual([expect.objectContaining({ kind: "manuell", source: "manuell", title: "Umkreis auf 25 km verkleinert", reportText: "Umkreis auf 25 km verkleinert", account: expect.objectContaining({ id: other.a.id }) })]);
    expect(a.id).not.toBe(other.a.id);
  });

  it("Pay-per-Lead-Pool: Konto je Produkt, Kampagnen über das Produkt, Pool-Maßnahmen im Protokoll des Kunden", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    names.push(c.name);
    await prisma.leadSubscription.create({ data: { customerId: c.id, productKey: "Testprodukt Optimierung", price: 30 } });
    await syncOptimizationAccounts();
    const pool = await prisma.optimizationAccount.findUniqueOrThrow({ where: { poolProduct: "Testprodukt Optimierung" } });
    expect(pool).toMatchObject({ kind: "pool", active: true, customerId: null });
    const meta = fakeMeta("777", [], (path) =>
      path === "act_777/campaigns"
        ? { data: [{ id: "p1", name: "Testprodukt Optimierung | Lead", effective_status: "ACTIVE" }, { id: "p2", name: "Anderes Produkt", effective_status: "ACTIVE" }] }
        : undefined,
    );
    const r = await planAccount(pool.id, { dryRun: true, now: NOW, deps: deps(meta) });
    expect(r.stats.campaigns).toBe(1);
    expect(meta.calls.some((x) => x.path.startsWith("p2/"))).toBe(false);

    await addManualMeasure({ accountId: pool.id, topic: "anzeigen", title: "Neue Motive für den Pool", executedAt: NOW }, { email: "ole@test.local" }, NOW);
    const month = monthRange(NOW);
    expect((await listExecutedMeasures(c.id, month.start, month.end)).map((m) => m.title)).toEqual(["Neue Motive für den Pool"]);
    expect(await listExecutedMeasures(c.id, month.start, month.end, { includePools: false })).toEqual([]);
  });

  it("Meta-Änderungsprotokoll: speichern ohne Dubletten, je Kunde abrufbar", async () => {
    const { c, a } = await customer("90009");
    const rows = [
      { event_time: "2026-11-18T09:00:00+0000", event_type: "update_ad_run_status", object_id: "a1", object_name: "Anzeige a1", actor_name: "Ole" },
      { event_time: "2026-11-19T09:00:00+0000", event_type: "update_ad_set_budget", object_id: "s1", object_name: "Katzenhalter" },
    ];
    const meta = fakeMeta("90009", [], (path) => (path === "act_90009/activities" ? { data: rows } : undefined));
    await syncMetaActivities(NOW, deps(meta), { accountId: a.id });
    await syncMetaActivities(NOW, deps(meta), { accountId: a.id, force: true });
    const month = monthRange(NOW);
    const list = await listMetaActivities(c.id, month.start, month.end);
    expect(list.map((x) => x.eventType)).toEqual(["update_ad_run_status", "update_ad_set_budget"]);
    await prisma.metaAdActivity.deleteMany({ where: { adAccountId: "90009" } });
  });
});
