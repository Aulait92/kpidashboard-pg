import { ClipboardCheck } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import type { BdNutzung } from "@/lib/beratungsdoku-server";

// Nutzung der Beratungsdokumentation (Paket B, Ole 18.11.2026) unter Betreuen › Qualität & Nutzung: wie viele Vermittler
// sie eingeschaltet haben und wie viele ihrer Termine im Zeitraum dokumentiert sind (gesendet, bestätigt). Daten:
// lib/beratungsdoku-server.ts bdNutzung.

const zahl = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);
const tag = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "numeric", month: "numeric", year: "2-digit" }).format(d);

/** Kurzfassung für die Zeile des Aufklappers. */
export function bdNutzungHinweis(n: BdNutzung): string {
  if (!n.eingeschaltet) return "noch niemand eingeschaltet";
  return `${n.eingeschaltet} eingeschaltet${n.jeTermin != null ? ` · ${zahl(n.jeTermin)} je Termin` : ""}`;
}

export function BeratungsdokuNutzung({ n, tage }: { n: BdNutzung; tage: number }) {
  if (!n.eingeschaltet) {
    return (
      <Card>
        <EmptyState icon={ClipboardCheck} title="Noch kein Vermittler hat sie eingeschaltet" text="Der Schalter steht beim Vermittler unter Einstellungen → Beratung und optional in der Einrichtung." />
      </Card>
    );
  }
  const kacheln = [
    { label: "Eingeschaltet", wert: zahl(n.eingeschaltet) },
    { label: `Termine (${tage} Tage)`, wert: zahl(n.termine) },
    { label: "Dokumentiert je Termin", wert: n.jeTermin != null ? zahl(n.jeTermin) : "–" },
    { label: "Bestätigt / gesendet", wert: `${zahl(n.bestaetigt)} / ${zahl(n.gesendet)}` },
  ];
  return (
    <Card id="beratungsdoku-nutzung">
      <div className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-4">
        {kacheln.map((k) => (
          <div key={k.label}>
            <p className="text-xs text-[color:var(--muted)]">{k.label}</p>
            <p className="text-xl font-semibold tracking-tight">{k.wert}</p>
          </div>
        ))}
      </div>
      <ul className="divide-y divide-[color:var(--border)] border-t border-[color:var(--border)]">
        {n.kunden.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-5 py-2.5 text-sm">
            <a href={`/admin/kunden/${k.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
              {k.name}
            </a>
            <span className="text-xs text-[color:var(--muted)]">
              {k.anSeit ? `an seit ${tag(k.anSeit)} · ` : ""}
              {k.dokumentiert} von {k.termine} Terminen dokumentiert · {k.bestaetigt} bestätigt
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
