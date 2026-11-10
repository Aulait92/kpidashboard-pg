import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/live-refresh";
import { BuyerFilterBar } from "@/components/buyer-filter-bar";
import { PageHeader } from "@/components/buyer-shell";
import { BuyerKanbanBody } from "@/components/buyer-kanban-body";
import { LiveUpdated } from "@/components/live-updated";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { getBuyerContext } from "@/lib/buyer-context";
import { isNewUi } from "@/lib/new-ui";
import { leadScope } from "@/lib/team";
import { parseRangeFromSearchParams } from "@/lib/date-ranges";
import { nowMs } from "@/lib/now";

type SearchParams = Promise<{
  range?: string;
  from?: string;
  to?: string;
}>;

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Kanban | performancegrowth",
};

export default async function BuyerKanbanPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getBuyerContext();
  if (!session) {
    redirect("/login");
  }

  const sp = await searchParams;
  // Neue Oberfläche: Leads und Pipeline leben unter „Kontakte“.
  if (await isNewUi(session.customerId)) {
    const qs = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"));
    qs.set("modus", "pipeline");
    redirect(`/buyer/kontakte${qs.size ? `?${qs.toString()}` : ""}`);
  }
  const { key: rangeKey, range } = parseRangeFromSearchParams(sp);
  const renderedAt = nowMs();


  return (
    <PullToRefresh>
      <LiveRefresh />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          title="Pipeline"
          subtitle={
            <>
              Aktualisiert <LiveUpdated since={renderedAt} />
            </>
          }
          actions={
            <BuyerFilterBar
              currentRange={rangeKey}
              customFrom={sp.from}
              customTo={sp.to}
            />
          }
        />

        <Suspense
          fallback={
            <div className="mt-6 text-sm text-[color:var(--muted)]">
              Lade Kanban…
            </div>
          }
        >
          <BuyerKanbanBody
            customerId={session.customerId}
            scope={leadScope(session)}
            range={range}
            rangeKey={`${range.from.toISOString()}-${range.to.toISOString()}`}
          />
        </Suspense>
      </main>
    </PullToRefresh>
  );
}
