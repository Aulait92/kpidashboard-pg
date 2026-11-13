// Kampagnen-Agenten – Ablauf eines Laufs. Deterministischer Code verbindet die
// Agenten (Stratege → Winkel → Texter → Bilder → Formular → Prüfer → Bauer).
// Jeder Schritt wird sofort gespeichert; ein abgebrochener Lauf (Neustart,
// Timeout) macht beim nächsten Cron-Aufruf an derselben Stelle weiter.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { claudeCall, AgentError, type AgentUsage, type LlmCall } from "@/lib/kampagnen/llm";
import { angleResearcher, copywriter, formAgent, reviewer, reviseCopies, reviseForm, strategist } from "@/lib/kampagnen/agents";
import { checkPrerequisites, loadCampaignContext, type Problem } from "@/lib/kampagnen/context";
import { adsManagerUrl, buildCampaign, cleanupCampaign, explainMetaError, formUrl, graphApi, pageAccessToken, type MetaApi } from "@/lib/kampagnen/builder";
import {
  ACTIVE_STATUSES,
  campaignName,
  emptyBuilt,
  initialSteps,
  type AdCopy,
  type Angle,
  type BuiltState,
  type CampaignContext,
  type CampaignPlan,
  type CreativeImage,
  type LeadFormDraft,
  type ReviewResult,
  type RunStatus,
  type RunStep,
  type StepKey,
} from "@/lib/kampagnen/types";

export type RenderCreative = (o: {
  product: string;
  place: string | null;
  advisorName: string;
  headline: string;
  subline: string;
  angle: string;
  requestId: string;
  index: number;
}) => Promise<{ imageUrl: string }>;

export type CampaignDeps = {
  llm: LlmCall;
  renderCreative: RenderCreative;
  meta: MetaApi;
  checkAdAccount: (id: string) => Promise<{ ok: true; name: string } | { ok: false; error: string }>;
  subscribePage: (pageId: string) => Promise<void>;
  notify: (title: string, body: string, url: string) => Promise<void>;
  env: () => { anthropic: boolean; r2: boolean; meta: boolean };
};

export function defaultDeps(): CampaignDeps {
  return {
    llm: claudeCall,
    renderCreative: async (o) => (await import("@/lib/creative-gen")).renderProductCreative(o),
    meta: graphApi,
    checkAdAccount: async (id) => {
      const r = await (await import("@/lib/meta")).checkAdAccountAccess(id);
      return r.ok ? { ok: true, name: r.name } : r;
    },
    subscribePage: async (pageId) => (await import("@/lib/meta-leads")).subscribePage(pageId),
    notify: async (title, body, url) => {
      await (await import("@/lib/push")).sendToAdmins({ title, body, url }).catch(() => undefined);
    },
    env: () => ({
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      r2: !!process.env.R2_BUCKET && !!process.env.R2_PUBLIC_URL,
      meta: !!process.env.META_ACCESS_TOKEN,
    }),
  };
}

const LOCK_MS = 15 * 60_000;
const json = (v: unknown) => v as Prisma.InputJsonValue;

type RunRow = Awaited<ReturnType<typeof loadRun>>;
async function loadRun(id: string) {
  return prisma.campaignRun.findUniqueOrThrow({ where: { id }, include: { customer: { select: { name: true } } } });
}

// ─── Start ─────────────────────────────────────────────────────────────

export type StartResult = { ok: true; runId: string } | { ok: false; problems: Problem[] };

