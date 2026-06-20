"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLeadStatusAction } from "@/app/buyer/actions";
import { displayProduct, type LeadStatus } from "@/lib/products";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type KanbanLead = {
  id: string;
  name: string | null;
  source: string | null;
  status: string | null;
  createdAt: Date;
};

// Spalten-Design: nicht 1:1 pro Status, sondern in funktionalen Phasen
// gruppiert. Innerhalb einer Gruppe behält jede Karte ihren konkreten
// Sub-Status (siehe statusBadge), beim Drop von außerhalb wird auf den
// Einstiegs-Status der Gruppe gesetzt.
type ColumnDef = {
  key: string;
  label: string;
  statuses: LeadStatus[];      // alle Status, die in diese Spalte gehören
  defaultStatus: LeadStatus;   // Status beim Drop AUS EINER ANDEREN Spalte
  accent: string;              // top-border Akzentfarbe
};

const COLUMNS: ColumnDef[] = [
  {
    key: "neu",
    label: "Neuer Lead",
    statuses: ["Neuer Lead"],
    defaultStatus: "Neuer Lead",
    accent: "border-t-zinc-400",
  },
  {
    key: "nicht-erreicht",
    label: "Nicht erreicht",
    statuses: ["Nicht erreicht"],
    defaultStatus: "Nicht erreicht",
    accent: "border-t-orange-400",
  },
  {
    key: "gespraech",
    label: "Im Gespräch",
    statuses: ["Erreicht", "Qualifiziert"],
    defaultStatus: "Erreicht",
    accent: "border-t-amber-500",
  },
  {
    key: "beratung",
    label: "In Beratung",
    statuses: ["Termin vereinbart", "Angebot/Beratung läuft"],
    defaultStatus: "Termin vereinbart",
    accent: "border-t-blue-500",
  },
  {
    key: "abschluss",
    label: "Abschluss",
    statuses: ["Abschluss"],
    defaultStatus: "Abschluss",
    accent: "border-t-emerald-500",
  },
  {
    key: "kein-interesse",
    label: "Kein Interesse",
    statuses: ["Kein Interesse"],
    defaultStatus: "Kein Interesse",
    accent: "border-t-rose-400",
  },
];

const SONSTIGE_KEY = "__sonstige__";

function findColumnFor(status: string | null): ColumnDef | null {
  const s = (status ?? "Neuer Lead").trim();
  return (
    COLUMNS.find((c) =>
      (c.statuses as readonly string[]).includes(s),
    ) ?? null
  );
}

function bucketize(leads: KanbanLead[]): Map<string, KanbanLead[]> {
  const map = new Map<string, KanbanLead[]>();
  for (const col of COLUMNS) map.set(col.key, []);
  map.set(SONSTIGE_KEY, []);
  for (const lead of leads) {
    const col = findColumnFor(lead.status);
    if (col) map.get(col.key)!.push(lead);
    else map.get(SONSTIGE_KEY)!.push(lead);
  }
  return map;
}

// Sub-Status-Badge: nur sichtbar wenn die Spalte mehrere Status bündelt UND
// der konkrete Status nicht der Default ist (sonst Rauschen). Macht
// sichtbar, dass z. B. eine Karte in "Im Gespräch" schon "Qualifiziert" ist.
function subStatusLabel(lead: KanbanLead, col: ColumnDef): string | null {
  if (col.statuses.length <= 1) return null;
  const s = (lead.status ?? "").trim();
  if (s === "" || s === col.defaultStatus) return null;
  return s;
}

