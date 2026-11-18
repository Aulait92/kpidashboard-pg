// Vergleichsblatt in der Terminvorbereitung: eine Zeile mit Link (Policen auslesen, Ole 18.11.2026). Eigene,
// abgegrenzte Komponente, die Terminvorbereitung bindet sie nur ein. Nichts zu zeigen (keine Unterlagen, Auslesen aus,
// Vorschau): null.

import Link from "next/link";
import { ChevronRight, Table2 } from "lucide-react";
import { vergleichKurz } from "@/lib/policen/auslesen/server";

const euro = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

export async function PolicenVergleichKurz({ terminId, leadId, customerId, preview }: { terminId: string; leadId: string | null; customerId: string; preview: boolean }) {
  if (!leadId || preview) return null;
  const k = await vergleichKurz(leadId, customerId).catch(() => null);
  if (!k) return null;
  const teile = [
    k.vertraege
      ? `${k.vertraege} ${k.vertraege === 1 ? "Vertrag" : "Verträge"}`
      : `${k.offen} ${k.offen === 1 ? "Unterlage" : "Unterlagen"}, ${k.ohneKi ? "nicht ausgelesen auf Wunsch des Kunden" : "noch nicht ausgelesen"}`,
    k.monat != null ? `${euro(k.monat)} im Monat` : null,
  ].filter(Boolean);
  const auffaellig = k.kuendigungen + k.hinweise;
  return (
    <Link
      href={`/buyer/termine/${terminId}/vorbereitung/vertraege`}
      className="flex min-h-12 items-center gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] px-3 py-2 hover:bg-[color:var(--surface-sunken)]"
      data-vergleichsblatt-link
    >
      <Table2 className="h-4 w-4 shrink-0 text-[color:var(--brand)]" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Vergleichsblatt</span>
        <span className="block text-[13px] text-[color:var(--muted)]">{teile.join(" · ")}</span>
      </span>
      {auffaellig ? (
        <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
          {auffaellig} {auffaellig === 1 ? "Hinweis" : "Hinweise"}
        </span>
      ) : null}
      <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
    </Link>
  );
}