/** Neuen Lauf anlegen (höchstens einer je Kunde gleichzeitig). Voraussetzungen werden vorher geprüft. */
export async function startCampaignRun(
  input: {
    customerId: string;
    product: string;
    wish?: string | null;
    privacyUrl?: string | null;
    autoBuild?: boolean;
    createdBy?: string | null;
    dailyBudgetEur?: number | null;
    trigger?: "manuell" | "produkt";
  },
  deps: CampaignDeps = defaultDeps(),
): Promise<StartResult> {
  const running = await prisma.campaignRun.findFirst({ where: { customerId: input.customerId, status: { in: ACTIVE_STATUSES } }, select: { id: true } });
  if (running) return { ok: false, problems: [{ key: "running", message: "Für diesen Kunden läuft schon ein Lauf. Bitte warten, bis er fertig ist." }] };
  const ctx = await loadCampaignContext(input.customerId, input.product, { wish: input.wish, privacyUrl: input.privacyUrl, dailyBudgetEur: input.dailyBudgetEur });
  const problems = await checkPrerequisites(ctx, { checkAdAccount: deps.checkAdAccount, pageToken: (p) => pageAccessToken(deps.meta, p), env: deps.env });
  if (problems.length) return { ok: false, problems };
  const run = await prisma.campaignRun.create({
    data: {
      customerId: input.customerId,
      product: input.product,
      wish: ctx.wish,
      autoBuild: input.autoBuild ?? true,
      steps: json(initialSteps()),
      context: json(ctx),
      createdBy: input.createdBy ?? null,
      trigger: input.trigger ?? "manuell",
    },
  });
  await audit("kampagne.start", { entity: "CampaignRun", entityId: run.id, customerId: input.customerId, details: { product: input.product } }).catch(() => undefined);
  return { ok: true, runId: run.id };
}

// ─── Hilfen ────────────────────────────────────────────────────────────

async function lock(id: string): Promise<boolean> {
  const r = await prisma.campaignRun.updateMany({
    where: { id, OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(Date.now() - LOCK_MS) } }] },
    data: { lockedAt: new Date() },
  });
  return r.count === 1;
}
const unlock = (id: string) => prisma.campaignRun.update({ where: { id }, data: { lockedAt: null } });

function setStep(steps: RunStep[], key: StepKey, patch: Partial<RunStep>): RunStep[] {
  return steps.map((s) => (s.key === key ? { ...s, ...patch } : s));
}

async function saveStep(run: { id: string; steps: RunStep[] }, key: StepKey, patch: Partial<RunStep>, data: Prisma.CampaignRunUpdateInput = {}, usage?: AgentUsage) {
  run.steps = setStep(run.steps, key, {
    ...patch,
    ...(usage ? { tokensIn: (run.steps.find((s) => s.key === key)?.tokensIn ?? 0) + usage.tokensIn, tokensOut: (run.steps.find((s) => s.key === key)?.tokensOut ?? 0) + usage.tokensOut } : {}),
  });
  await prisma.campaignRun.update({
    where: { id: run.id },
    data: {
      ...data,
      steps: json(run.steps),
      lockedAt: new Date(),
      ...(usage ? { costCents: { increment: usage.costCents }, tokensIn: { increment: usage.tokensIn }, tokensOut: { increment: usage.tokensOut } } : {}),
    },
  });
}

const now = () => new Date().toISOString();
const place = (c: CampaignContext) => [c.zip, c.city].filter(Boolean).join(" ") || c.region || null;

// ─── Ablauf ────────────────────────────────────────────────────────────

