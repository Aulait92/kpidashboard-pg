import Link from "next/link";
import { requireAuth } from "@/lib/vertrieb/auth";
import { listReports, loadReportSettings } from "@/lib/monatsbericht/server";
import { monthLabel, previousMonthKey, shiftMonth, STATUS_LABEL } from "@/lib/monatsbericht/shared";
import { GenerateNow } from "./forms";

export const metadata = { title: "Monatsberichte | performancegrowth Admin" };

const RATING_TONE: Record<string, string> = {
  gut: "bg-emerald-50 text-emerald-800",
  mittel: "bg-amber-50 text-amber-800",
  schwach: "bg-rose-50 text-rose-800",
};

export default async function MonatsberichtePage({ searchParams }: { searchParams: Promise<{ monat?: string }> }) {
  await requireAuth();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.monat ?? "") ? sp.monat! : previousMonthKey(new Date());
  const [rows, settings] = await Promise.all([listReports(month), loadReportSettings()]);
  const counts = { draft: 0, sent: 0, skipped: 0, call: 0 } as Record<string, number>;
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Monatsberichte</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Einstufung ist intern. Nur „gut“ kann automatisch raus{settings.autoSendGood ? "" : " – ist derzeit aus, du siehst alles zuerst"}. Mittel und schwach gehen nie automatisch raus.
          </p>
        </div>
        <Link href="/admin/einstellungen/monatsberichte" className="text-sm text-[color:var(--brand)] hover:underline">Einstellungen</Link>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
        <Link className="btn-ghost h-9" href={`/admin/monatsberichte?monat=${shiftMonth(month, -1)}`}>← {monthLabel(shiftMonth(month, -1))}</Link>
        <span className="font-semibold">{monthLabel(month)}</span>
        <Link className="btn-ghost h-9" href={`/admin/monatsberichte?monat=${shiftMonth(month, 1)}`}>{monthLabel(shiftMonth(month, 1))} →</Link>
        <span className="text-[color:var(--muted)]">
          {counts.draft} Entwurf · {counts.sent} gesendet · {counts.call} Anruf · {counts.skipped} ausgesetzt
        </span>
      </div>
      <div className="mt-3">
        <GenerateNow month={month} />
      </div>

      <div className="mt-5 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
        {rows.length ? (
          <ul className="divide-y divide-[color:var(--border)]">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/monatsberichte/${r.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50" data-report-row={r.status}>
                  <span className="min-w-0 flex-1 font-medium">{r.customer.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RATING_TONE[r.rating] ?? ""}`}>{r.rating}</span>
                  {r.dataQuality === "unsicher" ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Daten unsicher</span> : null}
                  <span className="text-sm text-[color:var(--muted)]">{STATUS_LABEL[r.status] ?? r.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-sm text-[color:var(--muted)]">Für {monthLabel(month)} gibt es noch keine Berichte. Sie entstehen automatisch ab dem 2. des Folgemonats.</p>
        )}
      </div>
    </main>
  );
}
