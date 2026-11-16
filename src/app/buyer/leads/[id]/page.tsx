import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LeadDetailBody } from "@/components/lead-detail-body";
import { getBuyerContext } from "@/lib/buyer-context";
import { isNewUi } from "@/lib/new-ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Kontakt | performancegrowth",
};

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await getBuyerContext();
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  // Back-Link folgt dem Tab, aus dem die Detail-Ansicht geöffnet wurde.
  // Default = Leads-Tab (für direkte URL-Aufrufe).
  const { from } = await searchParams;
  const backHref = from === "kanban" ? "/buyer/kanban" : "/buyer/leads";
  const newUi = await isNewUi(session.customerId);
  // Gleiche Begriffe und gleicher Zurück-Link wie auf /buyer/kontakte/[id] (Ole, 16.11.2026: überall „Kontakte“)
  const backLabel = from === "kanban" ? "Pipeline" : newUi ? "Alle Kontakte" : "Alle Leads";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href={backHref}
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-base font-medium text-[color:var(--brand)] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>
      <LeadDetailBody leadId={id} team={session} newUi={newUi} />
    </main>
  );
}