/** Lauf abarbeiten bzw. fortsetzen. Gibt den neuen Status zurück. */
export async function processCampaignRun(id: string, deps: CampaignDeps = defaultDeps()): Promise<RunStatus> {
  const kind = await prisma.campaignRun.findUnique({ where: { id }, select: { kind: true } });
  if (kind?.kind === "auffrischung") return (await import("@/lib/kampagnen/refresh")).processRefreshRun(id, deps);
  if (!(await lock(id))) return (await prisma.campaignRun.findUniqueOrThrow({ where: { id }, select: { status: true } })).status as RunStatus;
  const row = await loadRun(id);
  const state = { id, steps: row.steps as unknown as RunStep[] };
  let current: StepKey = "stratege";
  try {
    if (!["queued", "running"].includes(row.status)) return row.status as RunStatus;
    await prisma.campaignRun.update({ where: { id }, data: { status: "running", error: null } });
    const ctx = row.context as unknown as CampaignContext;

    // 1. Stratege
    current = "stratege";
    let plan = row.plan as unknown as CampaignPlan | null;
    if (!plan) {
      await saveStep(state, current, { status: "laeuft", startedAt: now() });
      const r = await strategist(deps.llm, ctx, campaignName(row.customer.name, row.product, new Date()));
      plan = r.value;
      await saveStep(state, current, { status: "fertig", finishedAt: now() }, { plan: json(plan) }, r.usage);
    }

    // 2. Winkel
    current = "winkel";
    let angles = row.angles as unknown as Angle[] | null;
    if (!angles) {
      await saveStep(state, current, { status: "laeuft", startedAt: now() });
      const r = await angleResearcher(deps.llm, ctx, plan);
      angles = r.value;
      await saveStep(state, current, { status: "fertig", finishedAt: now() }, { angles: json(angles) }, r.usage);
    }

    // 3. Texter
    current = "texter";
    let copies = row.copies as unknown as AdCopy[] | null;
    if (!copies) {
      await saveStep(state, current, { status: "laeuft", startedAt: now() });
      const r = await copywriter(deps.llm, ctx, plan, angles);
      copies = r.value;
      await saveStep(state, current, { status: "fertig", finishedAt: now() }, { copies: json(copies) }, r.usage);
    }

    // 4. Creative-Agent (Bilder über die vorhandene Creative-Pipeline)
    current = "bilder";
    let images = row.creatives as unknown as CreativeImage[] | null;
    if (!images) {
      await saveStep(state, current, { status: "laeuft", startedAt: now() });
      images = await renderImages(deps, ctx, angles, copies, id);
      if (!images.length) throw new Error("Kein Bild konnte erzeugt werden.");
      await saveStep(state, current, { status: "fertig", finishedAt: now(), note: `${images.length} von ${copies.length} Bildern` }, { creatives: json(images) });
    }

    // 5. Formular-Agent
    current = "formular";
    let form = row.form as unknown as LeadFormDraft | null;
    if (!form) {
      await saveStep(state, current, { status: "laeuft", startedAt: now() });
      const r = await formAgent(deps.llm, ctx);
      form = r.value;
      await saveStep(state, current, { status: "fertig", finishedAt: now() }, { form: json(form) }, r.usage);
    }

    // 6. Prüfer (bei rot genau eine Überarbeitung, dann erneut prüfen)
    current = "pruefer";
    let review = row.review as unknown as ReviewResult | null;
    if (!review) {
      await saveStep(state, current, { status: "laeuft", startedAt: now() });
      let r = await reviewer(deps.llm, ctx, { plan, copies, form, images });
      await saveStep(state, current, {}, {}, r.usage);
      review = r.value;
      if (review.status === "rot") {
        const red = review.findings.filter((f) => f.severity === "rot" || review!.status === "rot");
        const textFindings = red.filter((f) => f.area === "text" || f.area === "bild");
        const formFindings = red.filter((f) => f.area === "formular");
        if (textFindings.length) {
          const before = copies;
          const rc = await reviseCopies(deps.llm, ctx, copies, textFindings, angles.map((a) => a.key));
          copies = rc.value;
          await saveStep(state, current, { note: "Texte überarbeitet" }, { copies: json(copies) }, rc.usage);
          // Bild neu, wenn sich die Texte im Bild geändert haben
          const changed = copies.map((c, i) => c.imageHeadline !== before[i]?.imageHeadline || c.imageSubline !== before[i]?.imageSubline);
          if (changed.some(Boolean)) {
            images = await renderImages(deps, ctx, angles, copies, id, images, changed);
            await prisma.campaignRun.update({ where: { id }, data: { creatives: json(images) } });
          }
        }
        if (formFindings.length) {
          const rf = await reviseForm(deps.llm, ctx, form, formFindings);
          form = rf.value;
          await saveStep(state, current, { note: "Formular überarbeitet" }, { form: json(form) }, rf.usage);
        }
        r = await reviewer(deps.llm, ctx, { plan, copies, form, images });
        review = { ...r.value, revised: true };
        await saveStep(state, current, {}, {}, r.usage);
      }
      await saveStep(state, current, { status: review.status === "rot" ? "fehler" : "fertig", finishedAt: now(), note: review.summary.slice(0, 200) }, { review: json(review) });
    }

    if (review.status === "rot") {
      await saveStep(state, "anlegen", { status: "uebersprungen", note: "Prüfung rot – nichts bei Meta angelegt" });
      await prisma.campaignRun.update({ where: { id }, data: { status: "blocked", finishedAt: new Date(), error: `Prüfung rot: ${review.summary}`.slice(0, 1000) } });
      await deps.notify(`Kampagne ${row.customer.name}: Prüfung rot`, "Nichts bei Meta angelegt – bitte Befunde ansehen.", `/admin/kunden/${row.customerId}/kampagne`);
      return "blocked";
    }
    if (!row.autoBuild) {
      await prisma.campaignRun.update({ where: { id }, data: { status: "review" } });
      return "review";
    }
  } catch (err) {
    return await fail(id, state, current, err);
  } finally {
    await unlock(id).catch(() => undefined);
  }
  // 7. Bauer (eigener Lock)
  return buildCampaignRun(id, deps);
}

