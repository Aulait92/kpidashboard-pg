// Abrechnung über Stripe Billing.
//
// Ablauf: Kunde nimmt das Angebot online an → Stripe Checkout (Abo-Modus)
// mit Software + Betreuung (monatlich) und Setup (einmalig, erste Rechnung).
// Zahlungsarten kommen dynamisch aus den Dashboard-Einstellungen (SEPA,
// Karte, Überweisung …) – bewusst ohne payment_method_types.
// Steuer: Stripe Tax, wenn eine aktive Registrierung existiert; sonst fester
// Steuersatz „USt. 19 %“, damit nie ohne Umsatzsteuer abgerechnet wird.

import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/email";
import { reportError } from "@/lib/monitoring";
import { offerProducts } from "@/components/offer-document";

let client: Stripe | null = null;

/** Stripe-Client – null, wenn STRIPE_SECRET_KEY nicht gesetzt ist. */
export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!client) client = new Stripe(key, { appInfo: { name: "performancegrowth-kpidashboard" } });
  return client;
}

export const billingEnabled = () => !!process.env.STRIPE_SECRET_KEY?.trim();

type ProductKey = "software" | "service" | "setup";
const productCache = new Map<ProductKey, string>();

const PRODUCT_DEFAULTS: Record<ProductKey, { name: string; description: string }> = {
  software: {
    name: "Software (CRM + WhatsApp-Assistent)",
    description: "Lizenz für die performancegrowth-Software: Lead-Verwaltung, digitaler WhatsApp-Assistent, Terminbuchung, Auswertungen.",
  },
  service: {
    name: "Betreuung Leadgenerierung",
    description: "Kampagnenbetreuung auf Facebook & Instagram inkl. Werbemitteln und laufender Optimierung.",
  },
  setup: {
    name: "Setup Leadgenerierung + Software",
    description: "Einmalige Einrichtung: Kampagne, Werbemittel, Lead-Formular, Software, WhatsApp und Kalender.",
  },
};

/** Produkt-ID per Metadaten pg_key finden (Sandbox und Live gleich aufgebaut). */
async function productId(stripe: Stripe, key: ProductKey): Promise<string> {
  const cached = productCache.get(key);
  if (cached) return cached;
  const found = await stripe.products.search({ query: `metadata['pg_key']:'${key}' AND active:'true'`, limit: 1 });
  let id = found.data[0]?.id;
  if (!id) {
    const created = await stripe.products.create({ ...PRODUCT_DEFAULTS[key], metadata: { pg_key: key } });
    id = created.id;
  }
  productCache.set(key, id);
  return id;
}

let taxMode: { automatic: boolean; rateId: string | null; checkedAt: number } | null = null;

/** Stripe Tax nur mit aktiver Registrierung – sonst fester Satz 19 % (exklusiv). */
async function resolveTax(stripe: Stripe) {
  if (taxMode && Date.now() - taxMode.checkedAt < 10 * 60 * 1000) return taxMode;
  const regs = await stripe.tax.registrations.list({ status: "active", limit: 1 });
  if (regs.data.length > 0) {
    taxMode = { automatic: true, rateId: null, checkedAt: Date.now() };
    return taxMode;
  }
  const rates = await stripe.taxRates.list({ active: true, limit: 100 });
  let rate = rates.data.find((r) => r.metadata?.pg_key === "ust19");
  if (!rate) {
    rate = await stripe.taxRates.create({
      display_name: "USt.",
      description: "Umsatzsteuer Deutschland 19 %",
      jurisdiction: "DE",
      country: "DE",
      percentage: 19,
      inclusive: false,
      tax_type: "vat",
      metadata: { pg_key: "ust19" },
    });
  }
  reportError(new Error("Stripe Tax ohne aktive Registrierung – fester Steuersatz 19 % wird verwendet."), "billing-tax-fallback");
  taxMode = { automatic: false, rateId: rate.id, checkedAt: Date.now() };
  return taxMode;
}

const cents = (eur: number) => Math.round(eur * 100);

/**
 * Erstellt (oder erneuert) die Stripe-Bezahlseite für ein angenommenes
 * Angebot und gibt die URL zurück.
 */
