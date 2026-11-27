import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Columns3, List } from "lucide-react";
import { BuyerFilterBar } from "@/components/buyer-filter-bar";
import { PageHeader } from "@/components/buyer-shell";
import { BuyerKanbanBody } from "@/components/buyer-kanban-body";
import { BuyerLeadsBody } from "@/components/buyer-leads-body";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { FilterChips } from "@/components/ui/filter-chips";
import { getBuyerContext } from "@/lib/buyer-context";
import { parseRangeFromSearchParams } from "@/lib/date-ranges";
import { produktWhere } from "@/lib/produkt-filter";
import { ladeProduktFilter } from "@/lib/produkt-filter-server";
import { ladeZustaendigFilter, leadScope } from "@/lib/team";
import { cn } from "@/lib/utils";

// Neue Oberfläche: „Kontakte“ = Leads-Liste und Pipeline auf einer Seite.
// Ein Klick auf einen Kontakt öffnet die Details als ganze Seite
// (/buyer/kontakte/[id]) mit „Kontakte“ zurück.

type SearchParams = Promise<{
  range?: string;
  from?: string;
  to?: string;
  q?: string;
  ansicht?: string;
  phase?: string;
  modus?: string;
  produkt?: string;
  zustaendig?: string;
}>;

export const dynamic = "force-dynamic";
export const metadata = { title: "Kontakte | performancegrowth" };

export default async function KontaktePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getBuyerContext();
  if (!session) redirect("/login");

  const sp = await searchParams;
  const { key: rangeKey, range } = parseRangeFromSearchParams(sp);
  const pipeline = sp.modus === "pipeline";

  // Produktfilter (Ole, 26.11.2026) in der Pipeline; die Liste lädt ihn selbst (components/buyer-leads-body.tsx)
  const produktFilter = pipeline ? await ladeProduktFilter(leadScope(session), sp.produkt) : null;
  const team = { customerId: session.customerId, userId: session.userId, teamRole: session.teamRole };
  const zustaendig = pipeline ? await ladeZustaendigFilter(team, sp.zustaendig) : null;

  // Umschalter behält Zeitraum und Produkt; Suche/Ansicht gelten nur für die Liste.
  const keep = new URLSearchParams();
  for (const k of ["range", "from", "to", "produkt", "zustaendig"] as const) if (sp[k]) keep.set(k, sp[k]!);
  const hrefFor = (mode: "liste" | "pipeline") => {
    const p = new URLSearchParams(keep);
    if (mode === "pipeline") p.set("modus", "pipeline");
    const qs = p.toString();
    return `/buyer/kontakte${qs ? `?${qs}` : ""}`;
  };

  return (
    <PullToRefresh>
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
                "inline-flex h-10 items-center gap-2 rounded-[var(--radius-sm)] px-4 text-[15px] font-medium transition",
                // Aktive Ansicht wie die aktive Seite in der Navigation (hellblau), nicht als zweiter blauer Hauptknopf
                t.active ? "bg-[color:var(--brand-soft)] text-[color:var(--brand-dark)]" : "text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)]",
              )}
            >
              <t.icon className="h-[18px] w-[18px]" />
              {t.label}
            </Link>
          ))}
        </div>

        <Suspense fallback={<div className="mt-6 text-base text-[color:var(--muted)]">Lade Kontakte …</div>}>
          {pipeline ? (
            <>
              {(produktFilter && produktFilter.optionen.length > 1) || zustaendig?.optionen.length ? (
                <div className="mb-4">
                  <FilterChips
                    noSearch
                    fields={[
                      ...(produktFilter && produktFilter.optionen.length > 1
                        ? [{ kind: "select" as const, key: "produkt", label: "Produkt", options: produktFilter.optionen.map((p) => ({ value: p.value, label: p.label })) }]
                        : []),
                      ...(zustaendig?.optionen.length ? [{ kind: "select" as const, key: "zustaendig", label: "Zuständig", options: zustaendig.optionen }] : []),
                    ]}
                  />
                </div>
              ) : null}
              <BuyerKanbanBody
                customerId={session.customerId}
                scope={{ ...leadScope(session), ...produktWhere(produktFilter?.aktiv ?? null), ...(zustaendig?.where ?? {}) }}
                range={range}
                // Produkt im Schlüssel: Wechsel des Filters lädt das Board neu (wie beim Zeitraum)
                rangeKey={`${range.from.toISOString()}-${range.to.toISOString()}-${produktFilter?.aktiv?.value ?? ""}-${zustaendig?.aktivLabel ?? ""}`}
                detailBase="/buyer/kontakte/"
                detailSuffix="?von=pipeline"
                minBoardWidth={960}
              />
            </>
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
