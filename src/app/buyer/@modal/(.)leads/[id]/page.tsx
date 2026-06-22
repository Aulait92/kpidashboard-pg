import { redirect } from "next/navigation";
import { LeadDetailBody } from "@/components/lead-detail-body";
import { LeadDetailModalShell } from "@/components/lead-detail-modal-shell";
import { getCurrentSession } from "@/lib/auth";

// Intercepting Route für ALLE Buyer-Tabs (KPIs / Leads / Pipeline). (.)
// matched /buyer/leads/[id] auf der /buyer-Ebene. Solange die Navigation
// clientseitig (Link / router.push) aus irgendeinem Buyer-Tab kommt,
// wird das Modal über dem aktuell sichtbaren Tab gerendert. Refresh
// oder direkter URL-Aufruf rendern /buyer/leads/[id]/page.tsx als
// Vollseite.
export const dynamic = "force-dynamic";

export default async function BuyerLeadModal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  if (!session || session.role !== "BUYER" || !session.customerId) {
    redirect("/login");
  }
  const { id } = await params;
  return (
    <LeadDetailModalShell>
      <LeadDetailBody leadId={id} customerId={session.customerId} />
    </LeadDetailModalShell>
  );
}
