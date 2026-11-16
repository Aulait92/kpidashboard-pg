import { ZahlenTabs } from "@/components/admin/zahlen-tabs";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { computeUsageReport } from "@/lib/usage-report";
import { HilfeAnfragenKarte, KiHilfeKarte, NutzungJeKunde } from "@/components/admin/nutzung-bausteine";
import { loadHelpQuestions } from "@/lib/hilfe-report";
import { loadSupportRequests } from "@/lib/support-server";
import { ModuleCandidatesCard } from "./module-card";
import { NpsCard } from "./nps-card";

// Nutzung des Kunden-CRMs: Aktivität, genutzte Funktionen, Fehler, Feedback
// und liegen gebliebene Aufgaben – Grundlage für UX-Verbesserungen.
export const dynamic = "force-dynamic";
export const metadata = { title: "Nutzung | performancegrowth Admin" };

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ days?: string; ankuendigung?: string }> }) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") redirect("/login");
  const sp = await searchParams;
  const days = Math.min(90, Math.max(1, Number(sp.days ?? 14) || 14));
  const [report, help, support] = await Promise.all([computeUsageReport(days), loadHelpQuestions(days), loadSupportRequests(days)]);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <ZahlenTabs />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Nutzung</h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Letzte {days} Tage, ohne Admin-Vorschau
          </p>
        </div>
        <div className="flex gap-1 text-xs font-semibold">
          {[7, 14, 30].map((d) => (
            <a
              key={d}
              href={`/admin/nutzung?days=${d}`}
              className={`inline-flex min-h-10 items-center rounded-full px-3 ${d === days ? "bg-[color:var(--foreground)] text-white" : "border border-[color:var(--border)] bg-white"}`}
            >
              {d} Tage
            </a>
          ))}
        </div>
      </div>

      <NpsCard />

      <ModuleCandidatesCard message={sp.ankuendigung ?? null} />

      <HilfeAnfragenKarte support={support} />

      <KiHilfeKarte help={help} />

      <NutzungJeKunde report={report} />
    </main>
  );
}
