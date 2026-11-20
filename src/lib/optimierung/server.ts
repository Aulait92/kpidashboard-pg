// Automatische Optimierung je Werbekonto (Teil B, Ole 18.11.2026): Konten, wöchentlicher Lauf,
// Freigabe, Ausführung, Protokoll, Frühwarnung und Meta-Änderungsprotokoll.
//
// Werbekonten:
//   kunde: eigenes Meta-Werbekonto eines Kunden (Customer.metaAdAccountId), alle aktiven
//          Kampagnen (bzw. die mit campaignKeyword).
//   pool:  Pay-per-Lead-Pool je Produkt (aktive LeadSubscription.productKey); Kampagnen des
//          Produkts in den Agenturkonten (META_AD_ACCOUNT_IDS), zugeordnet wie bei den Kosten.
// Ablauf: Lauf (je Konto höchstens alle 7 Tage) liest Meta + Software-Kennzahlen, die reine
// Entscheidungslogik (regeln.ts) plant Maßnahmen. Modus „Vorschlag“ (Standard): Ole gibt im
// Admin frei; „Autopilot“ (je Konto bzw. global): sofort freigegeben. Ausgeführt wird nur
// Freigegebenes, jede Ausführung landet mit Ergebnis im Protokoll (Quelle für den Monatsbericht).

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit, type AuditActor } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { graphApi, type MetaApi } from "@/lib/kampagnen/builder";
import { loadAutomationSettings } from "@/lib/kampagnen/settings";
import type { BuiltState } from "@/lib/kampagnen/types";
import { canonicalProductKey, displayProduct } from "@/lib/products";
import { monthRange } from "@/lib/ppl/periods";
import { cleanToken } from "@/lib/meta-leads";
import { dedupeKeyOf, isSuggestion, planMeasures, summarizeQuality, type LeadQuality, type MeasureKind, type PlannedMeasure, type History } from "@/lib/optimierung/regeln";
import { fetchActivities, isAccessError, moveBudget, pauseAd, readAccountSnapshot, type BudgetMove, type MetaCampaignRow } from "@/lib/optimierung/meta";
import { earlyWarningTitle, isManualTopic, reportText, isStale, MANUAL_TOPICS, type ManualTopic } from "@/lib/optimierung/shared";

const DAY = 86_400_000;
const RUN_EVERY_MS = 7 * DAY;
const RUNNING = "Ausführung läuft";
const json = (v: unknown) => v as Prisma.InputJsonValue;
const num = (v: unknown) => (v == null ? null : Number(v));
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ─── Abhängigkeiten (in Tests ersetzt) ─────────────────────────────────

export type RefreshOutcome = { status: "built" | "blocked" | "failed" | "busy" | "unavailable"; runId?: string; note?: string };

export type OptimizationDeps = {
  meta: MetaApi;
  hasToken: () => boolean;
  /** Agenturkonten (Pay-per-Lead-Pools), ohne „act_“ */
  agencyAccounts: () => string[];
  task: (contactId: string | null, title: string, note: string | null) => Promise<void>;
  notify: (title: string, body: string, url: string) => Promise<void>;
  /** Kampagnenname → kanonisches Produkt (wie bei der Kostenzuordnung) */
  productMatcher: () => Promise<(campaignName: string) => string | null>;
  /** Motiv-Erneuerung über die Kampagnen-Agenten (Auffrischungs-Lauf, neue Anzeigen PAUSED) */
  refresh: (input: { sourceRunId: string; customerId: string; campaignId: string; adSetId: string; fatigued: { adId: string; adName: string; adSetId: string; reasons: string[] }[] }) => Promise<RefreshOutcome>;
};

export function defaultOptimizationDeps(): OptimizationDeps {
  return {
    meta: graphApi,
    hasToken: () => !!cleanToken(process.env.META_ACCESS_TOKEN),
    agencyAccounts: () =>
      (process.env.META_AD_ACCOUNT_IDS ?? process.env.META_AD_ACCOUNT_ID ?? "")
        .split(",")
        .map((s) => s.trim().replace(/^act_/, ""))
        .filter((s) => /^\d+$/.test(s)),
    task: async (contactId, title, note) => {
      await prisma.salesTask.create({ data: { contactId, type: "SONSTIGES", title: title.slice(0, 250), note, dueAt: new Date() } }).catch((err) => reportError(err, "optimierung-task"));
    },
    notify: async (title, body, url) => {
      await (await import("@/lib/push")).sendToAdmins({ title, body, url }).catch(() => undefined);
    },
    productMatcher: async () => (await import("@/lib/product-catalog")).loadProductMatcher(),
    refresh: async (input) => {
      const { createRefreshRun, processRefreshRun, defaultRefreshDeps } = await import("@/lib/kampagnen/refresh");
      const { ACTIVE_STATUSES } = await import("@/lib/kampagnen/types");
      const busy = await prisma.campaignRun.findFirst({ where: { customerId: input.customerId, status: { in: ACTIVE_STATUSES } }, select: { id: true } });
      if (busy) return { status: "busy" };
      const runId = await createRefreshRun({ ...input, createdBy: "optimierung" });
      if (!runId) return { status: "unavailable", note: "Ursprungs-Kampagne ohne Formular bzw. Anzeigengruppe" };
      const status = await processRefreshRun(runId, defaultRefreshDeps());
      const row = await prisma.campaignRun.findUnique({ where: { id: runId }, select: { built: true, error: true } });
      const ads = ((row?.built as unknown as BuiltState | null)?.adIds ?? []).length;
      if (status === "built") return { status: "built", runId, note: `${ads} neue Anzeigen pausiert angelegt (Prüfung bestanden), Freischaltung im Werbeanzeigenmanager` };
      return { status: status === "blocked" ? "blocked" : "failed", runId, note: row?.error ?? status };
    },
  };
}

// ─── Einstellungen ─────────────────────────────────────────────────────

export type OptimizationSettingsView = { enabled: boolean; autopilot: boolean };

export async function loadOptimizationSettings(): Promise<OptimizationSettingsView> {
  const row = await prisma.optimizationSettings.findUnique({ where: { id: "default" } }).catch(() => null);
  return { enabled: row?.enabled ?? true, autopilot: row?.autopilot ?? false };
}

export async function saveOptimizationSettings(input: Partial<OptimizationSettingsView>): Promise<OptimizationSettingsView> {
  const cur = await loadOptimizationSettings();
  const next = { enabled: input.enabled ?? cur.enabled, autopilot: input.autopilot ?? cur.autopilot };
  await prisma.optimizationSettings.upsert({ where: { id: "default" }, create: { id: "default", ...next }, update: next });
  return next;
}