async function renderImages(
  deps: CampaignDeps,
  ctx: CampaignContext,
  angles: Angle[],
  copies: AdCopy[],
  runId: string,
  existing: CreativeImage[] = [],
  only: boolean[] | null = null,
): Promise<CreativeImage[]> {
  const out: CreativeImage[] = [];
  for (let i = 0; i < copies.length; i++) {
    const c = copies[i];
    const old = existing.find((e) => e.angleKey === c.angleKey);
    if (old && only && !only[i]) {
      out.push(old);
      continue;
    }
    const angle = angles.find((a) => a.key === c.angleKey);
    try {
      const r = await deps.renderCreative({
        product: ctx.product,
        place: place(ctx),
        advisorName: ctx.advisorName,
        headline: c.imageHeadline,
        subline: c.imageSubline,
        angle: angle ? `${angle.title}: ${angle.hook}` : c.angleKey,
        requestId: runId,
        index: i,
      });
      out.push({ angleKey: c.angleKey, imageUrl: r.imageUrl });
    } catch (err) {
      reportError(err, "kampagne-bild", { run: runId });
      if (old) out.push(old);
    }
  }
  return out;
}

async function fail(id: string, state: { id: string; steps: RunStep[] }, key: StepKey, err: unknown): Promise<RunStatus> {
  const raw = err instanceof Error ? err.message : String(err);
  const usage = err instanceof AgentError ? err.usage : undefined;
  const run = await prisma.campaignRun.findUnique({ where: { id }, select: { context: true, customerId: true } });
  const ctx = (run?.context ?? {}) as unknown as CampaignContext;
  const message = explainMetaError(raw, ctx).slice(0, 1000);
  await saveStep(state, key, { status: "fehler", finishedAt: now(), error: message.slice(0, 500) }, {}, usage).catch(() => undefined);
  await prisma.campaignRun.update({ where: { id }, data: { status: "failed", error: message, finishedAt: new Date() } });
  reportError(err, "kampagne-lauf", { run: id, step: key });
  return "failed";
}

// ─── Anlegen bei Meta ──────────────────────────────────────────────────

