import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentSession } from "@/lib/auth";
import { SALES_PIPELINE_PHASES } from "@/lib/sales-phases";
import { NewDealForm } from "./new-deal-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deal anlegen | KPI-Dashboard" };

export default async function NewDealPage() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") redirect("/login");
  const statuses = SALES_PIPELINE_PHASES.map((p) => p.defaultStatus);
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/admin/crm" className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-[color:var(--brand)] hover:underline">
        <ArrowLeft className="h-3 w-3" /> Zurück zum CRM
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Deal anlegen</h1>
      <p className="mb-6 mt-1 text-sm text-[color:var(--muted)]">
        Für Interessenten, die (noch) nicht in der Airtable-Pipeline stehen – danach direkt ein Angebot erstellen.
      </p>
      <NewDealForm statuses={statuses} />
    </main>
  );
}
