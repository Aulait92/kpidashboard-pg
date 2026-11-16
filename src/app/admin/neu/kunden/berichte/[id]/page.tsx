import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";

// Ein Monatsbericht (früher /admin/monatsberichte/<id>, z. B. aus Heute): öffnet ihn in der Kundenakte.
export default async function MonatsberichtWeiter({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
  const r = await prisma.monthlyReport.findUnique({ where: { id }, select: { customerId: true } });
  if (!r) notFound();
  redirect(`/admin/neu/kunden/${r.customerId}/berichte?bericht=${id}#bericht`);
}