export async function createCheckoutForOffer(offerId: string): Promise<{ url: string } | { error: string }> {
  const stripe = stripeClient();
  if (!stripe) return { error: "Zahlung ist noch nicht eingerichtet." };
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer) return { error: "Angebot nicht gefunden." };
  if (offer.status !== "accepted") return { error: "Das Angebot ist noch nicht angenommen." };
  if (offer.paymentStatus === "paid" || offer.paymentStatus === "processing") {
    return { error: "Die Zahlung ist bereits eingerichtet." };
  }

  try {
    const [software, service, setup, tax] = await Promise.all([
      productId(stripe, "software"),
      productId(stripe, "service"),
      productId(stripe, "setup"),
      resolveTax(stripe),
    ]);

    // Stripe-Kunde (einmal je Angebot; Adresse wird im Checkout ergänzt).
    let customerId = offer.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          name: offer.company || offer.contactName,
          email: offer.email ?? undefined,
          preferred_locales: ["de"],
          ...(offer.street && offer.zip && offer.city
            ? { address: { line1: offer.street, postal_code: offer.zip, city: offer.city, country: "DE" } }
            : {}),
          metadata: { offer_id: offer.id, deal_id: offer.dealId ?? "", sales_contact_id: offer.salesContactId ?? "", contact_name: offer.contactName },
        },
        { idempotencyKey: `offer-customer-${offer.id}` },
      );
      customerId = customer.id;
      await prisma.offer.update({ where: { id: offer.id }, data: { stripeCustomerId: customerId } });
    }

    const softwareFee = Number(offer.softwareFee);
    const monthly = Number(offer.monthlyFee);
    const serviceFee = Math.max(0, monthly - softwareFee);
    const taxRates = tax.automatic ? undefined : [tax.rateId!];
    const recurring = { interval: "month" as const };
    const products = offerProducts(offer.products).map((p) => p.name).join(", ");

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        quantity: 1,
        price_data: { currency: "eur", product: software, unit_amount: cents(Math.min(softwareFee, monthly)), recurring, tax_behavior: "exclusive" },
        ...(taxRates ? { tax_rates: taxRates } : {}),
      },
    ];
    if (serviceFee > 0) {
      lineItems.push({
        quantity: 1,
        price_data: { currency: "eur", product: service, unit_amount: cents(serviceFee), recurring, tax_behavior: "exclusive" },
        ...(taxRates ? { tax_rates: taxRates } : {}),
      });
    }
    if (Number(offer.setupFee) > 0) {
      lineItems.push({
        quantity: 1,
        price_data: { currency: "eur", product: setup, unit_amount: cents(Number(offer.setupFee)), tax_behavior: "exclusive" },
        ...(taxRates ? { tax_rates: taxRates } : {}),
      });
    }

    // Startpreis: Rabatt auf die Betreuung für die ersten N Monate.
    let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | undefined;
    const intro = offer.introMonthlyFee == null ? null : Number(offer.introMonthlyFee);
    if (intro != null && offer.introMonths && intro < monthly && serviceFee > 0) {
      const amountOff = Math.min(serviceFee, monthly - intro);
      const coupon = await stripe.coupons.create(
        {
          name: `Startpreis ${offer.introMonths} Monate`,
          amount_off: cents(amountOff),
          currency: "eur",
          duration: "repeating",
          duration_in_months: offer.introMonths,
          applies_to: { products: [service] },
          metadata: { offer_id: offer.id },
        },
        { idempotencyKey: `offer-coupon-${offer.id}` },
      );
      discounts = [{ coupon: coupon.id }];
    }

    const base = getAppUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      customer_update: { address: "auto", name: "auto" },
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      ...(tax.automatic ? { automatic_tax: { enabled: true } } : {}),
      line_items: lineItems,
      ...(discounts ? { discounts } : {}),
      locale: "de",
      client_reference_id: offer.id,
      integration_identifier: "pg-angebot-qkzvmtrb",
      metadata: { offer_id: offer.id, deal_id: offer.dealId ?? "", sales_contact_id: offer.salesContactId ?? "" },
      subscription_data: {
        description: `Leadgenerierung + Software (${products}) – Angebot ${offer.number}`,
        metadata: { offer_id: offer.id, deal_id: offer.dealId ?? "", sales_contact_id: offer.salesContactId ?? "", offer_number: offer.number },
        billing_mode: { type: "flexible" },
      },
      success_url: `${base}/angebot/${offer.token}?zahlung=ok`,
      cancel_url: `${base}/angebot/${offer.token}?zahlung=abgebrochen`,
    });

    await prisma.offer.update({
      where: { id: offer.id },
      data: { stripeCheckoutSessionId: session.id, paymentStatus: "pending" },
    });
    if (!session.url) return { error: "Stripe hat keine Bezahlseite geliefert." };
    return { url: session.url };
  } catch (err) {
    reportError(err, "billing-checkout", { offer: offer.number });
    return { error: "Die Bezahlseite konnte gerade nicht geöffnet werden. Bitte versuche es gleich noch einmal." };
  }
}
