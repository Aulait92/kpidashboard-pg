import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  MediaBuyerAdmin,
  type ActionLogRow,
  type CustomerSetting,
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

  const [customers, actions] = await Promise.all([
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        monthlyLeadGoal: true,
        autopilot: true,
        campaignKeyword: true,
        maxDailyBudget: true,
      },
    }),
    prisma.mediaBuyerAction.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        action: true,
        reason: true,
        leadsMtd: true,
        leadsGoal: true,
        projected: true,
        prevBudget: true,
        newBudget: true,
        dryRun: true,
        createdAt: true,
        customer: { select: { name: true } },
      },
    }),
  ]);

  const customerSettings: CustomerSetting[] = customers.map((c) => ({
    id: c.id,
    name: c.name,
    monthlyLeadGoal: c.monthlyLeadGoal,
    autopilot: c.autopilot,
    campaignKeyword: c.campaignKeyword,
    maxDailyBudget: decToNum(c.maxDailyBudget),
  }));

  const log: ActionLogRow[] = actions.map((a) => ({
    id: a.id,
    customerName: a.customer.name,
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

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <Link
          href="/"
          className="text-xs text-[color:var(--brand)] hover:underline"
        >
          ← zum Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          Media Buyer
        </h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Automatische Budget-Steuerung pro Kunde: legt das gewünschte
          Lead-Ziel fest und regelt die Meta-Kampagnen so, dass zum Monatsende
          möglichst 100 % der Leads geliefert sind. Nur Kunden mit aktivem
          <strong> Autopilot</strong> und gesetztem Lead-Ziel werden gesteuert.
        </p>
      </header>

      <MediaBuyerAdmin customers={customerSettings} log={log} />
    </main>
  );
}
