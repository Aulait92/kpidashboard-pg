"use client";

// Kundenbereich: Push-Benachrichtigungen einschalten. Ohne das kommen die
// Pushes (neuer Lead, Antwort, Termin) nie beim Vertreter an.
// - Hinweis oben im Kundenbereich, solange Push aus ist (wegklickbar, 14 Tage Ruhe)
// - Eintrag im Profilmenü zum An-/Ausschalten und Testen

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Share, X } from "lucide-react";
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
  const [howTo, setHowTo] = useState(false);

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

  // Eine schmale Zeile statt Karte mit großem blauem Knopf (Ole, 19.11.2026: konkurrierte mit der Hauptaktion der Seite)
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-3 sm:px-6 lg:px-8" data-push-hint>
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface)] py-1 pl-3 pr-1 text-sm">
        <Bell className="h-4 w-4 shrink-0 text-[color:var(--brand)]" />
        <span className="min-w-0 flex-1 truncate text-[color:var(--muted)]">
          <span className="font-medium text-[color:var(--foreground)]">Benachrichtigungen</span>
          <span className="hidden font-medium text-[color:var(--foreground)] sm:inline"> aus</span>
          <span className="hidden sm:inline">: neue Leads, Antworten und Termine sofort aufs Handy</span>
        </span>
        {status === "off" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void enable()}
            className="inline-flex min-h-10 shrink-0 items-center rounded-full px-3 font-semibold text-[color:var(--brand)] hover:bg-[color:var(--brand-soft)] disabled:opacity-50"
          >
            Einschalten
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setHowTo((v) => !v)}
            aria-expanded={howTo}
            className="inline-flex min-h-10 shrink-0 items-center rounded-full px-3 font-semibold text-[color:var(--brand)] hover:bg-[color:var(--brand-soft)]"
          >
            So geht&apos;s
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hinweis ausblenden"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)] hover:text-[color:var(--foreground)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {status === "unsupported" && howTo ? (
        <p className="mt-1 px-3 text-sm text-[color:var(--muted)]">
          Auf dem iPhone: unten auf die drei Punkte (…) und dann auf <Share className="inline h-3.5 w-3.5 align-[-2px]" /> „Teilen“
          tippen, dann „Zum Home-Bildschirm“. Danach die App über das neue Symbol öffnen und hier einschalten.
        </p>
      ) : null}
      {message ? <p className="mt-1 px-3 text-xs text-[color:var(--muted)]">{message}</p> : null}
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
