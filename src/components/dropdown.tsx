"use client";

import { ChevronDown } from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export function Dropdown({
  label,
  value,
  align = "right",
  children,
}: {
  label: string;
  value: string;
  align?: "left" | "right";
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex min-h-[40px] items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm transition sm:min-h-0 sm:py-1.5",
          open
            ? "border-[color:var(--brand)] shadow-sm"
            : "border-[color:var(--border)] hover:border-[color:var(--brand)]",
        )}
      >
        <span className="text-xs text-[color:var(--muted)]">{label}</span>
        <span className="max-w-[140px] truncate font-medium text-[color:var(--foreground)] sm:max-w-[180px]">
          {value}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-[color:var(--muted)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div
          className={cn(
            "absolute z-30 mt-2 max-h-[70vh] min-w-[220px] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-[color:var(--border)] bg-white p-1 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.18)]",
            // Mobile fällt der Container in eine eigene Zeile am linken Rand;
            // erst ab sm rechts ausrichten, damit das Panel nicht aus dem
            // Viewport rutscht.
            align === "right"
              ? "left-0 sm:left-auto sm:right-0"
              : "left-0",
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function DropdownItem({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "block w-full rounded-md px-3 py-2 text-left text-sm transition sm:py-1.5",
        active
          ? "bg-[color:var(--brand-soft)] font-medium text-[color:var(--brand-dark)]"
          : "text-[color:var(--foreground)] hover:bg-zinc-50",
      )}
    >
      {children}
    </button>
  );
}

export function DropdownDivider() {
  return <div className="my-1 border-t border-[color:var(--border)]" />;
}
