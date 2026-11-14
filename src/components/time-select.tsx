"use client";

// Uhrzeit-Auswahl statt <input type="time"> (Ole, 14.11.2026: der Browser-Picker mit zwei Zahlenspalten war hässlich).
// Knopf mit Uhrzeit, darunter eine Liste im 15-Minuten-Raster (wie Google Kalender), Tastatur: Pfeile, Enter, Esc.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Clock } from "lucide-react";

const toMin = (s: string) => (s === "24:00" ? 1440 : /^\d{1,2}:\d{2}$/.test(s) ? Number(s.split(":")[0]) * 60 + Number(s.split(":")[1]) : NaN);
const fromMin = (m: number) => (m >= 1440 ? "24:00" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);

/** Uhrzeiten von `min` bis `max` (Minuten, inkl.) im Raster; ein abweichender aktueller Wert wird einsortiert. */
export function timeOptions(min = 0, max = 1425, step = 15, current?: string): string[] {
  const out: string[] = [];
  for (let m = Math.max(0, min); m <= Math.min(1440, max); m += step) out.push(fromMin(m));
  const c = current ? toMin(current) : NaN;
  if (Number.isFinite(c) && !out.includes(fromMin(c))) {
    out.push(fromMin(c));
    out.sort((a, b) => toMin(a) - toMin(b));
  }
  return out;
}

export function TimeSelect({
  value,
  onChange,
  name,
  min,
  max,
  step = 15,
  placeholder = "--:--",
  ariaLabel,
  disabled,
  required,
  className = "",
}: {
  value: string;
  onChange?: (v: string) => void;
  /** Für normale Formulare: verstecktes Feld mit diesem Namen. */
  name?: string;
  /** Früheste/späteste Uhrzeit als "HH:MM" (Ende darf "24:00" sein). */
  min?: string;
  max?: string;
  step?: number;
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const options = useMemo(
    () => timeOptions(min ? toMin(min) : 0, max ? toMin(max) : 1425, step, value),
    [min, max, step, value],
  );

  const startIndex = () => {
    const i = options.indexOf(value);
    return i >= 0 ? i : Math.max(0, options.findIndex((o) => toMin(o) >= 9 * 60));
  };
  const openList = () => {
    setActive(startIndex());
    setOpen(true);
  };
  // Beim Öffnen: aktuelle Uhrzeit (oder 9 Uhr) in die Mitte der Liste scrollen.
  useEffect(() => {
    if (!open || !list.current) return;
    const el = list.current.querySelector<HTMLElement>('[aria-selected="true"]') ?? (list.current.children[active] as HTMLElement | undefined);
    if (el) list.current.scrollTop = el.offsetTop - list.current.clientHeight / 2 + el.clientHeight / 2;
    // nur beim Öffnen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const pick = (v: string) => {
    onChange?.(v);
    setOpen(false);
  };
  const move = (delta: number) => {
    setActive((a) => {
      const n = Math.min(options.length - 1, Math.max(0, a + delta));
      (list.current?.children[n] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
      return n;
    });
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openList();
      return;
    }
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "PageDown") {
      e.preventDefault();
      move(4);
    } else if (e.key === "PageUp") {
      e.preventDefault();
      move(-4);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (options[active]) pick(options[active]);
    } else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={wrap} className={`relative inline-block ${className}`} data-time-select>
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKey}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        className={`flex h-10 w-full items-center gap-1.5 rounded-[var(--radius-sm)] border bg-white px-3 text-[15px] tabular-nums transition outline-none focus-visible:border-[color:var(--brand)] focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/20 disabled:opacity-60 ${
          open ? "border-[color:var(--brand)] ring-2 ring-[color:var(--brand)]/20" : "border-[color:var(--border)] hover:border-[color:var(--border-strong)]"
        }`}
      >
        <Clock className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
        <span className={`flex-1 whitespace-nowrap text-left ${value ? "font-medium" : "text-[color:var(--muted)]"}`}>{value || placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[color:var(--muted)] transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 top-full z-40 mt-1 max-h-64 w-full min-w-[7rem] overflow-y-auto rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white py-1 shadow-[var(--shadow-lg)]"
        >
          {options.map((o, i) => {
            const selected = o === value;
            return (
              <li
                key={o}
                id={`${id}-${i}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                className={`mx-1 cursor-pointer rounded-[6px] px-3 py-2 text-[15px] tabular-nums ${
                  selected ? "bg-[color:var(--brand)] font-semibold text-white" : i === active ? "bg-[color:var(--brand-soft)] text-[color:var(--brand-dark)]" : "text-[color:var(--foreground)]"
                } ${o.endsWith(":00") && !selected ? "font-medium" : ""}`}
              >
                {o}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