export const isAutopilot = (account: { autopilot: boolean | null }, settings: OptimizationSettingsView) => account.autopilot ?? settings.autopilot;

// ─── Konten ────────────────────────────────────────────────────────────

/** Konten aus den Kundendaten ableiten: Kunden mit eigenem Werbekonto, aktive PPL-Pools. */
export async function syncOptimizationAccounts(): Promise<void> {
  const customers = await prisma.customer.findMany({
    where: { metaAdAccountId: { not: null } },
    select: { id: true, name: true, metaAdAccountId: true, archived: true, plan: true },
  });
  const activeCustomerIds: string[] = [];
  for (const c of customers) {
    const id = (c.metaAdAccountId ?? "").replace(/^act_/, "").trim();
    const active = /^\d+$/.test(id) && !c.archived && c.plan !== "internal";
    if (active) activeCustomerIds.push(c.id);
    if (!active && !/^\d+$/.test(id)) continue;
    await prisma.optimizationAccount.upsert({
      where: { customerId: c.id },
      create: { kind: "kunde", customerId: c.id, label: c.name, adAccountId: id, active },
      update: { label: c.name, adAccountId: id, active },
    });
  }
  await prisma.optimizationAccount.updateMany({ where: { kind: "kunde", active: true, customerId: { notIn: activeCustomerIds } }, data: { active: false } });

  const subs = await prisma.leadSubscription.findMany({
    where: { active: true, customer: { archived: false, plan: { not: "internal" } } },
    select: { productKey: true },
    distinct: ["productKey"],
  });
  const products = [...new Set(subs.map((s) => canonicalProductKey(s.productKey)).filter(Boolean))];
  for (const p of products) {
    await prisma.optimizationAccount.upsert({
      where: { poolProduct: p },
      create: { kind: "pool", poolProduct: p, label: `Pool ${displayProduct(p)}`, active: true },
      update: { active: true },
    });
  }
  await prisma.optimizationAccount.updateMany({ where: { kind: "pool", active: true, poolProduct: { notIn: products } }, data: { active: false } });
}

type AccountRow = NonNullable<Awaited<ReturnType<typeof loadAccount>>>;
function loadAccount(id: string) {
  return prisma.optimizationAccount.findUnique({
    where: { id },
    include: {
      customer: {
        select: { id: true, name: true, plan: true, vermittlerTyp: true, salesContact: { select: { id: true } }, onboarding: { select: { salesContactId: true } } },
      },
    },
  });
}
const contactOf = (a: AccountRow) => a.customer?.salesContact?.id ?? a.customer?.onboarding?.salesContactId ?? null;

/** Rohe productKeys (LeadSubscription/Lead.source) eines Pool-Produkts. */
async function rawPoolKeys(product: string): Promise<string[]> {
  const subs = await prisma.leadSubscription.findMany({ select: { productKey: true }, distinct: ["productKey"] });
  return subs.map((s) => s.productKey).filter((k) => canonicalProductKey(k) === product);
}

// ─── Kennzahlen aus der Software ───────────────────────────────────────

async function loadQuality(a: AccountRow, now: Date): Promise<LeadQuality | null> {
  const since28 = new Date(now.getTime() - 28 * DAY);
  const matureFrom = new Date(now.getTime() - 60 * DAY);
  const matureTo = new Date(now.getTime() - 7 * DAY);
  const sel = { status: true, disqualifyReason: true, stornoState: true, stornoReason: true } as const;
  if (a.kind === "kunde" && a.customerId) {
    // „Nur Betreuung“ pflegt keine Ergebnisse in der App → keine Qualitätsaussage
    if (a.customer?.plan === "service") return null;
    const [recent, mature] = await Promise.all([
      prisma.lead.findMany({ where: { customerId: a.customerId, createdAt: { gte: since28, lte: now } }, select: sel }),
      prisma.lead.findMany({ where: { customerId: a.customerId, createdAt: { gte: matureFrom, lte: matureTo } }, select: { status: true, reached: true } }),
    ]);
    return summarizeQuality(recent, mature);
  }
  if (a.kind === "pool" && a.poolProduct) {
    const keys = await rawPoolKeys(a.poolProduct);
    if (!keys.length) return null;
    const [recent, mature, invalid] = await Promise.all([
      prisma.lead.findMany({ where: { subscription: { productKey: { in: keys } }, createdAt: { gte: since28, lte: now } }, select: sel }),
      prisma.lead.findMany({ where: { subscription: { productKey: { in: keys } }, createdAt: { gte: matureFrom, lte: matureTo } }, select: { status: true, reached: true } }),
      prisma.poolLead.findMany({ where: { productKey: { in: keys }, status: "invalid", createdAt: { gte: since28, lte: now } }, select: { reason: true } }),
    ]);
    return summarizeQuality(recent, mature, invalid);
  }
  return null;
}

async function loadHistory(a: AccountRow, now: Date): Promise<History> {
  const since = new Date(now.getTime() - 35 * DAY);
  const month = monthRange(now);
  const scope: Prisma.OptimizationMeasureWhereInput = a.customerId ? { OR: [{ accountId: a.id }, { customerId: a.customerId, accountId: null }] } : { accountId: a.id };
  const [measures, executedThisMonth, runs] = await Promise.all([
    prisma.optimizationMeasure.findMany({
      where: { accountId: a.id, plannedAt: { gte: since } },
      select: { kind: true, status: true, targetId: true, params: true, major: true, plannedAt: true, executedAt: true },
    }),
    prisma.optimizationMeasure.count({ where: { ...scope, status: "ausgefuehrt", executedAt: { gte: month.start, lt: month.end } } }),
    a.customerId
      ? prisma.campaignRun.findMany({
          where: { customerId: a.customerId, kind: "auffrischung", status: { notIn: ["failed", "cancelled"] }, createdAt: { gte: since } },
          select: { refreshAdSetId: true, createdAt: true },
        })
      : Promise.resolve([] as { refreshAdSetId: string | null; createdAt: Date }[]),
  ]);
  const h: History = { majorChangeAt: {}, lastRefreshAt: {}, executedThisMonth, open: [], lastSuggestionAt: {} };
  const later = (rec: Record<string, string>, key: string, d: Date) => {
    if (!rec[key] || new Date(rec[key]) < d) rec[key] = d.toISOString();
  };
  for (const m of measures) {
    const adSetIds = ((m.params as { adSetIds?: string[] } | null)?.adSetIds ?? []).filter(Boolean);
    if (m.status === "geplant" || m.status === "freigegeben") h.open.push(`${m.kind}|${m.targetId ?? ""}`);
    if (m.major && m.status !== "abgelehnt" && m.status !== "fehlgeschlagen") for (const s of adSetIds) later(h.majorChangeAt, s, m.executedAt ?? m.plannedAt);
    if (m.kind === "motiv_erneuern" && m.status === "ausgefuehrt" && m.executedAt) for (const s of adSetIds) later(h.lastRefreshAt, s, m.executedAt);
    if (isSuggestion(m.kind)) {
      const k = m.kind as MeasureKind;
      if (!h.lastSuggestionAt[k] || new Date(h.lastSuggestionAt[k]!) < m.plannedAt) h.lastSuggestionAt[k] = m.plannedAt.toISOString();
    }
  }
  // Auffrischungen der Kampagnen-Automatik zählen mit (neue Motive = größere Änderung)
  for (const r of runs) {
    if (!r.refreshAdSetId) continue;
    later(h.lastRefreshAt, r.refreshAdSetId, r.createdAt);
    later(h.majorChangeAt, r.refreshAdSetId, r.createdAt);
  }
  return h;
}

