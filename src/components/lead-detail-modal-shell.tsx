"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

// Modal-Wrapper für die Lead-Detail-Body, der im Pipeline-Tab über die
// Intercepting Route gerendert wird. Backdrop-Klick / ESC / X-Button
// → router.back(): räumt die intercepted URL aus der History und macht
// die darunterliegende Pipeline-Seite wieder sichtbar.
//
// Layout-Architektur:
//   <dialog>                    flex-col, max-h-90vh
//     header bar (X-Button)     shrink-0
//     scrollable body           flex-1, overflow-y-auto
//   </dialog>
//
// Damit kollidiert das X NICHT mit dem Stornieren-Button im Body-Header
// (eigene Zeile darüber), und der Speichern-Button am Ende der Edit-Form
// ist immer per Scroll erreichbar (Höhe ist am Dialog gekappt, nicht
// am inneren Div).
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
        // Backdrop-Klick: das Event-Target ist das <dialog> selbst,
        // weil der Backdrop kein eigenes Element ist.
        if (e.target === dialogRef.current) close();
      }}
      className="m-auto flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-[color:var(--border)] bg-white p-0 shadow-[0_20px_50px_-20px_rgba(15,23,42,0.4)] backdrop:bg-slate-900/40"
    >
      <div className="flex shrink-0 items-center justify-end border-b border-[color:var(--border)] px-3 py-2">
        <button
          type="button"
          onClick={close}
          aria-label="Schließen"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--muted)] transition hover:bg-zinc-100 hover:text-[color:var(--foreground)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-6 sm:p-8">{children}</div>
    </dialog>
  );
}
