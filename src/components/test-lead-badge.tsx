import { cn } from "@/lib/utils";

/** Abzeichen „Test“ für Testleads (lib/testlead.ts), gleiche Farbe wie das Abzeichen für Testkunden im Admin. */
export function TestLeadBadge({ className }: { className?: string }) {
  return (
    <span
      title="Testlead: zählt nicht in Zahlen, Kosten und Abrechnung"
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-inset ring-amber-200",
        className,
      )}
      data-testlead
    >
      Test
    </span>
  );
}
