"use client";

import { Bell, BellOff, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePush } from "@/lib/use-push";

export function NotificationsButton() {
  const { status, busy, message, enable, disable, sendTest } = usePush();

  if (status === "loading") {
    return null;
  }
  if (status === "unsupported") {
    return null;
  }

  const Icon = status === "on" ? BellRing : status === "denied" ? BellOff : Bell;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void (status === "on" ? disable() : enable())}
        disabled={busy || status === "denied"}
        aria-label={
          status === "on"
            ? "Benachrichtigungen deaktivieren"
            : "Benachrichtigungen aktivieren"
        }
        title={
          status === "denied"
            ? "In den Geräte-Einstellungen freigeben"
            : status === "on"
              ? "Benachrichtigungen aktiv, klick zum Deaktivieren"
              : "Benachrichtigungen aktivieren"
        }
        className={cn(
          "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm transition sm:min-h-0 sm:py-1.5",
          status === "on"
            ? "border-emerald-300 text-emerald-700"
            : "border-[color:var(--border)] text-[color:var(--foreground)] hover:border-[color:var(--brand)]",
          (busy || status === "denied") && "opacity-60",
        )}
      >
        <Icon className="h-4 w-4" />
        <span className="hidden sm:inline">
          {status === "on"
            ? "Push aktiv"
            : status === "denied"
              ? "Push gesperrt"
              : "Push aktivieren"}
        </span>
      </button>
      {status === "on" && !busy ? (
        <button
          type="button"
          onClick={() => void sendTest()}
          className="absolute right-0 top-full mt-1 hidden text-[10px] text-[color:var(--brand)] hover:underline sm:block"
        >
          Test senden
        </button>
      ) : null}
      {message ? (
        <div className="absolute right-0 top-full mt-6 whitespace-nowrap text-[10px] text-[color:var(--muted)]">
          {message}
        </div>
      ) : null}
    </div>
  );
}
