import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { BuyerFilterBar } from "@/components/buyer-filter-bar";
import { BuyerTabs } from "@/components/buyer-tabs";
import {
  KanbanBoard,
  type KanbanLead,
} from "@/components/kanban-board";
import { LiveUpdated } from "@/components/live-updated";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { logoutAction } from "@/app/login/actions";
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
  title: "Kanban | performancegrowth",
};

export default async function BuyerKanbanPage({
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
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-8 sm:px-6 lg:px-8">
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
              Lade Kanban…
            </div>
          }
        >
          <KanbanBody
            customerId={session.customerId}
            range={range}
            rangeKey={`${range.from.toISOString()}-${range.to.toISOString()}`}
          />
        </Suspense>
      </main>
    </PullToRefresh>
  );
}

async function KanbanBody({
  customerId,
  range,
  rangeKey,
}: {
  customerId: string;
  range: { from: Date; to: Date };
  // ISO-Range als React-Key-Stabilizer für die KanbanBoard. Wechselt der
  // Buyer den Zeitraum, ändert sich der Key → KanbanBoard remountet,
  // der interne useState(leads) wird mit der neuen Prop initialisiert.
  // Sonst hält Next.js die Component beim Search-Param-Wechsel
  // gemountet und der lokale State zeigt veraltete Leads.
  rangeKey: string;
}) {
  const leadRows = await prisma.lead.findMany({
    where: {
      customerId,
      createdAt: { gte: range.from, lte: range.to },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      createdAt: true,
      name: true,
      source: true,
      status: true,
      closeValue: true,
    },
  });

  // Storno-Leads werden im Pipeline-Board nicht angezeigt — der Storno
  // läuft über den dedizierten StornoDialog im Leads-Tab oder Lead-Detail.
  // Filter case-insensitive in JS, weil Prismas `not: { startsWith }`
  // keinen `mode`-Parameter akzeptiert.
  const leads: KanbanLead[] = leadRows
    .filter((l) => !l.status || !l.status.toLowerCase().startsWith("storno"))
    .map((l) => ({
      id: l.id,
      name: l.name,
      source: l.source,
      status: l.status,
      createdAt: l.createdAt,
      closeValue: l.closeValue != null ? Number(l.closeValue) : null,
    }));

  return (
    <div className="mt-6">
      <KanbanBoard key={rangeKey} leads={leads} />
    </div>
  );
}