/** Pausiert anlegen (automatisch nach grüner/gelber Prüfung oder per Knopf; setzt nach Fehlern fort). */
export async function buildCampaignRun(id: string, deps: CampaignDeps = defaultDeps()): Promise<RunStatus> {
  const pre = await prisma.campaignRun.findUniqueOrThrow({ where: { id }, select: { status: true, review: true, kind: true } });
  if (pre.kind === "auffrischung") return (await import("@/lib/kampagnen/refresh")).processRefreshRun(id, deps);
  const review = pre.review as unknown as ReviewResult | null;
  if (!review || review.status === "rot") return pre.status as RunStatus;
  if (!["running", "review", "failed", "building"].includes(pre.status)) return pre.status as RunStatus;
  if (!(await lock(id))) return pre.status as RunStatus;
  const row = await loadRun(id);
  const state = { id, steps: row.steps as unknown as RunStep[] };
  try {
    await prisma.campaignRun.update({ where: { id }, data: { status: "building", error: null } });
    await saveStep(state, "anlegen", { status: "laeuft", startedAt: now(), error: undefined });
    const ctx = row.context as unknown as CampaignContext;
    const plan = row.plan as unknown as CampaignPlan;
    const copies = row.copies as unknown as AdCopy[];
    const images = row.creatives as unknown as CreativeImage[];
    const form = row.form as unknown as LeadFormDraft;
    const built = await buildCampaign(deps.meta, {
      ctx,
      plan,
      copies,
      images,
      form,
      built: { ...emptyBuilt(), ...((row.built as unknown as BuiltState | null) ?? {}) },
      onProgress: async (b) => {
        await prisma.campaignRun.update({ where: { id }, data: { built: json(b), lockedAt: new Date() } });
      },
    });
    // Formular dem Kunden zuordnen (Leads kommen automatisch an) und Seite abonnieren
    if (built.formId && !built.leadSourceId) {
      const ls = await prisma.leadSource.upsert({
        where: { formId: built.formId },
        create: {
          formId: built.formId,
          pageId: ctx.pageId,
          formName: form.formName,
          customerId: row.customerId,
          productKey: row.product,
          questionLabels: json(Object.fromEntries(form.questions.map((q) => [q.key, q.label]))),
        },
        update: { customerId: row.customerId, productKey: row.product, active: true },
      });
      built.leadSourceId = ls.id;
    }
    if (!built.pageSubscribed && ctx.pageId) {
      try {
        await deps.subscribePage(ctx.pageId);
        built.pageSubscribed = true;
      } catch (err) {
        reportError(err, "kampagne-seite-abo", { run: id });
      }
    }
    await prisma.campaignRun.update({ where: { id }, data: { built: json(built), status: "built", finishedAt: new Date() } });
    await saveStep(state, "anlegen", { status: "fertig", finishedAt: now(), note: `${built.adIds.length} Anzeigen pausiert angelegt` });
    await audit("kampagne.angelegt", { entity: "CampaignRun", entityId: id, customerId: row.customerId, details: { campaignId: built.campaignId, formId: built.formId } }).catch(() => undefined);
    await deps.notify(
      `Kampagne für ${row.customer.name} ist angelegt (pausiert)`,
      "Bitte im Werbeanzeigenmanager prüfen und veröffentlichen.",
      built.campaignId && ctx.adAccountId ? adsManagerUrl(ctx.adAccountId, built.campaignId) : `/admin/kunden/${row.customerId}/kampagne`,
    );
    return "built";
  } catch (err) {
    return await fail(id, state, "anlegen", err);
  } finally {
    await unlock(id).catch(() => undefined);
  }
}

// ─── Bearbeiten vor dem Anlegen ───────────────────────────────────────

const EDITABLE = ["primaryText", "headline", "description", "imageHeadline", "imageSubline"] as const;

export async function updateRunCopy(id: string, index: number, patch: Partial<Pick<AdCopy, (typeof EDITABLE)[number]>>): Promise<{ ok: boolean; error?: string }> {
  const run = await prisma.campaignRun.findUniqueOrThrow({ where: { id }, select: { status: true, copies: true, built: true } });
  if (!["review", "failed", "blocked"].includes(run.status) || (run.built as BuiltState | null)?.creativeIds?.length) {
    return { ok: false, error: "Texte lassen sich nur vor dem Anlegen bei Meta ändern." };
  }
  const copies = [...((run.copies as unknown as AdCopy[]) ?? [])];
  if (!copies[index]) return { ok: false, error: "Anzeige nicht gefunden." };
  const next = { ...copies[index] };
  for (const k of EDITABLE) if (typeof patch[k] === "string") next[k] = patch[k]!.trim();
  copies[index] = next;
  await prisma.campaignRun.update({ where: { id }, data: { copies: json(copies) } });
  return { ok: true };
}

