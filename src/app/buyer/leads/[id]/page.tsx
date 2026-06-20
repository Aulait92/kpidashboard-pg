import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LeadDetailBody } from "@/components/lead-detail-body";
import { getCurrentSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Lead-Detail | performancegrowth",
};

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session || session.role !== "BUYER" || !session.customerId) {
    redirect("/login");
  }

  const { id } = await params;
  // Back-Link folgt dem Tab, aus dem die Detail-Ansicht geöffnet wurde.
  // Default = Leads-Tab (für direkte URL-Aufrufe).
  const { from } = await searchParams;
  const backHref = from === "kanban" ? "/buyer/kanban" : "/buyer/leads";
  const backLabel =
    from === "kanban" ? "Zurück zur Pipeline" : "Zurück zu den Leads";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href={backHref}
        className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-[color:var(--brand)] hover:underline"
      >
        <ArrowLeft className="h-3 w-3" />
        {backLabel}
      </Link>
      <LeadDetailBody leadId={id} customerId={session.customerId} />
    </main>
  );
}
