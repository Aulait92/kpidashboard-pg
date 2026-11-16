"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { isNewVersionError, reloadForNewVersion } from "@/lib/neue-version";

// Fehlerseite im Admin: statt der leeren Next-Fehlerseite ein Satz und zwei klare nächste Schritte
// (nochmal versuchen, zurück zu Heute). Menü und Kopfzeile bleiben dabei sichtbar.
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    // Nach einem Deploy (alter Tab): einmal neu laden statt Fehlerseite
    if (error instanceof Error && isNewVersionError(error) && reloadForNewVersion()) return;
    Sentry.captureException(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center px-4 py-16 text-center" data-admin-error>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">Die Seite konnte nicht geladen werden</h1>
      <p className="mt-2 text-sm text-[color:var(--muted)]">Meist hilft es, es gleich nochmal zu versuchen. Der Fehler ist gemeldet.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => retry()} className={buttonClass("primary", "md")}>
          Nochmal versuchen
        </button>
        <Link href="/admin/heute" className={buttonClass("secondary", "md")}>
          Zu Heute
        </Link>
      </div>
      {digest ? <p className="mt-6 text-xs text-[color:var(--muted)]">Fehlercode {digest}</p> : null}
    </main>
  );
}
