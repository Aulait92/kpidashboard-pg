// Verarbeitung der Stripe-Webhooks (Signatur wird in der Route geprüft).
// Zuordnung über Stripe-Objekte (Checkout Session → Abo → Angebot), Metadaten
// nur als Rückfallebene.

import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import { logOfferActivity, offerAdminHref, setContactCustomerStage } from "@/lib/offer-links";
import { cancelScheduleForOffer, createScheduleForOffer } from "@/lib/billing";
import { abrechnungsplan } from "@/lib/abrechnungstag";
import { startOnboarding } from "@/lib/onboarding";
import { markPaymentOverdue, markPaymentReceived } from "@/lib/pause";
import { mahnwesenAktiv } from "@/lib/mahnwesen";

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

/** „Kollegen empfehlen“: erste Zahlung eines empfohlenen Neukunden → Prämie (idempotent). */
async function rewardReferral(offerId: string) {
  try {
    const { rewardReferralForOffer } = await import("@/lib/kollegen");
    await rewardReferralForOffer(offerId);
  } catch (err) {
    reportError(err, "referral-reward", { offer: offerId });
  }
}

/** Typ der Zahlungsart einer fehlgeschlagenen Rechnung (Lastschrift oder Karte), für den Mahntext. Wirft nie. */
async function zahlartTyp(invoice: Stripe.Invoice): Promise<string | null> {
  if (invoice.collection_method === "send_invoice") return null;
  try {
    const { stripeClient } = await import("@/lib/billing");
    const stripe = stripeClient();
    const customerId = idOf(invoice.customer as string | { id: string } | null);
    if (!stripe || !customerId) return null;
    const pm = idOf(invoice.default_payment_method as string | { id: string } | null);
    if (pm) return (await stripe.paymentMethods.retrieve(pm)).type;
    const c = await stripe.customers.retrieve(customerId);
    const def = "deleted" in c ? null : idOf(c.invoice_settings?.default_payment_method as string | { id: string } | null);
    return def ? (await stripe.paymentMethods.retrieve(def)).type : null;
  } catch {
    return null;
  }
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
      // Zahlungsart für Lead-Bestellungen hinterlegt (Pay-per-Lead)
      if (session.metadata?.kind === "payment_setup") {
        if (event.type === "checkout.session.completed") {
          const { savePaymentSetup } = await import("@/lib/billing");
          await savePaymentSetup(session).catch((err) => reportError(err, "billing-payment-setup"));
        }
        return;
      }
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
          // Abschlussbonus: auf der bezahlten Seite abgezogen (Metadaten der Bezahlseite, Ole 16.11.2026)
          ...(!failed && session.metadata?.pg_bonus ? { abschlussBonusGewaehrt: Number(session.metadata.pg_bonus) / 100 } : {}),
          // Lastschrift geplatzt: Bonus gilt nicht als genutzt (Admin kann die Frist wieder verschieben, neue Zahlung rechnet neu)
          ...(failed && session.metadata?.pg_bonus ? { abschlussBonusGewaehrt: null } : {}),
        },
      });
      // Zahlung erst nach dem Startdatum: Start auf den nächsten Monatsersten verschieben (nichts rückwirkend),
      // bevor Abo-Zeitplan und Onboarding das Startdatum übernehmen (lib/angebot-zahlungserinnerung-server.ts).
      let shiftedTo: string | null = null;
      if (!failed && session.mode !== "subscription") {
        shiftedTo = await import("@/lib/angebot-zahlungserinnerung-server")
          .then((m) => m.startNachZahlungVerschieben(offer.id))
          .catch((err) => {
            reportError(err, "billing-start-shift", { offer: offer.number });
            return null;
          });
      }
      // Abo-Zeitplan (Monatsgebühr ab Startdatum) – nur für den neuen Ablauf
      // (Checkout im Modus „payment“/„setup“; alte Abo-Checkouts haben schon ein Abo).
      if (!failed && session.mode !== "subscription") {
        try {
          await createScheduleForOffer(offer.id, session);
        } catch (err) {
          reportError(err, "billing-schedule", { offer: offer.number });
          await notify(`⚠️ Abo konnte nicht angelegt werden: ${offer.company ?? offer.contactName}`, `${offer.number}, bitte im Stripe-Dashboard prüfen.`, offerAdminHref(offer));
        }
      }
      if (failed) await cancelScheduleForOffer(offer.id).catch((err) => reportError(err, "billing-schedule-cancel"));
      // Zahlung eingerichtet (SEPA-Mandat genügt) → Onboarding startet.
      if (!failed) {
        await setContactCustomerStage(offer, "ONBOARDING");
        // E-Mail aus dem Checkout als Rückfall, falls das Angebot keine hatte (sonst kein Login).
        const ob = await startOnboarding(offer.id, { checkoutEmail: session.customer_details?.email ?? null }).catch((err) => {
          reportError(err, "onboarding-start", { offer: offer.number });
          return null;
        });
        if (!ob || !ob.ok) {
          await notify(`⚠️ Onboarding nicht gestartet: ${offer.company ?? offer.contactName}`, ob && !ob.ok ? ob.error : offer.number, offerAdminHref(offer));
        }
      }
      if (failed) {
        await logActivity(offer, `Zahlung für ${offer.number} fehlgeschlagen`);
        await notify(`⚠️ Zahlung fehlgeschlagen: ${offer.company ?? offer.contactName}`, offer.number, offerAdminHref(offer));
      } else if (event.type === "checkout.session.completed") {
        await logActivity(
          offer,
          paid ? `Zahlung für ${offer.number} eingegangen` : `Zahlung für ${offer.number} eingerichtet (SEPA wird bestätigt)`,
          `Setup: ${eur(session.amount_total)} brutto${monatsgebuehrAb(offer, shiftedTo)}`,
        );
        await notify(
          `💶 ${paid ? "Bezahlt" : "Zahlung eingerichtet"}: ${offer.company ?? offer.contactName}`,
          `${offer.number} · ${eur(session.amount_total)}${shiftedTo ? ` · Start verschoben auf ${shiftedTo.split("-").reverse().join(".")}` : ""}`,
          offerAdminHref(offer),
          `pay:${offer.id}`,
        );
      } else {
        await logActivity(offer, `Zahlung für ${offer.number} bestätigt`);
      }
      // Erste Zahlung eines empfohlenen Neukunden (auch SEPA, sobald bestätigt)
      if (!failed && paid && (session.amount_total ?? 0) > 0) await rewardReferral(offer.id);
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
      // Abo wegen geplatzter Setup-Lastschrift beendet: nicht wieder verknüpfen (eine neue Zahlung legt ein neues an)
      const nachFehlschlag = event.type === "customer.subscription.deleted" && offer.paymentStatus === "failed" && offer.stripeSubscriptionId !== sub.id;
      await prisma.offer.update({
        where: { id: offer.id },
        data: nachFehlschlag ? { subscriptionStatus: sub.status } : { stripeSubscriptionId: sub.id, subscriptionStatus: sub.status },
      });
      // Überweisung (lib/ueberweisung.ts): Abo aus dem Zeitplan startet → Banküberweisung als Zahlungsart der Rechnungen
      if (
        event.type === "customer.subscription.created" &&
        offer.zahlweise === "ueberweisung" &&
        sub.collection_method === "send_invoice" &&
        !(sub.payment_settings?.payment_method_types ?? []).includes("customer_balance")
      ) {
        const { setBankTransferOnSubscription } = await import("@/lib/billing");
        await setBankTransferOnSubscription(sub.id).catch((err) => reportError(err, "billing-ueberweisung-abo", { offer: offer.number }));
      }
      if (event.type === "customer.subscription.deleted" && !nachFehlschlag) {
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
      // Lead-Bestellung (Pay-per-Lead, Vorkasse)
      if (invoice.metadata?.kind === "ppl_order" && invoice.metadata.order_id && event.type !== "invoice.overdue") {
        const { orderInvoiceEvent } = await import("@/lib/ppl/orders");
        await orderInvoiceEvent(invoice.metadata.order_id, event.type === "invoice.paid").catch((err) => reportError(err, "ppl-order-webhook"));
      }
      // Setup-Rechnung per Überweisung (lib/ueberweisung.ts): bezahlt → Angebot bezahlt
      if (event.type === "invoice.paid" && invoice.metadata?.pg_kind === "offer_setup" && invoice.metadata.offer_id) {
        const setupOffer = await prisma.offer.findUnique({ where: { id: invoice.metadata.offer_id } });
        if (setupOffer && setupOffer.paymentStatus !== "paid") {
          await prisma.offer.update({ where: { id: setupOffer.id }, data: { paymentStatus: "paid", paidAt: setupOffer.paidAt ?? new Date() } });
          await logActivity(setupOffer, `Setup-Rechnung ${invoice.number ?? invoice.id} per Überweisung bezahlt`, eur(invoice.amount_paid));
          await notify(`💶 Überweisung eingegangen: ${setupOffer.company ?? setupOffer.contactName}`, `${setupOffer.number} · ${eur(invoice.amount_paid)}`, offerAdminHref(setupOffer), `pay:${setupOffer.id}`);
          if ((invoice.amount_paid ?? 0) > 0) await rewardReferral(setupOffer.id);
        }
      }
      // Mahnwesen (lib/mahnwesen-server.ts): bezahlt → Mahnlauf sofort beenden; fehlgeschlagen/überfällig → Fall anlegen
      try {
        const m = await import("@/lib/mahnwesen-server");
        if (event.type === "invoice.paid") await m.rechnungBezahlt(invoice.id!, "stripe");
        else if (event.type === "invoice.payment_failed" && mahnwesenAktiv()) await m.mahnfallAusRechnung(invoice, { fehlgeschlagen: true, pmType: await zahlartTyp(invoice) });
        else await m.mahnfallAusRechnung(invoice);
      } catch (err) {
        reportError(err, "billing-mahnwesen", { invoice: invoice.id });
      }
      // Zahlungsverzug je Kunde führen (unabhängig vom Angebot).
      const stripeCustomerId = idOf(invoice.customer as string | { id: string } | null);
      if (stripeCustomerId) {
        try {
          if (event.type === "invoice.paid") await markPaymentReceived(stripeCustomerId);
          else await markPaymentOverdue(stripeCustomerId, new Date());
        } catch (err) {
          reportError(err, "billing-dunning", { invoice: invoice.id });
        }
      }
      const offer = await offerForSubscription(invoiceSubscriptionId(invoice));
      if (!offer) return;
      const label = invoice.number ?? invoice.id;
      if (event.type === "invoice.paid") {
        await logActivity(offer, `Rechnung ${label} bezahlt`, eur(invoice.amount_paid));
        if ((invoice.amount_paid ?? 0) > 0) await rewardReferral(offer.id);
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
      await notify(`⚠️ Stripe: ${what}`, `${obj.id}${obj.amount != null ? ` · ${eur(obj.amount)}` : ""}, bitte im Stripe-Dashboard prüfen.`);
      return;
    }
    default:
      return;
  }
}

/** Verlaufszeile „Monatsgebühr ab …“: erster Abrechnungstag (lib/abrechnungstag.ts), bei verschobenem Start mit Hinweis. */
function monatsgebuehrAb(offer: { startDate: Date | null; billingDay: number | null; billingFreeStart: boolean }, shiftedTo: string | null): string {
  const startIso = shiftedTo ?? (offer.startDate ? offer.startDate.toISOString().slice(0, 10) : null);
  const plan = abrechnungsplan({ startIso, billingDay: offer.billingDay, freeStart: offer.billingFreeStart });
  if (!plan) return "";
  const ab = plan.firstIso.split("-").reverse().join(".");
  const zusatz = plan.differs ? `, jeweils am ${plan.day}.${plan.free ? ", kostenloser Start" : ", Zeit davor anteilig"}` : "";
  return ` · Monatsgebühr ab ${ab}${zusatz}${shiftedTo ? " (Start verschoben)" : ""}`;
}
