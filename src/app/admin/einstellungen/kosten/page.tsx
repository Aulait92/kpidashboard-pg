import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { COST_PURPOSE_LABEL, loadKpiSettings, type CostPurpose } from "@/lib/zahlen";
import { deleteRecurringCostAction } from "@/app/admin/zahlen/actions";
import { CostForm, KpiSettingsForm } from "./forms";

export const metadata = { title: "Laufende Kosten | performancegrowth Admin" };

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const day = (d: Date) => d.toISOString().slice(0, 10);

// Laufende Kosten (Tools, eigene Werbung) mit Zweck – Grundlage für Marge und
// Kundengewinnungskosten auf der Zahlen-Seite.
export default async function KostenPage() {
  await requireAuth();
  const [costs, settings] = await Promise.all([prisma.recurringCost.findMany({ orderBy: [{ purpose: "asc" }, { name: "asc" }] }), loadKpiSettings()]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-8 sm:px-6">
      <div>
        <Link href="/admin/einstellungen" className="text-xs text-[color:var(--brand)] hover:underline">← Einstellungen</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Laufende Kosten</h1>
        <p className="text-sm text-[color:var(--muted)]">
          Monatliche Kosten mit Zweck. Direkte Kosten senken die Marge, Kundengewinnung fließt in die Kosten je Neukunde. Meta-Werbung kommt automatisch aus dem Abgleich.
        </p>
        <p className="mt-1 text-sm">
          Ausgaben, die über{" "}
          <Link href="/admin/einstellungen/bank" className="text-[color:var(--brand)] hover:underline">Bank & Karten</Link>{" "}
          kommen, hier nicht zusätzlich eintragen (sonst doppelt gezählt).
        </p>
      </div>

      <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
        {costs.length ? (
          <ul className="divide-y divide-[color:var(--border)]">
            {costs.map((c) => (
              <li key={c.id} className="px-4 py-3">
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 flex-1 font-medium">{c.name}</span>
                    <span className="text-sm text-[color:var(--muted)]">{COST_PURPOSE_LABEL[c.purpose as CostPurpose] ?? c.purpose}</span>
                    <span className="w-28 text-right font-semibold tabular-nums">{eur(Number(c.monthlyAmount))}/Monat</span>
                    <span className="w-full text-xs text-[color:var(--muted)] sm:w-auto">
                      ab {c.startsAt.toLocaleDateString("de-DE")}
                      {c.endsAt ? ` bis ${c.endsAt.toLocaleDateString("de-DE")}` : ""}
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
        ) : (
          <p className="px-4 py-6 text-center text-sm text-[color:var(--muted)]">Noch keine laufenden Kosten. Typisch: Instantly (Kundengewinnung), Zapier (Pay-per-Lead), Claude (Software).</p>
        )}
      </section>

      <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-sm)] sm:p-5">
        <h2 className="mb-3 font-semibold">Neue Kosten</h2>
        <CostForm cost={{ id: "", name: "", amount: "", purpose: "ppl", startsAt: today, endsAt: "" }} />
      </section>

      <section className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-sm)] sm:p-5">
        <h2 className="font-semibold">Kundengewinnung</h2>
        <p className="mb-3 text-sm text-[color:var(--muted)]">Gründerzeit für „Kosten je Neukunde mit Gründerzeit“ und die Meta-Kampagnen, die der eigenen Kundengewinnung dienen.</p>
        <KpiSettingsForm hours={settings.founderHoursPerWeek} rate={settings.founderHourlyRate} campaigns={settings.acquisitionCampaigns.join(", ")} pplPilotEnd={settings.pplPilotEnd} />
      </section>
    </main>
  );
}
