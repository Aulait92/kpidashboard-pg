"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { sendUsage } from "@/lib/usage-client";
import { error as hapticError, impact, success as hapticSuccess } from "@/lib/haptics";
import { feiern, GLUECKWUNSCH } from "@/lib/konfetti";
import { Leo } from "@/components/leo";

// Kurze Rückmeldung nach einer Aktion, optional mit „Rückgängig".
// Sitzt unten mittig (am Handy über der Tab-Leiste) und verschwindet von selbst.

type Toast = {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "success" | "error";
  /** Abschluss gefeiert (Konfetti, lib/konfetti.ts): Leo „jubel“ statt Haken (nur mit Maskottchen). */
  gefeiert?: boolean;
};

type ShowInput = Omit<Toast, "id" | "gefeiert"> & {
  durationMs?: number;
  /**
   * Abschluss feiern (Ole, 27.11.2026): Schlüssel des Deals (z. B. Lead-ID). Beim ersten Mal je Deal Konfetti und
   * „Glückwunsch zum Abschluss! 🎉“ statt der Meldung, danach die normale Meldung. Nur direkt nach der eigenen
   * erfolgreichen Aktion setzen, nie aus dem Seitenzustand.
   */
  feiern?: string | null;
};

const ToastContext = createContext<{
  show: (t: ShowInput) => void;
} | null>(null);

/** maskottchen: Leo im Abschluss-Toast (nur Vermittlerbereich, nie im Admin). */
export function ToastProvider({ children, maskottchen = false }: { children: React.ReactNode; maskottchen?: boolean }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((input: ShowInput) => {
    if (timer.current) clearTimeout(timer.current);
    const { feiern: feierKey, ...rest } = input;
    const gefeiert = rest.tone !== "error" && !!feierKey && feiern(feierKey) !== null;
    const t: Omit<Toast, "id"> & { durationMs?: number } = gefeiert ? { ...rest, message: GLUECKWUNSCH, gefeiert: true } : rest;
    // Fehlermeldungen mitzählen (wo hängen Nutzer?).
    if (t.tone === "error") void sendUsage({ type: "error", name: `toast: ${t.message.slice(0, 80)}` });
    // In der App: kurzes Vibrieren als Bestätigung (Erledigt, Gespeichert …)
    if (t.tone === "error") hapticError();
    else hapticSuccess();
    // Erfolgsmoment (Termin gebucht, Abschluss): Anlass für die Frage nach der Nutzungsanalyse (components/nutzungsanalyse.tsx)
    if (t.tone !== "error" && (gefeiert || /termin gebucht|termin eingetragen|: abschluss/i.test(t.message))) window.dispatchEvent(new Event("pg:erfolg"));
    const id = Date.now();
    setToast({ ...t, id });
    timer.current = setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), t.durationMs ?? (gefeiert ? 4000 : 6000));
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {/* Abschluss-Toast über dem Blatt „Abschluss gespeichert“, das gleichzeitig aufgeht (sonst abgedunkelt dahinter);
          am Handy oben, damit er die Knöpfe des Blatts unten nicht verdeckt */}
      <div
        className={
          toast?.gefeiert
            ? "pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] flex justify-center px-4 md:bottom-6 md:top-auto"
            : "pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6"
        }
      >
        {toast ? (
          <div
            key={toast.id}
            role="status"
            className="ui-fade-in pointer-events-auto flex max-w-md items-center gap-3 rounded-[var(--radius-md)] bg-[color:var(--foreground)] px-4 py-3 text-sm text-white shadow-[var(--shadow-lg)]"
          >
            {toast.tone === "error" ? (
              <X className="h-4 w-4 shrink-0 text-rose-300" />
            ) : toast.gefeiert && maskottchen ? (
              <Leo pose="jubel" size={46} wippen className="-my-2 -ml-1" />
            ) : (
              <Check className="h-4 w-4 shrink-0 text-emerald-300" />
            )}
            <span className="min-w-0">{toast.message}</span>
            {toast.actionLabel && toast.onAction ? (
              <button
                type="button"
                onClick={() => {
                  impact("light");
                  toast.onAction?.();
                  setToast(null);
                }}
                className="ml-1 shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-sky-300 hover:bg-white/10"
              >
                {toast.actionLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  // Außerhalb des Providers (z. B. Admin): stiller No-op statt Absturz.
  return ctx ?? { show: () => {} };
}
