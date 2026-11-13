import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { processCampaignRun, startCampaignRun, type CampaignDeps } from "@/lib/kampagnen/run";
import { syncBudgetChangeToMeta, type BudgetSyncDeps } from "@/lib/kampagnen/budget-sync";
import { processCampaignWishes, requestCampaignLaunch, type LaunchDeps } from "@/lib/kampagnen/launch";
import { runCreativeRefresh, type RefreshDeps } from "@/lib/kampagnen/refresh";
import { saveAutomationSettings, DEFAULT_AUTOMATION } from "@/lib/kampagnen/settings";
import type { MetaApi } from "@/lib/kampagnen/builder";
import type { LlmCall } from "@/lib/kampagnen/llm";
import type { BuiltState } from "@/lib/kampagnen/types";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

// Kampagnen-Automatik mit gemocktem Claude und gemockter Meta-API:
// 1. Budget bei Meta (eindeutig → umgestellt, mehrdeutig → Aufgabe, Status bleibt),
// 2. Produkt gebucht → Lauf bzw. Aufgabe bei fehlenden Voraussetzungen,
// 3. Auffrischung legt nur PAUSED an und nie zweimal innerhalb von 14 Tagen.

const PRODUCT = "Katzenversicherung (TKV)";
const usage = { tokensIn: 1000, tokensOut: 500, costCents: 2 };
const DAY = 86_400_000;

const ANSWERS: Record<string, unknown> = {
  Stratege: { dailyBudgetEur: 30, adsPerAdSet: 3, zielgruppe: "Katzenhalter", begruendung: "Ein Set reicht.", adSets: [{ name: "Katzenhalter", ageMin: 25, ageMax: 65, radiusKm: 30, advantageAudience: true, note: "" }] },
  "Angle-Rechercheur": { angles: ["kosten", "regional", "neugier"].map((k) => ({ key: k, title: k, hook: `Hook ${k}`, insight: "weil" })) },
  Texter: {
    ads: ["kosten", "regional", "neugier"].map((k) => ({
      angleKey: k,
      primaryText: `Tierarztkosten sind gestiegen. Lassen Sie uns kurz sprechen (${k}). Jetzt Angaben eintragen – ich melde mich persönlich.`,
      headline: "Katze gut abgesichert",
      description: "Persönliche Beratung",
      imageHeadline: "Tierarztrechnung?",
      imageSubline: "Ihr Berater vor Ort",
      cta: "GET_QUOTE",
    })),
  },
  "Formular-Agent": {
    formName: "PG | Test | Katze | Formular",
    introTitle: "Katze absichern",
    introParagraphs: ["Ich melde mich persönlich per WhatsApp oder Telefon."],
    questions: [
      { key: "katze_alter", label: "Wie alt ist die Katze?", options: ["unter 2", "2–7", "älter"] },
      { key: "haltung", label: "Wohnung oder Freigang?", options: ["Wohnung", "Freigang"] },
    ],
    thankYouTitle: "Danke!",
    thankYouBody: "Ich melde mich in Kürze.",
    consentText: "Ich bin einverstanden, dass Max Muster mich per Telefon, E-Mail und WhatsApp zu meiner Anfrage kontaktiert. Widerruf jederzeit.",
  },
  Prüfer: { status: "gruen", summary: "Alles in Ordnung.", findings: [] },
};
const llm: LlmCall = async (req) => ({ text: JSON.stringify(ANSWERS[req.agent.replace(/ \(Überarbeitung\)$/, "")]), usage });

type Call = { method: "get" | "post" | "del"; path: string; params?: Record<string, string>; body?: Record<string, unknown> };
function fakeMeta(gets: (path: string, params?: Record<string, string>) => unknown = () => undefined): MetaApi & { calls: Call[] } {
  const calls: Call[] = [];
  let n = 0;
  return {
    calls,
    async get<T>(path: string, params?: Record<string, string>) {
      calls.push({ method: "get", path, params });
      const r = gets(path, params);
      if (r !== undefined) return r as T;
      if (path === "search") return { data: [{ key: "2345", name: "Musterstadt", country_code: "DE" }] } as T;
      return { access_token: "PAGE_TOKEN" } as T;
    },
    async post<T>(path: string, body: Record<string, unknown>) {
      calls.push({ method: "post", path, body });
      n++;
      if (path.endsWith("/adimages")) return { images: { x: { hash: `hash${n}` } } } as T;
      return { id: `id${n}` } as T;
    },
    async del(path: string) {
      calls.push({ method: "del", path });
    },
  };
}

