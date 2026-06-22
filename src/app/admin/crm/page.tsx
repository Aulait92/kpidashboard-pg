import { redirect } from "next/navigation";
import { AdminTabs } from "@/components/admin-tabs";
import {
  SalesKanbanBoard,
  type KanbanDeal,
} from "@/components/sales-kanban-board";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "CRM | KPI-Dashboard",
};

export default async function AdminCrmPage() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/login");
  }

  const rows = await prisma.deal.findMany({
    orderBy: { updatedAt: "desc" },
    take: 500,
    select: {
      id: true,
      name: true,
      company: true,
      owner: true,
      value: true,
      status: true,
      createdAt: true,
      activities: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  const deals: KanbanDeal[] = rows.map((d) => ({
    id: d.id,
    name: d.name,
    company: d.company,
    owner: d.owner,
    value: d.value != null ? Number(d.value) : null,
    status: d.status,
    createdAt: d.createdAt,
    lastActivityAt: d.activities[0]?.createdAt ?? null,
  }));

  return (
    <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">CRM</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Unsere eigene Sales-Pipeline aus der Airtable-„Deal-Pipeline".
          Karten ziehen → Status flippt + status_change-Activity wird gelogt.
          Klick auf eine Karte öffnet die Detail-Ansicht mit Timeline.
        </p>
      </header>

      <AdminTabs />

      <div className="mt-6">
        <SalesKanbanBoard deals={deals} />
      </div>
    </main>
  );
}
