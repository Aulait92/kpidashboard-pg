import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Zugeklappte Karte (Seltenes in der Kontaktakte) im Look von Card/CardHeader, rechts eine Kurz-Info. */
export function Klappe({
  titel,
  info,
  offen = false,
  id,
  className,
  children,
  ...rest
}: {
  titel: string;
  info?: React.ReactNode;
  offen?: boolean;
  id?: string;
  className?: string;
  children: React.ReactNode;
  "data-funktion"?: string;
}) {
  return (
    <details
      id={id}
      open={offen}
      className={cn("group scroll-mt-20 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-md)]", className)}
      {...rest}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 select-none group-open:border-b group-open:border-[color:var(--border)] [&::-webkit-details-marker]:hidden">
        <h2 className="text-[15px] font-semibold tracking-tight">{titel}</h2>
        <span className="flex min-w-0 items-center gap-2 text-xs text-[color:var(--muted)]">
          <span className="truncate">{info}</span>
          <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
        </span>
      </summary>
      {children}
    </details>
  );
}
