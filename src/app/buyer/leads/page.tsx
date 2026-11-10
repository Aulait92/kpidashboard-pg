import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/live-refresh";
import { BuyerFilterBar } from "@/components/buyer-filter-bar";
import { PageHeader } from "@/components/buyer-shell";
import { BuyerLeadsBody } from "@/components/buyer-leads-body";
import { LiveUpdated } from "@/components/live-updated";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { getBuyerContext } from "@/lib/buyer-context";
import { isNewUi } from "@/lib/new-ui";
import { parseRangeFromSearchParams } from "@/lib/date-ranges";
import { nowMs } from "@/lib/now";

type SearchParams = Promise<{
  range?: string;
  from?: string;
  to?: string;
  q?: string;
  ansicht?: string;
  phase?: string;
}>;

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Leads | performancegrowth",
};

export default async function BuyerLeadsPage({
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
    redirect(`/buyer/kontakte${qs.size ? `?${qs.toString()}` : ""}`);
  }
  const { key: rangeKey, range } = parseRangeFromSearchParams(sp);
  const renderedAt = nowMs();


  return (
    <PullToRefresh>
      <LiveRefresh />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          title="Leads"
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
              Lade Leads…
            </div>
          }
        >
          <BuyerLeadsBody
            customerId={session.customerId}
            team={{ customerId: session.customerId, userId: session.userId, teamRole: session.teamRole }}
            range={range}
            q={(sp.q ?? "").trim()}
            view={sp.ansicht ?? ""}
            phaseKey={sp.phase ?? ""}
            params={sp}
          />
        </Suspense>
      </main>
    </PullToRefresh>
  );
}
