// Wochenbestellungen (Pay-per-Lead): Käufer bestellt Menge für eine Woche,
// zahlt im Voraus per Stripe (Rechnung, sofort eingezogen). Offene
// Gutschriften aus Stornos werden abgezogen. Ohne bezahlte Bestellung keine
// Lieferung. „Jede Woche wiederholen“ verlängert freitags automatisch.

import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { sendToAdmins } from "@/lib/push";
import { fmtWeek, weekRange } from "@/lib/ppl/periods";
import { openCredits } from "@/lib/ppl/storno";

export const MIN_ORDER = 5;
export const MAX_ORDER = 2000;

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

export type OrderResult = { ok: true; orderId: string; status: string; message: string } | { ok: false; error: string };

export async function placeOrder(opts: {
  subscriptionId: string;
  weekOffset: 0 | 1;
  quantity: number;
  autoRenew: boolean;
  actor?: AuditActor;
  /** Admin: Bestellung ohne Stripe als bezahlt markieren (Rechnung von Hand). */
  markPaid?: boolean;
  now?: Date;
}): Promise<OrderResult> {
  const now = opts.now ?? new Date();
  const qty = Math.round(opts.quantity);
  if (!Number.isFinite(qty) || qty < MIN_ORDER || qty > MAX_ORDER) return { ok: false, error: `Bitte zwischen ${MIN_ORDER} und ${MAX_ORDER} Leads bestellen.` };
  const sub = await prisma.leadSubscription.findUnique({
    where: { id: opts.subscriptionId },
    include: { customer: { select: { id: true, name: true, stripeCustomerId: true } } },
  });
  if (!sub || !sub.active) return { ok: false, error: "Bezug nicht gefunden oder pausiert." };
  if (sub.period !== "week") return { ok: false, error: "Für diesen Bezug gibt es keine Wochenbestellung." };

  const { start, end } = weekRange(now, opts.weekOffset);
  const existing = await prisma.leadOrder.findUnique({ where: { subscriptionId_periodStart: { subscriptionId: sub.id, periodStart: start } } });
  if (existing && ["paid", "processing"].includes(existing.status)) {
    if (existing.autoRenew !== opts.autoRenew) await prisma.leadOrder.update({ where: { id: existing.id }, data: { autoRenew: opts.autoRenew } });
    return { ok: false, error: `Für ${fmtWeek(start)} ist schon bestellt und bezahlt (${existing.quantity} Leads). Mehr? Bitte kurz bei uns melden.` };
  }

  const price = Number(sub.price);
  const gross = qty * price;
  const credits = await openCredits(sub.id);
  const credit = Math.min(credits.amount, gross);
  const amount = Math.round((gross - credit) * 100) / 100;

  const order = existing
    ? await prisma.leadOrder.update({ where: { id: existing.id }, data: { quantity: qty, amount, autoRenew: opts.autoRenew, status: "open", stripeInvoiceId: null } })
    : await prisma.leadOrder.create({
        data: { subscriptionId: sub.id, periodStart: start, periodEnd: end, quantity: qty, amount, autoRenew: opts.autoRenew, createdById: opts.actor?.id ?? null },
      });

  let status = "open";
  if (opts.markPaid) {
    status = "paid";
  } else {
    const { billingEnabled, chargeNow, hasPaymentMethod } = await import("@/lib/billing");
    if (!billingEnabled() || !(await hasPaymentMethod(sub.customer.stripeCustomerId))) {
      return { ok: false, error: "Bitte zuerst eine Zahlungsart hinterlegen." };
    }
    const label = `${qty} Leads ${sub.label ?? sub.productKey}, Woche ${fmtWeek(start)}`;
    try {
      const res = await chargeNow({
        stripeCustomerId: sub.customer.stripeCustomerId!,
        lines: [
          { description: `${label} à ${eur(price)}`, amountEur: gross },
          ...(credit > 0 ? [{ description: `Gutschrift aus ${credits.leadIds.length} Storno(s)`, amountEur: -credit }] : []),
        ],
        description: label,
        idempotencyKey: `ppl-order-${order.id}-${order.updatedAt.getTime()}`,
        metadata: { kind: "ppl_order", order_id: order.id, customer_id: sub.customerId },
      });
      status = res.status;
      await prisma.leadOrder.update({ where: { id: order.id }, data: { stripeInvoiceId: res.invoiceId } });
    } catch (err) {
      reportError(err, "ppl-order-charge", { order: order.id });
      status = "failed";
    }
  }
  await prisma.leadOrder.update({ where: { id: order.id }, data: { status } });
  if (credit > 0 && status !== "failed") {
    await prisma.lead.updateMany({ where: { id: { in: credits.leadIds } }, data: { creditedAt: now } });
  }
  await audit("ppl.order", { entity: "LeadOrder", entityId: order.id, customerId: sub.customerId, actor: opts.actor, details: { qty, amount, week: start.toISOString().slice(0, 10), status } });
  if (["paid", "processing"].includes(status) && start <= now) {
    const { redistributeParked } = await import("@/lib/ppl/engine");
    await redistributeParked(sub.productKey, now).catch((err) => reportError(err, "ppl-redistribute"));
  }
  if (status === "failed") return { ok: false, error: "Die Zahlung hat nicht geklappt. Bitte Zahlungsart prüfen oder uns kurz anrufen." };
  return {
    ok: true,
    orderId: order.id,
    status,
    message:
      status === "paid"
        ? `Bestellt und bezahlt: ${qty} Leads für ${fmtWeek(start)}.`
        : `Bestellt: ${qty} Leads für ${fmtWeek(start)}. Die Lastschrift läuft, die Lieferung startet ${start <= now ? "sofort" : "pünktlich"}.`,
  };
}

