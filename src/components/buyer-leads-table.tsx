import { formatDate, formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";

export type BuyerLeadRow = {
  id: string;
  createdAt: Date;
  name: string | null;
  source: string | null;
  status: string | null;
  reached: boolean;
  closedAt: Date | null;
  revenue: number;
};

function statusStyle(status: string | null, closed: boolean) {
  if (closed) return "bg-emerald-50 text-emerald-700";
  if (!status) return "bg-zinc-100 text-zinc-600";
  if (status === "Kein Interesse") return "bg-rose-50 text-rose-700";
  if (status === "Termin vereinbart" || status === "Angebot/Beratung läuft")
    return "bg-blue-50 text-blue-700";
  if (status === "Erreicht" || status === "Qualifiziert")
    return "bg-amber-50 text-amber-700";
  return "bg-zinc-100 text-zinc-600";
}

export function BuyerLeadsTable({ leads }: { leads: BuyerLeadRow[] }) {
  if (leads.length === 0) {
    return (
      <div className="rounded-2xl border border-[color:var(--border)] bg-white p-6 text-sm text-[color:var(--muted)] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
        Im gewählten Zeitraum sind keine Leads für deinen Account
        eingegangen.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.12)]">
      <div className="border-b border-[color:var(--border)] px-5 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--brand)]">
          Leads
        </div>
        <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
          Deine Leads im Zeitraum
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[560px] w-full text-sm">
          <thead className="bg-[color:var(--brand-soft)]/30 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">
            <tr>
              <th className="px-3 py-2.5 text-left">Datum</th>
              <th className="px-3 py-2.5 text-left">Name</th>
              <th className="px-3 py-2.5 text-left">Produkt</th>
              <th className="px-3 py-2.5 text-left">Status</th>
              <th className="px-3 py-2.5 text-right">Lead-Kosten</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const closed = l.closedAt != null;
              return (
                <tr
                  key={l.id}
                  className="border-b border-[color:var(--border)] last:border-b-0"
                >
                  <td className="px-3 py-2.5 tabular-nums text-[color:var(--foreground)]">
                    {formatDate(l.createdAt)}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-[color:var(--foreground)]">
                    {l.name ?? (
                      <span className="text-[color:var(--muted)]">–</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[color:var(--foreground)]">
                    {l.source ?? "–"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                        statusStyle(l.status, closed),
                      )}
                    >
                      {closed
                        ? "Abschluss"
                        : (l.status ?? "Offen")}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {l.revenue > 0 ? formatEUR(l.revenue) : "–"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
