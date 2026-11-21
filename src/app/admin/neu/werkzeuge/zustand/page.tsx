import Link from "next/link";
import { connection } from "next/server";
import { AlertCircle, CheckCircle2, ChevronRight, CircleDashed, Clock } from "lucide-react";
import { Seite } from "@/components/admin-neu/ui/seite";
import { NEU } from "@/lib/admin-neu/navigation";
import { zusammenfassung, type Ampel } from "@/lib/admin-neu/systemzustand";
import { ladeSystemzustand } from "@/lib/admin-neu/systemzustand-server";
import { requireAuth } from "@/lib/vertrieb/auth";
import { cn } from "@/lib/utils";

export const metadata = { title: "Systemzustand | performancegrowth Admin" };

// Einstellungen › Technik › Systemzustand (Admin v2, Paket A5 „Zusammenlegen“; bis 20.11.2026 unter Werkzeuge): alle
// technischen Prüfungen auf einer Seite statt verteilt über Status, Anbindungen, Rechnungsangaben, Kosten & Bank,
// Qualität und Werbekonten. Probleme zuerst, je Zeile ein Satz und der Weg zur Stelle, an der man es behebt. Punkte
// „Hintergrund-Jobs“ auf Mein Tag führen hierher. Die Zeile „Statusseite für Kunden“ führt zu Statusseite & Support.

const AMPEL: Record<Ampel, { icon: typeof AlertCircle; farbe: string; label: string }> = {
  fehler: { icon: AlertCircle, farbe: "bg-rose-50 text-rose-600", label: "Fehler" },
  warnung: { icon: Clock, farbe: "bg-amber-50 text-amber-700", label: "Prüfen" },
  aus: { icon: CircleDashed, farbe: "bg-slate-100 text-slate-500", label: "Nicht eingerichtet" },
  ok: { icon: CheckCircle2, farbe: "bg-emerald-50 text-emerald-600", label: "In Ordnung" },
};

export default async function Systemzustand() {
  await connection();
  await requireAuth();
  const pruefungen = await ladeSystemzustand();
  const { text } = zusammenfassung(pruefungen);
  return (
    <Seite titel="Systemzustand" untertitel={text} zurueck={{ href: `${NEU}/einstellungen`, label: "Einstellungen" }}>
      <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]" data-systemzustand="">
        {pruefungen.map((p) => {
          const a = AMPEL[p.ampel];
          return (
            <li key={p.key} data-pruefung={p.key} data-ampel={p.ampel}>
              <Link href={p.href} className="flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-[color:var(--surface-sunken)] sm:px-5">
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", a.farbe)} title={a.label}>
                  <a.icon className="h-[18px] w-[18px]" />
                  <span className="sr-only">{a.label}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{p.titel}</span>
                  <span className="block text-sm text-[color:var(--muted)]">{p.text}</span>
                </span>
                <span className="hidden shrink-0 items-center gap-0.5 text-sm font-semibold text-[color:var(--brand)] sm:inline-flex">
                  {p.knopf}
                  <ChevronRight className="h-4 w-4" />
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)] sm:hidden" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Seite>
  );
}
