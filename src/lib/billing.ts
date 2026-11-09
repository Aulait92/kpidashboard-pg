// Abrechnung über Stripe Billing.
//
// Ablauf: Kunde nimmt das Angebot online an → Stripe Checkout zahlt das
// Setup (einmalig, mit Rechnung) und speichert dabei die Zahlungsart (z. B.
// SEPA-Mandat). Nach erfolgreichem Checkout legt der Webhook einen
// Abo-Zeitplan an, der erst am vereinbarten Startdatum beginnt – mit
// Startpreis-Phase (falls vereinbart) und danach dem normalen Monatspreis.
// (Checkout selbst kann Setup sofort + Monatsgebühr später nicht abbilden.)
// Zahlungsarten kommen dynamisch aus den Dashboard-Einstellungen –
// bewusst ohne payment_method_types; ohne Wiederverwendbarkeit (z. B.
// Überweisung) blendet Stripe sie wegen setup_future_usage selbst aus.
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

type ProductKey = "software" | "service" | "setup" | "setup_service";
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
  setup_service: {
    name: "Setup Leadgenerierung",
    description: "Einmalige Einrichtung: Kampagne, Werbemittel und Lead-Formular.",
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

async function ensureCustomer(stripe: Stripe, offer: OfferRow): Promise<string> {
  if (offer.stripeCustomerId) return offer.stripeCustomerId;
  const customer = await stripe.customers.create(
    {
      name: offer.company || offer.contactName,
      email: offer.email ?? undefined,
      preferred_locales: ["de"],
      ...(offer.street && offer.zip && offer.city
        ? { address: { line1: offer.street, postal_code: offer.zip, city: offer.city, country: "DE" } }
        : {}),
      metadata: offerMeta(offer),
    },
    { idempotencyKey: `offer-customer-${offer.id}` },
  );
  await prisma.offer.update({ where: { id: offer.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

type OfferRow = NonNullable<Awaited<ReturnType<typeof prisma.offer.findUnique>>>;

const offerMeta = (offer: OfferRow) => ({
  offer_id: offer.id,
  offer_number: offer.number,
  deal_id: offer.dealId ?? "",
  sales_contact_id: offer.salesContactId ?? "",
});

const packageName = (offer: OfferRow) => (offer.package === "service" ? "Leadgenerierung" : "Leadgenerierung + Software");

/**
 * Erstellt (oder erneuert) die Stripe-Bezahlseite für ein angenommenes
 * Angebot und gibt die URL zurück. Bezahlt wird nur das Setup; die
 * Zahlungsart wird für die Monatsgebühren gespeichert.
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
    const [setup, tax] = await Promise.all([
      productId(stripe, offer.package === "service" ? "setup_service" : "setup"),
      resolveTax(stripe),
    ]);
    const customerId = await ensureCustomer(stripe, offer);
    const products = offerProducts(offer.products).map((p) => p.name).join(", ");
    const meta = offerMeta(offer);
    const setupFee = Number(offer.setupFee);
    const base = getAppUrl();
    const common = {
      customer: customerId,
      customer_update: { address: "auto" as const, name: "auto" as const },
      billing_address_collection: "required" as const,
      tax_id_collection: { enabled: true },
      locale: "de" as const,
      client_reference_id: offer.id,
      integration_identifier: "pg-angebot-qkzvmtrb",
      // Für deutsche Geschäftskunden irrelevant (Belgien).
      excluded_payment_method_types: ["bancontact" as const],
      metadata: meta,
      success_url: `${base}/angebot/${offer.token}?zahlung=ok`,
      cancel_url: `${base}/angebot/${offer.token}?zahlung=abgebrochen`,
    };

    const session =
      setupFee > 0
        ? await stripe.checkout.sessions.create({
            ...common,
            mode: "payment",
            ...(tax.automatic ? { automatic_tax: { enabled: true } } : {}),
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: "eur",
                  product: setup,
                  unit_amount: cents(setupFee),
                  tax_behavior: "exclusive",
                },
                ...(tax.automatic ? {} : { tax_rates: [tax.rateId!] }),
              },
            ],
            payment_intent_data: {
              setup_future_usage: "off_session",
              description: `Setup ${packageName(offer)} (${products}) – Angebot ${offer.number}`,
              metadata: meta,
            },
            invoice_creation: {
              enabled: true,
              invoice_data: {
                description: `Setup ${packageName(offer)} (${products}) – Angebot ${offer.number}`,
                metadata: meta,
              },
            },
          })
        : await stripe.checkout.sessions.create({
            ...common,
            mode: "setup",
            currency: "eur",
            setup_intent_data: { metadata: meta, description: `Zahlungsart für Angebot ${offer.number}` },
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

/** Zahlungsart aus dem abgeschlossenen Checkout (Zahlung oder reine Einrichtung). */
async function paymentMethodOf(stripe: Stripe, session: Stripe.Checkout.Session): Promise<string | null> {
  const id = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));
  if (session.mode === "payment" && session.payment_intent) {
    const pi = await stripe.paymentIntents.retrieve(id(session.payment_intent)!);
    return id(pi.payment_method);
  }
  if (session.mode === "setup" && session.setup_intent) {
    const si = await stripe.setupIntents.retrieve(id(session.setup_intent)!);
    return id(si.payment_method);
  }
  return null;
}

/**
 * Legt nach erfolgreichem Checkout den Abo-Zeitplan an: Beginn am
 * Startdatum (oder sofort, wenn es schon erreicht ist), ggf. Startpreis-Phase.
 * Idempotent über den Idempotency-Key und stripeScheduleId.
 */
export async function createScheduleForOffer(offerId: string, session: Stripe.Checkout.Session): Promise<void> {
  const stripe = stripeClient();
  if (!stripe) return;
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer || offer.stripeScheduleId || offer.stripeSubscriptionId) return;
  const customerId = offer.stripeCustomerId ?? (typeof session.customer === "string" ? session.customer : session.customer?.id);
  if (!customerId) throw new Error(`Angebot ${offer.number}: kein Stripe-Kunde`);

  const [software, service, tax, pm] = await Promise.all([
    productId(stripe, "software"),
    productId(stripe, "service"),
    resolveTax(stripe),
    paymentMethodOf(stripe, session),
  ]);
  if (pm) {
    await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm } });
  }

  const monthly = Number(offer.monthlyFee);
  const softwareFee = Math.min(Number(offer.softwareFee), monthly);
  const taxRates = tax.automatic ? undefined : [tax.rateId!];
  const item = (product: string, amount: number): Stripe.SubscriptionScheduleCreateParams.Phase.Item => ({
    quantity: 1,
    price_data: { currency: "eur", product, unit_amount: cents(amount), recurring: { interval: "month" }, tax_behavior: "exclusive" },
    ...(taxRates ? { tax_rates: taxRates } : {}),
  });
  const itemsFor = (total: number) => {
    const sw = Math.min(softwareFee, total);
    const items: Stripe.SubscriptionScheduleCreateParams.Phase.Item[] = [];
    if (sw > 0) items.push(item(software, sw));
    if (total - sw > 0) items.push(item(service, total - sw));
    return items;
  };

  const meta = offerMeta(offer);
  const intro = offer.introMonthlyFee == null ? null : Number(offer.introMonthlyFee);
  const phases: Stripe.SubscriptionScheduleCreateParams.Phase[] = [];
  if (intro != null && offer.introMonths && intro < monthly) {
    phases.push({ items: itemsFor(intro), duration: { interval: "month", interval_count: offer.introMonths }, metadata: meta });
  }
  phases.push({ items: itemsFor(monthly), metadata: meta });

  const startAt = offer.startDate ? Math.floor(offer.startDate.getTime() / 1000) : 0;
  const products = offerProducts(offer.products).map((p) => p.name).join(", ");
  const schedule = await stripe.subscriptionSchedules.create(
    {
      customer: customerId,
      start_date: startAt > Date.now() / 1000 + 60 ? startAt : "now",
      end_behavior: "release",
      billing_mode: { type: "flexible" },
      metadata: meta,
      default_settings: {
        collection_method: "charge_automatically",
        ...(pm ? { default_payment_method: pm } : {}),
        ...(tax.automatic ? { automatic_tax: { enabled: true } } : {}),
        description: `${packageName(offer)} (${products}) – Angebot ${offer.number}`,
      },
      phases,
    },
    { idempotencyKey: `offer-schedule-${offer.id}` },
  );
  await prisma.offer.update({
    where: { id: offer.id },
    data: {
      stripeScheduleId: schedule.id,
      ...(schedule.subscription ? { stripeSubscriptionId: typeof schedule.subscription === "string" ? schedule.subscription : schedule.subscription.id } : {}),
    },
  });
}

/** Zeitplan stoppen, z. B. wenn die SEPA-Lastschrift für das Setup platzt. */
export async function cancelScheduleForOffer(offerId: string): Promise<void> {
  const stripe = stripeClient();
  if (!stripe) return;
  const offer = await prisma.offer.findUnique({ where: { id: offerId }, select: { stripeScheduleId: true } });
  if (!offer?.stripeScheduleId) return;
  const schedule = await stripe.subscriptionSchedules.retrieve(offer.stripeScheduleId);
  if (schedule.status === "not_started" || schedule.status === "active") {
    await stripe.subscriptionSchedules.cancel(offer.stripeScheduleId);
  }
}
