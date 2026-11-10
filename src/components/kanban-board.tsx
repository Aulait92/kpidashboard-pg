"use client";

import { useProvisionRates } from "@/components/provision-context";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRightLeft, Clock, X } from "lucide-react";
import { ActionSheet } from "@/components/ui/sheet";
import { setLeadStatusAction } from "@/app/buyer/actions";
import {
  CLOSED_STATUS,
  PHASE_DOT,
  PIPELINE_PHASES,
  displayProduct,
  type LeadStatus,
  type PipelinePhase,
} from "@/lib/products";
import { formatDate, formatEUR } from "@/lib/format";
import { closeValueField, closeValueLabel, sumProvision } from "@/lib/provision";
import { asksCloseValue } from "@/components/abschluss-sheet";
import { cn } from "@/lib/utils";

export type KanbanLead = {
  id: string;
  name: string | null;
  source: string | null;
  status: string | null;
  createdAt: Date;
  closeValue: number | null;
  /** Nächster gebuchter Termin (WhatsApp-Kunden). */
  appointment?: { startsAt: string; mode: string } | null;
  /** Wiedervorlage (ISO). */
  followUpAt?: string | null;
  /** Tage im aktuellen Status (auf dem Server berechnet). */
  daysInPhase?: number;
  /** Offen, aber weder Wiedervorlage noch Termin. */
  noNextStep?: boolean;
};


// Spalten-Design: nicht 1:1 pro Status, sondern in funktionalen Phasen
// gruppiert (PIPELINE_PHASES in lib/products.ts ist die Single-Source-
// Of-Truth, damit das Bearbeitungsstatus-Dropdown im Lead-Detail dasselbe
// Vokabular zeigt). Innerhalb einer Gruppe behält jede Karte ihren
// konkreten Sub-Status (siehe subStatusLabel), beim Drop von außerhalb
// wird auf den Einstiegs-Status der Gruppe gesetzt.
type ColumnDef = PipelinePhase & { accent: string };

const COLUMN_ACCENTS: Record<string, string> = {
  neu: "border-t-zinc-400",
  "nicht-erreicht": "border-t-orange-400",
  gespraech: "border-t-sky-400",
  beratung: "border-t-blue-500",
  "angebot-gesendet": "border-t-violet-500",
  abschluss: "border-t-emerald-500",
  "kein-interesse": "border-t-rose-400",
  disqualifiziert: "border-t-zinc-500",
};

function toColumns(phases: readonly PipelinePhase[]): ColumnDef[] {
  return phases.map((p) => ({
    ...p,
    accent: COLUMN_ACCENTS[p.key] ?? "border-t-zinc-300",
  }));
}

const SONSTIGE_KEY = "__sonstige__";

function findColumnFor(COLUMNS: ColumnDef[], status: string | null): ColumnDef | null {
  const s = (status ?? "Neuer Lead").trim();
  return (
    COLUMNS.find((c) =>
      (c.statuses as readonly string[]).includes(s),
    ) ?? null
  );
}

