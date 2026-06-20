"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLeadStatusAction } from "@/app/buyer/actions";
import {
  LEAD_STATUS_OPTIONS,
  displayProduct,
  type LeadStatus,
} from "@/lib/products";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type KanbanLead = {
  id: string;
  name: string | null;
  source: string | null;
  status: string | null;
  createdAt: Date;
};

// Spalten-Reihenfolge = LEAD_STATUS_OPTIONS (Neuer Lead → … → Kein Interesse).
// Storno ist bewusst raus (Lead wird im Server-Fetch schon ausgefiltert).
// Leads mit unbekanntem/altem Status landen unten in einer optionalen
// "Sonstige"-Spalte — nur sichtbar, wenn dort wirklich was steht.
const SONSTIGE_KEY = "__sonstige__";

type ColumnDef = {
  key: string;
  label: string;
  // Status-Wert, der bei Drop in diese Spalte gesetzt wird. null = nicht
  // drop-fähig (Sonstige-Bucket).
  setStatus: LeadStatus | null;
  // Visuelle Akzentfarbe links als Top-Border.
  accent: string;
};

const COLUMN_ACCENTS: Record<LeadStatus, string> = {
  "Neuer Lead": "border-t-zinc-400",
  Erreicht: "border-t-amber-400",
  Qualifiziert: "border-t-amber-500",
  "Termin vereinbart": "border-t-blue-500",
  "Angebot/Beratung läuft": "border-t-blue-600",
  Abschluss: "border-t-emerald-500",
  "Kein Interesse": "border-t-rose-400",
};

function buildColumns(): ColumnDef[] {
  return LEAD_STATUS_OPTIONS.map((s) => ({
    key: s,
    label: s,
    setStatus: s,
    accent: COLUMN_ACCENTS[s],
  }));
}

function bucketize(leads: KanbanLead[]): Map<string, KanbanLead[]> {
  const map = new Map<string, KanbanLead[]>();
  for (const s of LEAD_STATUS_OPTIONS) map.set(s, []);
  map.set(SONSTIGE_KEY, []);
  for (const lead of leads) {
    const s = (lead.status ?? "Neuer Lead").trim();
    if ((LEAD_STATUS_OPTIONS as readonly string[]).includes(s)) {
      map.get(s)!.push(lead);
    } else {
      map.get(SONSTIGE_KEY)!.push(lead);
    }
  }
  return map;
}

export function KanbanBoard({ leads: initialLeads }: { leads: KanbanLead[] }) {
  const router = useRouter();
  const [leads, setLeads] = useState<KanbanLead[]>(initialLeads);
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [_, startTransition] = useTransition();
  // Unterscheidung Click vs. Drag: Drag setzt didDrag.current = true;
  // anschließender Click wird unterdrückt. setTimeout im dragEnd verzögert
  // das Zurücksetzen, damit der „synthetische" Click-Event nach dragend
  // noch geblockt wird.
  const didDrag = useRef(false);

  const buckets = bucketize(leads);
  const columns = buildColumns();
  const sonstige = buckets.get(SONSTIGE_KEY) ?? [];

  function handleDrop(toStatus: LeadStatus) {
    const leadId = dragLeadId;
    setDragLeadId(null);
    setDragOverCol(null);
    if (!leadId) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    if (lead.status === toStatus) return;

    // Optimistisches Update — Card sofort in die Ziel-Spalte.
    const before = leads;
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: toStatus } : l)),
    );

    startTransition(async () => {
      const res = await setLeadStatusAction(leadId, toStatus);
      if (!res.ok) {
        // Revert + minimal sichtbares Feedback via alert (kein Toast-System
        // im Projekt). Server-Action revalidiert die Page eh nicht bei
        // Fehler, daher manuelles Rollback.
        setLeads(before);
        alert(`Status konnte nicht gesetzt werden: ${res.error}`);
      } else {
        // Refresh, damit der DB-Stand (z. B. revenue.cancelled etc.) sicher
        // synchron ist und ein evtl. paralleler Sync nicht nachträglich
        // wieder überschreibt.
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

  return (
    <div className="-mx-4 overflow-x-auto pb-3 sm:-mx-6 lg:-mx-8">
      <div className="flex min-w-max gap-3 px-4 sm:px-6 lg:px-8">
        {columns.map((col) => {
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
                if (!col.setStatus) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverCol(col.key);
              }}
              onDragLeave={() => {
                if (dragOverCol === col.key) setDragOverCol(null);
              }}
              onDrop={(e) => {
                if (!col.setStatus) return;
                e.preventDefault();
                handleDrop(col.setStatus);
              }}
            >
              {items.map((lead) => (
                <KanbanCard
                  key={lead.id}
                  lead={lead}
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
                    // 100ms Verzögerung, damit der trailing Click nach
                    // dragend noch unterdrückt wird.
                    setTimeout(() => {
                      didDrag.current = false;
                    }, 100);
                  }}
                  onClick={() => {
                    if (didDrag.current) return;
                    router.push(`/buyer/leads/${lead.id}`);
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
                dragging={false}
                onDragStart={() => {}}
                onDragEnd={() => {}}
                onClick={() => router.push(`/buyer/leads/${lead.id}`)}
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
        "flex w-72 shrink-0 flex-col rounded-2xl border border-t-4 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]",
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
  dragging,
  draggable = true,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  lead: KanbanLead;
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
      <div className="font-medium text-[color:var(--foreground)]">
        {lead.name ?? (
          <span className="text-[color:var(--muted)]">unbenannt</span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-[color:var(--muted)]">
        <span>{displayProduct(lead.source)}</span>
        <span className="tabular-nums">{formatDate(lead.createdAt)}</span>
      </div>
    </div>
  );
}
