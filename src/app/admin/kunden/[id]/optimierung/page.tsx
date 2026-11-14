import { connection } from "next/server";
import { Card, CardHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { loadAccountDetail, syncOptimizationAccounts } from "@/lib/optimierung/server";
import { AccountView, ProtocolCard } from "@/app/admin/optimierung/account-view";
import { ManualForm } from "@/app/admin/optimierung/ui";
import { requireAuth } from "@/lib/vertrieb/auth";

// Reiter „Optimierung“ der Kundenakte: mit eigenem Werbekonto die volle Konto-Ansicht,
// sonst Protokoll und „Maßnahme eintragen“ (z. B. bei Pay-per-Lead-Kunden).
export default async function KundenOptimierung({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  await requireAuth();
  const { id } = await params;
  let account = await prisma.optimizationAccount.findUnique({ where: { customerId: id }, select: { id: true } });
  if (!account) {
    await syncOptimizationAccounts().catch(() => undefined);
    account = await prisma.optimizationAccount.findUnique({ where: { customerId: id }, select: { id: true } });
  }
  const detail = account ? await loadAccountDetail(account.id) : null;
  if (detail)
    return (
      <div className="mt-5">
        <AccountView detail={detail} showBackLink={false} />
      </div>
    );
  const measures = await prisma.optimizationMeasure.findMany({ where: { customerId: id }, orderBy: { plannedAt: "desc" }, take: 150 });
  return (
    <div className="mt-5 grid gap-5 xl:grid-cols-[3fr_2fr]">
      <ProtocolCard measures={measures} />
      <Card>
        <CardHeader title="Maßnahme eintragen" hint="von Hand, landet im Protokoll" />
        <p className="px-5 pb-3 text-sm text-[color:var(--muted)]">Kein eigenes Meta-Werbekonto hinterlegt: die automatische Optimierung läuft über die Pay-per-Lead-Pools bzw. erst mit Werbekonto.</p>
        <ManualForm accountId={null} customerId={id} />
      </Card>
    </div>
  );
}
