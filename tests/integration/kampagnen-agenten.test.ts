import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { buildCampaignRun, cleanupCampaignRun, processCampaignRun, startCampaignRun, type CampaignDeps } from "@/lib/kampagnen/run";
import type { MetaApi } from "@/lib/kampagnen/builder";
import type { LlmCall } from "@/lib/kampagnen/llm";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

// Kampagnen-Agenten Ende-zu-Ende mit gemocktem Claude und gemockter Meta-API:
// alles PAUSED, idempotent, Prüfer rot → nichts angelegt, Fehler in der Mitte
// wird gemeldet und lässt sich fortsetzen, fehlende Voraussetzungen sind klar.

const PRODUCT = "Katzenversicherung (TKV)";
const usage = { tokensIn: 1000, tokensOut: 500, costCents: 2 };

const ANSWERS: Record<string, unknown> = {
  Stratege: { dailyBudgetEur: 30, adsPerAdSet: 3, zielgruppe: "Katzenhalter in Musterstadt", begruendung: "Ein Set reicht.", adSets: [{ name: "Katzenhalter", ageMin: 25, ageMax: 65, radiusKm: 30, advantageAudience: true, note: "" }] },
  "Angle-Rechercheur": { angles: ["kosten", "regional", "neugier"].map((k) => ({ key: k, title: k, hook: `Hook ${k}`, insight: "weil" })) },
  Texter: {
    ads: ["kosten", "regional", "neugier"].map((k) => ({
      angleKey: k,
      primaryText: `Tierarztkosten sind gestiegen. Lassen Sie uns kurz sprechen (${k}). Jetzt Angaben eintragen – ich melde mich persönlich.`,
      headline: "Katze gut abgesichert",
      description: "Persönliche Beratung",
      imageHeadline: "Tierarztrechnung?",
      imageSubline: "Ihr Berater in Musterstadt",
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

function fakeLlm(override: Partial<Record<string, unknown>> = {}): LlmCall {
  return async (req) => {
    const key = req.agent.replace(/ \(Überarbeitung\)$/, "");
    const answer = override[req.agent] ?? override[key] ?? ANSWERS[key];
    return { text: JSON.stringify(answer), usage };
  };
}

type Call = { method: "get" | "post" | "del"; path: string; body?: Record<string, unknown>; token?: string };
function fakeMeta(opts: { failOn?: RegExp; failOnce?: boolean } = {}): MetaApi & { calls: Call[] } {
  const calls: Call[] = [];
  let n = 0;
  let failed = false;
  return {
    calls,
    async get<T>(path: string, _params?: Record<string, string>, token?: string) {
      calls.push({ method: "get", path, token });
      if (path === "search") return { data: [{ key: "2345", name: "Musterstadt", country_code: "DE" }] } as T;
      return { access_token: "PAGE_TOKEN" } as T;
    },
    async post<T>(path: string, body: Record<string, unknown>, token?: string) {
      calls.push({ method: "post", path, body, token });
      if (opts.failOn?.test(path) && !(opts.failOnce && failed)) {
        failed = true;
        throw new Error(`Meta POST ${path} 400: kaputt`);
      }
      n++;
      if (path.endsWith("/adimages")) return { images: { x: { hash: `hash${n}` } } } as T;
      return { id: `id${n}` } as T;
    },
    async del(path: string) {
      calls.push({ method: "del", path });
    },
  };
}

function deps(meta: MetaApi, llm: LlmCall = fakeLlm(), adAccountOk = true): CampaignDeps {
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

describe("Kampagnen-Agenten (Ende zu Ende, gemockt)", () => {
  const ids: string[] = [];
  async function customer(extra: { budget?: boolean; account?: string | null; page?: string | null; privacy?: string | null } = {}) {
    const c = await makeCustomer({ metaAdAccountId: extra.account === undefined ? "123456789" : extra.account, metaPageId: extra.page === undefined ? "555" : extra.page });
    ids.push(c.id);
    if (extra.budget !== false) await prisma.customerBudget.create({ data: { customerId: c.id, product: PRODUCT, dailyBudget: 30, validFrom: new Date("2026-01-01") } });
    await prisma.onboarding.create({ data: { customerId: c.id, websiteInfo: { privacyUrl: extra.privacy === undefined ? "https://agentur.test/datenschutz" : extra.privacy } } });
    return c.id;
  }

  beforeAll(() => requireTestDb());
  afterAll(async () => {
    await prisma.leadSource.deleteMany({ where: { customerId: { in: ids } } });
    for (const id of ids) await cleanupCustomer(id);
  });

  it("legt mit einem Klick alles PAUSED an und ordnet das Formular dem Kunden zu", async () => {
    const id = await customer();
    const meta = fakeMeta();
    const d = deps(meta);
    const start = await startCampaignRun({ customerId: id, product: PRODUCT }, d);
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    expect(await processCampaignRun(start.runId, d)).toBe("built");

    const posts = meta.calls.filter((c) => c.method === "post");
    // Kampagne, 1 Anzeigengruppe, Formular, 3 Bilder, 3 Creatives, 3 Anzeigen
    expect(posts.filter((p) => p.path.endsWith("/campaigns"))).toHaveLength(1);
    expect(posts.filter((p) => p.path.endsWith("/adsets"))).toHaveLength(1);
    expect(posts.filter((p) => p.path.endsWith("/leadgen_forms"))).toHaveLength(1);
    expect(posts.filter((p) => p.path.endsWith("/ads"))).toHaveLength(3);
    // Nie ACTIVE: jeder Status ist PAUSED
    for (const p of posts) if (p.body && "status" in p.body) expect(p.body.status).toBe("PAUSED");
    const campaign = posts.find((p) => p.path.endsWith("/campaigns"))!;
    expect(campaign.body).toMatchObject({ objective: "OUTCOME_LEADS", status: "PAUSED", special_ad_categories: [], daily_budget: 3000 });
    // Formular mit Seiten-Token, Creative verweist aufs Formular
    expect(posts.find((p) => p.path.endsWith("/leadgen_forms"))!.token).toBe("PAGE_TOKEN");
    const creative = posts.find((p) => p.path.endsWith("/adcreatives"))!;
    expect(JSON.stringify(creative.body)).toMatch(/lead_gen_form_id/);

    const run = await prisma.campaignRun.findUniqueOrThrow({ where: { id: start.runId } });
    expect(run.status).toBe("built");
    expect(run.costCents).toBeGreaterThan(0);
    const built = run.built as { formId: string; adIds: string[] };
    expect(built.adIds).toHaveLength(3);
    const source = await prisma.leadSource.findUniqueOrThrow({ where: { formId: built.formId } });
    expect(source).toMatchObject({ customerId: id, productKey: PRODUCT, active: true });

    // Idempotent: nochmal anlegen erzeugt nichts Neues
    const before = meta.calls.filter((c) => c.method === "post").length;
    await prisma.campaignRun.update({ where: { id: start.runId }, data: { status: "review" } });
    await buildCampaignRun(start.runId, d);
    expect(meta.calls.filter((c) => c.method === "post").length).toBe(before);
  });

  it("höchstens ein laufender Lauf je Kunde", async () => {
    const id = await customer();
    const d = deps(fakeMeta());
    const a = await startCampaignRun({ customerId: id, product: PRODUCT }, d);
    expect(a.ok).toBe(true);
    const b = await startCampaignRun({ customerId: id, product: PRODUCT }, d);
    expect(b.ok).toBe(false);
  });

  it("Prüfer rot (auch nach Überarbeitung) → nichts wird bei Meta angelegt", async () => {
    const id = await customer();
    const meta = fakeMeta();
    const red = { status: "rot", summary: "Unterstellung persönlicher Merkmale.", findings: [{ severity: "rot", area: "text", index: 0, issue: "Unterstellung", fix: "umformulieren" }] };
    const d = deps(meta, fakeLlm({ Prüfer: red }));
    const start = await startCampaignRun({ customerId: id, product: PRODUCT }, d);
    if (!start.ok) throw new Error("Start fehlgeschlagen");
    expect(await processCampaignRun(start.runId, d)).toBe("blocked");
    expect(meta.calls.filter((c) => c.method === "post")).toHaveLength(0);
    const run = await prisma.campaignRun.findUniqueOrThrow({ where: { id: start.runId } });
    expect((run.review as { revised?: boolean }).revised).toBe(true);
  });

  it("Fehler in der Mitte wird gemeldet; Fortsetzen legt nur den Rest an", async () => {
    const id = await customer();
    const meta = fakeMeta({ failOn: /leadgen_forms$/, failOnce: true });
    const d = deps(meta);
    const start = await startCampaignRun({ customerId: id, product: PRODUCT }, d);
    if (!start.ok) throw new Error("Start fehlgeschlagen");
    expect(await processCampaignRun(start.runId, d)).toBe("failed");
    let run = await prisma.campaignRun.findUniqueOrThrow({ where: { id: start.runId } });
    expect(run.error).toMatch(/leadgen_forms/);
    expect(run.lockedAt).toBeNull(); // Sperre nach dem Fehler wieder frei
    const partial = run.built as { campaignId?: string; adSetIds: string[]; formId?: string };
    expect(partial.campaignId).toBeTruthy();
    expect(partial.adSetIds).toHaveLength(1);
    expect(partial.formId).toBeUndefined();

    expect(await buildCampaignRun(start.runId, d)).toBe("built");
    const campaigns = meta.calls.filter((c) => c.method === "post" && c.path.endsWith("/campaigns"));
    expect(campaigns).toHaveLength(1);
    run = await prisma.campaignRun.findUniqueOrThrow({ where: { id: start.runId } });
    expect((run.built as { adIds: string[] }).adIds).toHaveLength(3);

    // Aufräumen löscht die Kampagne und archiviert das Formular
    const c = await cleanupCampaignRun(start.runId, d);
    expect(c.ok).toBe(true);
    expect(meta.calls.some((x) => x.method === "del")).toBe(true);
  });

  it("fehlende Voraussetzungen ergeben klare Meldungen", async () => {
    const id = await customer({ budget: false, privacy: null, page: null });
    const r = await startCampaignRun({ customerId: id, product: PRODUCT }, deps(fakeMeta(), fakeLlm(), false));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const keys = r.problems.map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(["budget", "privacy", "page", "adAccount"]));
    expect(r.problems.find((p) => p.key === "adAccount")!.message).toMatch(/ads_management/);
    expect(await prisma.campaignRun.count({ where: { customerId: id } })).toBe(0);
  });
});
