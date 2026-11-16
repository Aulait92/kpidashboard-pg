import { ChevronDown } from "lucide-react";

// Zugeklappte Karte mit Titel und dem aktuellen Stand in einer Zeile (UX-Regel: Seltenes einklappen).
// Gleiches Muster wie „Einstellungen dieses Kunden“ in der alten Kundenakte.
export function Aufklapp({
  titel,
  zusammenfassung,
  offen = false,
  id,
  children,
}: {
  titel: string;
  zusammenfassung?: React.ReactNode;
  offen?: boolean;
  /** Sprungmarke; ein Link auf #id klappt die Karte nicht auf, zeigt sie aber */
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <details
      id={id}
      open={offen}
      className="group scroll-mt-20 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-md)]"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-5 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold tracking-tight">{titel}</span>
          {zusammenfassung ? <span className="block truncate text-xs text-[color:var(--muted)]">{zusammenfassung}</span> : null}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[color:var(--muted)] transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-[color:var(--border)] bg-[color:var(--surface-sunken)] p-3">{children}</div>
    </details>
  );
}