export function KanbanBoard({ leads: initialLeads }: { leads: KanbanLead[] }) {
  const router = useRouter();
  const [leads, setLeads] = useState<KanbanLead[]>(initialLeads);
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // Unterscheidung Click vs. Drag: didDrag wird beim DragStart gesetzt und
  // 100ms nach DragEnd zurückgesetzt — der trailing Click-Event nach einem
  // Drag wird so unterdrückt, ohne die normale Click-Navigation zu blocken.
  const didDrag = useRef(false);

  const buckets = bucketize(leads);
  const sonstige = buckets.get(SONSTIGE_KEY) ?? [];

  function handleDrop(targetCol: ColumnDef) {
    const leadId = dragLeadId;
    setDragLeadId(null);
    setDragOverCol(null);
    if (!leadId) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    const currentStatus = (lead.status ?? "Neuer Lead").trim();
    // Drop innerhalb der gleichen Spalte: Sub-Status behalten, no-op.
    if ((targetCol.statuses as readonly string[]).includes(currentStatus)) {
      return;
    }
    const nextStatus = targetCol.defaultStatus;

    const before = leads;
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: nextStatus } : l)),
    );

    startTransition(async () => {
      const res = await setLeadStatusAction(leadId, nextStatus);
      if (!res.ok) {
        setLeads(before);
        alert(`Status konnte nicht gesetzt werden: ${res.error}`);
      } else {
        // Refresh, damit ein paralleler Sync den optimistischen State
        // nicht später wieder überschreibt.
        router.refresh();
      }
    });
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-2xl border border-[color:var(--border)] bg-white p-6 text-sm text-[color:var(--muted)] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
        Im gewählten Zeitraum sind keine aktiven Leads vorhanden.
      </div>
    );
  }

  // Spalten füllen den verfügbaren Platz gleichmäßig. Unter ~1100 px
  // (≈ 6 × 180 px) kippt das Layout auf horizontalen Scroll mit fixen
  // Min-Breiten — Mobile-Fallback, damit Karten lesbar bleiben.
  const totalColumns = COLUMNS.length + (sonstige.length > 0 ? 1 : 0);
  return (
    <div className="overflow-x-auto pb-3">
      <div
        className="grid gap-2 min-w-[1100px]"
        style={{
          gridTemplateColumns: `repeat(${totalColumns}, minmax(0, 1fr))`,
        }}
      >
        {COLUMNS.map((col) => {
          const items = buckets.get(col.key) ?? [];
          const isOver = dragOverCol === col.key;
          return (
            <KanbanColumn
              key={col.key}
              label={col.label}
              count={items.length}
              accent={col.accent}
              isOver={isOver}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverCol(col.key);
              }}
              onDragLeave={() => {
                if (dragOverCol === col.key) setDragOverCol(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(col);
              }}
            >
              {items.map((lead) => (
                <KanbanCard
                  key={lead.id}
                  lead={lead}
                  subStatus={subStatusLabel(lead, col)}
                  dragging={dragLeadId === lead.id}
                  onDragStart={(e) => {
                    didDrag.current = true;
                    setDragLeadId(lead.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", lead.id);
                  }}
                  onDragEnd={() => {
                    setDragLeadId(null);
                    setDragOverCol(null);
                    setTimeout(() => {
                      didDrag.current = false;
                    }, 100);
                  }}
                  onClick={() => {
                    if (didDrag.current) return;
                    router.push(`/buyer/leads/${lead.id}?from=kanban`);
                  }}
                />
              ))}
            </KanbanColumn>
          );
        })}
        {sonstige.length > 0 ? (
          <KanbanColumn
            label="Sonstige"
            count={sonstige.length}
            accent="border-t-zinc-300"
            isOver={false}
          >
            {sonstige.map((lead) => (
              <KanbanCard
                key={lead.id}
                lead={lead}
                subStatus={lead.status}
                dragging={false}
                onDragStart={() => {}}
                onDragEnd={() => {}}
                onClick={() =>
                  router.push(`/buyer/leads/${lead.id}?from=kanban`)
                }
                draggable={false}
              />
            ))}
          </KanbanColumn>
        ) : null}
      </div>
    </div>
  );
}

function KanbanColumn({
  label,
  count,
  accent,
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: {
  label: string;
  count: number;
  accent: string;
  isOver: boolean;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border border-t-4 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]",
        accent,
        "border-[color:var(--border)]",
        isOver && "ring-2 ring-[color:var(--brand)] ring-offset-2",
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="flex items-baseline justify-between px-3 py-2.5">
        <span className="text-sm font-semibold tracking-tight">{label}</span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-600">
          {count}
        </span>
      </header>
      <div className="flex-1 space-y-2 px-2 pb-3 pt-1 min-h-[120px]">
        {children}
      </div>
    </div>
  );
}

function KanbanCard({
  lead,
  subStatus,
  dragging,
  draggable = true,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  lead: KanbanLead;
  subStatus: string | null;
  dragging: boolean;
  draggable?: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm shadow-sm transition hover:border-[color:var(--brand)] hover:shadow-md",
        dragging && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 font-medium text-[color:var(--foreground)] break-words">
          {lead.name ?? (
            <span className="text-[color:var(--muted)]">unbenannt</span>
          )}
        </div>
        {subStatus ? (
          <span className="shrink-0 rounded-full bg-[color:var(--brand-soft)]/60 px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--brand-dark)]">
            {subStatus}
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[color:var(--muted)]">
        <span className="truncate">{displayProduct(lead.source)}</span>
        <span className="shrink-0 tabular-nums">{formatDate(lead.createdAt)}</span>
      </div>
    </div>
  );
}