/** Stripe-Rückmeldung zu einer Bestellrechnung. */
export async function orderInvoiceEvent(orderId: string, paid: boolean) {
  const order = await prisma.leadOrder.findUnique({ where: { id: orderId }, include: { subscription: { select: { productKey: true, label: true, customer: { select: { name: true } } } } } });
  if (!order) return;
  await prisma.leadOrder.update({ where: { id: order.id }, data: { status: paid ? "paid" : "failed" } });
  if (paid) {
    const { redistributeParked } = await import("@/lib/ppl/engine");
    await redistributeParked(order.subscription.productKey).catch(() => {});
  } else {
    await sendToAdmins({
      title: `⚠️ Lead-Bestellung nicht bezahlt: ${order.subscription.customer.name}`,
      body: `${order.quantity} Leads, ${fmtWeek(order.periodStart)} – Lieferung gestoppt.`,
      url: "/admin/ppl",
    }).catch(() => {});
  }
}

/**
 * Freitags ab 10 Uhr: Bestellungen mit „jede Woche wiederholen“ für die
 * Folgewoche gleich anlegen und einziehen. Idempotent (eine Bestellung je Woche).
 */
export async function renewOrders(now = new Date()): Promise<{ renewed: number; failed: number }> {
  const berlin = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const wd = berlin.find((p) => p.type === "weekday")?.value;
  const hour = Number(berlin.find((p) => p.type === "hour")?.value);
  if (!(wd === "Fri" && hour >= 10) && wd !== "Sat" && wd !== "Sun") return { renewed: 0, failed: 0 };
  const { start } = weekRange(now);
  const next = weekRange(now, 1).start;
  const current = await prisma.leadOrder.findMany({
    where: { periodStart: start, autoRenew: true, status: { in: ["paid", "processing"] }, subscription: { active: true, period: "week", orders: { none: { periodStart: next } } } },
    include: { subscription: { select: { id: true, customerId: true } } },
  });
  let renewed = 0;
  let failed = 0;
  for (const o of current) {
    const r = await placeOrder({ subscriptionId: o.subscriptionId, weekOffset: 1, quantity: o.quantity, autoRenew: true, actor: { role: "system" }, now });
    if (r.ok) renewed++;
    else {
      failed++;
      await sendToAdmins({ title: "⚠️ Wochenbestellung nicht verlängert", body: r.error, url: "/admin/ppl" }).catch(() => {});
    }
  }
  return { renewed, failed };
}
