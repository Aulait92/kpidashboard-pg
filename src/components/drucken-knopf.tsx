"use client";

import { Printer } from "lucide-react";

/** „Drucken oder als PDF speichern“ über den Druckdialog des Browsers (beim Drucken ausgeblendet). */
export function DruckenKnopf() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm font-semibold shadow-[var(--shadow-sm)] hover:bg-[color:var(--surface-sunken)] print:hidden"
    >
      <Printer className="h-4 w-4" /> Drucken oder als PDF speichern
    </button>
  );
}
