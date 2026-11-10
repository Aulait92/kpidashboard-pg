"use client";

// Kundenbereich: Push-Benachrichtigungen einschalten. Ohne das kommen die
// Pushes (neuer Lead, Antwort, Termin) nie beim Vertreter an.
// - Hinweis oben im Kundenbereich, solange Push aus ist (wegklickbar, 14 Tage Ruhe)
// - Eintrag im Profilmenü zum An-/Ausschalten und Testen

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Share, X } from "lucide-react";
import { Button } from "@/components/ui";
import { usePush } from "@/lib/use-push";

const DISMISS_KEY = "pg-push-hint-dismissed";
const QUIET_MS = 14 * 24 * 60 * 60 * 1000;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return at > 0 && Date.now() - at < QUIET_MS;
  } catch {
    return false;
  }
}

export function PushHint() {
  const { status, busy, message, needsInstall, enable } = usePush();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setHidden(dismissedRecently()), 0);
    return () => clearTimeout(t);
  }, []);

  const relevant = status === "off" || (status === "unsupported" && needsInstall);
  if (hidden || !relevant) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* ohne Speicher: nur für diese Sitzung ausblenden */
    }
    setHidden(true);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--brand-soft)] p-3 sm:flex-nowrap sm:items-center sm:p-4">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[color:var(--brand)] sm:mt-0">
          <Bell className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 basis-[calc(100%-5.5rem)] text-sm sm:basis-auto">
          <div className="font-semibold text-[color:var(--foreground)]">Benachrichtigungen einschalten</div>
          {status === "unsupported" ? (
            <p className="text-[color:var(--muted)]">
              Auf dem iPhone: unten auf <Share className="inline h-3.5 w-3.5 align-[-2px]" /> „Teilen“ tippen, dann „Zum
              Home-Bildschirm“. Danach die App über das neue Symbol öffnen und hier einschalten.
            </p>
          ) : (
            <p className="text-[color:var(--muted)]">
              Dann erfahren Sie sofort von neuen Leads, Antworten und Terminen – auch wenn die App zu ist.
            </p>
          )}
          {message ? <p className="mt-1 text-xs text-[color:var(--muted)]">{message}</p> : null}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hinweis ausblenden"
          className="rounded-full p-1 text-[color:var(--muted)] hover:bg-white hover:text-[color:var(--foreground)] sm:order-last"
        >
          <X className="h-4 w-4" />
        </button>
        {status === "off" ? (
          <div className="w-full pl-12 sm:w-auto sm:pl-0">
            <Button variant="primary" size="md" disabled={busy} onClick={() => void enable()} className="w-full sm:w-auto">
              Einschalten
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Eintrag im Profilmenü: zeigt den Stand und schaltet um. */
export function PushMenuItem() {
  const { status, busy, message, needsInstall, enable, disable, sendTest } = usePush();
  if (status === "loading") return null;
  if (status === "unsupported" && !needsInstall) return null;

  const Icon = status === "on" ? BellRing : status === "denied" ? BellOff : Bell;
  const state =
    status === "on"
      ? "an"
      : status === "denied"
        ? "im Browser gesperrt"
        : status === "unsupported"
          ? "erst zum Home-Bildschirm"
          : "aus";

  return (
    <div className="border-b border-[color:var(--border)]">
      <button
        type="button"
        disabled={busy || status === "denied" || status === "unsupported"}
        onClick={() => void (status === "on" ? disable() : enable())}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[color:var(--background)] disabled:hover:bg-transparent"
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1">Benachrichtigungen</span>
        <span className={status === "on" ? "text-xs font-semibold text-emerald-700" : "text-xs text-[color:var(--muted)]"}>{state}</span>
      </button>
      {status === "on" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void sendTest()}
          className="block w-full px-3 pb-2 pl-9 text-left text-xs text-[color:var(--brand)] hover:underline"
        >
          Test senden
        </button>
      ) : null}
      {status === "denied" ? (
        <p className="px-3 pb-2 pl-9 text-xs text-[color:var(--muted)]">In den Einstellungen des Browsers für diese Seite erlauben.</p>
      ) : null}
      {message ? <p className="px-3 pb-2 pl-9 text-xs text-[color:var(--muted)]">{message}</p> : null}
    </div>
  );
}