export async function regenerateRunImage(id: string, index: number, deps: CampaignDeps = defaultDeps()): Promise<{ ok: boolean; error?: string }> {
  const run = await prisma.campaignRun.findUniqueOrThrow({ where: { id }, select: { status: true, copies: true, angles: true, creatives: true, context: true, built: true } });
  if ((run.built as BuiltState | null)?.creativeIds?.length) return { ok: false, error: "Bilder lassen sich nur vor dem Anlegen bei Meta ändern." };
  const copies = (run.copies as unknown as AdCopy[]) ?? [];
  if (!copies[index]) return { ok: false, error: "Anzeige nicht gefunden." };
  const only = copies.map((_, i) => i === index);
  const images = await renderImages(deps, run.context as unknown as CampaignContext, (run.angles as unknown as Angle[]) ?? [], copies, id, (run.creatives as unknown as CreativeImage[]) ?? [], only);
  await prisma.campaignRun.update({ where: { id }, data: { creatives: json(images) } });
  return { ok: true };
}

/** Bei Meta Angelegtes entfernen (z. B. nach Abbruch in der Mitte). */
export async function cleanupCampaignRun(id: string, deps: CampaignDeps = defaultDeps()): Promise<{ ok: boolean; done?: string[]; error?: string }> {
  const run = await prisma.campaignRun.findUniqueOrThrow({ where: { id }, select: { built: true, context: true, customerId: true } });
  const built = { ...emptyBuilt(), ...((run.built as unknown as BuiltState | null) ?? {}) };
  try {
    const done = await cleanupCampaign(deps.meta, run.context as unknown as CampaignContext, built);
    if (built.leadSourceId) await prisma.leadSource.update({ where: { id: built.leadSourceId }, data: { active: false } }).catch(() => undefined);
    await prisma.campaignRun.update({ where: { id }, data: { status: "cancelled", built: json({ ...built, cleanedAt: new Date().toISOString() }) } });
    await audit("kampagne.aufgeraeumt", { entity: "CampaignRun", entityId: id, customerId: run.customerId, details: { done } }).catch(() => undefined);
    return { ok: true, done };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Cron: liegengebliebene Läufe fortsetzen (z. B. nach Neustart). */
export async function resumeCampaignRuns(deps: CampaignDeps = defaultDeps()): Promise<number> {
  const stale = new Date(Date.now() - 2 * 60_000);
  const runs = await prisma.campaignRun.findMany({
    where: {
      status: { in: ["queued", "running", "building"] },
      updatedAt: { lt: stale },
      OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(Date.now() - LOCK_MS) } }],
    },
    orderBy: { createdAt: "asc" },
    take: 2,
    select: { id: true, status: true, kind: true },
  });
  for (const r of runs) {
    if (r.kind === "auffrischung") await (await import("@/lib/kampagnen/refresh")).processRefreshRun(r.id, deps);
    else if (r.status === "building") await buildCampaignRun(r.id, deps);
    else await processCampaignRun(r.id, deps);
  }
  return runs.length;
}

export type RunView = NonNullable<Awaited<ReturnType<typeof getRunView>>>;
export async function getRunView(id: string) {
  const r = await prisma.campaignRun.findUnique({ where: { id } });
  if (!r) return null;
  const ctx = r.context as unknown as CampaignContext | null;
  const built = r.built as unknown as BuiltState | null;
  return {
    id: r.id,
    customerId: r.customerId,
    product: r.product,
    wish: r.wish,
    status: r.status as RunStatus,
    autoBuild: r.autoBuild,
    steps: r.steps as unknown as RunStep[],
    plan: r.plan as unknown as CampaignPlan | null,
    angles: r.angles as unknown as Angle[] | null,
    copies: r.copies as unknown as AdCopy[] | null,
    creatives: r.creatives as unknown as CreativeImage[] | null,
    form: r.form as unknown as LeadFormDraft | null,
    review: r.review as unknown as ReviewResult | null,
    built,
    error: r.error,
    costCents: r.costCents,
    createdAt: r.createdAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    links: {
      adsManager: built?.campaignId && ctx?.adAccountId ? adsManagerUrl(ctx.adAccountId, built.campaignId) : null,
      form: built?.formId && ctx?.pageId ? formUrl(ctx.pageId, built.formId) : null,
    },
  };
}

export type { RunRow };

// Für die Creative-Auffrischung (lib/kampagnen/refresh.ts)
export { lock as lockRun, unlock as unlockRun, saveStep as saveRunStep, renderImages as renderRunImages, fail as failRun };
