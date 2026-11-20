import { prisma } from "@/lib/prisma";
import { COST_PURPOSE_LABEL, loadKpiSettings, type CostPurpose } from "@/lib/zahlen";
import { deleteRecurringCostAction } from "@/app/admin/zahlen/actions";
import { CostForm } from "@/app/admin/einstellungen/kosten/forms";

// Laufende Kosten: gemeinsam für /admin/einstellungen/kosten und /admin/neu/zahlen/kosten.

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const day = (d: Date) => d.toISOString().slice(0, 10);

export async function ladeKosten() {
  const [costs, settings] = await Promise.all([prisma.recurringCost.findMany({ orderBy: [{ purpose: "asc" }, { name: "asc" }] }), loadKpiSettings()]);
  return { costs, settings };
}

/** Liste der laufenden Kosten; je Zeile aufklappen zum Ändern oder Löschen. */
export function LaufendeKostenListe({ costs }: { costs: Awaited<ReturnType<typeof ladeKosten>>["costs"] }) {
  if (!costs.length) {
    return <p className="px-4 py-6 text-center text-sm text-[color:var(--muted)]">Noch keine laufenden Kosten. Typisch: Instantly (Kundengewinnung), Zapier (Pay-per-Lead), Claude (Software).</p>;
  }
  return (
    <ul className="divide-y divide-[color:var(--border)]">
      {costs.map((c) => (
        <li key={c.id} className="px-4 py-3">
          <details>
            <summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{c.name}</span>
                <span className="block text-xs text-[color:var(--muted)]">
                  {COST_PURPOSE_LABEL[c.purpose as CostPurpose] ?? c.purpose} · ab {c.startsAt.toLocaleDateString("de-DE")}
                  {c.endsAt ? ` bis ${c.endsAt.toLocaleDateString("de-DE")}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right font-semibold tabular-nums">
                {eur(Number(c.monthlyAmount))}
                <span className="block text-xs font-normal text-[color:var(--muted)]">im Monat</span>
              </span>
            </summary>
            <div className="mt-3 space-y-2">
              <CostForm cost={{ id: c.id, name: c.name, amount: String(Number(c.monthlyAmount)).replace(".", ","), purpose: c.purpose, startsAt: day(c.startsAt), endsAt: c.endsAt ? day(c.endsAt) : "" }} />
              <form action={deleteRecurringCostAction}>
                <input type="hidden" name="id" value={c.id} />
                <button className="text-sm text-rose-600 hover:underline">Löschen</button>
              </form>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
