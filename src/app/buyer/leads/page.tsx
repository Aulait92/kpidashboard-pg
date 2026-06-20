import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { BuyerFilterBar } from "@/components/buyer-filter-bar";
import {
  BuyerLeadsTable,
  type BuyerLeadRow,
} from "@/components/buyer-leads-table";
import { BuyerTabs } from "@/components/buyer-tabs";
import { LiveUpdated } from "@/components/live-updated";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { logoutAction } from "@/app/login/actions";
import { getStornogruendePerLead } from "@/app/buyer/actions";
import { getCurrentSession } from "@/lib/auth";
import { parseRangeFromSearchParams } from "@/lib/date-ranges";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

type SearchParams = Promise<{
  range?: string;
  from?: string;
  to?: string;
}>;

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Leads | performancegrowth",
};

export default async function BuyerLeadsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getCurrentSession();
  if (!session || session.role !== "BUYER" || !session.customerId) {
    redirect("/login");
  }

  const sp = await searchParams;
  const { key: rangeKey, range } = parseRangeFromSearchParams(sp);
  const renderedAt = Date.now();

  const customer = await prisma.customer.findUnique({
    where: { id: session.customerId },
    select: { name: true },
  });

  return (
    <PullToRefresh>
      <AutoRefresh />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--brand-soft)] px-3 py-1 text-xs font-medium text-[color:var(--brand-dark)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--brand)]" />
              Live · aktualisiert <LiveUpdated since={renderedAt} />
            </span>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Hallo,{" "}
              <span className="text-[color:var(--brand)]">
                {customer?.name ?? session.email}
              </span>
              .
            </h1>
            <p className="mt-2 text-sm text-[color:var(--muted)]">
              Zeitraum: {formatDate(range.from)} – {formatDate(range.to)}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-2">
            <BuyerFilterBar
              currentRange={rangeKey}
              customFrom={sp.from}
              customTo={sp.to}
            />
            <form action={logoutAction}>
              <button
                type="submit"
                aria-label="Abmelden"
                title="Abmelden"
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm transition hover:border-[color:var(--brand)] sm:min-h-0 sm:py-1.5"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Abmelden</span>
              </button>
            </form>
          </div>
        </header>

        <BuyerTabs />

        <Suspense
          fallback={
            <div className="mt-6 text-sm text-[color:var(--muted)]">
              Lade Leads…
            </div>
          }
        >
          <LeadsBody
            customerId={session.customerId}
            range={range}
          />
        </Suspense>
      </main>
    </PullToRefresh>
  );
}

async function LeadsBody({
  customerId,
  range,
}: {
  customerId: string;
  range: { from: Date; to: Date };
}) {
  const leadRows = await prisma.lead.findMany({
    where: {
      customerId,
      createdAt: { gte: range.from, lte: range.to },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      createdAt: true,
      name: true,
      source: true,
      status: true,
      reached: true,
      closedAt: true,
      revenues: { select: { amount: true }, take: 1 },
    },
  });

  // Storno-Optionen vorab live aus Airtable laden (Bezug → erlaubte
  // Stornogründe), damit das Storno-Modal beim Klick ohne Latenz das
  // Dropdown füllt.
  const stornoOptions = await getStornogruendePerLead(leadRows.map((l) => l.id));

  const leads: BuyerLeadRow[] = leadRows.map((l) => ({
    id: l.id,
    createdAt: l.createdAt,
    name: l.name,
    source: l.source,
    status: l.status,
    reached: l.reached,
    closedAt: l.closedAt,
    revenue:
      l.revenues[0]?.amount != null ? Number(l.revenues[0].amount) : 0,
    stornoOptions: stornoOptions.get(l.id) ?? [],
  }));

  return (
    <div className="mt-6">
      <BuyerLeadsTable leads={leads} />
    </div>
  );
}
