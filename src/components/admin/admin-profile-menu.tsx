"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Settings, ShieldCheck, Sparkles, Undo2 } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { toggleAdminNewUiAction } from "@/app/admin/ui-actions";
import { cn } from "@/lib/utils";

/**
 * Profilmenü des Admins: Umschalten zwischen alter und neuer Oberfläche
 * (Admin-A), Einstellungen, Abmelden. variant „sidebar“ = unten in der
 * Seitenleiste der neuen Oberfläche, sonst kompakt in der Kopfzeile.
 */
export function AdminProfileMenu({ email, newUi, variant = "header" }: { email: string; newUi: boolean; variant?: "header" | "sidebar" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = (email.split("@")[0] ?? "").replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "A";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemCls = "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[color:var(--surface-sunken)]";

  return (
    <div ref={ref} className="relative">
      {variant === "sidebar" ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-2 py-2 text-left transition hover:bg-[color:var(--surface-sunken)]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-xs font-bold text-[color:var(--brand-dark)]">{initials}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{email}</span>
            <span className="block text-xs text-[color:var(--muted)]">Admin · Profil</span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Profil"
          title="Profil"
          className="flex items-center gap-1 rounded-full py-1 pl-1 pr-1.5 text-sm transition hover:bg-[color:var(--surface-sunken)]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-xs font-bold text-[color:var(--brand-dark)]">{initials}</span>
          <ChevronDown className="h-4 w-4 text-[color:var(--muted)]" />
        </button>
      )}
      {open ? (
        <div
          className={cn(
            "absolute z-50 w-64 overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white text-sm shadow-[var(--shadow-lg)]",
            variant === "sidebar" ? "bottom-full left-0 mb-2" : "right-0 mt-2",
          )}
        >
          <div className="border-b border-[color:var(--border)] px-3 py-2">
            <div className="truncate font-semibold">{email}</div>
            <div className="text-xs text-[color:var(--muted)]">{newUi ? "Neue Oberfläche (Test)" : "Admin"}</div>
          </div>
          <form action={toggleAdminNewUiAction}>
            <button type="submit" className={itemCls}>
              {newUi ? <Undo2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4 text-[color:var(--brand)]" />}
              {newUi ? "Zur alten Oberfläche" : "Neue Oberfläche testen"}
            </button>
          </form>
          <Link href="/admin/einstellungen" onClick={() => setOpen(false)} className={itemCls}>
            <Settings className="h-4 w-4" /> Einstellungen
          </Link>
          <Link href="/admin/einstellungen/sicherheit" onClick={() => setOpen(false)} className={itemCls}>
            <ShieldCheck className="h-4 w-4" /> Sicherheit (Zwei-Faktor)
          </Link>
          <form action={logoutAction} className="border-t border-[color:var(--border)]">
            <button type="submit" className={itemCls}>
              <LogOut className="h-4 w-4" /> Abmelden
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
