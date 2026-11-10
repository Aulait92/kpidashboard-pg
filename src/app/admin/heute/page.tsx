import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CheckCircle2, ChevronRight, TrendingUp } from "lucide-react";
import { greeting, loadAdminHeute, summary, type HeuteArea } from "@/lib/admin-heute";
import { computeMonthlyForecast } from "@/lib/forecast";
import { reportError } from "@/lib/monitoring";
import { requireAuth } from "@/lib/vertrieb/auth";
import { RememberList } from "@/components/admin/list-memory";
import { HeuteList } from "@/components/admin/heute-list";
import { HEUTE_ICONS as ICONS } from "@/components/admin/heute-icons";
import { cn } from "@/lib/utils";

export const metadata = { title: "Heute | KPI-Dashboard" };

const FILTERS: { key: string; label: string; areas: HeuteArea[] }[] = [
  { key: "", label: "Alle", areas: [] },
  { key: "vertrieb", label: "Vertrieb", areas: ["Vertrieb"] },
  { key: "kunden", label: "Kunden", areas: ["Kunden"] },
  { key: "leads", label: "Leads", areas: ["Leads", "Pay-per-Lead"] },
];

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

// Startseite der neuen Admin-Oberfläche: alles, was Sie heute brauchen, aus
// allen Bereichen in einer Liste – mit einem Knopf direkt zur richtigen Stelle.
export default async function AdminHeutePage({ searchParams }: { searchParams: Promise<{ bereich?: string }> }) {
  await connection();
  const session = await requireAuth();
  const { bereich = "" } = await searchParams;
  const now = new Date();
  const [{ items, auto }, forecast] = await Promise.all([
    loadAdminHeute(now, session.userId),
    computeMonthlyForecast({ customerId: null, revenueLabel: "Umsatz" }).catch((err) => {
      reportError(err, "admin-heute-forecast");
      return null;
    }),
  ]);
  const filter = FILTERS.find((f) => f.key === bereich) ?? FILTERS[0];
  const shown = filter.areas.length ? items.filter((i) => filter.areas.includes(i.area)) : items;
  const hour = Number(new Intl.DateTimeFormat("de-DE", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Berlin" }).format(now));
  const revenue = forecast?.rows.find((r) => r.label === "Umsatz");
  const profit = forecast?.rows.find((r) => /gewinn/i.test(r.label));

  return (
    <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <Suspense fallback={null}>
        <RememberList id="vertrieb" paths={["/admin/heute"]} />
        <RememberList id="kunden" paths={["/admin/heute"]} />
      </Suspense>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">{greeting(hour)}</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">{summary(items)}</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <section aria-label="Braucht Sie">
          {items.length ? (
            <div className="mb-3 flex gap-1.5 overflow-x-auto" role="group" aria-label="Bereich">
              {FILTERS.map((f) => {
                const n = f.areas.length ? items.filter((i) => f.areas.includes(i.area)).length : items.length;
                const active = f.key === filter.key;
                return (
                  <Link
                    key={f.key}
                    href={f.key ? `/admin/heute?bereich=${f.key}` : "/admin/heute"}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition",
                      active
                        ? "border-[color:var(--foreground)] bg-[color:var(--foreground)] text-white"
                        : "border-[color:var(--border)] bg-white text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
                    )}
                  >
                    {f.label}
                    <span className={cn("text-xs", active ? "text-white/70" : "")}>{n}</span>
                  </Link>
                );
              })}
            </div>
          ) : null}
          {shown.length ? (
            <HeuteList items={shown} />
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-4 py-12 text-center shadow-[var(--shadow-sm)]">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" strokeWidth={1.5} />
              <p className="font-medium">{items.length ? "In diesem Bereich ist alles erledigt." : "Alles erledigt."}</p>
              <p className="text-sm text-[color:var(--muted)]">Neue Punkte erscheinen hier automatisch.</p>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section>
            <h2 className="mb-1 text-base font-semibold">Läuft von allein</h2>
            <p className="mb-3 text-sm text-[color:var(--muted)]">Das hat die App in den letzten 7 Tagen erledigt, ohne Sie zu fragen.</p>
            {auto.length ? (
              <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
                {auto.map((r) => {
                  const Icon = ICONS[r.icon];
                  return (
                    <li key={r.key} className="flex gap-3 px-4 py-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-sunken)] text-[color:var(--muted)]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{r.title}</div>
                        <div className="text-xs text-[color:var(--muted)]">{r.detail}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] px-4 py-6 text-center text-sm text-[color:var(--muted)]">
                In den letzten 7 Tagen ist noch nichts automatisch gelaufen.
              </p>
            )}
          </section>

          {revenue ? (
            <section>
              <h2 className="mb-3 text-base font-semibold">Zahlen</h2>
              <Link
                href="/"
                className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-4 py-3 shadow-[var(--shadow-sm)] transition hover:border-[color:var(--border-strong)]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[color:var(--brand)]">
                  <TrendingUp className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {profit ? `${profit.label} bis heute: ${eur(profit.mtd)}` : `Umsatz bis heute: ${eur(revenue.mtd)}`}
                  </span>
                  <span className="block text-xs text-[color:var(--muted)]">
                    Hochrechnung Monat: Umsatz {eur(revenue.projected)}
                    {profit ? ` · ${profit.label} ${eur(profit.projected)}` : ""}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
              </Link>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
