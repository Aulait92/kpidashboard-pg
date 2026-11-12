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
import { annualMultiplier, PRICE_LIST } from "@/lib/offer-pricing";
import { audit, type AuditActor } from "@/lib/audit";

let client: Stripe | null = null;

/** Stripe-Client – null, wenn STRIPE_SECRET_KEY nicht gesetzt ist. */
export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!client) client = new Stripe(key, { appInfo: { name: "performancegrowth-kpidashboard" } });
  return client;
}

export const billingEnabled = () => !!process.env.STRIPE_SECRET_KEY?.trim();

type ProductKey = "software" | "service" | "setup" | "setup_service" | "whatsapp" | "leads" | "seat" | "bestand" | "empfehlung";
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
  leads: {
    name: "Leads (Pay-per-Lead)",
    description: "Exklusive Leads je Bestellung, im Voraus berechnet.",
  },
  seat: {
    name: "Weiterer Berater-Login",
    description: "Zusätzlicher Zugang zur performancegrowth-Software je Berater (über die inklusiven Logins hinaus).",
  },
  bestand: {
    name: "Bestandskunden-Modul",
    description: "Bestandskunden importieren und per WhatsApp ansprechen, inklusive WhatsApp-Gebühren bis zum Monatskontingent.",
  },
  empfehlung: {
    name: "Empfehlungen & Bewertungen",
    description: "Nach jedem Abschluss automatisch um eine Google-Bewertung und später um eine Empfehlung bitten, inklusive Empfehlungsseite und Auswertung.",
  },
  whatsapp: {
    name: "WhatsApp-Gebühren (Meta)",
    description: "Von Meta je Nachricht berechnete WhatsApp-Gebühren, weiterberechnet nach Verbrauch.",
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
  // Gewollter Normalfall (alle Kunden deutsche B2B-Kunden): kein Fehler, nur einmal ins Log.
  if (!taxMode) console.info("[billing] Stripe Tax ohne aktive Registrierung – fester Steuersatz 19 % wird verwendet.");
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
              description: `Setup ${packageName(offer)} (${products}), Angebot ${offer.number}`,
              metadata: meta,
            },
            invoice_creation: {
              enabled: true,
              invoice_data: {
                description: `Setup ${packageName(offer)} (${products}), Angebot ${offer.number}`,
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
    return { error: "Die Bezahlseite konnte gerade nicht geöffnet werden. Bitte versuchen Sie es gleich noch einmal." };
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

  const [software, service, seat, bestand, empfehlung, tax, pm] = await Promise.all([
    productId(stripe, "software"),
    productId(stripe, "service"),
    productId(stripe, "seat"),
    productId(stripe, "bestand"),
    productId(stripe, "empfehlung"),
    resolveTax(stripe),
    paymentMethodOf(stripe, session),
  ]);
  if (pm) {
    await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm } });
  }

  const monthly = Number(offer.monthlyFee);
  const softwareFee = Math.min(Number(offer.softwareFee), monthly);
  const taxRates = tax.automatic ? undefined : [tax.rateId!];
  // Jährlich im Voraus: alle Positionen mit Intervall Jahr, Betrag × (12 − Freimonate)
  const annual = offer.annualPrepay;
  const factor = annual ? annualMultiplier(offer.annualFreeMonths ?? PRICE_LIST.annualFreeMonths) : 1;
  const interval = annual ? ("year" as const) : ("month" as const);
  const item = (product: string, amount: number, quantity = 1): Stripe.SubscriptionScheduleCreateParams.Phase.Item => ({
    quantity,
    price_data: { currency: "eur", product, unit_amount: cents(amount * factor), recurring: { interval }, tax_behavior: "exclusive" },
    ...(taxRates ? { tax_rates: taxRates } : {}),
  });
  const extraSeats = offer.seats != null && offer.seatsIncluded != null ? Math.max(0, offer.seats - offer.seatsIncluded) : 0;
  const seatPrice = Number(offer.seatMonthly ?? 0);
  const bestandPrice = Number(offer.bestandMonthly ?? 0);
  const empfehlungPrice = Number(offer.empfehlungMonthly ?? 0);
  const itemsFor = (total: number) => {
    const sw = Math.min(softwareFee, total);
    const items: Stripe.SubscriptionScheduleCreateParams.Phase.Item[] = [];
    if (sw > 0) items.push(item(software, sw));
    if (total - sw > 0) items.push(item(service, total - sw));
    // Weitere Logins als Menge einer eigenen Position (Änderungen im Team passen die Menge an)
    if (extraSeats > 0 && seatPrice > 0) items.push(item(seat, seatPrice, extraSeats));
    if (bestandPrice > 0) items.push(item(bestand, bestandPrice));
    if (empfehlungPrice > 0) items.push(item(empfehlung, empfehlungPrice));
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
        description: `${packageName(offer)} (${products}), Angebot ${offer.number}`,
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

// ─── Kundenbereich „Konto & Rechnungen“ ────────────────────────────────

export type CustomerInvoice = {
  id: string;
  number: string | null;
  created: Date;
  total: number;
  status: string | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
};

/** Rechnungen eines Stripe-Kunden (neueste zuerst, ohne Entwürfe). */
export async function listCustomerInvoices(stripeCustomerId: string): Promise<CustomerInvoice[]> {
  const stripe = stripeClient();
  if (!stripe) return [];
  const res = await stripe.invoices.list({ customer: stripeCustomerId, limit: 36 });
  return res.data
    .filter((i) => i.status !== "draft")
    .map((i) => ({
      id: i.id ?? "",
      number: i.number ?? null,
      created: new Date(i.created * 1000),
      total: (i.total ?? 0) / 100,
      status: i.status ?? null,
      hostedUrl: i.hosted_invoice_url ?? null,
      pdfUrl: i.invoice_pdf ?? null,
    }));
}

let portalConfigId: string | null = null;

/** Eigene Portal-Konfiguration: Zahlungsart, Rechnungsdaten, Rechnungen – keine Kündigung per Klick. */
async function portalConfiguration(stripe: Stripe): Promise<string> {
  if (portalConfigId) return portalConfigId;
  const list = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const found = list.data.find((c) => c.metadata?.pg_key === "kundenbereich");
  if (found) return (portalConfigId = found.id);
  const created = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "performancegrowth: Zahlung und Rechnungen" },
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["name", "email", "address", "tax_id"] },
      subscription_cancel: { enabled: false },
    },
    metadata: { pg_key: "kundenbereich" },
  });
  return (portalConfigId = created.id);
}

