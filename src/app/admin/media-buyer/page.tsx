import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { MediaBuyerLayout } from "./media-buyer-admin";
import { loadMediaBuyer } from "./daten";
import { KundenTabs } from "@/components/admin/kunden-tabs";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Media Buyer | performancegrowth Admin",
};

export default async function MediaBuyerPage() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    redirect("/login");
  }

  const { pools: poolRows, log, top, attribution } = await loadMediaBuyer();

  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-8">
      <KundenTabs />
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Media Buyer
        </h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          {top.monthLabel} · Tag {top.daysElapsed}/{top.daysTotal} ·{" "}
          {Math.max(0, top.daysTotal - top.daysElapsed)} Tage übrig
        </p>
      </header>

      <div className="mt-6">
        <MediaBuyerLayout
          pools={poolRows}
          log={log}
          top={top}
          attribution={attribution}
        />
      </div>
    </main>
  );
}