/** Von den Kampagnen-Agenten angelegte Kampagnen eines Kunden → Ursprungslauf (für neue Motive). */
async function agentCampaigns(customerId: string): Promise<Map<string, string>> {
  const runs = await prisma.campaignRun.findMany({ where: { customerId, kind: "neu", status: "built" }, orderBy: { createdAt: "desc" }, select: { id: true, built: true } });
  const out = new Map<string, string>();
  for (const r of runs) {
    const b = r.built as unknown as BuiltState | null;
    if (b?.campaignId && b.formId && !b.cleanedAt && !out.has(b.campaignId)) out.set(b.campaignId, r.id);
  }
  return out;
}

/** Ziel-Leadpreis eines Kontos (wie im Optimierungslauf), z. B. für „Leadpreis 7 Tage“ unter Liefern › Werbekonten. */
export async function zielLeadpreis(accountId: string, now = new Date()): Promise<{ cpl: number | null; label: string }> {
  const a = await loadAccount(accountId);
  return a ? refCplFor(a, now) : { cpl: null, label: "Schnitt des Kontos" };
}

async function refCplFor(a: AccountRow, now: Date): Promise<{ cpl: number | null; label: string }> {
  if (a.targetCpl != null) return { cpl: Number(a.targetCpl), label: "Ziel-Leadpreis" };
  if (a.kind === "kunde" && a.customerId && a.customer) {
    const { currentBudgets, customerCpl } = await import("@/lib/budget");
    const { lines } = await currentBudgets(a.customerId, now).catch(() => ({ lines: [] as { product: string }[] }));
    const r = await customerCpl(a.customerId, lines.map((l) => l.product), a.customer.vermittlerTyp, now).catch(() => null);
    if (r) return { cpl: r.cpl, label: r.source === "standard" ? "Ziel-Leadpreis (Rechner)" : "Leadpreis der letzten 30 Tage" };
  }
  return { cpl: null, label: "Schnitt des Kontos" };
}

async function agreedBudgetFor(a: AccountRow, now: Date): Promise<number | null> {
  const manual = a.agreedDailyBudget != null ? Number(a.agreedDailyBudget) : null;
  if (a.kind === "kunde" && a.customerId) {
    const { currentBudgets } = await import("@/lib/budget");
    const { lines } = await currentBudgets(a.customerId, now).catch(() => ({ lines: [] as { dailyBudget: number }[] }));
    const sum = lines.reduce((s, l) => s + l.dailyBudget, 0);
    if (sum > 0) return manual != null ? Math.min(manual, sum) : sum;
  }
  return manual;
}

const berlinDay = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", day: "numeric" }).format(d));

// ─── Lauf je Konto ─────────────────────────────────────────────────────

export type AccountPlan = {
  accountId: string;
  label: string;
  dryRun: boolean;
  autopilot: boolean;
  measures: PlannedMeasure[];
  warnings: string[];
  /** Kein Zugriff, Token fehlt o. Ä. (dann keine Maßnahmen) */
  problem: string | null;
  /** neu gespeicherte Maßnahmen (0 im Trockenlauf) */
  saved: number;
  stats: { campaigns: number; adSets: number; ads: number; spend14d: number; leads14d: number; refCpl: number | null; refCplLabel: string; agreedDailyBudget: number | null; currentDailyBudget: number | null; quality: LeadQuality | null };
};

async function taskOnce(deps: OptimizationDeps, contactId: string | null, title: string, note: string | null): Promise<void> {
  const open = await prisma.salesTask.findFirst({ where: { title: title.slice(0, 250), doneAt: null }, select: { id: true } });
  if (!open) await deps.task(contactId, title, note);
}

/**
 * Maßnahmen für ein Konto berechnen. dryRun: nur lesen (auch bei Meta), nichts speichern, keine
 * Aufgaben, keine Benachrichtigung. Sonst: neue Maßnahmen ins Protokoll (Vorschlag: „geplant“,
 * Autopilot: „freigegeben“; Vorschläge an Ole bleiben immer „geplant“).
 */
