"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Info, X } from "lucide-react";

/**
 * Hinweis für Berater nach der Anmeldung über einen Link, den nur der Inhaber
 * öffnen darf (z. B. Infokarte der Login-Seite → Konto): ?hinweis=inhaber.
 */
export function InhaberHinweis() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  if (params.get("hinweis") !== "inhaber") return null;
  const close = () => {
    const rest = new URLSearchParams(params.toString());
    rest.delete("hinweis");
    router.replace(rest.size ? `${pathname}?${rest.toString()}` : pathname, { scroll: false });
  };
  return (
    <div role="status" className="mx-auto mt-4 flex w-full max-w-3xl items-start gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--brand-soft)] px-4 py-3 text-sm text-[color:var(--brand-dark)]">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="flex-1">Diese Seite kann nur der Inhaber Ihres Zugangs öffnen. Fragen Sie Ihren Inhaber.</p>
      <button type="button" onClick={close} aria-label="Hinweis schließen" className="-m-1 rounded p-1 hover:bg-white/60">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
