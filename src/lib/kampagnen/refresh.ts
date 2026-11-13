// Kampagnen-Automatik 3: Creatives regelmäßig auffrischen.
//
// Wöchentlich (je Kampagne höchstens alle 7 Tage geprüft) liest der Cron die
// Kennzahlen der Anzeigen der letzten 14 Tage (Marketing API „Insights“, level=ad).
// Müde Anzeigen: Frequenz über der Schwelle, CTR deutlich unter den ersten 7 Tagen
// oder Leadpreis deutlich über dem Kampagnenschnitt (bei genug Ausgaben).
// Dann erstellt das Agenten-Team (Winkel, Texter, Bilder, Prüfer – kein neuer Plan,
// kein neues Formular) 2–3 neue Anzeigen in DERSELBEN Anzeigengruppe, PAUSED.
// Die App pausiert nichts und aktiviert nichts; Ole bekommt Push + Aufgabe mit
// Vorschlag, welche Anzeigen er pausieren sollte. Höchstens alle 14 Tage je Kampagne.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { reportError } from "@/lib/monitoring";
import { angleResearcher, copywriter, reviewer, reviseCopies } from "@/lib/kampagnen/agents";
import { adsManagerUrl, buildRefreshAds, type MetaApi } from "@/lib/kampagnen/builder";
import { defaultDeps, failRun, lockRun, renderRunImages, saveRunStep, unlockRun, type CampaignDeps } from "@/lib/kampagnen/run";
import { loadAutomationSettings, type AutomationSettings } from "@/lib/kampagnen/settings";
import {
  ACTIVE_STATUSES,
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

const DAY = 86_400_000;
const CHECK_EVERY_MS = 7 * DAY;
const REFRESH_EVERY_MS = 14 * DAY;
const json = (v: unknown) => v as Prisma.InputJsonValue;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const eur = (n: number) => `${n.toLocaleString("de-DE", { maximumFractionDigits: 2 })} €`;

// ─── Kennzahlen und Ermüdung ───────────────────────────────────────────

export type AdStats = {
  adId: string;
  adName: string;
  adSetId: string;
  createdTime: string | null;
  /** letzte 14 Tage */
  spend: number;
  impressions: number;
  clicks: number;
  frequency: number;
  leads: number;
  /** erste 7 Tage seit Start der Anzeige (null = unbekannt bzw. zu jung) */
  firstWeek: { impressions: number; clicks: number } | null;
};

export type Fatigued = { adId: string; adName: string; adSetId: string; reasons: string[] };
export type Thresholds = Pick<AutomationSettings, "refreshMaxFrequency" | "refreshCtrDrop" | "refreshCplRise" | "refreshMinSpendEur">;

const MIN_IMPRESSIONS = 1000;

/** Müde Anzeigen erkennen (rein rechnerisch, testbar). */
export function detectFatigue(ads: AdStats[], th: Thresholds): Fatigued[] {
  const spend = ads.reduce((s, a) => s + a.spend, 0);
  const leads = ads.reduce((s, a) => s + a.leads, 0);
  const campaignCpl = leads > 0 ? spend / leads : null;
  const out: Fatigued[] = [];
  for (const a of ads) {
    const reasons: string[] = [];
    if (a.frequency > th.refreshMaxFrequency) reasons.push(`Frequenz ${a.frequency.toFixed(1)} (über ${th.refreshMaxFrequency})`);
    if (a.firstWeek && a.firstWeek.impressions >= MIN_IMPRESSIONS && a.impressions >= MIN_IMPRESSIONS) {
      const first = a.firstWeek.clicks / a.firstWeek.impressions;
      const now = a.clicks / a.impressions;
      if (first > 0 && now <= first * (1 - th.refreshCtrDrop)) {
        reasons.push(`CTR ${(now * 100).toFixed(2)} % statt ${(first * 100).toFixed(2)} % in den ersten 7 Tagen (−${Math.round((1 - now / first) * 100)} %)`);
      }
    }
    if (campaignCpl != null && a.spend >= th.refreshMinSpendEur) {
      const cpl = a.leads > 0 ? a.spend / a.leads : Infinity;
      if (cpl >= campaignCpl * (1 + th.refreshCplRise)) {
        reasons.push(a.leads > 0 ? `Leadpreis ${eur(cpl)} (Kampagnenschnitt ${eur(campaignCpl)})` : `${eur(a.spend)} ausgegeben ohne Lead (Kampagnenschnitt ${eur(campaignCpl)})`);
      }
    }
    if (reasons.length) out.push({ adId: a.adId, adName: a.adName, adSetId: a.adSetId, reasons });
  }
  return out;
}

type InsightRow = { ad_id?: string; impressions?: string; clicks?: string; spend?: string; frequency?: string; actions?: { action_type: string; value: string }[] };
const LEAD_ACTIONS = ["onsite_conversion.lead_grouped", "lead", "leadgen_grouped"];
const leadsOf = (r: InsightRow) => Math.max(0, ...(r.actions ?? []).filter((a) => LEAD_ACTIONS.includes(a.action_type)).map((a) => Number(a.value) || 0));

/** Kennzahlen je Anzeige (letzte 14 Tage, dazu die ersten 7 Tage bei älteren Anzeigen). */
export async function fetchAdStats(meta: MetaApi, campaignId: string, now = new Date()): Promise<AdStats[]> {
  const until = new Date(now.getTime() - DAY);
  const since = new Date(now.getTime() - 14 * DAY);
  const ads = await meta.get<{ data: { id: string; name: string; adset_id: string; created_time?: string; effective_status?: string }[] }>(`${campaignId}/ads`, {
    fields: "id,name,adset_id,created_time,effective_status",
    limit: "100",
  });
  const rows = await meta.get<{ data: InsightRow[] }>(`${campaignId}/insights`, {
    level: "ad",
    fields: "ad_id,impressions,clicks,spend,frequency,actions",
    time_range: JSON.stringify({ since: ymd(since), until: ymd(until) }),
    limit: "200",
  });
  const byAd = new Map((rows.data ?? []).map((r) => [r.ad_id, r]));
  const out: AdStats[] = [];
  for (const ad of ads.data ?? []) {
    if (ad.effective_status && !["ACTIVE"].includes(ad.effective_status)) continue; // nur laufende Anzeigen bewerten
    const r = byAd.get(ad.id) ?? {};
    let firstWeek: AdStats["firstWeek"] = null;
    const created = ad.created_time ? new Date(ad.created_time) : null;
    if (created && now.getTime() - created.getTime() >= 14 * DAY) {
      const fw = await meta
        .get<{ data: InsightRow[] }>(`${ad.id}/insights`, {
          fields: "impressions,clicks",
          time_range: JSON.stringify({ since: ymd(created), until: ymd(new Date(created.getTime() + 6 * DAY)) }),
        })
        .catch(() => ({ data: [] as InsightRow[] }));
      const f = fw.data?.[0];
      if (f) firstWeek = { impressions: Number(f.impressions) || 0, clicks: Number(f.clicks) || 0 };
    }
    out.push({
      adId: ad.id,
      adName: ad.name,
      adSetId: ad.adset_id,
      createdTime: ad.created_time ?? null,
      spend: Number(r.spend) || 0,
      impressions: Number(r.impressions) || 0,
      clicks: Number(r.clicks) || 0,
      frequency: Number(r.frequency) || 0,
      leads: leadsOf(r),
      firstWeek,
    });
  }
  return out;
}

// ─── Cron: prüfen und Auffrischung anstoßen ───────────────────────────

export type RefreshDeps = CampaignDeps & {
  task: (contactId: string | null, title: string, note: string | null, dueAt: Date) => Promise<void>;
};

export function defaultRefreshDeps(): RefreshDeps {
  return {
    ...defaultDeps(),
    task: async (contactId, title, note, dueAt) => {
      await prisma.salesTask.create({ data: { contactId, type: "SONSTIGES", title, note, dueAt } }).catch((err) => reportError(err, "refresh-task"));
    },
  };
}

/** Wöchentliche Prüfung (gedrosselt: wenige Kampagnen je Cron-Lauf). */
export async function runCreativeRefresh(
  now = new Date(),
  deps: RefreshDeps = defaultRefreshDeps(),
  opts: { maxPerRun?: number; customerId?: string } = {},
): Promise<{ checked: number; refreshed: number }> {
  const maxPerRun = opts.maxPerRun ?? 3;
  const settings = await loadAutomationSettings();
  const out = { checked: 0, refreshed: 0 };
  if (!settings.refresh) return out;
  if (!deps.env().meta) return out;
  const sources = await prisma.campaignRun.findMany({
    where: { kind: "neu", status: "built", customer: { metaAdAccountId: { not: null } }, ...(opts.customerId ? { customerId: opts.customerId } : {}) },
    orderBy: { createdAt: "desc" },
    select: { id: true, customerId: true, built: true },
  });
  const seen = new Set<string>();
  for (const s of sources) {
    if (out.checked >= maxPerRun) break;
    const built = s.built as unknown as BuiltState | null;
    const campaignId = built?.campaignId;
    if (!campaignId || built?.cleanedAt || seen.has(campaignId)) continue;
    seen.add(campaignId);
    const health = await prisma.campaignHealth.findUnique({ where: { campaignId } });
    if (health?.lastCheckedAt && now.getTime() - health.lastCheckedAt.getTime() < CHECK_EVERY_MS) continue;
    out.checked++;
    try {
      if (await checkCampaign(s.id, s.customerId, campaignId, settings, deps, now)) out.refreshed++;
    } catch (err) {
      reportError(err, "kampagne-auffrischung", { campaign: campaignId });
      await prisma.campaignHealth.upsert({
        where: { campaignId },
        create: { campaignId, customerId: s.customerId, lastCheckedAt: now, lastResult: json({ error: String(err).slice(0, 300) }) },
        update: { lastCheckedAt: now, lastResult: json({ error: String(err).slice(0, 300) }) },
      });
    }
  }
  return out;
}

/** Eine Kampagne prüfen; bei müden Anzeigen Auffrischungs-Lauf anlegen und abarbeiten. */
async function checkCampaign(sourceRunId: string, customerId: string, campaignId: string, settings: AutomationSettings, deps: RefreshDeps, now: Date): Promise<boolean> {
  const c = await deps.meta.get<{ effective_status?: string; status?: string }>(campaignId, { fields: "effective_status,status" });
  const running = (c.effective_status ?? c.status) === "ACTIVE";
  const stats = running ? await fetchAdStats(deps.meta, campaignId, now) : [];
  const fatigued = running ? detectFatigue(stats, settings) : [];
  const health = await prisma.campaignHealth.upsert({
    where: { campaignId },
    create: { campaignId, customerId, lastCheckedAt: now, lastResult: json({ running, fatigued }) },
    update: { lastCheckedAt: now, lastResult: json({ running, fatigued }) },
  });
  if (!fatigued.length) return false;
  // Höchstens alle 14 Tage je Kampagne
  const recent = await prisma.campaignRun.findFirst({ where: { refreshCampaignId: campaignId, createdAt: { gt: new Date(now.getTime() - REFRESH_EVERY_MS) } }, select: { id: true } });
  if (recent || (health.lastRefreshAt && now.getTime() - health.lastRefreshAt.getTime() < REFRESH_EVERY_MS)) return false;
  // Höchstens ein Lauf je Kunde gleichzeitig – dann beim nächsten Cron erneut prüfen
  const busy = await prisma.campaignRun.findFirst({ where: { customerId, status: { in: ACTIVE_STATUSES } }, select: { id: true } });
  if (busy) {
    await prisma.campaignHealth.update({ where: { campaignId }, data: { lastCheckedAt: null } });
    return false;
  }
  const src = await prisma.campaignRun.findUniqueOrThrow({ where: { id: sourceRunId } });
  const srcBuilt = src.built as unknown as BuiltState;
  // Anzeigengruppe mit den meisten müden Anzeigen
  const counts = new Map<string, number>();
  for (const f of fatigued) counts.set(f.adSetId, (counts.get(f.adSetId) ?? 0) + 1);
  const adSetId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? srcBuilt.adSetIds[0];
  if (!adSetId || !srcBuilt.formId) return false;
  const steps: RunStep[] = initialSteps().map((s) => (["stratege", "formular"].includes(s.key) ? { ...s, status: "uebersprungen", note: "Auffrischung: Plan und Formular bleiben" } : s));
  const run = await prisma.campaignRun.create({
    data: {
      customerId,
      product: src.product,
      kind: "auffrischung",
      trigger: "auffrischung",
      autoBuild: true,
      sourceRunId,
      refreshCampaignId: campaignId,
      refreshAdSetId: adSetId,
      fatigue: json(fatigued),
      steps: json(steps),
      context: json(src.context),
      plan: json(src.plan),
      form: json(src.form),
      built: json({ ...emptyBuilt(), campaignId, adSetIds: [adSetId], formId: srcBuilt.formId }),
      createdBy: "automatik",
    },
  });
  await prisma.campaignHealth.update({ where: { campaignId }, data: { lastRefreshAt: now } });
  const status = await processRefreshRun(run.id, deps);
  return status === "built";
}

// ─── Auffrischungs-Lauf ────────────────────────────────────────────────

/** Winkel → Texter → Bilder → Prüfer → neue Anzeigen (PAUSED) in derselben Anzeigengruppe. */
export async function processRefreshRun(id: string, deps: CampaignDeps | RefreshDeps = defaultRefreshDeps()): Promise<RunStatus> {
  if (!(await lockRun(id))) return (await prisma.campaignRun.findUniqueOrThrow({ where: { id }, select: { status: true } })).status as RunStatus;
  const row = await prisma.campaignRun.findUniqueOrThrow({ where: { id }, include: { customer: { select: { name: true, salesContact: { select: { id: true } }, onboarding: { select: { salesContactId: true } } } } } });
  const state = { id, steps: row.steps as unknown as RunStep[] };
  let current: StepKey = "winkel";
  const t = () => new Date().toISOString();
  try {
    if (!["queued", "running", "building", "failed"].includes(row.status)) return row.status as RunStatus;
    await prisma.campaignRun.update({ where: { id }, data: { status: "running", error: null } });
    const plan = { ...(row.plan as unknown as CampaignPlan), adsPerAdSet: 3 };
    const form = row.form as unknown as LeadFormDraft;
    const src = row.sourceRunId ? await prisma.campaignRun.findUnique({ where: { id: row.sourceRunId }, select: { copies: true } }) : null;
    const before = ((src?.copies ?? []) as unknown as AdCopy[]).map((c) => `„${c.headline}“ / „${c.imageHeadline}“`).join("; ");
    const baseCtx = row.context as unknown as CampaignContext;
    const ctx: CampaignContext = {
      ...baseCtx,
      wish: [baseCtx.wish, `Auffrischung wegen Anzeigenermüdung: neue Winkel und Bilder, die sich klar von den bisherigen unterscheiden. Bisherige Anzeigen: ${before || "–"}`].filter(Boolean).join("\n"),
    };

    current = "winkel";
    let angles = row.angles as unknown as Angle[] | null;
    if (!angles) {
      await saveRunStep(state, current, { status: "laeuft", startedAt: t() });
      const r = await angleResearcher(deps.llm, ctx, plan);
      angles = r.value.slice(0, 3);
      await saveRunStep(state, current, { status: "fertig", finishedAt: t() }, { angles: json(angles) }, r.usage);
    }
    current = "texter";
    let copies = row.copies as unknown as AdCopy[] | null;
    if (!copies) {
      await saveRunStep(state, current, { status: "laeuft", startedAt: t() });
      const r = await copywriter(deps.llm, ctx, plan, angles);
      copies = r.value.slice(0, 3);
      await saveRunStep(state, current, { status: "fertig", finishedAt: t() }, { copies: json(copies) }, r.usage);
    }
    current = "bilder";
    let images = row.creatives as unknown as CreativeImage[] | null;
    if (!images) {
      await saveRunStep(state, current, { status: "laeuft", startedAt: t() });
      images = await renderRunImages(deps, ctx, angles, copies, id);
      if (!images.length) throw new Error("Kein Bild konnte erzeugt werden.");
      await saveRunStep(state, current, { status: "fertig", finishedAt: t(), note: `${images.length} Bilder` }, { creatives: json(images) });
    }
    current = "pruefer";
    let review = row.review as unknown as ReviewResult | null;
    if (!review) {
      await saveRunStep(state, current, { status: "laeuft", startedAt: t() });
      let r = await reviewer(deps.llm, ctx, { plan, copies, form, images });
      await saveRunStep(state, current, {}, {}, r.usage);
      review = r.value;
      if (review.status === "rot") {
        const findings = review.findings.filter((f) => f.area === "text" || f.area === "bild");
        if (findings.length) {
          const rc = await reviseCopies(deps.llm, ctx, copies, findings, angles.map((a) => a.key));
          copies = rc.value;
          await saveRunStep(state, current, { note: "Texte überarbeitet" }, { copies: json(copies) }, rc.usage);
          images = await renderRunImages(deps, ctx, angles, copies, id, images, copies.map(() => true));
          await prisma.campaignRun.update({ where: { id }, data: { creatives: json(images) } });
        }
        r = await reviewer(deps.llm, ctx, { plan, copies, form, images });
        review = { ...r.value, revised: true };
        await saveRunStep(state, current, {}, {}, r.usage);
      }
      await saveRunStep(state, current, { status: review.status === "rot" ? "fehler" : "fertig", finishedAt: t(), note: review.summary.slice(0, 200) }, { review: json(review) });
    }
    const contactId = row.customer.salesContact?.id ?? row.customer.onboarding?.salesContactId ?? null;
    const taskFn = "task" in deps ? deps.task : defaultRefreshDeps().task;
    if (review.status === "rot") {
      await saveRunStep(state, "anlegen", { status: "uebersprungen", note: "Prüfung rot – nichts bei Meta angelegt" });
      await prisma.campaignRun.update({ where: { id }, data: { status: "blocked", finishedAt: new Date(), error: `Prüfung rot: ${review.summary}`.slice(0, 1000) } });
      await taskFn(contactId, `Auffrischung ${row.customer.name}: Prüfung rot`, `Neue Anzeigen wurden nicht angelegt: ${review.summary}\nKundenakte → Kampagne (KI): /admin/kunden/${row.customerId}/kampagne`, new Date());
      return "blocked";
    }

    current = "anlegen";
    await prisma.campaignRun.update({ where: { id }, data: { status: "building" } });
    await saveRunStep(state, current, { status: "laeuft", startedAt: t() });
    const prev = { ...emptyBuilt(), ...((row.built as unknown as BuiltState | null) ?? {}) };
    const built = await buildRefreshAds(deps.meta, {
      ctx,
      namePrefix: `${plan.campaignName} | Auffrischung ${ymd(new Date())}`,
      adSetId: row.refreshAdSetId!,
      formId: prev.formId!,
      copies,
      images,
      built: prev,
      onProgress: async (b) => {
        await prisma.campaignRun.update({ where: { id }, data: { built: json(b), lockedAt: new Date() } });
      },
    });
    await prisma.campaignRun.update({ where: { id }, data: { built: json(built), status: "built", finishedAt: new Date() } });
    await saveRunStep(state, current, { status: "fertig", finishedAt: t(), note: `${built.adIds.length} neue Anzeigen pausiert angelegt` });

    const fatigued = (row.fatigue as unknown as Fatigued[] | null) ?? [];
    const link = baseCtx.adAccountId && row.refreshCampaignId ? adsManagerUrl(baseCtx.adAccountId, row.refreshCampaignId) : `/admin/kunden/${row.customerId}/kampagne`;
    const names = fatigued.map((f) => f.adName).join(", ");
    await deps.notify(`Neue Anzeigen für ${row.customer.name} bereit (pausiert)`, `Müde Anzeigen: ${names}`.slice(0, 180), link);
    await taskFn(
      contactId,
      `Neue Anzeigen für ${row.customer.name} bereit (pausiert) – müde Anzeigen: ${names}`.slice(0, 250),
      [
        `${built.adIds.length} neue Anzeigen liegen pausiert in derselben Anzeigengruppe. Bitte prüfen und aktivieren.`,
        "Vorschlag: diese Anzeigen pausieren:",
        ...fatigued.map((f) => `• ${f.adName}: ${f.reasons.join("; ")}`),
        `Werbeanzeigenmanager: ${link}`,
      ].join("\n"),
      new Date(),
    );
    return "built";
  } catch (err) {
    return await failRun(id, state, current, err);
  } finally {
    await unlockRun(id).catch(() => undefined);
  }
}