export async function planAccount(accountId: string, opts: { dryRun?: boolean; now?: Date; deps?: OptimizationDeps } = {}): Promise<AccountPlan> {
  const now = opts.now ?? new Date();
  const deps = opts.deps ?? defaultOptimizationDeps();
  const dryRun = !!opts.dryRun;
  const a = await loadAccount(accountId);
  if (!a) throw new Error("Werbekonto nicht gefunden.");
  const settings = await loadOptimizationSettings();
  const autopilot = isAutopilot(a, settings);
  const emptyStats: AccountPlan["stats"] = { campaigns: 0, adSets: 0, ads: 0, spend14d: 0, leads14d: 0, refCpl: null, refCplLabel: "", agreedDailyBudget: null, currentDailyBudget: null, quality: null };
  const result: AccountPlan = { accountId, label: a.label, dryRun, autopilot, measures: [], warnings: [], problem: null, saved: 0, stats: emptyStats };
  const link = `/admin/neu/leads/werbekonten/${a.id}`;

  const fail = async (problem: string, taskTitle: string | null, taskNote: string | null) => {
    result.problem = problem;
    if (!dryRun) {
      await prisma.optimizationAccount.update({ where: { id: a.id }, data: { lastRunAt: now, lastRunNote: problem.slice(0, 500) } });
      if (taskTitle) await taskOnce(deps, contactOf(a), taskTitle, `${taskNote ?? problem}\nOptimierung: ${link}`);
    }
    return result;
  };

  if (!deps.hasToken()) return fail("META_ACCESS_TOKEN fehlt", "Optimierung: Meta-Token fehlt (META_ACCESS_TOKEN)", "Ohne System-User-Token kann die wöchentliche Optimierung kein Werbekonto lesen.");
  const adAccountIds = a.kind === "kunde" ? (a.adAccountId ? [a.adAccountId] : []) : deps.agencyAccounts();
  if (!adAccountIds.length) {
    return a.kind === "kunde"
      ? fail("kein Meta-Werbekonto hinterlegt", null, null)
      : fail("keine Agenturkonten (META_AD_ACCOUNT_IDS) gesetzt", "Optimierung: Agenturkonten für Pay-per-Lead fehlen (META_AD_ACCOUNT_IDS)", null);
  }

  const keyword = a.campaignKeyword?.trim().toLowerCase() || null;
  let filter: (c: MetaCampaignRow) => boolean;
  if (keyword) filter = (c) => c.name.toLowerCase().includes(keyword);
  else if (a.kind === "pool") {
    const match = await deps.productMatcher();
    filter = (c) => !c.name.includes(".") && match(c.name) === a.poolProduct;
  } else filter = () => true;

  let snapshot: Awaited<ReturnType<typeof readAccountSnapshot>>;
  try {
    snapshot = await readAccountSnapshot(deps.meta, { adAccountIds, campaignFilter: filter, now });
  } catch (err) {
    const m = msg(err);
    if (isAccessError(m)) {
      const acc = adAccountIds.map((x) => `act_${x}`).join(", ");
      return fail(`kein Zugriff auf ${acc}: ${m.slice(0, 200)}`, `Werbekonto ${a.label}: kein Zugriff für die Optimierung`, `Meta verweigert den Zugriff auf ${acc}. Der Kunde muss unserem Business Manager Partnerzugriff mit „Kampagnen verwalten“ geben, und das Konto muss dem Systemnutzer zugewiesen sein (ads_management). Meldung: ${m.slice(0, 300)}`);
    }
    reportError(err, "optimierung-lesen", { account: a.id });
    return fail(`Meta-Fehler: ${m.slice(0, 300)}`, null, null);
  }

  if (!dryRun) {
    // Nicht freigegebene Maßnahmen mit veralteten Zahlen (älter als 14 Tage) verfallen
    await prisma.optimizationMeasure.updateMany({
      where: { accountId: a.id, status: "geplant", kind: { in: EXECUTABLE }, plannedAt: { lt: new Date(now.getTime() - 14 * DAY) } },
      data: { status: "abgelehnt", decidedAt: now, decidedBy: "System", result: "Verfallen: nicht innerhalb von 14 Tagen freigegeben (Zahlen veraltet)" },
    });
  }
  const [quality, history, ref, agreed, th, agents] = await Promise.all([
    loadQuality(a, now),
    loadHistory(a, now),
    refCplFor(a, now),
    agreedBudgetFor(a, now),
    loadAutomationSettings(),
    a.kind === "kunde" && a.customerId ? agentCampaigns(a.customerId) : Promise.resolve(new Map<string, string>()),
  ]);
  const plan = planMeasures({
    now,
    dayOfMonth: berlinDay(now),
    refCpl: ref.cpl,
    refCplLabel: ref.label,
    agreedDailyBudget: agreed,
    currentDailyBudget: snapshot.totalDailyBudget || null,
    adSets: snapshot.adSets,
    ads: snapshot.ads,
    quality,
    history,
    refreshableAdSets: snapshot.adSets.filter((s) => agents.has(s.campaignId)).map((s) => s.adSetId),
    thresholds: { maxFrequency: th.refreshMaxFrequency, ctrDrop: th.refreshCtrDrop, cplRise: th.refreshCplRise, minSpendEur: th.refreshMinSpendEur },
  });
  for (const m of plan.measures) {
    if (m.kind === "motiv_erneuern") m.params.sourceRunId = agents.get(String(m.params.campaignId)) ?? null;
  }
  // Rückmeldung an Meta (lib/capi): Kriterien für „Conversion Leads“ erfüllt → Vorschlag an Ole (nie automatisch umstellen)
  if (a.kind === "kunde" && a.customerId) {
    const cl = await import("@/lib/capi/server").then((m) => m.conversionLeadsSuggestion({ accountId: a.id, customerId: a.customerId! }, now)).catch((e: unknown) => {
      reportError(e, "optimierung-conversion-leads", { account: a.id });
      return null;
    });
    if (cl) plan.measures.push(cl);
  }
  result.measures = plan.measures;
  result.warnings = plan.warnings;
  result.stats = {
    campaigns: snapshot.campaigns.length,
    adSets: snapshot.adSets.length,
    ads: snapshot.ads.length,
    spend14d: Math.round(snapshot.ads.reduce((s, x) => s + x.spend, 0) * 100) / 100,
    leads14d: snapshot.ads.reduce((s, x) => s + x.leads, 0),
    refCpl: ref.cpl,
    refCplLabel: ref.label,
    agreedDailyBudget: agreed,
    currentDailyBudget: snapshot.totalDailyBudget || null,
    quality,
  };
  if (dryRun) return result;

  const created = await prisma.optimizationMeasure.createMany({
    data: plan.measures.map((m) => {
      const auto = autopilot && !isSuggestion(m.kind);
      return {
        accountId: a.id,
        customerId: a.customerId,
        status: auto ? "freigegeben" : "geplant",
        kind: m.kind,
        source: "automatik",
        targetType: m.targetType,
        targetId: m.targetId,
        targetName: m.targetName,
        title: m.title.slice(0, 300),
        reason: m.reason.slice(0, 2000),
        data: json(m.data),
        params: json(m.params),
        major: m.major,
        dedupeKey: dedupeKeyOf(a.id, now, m),
        plannedAt: now,
        ...(auto ? { decidedAt: now, decidedBy: "Autopilot" } : {}),
      };
    }),
    skipDuplicates: true,
  });
  result.saved = created.count;
  const note = snapshot.ads.length
    ? `${snapshot.campaigns.length} Kampagnen, ${snapshot.ads.length} laufende Anzeigen, ${plan.measures.length} Maßnahmen geplant`
    : "Keine laufenden Anzeigen";
  await prisma.optimizationAccount.update({ where: { id: a.id }, data: { lastRunAt: now, lastRunNote: note, lastRunAds: snapshot.ads.length } });
  for (const w of plan.warnings) await taskOnce(deps, contactOf(a), `Werbekonto ${a.label}: Budget prüfen`, `${w}\nOptimierung: ${link}`);
  const waiting = plan.measures.filter((m) => !autopilot || isSuggestion(m.kind)).length;
  if (created.count > 0 && waiting > 0) {
    await deps.notify(`Optimierung ${a.label}`, `${waiting} Maßnahme(n) warten auf Freigabe`, link);
  }
  await audit("optimierung.lauf", { entity: "OptimizationAccount", entityId: a.id, customerId: a.customerId, details: { planned: plan.measures.length, saved: created.count, autopilot }, actor: { role: "system" } }).catch(() => undefined);
  return result;
}

