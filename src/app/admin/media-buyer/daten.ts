import { listPoolsForAdmin } from "@/lib/media-buyer";
import { listAdspendAttribution } from "@/lib/ad-spend";
import { prisma } from "@/lib/prisma";
import type { ActionLogRow, PoolDetailRow, TopStats } from "./media-buyer-admin";

// Daten des Media Buyers (Pools, Verlauf, Adspend-Zuordnung): gemeinsam für /admin/media-buyer und den neuen
// Admin (/admin/neu/leads/werbekonten?ansicht=pools).

function decToNum(v: unknown): number | null {
  if (v == null) return null;
  const obj = v as { toNumber?: () => number };
  if (typeof obj.toNumber === "function") return obj.toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const timeFmt = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export async function loadMediaBuyer() {
  const [pools, actions, attribution] = await Promise.all([
    listPoolsForAdmin(),
    prisma.mediaBuyerAction.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        poolKey: true,
        poolLabel: true,
        action: true,
        reason: true,
        leadsMtd: true,
        leadsGoal: true,
        projected: true,
        prevBudget: true,
        newBudget: true,
        dryRun: true,
        createdAt: true,
      },
    }),
    listAdspendAttribution(),
  ]);

  const poolRows: PoolDetailRow[] = pools.map((p) => ({
    key: p.key,
    label: p.label,
    kind: p.kind,
    product: p.product,
    region: p.region,
    goal: p.goal,
    leadsMtd: p.leadsMtd,
    projected: p.projected,
    daysElapsed: p.daysElapsed,
    daysTotal: p.daysTotal,
    customerCount: p.customerCount,
    autopilot: p.autopilot,
    maxDailyBudget: p.maxDailyBudget,
    outbrainMaxDailyBudget: p.outbrainMaxDailyBudget,
    tiktokMaxDailyBudget: p.tiktokMaxDailyBudget,
    googleMaxDailyBudget: p.googleMaxDailyBudget,
    campaignKeyword: p.campaignKeyword,
    outbrainCampaignKeyword: p.outbrainCampaignKeyword,
    tiktokCampaignKeyword: p.tiktokCampaignKeyword,
    googleCampaignKeyword: p.googleCampaignKeyword,
    cpl: p.cpl,
    metaLeadsMtd: p.metaLeadsMtd,
    metaSpendMtd: p.metaSpendMtd,
    metaCpl: p.metaCpl,
    outbrainLeadsMtd: p.outbrainLeadsMtd,
    outbrainSpendMtd: p.outbrainSpendMtd,
    outbrainCpl: p.outbrainCpl,
    tiktokLeadsMtd: p.tiktokLeadsMtd,
    tiktokSpendMtd: p.tiktokSpendMtd,
    tiktokCpl: p.tiktokCpl,
    googleLeadsMtd: p.googleLeadsMtd,
    googleSpendMtd: p.googleSpendMtd,
    googleCpl: p.googleCpl,
    latestAction: p.latestAction,
    latestReason: p.latestReason,
  }));

  const log: ActionLogRow[] = actions.map((a) => ({
    id: a.id,
    poolKey: a.poolKey,
    poolLabel: a.poolLabel,
    action: a.action,
    reason: a.reason,
    leadsMtd: a.leadsMtd,
    leadsGoal: a.leadsGoal,
    projected: a.projected,
    prevBudget: decToNum(a.prevBudget),
    newBudget: decToNum(a.newBudget),
    dryRun: a.dryRun,
    createdAt: timeFmt.format(a.createdAt),
  }));

  // Aggregate Top-Stats über alle Pools.
  const sumGoal = poolRows.reduce((s, p) => s + p.goal, 0);
  const sumLeads = poolRows.reduce((s, p) => s + p.leadsMtd, 0);
  const sumProjected = poolRows.reduce((s, p) => s + p.projected, 0);
  const autopilotOn = poolRows.filter((p) => p.autopilot).length;
  const daysElapsed = poolRows[0]?.daysElapsed ?? 1;
  const daysTotal = poolRows[0]?.daysTotal ?? 30;

  const top: TopStats = {
    goal: sumGoal,
    leadsMtd: sumLeads,
    projected: sumProjected,
    autopilotOn,
    autopilotTotal: poolRows.length,
    daysElapsed,
    daysTotal,
    monthLabel: new Intl.DateTimeFormat("de-DE", {
      month: "long",
      year: "numeric",
    }).format(new Date()),
  };

  return { pools: poolRows, log, top, attribution };
}
