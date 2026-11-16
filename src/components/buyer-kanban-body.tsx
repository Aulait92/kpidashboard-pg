// Pipeline-Board (Daten + Board) – genutzt von /buyer/kanban und von
// „Kontakte“ → Pipeline der neuen Oberfläche.

import { hasWhatsAppInbox } from "@/lib/whatsapp/access";
import { KanbanBoard, type KanbanLead } from "@/components/kanban-board";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { loadNextStepFlags, stateFor } from "@/lib/lead-next-step-server";
import { pipelinePhasesFor } from "@/lib/products";
import { nowMs } from "@/lib/now";
import { formatEUR } from "@/lib/format";
import { contractProvision } from "@/lib/provision";
import { loadCustomerProvision } from "@/lib/provision-server";
import { contractSummary } from "@/lib/vertraege";
import { keinWhatsAppIds } from "@/lib/kein-whatsapp-kennzeichen-server";

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
  const { rates } = await loadCustomerProvision(customerId);
  // Abschluss-Karten: Provision über alle aktiven Verträge (Cross-Selling) mit der Rate ihrer Sparte
  const contractInfo = (cs: { sparte: string; premium: unknown; provisionValue: unknown; termYears?: unknown; customerAge?: unknown; endAge?: unknown; beitragssumme?: unknown }[]) => {
    if (!cs.length) return {};
    const ps = cs.map((c) => contractProvision(c, rates));
    const sum = ps.reduce((n, p) => n + p.firstYear, 0);
    const label = cs.length === 1 ? contractSummary(cs[0], rates) : `${cs.length} Verträge · Provision ≈ ${formatEUR(sum)}`;
    return { contractProvision: sum, contractLabel: label };
  };
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
      phone: true,
      source: true,
      status: true,
      outreachStatus: true,
      waUnavailableAt: true,
      closeValue: true,
      followUpAt: true,
      statusChangedAt: true,
      closedAt: true,
      erasedAt: true,
      stornoState: true,
      contracts: { where: { status: "aktiv" }, select: { sparte: true, premium: true, provisionValue: true, termYears: true, customerAge: true, endAge: true, beitragssumme: true } },
      appointments: {
        where: { status: "booked", startsAt: { gt: new Date() } },
        orderBy: { startsAt: "asc" },
        take: 1,
        select: { startsAt: true, mode: true },
      },
    },
  });

  // Nächster Schritt: gleiche Regel wie Liste und „Heute“ (Termin, Wiedervorlage, Bot-Gespräch)
  const [flags, noWhatsApp] = await Promise.all([loadNextStepFlags(leadRows.map((l) => l.id)), keinWhatsAppIds(leadRows)]);

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
      noNextStep: ["missing", "result_missing"].includes(stateFor(l, flags)),
      resultMissing: stateFor(l, flags) === "result_missing",
      ...contractInfo(l.contracts),
      ...(noWhatsApp.has(l.id) ? { phone: l.phone, noWhatsApp: true } : {}),
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
