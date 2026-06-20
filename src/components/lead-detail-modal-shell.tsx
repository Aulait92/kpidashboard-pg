"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

// Modal-Wrapper für die Lead-Detail-Body, der im Pipeline-Tab über die
// Intercepting Route gerendert wird. Backdrop-Klick / ESC / X-Button
// → router.back(): das räumt die intercepted URL aus der History und
// macht die darunterliegende Pipeline-Seite wieder sichtbar, ohne sie
// neu zu mounten (Scroll-Position bleibt erhalten).
export function LeadDetailModalShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  function close() {
    router.back();
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={close}
      onClick={(e) => {
        // Backdrop-Klick: das Event-Target ist das <dialog> selbst, weil
        // der Backdrop kein eigenes Element ist.
        if (e.target === dialogRef.current) close();
      }}
      className="m-auto w-full max-w-3xl rounded-2xl border border-[color:var(--border)] bg-white p-0 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.4)] backdrop:bg-slate-900/40"
    >
      <div className="relative max-h-[85vh] overflow-y-auto p-6 sm:p-8">
        <button
          type="button"
          onClick={close}
          aria-label="Schließen"
          className="sticky top-0 -mt-2 ml-auto flex h-8 w-8 items-center justify-center rounded-md bg-white/80 text-[color:var(--muted)] backdrop-blur transition hover:bg-zinc-100 hover:text-[color:var(--foreground)]"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </dialog>
  );
}
