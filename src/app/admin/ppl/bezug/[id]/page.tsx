import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BezugForm } from "./bezug-form";
import { BezugZusatz } from "./bezug-zusatz";
import { AdminBack } from "@/components/admin/admin-back";

export const dynamic = "force-dynamic";

export default async function BezugPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") redirect("/login");
  const { id } = await params;
  const isNew = id === "neu";
  const [sub, customers, products] = await Promise.all([
    isNew ? null : prisma.leadSubscription.findUnique({ where: { id }, include: { orders: { orderBy: { periodStart: "desc" }, take: 8 }, areas: { orderBy: { createdAt: "asc" } } } }),
    prisma.customer.findMany({ where: { archived: false, plan: { not: "internal" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.leadSubscription.findMany({ distinct: ["productKey"], select: { productKey: true } }),
  ]);
  if (!isNew && !sub) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <AdminBack href="/admin/ppl">Pay-per-Lead</AdminBack>
      <h1 className="text-2xl font-semibold tracking-tight">{isNew ? "Bezug anlegen" : "Bezug bearbeiten"}</h1>
      <BezugForm
        sub={sub ? { ...sub, price: Number(sub.price), startDate: sub.startDate?.toISOString().slice(0, 10) ?? "", hasSecret: !!sub.webhookSecretEnc } : null}
        customers={customers}
        products={products.map((p) => p.productKey)}
      />
      <BezugZusatz sub={sub} />
    </main>
  );
}