function bucketize(COLUMNS: ColumnDef[], leads: KanbanLead[]): Map<string, KanbanLead[]> {
  const map = new Map<string, KanbanLead[]>();
  for (const col of COLUMNS) map.set(col.key, []);
  map.set(SONSTIGE_KEY, []);
  for (const lead of leads) {
    const col = findColumnFor(COLUMNS, lead.status);
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

export function KanbanBoard({
  leads: initialLeads,
  phases = PIPELINE_PHASES,
  detailBase = "/buyer/leads/",
  detailSuffix = "?from=kanban",
  minBoardWidth = 1100,
}: {
  /** Ziel beim Klick auf eine Karte: `${detailBase}${id}${detailSuffix}`. */
  detailBase?: string;
  detailSuffix?: string;
  /** Mindestbreite der Spalten-Ansicht (darunter waagerecht scrollen). */
  minBoardWidth?: number;
  leads: KanbanLead[];
  /** Spalten — WhatsApp-Kunden bekommen „Im Gespräch" (pipelinePhasesFor). */
  phases?: readonly PipelinePhase[];
}) {
  const COLUMNS = toColumns(phases);
  const router = useRouter();
  const [leads, setLeads] = useState<KanbanLead[]>(initialLeads);
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [mobilePhase, setMobilePhase] = useState<string | null>(null);
  const [closeDialog, setCloseDialog] = useState<{
    leadId: string;
    leadName: string | null;
    source: string | null;
    currentValue: number | null;
  } | null>(null);
  const [, startTransition] = useTransition();
  const provisionRates = useProvisionRates();
  // Unterscheidung Click vs. Drag: didDrag wird beim DragStart gesetzt und
  // 100ms nach DragEnd zurückgesetzt — der trailing Click-Event nach einem
  // Drag wird so unterdrückt, ohne die normale Click-Navigation zu blocken.
  const didDrag = useRef(false);

  const buckets = bucketize(COLUMNS, leads);
  const sonstige = buckets.get(SONSTIGE_KEY) ?? [];

  function commitStatus(
    leadId: string,
    nextStatus: LeadStatus,
    closeValue?: number | null,
  ) {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    const before = leads;
    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId
          ? {
              ...l,
              status: nextStatus,
              ...(closeValue !== undefined ? { closeValue } : {}),
            }
          : l,
      ),
    );
    startTransition(async () => {
      const res = await setLeadStatusAction(
        leadId,
        nextStatus,
        closeValue !== undefined ? { closeValue } : undefined,
      );
      if (!res.ok) {
        setLeads(before);
        alert(`Status konnte nicht gesetzt werden: ${res.error}`);
      } else {
        router.refresh();
      }
    });
  }

  function handleDrop(targetCol: ColumnDef) {
    const leadId = dragLeadId;
    setDragLeadId(null);
    setDragOverCol(null);
    if (!leadId) return;
    moveLead(leadId, targetCol);
  }

  // Gemeinsam für Drag & Drop und das Status-Menü auf der Karte (Handy).
  function moveLead(leadId: string, targetCol: ColumnDef) {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;

    const currentStatus = (lead.status ?? "Neuer Lead").trim();
    // Drop innerhalb der gleichen Spalte: Sub-Status behalten, no-op.
    if ((targetCol.statuses as readonly string[]).includes(currentStatus)) {
      return;
    }
    const nextStatus = targetCol.defaultStatus;

    // Spezial-Flow für Abschluss: erst Dialog (Monats-/Jahresbeitrag bzw. Wert),
    // dann erst die Status-Action feuern. Fester Satz: kein Dialog.
    if (nextStatus === CLOSED_STATUS && asksCloseValue(lead.source, provisionRates)) {
      setCloseDialog({
        leadId,
        leadName: lead.name,
        source: lead.source,
        currentValue: lead.closeValue,
      });
      return;
    }

    commitStatus(leadId, nextStatus);
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-6 text-sm text-[color:var(--muted)] shadow-[var(--shadow-md)]">
        Im gewählten Zeitraum sind keine aktiven Leads vorhanden.
      </div>
    );
  }

  // Spalten füllen den verfügbaren Platz gleichmäßig. Unter ~1100 px
  // (≈ 6 × 180 px) kippt das Layout auf horizontalen Scroll mit fixen
  // Min-Breiten — Mobile-Fallback, damit Karten lesbar bleiben.
  const totalColumns = COLUMNS.length + (sonstige.length > 0 ? 1 : 0);
  const singleProduct = new Set(leads.map((l) => l.source ?? "")).size <= 1;
  const mobileCol =
    COLUMNS.find((c) => c.key === mobilePhase) ??
    COLUMNS.find((c) => (buckets.get(c.key) ?? []).length > 0) ??
    COLUMNS[0];
  const mobileItems = buckets.get(mobileCol.key) ?? [];
  return (
    <>
      {/* Handy/Tablet: Phasen-Umschalter + eine Liste statt Spalten */}
      <div className="lg:hidden">
        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {COLUMNS.map((c) => {
            const n = (buckets.get(c.key) ?? []).length;
            const active = c.key === mobileCol.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setMobilePhase(c.key)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                  active
                    ? "border-[color:var(--foreground)] bg-[color:var(--foreground)] text-white"
                    : "border-[color:var(--border)] bg-white text-[color:var(--foreground)]",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", PHASE_DOT[c.key] ?? "bg-zinc-400")} />
                {c.label}
                <span className={active ? "text-white/70" : "text-[color:var(--muted)]"}>{n}</span>
              </button>
            );
          })}
        </div>
        {mobileItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[color:var(--border)] bg-white px-4 py-10 text-center text-sm text-[color:var(--muted)]">
            Keine Leads in „{mobileCol.label}“.
          </div>
        ) : (
          <div className="space-y-2">
            {mobileItems.map((lead) => (
              <KanbanCard
                key={lead.id}
                lead={lead}
                subStatus={subStatusLabel(lead, mobileCol)}
                dragging={false}
                draggable={false}
                onDragStart={() => {}}
                onDragEnd={() => {}}
                onClick={() => router.push(`${detailBase}${lead.id}${detailSuffix}`)}
                columns={COLUMNS}
                currentKey={mobileCol.key}
                onMove={(target) => moveLead(lead.id, target)}
                hideProduct={singleProduct}
              />
            ))}
          </div>
        )}
      </div>
    <div className="hidden overflow-x-auto pb-3 lg:block">
      <div
        className="grid gap-2"
        style={{
          minWidth: minBoardWidth,
          gridTemplateColumns: `repeat(${totalColumns}, minmax(0, 1fr))`,
        }}
      >
        {COLUMNS.map((col) => {
          const items = buckets.get(col.key) ?? [];
          const isOver = dragOverCol === col.key;
          return (
            <KanbanColumn
              key={col.key}
              dot={PHASE_DOT[col.key]}
              label={col.label}
              count={items.length}
              sum={sumProvision(items.filter((l) => l.status === CLOSED_STATUS), provisionRates)}
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
                    router.push(`${detailBase}${lead.id}${detailSuffix}`);
                  }}
                  hideProduct={singleProduct}
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
                  router.push(`${detailBase}${lead.id}${detailSuffix}`)
                }
                draggable={false}
              />
            ))}
          </KanbanColumn>
        ) : null}
      </div>
    </div>
      {closeDialog ? (
        <CloseValueDialog
          leadName={closeDialog.leadName}
          source={closeDialog.source}
          currentValue={closeDialog.currentValue}
          onCancel={() => setCloseDialog(null)}
          onConfirm={(value) => {
            const d = closeDialog;
            setCloseDialog(null);
            commitStatus(d.leadId, CLOSED_STATUS, value);
          }}
        />
      ) : null}
    </>
  );
}

