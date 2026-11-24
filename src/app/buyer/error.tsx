"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { isNewVersionError, reloadForNewVersion } from "@/lib/neue-version";

// Fehlerseite im Kundenbereich (Go-live-Prüfung 19.11.2026, W5): statt der weißen globalen Fehlerseite ein Satz und
// zwei klare nächste Schritte. Menü und Kopfzeile (buyer/layout.tsx) bleiben sichtbar, error.tsx umschließt nur die Seite.
export default function BuyerError({ error, retry, reset }: { error: unknown; retry?: () => void; reset?: () => void }) {
  useEffect(() => {
    // Nach einem Deploy (alter Tab): einmal neu laden statt Fehlerseite
    if (error instanceof Error && isNewVersionError(error) && reloadForNewVersion()) return;
    Sentry.captureException(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center px-4 py-16 text-center" data-buyer-error>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">Die Seite konnte nicht geladen werden</h1>
      <p className="mt-2 text-[15px] text-[color:var(--muted)]">Meist hilft es, es gleich noch einmal zu versuchen. Wir sind informiert.</p>
      <div className="mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-center">
        <button type="button" onClick={() => (retry ?? reset)?.()} className={buttonClass("primary", "md")}>
          Erneut versuchen
        </button>
        <Link href="/buyer" className={buttonClass("secondary", "md")}>
          Zur Übersicht
        </Link>
      </div>
      {digest ? <p className="mt-6 text-xs text-[color:var(--muted)]">Fehlercode {digest}</p> : null}
    </main>
  );
}
