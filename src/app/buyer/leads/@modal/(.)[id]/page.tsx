import { redirect } from "next/navigation";
import { LeadDetailBody } from "@/components/lead-detail-body";
import { LeadDetailModalShell } from "@/components/lead-detail-modal-shell";
import { getCurrentSession } from "@/lib/auth";

// Intercepting Route für die Lead-Tabelle. (.) matched /buyer/leads/[id]
// als Sibling-Segment: clientseitige Navigation aus /buyer/leads → Modal,
// Refresh / direkter URL-Aufruf → Vollseite aus /buyer/leads/[id]/page.tsx.
export const dynamic = "force-dynamic";

export default async function LeadsListLeadModal({
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
