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
  };

  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/"
            className="text-xs text-[color:var(--brand)] hover:underline"
          >
            ← zum Dashboard
          </Link>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
            Media Buyer
          </h1>
        </div>
        <TopStatsBar stats={top} />
      </header>

      <MediaBuyerLayout pools={poolRows} log={log} />
    </main>
  );
}

function TopStatsBar({ stats }: { stats: TopStats }) {
  const ratio = stats.goal > 0 ? stats.leadsMtd / stats.goal : 0;
  const projectedRatio = stats.goal > 0 ? stats.projected / stats.goal : 0;
  const daysLeft = Math.max(0, stats.daysTotal - stats.daysElapsed);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-2 text-sm">
      <Stat label="Ziel" value={String(stats.goal)} />
      <Stat
        label="Ist"
        value={String(stats.leadsMtd)}
        sub={stats.goal > 0 ? pct(ratio) : ""}
      />
      <Stat
        label="Prognose"
        value={pct(projectedRatio)}
        valueClass={
          projectedRatio >= 0.98
            ? "text-emerald-600"
            : projectedRatio >= 0.85
              ? "text-amber-600"
              : "text-rose-600"
        }
      />
      <Stat
        label="Autopilot"
        value={`${stats.autopilotOn}/${stats.autopilotTotal}`}
      />
      <div className="border-l border-[color:var(--border)] pl-6 text-xs text-[color:var(--muted)]">
        Tag {stats.daysElapsed}/{stats.daysTotal} · {daysLeft} übrig
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
        {label}
      </span>
      <span className={`text-xl font-bold tabular-nums ${valueClass ?? ""}`}>
        {value}
        {sub ? (
          <span className="ml-1 text-xs font-medium text-[color:var(--muted)]">
            {sub}
          </span>
        ) : null}
      </span>
    </div>
  );
}