/** Link ins Stripe-Kundenportal (Zahlungsart, Rechnungsadresse, USt-IdNr.). */
export async function createPortalUrl(stripeCustomerId: string, returnUrl: string): Promise<string> {
  const stripe = stripeClient();
  if (!stripe) throw new Error("Zahlung ist nicht eingerichtet.");
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    configuration: await portalConfiguration(stripe),
    return_url: returnUrl,
    locale: "de",
  });
  return session.url;
}

// ─── Pause / Urlaub ────────────────────────────────────────────────────
// Während der Pause fällt nur die Software-Gebühr an (bei „Nur Betreuung“
// nichts), tagesgenau über Stripe-Prorations. Vorgehen: Betreuungs-Position
// auf Menge 0 (Fallback: Position entfernen und später neu anlegen; bei nur
// einer Position: Einzug aussetzen). Das gewählte Verfahren wird gespeichert,
// damit das Fortsetzen exakt rückwärts läuft.

export type BillingPauseState =
  | { method: "qty0"; subscriptionId: string; itemId: string }
  | { method: "removed"; subscriptionId: string; cents: number }
  | { method: "pause_collection"; subscriptionId: string }
  | { method: "none"; reason: string };

export class IntroPhaseError extends Error {
  constructor() {
    super("INTRO_PHASE");
  }
}

async function activeSubscription(stripe: Stripe, stripeCustomerId: string) {
  const subs = await stripe.subscriptions.list({ customer: stripeCustomerId, status: "all", limit: 10 });
  return subs.data.find((s) => ["active", "past_due", "trialing"].includes(s.status)) ?? null;
}

/** Hängt ein Zeitplan am Abo, wird er in der letzten Phase gelöst (sonst Startpreis-Phase → Fehler). */
async function detachSchedule(stripe: Stripe, sub: Stripe.Subscription) {
  const scheduleId = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
  if (!scheduleId) return;
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  if (schedule.status !== "active") return;
  const now = Date.now() / 1000;
  const last = schedule.phases[schedule.phases.length - 1];
  if (last && last.start_date <= now) {
    await stripe.subscriptionSchedules.release(scheduleId);
    return;
  }
  throw new IntroPhaseError();
}

export async function pauseBilling(stripeCustomerId: string): Promise<BillingPauseState> {
  const stripe = stripeClient();
  if (!stripe) return { method: "none", reason: "Stripe nicht eingerichtet" };
  const sub = await activeSubscription(stripe, stripeCustomerId);
  if (!sub) return { method: "none", reason: "Kein laufendes Abo (startet ggf. erst noch)" };
  // Jährliche Vorauszahlung: Pause ohne Gutschrift (AGB), Abo bleibt unverändert.
  if (sub.items.data.some((i) => i.price.recurring?.interval === "year")) {
    return { method: "none", reason: "Jährliche Vorauszahlung: Pause ohne Gutschrift" };
  }
  await detachSchedule(stripe, sub);
  const service = await productId(stripe, "service");
  const item = sub.items.data.find((i) => (typeof i.price.product === "string" ? i.price.product : i.price.product.id) === service);
  if (!item) return { method: "none", reason: "Keine Betreuungs-Position im Abo" };
  try {
    await stripe.subscriptionItems.update(item.id, { quantity: 0, proration_behavior: "create_prorations" });
    return { method: "qty0", subscriptionId: sub.id, itemId: item.id };
  } catch (err) {
    reportError(err, "billing-pause-qty0", { subscription: sub.id });
  }
  if (sub.items.data.length > 1) {
    const cents = item.price.unit_amount ?? 0;
    await stripe.subscriptionItems.del(item.id, { proration_behavior: "create_prorations" });
    return { method: "removed", subscriptionId: sub.id, cents };
  }
  await stripe.subscriptions.update(sub.id, { pause_collection: { behavior: "void" } });
  return { method: "pause_collection", subscriptionId: sub.id };
}

export async function resumeBilling(state: BillingPauseState): Promise<void> {
  const stripe = stripeClient();
  if (!stripe || state.method === "none") return;
  if (state.method === "qty0") {
    await stripe.subscriptionItems.update(state.itemId, { quantity: 1, proration_behavior: "create_prorations" });
  } else if (state.method === "removed") {
    const [service, tax] = await Promise.all([productId(stripe, "service"), resolveTax(stripe)]);
    await stripe.subscriptionItems.create({
      subscription: state.subscriptionId,
      quantity: 1,
      proration_behavior: "create_prorations",
      price_data: { currency: "eur", product: service, unit_amount: state.cents, recurring: { interval: "month" }, tax_behavior: "exclusive" },
      ...(tax.automatic ? {} : { tax_rates: [tax.rateId!] }),
    });
  } else if (state.method === "pause_collection") {
    await stripe.subscriptions.update(state.subscriptionId, { pause_collection: "" });
  }
}