function CloseValueDialog({
  leadName,
  source,
  currentValue,
  onCancel,
  onConfirm,
}: {
  leadName: string | null;
  source: string | null;
  currentValue: number | null;
  onCancel: () => void;
  onConfirm: (value: number | null) => void;
}) {
  const provisionRates = useProvisionRates();
  const field = closeValueField(source, provisionRates) ?? { label: "Wert des Abschlusses (optional)", hint: "", placeholder: "z. B. 1.200" };
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState<string>(
    currentValue != null ? String(currentValue) : "",
  );
  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  // Leer = ohne Angabe (bei Prozent-Produkten rechnen wir mit dem Standardbeitrag).
  const parsed = value.trim() ? Number.parseFloat(value.replace(/\./g, "").replace(",", ".")) : null;
  const valid = parsed === null || (Number.isFinite(parsed) && parsed >= 0);

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      onClick={(e) => {
        if (e.target === dialogRef.current) onCancel();
      }}
      className="m-auto w-full max-w-sm rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-0 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.4)] backdrop:bg-slate-900/40"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onConfirm(parsed);
        }}
        className="flex flex-col"
      >
        <header className="flex items-start justify-between border-b border-[color:var(--border)] px-5 py-4">
          <div>
            <h3 className="text-base font-semibold">Abschluss buchen</h3>
            <p className="mt-0.5 text-xs text-[color:var(--muted)]">
              {leadName ?? "Unbekannter Lead"}
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
              {field.label}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              placeholder={field.placeholder}
              className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
            />
            {field.hint ? <p className="mt-1 text-[11px] text-[color:var(--muted)]">{field.hint}</p> : null}
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
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
          >
            Abschluss buchen
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function KanbanColumn({
  dot,
  label,
  count,
  sum = 0,
  accent,
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: {
  dot?: string;
  label: string;
  count: number;
  sum?: number;
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
        "flex min-w-0 flex-col rounded-xl border bg-white/60",
        "border-[color:var(--border)]",
        isOver && "ring-2 ring-[color:var(--brand)] ring-offset-2",
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold tracking-tight">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", dot ?? "bg-zinc-400")} />
            <span className="leading-tight">{label}</span>
          </span>
          {sum > 0 ? <span title="Geschätzte Provision" className="mt-0.5 block pl-4 text-[11px] font-semibold tabular-nums text-emerald-700">Provision ≈ {formatEUR(sum)}</span> : null}
        </span>
        <span className="shrink-0 text-xs font-medium tabular-nums text-[color:var(--muted)]">{count}</span>
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
  columns,
  currentKey,
  onMove,
  hideProduct = false,
}: {
  hideProduct?: boolean;
  lead: KanbanLead;
  subStatus: string | null;
  dragging: boolean;
  draggable?: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onClick: () => void;
  /** Status-Menü (vor allem fürs Handy, wo Drag & Drop hakelig ist). */
  columns?: ColumnDef[];
  currentKey?: string;
  onMove?: (target: ColumnDef) => void;
}) {
  const provisionRates = useProvisionRates();
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-lg border border-[color:var(--border)] bg-white px-3 py-2.5 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition hover:border-[color:var(--brand)]/60 hover:shadow-md",
        dragging && "opacity-50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 font-medium text-[color:var(--foreground)] break-words">
          {lead.name ?? (
            <span className="text-[color:var(--muted)]">unbenannt</span>
          )}
        </div>
        {lead.noNextStep ? (
          <span title="Kein nächster Schritt: Wiedervorlage oder Termin setzen" className="shrink-0 text-amber-500">
            <AlertTriangle className="h-4 w-4" />
          </span>
        ) : null}
        {subStatus ? (
          <span className="shrink-0 rounded-full bg-[color:var(--brand-soft)]/60 px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--brand-dark)]">
            {subStatus}
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[color:var(--muted)]">
        {hideProduct ? (
          <span>Eingang {formatDate(lead.createdAt)}</span>
        ) : (
          <>
            <span className="truncate">{displayProduct(lead.source)}</span>
            <span className="shrink-0 tabular-nums">{formatDate(lead.createdAt)}</span>
          </>
        )}
        {columns && onMove ? (
          // Handy: Phase per Auswahlfenster statt Drag & Drop
          <MoveButton columns={columns} currentKey={currentKey} onMove={onMove} name={lead.name} />
        ) : null}
      </div>
      {(() => {
        const d = lead.daysInPhase ?? null;
        return d != null && d >= 7 && lead.status !== CLOSED_STATUS ? (
          <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700" title="Tage in dieser Phase">
            <Clock className="h-3 w-3" />
            {d} Tage
          </div>
        ) : null;
      })()}
      {lead.appointment ? (
        <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
          {new Intl.DateTimeFormat("de-DE", {
            timeZone: "Europe/Berlin",
            weekday: "short",
            day: "numeric",
            month: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(lead.appointment.startsAt))}{" "}
          · {lead.appointment.mode === "video" ? "Video" : "Telefon"}
        </div>
      ) : null}
      {lead.followUpAt && !lead.appointment ? (
        <div className="mt-1.5 inline-flex items-center rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">
          Wiedervorlage{" "}
          {new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(
            new Date(lead.followUpAt),
          )}
          .
        </div>
      ) : null}
      {/* Provision nur zeigen, wenn der Lead wirklich im Abschluss ist —
          ein aus „Abschluss" zurückgezogener Lead soll keine Provision tragen. */}
      {lead.status === CLOSED_STATUS && closeValueLabel(lead.source, lead.closeValue, provisionRates) ? (
        <div className="mt-1.5 inline-flex rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-800">
          {closeValueLabel(lead.source, lead.closeValue, provisionRates)}
        </div>
      ) : null}

    </div>
  );
}

function MoveButton({
  columns,
  currentKey,
  onMove,
  name,
}: {
  columns: ColumnDef[];
  currentKey?: string;
  onMove: (target: ColumnDef) => void;
  name: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-[color:var(--border)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[color:var(--foreground)]"
      >
        Verschieben <ArrowRightLeft className="h-3 w-3" />
      </button>
      <span onClick={(e) => e.stopPropagation()}>
        <ActionSheet
          open={open}
          onClose={() => setOpen(false)}
          title={`${name ?? "Lead"} verschieben nach`}
          actions={columns.map((c) => ({
            label: c.label,
            tone: c.key === currentKey ? "primary" : undefined,
            onSelect: () => {
              if (c.key !== currentKey) onMove(c);
            },
          }))}
        />
      </span>
    </>
  );
}
