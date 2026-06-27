import { redirect } from "next/navigation";
import { AdminTabs } from "@/components/admin-tabs";
import { CrmFilterBar } from "@/components/crm-filter-bar";
import {
  SalesKanbanBoard,
  type KanbanDeal,
} from "@/components/sales-kanban-board";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isStaleDeal, priorityScore } from "@/lib/sales-phases";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "CRM | KPI-Dashboard",
};

type SearchParams = Promise<{
  owner?: string;
  q?: string;
  closed?: string;
}>;

export default async function AdminCrmPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/login");
  }

  const sp = await searchParams;
  const queryRaw = sp.q?.trim() ?? "";
  const includeClosed = sp.closed === "1";

  // Where-Clause aus den Filter-Params. Such-Match nutzt Postgres'
  // case-insensitive contains auf Name ODER Firma ODER Mail.
  const where = {
    ...(queryRaw
      ? {
          OR: [
            { name: { contains: queryRaw, mode: "insensitive" as const } },
            { company: { contains: queryRaw, mode: "insensitive" as const } },
            { email: { contains: queryRaw, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(includeClosed ? {} : { AND: [{ wonAt: null }, { lostAt: null }] }),
  };

  // Nächste anstehende Activity je Deal (scheduledFor > jetzt) für die
  // "📅"-Anzeige + Urgency-Boost im Priority-Score. Letzte Activity
  // (egal welcher Art) für die Stale-Detektion. Beides per groupBy in
  // zwei zusätzlichen Queries — günstiger als activities pro Deal mit
  // include zu laden.
  const now = new Date();
  const rows = await prisma.deal.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 2000,
    select: {
      id: true,
      name: true,
      company: true,
      product: true,
      value: true,
      status: true,
      createdAt: true,
    },
  });
  const dealIds = rows.map((d) => d.id);
  const [nextAgg, lastAgg] = await Promise.all([
    dealIds.length === 0
      ? Promise.resolve([])
      : prisma.dealActivity.groupBy({
          by: ["dealId"],
          where: { dealId: { in: dealIds }, scheduledFor: { gt: now } },
          _min: { scheduledFor: true },
        }),
    dealIds.length === 0
      ? Promise.resolve([])
      : prisma.dealActivity.groupBy({
          by: ["dealId"],
          where: { dealId: { in: dealIds } },
          _max: { createdAt: true },
        }),
  ]);
  const nextByDeal = new Map<string, Date | null>(
    nextAgg.map((row) => [row.dealId, row._min.scheduledFor ?? null]),
  );
  const lastByDeal = new Map<string, Date | null>(
    lastAgg.map((row) => [row.dealId, row._max.createdAt ?? null]),
  );

  const deals: KanbanDeal[] = rows.map((d) => {
    const nextActivityAt = nextByDeal.get(d.id) ?? null;
    const lastActivityAt = lastByDeal.get(d.id) ?? null;
    const value = d.value != null ? Number(d.value) : null;
    return {
      id: d.id,
      name: d.name,
      company: d.company,
      product: d.product,
      value,
      status: d.status,
      createdAt: d.createdAt,
      nextActivityAt,
      priorityScore: priorityScore({
        value,
        status: d.status,
        nextActivityAt,
        now,
      }),
      isStale: isStaleDeal({
        status: d.status,
        nextActivityAt,
        lastActivityAt,
        createdAt: d.createdAt,
        now,
      }),
    };
  });

  // React-Key fürs Kanban-Board: bei Filter-Wechsel remounten, damit der
  // lokale Drag-State + optimistische Updates sauber zurückgesetzt werden.
  const boardKey = `${queryRaw}|${includeClosed ? "1" : "0"}`;

  return (
    <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">CRM</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Unsere eigene Sales-Pipeline aus der Airtable-„Deal-Pipeline".
            Karten ziehen → Status flippt + status_change-Activity wird gelogt.
            Klick auf eine Karte öffnet die Detail-Ansicht mit Timeline.
          </p>
        </div>
        <CrmFilterBar currentQuery={queryRaw} showClosed={includeClosed} />
      </header>

      <AdminTabs />

      <div className="mt-6">
        <SalesKanbanBoard key={boardKey} deals={deals} />
      </div>
    </main>
  );
}
