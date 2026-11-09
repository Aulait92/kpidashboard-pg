// Verarbeitung der Stripe-Webhooks (Signatur wird in der Route geprüft).
// Zuordnung über Stripe-Objekte (Checkout Session → Abo → Angebot), Metadaten
// nur als Rückfallebene.

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import { logOfferActivity, offerAdminHref, setContactCustomerStage } from "@/lib/offer-links";

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.overdue",
  "charge.refunded",
  "charge.dispute.created",
  "radar.early_fraud_warning.created",
] as const;

const eur = (cents: number | null | undefined) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format((cents ?? 0) / 100);

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

async function offerForSession(session: Stripe.Checkout.Session) {
  return (
    (await prisma.offer.findFirst({ where: { stripeCheckoutSessionId: session.id } })) ??
    (session.client_reference_id ? await prisma.offer.findUnique({ where: { id: session.client_reference_id } }) : null)
  );
}

async function offerForSubscription(subscriptionId: string | null, metadataOfferId?: string | null) {
  if (subscriptionId) {
    const bySub = await prisma.offer.findUnique({ where: { stripeSubscriptionId: subscriptionId } });
    if (bySub) return bySub;
  }
  return metadataOfferId ? prisma.offer.findUnique({ where: { id: metadataOfferId } }) : null;
}

/** Abo-ID einer Rechnung (neue API: parent.subscription_details). */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = (invoice as unknown as { parent?: { subscription_details?: { subscription?: string | { id: string } } } }).parent;
  return idOf(parent?.subscription_details?.subscription ?? null);
}

async function notify(title: string, body: string, url?: string, tag?: string) {
  await sendToAdmins({ title, body, url, tag }).catch((err) => reportError(err, "billing-push"));
}

type OfferLike = { dealId: string | null; salesContactId: string | null };

async function logActivity(offer: OfferLike, title: string, body?: string) {
  await logOfferActivity(offer, title, body ?? null);
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  // Idempotenz: jedes Ereignis nur einmal verarbeiten.
  try {
    await prisma.stripeEvent.create({ data: { id: event.id, type: event.type } });
  } catch {
    return; // bereits verarbeitet
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const offer = await offerForSession(session);
      if (!offer) return;
      const subscriptionId = idOf(session.subscription);
      const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
      const failed = event.type === "checkout.session.async_payment_failed";
      const status = failed ? "failed" : paid ? "paid" : "processing";
      await prisma.offer.update({
        where: { id: offer.id },
        data: {
          paymentStatus: status,
          ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
          ...(idOf(session.customer) ? { stripeCustomerId: idOf(session.customer) } : {}),
          ...(paid ? { paidAt: offer.paidAt ?? new Date() } : {}),
        },
      });
      // Zahlung eingerichtet (SEPA-Mandat genügt) → Onboarding kann starten.
      if (!failed) await setContactCustomerStage(offer, "ONBOARDING");
      if (failed) {
        await logActivity(offer, `Zahlung für ${offer.number} fehlgeschlagen`);
        await notify(`⚠️ Zahlung fehlgeschlagen: ${offer.company ?? offer.contactName}`, offer.number, offerAdminHref(offer));
      } else if (event.type === "checkout.session.completed") {
        await logActivity(
          offer,
          paid ? `Zahlung für ${offer.number} eingegangen` : `Zahlung für ${offer.number} eingerichtet (SEPA wird bestätigt)`,
          `Betrag: ${eur(session.amount_total)} brutto`,
        );
        await notify(
          `💶 ${paid ? "Bezahlt" : "Zahlung eingerichtet"}: ${offer.company ?? offer.contactName}`,
          `${offer.number} · ${eur(session.amount_total)}`,
          offerAdminHref(offer),
          `pay:${offer.id}`,
        );
      } else {
        await logActivity(offer, `Zahlung für ${offer.number} bestätigt`);
      }
      return;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const offer = await offerForSession(session);
      if (offer && offer.paymentStatus === "pending" && offer.stripeCheckoutSessionId === session.id) {
        await prisma.offer.update({ where: { id: offer.id }, data: { paymentStatus: "none" } });
      }
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const offer = await offerForSubscription(sub.id, sub.metadata?.offer_id);
      if (!offer) return;
      await prisma.offer.update({
        where: { id: offer.id },
        data: { stripeSubscriptionId: sub.id, subscriptionStatus: sub.status },
      });
      if (event.type === "customer.subscription.deleted") {
        await setContactCustomerStage(offer, "GEKUENDIGT");
        await logActivity(offer, `Abo zu ${offer.number} beendet`);
        await notify(`Abo beendet: ${offer.company ?? offer.contactName}`, offer.number, offerAdminHref(offer));
      }
      return;
    }
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.overdue": {
      const invoice = event.data.object as Stripe.Invoice;
      const offer = await offerForSubscription(invoiceSubscriptionId(invoice));
      if (!offer) return;
      const label = invoice.number ?? invoice.id;
      if (event.type === "invoice.paid") {
        await logActivity(offer, `Rechnung ${label} bezahlt`, eur(invoice.amount_paid));
      } else {
        const what = event.type === "invoice.overdue" ? "überfällig" : "Zahlung fehlgeschlagen";
        await logActivity(offer, `Rechnung ${label}: ${what}`, eur(invoice.amount_due));
        await notify(`⚠️ Rechnung ${what}: ${offer.company ?? offer.contactName}`, `${label} · ${eur(invoice.amount_due)}`, offerAdminHref(offer));
      }
      return;
    }
    case "charge.refunded":
    case "charge.dispute.created":
    case "radar.early_fraud_warning.created": {
      const obj = event.data.object as { id: string; amount?: number };
      const what =
        event.type === "charge.refunded" ? "Erstattung" : event.type === "charge.dispute.created" ? "Rückbuchung/Widerspruch" : "Betrugswarnung";
      await notify(`⚠️ Stripe: ${what}`, `${obj.id}${obj.amount != null ? ` · ${eur(obj.amount)}` : ""} – bitte im Stripe-Dashboard prüfen.`);
      return;
    }
    default:
      return;
  }
}
