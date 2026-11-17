// Überweisung nur auf Anfrage (Ole, 17.11.2026).
//
// - Ole schaltet sie je Angebot frei („Überweisung erlauben“, Standard aus, Zahlungsziel Standard 14 Tage).
// - Ohne Freigabe bleibt alles wie bisher: Stripe Checkout mit Lastschrift oder Karte.
// - Mit Freigabe wählt der Kunde auf der Angebotsseite zusätzlich „Per Überweisung zahlen“. Dann kein Checkout,
//   sondern Stripe-Banküberweisung (customer_balance, virtuelle IBAN je Kunde): Setup-Rechnung mit Zahlungsziel
//   (send_invoice, days_until_due) sofort per E-Mail, Abo-Zeitplan ab Startdatum ebenfalls per Rechnung. Stripe ordnet
//   eingehende Überweisungen über die virtuelle IBAN automatisch der Rechnung zu (invoice.paid).
// - Das Onboarding startet wie bei der Lastschrift sofort (Zahlung eingerichtet); offene Rechnungen laufen ins
//   Mahnwesen (lib/mahnwesen-server.ts).
// - Beim Onboarding gehen Freigabe und Zahlungsziel an den Kunden über (lib/onboarding.ts); in der Kundenakte unter
//   Abrechnung änderbar (mit Audit-Eintrag).
// Freigabe: UEBERWEISUNG=on (nur Überweisung) oder MAHNWESEN=on (Überweisung und Mahnungen).

import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { sendToAdmins } from "@/lib/push";
import {
  bankTransferIban,
  createScheduleForOffer,
  createSetupInvoiceForOffer,
  ensureStripeCustomerForOffer,
  setBankTransferOnSubscription,
  stripeClient,
} from "@/lib/billing";
import { logOfferActivity, offerAdminHref, setContactCustomerStage } from "@/lib/offer-links";
import { zahlungEingerichtet } from "@/lib/angebot-zahlungserinnerung";
import { parseZahlungsziel, ueberweisungAktiv } from "@/lib/mahnwesen";

export type UeberweisungResult = { ok: true } | { ok: false; error: string };

/** Darf der Kunde für dieses Angebot per Überweisung zahlen? */
export function ueberweisungMoeglich(o: { allowBankTransfer: boolean; isTest: boolean }): boolean {
  return ueberweisungAktiv() && o.allowBankTransfer && !o.isTest;
}

/**
 * Kunde wählt „Per Überweisung zahlen“: Setup-Rechnung und Abo-Zeitplan per Rechnung anlegen, Onboarding starten.
 * Idempotent (ein zweiter Klick ändert nichts).
 */
