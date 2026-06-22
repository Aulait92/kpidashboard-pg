"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDealStatusAction } from "@/app/admin/crm/actions";
import { SALES_PIPELINE_PHASES, type SalesPhase } from "@/lib/sales";
import { formatDate, formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";

export type KanbanDeal = {
  id: string;
  name: string | null;
  company: string | null;
  owner: string | null;
  value: number | null;
  status: string | null;
  lastActivityAt: Date | null;
  createdAt: Date;
};

const SONSTIGE_KEY = "__sonstige__";

function bucketize(deals: KanbanDeal[]): Map<string, KanbanDeal[]> {
  const map = new Map<string, KanbanDeal[]>();
  for (const phase of SALES_PIPELINE_PHASES) map.set(phase.key, []);
  map.set(SONSTIGE_KEY, []);
  for (const deal of deals) {
    const phase = SALES_PIPELINE_PHASES.find((p) =>
      (p.statuses as readonly string[]).includes(deal.status ?? ""),
    );
    if (phase) map.get(phase.key)!.push(deal);
    else map.get(SONSTIGE_KEY)!.push(deal);
  }
  return map;
}

export function SalesKanbanBoard({ deals: initialDeals }: { deals: KanbanDeal[] }) {
  const router = useRouter();
  const [deals, setDeals] = useState<KanbanDeal[]>(initialDeals);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const didDrag = useRef(false);

  const buckets = bucketize(deals);
  const sonstige = buckets.get(SONSTIGE_KEY) ?? [];

  function handleDrop(targetPhase: SalesPhase) {
    const id = dragId;
    setDragId(null);
    setDragOverCol(null);
    if (!id) return;
    const deal = deals.find((d) => d.id === id);
    if (!deal) return;
    const currentStatus = deal.status ?? "";
    if ((targetPhase.statuses as readonly string[]).includes(currentStatus)) {
      return;
    }
    const nextStatus = targetPhase.defaultStatus;
    const before = deals;
    setDeals((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: nextStatus } : d)),
    );
    startTransition(async () => {
      const res = await setDealStatusAction(id, nextStatus);
      if (!res.ok) {
        setDeals(before);
        alert(`Status konnte nicht gesetzt werden: ${res.error}`);
      } else {
        router.refresh();
      }
    });
  }

  if (deals.length === 0) {
    return (
      <div className="rounded-2xl border border-[color:var(--border)] bg-white p-6 text-sm text-[color:var(--muted)] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
        Keine Deals im gewählten Zeitraum. Sobald der Sales-Sync läuft, tauchen
        Datensätze aus der Airtable-„Deal-Pipeline" hier auf.
      </div>
    );
  }

  const totalCols = SALES_PIPELINE_PHASES.length + (sonstige.length > 0 ? 1 : 0);

  return (
    <div className="overflow-x-auto pb-3">
      <div
        className="grid min-w-[1200px] gap-2"
        style={{ gridTemplateColumns: `repeat(${totalCols}, minmax(0, 1fr))` }}
      >
        {SALES_PIPELINE_PHASES.map((phase) => {
          const items = buckets.get(phase.key) ?? [];
          const sum = items.reduce((s, d) => s + (d.value ?? 0), 0);
          return (
            <KanbanColumn
              key={phase.key}
              label={phase.label}
              count={items.length}
              valueSum={sum}
              accent={phase.accent}
              isOver={dragOverCol === phase.key}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverCol(phase.key);
              }}
              onDragLeave={() => {
                if (dragOverCol === phase.key) setDragOverCol(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(phase);
              }}
            >
              {items.map((deal) => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  dragging={dragId === deal.id}
                  onDragStart={(e) => {
                    didDrag.current = true;
                    setDragId(deal.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", deal.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragOverCol(null);
                    setTimeout(() => {
                      didDrag.current = false;
                    }, 100);
                  }}
                  onClick={() => {
                    if (didDrag.current) return;
                    router.push(`/admin/crm/${deal.id}`);
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
            valueSum={sonstige.reduce((s, d) => s + (d.value ?? 0), 0)}
            accent="border-t-zinc-300"
            isOver={false}
          >
            {sonstige.map((deal) => (
              <DealCard
                key={deal.id}
                deal={deal}
                dragging={false}
                onDragStart={() => {}}
                onDragEnd={() => {}}
                onClick={() => router.push(`/admin/crm/${deal.id}`)}
                draggable={false}
                badge={deal.status ?? "—"}
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
  valueSum,
  accent,
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: {
  label: string;
  count: number;
  valueSum: number;
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
      <header className="px-3 py-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold tracking-tight">{label}</span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-600">
            {count}
          </span>
        </div>
        {valueSum > 0 ? (
          <div className="mt-0.5 text-[11px] tabular-nums text-[color:var(--muted)]">
            {formatEUR(valueSum)}
          </div>
        ) : null}
      </header>
      <div className="flex-1 min-h-[120px] space-y-2 px-2 pb-3 pt-1">
        {children}
      </div>
    </div>
  );
}

function DealCard({
  deal,
  dragging,
  draggable = true,
  badge,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  deal: KanbanDeal;
  dragging: boolean;
  draggable?: boolean;
  badge?: string;
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
        <div className="min-w-0">
          <div className="font-medium text-[color:var(--foreground)] break-words">
            {deal.name ?? <span className="text-[color:var(--muted)]">unbenannt</span>}
          </div>
          {deal.company ? (
            <div className="text-[11px] text-[color:var(--muted)] truncate">
              {deal.company}
            </div>
          ) : null}
        </div>
        {badge ? (
          <span className="shrink-0 rounded-full bg-[color:var(--brand-soft)]/60 px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--brand-dark)]">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-[color:var(--muted)]">
        <span className="truncate">{deal.owner ?? "ohne Owner"}</span>
        <span className="shrink-0 tabular-nums">
          {deal.lastActivityAt
            ? formatDate(deal.lastActivityAt)
            : formatDate(deal.createdAt)}
        </span>
      </div>
      {deal.value != null && deal.value > 0 ? (
        <div className="mt-1.5 inline-flex rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-800">
          {formatEUR(deal.value)}
        </div>
      ) : null}
    </div>
  );
}
