import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { monthLabel, STATUS_LABEL } from "@/lib/monatsbericht/shared";
import { MonatsberichtDetail } from "@/components/admin/monatsbericht-detail";
import { AdminBack } from "@/components/admin/admin-back";

export const metadata = { title: "Monatsbericht | performancegrowth Admin" };

export default async function MonatsberichtPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
  const r = await prisma.monthlyReport.findUnique({ where: { id }, select: { id: true, month: true, status: true, sentAt: true, decidedBy: true, customer: { select: { name: true } } } });
  if (!r) notFound();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-8 sm:px-6">
      <div>
        <AdminBack href={`/admin/monatsberichte?monat=${r.month}`}>Monatsberichte {monthLabel(r.month)}</AdminBack>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{r.customer.name}</h1>
        <p className="text-sm text-[color:var(--muted)]">
          {monthLabel(r.month)} · Status: {STATUS_LABEL[r.status] ?? r.status}
          {r.sentAt ? ` am ${r.sentAt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}` : ""}
          {r.decidedBy ? ` (${r.decidedBy})` : ""}
        </p>
      </div>

      <MonatsberichtDetail id={r.id} />
    </main>
  );
}
