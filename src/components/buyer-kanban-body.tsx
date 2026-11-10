// Pipeline-Board (Daten + Board) – genutzt von /buyer/kanban und von
// „Kontakte“ → Pipeline der neuen Oberfläche.

import { hasWhatsAppInbox } from "@/lib/whatsapp/access";
import { KanbanBoard, type KanbanLead } from "@/components/kanban-board";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { needsNextStep } from "@/lib/lead-next-step";
import { pipelinePhasesFor } from "@/lib/products";
import { nowMs } from "@/lib/now";

export async function BuyerKanbanBody({
  customerId,
  scope,
  range,
  rangeKey,
  detailBase,
  detailSuffix,
  minBoardWidth,
}: {
  detailBase?: string;
  detailSuffix?: string;
  minBoardWidth?: number;
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
        detailBase={detailBase}
        detailSuffix={detailSuffix}
        minBoardWidth={minBoardWidth}
      />
    </div>
  );
}