/** Wöchentlicher Lauf: fällige Konten (höchstens alle 7 Tage), wenige je Aufruf. */
export async function runWeeklyOptimization(now = new Date(), deps = defaultOptimizationDeps(), opts: { maxPerRun?: number; sync?: boolean } = {}): Promise<{ planned: number; accounts: number }> {
  const out = { planned: 0, accounts: 0 };
  if (opts.sync ?? true) await syncOptimizationAccounts();
  const due = await prisma.optimizationAccount.findMany({
    where: { active: true, OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(now.getTime() - RUN_EVERY_MS) } }] },
    orderBy: [{ lastRunAt: { sort: "asc", nulls: "first" } }],
    take: opts.maxPerRun ?? 2,
    select: { id: true },
  });
  for (const d of due) {
    try {
      const r = await planAccount(d.id, { now, deps });
      out.accounts++;
      out.planned += r.saved;
    } catch (err) {
      reportError(err, "optimierung-lauf", { account: d.id });
      await prisma.optimizationAccount.update({ where: { id: d.id }, data: { lastRunAt: now, lastRunNote: `Fehler: ${msg(err).slice(0, 300)}` } }).catch(() => undefined);
    }
  }
  return out;
}

// ─── Freigabe ──────────────────────────────────────────────────────────

const actorName = (a?: AuditActor) => a?.email ?? a?.id ?? "Admin";

/** Geplante Maßnahmen freigeben (alle eines Kontos bzw. ausgewählte). Vorschläge → Aufgabe für Ole. */
export async function approveMeasures(input: { accountId: string; ids?: string[] }, actor?: AuditActor, deps = defaultOptimizationDeps(), now = new Date()): Promise<number> {
  const rows = await prisma.optimizationMeasure.findMany({
    where: { accountId: input.accountId, status: "geplant", ...(input.ids ? { id: { in: input.ids } } : {}) },
    include: { account: { include: { customer: { select: { salesContact: { select: { id: true } }, onboarding: { select: { salesContactId: true } } } } } } },
  });
  let n = 0;
  for (const m of rows) {
    const r = await prisma.optimizationMeasure.updateMany({ where: { id: m.id, status: "geplant" }, data: { status: "freigegeben", decidedAt: now, decidedBy: actorName(actor) } });
    if (!r.count) continue;
    n++;
    if (isSuggestion(m.kind)) {
      const contactId = m.account?.customer?.salesContact?.id ?? m.account?.customer?.onboarding?.salesContactId ?? null;
      await deps.task(contactId, `Optimierung ${m.account?.label ?? ""}: ${m.title}`, `${m.reason}\nNach dem Umsetzen im Protokoll „erledigt“ klicken: /admin/neu/leads/werbekonten/${m.accountId}`);
      await prisma.optimizationMeasure.update({ where: { id: m.id }, data: { result: "Aufgabe für Ole angelegt (Vorschlag, wird von Hand umgesetzt)" } });
    }
  }
  if (n) await audit("optimierung.freigabe", { entity: "OptimizationAccount", entityId: input.accountId, details: { count: n, ids: input.ids ?? "alle" }, actor }).catch(() => undefined);
  return n;
}

export async function rejectMeasure(id: string, actor?: AuditActor, note?: string | null, now = new Date()): Promise<boolean> {
  const r = await prisma.optimizationMeasure.updateMany({
    where: { id, status: { in: ["geplant", "freigegeben"] }, executedAt: null, OR: [{ result: null }, { result: { not: RUNNING } }] },
    data: { status: "abgelehnt", decidedAt: now, decidedBy: actorName(actor), ...(note?.trim() ? { result: `Abgelehnt: ${note.trim().slice(0, 300)}` } : {}) },
  });
  if (r.count) await audit("optimierung.abgelehnt", { entity: "OptimizationMeasure", entityId: id, actor }).catch(() => undefined);
  return r.count > 0;
}

/** Vorschlag an Ole wurde von Hand umgesetzt → ausgeführt (zählt fürs Protokoll). */
export async function markSuggestionDone(id: string, actor?: AuditActor, note?: string | null, now = new Date()): Promise<boolean> {
  const m = await prisma.optimizationMeasure.findUnique({ where: { id }, select: { kind: true, status: true } });
  if (!m || !isSuggestion(m.kind) || !["geplant", "freigegeben"].includes(m.status)) return false;
  await prisma.optimizationMeasure.update({
    where: { id },
    data: { status: "ausgefuehrt", executedAt: now, decidedAt: now, decidedBy: actorName(actor), result: note?.trim() ? `Von Hand umgesetzt: ${note.trim().slice(0, 300)}` : "Von Hand umgesetzt" },
  });
  await audit("optimierung.erledigt", { entity: "OptimizationMeasure", entityId: id, actor }).catch(() => undefined);
  return true;
}

export async function setAccountSettings(
  id: string,
  input: { autopilot: boolean | null; targetCpl: number | null; agreedDailyBudget: number | null; campaignKeyword: string | null },
  actor?: AuditActor,
): Promise<void> {
  await prisma.optimizationAccount.update({ where: { id }, data: input });
  await audit("optimierung.konto", { entity: "OptimizationAccount", entityId: id, details: input, actor }).catch(() => undefined);
}

// ─── Ausführung (nur Freigegebenes) ────────────────────────────────────

const EXECUTABLE: MeasureKind[] = ["anzeige_pausieren", "budget_umschichten", "motiv_erneuern"];