function campaignDeps(meta: MetaApi, adAccountOk = true): CampaignDeps {
  return {
    llm,
    meta,
    renderCreative: async (o) => ({ imageUrl: `https://r2.test/${o.requestId}/${o.index}.jpg` }),
    checkAdAccount: async () => (adAccountOk ? { ok: true, name: "Konto" } : { ok: false, error: "(#200) Ad account owner has NOT grant ads_management" }),
    subscribePage: async () => undefined,
    notify: async () => undefined,
    env: () => ({ anthropic: true, r2: true, meta: true }),
  };
}
const tasks = (customerName: string) => prisma.salesTask.findMany({ where: { title: { contains: customerName } }, orderBy: { createdAt: "asc" } });

describe("Kampagnen-Automatik", () => {
  const ids: string[] = [];
  async function customer(extra: { account?: string | null; page?: string | null; privacy?: string | null; budget?: boolean } = {}) {
    const c = await makeCustomer({ metaAdAccountId: extra.account === undefined ? "111" : extra.account, metaPageId: extra.page === undefined ? "555" : extra.page });
    ids.push(c.id);
    if (extra.budget !== false) await prisma.customerBudget.create({ data: { customerId: c.id, product: PRODUCT, dailyBudget: 30, validFrom: new Date("2026-01-01") } });
    await prisma.onboarding.create({ data: { customerId: c.id, websiteInfo: extra.privacy === null ? {} : { privacyUrl: extra.privacy ?? "https://agentur.test/datenschutz" } } });
    return c;
  }
  async function builtRun(customerId: string, meta = fakeMeta()) {
    const d = campaignDeps(meta);
    const s = await startCampaignRun({ customerId, product: PRODUCT }, d);
    if (!s.ok) throw new Error(JSON.stringify(s.problems));
    const status = await processCampaignRun(s.runId, d);
    const run = await prisma.campaignRun.findUniqueOrThrow({ where: { id: s.runId } });
    expect(status, run.error ?? "").toBe("built");
    return run.built as unknown as BuiltState;
  }

  beforeAll(() => requireTestDb());
  afterEach(async () => {
    await saveAutomationSettings(DEFAULT_AUTOMATION);
  });
  afterAll(async () => {
    const names = (await prisma.customer.findMany({ where: { id: { in: ids } }, select: { name: true } })).map((c) => c.name);
    for (const n of names) await prisma.salesTask.deleteMany({ where: { title: { contains: n } } });
    await prisma.leadSource.deleteMany({ where: { customerId: { in: ids } } });
    for (const id of ids) await cleanupCustomer(id);
    await prisma.campaignAutomationSettings.deleteMany({});
  });

  // ─── 1. Budget ───────────────────────────────────────────────────────

  const budgetDeps = (meta: MetaApi, notes: string[] = []): BudgetSyncDeps => ({
    meta,
    notify: async (title) => void notes.push(title),
    task: async (contactId, title, note, dueAt) => void (await prisma.salesTask.create({ data: { contactId, type: "SONSTIGES", title, note, dueAt } })),
  });
  const change = (customerId: string, to = 40) =>
    prisma.budgetChange.create({
      data: { customerId, changes: [{ product: PRODUCT, from: 30, to }], effectiveFrom: new Date(Date.now() - 60_000), monthlyBudgetFrom: 900, monthlyBudgetTo: to * 30, status: "applied", metaStatus: "scheduled" },
    });

  it("Budget: eindeutige Kampagne wird umgestellt – nur daily_budget, Status unverändert", async () => {
    const c = await customer();
    const built = await builtRun(c.id);
    const meta = fakeMeta((path) => (path === built.campaignId ? { id: built.campaignId, name: `PG | ${c.name} | ${PRODUCT} | 2026-11-13`, effective_status: "PAUSED", daily_budget: "3000" } : undefined));
    const notes: string[] = [];
    const ch = await change(c.id, 45);
    const r = await syncBudgetChangeToMeta(ch.id, budgetDeps(meta, notes));
    expect(r.status).toBe("done");
    const posts = meta.calls.filter((x) => x.method === "post");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ path: built.campaignId, body: { daily_budget: 4500 } });
    expect(Object.keys(posts[0].body!)).toEqual(["daily_budget"]);
    expect((await prisma.budgetChange.findUniqueOrThrow({ where: { id: ch.id } })).metaStatus).toBe("done");
    expect(notes[0]).toMatch(/Budget bei Meta umgestellt/);
    // idempotent: zweiter Aufruf tut nichts
    expect((await syncBudgetChangeToMeta(ch.id, budgetDeps(meta))).status).toBe("skipped");
    expect(meta.calls.filter((x) => x.method === "post")).toHaveLength(1);
  });

  it("Budget: mehrdeutige Kampagnen → Aufgabe mit Grund, keine Änderung bei Meta", async () => {
    const c = await customer();
    const meta = fakeMeta((path) =>
      path === "act_111/campaigns"
        ? { data: [1, 2].map((i) => ({ id: `c${i}`, name: `PG | ${c.name} | ${PRODUCT} | 2026-0${i}-01`, effective_status: "ACTIVE", daily_budget: "3000" })) }
        : undefined,
    );
    const ch = await change(c.id);
    const r = await syncBudgetChangeToMeta(ch.id, budgetDeps(meta));
    expect(r.status).toBe("manual");
    expect(meta.calls.filter((x) => x.method === "post")).toHaveLength(0);
    const t = await tasks(c.name);
    expect(t.map((x) => x.title).join()).toMatch(/^Meta-Budget/);
    expect(t.find((x) => x.title.startsWith("Meta-Budget"))!.note).toMatch(/nicht eindeutig/);
    expect((await prisma.budgetChange.findUniqueOrThrow({ where: { id: ch.id } })).metaStatus).toBe("manual");
  });

  it("Budget: Schalter aus → Aufgabe, kein Meta-Aufruf", async () => {
    await saveAutomationSettings({ budgetSync: false });
    const c = await customer();
    const meta = fakeMeta();
    const ch = await change(c.id);
    expect((await syncBudgetChangeToMeta(ch.id, budgetDeps(meta))).status).toBe("disabled");
    expect(meta.calls).toHaveLength(0);
    expect((await tasks(c.name)).some((x) => x.title.startsWith("Meta-Budget"))).toBe(true);
  });

  // ─── 2. Produkt gebucht ──────────────────────────────────────────────

  it("Produkt gebucht: fehlende Voraussetzungen → Aufgabe; Lauf startet automatisch, sobald alles da ist", async () => {
    const c = await customer({ account: null, page: null });
    const meta = fakeMeta();
    const cd = campaignDeps(meta);
    const launch: LaunchDeps = { campaign: cd, schedule: async (runId) => void (await processCampaignRun(runId, cd)) };

    const r = await requestCampaignLaunch({ customerId: c.id, product: PRODUCT, source: "produkt" }, launch);
    expect(r.status).toBe("waiting");
    expect(r.problems!.map((p) => p.key).sort()).toEqual(["adAccount", "page"]);
    const t1 = await tasks(c.name);
    expect(t1).toHaveLength(1);
    expect(t1[0].title).toMatch(/Voraussetzungen fehlen/);
    expect(t1[0].note).toMatch(/Werbekonto/);
    // zweiter Wunsch für dasselbe Produkt → kein Duplikat
    expect((await requestCampaignLaunch({ customerId: c.id, product: PRODUCT, source: "produkt" }, launch)).status).toBe("exists");

    // Voraussetzungen erfüllt → Cron startet den Lauf, legt pausiert an
    await prisma.customer.update({ where: { id: c.id }, data: { metaAdAccountId: "111", metaPageId: "555" } });
    const later = new Date(Date.now() + 31 * 60_000);
    const p1 = await processCampaignWishes(later, launch);
    expect(p1.started).toBe(1);
    const wish = await prisma.campaignWish.findFirstOrThrow({ where: { customerId: c.id } });
    expect(wish.status).toBe("started");
    const run = await prisma.campaignRun.findUniqueOrThrow({ where: { id: wish.runId! } });
    expect(run).toMatchObject({ status: "built", trigger: "produkt" });
    for (const p of meta.calls.filter((x) => x.method === "post")) if (p.body && "status" in p.body) expect(p.body.status).toBe("PAUSED");
    // Aufgabe erledigt, Wunsch danach „done“
    expect((await prisma.salesTask.findUniqueOrThrow({ where: { id: t1[0].id } })).doneAt).not.toBeNull();
    expect((await processCampaignWishes(later, launch)).done).toBe(1);
    expect((await prisma.campaignWish.findUniqueOrThrow({ where: { id: wish.id } })).status).toBe("done");
    // vorhandene Kampagne → kein neuer Lauf
    expect((await requestCampaignLaunch({ customerId: c.id, product: PRODUCT, source: "produkt" }, launch)).status).toBe("exists");
  });

  it("Produkt gebucht: Schalter aus → disabled (Aufrufer legt die bisherige Aufgabe an)", async () => {
    await saveAutomationSettings({ autoLaunch: false });
    const c = await customer();
    expect((await requestCampaignLaunch({ customerId: c.id, product: PRODUCT, source: "produkt" })).status).toBe("disabled");
    expect(await prisma.campaignWish.count({ where: { customerId: c.id } })).toBe(0);
  });

  // ─── 3. Auffrischung ─────────────────────────────────────────────────

  it("Auffrischung: müde Anzeige → 3 neue Anzeigen PAUSED in derselben Anzeigengruppe, nie zweimal in 14 Tagen", async () => {
    const c = await customer();
    const built = await builtRun(c.id);
    const adSet = built.adSetIds[0];
    const created = new Date(Date.now() - 30 * DAY).toISOString();
    const oldAds = ["o1", "o2", "o3"];
    const meta = fakeMeta((path, params) => {
      if (path === built.campaignId) return { effective_status: "ACTIVE" };
      if (path === `${built.campaignId}/ads`) return { data: oldAds.map((id) => ({ id, name: `Alt ${id}`, adset_id: adSet, created_time: created, effective_status: "ACTIVE" })) };
      if (path === `${built.campaignId}/insights`) {
        expect(params?.level).toBe("ad");
        return {
          data: [
            { ad_id: "o1", impressions: "8000", clicks: "160", spend: "80", frequency: "4.2", actions: [{ action_type: "lead", value: "8" }] },
            { ad_id: "o2", impressions: "6000", clicks: "120", spend: "60", frequency: "1.9", actions: [{ action_type: "lead", value: "6" }] },
            { ad_id: "o3", impressions: "6000", clicks: "120", spend: "60", frequency: "1.8", actions: [{ action_type: "lead", value: "6" }] },
          ],
        };
      }
      if (/^o\d\/insights$/.test(path)) return { data: [{ impressions: "5000", clicks: "100" }] };
      return undefined;
    });
    const tasksCreated: string[] = [];
    const deps: RefreshDeps = {
      ...campaignDeps(meta),
      task: async (contactId, title, note, dueAt) => {
        tasksCreated.push(title);
        await prisma.salesTask.create({ data: { contactId, type: "SONSTIGES", title, note, dueAt } });
      },
    };
    const only = { customerId: c.id };
    const now = new Date();
    const r = await runCreativeRefresh(now, deps, only);
    expect(r).toEqual({ checked: 1, refreshed: 1 });

    const posts = meta.calls.filter((x) => x.method === "post");
    expect(posts.filter((p) => p.path.endsWith("/ads"))).toHaveLength(3);
    for (const p of posts.filter((x) => x.path.endsWith("/ads"))) expect(p.body).toMatchObject({ adset_id: adSet, status: "PAUSED" });
    for (const p of posts) if (p.body && "status" in p.body) expect(p.body.status).toBe("PAUSED");
    // keine Kampagne/Anzeigengruppe/Formular neu, alte Anzeigen unangetastet
    expect(posts.some((p) => /\/(campaigns|adsets|leadgen_forms)$/.test(p.path))).toBe(false);
    expect(posts.some((p) => oldAds.includes(p.path))).toBe(false);
    expect(tasksCreated[0]).toMatch(/^Neue Anzeigen für .* bereit \(pausiert\) – müde Anzeigen: Alt o1/);

    const runs = await prisma.campaignRun.findMany({ where: { customerId: c.id, kind: "auffrischung" } });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: "built", refreshCampaignId: built.campaignId, refreshAdSetId: adSet, trigger: "auffrischung" });
    expect(runs[0].costCents).toBeGreaterThan(0);

    // Woche später erneut geprüft: wieder müde, aber innerhalb von 14 Tagen keine zweite Auffrischung
    const r2 = await runCreativeRefresh(new Date(now.getTime() + 8 * DAY), deps, only);
    expect(r2.checked).toBe(1);
    expect(r2.refreshed).toBe(0);
    expect(await prisma.campaignRun.count({ where: { customerId: c.id, kind: "auffrischung" } })).toBe(1);
    // Innerhalb von 7 Tagen wird gar nicht erst geprüft
    expect((await runCreativeRefresh(new Date(now.getTime() + 9 * DAY), deps, only)).checked).toBe(0);
  });

  it("Auffrischung: Schalter aus → keine Prüfung", async () => {
    await saveAutomationSettings({ refresh: false });
    const meta = fakeMeta();
    expect(await runCreativeRefresh(new Date(), { ...campaignDeps(meta), task: async () => undefined })).toEqual({ checked: 0, refreshed: 0 });
    expect(meta.calls).toHaveLength(0);
  });
});
