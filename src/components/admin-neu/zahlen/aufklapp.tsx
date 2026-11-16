import { ChevronRight } from "lucide-react";

// Aufklappbarer Abschnitt (Seltenes einklappen, UX-Regel): Kopf wie die Abschnitte der Zahlen-Übersicht.
export function Aufklapp({ titel, hinweis, offen = false, funktion, id, children }: { titel: string; hinweis?: string; offen?: boolean; funktion?: string; id?: string; children: React.ReactNode }) {
  return (
    <details className="group min-w-0 scroll-mt-20" open={offen} data-funktion={funktion} id={id}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-4 text-[15px] font-semibold shadow-[var(--shadow-sm)] hover:bg-[color:var(--surface-sunken)] [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition-transform group-open:rotate-90" />
        <span className="min-w-0 flex-1 truncate">{titel}</span>
        {hinweis ? <span className="shrink-0 text-xs font-normal text-[color:var(--muted)]">{hinweis}</span> : null}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
