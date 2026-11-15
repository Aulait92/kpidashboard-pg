"use client";

// Neue Version, alte Tabs: scheitert eine Server Action, weil der Server sie nach einem Deploy nicht
// mehr kennt, einmal automatisch neu laden (lib/neue-version.ts). Hat das gerade schon nicht
// geholfen, unten ein kurzer Hinweis mit Knopf. Für Vermittlerbereich und Admin (Root-Layout).

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { handleNewVersionError, isNewVersionError, NEUE_VERSION_EVENT, NEUE_VERSION_TEXT } from "@/lib/neue-version";

export function NeueVersion() {
  const [show, setShow] = useState(false);

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

  if (!show) return null;
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
