"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { setDealStatusAction } from "@/app/admin/crm/actions";
import { SALES_PIPELINE_PHASES, type SalesPhase } from "@/lib/sales-phases";
import { formatDate, formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";

export type KanbanDeal = {
  id: string;
  name: string | null;
  company: string | null;
  value: number | null;
  status: string | null;
  // Datum der nächsten geplanten Activity (scheduledFor > jetzt).
  // null = keine Folge-Aktivität geplant.
  nextActivityAt: Date | null;
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
  const [lostDialog, setLostDialog] = useState<{
    dealId: string;
    dealName: string | null;
    nextStatus: string;
  } | null>(null);
  const [, startTransition] = useTransition();
  const didDrag = useRef(false);

  const buckets = bucketize(deals);
  const sonstige = buckets.get(SONSTIGE_KEY) ?? [];

  function commitStatus(
    dealId: string,
    nextStatus: string,
    lostReason?: string,
  ) {
    const before = deals;
    setDeals((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, status: nextStatus } : d)),
    );
    startTransition(async () => {
      const res = await setDealStatusAction(
        dealId,
        nextStatus,
        lostReason !== undefined ? { lostReason } : undefined,
      );
      if (!res.ok) {
        setDeals(before);
        alert(`Status konnte nicht gesetzt werden: ${res.error}`);
      } else {
        router.refresh();
      }
    });
  }

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

    // Spezial-Flow für Verloren: erst Dialog mit dem Verlustgrund, dann
    // die Status-Action feuern. Cancel = kein Status-Change.
    if (targetPhase.terminal === "lost") {
      setLostDialog({
        dealId: id,
        dealName: deal.name,
        nextStatus,
      });
      return;
    }

    commitStatus(id, nextStatus);
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
            isOver={dragOverCol === SONSTIGE_KEY}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDragOverCol(SONSTIGE_KEY);
            }}
            onDragLeave={() => {
              if (dragOverCol === SONSTIGE_KEY) setDragOverCol(null);
            }}
            onDrop={(e) => {
              // Drop ZURÜCK in Sonstige ist no-op (kein Default-Status).
              e.preventDefault();
              setDragId(null);
              setDragOverCol(null);
            }}
          >
            {sonstige.map((deal) => (
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
                badge={deal.status ?? "—"}
              />
            ))}
          </KanbanColumn>
        ) : null}
      </div>
      {lostDialog ? (
        <LostReasonDialog
          dealName={lostDialog.dealName}
          onCancel={() => setLostDialog(null)}
          onConfirm={(reason) => {
            const d = lostDialog;
            setLostDialog(null);
            commitStatus(d.dealId, d.nextStatus, reason);
          }}
        />
      ) : null}
    </div>
  );
}

function LostReasonDialog({
  dealName,
  onCancel,
  onConfirm,
}: {
  dealName: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  const valid = reason.trim().length >= 3;

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      onClick={(e) => {
        if (e.target === dialogRef.current) onCancel();
      }}
      className="m-auto w-full max-w-md rounded-2xl border border-[color:var(--border)] bg-white p-0 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.4)] backdrop:bg-slate-900/40"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onConfirm(reason.trim());
        }}
        className="flex flex-col"
      >
        <header className="flex items-start justify-between border-b border-[color:var(--border)] px-5 py-4">
          <div>
            <h3 className="text-base font-semibold">Deal verloren</h3>
            <p className="mt-0.5 text-xs text-[color:var(--muted)]">
              {dealName ?? "Unbekannter Deal"}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Schließen"
            className="rounded-md p-1 text-[color:var(--muted)] transition hover:bg-zinc-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">
              Verlustgrund (Pflicht)
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              rows={4}
              autoFocus
              placeholder="z. B. Preis zu hoch, kein Budget, anderer Anbieter, kein Bedarf …"
              className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-[color:var(--muted)]">
              Wird als „Verlustgrund" nach Airtable geschrieben und im
              Lost-Reasons-Block der KPI-Page aggregiert.
            </p>
          </label>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-[color:var(--border)] bg-zinc-50 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-[color:var(--muted)] transition hover:bg-zinc-100"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
          >
            Verloren markieren
          </button>
        </footer>
      </form>
    </dialog>
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
      <div className="font-medium text-[color:var(--foreground)] break-words">
        {deal.name ?? <span className="text-[color:var(--muted)]">unbenannt</span>}
      </div>
      {badge ? (
        <span className="mt-1 inline-flex max-w-full rounded-full bg-[color:var(--brand-soft)]/60 px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--brand-dark)] break-words">
          {badge}
        </span>
      ) : null}
      {deal.company ? (
        <div className="mt-0.5 text-[11px] text-[color:var(--muted)] truncate">
          {deal.company}
        </div>
      ) : null}
      <div className="mt-1.5 flex justify-end text-[11px] text-[color:var(--muted)]">
        {deal.nextActivityAt ? (
          <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-blue-800">
            {formatDate(deal.nextActivityAt)}
          </span>
        ) : (
          <span className="tabular-nums">{formatDate(deal.createdAt)}</span>
        )}
      </div>
      {deal.value != null && deal.value > 0 ? (
        <div className="mt-1.5 inline-flex rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-800">
          {formatEUR(deal.value)}
        </div>
      ) : null}
    </div>
  );
}
