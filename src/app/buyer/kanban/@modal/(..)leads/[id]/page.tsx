import { redirect } from "next/navigation";
import { LeadDetailBody } from "@/components/lead-detail-body";
import { LeadDetailModalShell } from "@/components/lead-detail-modal-shell";
import { getCurrentSession } from "@/lib/auth";

// Intercepting Route: (..) klettert eine Ebene aus dem @modal/ heraus
// und fängt /buyer/leads/[id] ab, WENN die Navigation aus /buyer/kanban
// kommt (clientseitig, via Link/router.push). Refresh oder direkter
// URL-Aufruf rendern die echte /buyer/leads/[id]-Page (Vollseite).
export const dynamic = "force-dynamic";

export default async function PipelineLeadModal({
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
