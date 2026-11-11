"use client";

// Auswahlfenster: auf dem Handy von unten, am Desktop mittig. Für alle
// Neben-Aktionen einer Zeile, damit pro Zeile nur eine Hauptaktion sichtbar ist.

import { useEffect } from "react";
import { impact } from "@/lib/haptics";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SheetAction = {
  label: string;
  icon?: LucideIcon;
  tone?: "danger" | "primary";
  href?: string;
  onSelect?: () => void;
  /** Fenster nicht schließen (die Auswahl öffnet einen Folgeschritt). */
  keepOpen?: boolean;
};

export function Sheet({
  open,
  onClose,
  title,
  message,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    impact("light"); // Auswahlfenster/Kontextmenü öffnet
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="ui-backdrop absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="ui-sheet relative w-full max-w-md overflow-hidden rounded-t-[var(--radius-lg)] bg-white pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-lg)] sm:rounded-[var(--radius-lg)] sm:pb-0"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[color:var(--border-strong)] sm:hidden" />
        {title || message ? (
          <div className="border-b border-[color:var(--border)] px-5 pb-3 pt-3">
            {title ? <div className="text-[15px] font-semibold">{title}</div> : null}
            {message ? <div className="mt-0.5 text-xs text-[color:var(--muted)]">{message}</div> : null}
          </div>
        ) : null}
        {children}
        <button
          type="button"
          onClick={onClose}
          className="h-12 w-full border-t border-[color:var(--border)] text-sm font-medium text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)]"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

export function ActionSheet({
  open,
  onClose,
  title,
  message,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  actions: SheetAction[];
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} message={message}>
      <ul className="divide-y divide-[color:var(--border)]">
        {actions.map((a) => {
          const cls = cn(
            "flex h-12 w-full items-center gap-3 px-5 text-left text-[15px] transition hover:bg-[color:var(--surface-sunken)] active:bg-[color:var(--surface-sunken)]",
            a.tone === "danger" ? "text-rose-700" : a.tone === "primary" ? "font-semibold text-[color:var(--brand)]" : "text-[color:var(--foreground)]",
          );
          const inner = (
            <>
              {a.icon ? (
                <a.icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0",
                    a.tone === "danger" ? "text-rose-600" : a.tone === "primary" ? "text-[color:var(--brand)]" : "text-[color:var(--muted)]",
                  )}
                />
              ) : null}
              {a.label}
            </>
          );
          return (
            <li key={a.label}>
              {a.href ? (
                <a
                  href={a.href}
                  className={cls}
                  data-tone={a.tone === "danger" ? "danger" : undefined}
                  onClick={() => {
                    if (!a.keepOpen) onClose();
                    a.onSelect?.();
                  }}
                >
                  {inner}
                </a>
              ) : (
                <button
                  type="button"
                  className={cls}
                  data-tone={a.tone === "danger" ? "danger" : undefined}
                  onClick={() => {
                    if (!a.keepOpen) onClose();
                    a.onSelect?.();
                  }}
                >
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

/** Ganze Zeile antippbar (öffnet z. B. das Auswahlfenster); Buttons darin stoppen das Antippen. */
export function TapRow({
  onTap,
  children,
  className,
}: {
  onTap: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <li
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onTap();
        }
      }}
      className={cn(
        "ui-fade-in flex cursor-pointer items-center gap-3 px-5 py-3.5 transition hover:bg-[color:var(--surface-sunken)] active:bg-[color:var(--surface-sunken)]",
        className,
      )}
    >
      {children}
    </li>
  );
}
