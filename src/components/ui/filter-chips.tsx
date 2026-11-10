"use client";

// Filter im Pipedrive-Stil: Suchfeld + Chips. Ein Chip zeigt „Kunde ▾“, aktiv
// „Kunde: Müller ×“. Auswahl gilt sofort (URL-Parameter), ohne „Filtern“-Knopf.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string; hint?: string };
export type FilterField =
  | { kind: "select"; key: string; label: string; options: FilterOption[] }
  | {
      kind: "period";
      label: string;
      /** Monats-Parameter (YYYY-MM) und Von/Bis-Parameter (YYYY-MM-DD) */
      monthKey: string;
      fromKey: string;
      toKey: string;
      months: FilterOption[];
    };

type Props = {
  fields: FilterField[];
  searchKey?: string;
  searchPlaceholder?: string;
  /** Parameter, die bei jeder Änderung wegfallen (z. B. Seite) */
  resetKeys?: string[];
  children?: React.ReactNode;
};

export function FilterChips({ fields, searchKey = "q", searchPlaceholder = "Suchen", resetKeys = ["seite"], children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get(searchKey) ?? "");

  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const k of resetKeys) next.delete(k);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const s = next.toString();
    start(() => router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  }

  // Suche: kurz nach dem Tippen anwenden.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      if ((params.get(searchKey) ?? "") !== q.trim()) apply({ [searchKey]: q.trim() || null });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const activeKeys = fields.flatMap((f) => (f.kind === "select" ? [f.key] : [f.monthKey, f.fromKey, f.toKey]));
  const anyActive = activeKeys.some((k) => params.get(k)) || !!params.get(searchKey);

  return (
    <div className={cn("flex flex-wrap items-center gap-2 transition-opacity", pending && "opacity-60")}>
      <label className="relative flex h-9 min-w-[220px] flex-1 items-center sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[color:var(--muted)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 w-full rounded-full border border-[color:var(--border)] bg-white pl-9 pr-8 text-sm outline-none transition focus:border-[color:var(--brand)]"
        />
        {q ? (
          <button type="button" aria-label="Suche leeren" onClick={() => setQ("")} className="absolute right-2.5 text-[color:var(--muted)]">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </label>
      {fields.map((f) =>
        f.kind === "select" ? (
          <SelectChip key={f.key} field={f} value={params.get(f.key)} onChange={(v) => apply({ [f.key]: v })} />
        ) : (
          <PeriodChip
            key={f.monthKey}
            field={f}
            month={params.get(f.monthKey)}
            from={params.get(f.fromKey)}
            to={params.get(f.toKey)}
            onChange={(m, from, to) => apply({ [f.monthKey]: m, [f.fromKey]: from, [f.toKey]: to })}
          />
        ),
      )}
      {anyActive ? (
        <button
          type="button"
          onClick={() => {
            setQ("");
            apply(Object.fromEntries([...activeKeys, searchKey].map((k) => [k, null])));
          }}
          className="h-9 px-2 text-sm font-medium text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
        >
          Alle zurücksetzen
        </button>
      ) : null}
      {children ? <div className="ml-auto flex items-center gap-2">{children}</div> : null}
    </div>
  );
}

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function Chip({ label, valueLabel, open, onClick, onClear }: { label: string; valueLabel: string | null; open: boolean; onClick: () => void; onClear: () => void }) {
  const active = !!valueLabel;
  return (
    <span
      className={cn(
        "inline-flex h-9 items-center rounded-full border text-sm transition",
        active
          ? "border-[color:var(--brand)]/30 bg-[color:var(--brand-soft)] text-[color:var(--brand-dark,var(--brand))]"
          : "border-[color:var(--border)] bg-white text-[color:var(--foreground)] hover:border-[color:var(--border-strong)]",
        open && "ring-2 ring-[color:var(--brand)]/20",
      )}
    >
      <button type="button" onClick={onClick} className="inline-flex h-full max-w-[260px] items-center gap-1.5 pl-3.5 pr-2" aria-expanded={open}>
        <span className={cn(active ? "text-[color:var(--brand-dark,var(--brand))]/70" : "text-[color:var(--muted)]")}>{label}{active ? ":" : ""}</span>
        {active ? <span className="truncate font-medium">{valueLabel}</span> : null}
        {!active ? <ChevronDown className="h-3.5 w-3.5 text-[color:var(--muted)]" /> : null}
      </button>
      {active ? (
        <button type="button" aria-label={`${label} entfernen`} onClick={onClear} className="mr-1.5 rounded-full p-1 hover:bg-white/60">
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </span>
  );
}

function Popover({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-0 top-full z-30 mt-1.5 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-lg,0_10px_30px_rgba(15,23,42,.12))]">
      {children}
    </div>
  );
}

function OptionList({ options, value, onPick }: { options: FilterOption[]; value: string | null; onPick: (v: string) => void }) {
  const [term, setTerm] = useState("");
  const shown = term ? options.filter((o) => o.label.toLowerCase().includes(term.toLowerCase())) : options;
  return (
    <>
      {options.length > 8 ? (
        <div className="border-b border-[color:var(--border)] p-2">
          <input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Suchen"
            className="h-8 w-full rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken,#f8fafc)] px-2.5 text-sm outline-none"
          />
        </div>
      ) : null}
      <ul className="max-h-72 overflow-y-auto py-1">
        {shown.map((o) => (
          <li key={o.value}>
            <button
              type="button"
              onClick={() => onPick(o.value)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[color:var(--surface-sunken,#f8fafc)]"
            >
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.hint ? <span className="text-xs text-[color:var(--muted)]">{o.hint}</span> : null}
              {o.value === value ? <Check className="h-4 w-4 text-[color:var(--brand)]" /> : null}
            </button>
          </li>
        ))}
        {shown.length === 0 ? <li className="px-3 py-2 text-sm text-[color:var(--muted)]">Nichts gefunden</li> : null}
      </ul>
    </>
  );
}

function SelectChip({ field, value, onChange }: { field: Extract<FilterField, { kind: "select" }>; value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useOutside(open, () => setOpen(false));
  const current = field.options.find((o) => o.value === value)?.label ?? (value || null);
  return (
    <div ref={ref} className="relative">
      <Chip label={field.label} valueLabel={current} open={open} onClick={() => setOpen((o) => !o)} onClear={() => onChange(null)} />
      {open ? (
        <Popover>
          <OptionList
            options={field.options}
            value={value}
            onPick={(v) => {
              setOpen(false);
              onChange(v === value ? null : v);
            }}
          />
        </Popover>
      ) : null}
    </div>
  );
}

const ymd = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);
const deDate = (s: string) => {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y.slice(2)}`;
};

function PeriodChip({
  field,
  month,
  from,
  to,
  onChange,
}: {
  field: Extract<FilterField, { kind: "period" }>;
  month: string | null;
  from: string | null;
  to: string | null;
  onChange: (month: string | null, from: string | null, to: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState({ from: from ?? "", to: to ?? "" });
  const ref = useOutside(open, () => setOpen(false));
  const valueLabel = month
    ? (field.months.find((m) => m.value === month)?.label ?? month)
    : from || to
      ? `${from ? deDate(from) : "…"} – ${to ? deDate(to) : "heute"}`
      : null;
  const daysBack = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n + 1);
    return ymd(d);
  };
  const presets: FilterOption[] = [
    { value: "d7", label: "Letzte 7 Tage" },
    { value: "d30", label: "Letzte 30 Tage" },
    { value: "d90", label: "Letzte 90 Tage" },
  ];
  return (
    <div ref={ref} className="relative">
      <Chip label={field.label} valueLabel={valueLabel} open={open} onClick={() => setOpen((o) => !o)} onClear={() => onChange(null, null, null)} />
      {open ? (
        <Popover>
          <OptionList
            options={[...presets, ...field.months]}
            value={month}
            onPick={(v) => {
              setOpen(false);
              if (v.startsWith("d")) onChange(null, daysBack(Number(v.slice(1))), null);
              else onChange(v, null, null);
            }}
          />
          <form
            className="flex items-end gap-2 border-t border-[color:var(--border)] p-3"
            onSubmit={(e) => {
              e.preventDefault();
              setOpen(false);
              onChange(null, custom.from || null, custom.to || null);
            }}
          >
            <label className="min-w-0 flex-1 text-xs text-[color:var(--muted)]">
              Von
              <input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="mt-1 h-8 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-1.5 text-sm text-[color:var(--foreground)]" />
            </label>
            <label className="min-w-0 flex-1 text-xs text-[color:var(--muted)]">
              Bis
              <input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="mt-1 h-8 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-1.5 text-sm text-[color:var(--foreground)]" />
            </label>
            <button className="h-8 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-3 text-sm font-semibold text-white">OK</button>
          </form>
        </Popover>
      ) : null}
    </div>
  );
}
