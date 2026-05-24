"use client";

import {
  CheckCircle2,
  Pencil,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useActionState, useState } from "react";
import type { GoalRow, MonthlyGoalProgress } from "@/lib/goals";
import { formatEUR, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  saveMonthlyGoals,
  type SaveGoalState,
} from "./monthly-goals-actions";

function formatValue(value: number | null, format: GoalRow["format"]): string {
  if (value == null || !Number.isFinite(value)) return "–";
  if (format === "currency") return formatEUR(value);
  if (format === "percent") return formatPercent(value);
  return formatNumber(Math.round(value));
}

function StatusBadge({ status }: { status: GoalRow["status"] }) {
  if (status === "no-goal") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
        Kein Ziel
      </span>
    );
  }
  const cfg = {
    ahead: {
      label: "Über Ziel",
      cls: "bg-emerald-50 text-emerald-700",
      Icon: TrendingUp,
    },
    ontrack: {
      label: "Auf Kurs",
      cls: "bg-blue-50 text-blue-700",
      Icon: CheckCircle2,
    },
    behind: {
      label: "Hinterher",
      cls: "bg-rose-50 text-rose-700",
      Icon: TrendingDown,
    },
  }[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        cfg.cls,
      )}
    >
      <cfg.Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function ProgressBar({
  progress,
  pace,
  status,
}: {
  progress: number | null;
  pace: number | null;
  status: GoalRow["status"];
}) {
  if (progress == null) {
    return <div className="h-2 rounded-full bg-zinc-100" />;
  }
  const width = Math.max(2, Math.min(100, progress * 100));
  const paceFraction =
    pace != null && status !== "no-goal" ? pace / (progress || 1) : null;
  const color =
    status === "ahead"
      ? "bg-emerald-500"
      : status === "ontrack"
        ? "bg-blue-500"
        : status === "behind"
          ? "bg-rose-500"
          : "bg-zinc-400";

  return (
    <div className="relative h-2 overflow-hidden rounded-full bg-zinc-100">
      <div
        className={cn("h-full transition-all", color)}
        style={{ width: `${width}%` }}
      />
      {paceFraction != null && pace != null && progress > 0 ? (
        <div
          className="absolute top-0 h-full w-px bg-zinc-900/40"
          style={{ left: `${Math.min(100, pace / Math.max(progress, pace * 1.5) * 100)}%` }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

function GoalRowView({ row }: { row: GoalRow }) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
          {row.label}
        </div>
        <StatusBadge status={row.status} />
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-bold tabular-nums text-[color:var(--foreground)]">
          {formatValue(row.current, row.format)}
        </span>
        <span className="text-sm text-[color:var(--muted)]">
          / {formatValue(row.goal, row.format)}
        </span>
        {row.pace != null ? (
          <span className="ml-auto text-[11px] tabular-nums text-[color:var(--muted)]">
            Soll heute: {formatValue(row.pace, row.format)}
          </span>
        ) : null}
      </div>
      <div className="mt-2">
        <ProgressBar
          progress={row.progress}
          pace={row.pace}
          status={row.status}
        />
      </div>
    </div>
  );
}

function GoalEditForm({
  initial,
  onDone,
}: {
  initial: MonthlyGoalProgress;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<SaveGoalState, FormData>(
    saveMonthlyGoals,
    {},
  );

  const isTotal = initial.product == null;
  const closedEditable =
    initial.rows.find((r) => r.key === "closed")?.editable ?? false;
  const revenueEditable =
    initial.rows.find((r) => r.key === "revenue")?.editable ?? false;

  // Aktuelle Werte vorbefüllen.
  const values = {
    closed: initial.rows.find((r) => r.key === "closed")?.goal,
    revenue: initial.rows.find((r) => r.key === "revenue")?.goal,
    margin: initial.rows.find((r) => r.key === "margin")?.goal,
  };

  // Nach erfolgreichem Speichern automatisch zurück zur Anzeige.
  if (state.ok) {
    onDone();
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="monthKey" value={initial.monthKey} />
      <input type="hidden" name="product" value={initial.product ?? ""} />

      <p className="text-[11px] text-[color:var(--muted)]">
        Lead-Ziele kommen aus Airtable (read-only).{" "}
        {isTotal
          ? "Gesamt: Abschlüsse & Umsatz sind die Summe der Produkte — hier nur die Gesamt-Marge setzen."
          : "Hier Abschlüsse, Umsatz und Marge für dieses Produkt setzen."}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {closedEditable ? (
          <Field
            label="Abschlüsse (Anzahl)"
            name="closed"
            defaultValue={values.closed}
            step={1}
          />
        ) : null}
        {revenueEditable ? (
          <Field
            label="Umsatz (€)"
            name="revenue"
            defaultValue={values.revenue}
            step={50}
          />
        ) : null}
        <Field
          label="Marge vor weiteren Kosten (%)"
          name="margin"
          defaultValue={
            values.margin != null ? values.margin * 100 : undefined
          }
          step={0.1}
          max={100}
          hint="0-100"
        />
      </div>

      {state.error ? (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {state.error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-[color:var(--brand)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
        >
          {pending ? "Speichere…" : "Ziele speichern"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm transition hover:border-[color:var(--brand)]"
        >
          <X className="h-3.5 w-3.5" /> Abbrechen
        </button>
        <span className="text-[11px] text-[color:var(--muted)]">
          Felder leer lassen = kein Ziel.
        </span>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  step,
  max,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: number | null;
  step?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">
        {label}
      </span>
      <input
        type="number"
        name={name}
        defaultValue={defaultValue ?? ""}
        min={0}
        max={max}
        step={step ?? "any"}
        placeholder={hint ?? "0"}
        className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm tabular-nums focus:border-[color:var(--brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-soft)]"
      />
    </label>
  );
}

export function MonthlyGoalsCard({
  progress,
}: {
  progress: MonthlyGoalProgress;
}) {
  const [editing, setEditing] = useState(false);
  const anyGoalSet = progress.rows.some((r) => r.goal != null);

  return (
    <section className="rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand)]">
            Ziele
          </div>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            Monatsziele {progress.monthLabel}
            <span className="ml-2 text-sm font-medium text-[color:var(--muted)]">
              · {progress.product ?? "Gesamt"}
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--brand-soft)] px-3 py-1 text-xs font-semibold text-[color:var(--brand-dark)]">
            <Target className="h-3.5 w-3.5" />
            Tag {progress.daysElapsed} / {progress.daysTotal}
          </span>
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--border)] bg-white px-3 py-1.5 text-xs font-medium transition hover:border-[color:var(--brand)] hover:text-[color:var(--brand)]"
            >
              <Pencil className="h-3 w-3" />
              {anyGoalSet ? "Bearbeiten" : "Ziele setzen"}
            </button>
          ) : null}
        </div>
      </header>

      {editing ? (
        <GoalEditForm
          initial={progress}
          onDone={() => setEditing(false)}
        />
      ) : !anyGoalSet ? (
        <div className="rounded-lg border border-dashed border-[color:var(--border)] p-6 text-center text-sm text-[color:var(--muted)]">
          Noch keine Ziele für {progress.monthLabel} gesetzt. Klick auf
          „Ziele setzen“, um loszulegen.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {progress.rows.map((row) => (
            <GoalRowView key={row.key} row={row} />
          ))}
        </div>
      )}
    </section>
  );
}