/** Eine freigegebene Maßnahme bei Meta umsetzen und das Ergebnis protokollieren. */
export async function executeMeasure(id: string, deps = defaultOptimizationDeps(), now = new Date()): Promise<{ status: string; result: string | null }> {
  const claimed = await prisma.optimizationMeasure.updateMany({
    where: {
      id,
      status: "freigegeben",
      kind: { in: EXECUTABLE },
      executedAt: null,
      OR: [{ result: null }, { result: RUNNING, updatedAt: { lt: new Date(now.getTime() - 30 * 60_000) } }],
    },
    data: { result: RUNNING },
  });
  const m = await prisma.optimizationMeasure.findUniqueOrThrow({ where: { id }, include: { account: true } });
  if (!claimed.count) return { status: m.status, result: m.result };
  const p = (m.params ?? {}) as Record<string, unknown>;
  const finish = async (status: "ausgefuehrt" | "fehlgeschlagen", result: string, extra: Prisma.OptimizationMeasureUpdateInput = {}) => {
    await prisma.optimizationMeasure.update({ where: { id }, data: { status, result: result.slice(0, 1000), executedAt: status === "ausgefuehrt" ? now : null, ...extra } });
    await audit(status === "ausgefuehrt" ? "optimierung.ausgefuehrt" : "optimierung.fehlgeschlagen", {
      entity: "OptimizationMeasure",
      entityId: id,
      customerId: m.customerId,
      details: { kind: m.kind, target: m.targetName ?? m.targetId, result: result.slice(0, 300) },
      actor: { role: "system" },
    }).catch(() => undefined);
    return { status, result };
  };
  try {
    if (!deps.hasToken()) throw new Error("META_ACCESS_TOKEN nicht gesetzt.");
    if (m.kind === "anzeige_pausieren") {
      return await finish("ausgefuehrt", await pauseAd(deps.meta, String(p.adId), String(p.adSetId)));
    }
    if (m.kind === "budget_umschichten") {
      const agreed = m.account?.agreedDailyBudget != null ? Number(m.account.agreedDailyBudget) : null;
      return await finish("ausgefuehrt", await moveBudget(deps.meta, p.from as BudgetMove, p.to as BudgetMove, agreed));
    }
    if (m.kind === "motiv_erneuern") {
      if (!m.customerId || !p.sourceRunId) return await finish("fehlgeschlagen", "Keine von den Kampagnen-Agenten angelegte Kampagne als Vorlage.");
      const r = await deps.refresh({
        sourceRunId: String(p.sourceRunId),
        customerId: m.customerId,
        campaignId: String(p.campaignId),
        adSetId: String(p.adSetId),
        fatigued: (p.fatigued as { adId: string; adName: string; adSetId: string; reasons: string[] }[] | undefined) ?? [],
      });
      if (r.status === "busy") {
        // Für den Kunden läuft gerade ein anderer Lauf: beim nächsten Cron erneut
        await prisma.optimizationMeasure.update({ where: { id }, data: { result: null } });
        return { status: "freigegeben", result: "wartet: anderer Kampagnen-Lauf aktiv" };
      }
      if (r.status === "built") return await finish("ausgefuehrt", r.note ?? "Neue Motive angelegt", { campaignRunId: r.runId ?? null });
      return await finish("fehlgeschlagen", r.status === "blocked" ? `Prüfung rot, nichts angelegt: ${r.note ?? ""}` : `Fehler: ${r.note ?? r.status}`, { campaignRunId: r.runId ?? null });
    }
    return await finish("fehlgeschlagen", `Art ${m.kind} kann nicht automatisch ausgeführt werden.`);
  } catch (err) {
    const text = msg(err);
    if (isAccessError(text) && m.account) {
      await taskOnce(deps, null, `Werbekonto ${m.account.label}: kein Zugriff für die Optimierung`, `Maßnahme „${m.title}“ konnte nicht umgesetzt werden: ${text.slice(0, 300)}\nOptimierung: /admin/neu/leads/werbekonten/${m.account.id}`);
    } else reportError(err, "optimierung-ausfuehren", { measure: id });
    return await finish("fehlgeschlagen", text);
  }
}

export async function executeApprovedMeasures(now = new Date(), deps = defaultOptimizationDeps(), opts: { max?: number } = {}): Promise<number> {
  const due = await prisma.optimizationMeasure.findMany({
    where: { status: "freigegeben", kind: { in: EXECUTABLE }, executedAt: null, OR: [{ result: null }, { result: RUNNING, updatedAt: { lt: new Date(now.getTime() - 30 * 60_000) } }] },
    orderBy: { decidedAt: "asc" },
    take: opts.max ?? 3,
    select: { id: true },
  });
  let n = 0;
  for (const d of due) if ((await executeMeasure(d.id, deps, now)).status === "ausgefuehrt") n++;
  return n;
}

// ─── Von Hand eintragen ────────────────────────────────────────────────

export type ManualInput = {
  customerId?: string | null;
  accountId?: string | null;
  topic: ManualTopic | string;
  title: string;
  reason?: string | null;
  executedAt: Date;
};

/** Maßnahme von Hand ins Protokoll (Status „ausgeführt“). */
export async function addManualMeasure(input: ManualInput, actor?: AuditActor, now = new Date()): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const title = input.title.trim();
  if (title.length < 3 || title.length > 200) return { ok: false, error: "Bitte kurz beschreiben, was gemacht wurde (3 bis 200 Zeichen)." };
  if (!isManualTopic(input.topic)) return { ok: false, error: "Bitte eine Art wählen." };
  if (Number.isNaN(input.executedAt.getTime())) return { ok: false, error: "Datum fehlt." };
  if (input.executedAt.getTime() > now.getTime() + DAY) return { ok: false, error: "Das Datum liegt in der Zukunft." };
  if (input.executedAt.getTime() < now.getTime() - 400 * DAY) return { ok: false, error: "Das Datum liegt zu weit zurück." };
  let accountId = input.accountId ?? null;
  let customerId = input.customerId ?? null;
  if (accountId) {
    const a = await prisma.optimizationAccount.findUnique({ where: { id: accountId }, select: { customerId: true } });
    if (!a) return { ok: false, error: "Werbekonto nicht gefunden." };
    customerId = a.customerId ?? customerId;
  } else if (customerId) {
    const a = await prisma.optimizationAccount.findUnique({ where: { customerId }, select: { id: true } });
    accountId = a?.id ?? null;
  } else return { ok: false, error: "Kunde bzw. Werbekonto fehlt." };
  const topicLabel = MANUAL_TOPICS.find((t) => t.key === input.topic)!.label;
  const row = await prisma.optimizationMeasure.create({
    data: {
      accountId,
      customerId,
      status: "ausgefuehrt",
      kind: "manuell",
      source: "manuell",
      targetType: "account",
      title,
      reason: input.reason?.trim().slice(0, 2000) || topicLabel,
      data: json({ topic: input.topic }),
      params: json({ adSetIds: [] }),
      plannedAt: input.executedAt,
      executedAt: input.executedAt,
      decidedAt: now,
      decidedBy: actorName(actor),
      createdBy: actorName(actor),
      result: "von Hand eingetragen",
    },
  });
  await audit("optimierung.manuell", { entity: "OptimizationMeasure", entityId: row.id, customerId, details: { title }, actor }).catch(() => undefined);
  return { ok: true, id: row.id };
}

// ─── Protokoll für den Monatsbericht (Teil A) ──────────────────────────

export type ExecutedMeasure = {
  id: string;
  executedAt: Date;
  kind: MeasureKind;
  source: "automatik" | "manuell";
  /** interner Titel (für Ole) */
  title: string;
  /** Begründung mit Datenpunkten (intern) */
  reason: string;
  /** verständlicher Satz für Kunden (Sie-Form, ohne Gedankenstriche) */
  reportText: string;
  targetName: string | null;
  result: string | null;
  account: { id: string; kind: "kunde" | "pool"; label: string } | null;
};

