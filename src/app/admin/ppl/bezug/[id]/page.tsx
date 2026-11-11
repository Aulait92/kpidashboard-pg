import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui";
import { fmtWeek, weekRange } from "@/lib/ppl/periods";
import { BezugForm } from "./bezug-form";
import { deleteAreaAction, manualOrderAction, saveAreaAction } from "../../actions";
import { areaQuotas } from "@/lib/ppl/engine";

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
  const quotas = sub ? new Map((await areaQuotas(sub)).map((q) => [q.id, q])) : new Map();
  const field = "mt-1 block h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm text-[color:var(--foreground)]";
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
      {sub ? (
        <Card>
          <CardHeader title="Gebiete mit Vorrang" />
          <p className="px-5 pb-1 text-sm text-[color:var(--muted)]">
            Leads aus diesen PLZ-Gebieten gehen zuerst an diesen Bezug, bis die Menge des Gebiets im Zeitraum erreicht ist (100 %). Danach normale Verteilung.
            Ist beim Bezug kein eigener PLZ-Filter gesetzt, bekommt er nur Leads aus seinen Gebieten.
          </p>
          <ul className="divide-y divide-[color:var(--border)] text-sm">
            {sub.areas.map((a) => {
              const q = quotas.get(a.id);
              return (
                <li key={a.id} className="px-5 py-3">
                  <form action={saveAreaAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="subscriptionId" value={sub.id} />
                    <input type="hidden" name="id" value={a.id} />
                    <label className="text-xs text-[color:var(--muted)]">
                      Name
                      <input name="label" defaultValue={a.label ?? ""} className={`${field} w-32`} />
                    </label>
                    <label className="min-w-0 flex-1 text-xs text-[color:var(--muted)]">
                      PLZ-Bereiche
                      <input name="plzRanges" defaultValue={a.plzRanges} className={`${field} w-full`} />
                    </label>
                    <label className="text-xs text-[color:var(--muted)]">
                      Menge
                      <input name="quantity" inputMode="numeric" defaultValue={a.quantity} className={`${field} w-20`} />
                    </label>
                    <label className="text-xs text-[color:var(--muted)]">
                      je
                      <select name="period" defaultValue={a.period ?? ""} className={field}>
                        <option value="">wie Bezug</option>
                        <option value="week">Woche</option>
                        <option value="month">Monat</option>
                      </select>
                    </label>
                    <button className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 font-medium">Speichern</button>
                  </form>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-[color:var(--muted)]">
                    <span className="tabular-nums">Im Zeitraum: {q?.delivered ?? 0} von {a.quantity} geliefert{q && q.delivered >= a.quantity ? " · voll, Vorrang pausiert" : ""}</span>
                    <form action={deleteAreaAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="text-rose-600 hover:underline">Gebiet löschen</button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
          <form action={saveAreaAction} className="flex flex-wrap items-end gap-2 border-t border-[color:var(--border)] px-5 py-4 text-sm">
            <input type="hidden" name="subscriptionId" value={sub.id} />
            <label className="text-xs text-[color:var(--muted)]">
              Name
              <input name="label" placeholder="z. B. Hamburg" className={`${field} w-32`} />
            </label>
            <label className="min-w-0 flex-1 text-xs text-[color:var(--muted)]">
              PLZ-Bereiche
              <input name="plzRanges" placeholder="20000-22999|25400" required className={`${field} w-full`} />
            </label>
            <label className="text-xs text-[color:var(--muted)]">
              Menge
              <input name="quantity" inputMode="numeric" required placeholder="20" className={`${field} w-20`} />
            </label>
            <label className="text-xs text-[color:var(--muted)]">
              je
              <select name="period" defaultValue="" className={field}>
                <option value="">wie Bezug</option>
                <option value="week">Woche</option>
                <option value="month">Monat</option>
              </select>
            </label>
            <button className="h-9 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-3 font-semibold text-white">Gebiet hinzufügen</button>
          </form>
        </Card>
      ) : null}
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