/**
 * Einmaliger Rechnungsposten (z. B. WhatsApp-Gebühren). Ohne Rechnungs-ID
 * bleibt er offen und erscheint auf der nächsten Abo-Rechnung des Kunden.
 */
export async function addInvoiceItem(opts: {
  stripeCustomerId: string;
  amountEur: number;
  description: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
}): Promise<string> {
  const stripe = stripeClient();
  if (!stripe) throw new Error("Stripe ist nicht eingerichtet.");
  const [product, tax] = await Promise.all([productId(stripe, "whatsapp"), resolveTax(stripe)]);
  const item = await stripe.invoiceItems.create(
    {
      customer: opts.stripeCustomerId,
      description: opts.description,
      price_data: { currency: "eur", product, unit_amount: cents(opts.amountEur), tax_behavior: "exclusive" },
      ...(tax.automatic ? {} : { tax_rates: [tax.rateId!] }),
      metadata: opts.metadata,
    },
    { idempotencyKey: opts.idempotencyKey },
  );
  return item.id;
}

/**
 * Garantie-Gutschrift: negativer Rechnungsposten (netto, zzgl. USt. wie die
 * Abo-Positionen). Stripe verrechnet ihn mit der nächsten Rechnung des Kunden;
 * ist er höher als die Rechnung, bleibt der Rest als Guthaben stehen.
 * Idempotent je Garantiefall.
 */
export async function addGarantieGutschrift(opts: {
  stripeCustomerId: string;
  amountEur: number;
  description: string;
  fallId: string;
  metadata?: Record<string, string>;
}): Promise<string> {
  const stripe = stripeClient();
  if (!stripe) throw new Error("Stripe ist nicht eingerichtet.");
  if (!(opts.amountEur > 0)) throw new Error("Kein Betrag für die Gutschrift.");
  // Negativer Betrag geht nur über `amount` (price_data erlaubt keine negativen Preise), daher ohne Produkt.
  const tax = await resolveTax(stripe);
  const item = await stripe.invoiceItems.create(
    {
      customer: opts.stripeCustomerId,
      description: opts.description,
      amount: -cents(opts.amountEur),
      currency: "eur",
      tax_behavior: "exclusive",
      ...(tax.automatic ? {} : { tax_rates: [tax.rateId!] }),
      metadata: { pg_kind: "garantie", garantie_fall: opts.fallId, ...opts.metadata },
    },
    { idempotencyKey: `garantie-${opts.fallId}` },
  );
  return item.id;
}

// ─── Pay-per-Lead: Zahlungsart hinterlegen und Wochenrechnungen ───────────

/** Stripe-Kunde für einen Käufer sicherstellen (ohne Angebot, z. B. Pay-per-Lead). */
export async function ensureStripeCustomerFor(customerId: string): Promise<string> {
  const stripe = stripeClient();
  if (!stripe) throw new Error("Stripe ist nicht eingerichtet.");
  const c = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: { name: true, stripeCustomerId: true, users: { where: { role: "BUYER" }, select: { email: true }, orderBy: { createdAt: "asc" }, take: 1 } },
  });
  if (c.stripeCustomerId) return c.stripeCustomerId;
  const created = await stripe.customers.create(
    { name: c.name, email: c.users[0]?.email, preferred_locales: ["de"], metadata: { customer_id: customerId } },
    { idempotencyKey: `customer-${customerId}` },
  );
  await prisma.customer.update({ where: { id: customerId }, data: { stripeCustomerId: created.id } });
  return created.id;
}