/**
 * Alle ausgeführten Maßnahmen eines Kunden im Zeitraum [from, to), älteste zuerst: eigenes
 * Werbekonto, von Hand eingetragene und (includePools, Standard) die der Pay-per-Lead-Pools,
 * aus denen der Kunde Leads bezieht.
 */
export async function listExecutedMeasures(customerId: string, from: Date, to: Date, opts: { includePools?: boolean } = {}): Promise<ExecutedMeasure[]> {
  const or: Prisma.OptimizationMeasureWhereInput[] = [{ customerId }];
  if (opts.includePools ?? true) {
    const subs = await prisma.leadSubscription.findMany({ where: { customerId }, select: { productKey: true }, distinct: ["productKey"] });
    const products = [...new Set(subs.map((s) => canonicalProductKey(s.productKey)))];
    if (products.length) or.push({ account: { kind: "pool", poolProduct: { in: products } } });
  }
  const rows = await prisma.optimizationMeasure.findMany({
    where: { status: "ausgefuehrt", executedAt: { gte: from, lt: to }, OR: or },
    orderBy: { executedAt: "asc" },
    include: { account: { select: { id: true, kind: true, label: true } } },
  });
  return rows.map((m) => ({
    id: m.id,
    executedAt: m.executedAt!,
    kind: m.kind as MeasureKind,
    source: m.source === "manuell" ? "manuell" : "automatik",
    title: m.title,
    reason: m.reason,
    reportText: reportText(m),
    targetName: m.targetName,
    result: m.result,
    account: m.account ? { id: m.account.id, kind: m.account.kind === "pool" ? "pool" : "kunde", label: m.account.label } : null,
  }));
}

export type StoredActivity = { eventTime: Date; eventType: string; translatedEventType: string | null; objectType: string | null; objectName: string | null; actorName: string | null; applicationName: string | null; adAccountId: string };

/** Meta-Änderungsprotokoll eines Kunden (eigenes Werbekonto) im Zeitraum [from, to). */
export async function listMetaActivities(customerId: string, from: Date, to: Date): Promise<StoredActivity[]> {
  return prisma.metaAdActivity.findMany({
    where: { customerId, eventTime: { gte: from, lt: to } },
    orderBy: { eventTime: "asc" },
    select: { eventTime: true, eventType: true, translatedEventType: true, objectType: true, objectName: true, actorName: true, applicationName: true, adAccountId: true },
  });
}

// ─── Meta-Änderungsprotokoll abrufen ───────────────────────────────────

/** Activities je Werbekonto holen und speichern (je Konto höchstens alle 24 h). */
export async function syncMetaActivities(now = new Date(), deps = defaultOptimizationDeps(), opts: { max?: number; accountId?: string; force?: boolean } = {}): Promise<{ accounts: number; stored: number; errors: string[] }> {
  const out = { accounts: 0, stored: 0, errors: [] as string[] };
  if (!deps.hasToken()) return out;
  const due = await prisma.optimizationAccount.findMany({
    where: {
      active: true,
      ...(opts.accountId ? { id: opts.accountId } : {}),
      ...(opts.force ? {} : { OR: [{ activitiesSyncedAt: null }, { activitiesSyncedAt: { lt: new Date(now.getTime() - DAY) } }] }),
    },
    orderBy: [{ activitiesSyncedAt: { sort: "asc", nulls: "first" } }],
    take: opts.max ?? 3,
  });
  const done = new Set<string>();
  for (const a of due) {
    const targets = a.kind === "kunde" ? (a.adAccountId ? [a.adAccountId] : []) : deps.agencyAccounts();
    const since = new Date(Math.max(now.getTime() - 35 * DAY, (a.activitiesSyncedAt?.getTime() ?? 0) - DAY));
    try {
      for (const acc of targets) {
        if (done.has(acc)) continue;
        done.add(acc);
        const rows = await fetchActivities(deps.meta, acc, since, now);
        const r = await prisma.metaAdActivity.createMany({
          data: rows
            .filter((x) => x.event_time && x.event_type)
            .map((x) => ({
              adAccountId: acc,
              customerId: a.kind === "kunde" ? a.customerId : null,
              eventTime: new Date(x.event_time),
              eventType: x.event_type,
              translatedEventType: x.translated_event_type ?? null,
              objectId: x.object_id ?? null,
              objectName: x.object_name?.slice(0, 300) ?? null,
              objectType: x.object_type ?? null,
              actorName: x.actor_name ?? null,
              applicationName: x.application_name ?? null,
              extraData: x.extra_data?.slice(0, 2000) ?? null,
              dedupeKey: `${acc}|${x.event_time}|${x.event_type}|${x.object_id ?? ""}`,
            })),
          skipDuplicates: true,
        });
        out.stored += r.count;
      }
      // Pools teilen sich die Agenturkonten: alle Pool-Konten zugleich als abgerufen markieren
      await prisma.optimizationAccount.updateMany({ where: a.kind === "pool" ? { kind: "pool" } : { id: a.id }, data: { activitiesSyncedAt: now } });
      out.accounts++;
    } catch (err) {
      const text = msg(err);
      out.errors.push(`${a.label}: ${text.slice(0, 200)}`);
      await prisma.optimizationAccount.update({ where: { id: a.id }, data: { activitiesSyncedAt: now } }).catch(() => undefined);
      if (isAccessError(text)) await taskOnce(deps, null, `Werbekonto ${a.label}: Meta-Änderungsprotokoll nicht lesbar`, `GET act_…/activities verweigert (Berechtigung ads_read bzw. ads_management auf dem Konto nötig): ${text.slice(0, 300)}\nOptimierung: /admin/neu/leads/werbekonten/${a.id}`);
      else reportError(err, "optimierung-activities", { account: a.id });
    }
  }
  return out;
}

// ─── Übersicht und Frühwarnung ─────────────────────────────────────────

export type OverviewRow = {
  id: string;
  kind: "kunde" | "pool";
  label: string;
  customerId: string | null;
  adAccountId: string | null;
  active: boolean;
  autopilot: boolean;
  modeFromAccount: boolean;
  lastMeasureAt: Date | null;
  stale: boolean;
  planned: number;
  approved: number;
  lastRunAt: Date | null;
  lastRunNote: string | null;
};

async function lastExecutedByAccount(): Promise<{ byAccount: Map<string, Date>; byCustomer: Map<string, Date> }> {
  const [acc, cust] = await Promise.all([
    prisma.optimizationMeasure.groupBy({ by: ["accountId"], where: { status: "ausgefuehrt", accountId: { not: null } }, _max: { executedAt: true } }),
    prisma.optimizationMeasure.groupBy({ by: ["customerId"], where: { status: "ausgefuehrt", customerId: { not: null } }, _max: { executedAt: true } }),
  ]);
  return {
    byAccount: new Map(acc.filter((r) => r.accountId && r._max.executedAt).map((r) => [r.accountId!, r._max.executedAt!])),
    byCustomer: new Map(cust.filter((r) => r.customerId && r._max.executedAt).map((r) => [r.customerId!, r._max.executedAt!])),
  };
}

