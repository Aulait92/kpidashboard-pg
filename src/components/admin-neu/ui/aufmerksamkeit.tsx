import Link from "next/link";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock, Inbox } from "lucide-react";
import type { HeuteItem, HeuteTone } from "@/lib/admin-heute";
import { NEU } from "@/lib/admin-neu/navigation";
import { cn } from "@/lib/utils";

// Seitenmuster Admin v2 (Paket A2, Demo docs/ux/admin-v2/demo.html „att“): oben auf jeder Rollen-Startseite
// „Braucht Aufmerksamkeit“ mit den Punkten dieser Rolle aus Mein Tag (lib/admin-heute.ts, lib/admin-neu/rollen.ts).
// Je Punkt eine Zeile mit einem Knopf zur Stelle, an der man es erledigt; Schnellknöpfe (Erledigt, Morgen …) gibt es
// auf Mein Tag. Höchstens `max` Zeilen, der Rest als Link auf Mein Tag (oder mit `restAufklappen` zum Aufklappen, für
// Punkte, die es nur auf dieser Seite gibt, z. B. Verkaufen → Termine). Ohne Punkte eine Zeile „Alles erledigt“.

const TON: Record<HeuteTone, { icon: typeof AlertCircle; farbe: string }> = {
  bad: { icon: AlertCircle, farbe: "bg-rose-50 text-rose-600" },
  warn: { icon: Clock, farbe: "bg-amber-50 text-amber-700" },
  info: { icon: Inbox, farbe: "bg-[color:var(--brand-soft)] text-[color:var(--brand)]" },
};

export function Aufmerksamkeit({
  punkte,
  max = 3,
  leer = "Alles erledigt, hier braucht gerade nichts Ihre Aufmerksamkeit.",
  restAufklappen = false,
}: {
  punkte: HeuteItem[] | null;
  max?: number;
  leer?: string;
  restAufklappen?: boolean;
}) {
  // null = Laden fehlgeschlagen (lib/admin-neu/rollen-server.ts): Block weglassen statt „Alles erledigt“ zu behaupten
  if (!punkte) return null;
  if (!punkte.length) {
    return (
      <section aria-label="Braucht Aufmerksamkeit" className="mb-5 flex min-h-12 items-center gap-3 rounded-[var(--radius-lg)] border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
        <span>{leer}</span>
      </section>
    );
  }
  const sichtbar = punkte.slice(0, max);
  const rest = punkte.length - sichtbar.length;
  return (
    <section aria-label="Braucht Aufmerksamkeit" className="mb-5 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2 px-4 pb-1 pt-3">
        <h2 className="text-[15px] font-semibold">Braucht Aufmerksamkeit</h2>
        <span className="rounded-full bg-[color:var(--brand-soft)] px-2 text-xs font-semibold leading-5 text-[color:var(--brand-dark)]">{punkte.length}</span>
      </div>
      <ul className="divide-y divide-[color:var(--border)]">{sichtbar.map(zeile)}</ul>
      {rest > 0 && restAufklappen ? (
        <details className="group border-t border-[color:var(--border)]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center gap-1 text-sm font-medium text-[color:var(--brand)] hover:bg-[color:var(--surface-sunken)] group-open:hidden [&::-webkit-details-marker]:hidden">
            {rest === 1 ? "1 weiteren Punkt anzeigen" : `${rest} weitere Punkte anzeigen`}
            <ChevronDown className="h-4 w-4" />
          </summary>
          <ul className="divide-y divide-[color:var(--border)]">{punkte.slice(max).map(zeile)}</ul>
        </details>
      ) : rest > 0 ? (
        <Link href={NEU} className="flex min-h-11 items-center justify-center gap-1 border-t border-[color:var(--border)] text-sm font-medium text-[color:var(--brand)] hover:bg-[color:var(--surface-sunken)]">
          {rest === 1 ? "1 weiterer Punkt" : `${rest} weitere Punkte`} auf Mein Tag
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : null}
    </section>
  );
}

/** Eine Zeile: Punkt mit Knopf zur Stelle, an der man ihn erledigt. */
function zeile(p: HeuteItem) {
  const t = TON[p.tone];
  return (
    <li key={p.key}>
      <Link href={p.action.href} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition hover:bg-[color:var(--surface-sunken)]">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", t.farbe)}>
          <t.icon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{p.title}</span>
          {p.detail ? <span className="block truncate text-sm text-[color:var(--muted)]">{p.detail}</span> : null}
        </span>
        <span className="hidden shrink-0 items-center gap-0.5 text-sm font-semibold text-[color:var(--brand)] sm:inline-flex">
          {p.action.label}
          <ChevronRight className="h-4 w-4" />
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)] sm:hidden" />
      </Link>
    </li>
  );
}