/** Stripe-Seite zum Hinterlegen der Zahlungsart (SEPA/Karte). */
export async function createPaymentSetupUrl(customerId: string, returnUrl: string): Promise<string> {
  const stripe = stripeClient();
  if (!stripe) throw new Error("Stripe ist nicht eingerichtet.");
  const stripeCustomerId = await ensureStripeCustomerFor(customerId);
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    currency: "eur",
    customer: stripeCustomerId,
    locale: "de",
    success_url: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}zahlung=ok`,
    cancel_url: returnUrl,
    metadata: { kind: "payment_setup", customer_id: customerId },
    setup_intent_data: { metadata: { kind: "payment_setup", customer_id: customerId }, description: "Zahlungsart für Lead-Bestellungen" },
  });
  if (!session.url) throw new Error("Stripe hat keine Seite geliefert.");
  return session.url;
}

/** Nach „Zahlungsart hinterlegen“: als Standard für Rechnungen setzen. */
export async function savePaymentSetup(session: Stripe.Checkout.Session): Promise<void> {
  const stripe = stripeClient();
  if (!stripe) return;
  const pm = await paymentMethodOf(stripe, session);
  const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (pm && customer) await stripe.customers.update(customer, { invoice_settings: { default_payment_method: pm } });
}

export async function hasPaymentMethod(stripeCustomerId: string | null): Promise<boolean> {
  const stripe = stripeClient();
  if (!stripe || !stripeCustomerId) return false;
  const c = await stripe.customers.retrieve(stripeCustomerId);
  if (c.deleted) return false;
  return !!c.invoice_settings?.default_payment_method;
}

/**
 * Rechnung sofort erstellen und einziehen (Vorkasse für eine Bestellung).
 * Liefert den Stand: paid | processing (Lastschrift läuft) | open | failed.
 */
export async function chargeNow(opts: {
  stripeCustomerId: string;
  lines: { description: string; amountEur: number }[];
  description: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
}): Promise<{ invoiceId: string; status: "paid" | "processing" | "open" | "failed" }> {
  const stripe = stripeClient();
  if (!stripe) throw new Error("Stripe ist nicht eingerichtet.");
  const [product, tax] = await Promise.all([productId(stripe, "leads"), resolveTax(stripe)]);
  const invoice = await stripe.invoices.create(
    {
      customer: opts.stripeCustomerId,
      collection_method: "charge_automatically",
      auto_advance: true,
      pending_invoice_items_behavior: "exclude",
      description: opts.description,
      metadata: opts.metadata,
      ...(tax.automatic ? { automatic_tax: { enabled: true } } : {}),
    },
    { idempotencyKey: `${opts.idempotencyKey}-inv` },
  );
  for (const [i, l] of opts.lines.entries()) {
    await stripe.invoiceItems.create(
      {
        customer: opts.stripeCustomerId,
        invoice: invoice.id,
        description: l.description,
        price_data: { currency: "eur", product, unit_amount: cents(l.amountEur), tax_behavior: "exclusive" },
        ...(tax.automatic ? {} : { tax_rates: [tax.rateId!] }),
      },
      { idempotencyKey: `${opts.idempotencyKey}-item-${i}` },
    );
  }
  const finalized = await stripe.invoices.finalizeInvoice(invoice.id!);
  if (finalized.status === "paid") return { invoiceId: finalized.id!, status: "paid" };
  try {
    const paid = await stripe.invoices.pay(finalized.id!);
    return { invoiceId: paid.id!, status: paid.status === "paid" ? "paid" : "processing" };
  } catch (err) {
    // SEPA: Zahlung läuft (Bestätigung per Webhook); Karte abgelehnt → failed
    const code = (err as { code?: string }).code;
    if (code === "invoice_payment_intent_requires_action" || code === "payment_intent_action_required") return { invoiceId: finalized.id!, status: "open" };
    reportError(err, "ppl-charge", { invoice: finalized.id ?? "" });
    return { invoiceId: finalized.id!, status: "failed" };
  }
}

// ─── Zusätze nach Vertragsstart: Logins, Bestandskunden-Modul, Zahlweise ──
// Alle Änderungen tagesgenau über Stripe-Prorations. Ohne Stripe oder vor
// dem Abo-Start wird nur der Stand in der Datenbank gepflegt; der tägliche
// Abgleich im Cron holt Stripe nach, sobald das Abo läuft.

export type AddOnResult = { ok: true; changed: boolean; note?: string } | { ok: false; error: string };

const productOf = (i: Stripe.SubscriptionItem) => (typeof i.price.product === "string" ? i.price.product : i.price.product.id);
const intervalOf = (sub: Stripe.Subscription): "month" | "year" =>
  sub.items.data.some((i) => i.price.recurring?.interval === "year") ? "year" : "month";

/** Laufendes Abo für Änderungen vorbereiten (Zeitplan lösen); null = noch nicht möglich. */
async function editableSubscription(stripe: Stripe, stripeCustomerId: string): Promise<{ sub: Stripe.Subscription } | { note: string }> {
  const sub = await activeSubscription(stripe, stripeCustomerId);
  if (!sub) return { note: "Abo läuft noch nicht – wird beim Start abgeglichen." };
  try {
    await detachSchedule(stripe, sub);
  } catch (err) {
    if (err instanceof IntroPhaseError) return { note: "Startpreis-Phase läuft – wird danach automatisch abgeglichen." };
    throw err;
  }
  return { sub };
}

type Proration = "create_prorations" | "none";

async function setItemQuantity(
  stripe: Stripe,
  sub: Stripe.Subscription,
  key: "seat" | "bestand" | "empfehlung",
  quantity: number,
  monthlyUnit: number,
  proration: Proration = "create_prorations",
) {
  const [product, tax] = await Promise.all([productId(stripe, key), resolveTax(stripe)]);
  const item = sub.items.data.find((i) => productOf(i) === product);
  const interval = intervalOf(sub);
  const factor = interval === "year" ? annualMultiplier() : 1;
  if (item) {
    const unit = cents(monthlyUnit * factor);
    if (quantity === 0 && key !== "seat") {
      await stripe.subscriptionItems.del(item.id, { proration_behavior: proration });
    } else if (unit !== item.price.unit_amount && quantity > 0) {
      // Preis je Platz/Modul geändert (Admin): Position mit neuem Preis, anteilig verrechnet
      await stripe.subscriptionItems.update(item.id, {
        quantity,
        proration_behavior: "create_prorations",
        price_data: { currency: "eur", product, unit_amount: unit, recurring: { interval }, tax_behavior: "exclusive" },
      });
    } else if ((item.quantity ?? 0) !== quantity) {
      await stripe.subscriptionItems.update(item.id, { quantity, proration_behavior: "create_prorations" });
    }
    return;
  }
  if (quantity <= 0) return;
  await stripe.subscriptionItems.create({
    subscription: sub.id,
    quantity,
    proration_behavior: proration,
    price_data: { currency: "eur", product, unit_amount: cents(monthlyUnit * factor), recurring: { interval }, tax_behavior: "exclusive" },
    ...(tax.automatic ? {} : { tax_rates: [tax.rateId!] }),
  });
}

/** Weitere Logins im Abo an die tatsächliche Zahl der Logins anpassen (Inhaber + Berater). */
export async function syncSeatBilling(customerId: string, opts: { force?: boolean } = {}): Promise<AddOnResult> {
  try {
    const c = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { seatsIncluded: true, seatMonthly: true, seatsBilled: true, stripeCustomerId: true },
    });
    if (!c) return { ok: false, error: "Kunde nicht gefunden." };
    const price = Number(c.seatMonthly ?? 0);
    // Ohne Preis (individuelle Sonderkondition) wird nichts automatisch berechnet;
    // eine vorher berechnete Menge wird dann auf 0 gesetzt.
    if (c.seatsIncluded == null || (!(price > 0) && c.seatsBilled === 0)) return { ok: true, changed: false, note: "Keine Platz-Abrechnung vereinbart." };
    const logins = await prisma.user.count({ where: { customerId, role: "BUYER" } });
    const want = price > 0 ? Math.max(0, logins - c.seatsIncluded) : 0;
    if (want === c.seatsBilled && !opts.force) return { ok: true, changed: false };
    const stripe = stripeClient();
    if (stripe && c.stripeCustomerId) {
      const ed = await editableSubscription(stripe, c.stripeCustomerId);
      if ("note" in ed) return { ok: true, changed: false, note: ed.note };
      await setItemQuantity(stripe, ed.sub, "seat", want, price);
    }
    await prisma.customer.update({ where: { id: customerId }, data: { seatsBilled: want } });
    await audit("billing.seats", { entity: "Customer", entityId: customerId, customerId, details: { from: c.seatsBilled, to: want, logins } });
    return { ok: true, changed: true, ...(stripe && c.stripeCustomerId ? {} : { note: "Ohne Stripe – bitte von Hand abrechnen." }) };
  } catch (err) {
    reportError(err, "billing-seats", { customer: customerId });
    return { ok: false, error: "Die Abrechnung der Logins konnte nicht angepasst werden." };
  }
}

/**
 * Bestandskunden-Modul buchen, kostenlos freischalten (Bestandsschutz) oder abbestellen (sofort, anteilig).
 * opts.requireStripe (Selbstbuchung im Kundenbereich): nur mit laufendem, änderbarem Stripe-Abo –
 * sonst wird nichts geändert (kein Freischalten ohne Abrechnung).
 * opts.proration "none": z. B. Kündigung zurückgenommen – der laufende Zeitraum ist schon bezahlt.
 */
export async function setBestandModule(
  customerId: string,
  mode: "book" | "free" | "cancel",
  opts: { requireStripe?: boolean; proration?: Proration; actor?: AuditActor } = {},
): Promise<AddOnResult> {
  try {
    const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { stripeCustomerId: true, bestandMonthly: true } });
    if (!c) return { ok: false, error: "Kunde nicht gefunden." };
    // Buchen: vereinbarter Monatspreis, sonst Liste (auch wenn bisher 0 € hinterlegt war)
    const agreed = c.bestandMonthly != null ? Number(c.bestandMonthly) : 0;
    const price = mode === "book" ? (agreed > 0 ? agreed : PRICE_LIST.bestandModuleMonthly) : 0;
    let note: string | undefined;
    const stripe = stripeClient();
    if (opts.requireStripe && !(stripe && c.stripeCustomerId)) return { ok: false, error: "Für Ihr Konto ist keine Online-Abrechnung eingerichtet." };
    if (stripe && c.stripeCustomerId) {
      const ed = await editableSubscription(stripe, c.stripeCustomerId);
      if ("note" in ed) {
        if (opts.requireStripe) return { ok: false, error: ed.note };
        note = ed.note;
      } else await setItemQuantity(stripe, ed.sub, "bestand", mode === "book" && price > 0 ? 1 : 0, price, opts.proration);
    } else if (mode === "book" && price > 0) {
      note = "Ohne Stripe – bitte von Hand abrechnen.";
    }
    await prisma.customer.update({
      where: { id: customerId },
      data:
        mode === "book"
          ? { existingCustomersEnabled: true, bestandMonthly: price, bestandGrandfathered: false, bestandRequestedAt: null, bestandCancelAt: null }
          : mode === "free"
            ? { existingCustomersEnabled: true, bestandMonthly: null, bestandGrandfathered: true, bestandRequestedAt: null, bestandCancelAt: null }
            : { existingCustomersEnabled: false, bestandMonthly: null, bestandGrandfathered: false, bestandCancelAt: null },
    });
    await audit("billing.bestand", { entity: "Customer", entityId: customerId, customerId, details: { mode, price }, ...(opts.actor ? { actor: opts.actor } : {}) });
    return { ok: true, changed: true, ...(note ? { note } : {}) };
  } catch (err) {
    reportError(err, "billing-bestand", { customer: customerId });
    return { ok: false, error: "Das Modul konnte nicht umgestellt werden." };
  }
}

/** Ende des laufenden Abrechnungszeitraums einer Abo-Position (Stripe-API ab 2025: an der Position). */
function periodEndOf(sub: Stripe.Subscription, item?: Stripe.SubscriptionItem): Date | null {
  const raw =
    (item as unknown as { current_period_end?: number } | undefined)?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    (sub.items.data[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end;
  return typeof raw === "number" ? new Date(raw * 1000) : null;
}

/** Ende des laufenden Kalendermonats (Berlin) – Rückfall ohne Stripe-Zeitraum. */
export function endOfBerlinMonth(now = new Date()): Date {
  const [y, m] = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit" }).format(now).split("-").map(Number);
  // 1. des Folgemonats 00:00 Berlin (UTC+1/+2) minus 1 Sekunde, sicher innerhalb des Monats
  const nextFirstUtc = Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1);
  return new Date(nextFirstUtc - 2 * 60 * 60 * 1000 - 1000);
}

/**
 * Voraussetzung für Selbstbuchungen im Kundenbereich: laufendes Abo (nicht im Zahlungsverzug)
 * mit hinterlegter Zahlungsart. null = in Ordnung, sonst Grund für den Kunden.
 */
export async function selfServiceBillingBlocker(stripeCustomerId: string | null): Promise<string | null> {
  const stripe = stripeClient();
  if (!stripe || !stripeCustomerId) return "Für Ihr Konto ist keine Online-Abrechnung eingerichtet.";
  try {
    const sub = await activeSubscription(stripe, stripeCustomerId);
    if (!sub) return "Ihr Abo läuft noch nicht.";
    if (sub.status === "past_due") return "Es ist noch eine Rechnung offen.";
    if (!sub.default_payment_method) {
      const cust = await stripe.customers.retrieve(stripeCustomerId);
      const pm = "deleted" in cust && cust.deleted ? null : (cust as Stripe.Customer).invoice_settings?.default_payment_method;
      if (!pm) return "Für Ihr Konto ist keine Zahlungsart hinterlegt.";
    }
    return null;
  } catch (err) {
    reportError(err, "billing-selfservice-check", { customer: stripeCustomerId });
    return "Die Abrechnung ist gerade nicht erreichbar.";
  }
}

/**
 * Bestandskunden-Modul zum Ende des Abrechnungszeitraums kündigen (Selbstbedienung).
 * Die Abo-Position wird ohne Gutschrift entfernt – der laufende Zeitraum ist bezahlt, danach wird
 * nichts mehr berechnet. Der Zugang bleibt bis bestandCancelAt; der WhatsApp-Cron schaltet danach ab
 * (expireBestandCancellations). Ohne Stripe: zum Monatsende, Abrechnung von Hand.
 */
export async function scheduleBestandCancel(
  customerId: string,
  actor?: AuditActor,
): Promise<{ ok: true; until: Date; note?: string } | { ok: false; error: string }> {
  try {
    const c = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { stripeCustomerId: true, existingCustomersEnabled: true, bestandMonthly: true, bestandCancelAt: true },
    });
    if (!c) return { ok: false, error: "Kunde nicht gefunden." };
    if (!c.existingCustomersEnabled || c.bestandMonthly == null) return { ok: false, error: "Das Modul ist nicht gebucht." };
    if (c.bestandCancelAt) return { ok: true, until: c.bestandCancelAt };
    let until: Date | null = null;
    let note: string | undefined;
    const stripe = stripeClient();
    if (stripe && c.stripeCustomerId) {
      const ed = await editableSubscription(stripe, c.stripeCustomerId);
      if ("note" in ed) return { ok: false, error: ed.note };
      const product = await productId(stripe, "bestand");
      const item = ed.sub.items.data.find((i) => productOf(i) === product);
      until = periodEndOf(ed.sub, item);
      if (item) await stripe.subscriptionItems.del(item.id, { proration_behavior: "none" });
    } else {
      note = "Ohne Stripe – Abrechnung bitte von Hand beenden.";
    }
    if (!until) until = endOfBerlinMonth();
    await prisma.customer.update({ where: { id: customerId }, data: { bestandCancelAt: until } });
    await audit("billing.bestand", {
      entity: "Customer",
      entityId: customerId,
      customerId,
      details: { mode: "cancel_at_period_end", until: until.toISOString() },
      ...(actor ? { actor } : {}),
    });
    return { ok: true, until, ...(note ? { note } : {}) };
  } catch (err) {
    reportError(err, "billing-bestand-cancel", { customer: customerId });
    return { ok: false, error: "Die Kündigung konnte nicht gespeichert werden." };
  }
}

// ─── Modul „Empfehlungen & Bewertungen“ ───────────────────────────────────
// Testphase ohne Abo-Position; danach (bzw. bei Buchung ohne Testphase) kommt die
// Position „Empfehlungen & Bewertungen“ ins Abo, tagesgenau anteilig (AGB: Selbstbuchung).
// Kündigung zum Ende des Abrechnungszeitraums (in der Testphase: zum Ende der Testphase).

/**
 * Position ins Abo aufnehmen (idempotent: steht sie schon mit dem Preis drin, passiert nichts).
 * note = automatisch nicht möglich (ohne Stripe, Abo noch nicht gestartet, Startpreis-Phase) →
 * der Aufrufer legt eine Admin-Aufgabe „Preis anpassen“ an.
 */
export async function addEmpfehlungToSubscription(
  customerId: string,
  monthly: number,
  opts: { proration?: Proration } = {},
): Promise<AddOnResult> {
  try {
    const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { stripeCustomerId: true } });
    if (!c) return { ok: false, error: "Kunde nicht gefunden." };
    const stripe = stripeClient();
    if (!stripe || !c.stripeCustomerId) return { ok: true, changed: false, note: "Ohne Stripe – bitte von Hand abrechnen." };
    const ed = await editableSubscription(stripe, c.stripeCustomerId);
    if ("note" in ed) return { ok: true, changed: false, note: ed.note };
    await setItemQuantity(stripe, ed.sub, "empfehlung", monthly > 0 ? 1 : 0, monthly, opts.proration ?? "create_prorations");
    return { ok: true, changed: true };
  } catch (err) {
    reportError(err, "billing-empfehlung", { customer: customerId });
    return { ok: false, error: "Das Abo konnte nicht angepasst werden." };
  }
}

/**
 * Admin: Modul buchen (sofort berechnet), kostenlos freischalten oder sofort abbestellen.
 * Buchen nutzt den vereinbarten Preis, sonst die Preisliste.
 */
export async function setEmpfehlungModule(customerId: string, mode: "book" | "free" | "cancel", opts: { actor?: AuditActor } = {}): Promise<AddOnResult> {
  try {
    const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { empfehlungMonthly: true, empfehlungSince: true } });
    if (!c) return { ok: false, error: "Kunde nicht gefunden." };
    const agreed = c.empfehlungMonthly != null ? Number(c.empfehlungMonthly) : 0;
    const price = mode === "book" ? (agreed > 0 ? agreed : PRICE_LIST.empfehlungModuleMonthly) : 0;
    const r = await addEmpfehlungToSubscription(customerId, price);
    if (!r.ok) return r;
    const since = c.empfehlungSince ?? new Date();
    await prisma.customer.update({
      where: { id: customerId },
      data:
        mode === "book"
          ? { empfehlungEnabled: true, empfehlungMonthly: price, empfehlungFree: false, empfehlungCancelAt: null, empfehlungSince: since }
          : mode === "free"
            ? { empfehlungEnabled: true, empfehlungMonthly: null, empfehlungFree: true, empfehlungCancelAt: null, empfehlungSince: since }
            : { empfehlungEnabled: false, empfehlungMonthly: null, empfehlungFree: false, empfehlungCancelAt: null },
    });
    await audit("billing.empfehlung", { entity: "Customer", entityId: customerId, customerId, details: { mode, price }, ...(opts.actor ? { actor: opts.actor } : {}) });
    return { ok: true, changed: true, ...(r.note && mode === "book" ? { note: r.note } : {}) };
  } catch (err) {
    reportError(err, "billing-empfehlung-admin", { customer: customerId });
    return { ok: false, error: "Das Modul konnte nicht umgestellt werden." };
  }
}

/**
 * Kündigung zum Ende des Abrechnungszeitraums (Selbstbedienung). In der Testphase endet das Modul
 * mit der Testphase, ohne Berechnung. Sonst wird die Position ohne Gutschrift entfernt.
 */
export async function scheduleEmpfehlungCancel(
  customerId: string,
  now = new Date(),
): Promise<{ ok: true; until: Date; note?: string } | { ok: false; error: string }> {
  try {
    const c = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { stripeCustomerId: true, empfehlungEnabled: true, empfehlungMonthly: true, empfehlungTrialEndsAt: true, empfehlungCancelAt: true, empfehlungFree: true },
    });
    if (!c) return { ok: false, error: "Kunde nicht gefunden." };
    if (!c.empfehlungEnabled) return { ok: false, error: "Das Modul ist nicht gebucht." };
    if (c.empfehlungFree) return { ok: false, error: "Das Modul ist für Sie kostenlos freigeschaltet – bitte bei uns melden." };
    if (c.empfehlungCancelAt) return { ok: true, until: c.empfehlungCancelAt };
    let until: Date | null = null;
    let note: string | undefined;
    if (c.empfehlungMonthly == null && c.empfehlungTrialEndsAt && c.empfehlungTrialEndsAt > now) {
      until = c.empfehlungTrialEndsAt; // Testphase: keine Position im Abo
    } else {
      const stripe = stripeClient();
      if (stripe && c.stripeCustomerId) {
        const ed = await editableSubscription(stripe, c.stripeCustomerId);
        if ("note" in ed) {
          note = ed.note;
        } else {
          const product = await productId(stripe, "empfehlung");
          const item = ed.sub.items.data.find((i) => productOf(i) === product);
          until = periodEndOf(ed.sub, item);
          if (item) await stripe.subscriptionItems.del(item.id, { proration_behavior: "none" });
        }
      } else {
        note = "Ohne Stripe – Abrechnung bitte von Hand beenden.";
      }
    }
    if (!until) until = endOfBerlinMonth(now);
    await prisma.customer.update({ where: { id: customerId }, data: { empfehlungCancelAt: until } });
    await audit("billing.empfehlung", { entity: "Customer", entityId: customerId, customerId, details: { mode: "cancel_at_period_end", until: until.toISOString() } });
    return { ok: true, until, ...(note ? { note } : {}) };
  } catch (err) {
    reportError(err, "billing-empfehlung-cancel", { customer: customerId });
    return { ok: false, error: "Die Kündigung konnte nicht gespeichert werden." };
  }
}

/** Kündigung zurücknehmen: Zugang bleibt, Position kommt (ohne anteilige Berechnung) zurück ins Abo. */
export async function withdrawEmpfehlungCancel(customerId: string): Promise<AddOnResult> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { empfehlungCancelAt: true, empfehlungMonthly: true } });
  if (!c?.empfehlungCancelAt) return { ok: true, changed: false };
  if (c.empfehlungMonthly != null && Number(c.empfehlungMonthly) > 0) {
    const r = await addEmpfehlungToSubscription(customerId, Number(c.empfehlungMonthly), { proration: "none" });
    if (!r.ok) return r;
  }
  await prisma.customer.update({ where: { id: customerId }, data: { empfehlungCancelAt: null } });
  await audit("billing.empfehlung", { entity: "Customer", entityId: customerId, customerId, details: { mode: "cancel_withdrawn" } });
  return { ok: true, changed: true };
}

/** Zum Periodenende gekündigte Module abschalten (WhatsApp-Cron). */
export async function expireBestandCancellations(now = new Date()): Promise<number> {
  const due = await prisma.customer.findMany({ where: { bestandCancelAt: { lte: now } }, select: { id: true } });
  for (const c of due) {
    await prisma.customer.update({
      where: { id: c.id },
      data: { existingCustomersEnabled: false, bestandMonthly: null, bestandGrandfathered: false, bestandCancelAt: null },
    });
    await audit("billing.bestand", { entity: "Customer", entityId: c.id, customerId: c.id, details: { mode: "expired" }, actor: { role: "system" } });
  }
  return due.length;
}

/** Zahlweise umstellen (monatlich ↔ jährlich im Voraus). Alle Positionen werden neu bepreist. */
export async function changeBillingInterval(customerId: string, interval: "month" | "year"): Promise<AddOnResult> {
  try {
    const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { stripeCustomerId: true, billingInterval: true } });
    if (!c) return { ok: false, error: "Kunde nicht gefunden." };
    if (c.billingInterval === interval) return { ok: true, changed: false };
    let note: string | undefined;
    const stripe = stripeClient();
    if (stripe && c.stripeCustomerId) {
      const ed = await editableSubscription(stripe, c.stripeCustomerId);
      if ("note" in ed) return { ok: false, error: ed.note };
      const sub = ed.sub;
      const tax = await resolveTax(stripe);
      const from = intervalOf(sub) === "year" ? annualMultiplier() : 1;
      const to = interval === "year" ? annualMultiplier() : 1;
      await stripe.subscriptions.update(sub.id, {
        proration_behavior: "create_prorations",
        billing_cycle_anchor: { type: "now" },
        items: [
          ...sub.items.data.map((i) => ({ id: i.id, deleted: true as const })),
          ...sub.items.data.map((i) => ({
            quantity: i.quantity ?? 1,
            price_data: {
              currency: "eur",
              product: productOf(i),
              unit_amount: Math.round(((i.price.unit_amount ?? 0) / from) * to),
              recurring: { interval },
              tax_behavior: "exclusive" as const,
            },
            ...(tax.automatic ? {} : { tax_rates: [tax.rateId!] }),
          })),
        ],
      });
    } else {
      note = "Ohne Stripe – bitte von Hand abrechnen.";
    }
    await prisma.customer.update({ where: { id: customerId }, data: { billingInterval: interval } });
    await audit("billing.interval", { entity: "Customer", entityId: customerId, customerId, details: { from: c.billingInterval, to: interval } });
    return { ok: true, changed: true, ...(note ? { note } : {}) };
  } catch (err) {
    reportError(err, "billing-interval", { customer: customerId });
    return { ok: false, error: "Die Zahlweise konnte nicht umgestellt werden." };
  }
}

/**
 * Monatspreis Betreuung + Software im Abo ändern (Budget ändern → neue Preisstufe).
 * Der Software-Anteil bleibt, die Betreuungs-Position bekommt den Rest. Ohne anteilige
 * Verrechnung (proration "none"): der neue Preis gilt ab dem nächsten Abrechnungsmonat.
 * Idempotent: steht der Preis schon so im Abo, passiert nichts. Ohne Stripe-Abo → note
 * (der Aufrufer legt dann eine Admin-Aufgabe an).
 */
export async function changeMonthlyFee(
  customerId: string,
  monthlyTotal: number,
  opts: { idempotencyKey?: string; actor?: AuditActor } = {},
): Promise<AddOnResult & { from?: Date | null }> {
  try {
    const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { stripeCustomerId: true } });
    if (!c) return { ok: false, error: "Kunde nicht gefunden." };
    const stripe = stripeClient();
    if (!stripe || !c.stripeCustomerId) return { ok: true, changed: false, note: "Ohne Stripe-Abo – Preis bitte von Hand anpassen." };
    const ed = await editableSubscription(stripe, c.stripeCustomerId);
    if ("note" in ed) return { ok: true, changed: false, note: ed.note };
    const sub = ed.sub;
    const [software, service, tax] = await Promise.all([productId(stripe, "software"), productId(stripe, "service"), resolveTax(stripe)]);
    const interval = intervalOf(sub);
    const factor = interval === "year" ? annualMultiplier() : 1;
    const swItem = sub.items.data.find((i) => productOf(i) === software);
    const svItem = sub.items.data.find((i) => productOf(i) === service);
    const swMonthly = swItem ? (swItem.price.unit_amount ?? 0) / 100 / factor : 0;
    const unit = cents(Math.max(0, monthlyTotal - swMonthly) * factor);
    const from = periodEndOf(sub, svItem ?? swItem);
    if (svItem && svItem.price.unit_amount === unit) return { ok: true, changed: false, from };
    const key = opts.idempotencyKey ? { idempotencyKey: `${opts.idempotencyKey}-${unit}` } : undefined;
    if (svItem && unit === 0) {
      await stripe.subscriptionItems.del(svItem.id, { proration_behavior: "none" }, key);
    } else if (svItem) {
      await stripe.subscriptionItems.update(
        svItem.id,
        { proration_behavior: "none", price_data: { currency: "eur", product: service, unit_amount: unit, recurring: { interval }, tax_behavior: "exclusive" } },
        key,
      );
    } else if (unit > 0) {
      await stripe.subscriptionItems.create(
        {
          subscription: sub.id,
          quantity: 1,
          proration_behavior: "none",
          price_data: { currency: "eur", product: service, unit_amount: unit, recurring: { interval }, tax_behavior: "exclusive" },
          ...(tax.automatic ? {} : { tax_rates: [tax.rateId!] }),
        },
        key,
      );
    }
    await audit("billing.retainer", {
      entity: "Customer",
      entityId: customerId,
      customerId,
      details: { source: "budget", monthlyTotal, serviceCents: { from: svItem?.price.unit_amount ?? null, to: unit }, from: from?.toISOString() ?? null },
      ...(opts.actor ? { actor: opts.actor } : {}),
    });
    return { ok: true, changed: true, from };
  } catch (err) {
    reportError(err, "billing-budget-fee", { customer: customerId });
    return { ok: false, error: "Der Monatspreis konnte im Abo nicht angepasst werden." };
  }
}

/** Täglicher Abgleich: Logins aller Kunden mit Platz-Abrechnung (holt verschobene Änderungen nach). */
export async function reconcileSeatBilling(): Promise<{ changed: number; errors: number }> {
  const customers = await prisma.customer.findMany({ where: { seatsIncluded: { not: null }, archived: false }, select: { id: true } });
  let changed = 0;
  let errors = 0;
  for (const c of customers) {
    const r = await syncSeatBilling(c.id);
    if (!r.ok) errors++;
    else if (r.changed) changed++;
  }
  return { changed, errors };
}