export async function loadOptimizationOverview(now = new Date()): Promise<{ settings: OptimizationSettingsView; rows: OverviewRow[] }> {
  const [settings, accounts, last, counts] = await Promise.all([
    loadOptimizationSettings(),
    prisma.optimizationAccount.findMany({ orderBy: [{ active: "desc" }, { kind: "asc" }, { label: "asc" }] }),
    lastExecutedByAccount(),
    prisma.optimizationMeasure.groupBy({ by: ["accountId", "status"], where: { status: { in: ["geplant", "freigegeben"] }, accountId: { not: null } }, _count: { _all: true } }),
  ]);
  const count = (id: string, status: string) => counts.find((c) => c.accountId === id && c.status === status)?._count._all ?? 0;
  const rows = accounts.map((a) => {
    const dates = [last.byAccount.get(a.id), a.customerId ? last.byCustomer.get(a.customerId) : undefined].filter((d): d is Date => !!d);
    const lastMeasureAt = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
    return {
      id: a.id,
      kind: a.kind === "pool" ? ("pool" as const) : ("kunde" as const),
      label: a.label,
      customerId: a.customerId,
      adAccountId: a.adAccountId,
      active: a.active,
      autopilot: isAutopilot(a, settings),
      modeFromAccount: a.autopilot != null,
      lastMeasureAt,
      stale: a.active && isStale(lastMeasureAt, now),
      planned: count(a.id, "geplant"),
      approved: count(a.id, "freigegeben"),
      lastRunAt: a.lastRunAt,
      lastRunNote: a.lastRunNote,
    };
  });
  return { settings, rows };
}

/**
 * Frühwarnung ab dem 20. (Berlin): Konto ohne ausgeführte Maßnahme im laufenden Monat →
 * Aufgabe „Kunde X: diesen Monat noch nichts optimiert“ (je Konto und Monat höchstens einmal,
 * auch wenn die Aufgabe schon erledigt wurde). Konten ohne laufende Anzeigen bleiben außen vor.
 */
export async function runEarlyWarning(now = new Date(), deps = defaultOptimizationDeps()): Promise<number> {
  if (berlinDay(now) < 20) return 0;
  const month = monthRange(now);
  const accounts = await prisma.optimizationAccount.findMany({
    where: { active: true, OR: [{ lastRunAds: null }, { lastRunAds: { gt: 0 } }] },
    include: { customer: { select: { name: true, salesContact: { select: { id: true } }, onboarding: { select: { salesContactId: true } }, pauses: { where: { status: "active" }, select: { id: true }, take: 1 } } } },
  });
  let n = 0;
  for (const a of accounts) {
    if (a.customer?.pauses.length) continue;
    const scope: Prisma.OptimizationMeasureWhereInput = a.customerId ? { OR: [{ accountId: a.id }, { customerId: a.customerId }] } : { accountId: a.id };
    const done = await prisma.optimizationMeasure.count({ where: { ...scope, status: "ausgefuehrt", executedAt: { gte: month.start, lt: month.end } } });
    if (done) continue;
    const title = earlyWarningTitle(a.kind === "kunde" ? `Kunde ${a.customer?.name ?? a.label}` : a.label);
    const exists = await prisma.salesTask.findFirst({ where: { title, createdAt: { gte: month.start } }, select: { id: true } });
    if (exists) continue;
    const planned = await prisma.optimizationMeasure.count({ where: { accountId: a.id, status: { in: ["geplant", "freigegeben"] } } });
    const contactId = a.customer?.salesContact?.id ?? a.customer?.onboarding?.salesContactId ?? null;
    await deps.task(
      contactId,
      title,
      `${planned ? `${planned} geplante Maßnahme(n) warten auf Freigabe bzw. Ausführung.` : "Keine geplante Maßnahme."} Freigeben oder von Hand eintragen: /admin/neu/leads/werbekonten/${a.id}`,
    );
    n++;
  }
  return n;
}

// ─── Cron ──────────────────────────────────────────────────────────────

/** Aus dem zentralen Cron (alle 5 Minuten): ausführen, wöchentlich planen, Protokoll holen, Frühwarnung. */
export async function runOptimizationCron(now = new Date(), deps = defaultOptimizationDeps()): Promise<Record<string, unknown>> {
  const settings = await loadOptimizationSettings();
  // Freigegebenes immer ausführen (auch wenn der Lauf ausgeschaltet ist: Ole hat entschieden)
  const executed = await executeApprovedMeasures(now, deps, { max: 3 });
  if (!settings.enabled) return { executed, enabled: false };
  // Einmal je Stunde: Konten abgleichen und Frühwarnung prüfen (beides idempotent)
  const hourly = now.getUTCMinutes() < 5;
  const weekly = await runWeeklyOptimization(now, deps, { maxPerRun: 2, sync: hourly });
  const activities = await syncMetaActivities(now, deps, { max: 2 });
  const warned = hourly ? await runEarlyWarning(now, deps) : 0;
  return { executed, weekly, activities: activities.stored, warned };
}

// ─── Admin: Detail eines Kontos ────────────────────────────────────────

export async function loadAccountDetail(id: string, now = new Date()) {
  const [settings, a] = await Promise.all([loadOptimizationSettings(), prisma.optimizationAccount.findUnique({ where: { id }, include: { customer: { select: { id: true, name: true } } } })]);
  if (!a) return null;
  const measureScope: Prisma.OptimizationMeasureWhereInput = a.customerId ? { OR: [{ accountId: a.id }, { customerId: a.customerId }] } : { accountId: a.id };
  const actScope: Prisma.MetaAdActivityWhereInput = a.kind === "kunde" ? { customerId: a.customerId } : { customerId: null };
  const [measures, activities] = await Promise.all([
    prisma.optimizationMeasure.findMany({ where: measureScope, orderBy: [{ plannedAt: "desc" }], take: 150 }),
    prisma.metaAdActivity.findMany({ where: { ...actScope, eventTime: { gte: new Date(now.getTime() - 30 * DAY) } }, orderBy: { eventTime: "desc" }, take: 100 }),
  ]);
  return {
    account: { ...a, targetCpl: num(a.targetCpl), agreedDailyBudget: num(a.agreedDailyBudget) },
    settings,
    autopilot: isAutopilot(a, settings),
    measures,
    activities,
  };
}
