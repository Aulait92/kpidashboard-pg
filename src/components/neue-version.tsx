"use client";

// Neue Version, alte Tabs: scheitert eine Server Action, weil der Server sie nach einem Deploy nicht
// mehr kennt, einmal automatisch neu laden (lib/neue-version.ts). Nach dem Reload kurz der Hinweis
// „Die App wurde aktualisiert. Bitte noch einmal tippen.“ (Ole, 20.11.2026). Hat der Reload gerade schon nicht
// geholfen, unten ein kurzer Hinweis mit Knopf. Für alle Seiten (Root-Layout).

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { AKTUALISIERT_TEXT, handleNewVersionError, isNewVersionError, NEUE_VERSION_EVENT, NEUE_VERSION_TEXT, takeReloadHinweis } from "@/lib/neue-version";

export function NeueVersion() {
  const [show, setShow] = useState(false);
  const [aktualisiert, setAktualisiert] = useState(false);

  // Gerade automatisch neu geladen: kurz sagen, warum, und dass der Tipp wiederholt werden muss
  useEffect(() => {
    if (!takeReloadHinweis()) return;
    const an = setTimeout(() => setAktualisiert(true), 0);
    const aus = setTimeout(() => setAktualisiert(false), 8000);
    return () => {
      clearTimeout(an);
      clearTimeout(aus);
    };
  }, []);

  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isNewVersionError(e.reason)) {
        e.preventDefault();
        handleNewVersionError(e.reason);
      }
    };
    const onError = (e: ErrorEvent) => {
      if (isNewVersionError(e.error)) {
        e.preventDefault();
        handleNewVersionError(e.error);
      }
    };
    const onShow = () => setShow(true);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    window.addEventListener(NEUE_VERSION_EVENT, onShow);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
      window.removeEventListener(NEUE_VERSION_EVENT, onShow);
    };
  }, []);

  if (!show) {
    return aktualisiert ? (
      <div
        role="status"
        data-app-aktualisiert
        className="fixed inset-x-4 bottom-4 z-[100] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-[color:var(--border)] bg-white p-3 shadow-lg"
      >
        <RefreshCw className="h-4 w-4 shrink-0 text-[color:var(--brand)]" aria-hidden />
        <p className="flex-1 text-sm">{AKTUALISIERT_TEXT}</p>
        <button type="button" onClick={() => setAktualisiert(false)} className="min-h-10 px-2 text-sm font-semibold text-[color:var(--muted)]">
          OK
        </button>
      </div>
    ) : null;
  }
  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-4 z-[100] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-[color:var(--border)] bg-white p-3 shadow-lg"
    >
      <p className="flex-1 text-sm">{NEUE_VERSION_TEXT}</p>
      <Button variant="primary" size="md" icon={RefreshCw} onClick={() => window.location.reload()}>
        Neu laden
      </Button>
    </div>
  );
}
