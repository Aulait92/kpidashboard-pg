import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/live-refresh";
import { BuyerFilterBar } from "@/components/buyer-filter-bar";
import { PageHeader } from "@/components/buyer-shell";
import { hasWhatsAppInbox } from "@/lib/whatsapp/access";
import {
  KanbanBoard,
  type KanbanLead,
} from "@/components/kanban-board";
import { LiveUpdated } from "@/components/live-updated";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { getBuyerContext } from "@/lib/buyer-context";
import type { Prisma } from "@/generated/prisma/client";
import { leadScope } from "@/lib/team";
import { parseRangeFromSearchParams } from "@/lib/date-ranges";
import { prisma } from "@/lib/prisma";
import { needsNextStep } from "@/lib/lead-next-step";
import { pipelinePhasesFor } from "@/lib/products";
import { nowMs } from "@/lib/now";

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
  const session = await getBuyerContext();
  if (!session) {
    redirect("/login");
  }

  const sp = await searchParams;
  const { key: rangeKey, range } = parseRangeFromSearchParams(sp);
  const renderedAt = nowMs();


  return (
    <PullToRefresh>
      <LiveRefresh />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          title="Pipeline"
          subtitle={
            <>
              Aktualisiert <LiveUpdated since={renderedAt} />
            </>
          }
          actions={
            <BuyerFilterBar
              currentRange={rangeKey}
              customFrom={sp.from}
              customTo={sp.to}
            />
          }
        />

        <Suspense
          fallback={
            <div className="mt-6 text-sm text-[color:var(--muted)]">
              Lade Kanban…
            </div>
          }
        >
          <KanbanBody
            customerId={session.customerId}
            scope={leadScope(session)}
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
  scope,
  range,
  rangeKey,
}: {
  customerId: string;
  scope: Prisma.LeadWhereInput;
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
      ...scope,
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
      followUpAt: true,
      statusChangedAt: true,
      closedAt: true,
      erasedAt: true,
      appointments: {
        where: { status: "booked", startsAt: { gt: new Date() } },
        orderBy: { startsAt: "asc" },
        take: 1,
        select: { startsAt: true, mode: true },
      },
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
      followUpAt: l.followUpAt ? l.followUpAt.toISOString() : null,
      appointment: l.appointments[0]
        ? { startsAt: l.appointments[0].startsAt.toISOString(), mode: l.appointments[0].mode }
        : null,
      daysInPhase: Math.floor((nowMs() - l.statusChangedAt.getTime()) / 86_400_000),
      noNextStep: needsNextStep({ status: l.status, closedAt: l.closedAt, erasedAt: l.erasedAt, followUpAt: l.followUpAt, hasUpcomingAppointment: l.appointments.length > 0 }),
    }));

  return (
    <div>
      <KanbanBoard
        key={rangeKey}
        leads={leads}
        phases={pipelinePhasesFor(await hasWhatsAppInbox(customerId))}
      />
    </div>
  );
}
