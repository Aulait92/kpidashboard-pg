"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, BellOff, BellRing, LogOut, Settings, ShieldCheck } from "lucide-react";
import { neueOberflaecheAction } from "@/app/admin/neu/schalter-actions";
import { usePush } from "@/lib/use-push";
import { cn } from "@/lib/utils";

const zeile = "flex min-h-11 w-full items-center gap-2 px-3 text-left hover:bg-[color:var(--surface-sunken)]";

/** Schalter „Neue Oberfläche“ (in beiden Profilmenüs). `an` = aktueller Zustand. */
export function NeueOberflaecheSchalter({ an, label = "Neue Oberfläche" }: { an: boolean; label?: string }) {
  return (
    <form action={neueOberflaecheAction} className="border-b border-[color:var(--border)]">
      <input type="hidden" name="an" value={an ? "0" : "1"} />
      <button type="submit" role="switch" aria-checked={an} className={cn(zeile, "justify-between")}>
        <span>{label}</span>
        <span className={cn("relative h-[22px] w-[38px] shrink-0 rounded-full transition", an ? "bg-[color:var(--brand)]" : "bg-[color:var(--border-strong)]")}>
          <span className={cn("absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all", an ? "left-[19px]" : "left-[3px]")} />
        </span>
      </button>
    </form>
  );
}

/** Push-Mitteilungen an/aus und Test (früher eigener Knopf in der Seitenleiste). */
function PushZeile() {
  const { status, busy, message, enable, disable, sendTest } = usePush();
  if (status === "loading" || status === "unsupported") return null;
  const Icon = status === "on" ? BellRing : status === "denied" ? BellOff : Bell;
  return (
    <div className="border-b border-[color:var(--border)]" data-funktion="notifications-button-usepush--push-benachrichtigungen-aktivieren-abschalten">
      <button
        type="button"
        disabled={busy || status === "denied"}
        onClick={() => void (status === "on" ? disable() : enable())}
        className={cn(zeile, "disabled:opacity-60")}
        title={status === "denied" ? "In den Geräte-Einstellungen freigeben" : undefined}
      >
        <Icon className={cn("h-4 w-4", status === "on" && "text-emerald-600")} />
        {status === "on" ? "Push-Mitteilungen aus" : status === "denied" ? "Push gesperrt (Geräte-Einstellungen)" : "Push-Mitteilungen an"}
      </button>
      {status === "on" && !busy ? (
        <button type="button" onClick={() => void sendTest()} className={cn(zeile, "min-h-9 pl-9 text-xs text-[color:var(--brand)]")}>
          Test senden
        </button>
      ) : null}
      {message ? <p className="px-3 pb-2 text-xs text-[color:var(--muted)]">{message}</p> : null}
    </div>
  );
}

/**
 * Profilmenü des neuen Admins: Schalter „Neue Oberfläche“, Push, Einstellungen, Sicherheit, Abmelden.
 * variant „sidebar“ unten in der Seitenleiste, sonst rund in der Kopfzeile (Handy).
 */
export function ProfilMenue({ email, variant = "kopf" }: { email: string; variant?: "sidebar" | "kopf" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initialen = (email.split("@")[0] ?? "").replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "A";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const avatar = (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-xs font-bold text-[color:var(--brand-dark)]">{initialen}</span>
  );

  return (
    <div ref={ref} className="relative" data-funktion="admin-profile-menu--profilmenue-einstellungen-sicherheit-abmelden">
      {variant === "sidebar" ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-2 py-2 text-left transition hover:bg-[color:var(--surface-sunken)]"
        >
          {avatar}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{email}</span>
            <span className="block text-xs text-[color:var(--muted)]">Admin · Profil</span>
          </span>
        </button>
      ) : (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Profil" className="-m-0.5 rounded-full p-0.5">
          {avatar}
        </button>
      )}
      {open ? (
        <div
          className={cn(
            "absolute z-50 w-64 overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white text-sm shadow-[var(--shadow-lg)]",
            variant === "sidebar" ? "bottom-full left-0 mb-2" : "right-0 top-full mt-2",
          )}
        >
          <div className="border-b border-[color:var(--border)] px-3 py-2">
            <div className="truncate font-semibold">{email}</div>
            <div className="text-xs text-[color:var(--muted)]">Admin</div>
          </div>
          <NeueOberflaecheSchalter an />
          <PushZeile />
          <Link href="/admin/neu/einstellungen" onClick={() => setOpen(false)} className={zeile}>
            <Settings className="h-4 w-4" /> Einstellungen
          </Link>
          <Link href="/admin/einstellungen/sicherheit" onClick={() => setOpen(false)} className={zeile}>
            <ShieldCheck className="h-4 w-4" /> Sicherheit (Zwei-Faktor)
          </Link>
          <form action="/api/auth/logout" method="post" className="border-t border-[color:var(--border)]">
            <button type="submit" className={zeile}>
              <LogOut className="h-4 w-4" /> Abmelden
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
