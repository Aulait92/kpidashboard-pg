"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

// Kurze Rückmeldung nach einer Aktion, optional mit „Rückgängig".
// Sitzt unten mittig (am Handy über der Tab-Leiste) und verschwindet von selbst.

type Toast = {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "success" | "error";
};

const ToastContext = createContext<{
  show: (t: Omit<Toast, "id"> & { durationMs?: number }) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((t: Omit<Toast, "id"> & { durationMs?: number }) => {
    if (timer.current) clearTimeout(timer.current);
    const id = Date.now();
    setToast({ ...t, id });
    timer.current = setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), t.durationMs ?? 6000);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6">
        {toast ? (
          <div
            key={toast.id}
            role="status"
            className="ui-fade-in pointer-events-auto flex max-w-md items-center gap-3 rounded-[var(--radius-md)] bg-[color:var(--foreground)] px-4 py-3 text-sm text-white shadow-[var(--shadow-lg)]"
          >
            {toast.tone === "error" ? (
              <X className="h-4 w-4 shrink-0 text-rose-300" />
            ) : (
              <Check className="h-4 w-4 shrink-0 text-emerald-300" />
            )}
            <span className="min-w-0">{toast.message}</span>
            {toast.actionLabel && toast.onAction ? (
              <button
                type="button"
                onClick={() => {
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
