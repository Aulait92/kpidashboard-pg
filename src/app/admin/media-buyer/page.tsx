import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { listPoolsForAdmin } from "@/lib/media-buyer";
import { prisma } from "@/lib/prisma";
import {
  MediaBuyerLayout,
  type ActionLogRow,
  type PoolDetailRow,
  type TopStats,
} from "./media-buyer-admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Media Buyer | KPI-Dashboard",
};

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

export default async function MediaBuyerPage() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/login");
  }

  const [pools, actions] = await Promise.all([
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
    campaignKeyword: p.campaignKeyword,
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

  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-8">
      <header className="mb-4">
        <Link
          href="/"
          className="text-xs text-[color:var(--brand)] hover:underline"
        >
          ← zum Dashboard
        </Link>
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
          Media Buyer
        </h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          {top.monthLabel} · Tag {top.daysElapsed}/{top.daysTotal} ·{" "}
          {Math.max(0, top.daysTotal - top.daysElapsed)} Tage übrig
        </p>
      </header>

      <MediaBuyerLayout pools={poolRows} log={log} top={top} />
    </main>
  );
}
