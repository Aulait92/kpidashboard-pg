import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { LEVEL_LABEL, STATUS_COMPONENTS, formatUptime, isComponentKey, isLevel, overall, type StatusLevel } from "@/lib/status";
import { activeIncidents, currentStatus, statusHistory, type StatusHistory } from "@/lib/status-server";

// Öffentliche Statusseite. Getrennt von /api/status (Überwachung per JSON).
// Zeigt nur Zustände und Meldungen aus dem Admin, keine Fehlermeldungen.
export const metadata = {
  title: "Status · performancegrowth",
  description: "Aktueller Betriebszustand der performancegrowth-App.",
};

const DOT: Record<StatusLevel, string> = { ok: "bg-emerald-500", degraded: "bg-amber-500", down: "bg-rose-500" };
const PILL: Record<StatusLevel, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  degraded: "bg-amber-50 text-amber-800",
  down: "bg-rose-50 text-rose-700",
};
const BANNER: Record<StatusLevel, { cls: string; text: string }> = {
  ok: { cls: "border-emerald-200 bg-emerald-50 text-emerald-900", text: "Alle Systeme betriebsbereit" },
  degraded: { cls: "border-amber-200 bg-amber-50 text-amber-900", text: "Einzelne Funktionen eingeschränkt" },
  down: { cls: "border-rose-200 bg-rose-50 text-rose-900", text: "Störung in Teilen der App" },
};
const INCIDENT_LABEL: Record<string, string> = { info: "Hinweis", degraded: "Eingeschränkt", down: "Störung" };

const fmt = (d: Date) =>
  d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " Uhr";
const fmtDay = (d: Date) => d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });

async function load(now: Date) {
  const status = await currentStatus(now);
  try {
    const [active, recent, history] = await Promise.all([
      activeIncidents(now),
      prisma.statusIncident.findMany({
        where: { resolvedAt: { lte: now, gte: new Date(now.getTime() - 14 * 24 * 3600 * 1000) } },
        orderBy: { resolvedAt: "desc" },
        take: 10,
      }),
      statusHistory(now),
    ]);
    return { status, active, recent, history };
  } catch {
    return { status, active: [], recent: [], history: null };
  }
}

export default async function StatusPage() {
  await connection();
  const now = new Date();
  const { status, active, recent, history } = await load(now);
  const total = overall(status);
  const componentLabel = (k: string | null) => STATUS_COMPONENTS.find((c) => c.key === k)?.label;

  return (
    <main className="min-h-screen bg-white px-4 py-12">
      <article className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2563EB]">performancegrowth</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Status</h1>
        <p className="mt-2 text-sm text-[#6b7280]">Stand {fmt(now)}</p>

        <div className={`mt-8 flex items-center gap-3 rounded-xl border px-5 py-4 ${BANNER[total].cls}`}>
          <span className={`h-3 w-3 shrink-0 rounded-full ${DOT[total]}`} aria-hidden />
          <span className="text-base font-semibold">{BANNER[total].text}</span>
        </div>

        {active.length ? (
          <section className="mt-6 space-y-3">
            {active.map((i) => (
              <div key={i.id} className="rounded-xl border border-[#e5e7eb] px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${isLevel(i.level) ? PILL[i.level] : "bg-sky-50 text-sky-800"}`}>
                    {INCIDENT_LABEL[i.level] ?? "Hinweis"}
                  </span>
                  {componentLabel(i.component) ? <span className="text-xs text-[#6b7280]">{componentLabel(i.component)}</span> : null}
                </div>
                <h2 className="mt-2 font-semibold text-[#111827]">{i.title}</h2>
                {i.message ? <p className="mt-1 whitespace-pre-line text-[15px] text-[#374151]">{i.message}</p> : null}
                <p className="mt-2 text-xs text-[#6b7280]">seit {fmt(i.startsAt)}</p>
              </div>
            ))}
          </section>
        ) : null}

        <section className="mt-8 overflow-hidden rounded-xl border border-[#e5e7eb]">
          <ul className="divide-y divide-[#e5e7eb]">
            {STATUS_COMPONENTS.map((c) => (
              <li key={c.key} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-[#111827]">{c.label}</div>
                    <div className="text-sm text-[#6b7280]">{c.text}</div>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${PILL[status[c.key]]}`}>
                    <span className={`h-2 w-2 rounded-full ${DOT[status[c.key]]}`} aria-hidden />
                    {LEVEL_LABEL[status[c.key]]}
                  </span>
                </div>
                {history?.since ? <History history={history} k={c.key} /> : null}
              </li>
            ))}
          </ul>
        </section>
        {history?.since ? (
          <p className="mt-3 text-xs text-[#6b7280]">
            Verfügbarkeit aus Messungen alle 5 Minuten{history.hasFull30 ? "" : `, seit ${fmtDay(history.since)}`}. Jeder Balken ist ein Tag.
          </p>
        ) : null}

        {recent.length ? (
          <section className="mt-10">
            <h2 className="mb-3 text-lg font-bold text-[#111827]">Behobene Meldungen der letzten 14 Tage</h2>
            <ul className="space-y-3">
              {recent.map((i) => (
                <li key={i.id} className="rounded-xl border border-[#e5e7eb] px-5 py-4">
                  <div className="font-medium text-[#111827]">{i.title}</div>
                  {i.message ? <p className="mt-1 whitespace-pre-line text-sm text-[#374151]">{i.message}</p> : null}
                  <p className="mt-2 text-xs text-[#6b7280]">
                    {fmt(i.startsAt)} bis {i.resolvedAt ? fmt(i.resolvedAt) : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="mt-10 text-sm text-[#6b7280]">
          Mehr zu Hosting, Verschlüsselung und Datensicherung lesen Sie unter{" "}
          <Link href="/sicherheit" className="font-medium text-[#2563EB] hover:underline">
            Sicherheit &amp; Datenschutz
          </Link>
          .
        </p>
      </article>
    </main>
  );
}

const BAR: Record<StatusLevel, string> = { ok: "bg-emerald-400", degraded: "bg-amber-400", down: "bg-rose-500" };

function History({ history, k }: { history: StatusHistory; k: string }) {
  if (!isComponentKey(k)) return null;
  const h = history.components[k];
  const days = h.days;
  return (
    <div className="mt-3">
      <div className="flex h-7 items-stretch gap-[2px]" role="img" aria-label="Verlauf der letzten Tage">
        {days.map((d, idx) => (
          <span
            key={d.day}
            title={`${d.day.split("-").reverse().join(".")}: ${d.level ? LEVEL_LABEL[d.level] : "keine Messung"}`}
            className={`min-w-0 flex-1 rounded-[2px] ${d.level ? BAR[d.level] : "bg-[#e5e7eb]"} ${idx < days.length - 30 ? "hidden sm:block" : ""}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-[#6b7280]">
        <span>
          <span className="sm:hidden">vor 30 Tagen</span>
          <span className="hidden sm:inline">vor 90 Tagen</span>
        </span>
        <span>
          {h.uptime30 != null ? `${formatUptime(h.uptime30)} ${history.hasFull30 ? "in 30 Tagen" : "Verfügbarkeit"}` : ""}
          {history.hasFull30 && h.uptime90 != null ? <span className="hidden sm:inline"> · {formatUptime(h.uptime90)} in 90 Tagen</span> : null}
        </span>
        <span>heute</span>
      </div>
    </div>
  );
}
