import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui";
import { fmtWeek, weekRange } from "@/lib/ppl/periods";
import { BezugForm } from "./bezug-form";
import { manualOrderAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function BezugPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") redirect("/login");
  const { id } = await params;
  const isNew = id === "neu";
  const [sub, customers, products] = await Promise.all([
    isNew ? null : prisma.leadSubscription.findUnique({ where: { id }, include: { orders: { orderBy: { periodStart: "desc" }, take: 8 } } }),
    prisma.customer.findMany({ where: { archived: false, plan: { not: "internal" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.leadSubscription.findMany({ distinct: ["productKey"], select: { productKey: true } }),
  ]);
  if (!isNew && !sub) notFound();
  const thisWeek = weekRange().start;
  const nextWeek = weekRange(new Date(), 1).start;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/admin/ppl" className="text-sm text-[color:var(--brand)] hover:underline">
        ← Pay-per-Lead
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{isNew ? "Bezug anlegen" : "Bezug bearbeiten"}</h1>
      <BezugForm
        sub={sub ? { ...sub, price: Number(sub.price), startDate: sub.startDate?.toISOString().slice(0, 10) ?? "", hasSecret: !!sub.webhookSecretEnc } : null}
        customers={customers}
        products={products.map((p) => p.productKey)}
      />
      {sub?.period === "week" ? (
        <Card>
          <CardHeader title="Bestellungen" />
          <ul className="divide-y divide-[color:var(--border)] text-sm">
            {sub.orders.map((o) => (
              <li key={o.id} className="flex justify-between px-5 py-2.5">
                <span>{fmtWeek(o.periodStart)}</span>
                <span className="tabular-nums">
                  {o.quantity} Leads · {Number(o.amount).toLocaleString("de-DE", { style: "currency", currency: "EUR" })} · {o.status}
                  {o.autoRenew ? " · wiederholt" : ""}
                </span>
              </li>
            ))}
            {!sub.orders.length ? <li className="px-5 py-3 text-[color:var(--muted)]">Noch keine Bestellung.</li> : null}
          </ul>
          <form action={manualOrderAction} className="flex flex-wrap items-end gap-2 border-t border-[color:var(--border)] px-5 py-4 text-sm">
            <input type="hidden" name="subscriptionId" value={sub.id} />
            <label className="text-xs text-[color:var(--muted)]">
              Woche
              <select name="week" className="mt-1 block h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm text-[color:var(--foreground)]">
                <option value="0">diese ({fmtWeek(thisWeek)})</option>
                <option value="1">nächste ({fmtWeek(nextWeek)})</option>
              </select>
            </label>
            <label className="text-xs text-[color:var(--muted)]">
              Anzahl
              <input name="quantity" inputMode="numeric" defaultValue={20} className="mt-1 block h-9 w-20 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-2 text-sm text-[color:var(--foreground)]" />
            </label>
            <button className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 font-medium">Von Hand bestellen (bezahlt)</button>
            <p className="w-full text-xs text-[color:var(--muted)]">Für Zahlung per Überweisung oder Kulanz: ohne Stripe, gilt sofort als bezahlt.</p>
          </form>
        </Card>
      ) : null}
    </main>
  );
}
