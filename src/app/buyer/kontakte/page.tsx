import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Columns3, List } from "lucide-react";
import { LiveRefresh } from "@/components/live-refresh";
import { BuyerFilterBar } from "@/components/buyer-filter-bar";
import { PageHeader } from "@/components/buyer-shell";
import { BuyerKanbanBody } from "@/components/buyer-kanban-body";
import { BuyerLeadsBody } from "@/components/buyer-leads-body";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { getBuyerContext } from "@/lib/buyer-context";
import { parseRangeFromSearchParams } from "@/lib/date-ranges";
import { leadScope } from "@/lib/team";
import { cn } from "@/lib/utils";

// Neue Oberfläche: „Kontakte“ = Leads-Liste und Pipeline auf einer Seite.
// Ein Klick auf einen Kontakt öffnet die Details als ganze Seite
// (/buyer/kontakte/[id]) mit „Alle Kontakte“ zurück.

type SearchParams = Promise<{
  range?: string;
  from?: string;
  to?: string;
  q?: string;
  ansicht?: string;
  phase?: string;
  modus?: string;
}>;

export const dynamic = "force-dynamic";
export const metadata = { title: "Kontakte | performancegrowth" };

export default async function KontaktePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getBuyerContext();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const { key: rangeKey, range } = parseRangeFromSearchParams(sp);
  const pipeline = sp.modus === "pipeline";

  // Umschalter behält den Zeitraum; Suche/Ansicht gelten nur für die Liste.
  const keep = new URLSearchParams();
  for (const k of ["range", "from", "to"] as const) if (sp[k]) keep.set(k, sp[k]!);
  const hrefFor = (mode: "liste" | "pipeline") => {
    const p = new URLSearchParams(keep);
    if (mode === "pipeline") p.set("modus", "pipeline");
    const qs = p.toString();
    return `/buyer/kontakte${qs ? `?${qs}` : ""}`;
  };

  return (
    <PullToRefresh>
      <LiveRefresh />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          title="Kontakte"
          actions={<BuyerFilterBar currentRange={rangeKey} customFrom={sp.from} customTo={sp.to} />}
        />
        <div role="tablist" aria-label="Darstellung" className="mb-5 inline-flex rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white p-1">
          {(
            [
              { mode: "liste", label: "Liste", icon: List, active: !pipeline },
              { mode: "pipeline", label: "Pipeline", icon: Columns3, active: pipeline },
            ] as const
          ).map((t) => (
            <Link
              key={t.mode}
              href={hrefFor(t.mode)}
              role="tab"
              aria-selected={t.active}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] px-4 text-base font-medium transition",
                t.active ? "bg-[color:var(--brand)] text-white" : "text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)]",
              )}
            >
              <t.icon className="h-[18px] w-[18px]" />
              {t.label}
            </Link>
          ))}
        </div>

        <Suspense fallback={<div className="mt-6 text-base text-[color:var(--muted)]">Lade Kontakte …</div>}>
          {pipeline ? (
            <BuyerKanbanBody
              customerId={session.customerId}
              scope={leadScope(session)}
              range={range}
              rangeKey={`${range.from.toISOString()}-${range.to.toISOString()}`}
              detailBase="/buyer/kontakte/"
              detailSuffix="?von=pipeline"
              minBoardWidth={1440}
            />
          ) : (
            <BuyerLeadsBody
              customerId={session.customerId}
              team={{ customerId: session.customerId, userId: session.userId, teamRole: session.teamRole }}
              range={range}
              q={(sp.q ?? "").trim()}
              view={sp.ansicht ?? ""}
              phaseKey={sp.phase ?? ""}
              params={sp}
              basePath="/buyer/kontakte"
              detailBase="/buyer/kontakte/"
              detailSuffix="?von=liste"
            />
          )}
        </Suspense>
      </main>
    </PullToRefresh>
  );
}
