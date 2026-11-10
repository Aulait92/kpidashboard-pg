import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LeadDetailBody } from "@/components/lead-detail-body";
import { getBuyerContext } from "@/lib/buyer-context";

// Neue Oberfläche: Kontakt als ganze Seite (Liste verschwindet), zurück zu
// „Alle Kontakte“ in der Darstellung, aus der man kam.
export const dynamic = "force-dynamic";
export const metadata = { title: "Kontakt | performancegrowth" };

export default async function KontaktPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ von?: string }>;
}) {
  const session = await getBuyerContext();
  if (!session) redirect("/login");
  const { id } = await params;
  const { von } = await searchParams;
  const backHref = von === "pipeline" ? "/buyer/kontakte?modus=pipeline" : "/buyer/kontakte";

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <Link
        href={backHref}
        className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-base font-medium text-[color:var(--brand)] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Alle Kontakte
      </Link>
      <LeadDetailBody leadId={id} team={session} newUi />
    </main>
  );
}