export async function richteUeberweisungEin(offerId: string, now = new Date()): Promise<UeberweisungResult> {
  if (!stripeClient()) return { ok: false, error: "Zahlung ist noch nicht eingerichtet." };
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  if (!ueberweisungMoeglich(offer)) return { ok: false, error: "Für dieses Angebot ist die Zahlung per Überweisung nicht vorgesehen." };
  if (offer.status !== "accepted") return { ok: false, error: "Das Angebot ist noch nicht angenommen." };
  if (offer.zahlweise === "ueberweisung") return { ok: true };
  if (zahlungEingerichtet(offer)) return { ok: false, error: "Die Zahlung ist bereits eingerichtet." };
  const days = parseZahlungsziel(offer.bankTransferDays);

  // Beanspruchen: zwei Klicks gleichzeitig legen nichts doppelt an
  const claimed = await prisma.offer.updateMany({
    where: { id: offer.id, zahlweise: null, stripeScheduleId: null, stripeSubscriptionId: null, paymentStatus: { notIn: ["paid", "processing"] } },
    data: { zahlweise: "ueberweisung", paymentStatus: "processing" },
  });
  if (claimed.count !== 1) return { ok: true };

  let invoice: Awaited<ReturnType<typeof createSetupInvoiceForOffer>> = null;
  try {
    const customerId = await ensureStripeCustomerForOffer(offer.id);
    const iban = await bankTransferIban(customerId).catch((err) => {
      reportError(err, "ueberweisung-iban", { offer: offer.number });
      return null;
    });
    invoice = await createSetupInvoiceForOffer(offer.id, days);
    await prisma.offer.update({
      where: { id: offer.id },
      data: {
        ueberweisungIban: iban,
        ...(invoice ? { stripeSetupInvoiceId: invoice.invoiceId } : { paymentStatus: "paid", paidAt: now }),
        ...(invoice?.bonusCents ? { abschlussBonusGewaehrt: invoice.bonusCents / 100 } : {}),
      },
    });
  } catch (err) {
    reportError(err, "ueberweisung-rechnung", { offer: offer.number });
    // Zurück auf „nicht eingerichtet“, damit der Kunde es erneut oder per Lastschrift versuchen kann
    await prisma.offer.update({ where: { id: offer.id }, data: { zahlweise: null, paymentStatus: offer.paymentStatus } });
    return { ok: false, error: "Die Rechnung konnte gerade nicht erstellt werden. Bitte versuchen Sie es gleich noch einmal oder wählen Sie die Lastschrift." };
  }

  // Wie nach einem Checkout: Start verschieben (Zahlung nach dem Start), Abo-Zeitplan, Onboarding.
  const shiftedTo = await import("@/lib/angebot-zahlungserinnerung-server")
    .then((m) => m.startNachZahlungVerschieben(offer.id, now))
    .catch((err) => {
      reportError(err, "ueberweisung-start-shift", { offer: offer.number });
      return null;
    });
  try {
    await createScheduleForOffer(offer.id, null, { ueberweisung: { days } });
  } catch (err) {
    reportError(err, "ueberweisung-schedule", { offer: offer.number });
    await sendToAdmins({ title: `⚠️ Abo konnte nicht angelegt werden: ${offer.company ?? offer.contactName}`, body: `${offer.number} (Überweisung), bitte im Stripe-Dashboard prüfen.`, url: offerAdminHref(offer) }).catch(() => {});
  }
  await setContactCustomerStage(offer, "ONBOARDING");
  const { startOnboarding } = await import("@/lib/onboarding");
  const ob = await startOnboarding(offer.id).catch((err) => {
    reportError(err, "onboarding-start", { offer: offer.number });
    return null;
  });
  if (!ob || !ob.ok) {
    await sendToAdmins({ title: `⚠️ Onboarding nicht gestartet: ${offer.company ?? offer.contactName}`, body: ob && !ob.ok ? ob.error : offer.number, url: offerAdminHref(offer) }).catch(() => {});
  }
  await logOfferActivity(
    offer,
    `Zahlung per Überweisung gewählt (${offer.number})`,
    `${invoice ? `Setup-Rechnung verschickt, zahlbar in ${days} Tagen` : "Kein Setup zu zahlen"} · Monatsgebühr per Rechnung${shiftedTo ? ` · Start verschoben auf ${shiftedTo.split("-").reverse().join(".")}` : ""}`,
  );
  await sendToAdmins({
    title: `🏦 Überweisung gewählt: ${offer.company ?? offer.contactName}`,
    body: `${offer.number} · Rechnung mit Zahlungsziel ${days} Tage`,
    url: offerAdminHref(offer),
    tag: `pay:${offer.id}`,
  }).catch(() => {});
  return { ok: true };
}

// ─── Kundenakte → Abrechnung ─────────────────────────────────────────────

/**
 * Überweisung beim Kunden erlauben bzw. Zahlungsziel ändern (Audit-Eintrag). Zahlt der Kunde schon per Rechnung,
 * wird das Zahlungsziel im laufenden Abo mitgezogen. Nicht mehr erlaubt: Das Abo bleibt bei Rechnung, bis der
 * Kunde im Kundenbereich eine Lastschrift hinterlegt (Hinweis in der Rückmeldung).
 */
export async function setzeUeberweisungKunde(
  customerId: string,
  input: { allow: boolean; days: unknown },
  actor?: AuditActor,
): Promise<{ ok: true; hinweis?: string } | { ok: false; error: string }> {
  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, allowBankTransfer: true, bankTransferDays: true, zahltPerUeberweisung: true, stripeCustomerId: true },
  });
  if (!c) return { ok: false, error: "Kunde nicht gefunden." };
  const days = parseZahlungsziel(input.days);
  if (c.allowBankTransfer === input.allow && c.bankTransferDays === days) return { ok: true };
  await prisma.customer.update({ where: { id: c.id }, data: { allowBankTransfer: input.allow, bankTransferDays: days } });
  await audit("billing.ueberweisung", {
    entity: "Customer",
    entityId: c.id,
    customerId: c.id,
    actor,
    details: { erlaubt: { from: c.allowBankTransfer, to: input.allow }, zahlungsziel: { from: c.bankTransferDays, to: days } },
  });
  let hinweis: string | undefined;
  if (c.zahltPerUeberweisung && c.stripeCustomerId && days !== c.bankTransferDays) {
    const stripe = stripeClient();
    try {
      const subs = stripe ? await stripe.subscriptions.list({ customer: c.stripeCustomerId, status: "active", limit: 10 }) : null;
      for (const s of subs?.data ?? []) if (s.collection_method === "send_invoice") await setBankTransferOnSubscription(s.id, days);
    } catch (err) {
      reportError(err, "ueberweisung-zahlungsziel", { customer: c.id });
      hinweis = "Zahlungsziel im Stripe-Abo bitte von Hand anpassen.";
    }
  }
  if (!input.allow && c.zahltPerUeberweisung) {
    hinweis = "Der Kunde zahlt weiter per Rechnung, bis er im Kundenbereich unter Konto & Rechnungen eine Lastschrift hinterlegt.";
  }
  return { ok: true, hinweis };
}
