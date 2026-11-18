// Abrechnung über Stripe Billing.
//
// Ablauf: Kunde nimmt das Angebot online an → Stripe Checkout zahlt das
// Setup (einmalig, mit Rechnung) und speichert dabei die Zahlungsart (z. B.
// SEPA-Mandat). Nach erfolgreichem Checkout legt der Webhook einen
// Abo-Zeitplan an, der erst am vereinbarten Startdatum beginnt – mit
// Startpreis-Phase (falls vereinbart) und danach dem normalen Monatspreis.
// (Checkout selbst kann Setup sofort + Monatsgebühr später nicht abbilden.)
// Zahlungsarten (Ole, 14.11.2026): Lastschrift zuerst und vorausgewählt, danach Karte mit
// Apple Pay und Google Pay, sonst nichts. Der Kunde wählt vor Stripe (siehe lib/zahlart.ts),
// Checkout bekommt allowed_payment_method_types als Filter auf die Dashboard-Einstellungen.
// Steuer: Stripe Tax, wenn eine aktive Registrierung existiert; sonst fester
// Steuersatz „USt. 19 %“, damit nie ohne Umsatzsteuer abgerechnet wird.

import crypto from "node:crypto";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/email";
import { reportError } from "@/lib/monitoring";
import { offerProducts } from "@/components/offer-document";
import {
  abschlussBonusJetzt,
  berlinTodayIso,
  isPrepaid,
  offerSetupDiscount,
  PRICE_LIST,
  rhythmusAusStripe,
  rhythmusFaktor,
  rhythmusFuer,
  stripeRecurring,
  type Zahlrhythmus,
} from "@/lib/offer-pricing";
import { abrechnungsplan, anteilVerteilen } from "@/lib/abrechnungstag";

const round2Billing = (n: number) => Math.round(n * 100) / 100;
import { audit, type AuditActor } from "@/lib/audit";
import { seatsToBill } from "@/lib/seats";
import { MANUAL_SEAT_TASK, manualSeatTask, seatUsage } from "@/lib/seats-server";
import { accountTaxIdParams, customerInvoiceSettingsCreate, customerInvoiceSettingsUpdate, invoiceFooterParams, loadInvoiceDefaults } from "@/lib/invoice-footer";
import { allowedPaymentMethodTypes, type Zahlart } from "@/lib/zahlart";

let client: Stripe | null = null;

/** Stripe-Client – null, wenn STRIPE_SECRET_KEY nicht gesetzt ist. */
export function stripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!client) client = new Stripe(key, { appInfo: { name: "performancegrowth-kpidashboard" } });
  return client;
}

export const billingEnabled = () => !!process.env.STRIPE_SECRET_KEY?.trim();

type ProductKey = "software" | "service" | "setup" | "setup_service" | "whatsapp" | "leads" | "seat" | "bestand" | "bestand_paket" | "empfehlung";
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
    name: "Weiterer aktiver Verkäufer",
    description: "Weiterer Verkäufer, der Leads bekommt, über die inklusiven aktiven Verkäufer hinaus (tagesgenau).",
  },
  bestand: {
    name: "Bestandskunden-Modul",
    description: "Bestandskunden importieren und per WhatsApp ansprechen, inklusive WhatsApp-Gebühren bis zum Monatskontingent.",
  },
  bestand_paket: {
    name: "Zusatzpaket Kampagnen-Nachrichten",
    description: "Zusätzliche Kampagnen-Nachrichten im Bestandskunden-Modul, einmalig, gültig 3 Monate, inklusive WhatsApp-Gebühren.",
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

/** Stripe-Mindestbetrag je Zahlung in EUR (darunter lehnt Stripe ab; 0 € ist eine Bestellung ohne Zahlungsart). */
export const STRIPE_MIN_EUR = 0.5;

async function ensureCustomer(stripe: Stripe, offer: OfferRow): Promise<string> {
  if (offer.stripeCustomerId) return offer.stripeCustomerId;
  const customer = await stripe.customers.create(
    {
      name: offer.company || offer.contactName,
      email: offer.email ?? undefined,
      preferred_locales: ["de"],
      // Pflichtangaben (Footer) als Standard für alle Rechnungen dieses Kunden
      invoice_settings: customerInvoiceSettingsCreate(await loadInvoiceDefaults()),
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
 * Checkout mit der gewählten Zahlart (allowed_payment_method_types). Ist die Lastschrift im
 * Konto nicht freigeschaltet, lehnt Stripe ab; dann mit Lastschrift und Karte, damit der Kunde
 * trotzdem bezahlen kann.
 */
async function createCheckoutSession(stripe: Stripe, params: Stripe.Checkout.SessionCreateParams, zahlart?: Zahlart | null) {
  try {
    return await stripe.checkout.sessions.create({ ...params, allowed_payment_method_types: allowedPaymentMethodTypes(zahlart) });
  } catch (err) {
    if (zahlart !== "sepa" || (err as { type?: string })?.type !== "StripeInvalidRequestError") throw err;
    reportError(err, "billing-checkout-sepa");
    return stripe.checkout.sessions.create({ ...params, allowed_payment_method_types: allowedPaymentMethodTypes(null) });
  }
}

/** Offene Bezahlseiten mit weniger Restlaufzeit werden nicht mehr wiederverwendet. */
const CHECKOUT_REUSE_MIN_MS = 15 * 60 * 1000;

/**
 * Doppelzahlung verhindern (Go-live 15.11.2026): Die zuletzt erzeugte Bezahlseite des Angebots
 * wiederverwenden, wenn sie noch offen ist, nicht bald abläuft und dieselben Positionen und
 * dieselbe Zahlart hat (pg_checkout in den Metadaten). Sonst schließen (expire), bevor eine
 * neue entsteht. „paid“: die alte Seite ist schon bezahlt (Webhook noch nicht da).
 */
async function reuseOrExpireCheckout(
  stripe: Stripe,
  sessionId: string,
  fingerprint: string,
  oldFailed = false,
): Promise<{ url: string } | "paid" | null> {
  let old: Stripe.Checkout.Session;
  try {
    old = await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    // Unbekannte Session (z. B. anderes Stripe-Konto): neu anlegen. Sonst lieber abbrechen als doppelt.
    if ((err as { code?: string })?.code === "resource_missing") return null;
    throw err;
  }
  // Abgeschlossene Seite, deren Lastschrift geplatzt ist (paymentStatus „failed“): neue Seite erlauben
  if (old.status === "complete") return oldFailed ? null : "paid";
  if (old.status !== "open") return null;
  const fresh = (old.expires_at ?? 0) * 1000 - Date.now() > CHECKOUT_REUSE_MIN_MS;
  if (fresh && old.url && old.metadata?.pg_checkout === fingerprint) return { url: old.url };
  try {
    await stripe.checkout.sessions.expire(sessionId);
  } catch (err) {
    const again = await stripe.checkout.sessions.retrieve(sessionId);
    if (again.status === "complete") return "paid";
    if (again.status === "open") throw err;
  }
  return null;
}

/**
 * Erstellt (oder erneuert) die Stripe-Bezahlseite für ein angenommenes
 * Angebot und gibt die URL zurück. Bezahlt wird nur das Setup; die
 * Zahlungsart wird für die Monatsgebühren gespeichert.
 */
export async function createCheckoutForOffer(offerId: string, zahlart?: Zahlart | null): Promise<{ url: string } | { error: string }> {
  const stripe = stripeClient();
  if (!stripe) return { error: "Zahlung ist noch nicht eingerichtet." };
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer) return { error: "Angebot nicht gefunden." };
  if (offer.status !== "accepted") return { error: "Das Angebot ist noch nicht angenommen." };
  if (offer.isTest) return { error: "Testangebote laufen ohne Zahlung." };
  if (offer.paymentStatus === "paid" || offer.paymentStatus === "processing") {
    return { error: "Die Zahlung ist bereits eingerichtet." };
  }

  try {
    const [setup, tax, invoiceDefaults, taxIds] = await Promise.all([
      productId(stripe, offer.package === "service" ? "setup_service" : "setup"),
      resolveTax(stripe),
      loadInvoiceDefaults(),
      accountTaxIdParams(stripe),
    ]);
    const customerId = await ensureCustomer(stripe, offer);
    const products = offerProducts(offer.products).map((p) => p.name).join(", ");
    const meta = offerMeta(offer);
    const setupFee = Number(offer.setupFee);
    // Empfehlungsrabatt: Listenpreis als Posten, Rabatt als einmaliger Gutschein auf den
    // Setup-Posten. So steht auf der Rechnung „Empfehlungsrabatt“, der Betrag = setupFee.
    const discount = setupFee > 0 ? offerSetupDiscount(offer) : null;
    // Abschlussbonus (Ole, 16.11.2026): nur, solange die Frist läuft (die Bezahlseite läuft zur Frist ab); bei
    // „später zahlen“ und Annahme bis zur Frist gesichert, dann ohne Frist
    const bonus = setupFee > 0 ? abschlussBonusJetzt(offer) : null;
    const nachlass = round2Billing((discount?.discount ?? 0) + (bonus?.betrag ?? 0));
    const listPreis = discount ? discount.list : setupFee;
    // Kleines Setup (z. B. 1 €) mit Abschlussbonus: Bleibt nach Rabatt und Bonus weniger als der Stripe-Mindestbetrag,
    // wäre die Bezahlseite gratis (Checkout fragt dann keine Zahlungsart ab, die Monatsgebühr ließe sich nicht
    // einziehen) bzw. unter 0,50 € (Stripe lehnt ab). Dann nur die Zahlungsart hinterlegen (Modus „setup“).
    const zuZahlen = round2Billing(setupFee - (bonus?.betrag ?? 0));
    const mitZahlung = setupFee > 0 && zuZahlen >= STRIPE_MIN_EUR;
    // Positionen und Zahlart dieser Bezahlseite: gleich → offene Seite wiederverwenden
    const fingerprint = crypto
      .createHash("sha256")
      .update(JSON.stringify([mitZahlung ? "payment" : "setup", offer.package, cents(setupFee), discount ? [cents(discount.list), cents(discount.discount)] : null, bonus ? [cents(bonus.betrag), bonus.bis.getTime()] : null, zahlart ?? null, customerId, tax.automatic ? "auto" : tax.rateId]))
      .digest("hex")
      .slice(0, 24);
    if (offer.stripeCheckoutSessionId) {
      const reuse = await reuseOrExpireCheckout(stripe, offer.stripeCheckoutSessionId, fingerprint, offer.paymentStatus === "failed");
      if (reuse === "paid") return { error: "Die Zahlung ist bereits eingerichtet." };
      if (reuse) {
        if (offer.paymentStatus !== "pending") await prisma.offer.update({ where: { id: offer.id }, data: { paymentStatus: "pending" } });
        return reuse;
      }
    }
    // Stripe erlaubt einen Gutschein je Bezahlseite: Empfehlungsrabatt und Abschlussbonus zusammen
    const couponName = discount && bonus ? "Empfehlungsrabatt und Abschlussbonus" : bonus ? "Abschlussbonus" : "Empfehlungsrabatt";
    const coupon =
      mitZahlung && nachlass > 0.005
        ? await stripe.coupons.create(
            {
              amount_off: cents(nachlass),
              currency: "eur",
              duration: "once",
              max_redemptions: 1,
              name: couponName,
              applies_to: { products: [setup] },
              // Gesicherter Bonus (später zahlen, rechtzeitig angenommen): Gutschein ohne Frist
              ...(bonus && !bonus.gesichert ? { redeem_by: Math.floor(bonus.bis.getTime() / 1000) + 3600 } : {}),
              metadata: { ...meta, pg_kind: bonus ? (discount ? "empfehlungsrabatt+abschlussbonus" : "abschlussbonus") : "empfehlungsrabatt", referral_id: offer.referralId ?? "" },
            },
            { idempotencyKey: `offer-coupon-${offer.id}-${cents(discount?.discount ?? 0)}-${cents(discount?.list ?? 0)}-${cents(bonus?.betrag ?? 0)}-${bonus?.bis.getTime() ?? 0}` },
          )
        : null;
    // Bezahlseite mit Bonus läuft zur Frist ab (Stripe: frühestens 30 Minuten, spätestens 24 Stunden)
    const jetztSek = Math.floor(Date.now() / 1000);
    const ablauf = bonus && !bonus.gesichert ? Math.min(jetztSek + 24 * 3600 - 60, Math.max(jetztSek + 31 * 60, Math.floor(bonus.bis.getTime() / 1000))) : null;
    const base = getAppUrl();
    const common = {
      customer: customerId,
      customer_update: { address: "auto" as const, name: "auto" as const },
      billing_address_collection: "required" as const,
      locale: "de" as const,
      client_reference_id: offer.id,
      integration_identifier: "pg-angebot-qkzvmtrb",
      // Ohne Zahlung (Bonus deckt das Setup bis auf einen Rest unter dem Mindestbetrag): das ganze Setup gilt als Bonus
      metadata: { ...meta, pg_checkout: fingerprint, ...(bonus ? { pg_bonus: String(cents(mitZahlung ? bonus.betrag : setupFee)) } : {}) },
      ...(ablauf ? { expires_at: ablauf } : {}),
      success_url: `${base}/angebot/${offer.token}?zahlung=ok`,
      cancel_url: `${base}/angebot/${offer.token}?zahlung=abgebrochen`,
    };

    const session = await createCheckoutSession(
      stripe,
      mitZahlung
        ? {
            ...common,
            mode: "payment",
            // USt-IdNr. nur bei Zahlung (Stripe sammelt sie im Modus „setup“ nicht)
            tax_id_collection: { enabled: true },
            ...(tax.automatic ? { automatic_tax: { enabled: true } } : {}),
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: "eur",
                  product: setup,
                  unit_amount: cents(listPreis),
                  tax_behavior: "exclusive",
                },
                ...(tax.automatic ? {} : { tax_rates: [tax.rateId!] }),
              },
            ],
            ...(coupon ? { discounts: [{ coupon: coupon.id }] } : {}),
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
                ...invoiceFooterParams(invoiceDefaults),
                ...taxIds,
              },
            },
          }
        : {
            ...common,
            mode: "setup",
            currency: "eur",
            setup_intent_data: { metadata: meta, description: `Zahlungsart für Angebot ${offer.number}` },
          },
      zahlart,
    );

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
export async function createScheduleForOffer(
  offerId: string,
  session: Stripe.Checkout.Session | null,
  opts: { ueberweisung?: { days: number } } = {},
): Promise<void> {
  const stripe = stripeClient();
  if (!stripe) return;
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer || offer.stripeScheduleId || offer.stripeSubscriptionId) return;
  const customerId = offer.stripeCustomerId ?? (typeof session?.customer === "string" ? session.customer : session?.customer?.id);
  if (!customerId) throw new Error(`Angebot ${offer.number}: kein Stripe-Kunde`);
  // Überweisung (lib/ueberweisung.ts): Rechnungen mit Zahlungsziel statt Einzug, ohne gespeicherte Zahlungsart
  const ueberweisung = opts.ueberweisung ?? null;

  const [software, service, seat, bestand, empfehlung, tax, pm, taxIds] = await Promise.all([
    productId(stripe, "software"),
    productId(stripe, "service"),
    productId(stripe, "seat"),
    productId(stripe, "bestand"),
    productId(stripe, "empfehlung"),
    resolveTax(stripe),
    session && !ueberweisung ? paymentMethodOf(stripe, session) : Promise.resolve(null),
    accountTaxIdParams(stripe),
  ]);
  if (pm) {
    // Pflichtangaben mitsetzen (Kunden aus der Zeit vor dem Footer)
    const d = await loadInvoiceDefaults();
    await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm, ...customerInvoiceSettingsUpdate(d) } });
  }

  const monthly = Number(offer.monthlyFee);
  const softwareFee = Math.min(Number(offer.softwareFee), monthly);
  const taxRates = tax.automatic ? undefined : [tax.rateId!];
  // Vorauszahlung (lib/offer-pricing.ts VORAUSZAHLUNG): jährlich = Intervall Jahr, Betrag × (12 − Freimonate);
  // 6 Monate (Laufzeit 6m) = Intervall Monat × 6, Betrag × (6 − Freimonate). Sonst monatlich.
  const annual = offer.annualPrepay;
  const rhythmus = rhythmusFuer(offer.term, annual);
  const factor = rhythmusFaktor(rhythmus, offer.annualFreeMonths);
  const item = (product: string, amount: number, quantity = 1): Stripe.SubscriptionScheduleCreateParams.Phase.Item => ({
    quantity,
    price_data: { currency: "eur", product, unit_amount: cents(amount * factor), recurring: stripeRecurring(rhythmus), tax_behavior: "exclusive" },
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

  // Abrechnungstag (lib/abrechnungstag.ts): Weicht er vom Start ab, beginnt das Abo erst am ersten Abrechnungstag
  // (Stripe-Abrechnungszyklus ab dann jeweils an diesem Tag). Die Zeit davor ist entweder kostenlos (dann gibt es
  // vorher schlicht kein Abo: keine Testphase, keine 0-€-Rechnung) oder kommt anteilig als eigene Positionen mit
  // Zeitraum auf die erste Rechnung. Liegt der Start schon zurück, zählt ab heute (nichts rückwirkend).
  // Vorauszahlung (Ole, 18.11.2026): Abrechnungstag gilt nicht, das Abo beginnt am Start mit dem vollen Betrag
  // (kein anteiliger Betrag, kein kostenloser Start); abrechnungsplan liefert dann differs = false.
  const todayIso = berlinTodayIso();
  const startIso = offer.startDate ? offer.startDate.toISOString().slice(0, 10) : null;
  const plan = abrechnungsplan({
    startIso: startIso && startIso < todayIso ? todayIso : startIso,
    billingDay: offer.billingDay,
    freeStart: offer.billingFreeStart,
    annual: rhythmus !== "month",
  });
  const noon = (iso: string) => Math.floor(new Date(`${iso}T12:00:00Z`).getTime() / 1000);
  if (plan?.differs && !plan.free) {
    const first = phases[0].items;
    const lineCents = first.map((it) => (it.price_data?.unit_amount ?? 0) * (it.quantity ?? 1));
    const anteil = anteilVerteilen(lineCents, plan);
    phases[0].add_invoice_items = first
      .map((it, i): Stripe.SubscriptionScheduleCreateParams.Phase.AddInvoiceItem | null =>
        anteil[i] > 0
          ? {
              quantity: 1,
              price_data: { currency: "eur", product: it.price_data!.product, unit_amount: anteil[i], tax_behavior: "exclusive" },
              ...(taxRates ? { tax_rates: taxRates } : {}),
              // Zeitraum steht auf der Rechnung (z. B. 01.01. bis 14.01.)
              period: { start: { type: "timestamp", timestamp: noon(plan.startIso) }, end: { type: "timestamp", timestamp: noon(plan.stubEndIso!) } },
              metadata: { ...meta, pg_kind: "anteil_bis_abrechnungstag" },
            }
          : null,
      )
      .filter((x): x is Stripe.SubscriptionScheduleCreateParams.Phase.AddInvoiceItem => x != null);
    if (!phases[0].add_invoice_items.length) delete phases[0].add_invoice_items;
  }

  const startAt = plan?.differs ? noon(plan.firstIso) : offer.startDate ? Math.floor(offer.startDate.getTime() / 1000) : 0;
  const products = offerProducts(offer.products).map((p) => p.name).join(", ");
  const schedule = await stripe.subscriptionSchedules.create(
    {
      customer: customerId,
      start_date: startAt > Date.now() / 1000 + 60 ? startAt : "now",
      end_behavior: "release",
      billing_mode: { type: "flexible" },
      // pg_interval: Zahlweise laut Angebot (bei „Vorauszahlung anbieten“ die Wahl des Kunden): year bzw. halfyear
      metadata: {
        ...meta,
        ...(rhythmus !== "month" ? { pg_interval: rhythmus } : {}),
        ...(plan?.differs ? { pg_billing_day: String(plan.day), pg_first_billing: plan.firstIso, pg_free_start: plan.free ? "1" : "0" } : {}),
      },
      default_settings: {
        ...(ueberweisung
          ? {
              collection_method: "send_invoice" as const,
              invoice_settings: { days_until_due: ueberweisung.days, ...(taxIds.account_tax_ids ? { account_tax_ids: taxIds.account_tax_ids } : {}) },
            }
          : {
              collection_method: "charge_automatically" as const,
              ...(pm ? { default_payment_method: pm } : {}),
              // Steuer-ID auf Abo-Rechnungen (nur ohne Standard-Steuer-ID im Stripe-Konto)
              ...(taxIds.account_tax_ids ? { invoice_settings: { account_tax_ids: taxIds.account_tax_ids } } : {}),
            }),
        ...(tax.automatic ? { automatic_tax: { enabled: true } } : {}),
        description: `${packageName(offer)} (${products}), Angebot ${offer.number}`,
      },
      phases,
    },
    // Je Bezahlseite: nach geplatzter Lastschrift und neuer Zahlung entsteht ein neuer Zeitplan
    { idempotencyKey: `offer-schedule-${offer.id}-${session?.id ?? "ueberweisung"}` },
  );
  const subId = schedule.subscription ? (typeof schedule.subscription === "string" ? schedule.subscription : schedule.subscription.id) : null;
  await prisma.offer.update({
    where: { id: offer.id },
    data: {
      stripeScheduleId: schedule.id,
      ...(subId ? { stripeSubscriptionId: subId } : {}),
    },
  });
  // Abo startet sofort: Banküberweisung als Zahlungsart der Abo-Rechnungen (sonst im Webhook beim Start)
  if (ueberweisung && subId) await setBankTransferOnSubscription(subId);
}

/** Zahlungsart der Rechnungen per Überweisung: Stripe-Banküberweisung (virtuelle IBAN je Kunde, EUR, DE). */
export const BANK_TRANSFER_PAYMENT_SETTINGS = {
  payment_method_types: ["customer_balance"],
  payment_method_options: {
    customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "eu_bank_transfer", eu_bank_transfer: { country: "DE" } } },
  },
} satisfies Stripe.InvoiceCreateParams.PaymentSettings;

/** Abo auf Überweisung stellen (Rechnung mit Zahlungsziel, Banküberweisung). Idempotent. */
export async function setBankTransferOnSubscription(subscriptionId: string, days?: number): Promise<void> {
  const stripe = stripeClient();
  if (!stripe) return;
  await stripe.subscriptions.update(subscriptionId, {
    ...(days ? { collection_method: "send_invoice", days_until_due: days } : {}),
    payment_settings: BANK_TRANSFER_PAYMENT_SETTINGS as Stripe.SubscriptionUpdateParams.PaymentSettings,
  });
}

/** Stripe-Kunden zum Angebot anlegen bzw. lesen (für Überweisung ohne Bezahlseite). */
export async function ensureStripeCustomerForOffer(offerId: string): Promise<string> {
  const stripe = stripeClient();
  if (!stripe) throw new Error("Stripe ist nicht eingerichtet.");
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer) throw new Error("Angebot nicht gefunden.");
  return ensureCustomer(stripe, offer);
}

/** Virtuelle IBAN des Kunden für Banküberweisungen (Stripe legt sie beim ersten Abruf an). */
export async function bankTransferIban(stripeCustomerId: string): Promise<string | null> {
  const stripe = stripeClient();
  if (!stripe) return null;
  const fi = await stripe.customers.createFundingInstructions(stripeCustomerId, {
    currency: "eur",
    funding_type: "bank_transfer",
    bank_transfer: { type: "eu_bank_transfer", eu_bank_transfer: { country: "DE" } },
  });
  const iban = fi.bank_transfer.financial_addresses.find((a) => a.type === "iban")?.iban?.iban ?? null;
  return iban;
}

/**
 * Setup-Rechnung per Überweisung (Rechnung mit Zahlungsziel, Banküberweisung): Listenpreis als Posten,
 * Empfehlungsrabatt und Abschlussbonus als einmaliger Gutschein, wie auf der Bezahlseite. Wird finalisiert und
 * von Stripe per E-Mail verschickt. Gibt null zurück, wenn nach Rabatt und Bonus nichts zu zahlen ist.
 */
export async function createSetupInvoiceForOffer(
  offerId: string,
  days: number,
): Promise<{ invoiceId: string; bonusCents: number } | null> {
  const stripe = stripeClient();
  if (!stripe) throw new Error("Stripe ist nicht eingerichtet.");
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer) throw new Error("Angebot nicht gefunden.");
  const setupFee = Number(offer.setupFee);
  const discount = setupFee > 0 ? offerSetupDiscount(offer) : null;
  const bonus = setupFee > 0 ? abschlussBonusJetzt(offer) : null;
  const zuZahlen = round2Billing(setupFee - (bonus?.betrag ?? 0));
  if (!(setupFee > 0) || zuZahlen < STRIPE_MIN_EUR) return null;
  const [setup, tax, invoiceDefaults, taxIds] = await Promise.all([
    productId(stripe, offer.package === "service" ? "setup_service" : "setup"),
    resolveTax(stripe),
    loadInvoiceDefaults(),
    accountTaxIdParams(stripe),
  ]);
  const customerId = await ensureCustomer(stripe, offer);
  const meta = { ...offerMeta(offer), pg_kind: "offer_setup" };
  const products = offerProducts(offer.products).map((p) => p.name).join(", ");
  const description = `Setup ${packageName(offer)} (${products}), Angebot ${offer.number}`;
  const nachlass = round2Billing((discount?.discount ?? 0) + (bonus?.betrag ?? 0));
  const listPreis = discount ? discount.list : setupFee;
  const coupon =
    nachlass > 0.005
      ? await stripe.coupons.create(
          {
            amount_off: cents(nachlass),
            currency: "eur",
            duration: "once",
            max_redemptions: 1,
            name: discount && bonus ? "Empfehlungsrabatt und Abschlussbonus" : bonus ? "Abschlussbonus" : "Empfehlungsrabatt",
            applies_to: { products: [setup] },
            metadata: { ...meta, referral_id: offer.referralId ?? "" },
          },
          { idempotencyKey: `offer-coupon-ueberweisung-${offer.id}-${cents(nachlass)}` },
        )
      : null;
  const invoice = await stripe.invoices.create(
    {
      customer: customerId,
      collection_method: "send_invoice",
      days_until_due: days,
      auto_advance: true,
      pending_invoice_items_behavior: "exclude",
      description,
      metadata: meta,
      payment_settings: BANK_TRANSFER_PAYMENT_SETTINGS,
      ...(tax.automatic ? { automatic_tax: { enabled: true } } : {}),
      ...(coupon ? { discounts: [{ coupon: coupon.id }] } : {}),
      ...invoiceFooterParams(invoiceDefaults),
      ...taxIds,
    },
    { idempotencyKey: `offer-setup-invoice-${offer.id}` },
  );
  await stripe.invoiceItems.create(
    {
      customer: customerId,
      invoice: invoice.id!,
      description,
      price_data: { currency: "eur", product: setup, unit_amount: cents(listPreis), tax_behavior: "exclusive" },
      ...(tax.automatic ? {} : { tax_rates: [tax.rateId!] }),
      metadata: meta,
    },
    { idempotencyKey: `offer-setup-invoice-item-${offer.id}` },
  );
  const final = await stripe.invoices.finalizeInvoice(invoice.id!, {}, { idempotencyKey: `offer-setup-invoice-final-${offer.id}` });
  await stripe.invoices.sendInvoice(final.id!, {}, { idempotencyKey: `offer-setup-invoice-send-${offer.id}` });
  return { invoiceId: final.id!, bonusCents: bonus ? cents(bonus.betrag) : 0 };
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
  // Zeitplan ist weg: Verweise lösen, damit eine neue Zahlung (neue Bezahlseite) wieder einen Zeitplan anlegt
  await prisma.offer.update({ where: { id: offerId }, data: { stripeScheduleId: null, stripeSubscriptionId: null } });
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
  // Vorauszahlung (jährlich oder 6 Monate): Pause ohne Gutschrift (AGB), Abo bleibt unverändert.
  if (isPrepaid(intervalOf(sub))) {
    return { method: "none", reason: "Vorauszahlung: Pause ohne Gutschrift" };
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
 * Halteangebot „Pause ohne Kosten“ (lib/halteangebote-server.ts): die ganze Abrechnung ruht (pause_collection „void“:
 * Rechnungen in der Pause werden nicht eingezogen), Fortsetzen über resumeBilling. Jahreszahlung: ohne Gutschrift (AGB).
 */
export async function pauseBillingFully(stripeCustomerId: string): Promise<BillingPauseState> {
  const stripe = stripeClient();
  if (!stripe) return { method: "none", reason: "Stripe nicht eingerichtet" };
  const sub = await activeSubscription(stripe, stripeCustomerId);
  if (!sub) return { method: "none", reason: "Kein laufendes Abo (startet ggf. erst noch)" };
  if (isPrepaid(intervalOf(sub))) {
    return { method: "none", reason: "Vorauszahlung: Pause ohne Gutschrift" };
  }
  await stripe.subscriptions.update(sub.id, { pause_collection: { behavior: "void" } });
  return { method: "pause_collection", subscriptionId: sub.id };
}

export type RetentionCouponResult = { ok: true; couponId: string; subscriptionId: string } | { ok: false; note: string };

/**
 * Halteangebot (lib/halteangebote-server.ts): Nachlass als Stripe-Gutschein am laufenden Abo, Dauer „repeating“ für
 * `months` Monatsrechnungen. `serviceOnly`: nur auf die Betreuungs-Position (applies_to), z. B. 1 Monat Betreuung
 * kostenlos. Der Gutschein wird zur Laufzeit angelegt bzw. wiederverwendet (feste ID je Prozent/Monate/Umfang),
 * vorhandene Rabatte am Abo bleiben. Geht es nicht automatisch (kein Abo, Startpreis-Phase, Jahreszahlung, keine
 * Betreuungs-Position), kommt ok: false mit Grund; der Aufrufer legt dann eine Aufgabe an.
 */
export async function applyRetentionCoupon(
  stripeCustomerId: string,
  opts: { percentOff: number; months: number; serviceOnly?: boolean; idempotencyKey: string },
): Promise<RetentionCouponResult> {
  const stripe = stripeClient();
  if (!stripe) return { ok: false, note: "Stripe ist nicht eingerichtet." };
  const ed = await editableSubscription(stripe, stripeCustomerId);
  if ("note" in ed) return { ok: false, note: ed.note };
  const sub = ed.sub;
  if (isPrepaid(intervalOf(sub))) return { ok: false, note: "Vorauszahlung: Nachlass bitte von Hand verrechnen." };
  const service = opts.serviceOnly ? await productId(stripe, "service") : null;
  if (service && !sub.items.data.some((i) => productOf(i) === service && (i.quantity ?? 1) > 0)) {
    return { ok: false, note: "Keine Betreuungs-Position im Abo." };
  }
  const id = `pg-halten-${service ? "betreuung" : "abo"}-${opts.percentOff}-${opts.months}m`;
  let couponId: string;
  try {
    couponId = (await stripe.coupons.retrieve(id)).id;
  } catch (err) {
    if ((err as { code?: string })?.code !== "resource_missing") throw err;
    couponId = (
      await stripe.coupons.create(
        {
          id,
          name: service ? `Halteangebot: Betreuung ${opts.percentOff} %` : `Halteangebot: ${opts.percentOff} % Nachlass`,
          percent_off: opts.percentOff,
          duration: "repeating",
          duration_in_months: opts.months,
          ...(service ? { applies_to: { products: [service] } } : {}),
          metadata: { pg_kind: "halteangebot" },
        },
        { idempotencyKey: `coupon-${id}` },
      )
    ).id;
  }
  const existing = (sub.discounts ?? []).map((d) => ({ discount: typeof d === "string" ? d : d.id }));
  await stripe.subscriptions.update(sub.id, { discounts: [...existing, { coupon: couponId }], proration_behavior: "none" }, { idempotencyKey: opts.idempotencyKey });
  return { ok: true, couponId, subscriptionId: sub.id };
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
  /** Stripe-Produkt der Position (Standard: WhatsApp-Gebühren). */
  productKey?: ProductKey;
}): Promise<string> {
  const stripe = stripeClient();
  if (!stripe) throw new Error("Stripe ist nicht eingerichtet.");
  const [product, tax] = await Promise.all([productId(stripe, opts.productKey ?? "whatsapp"), resolveTax(stripe)]);
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
 * Offenen Rechnungsposten wieder entfernen (z. B. Einrichtung nach abgelehnter Produktbuchung).
 * "removed" = gelöscht oder schon weg; "invoiced" = steht schon auf einer festgeschriebenen
 * Rechnung (dann Gutschrift von Hand).
 */
export async function removeInvoiceItem(itemId: string): Promise<"removed" | "invoiced"> {
  const stripe = stripeClient();
  if (!stripe) throw new Error("Stripe ist nicht eingerichtet.");
  let item: Stripe.InvoiceItem;
  try {
    item = await stripe.invoiceItems.retrieve(itemId);
  } catch (err) {
    if ((err as { code?: string })?.code === "resource_missing") return "removed";
    throw err;
  }
  if ((item as unknown as { deleted?: boolean }).deleted) return "removed";
  const inv = item.invoice ? (typeof item.invoice === "string" ? await stripe.invoices.retrieve(item.invoice) : item.invoice) : null;
  if (inv && inv.status !== "draft") return "invoiced";
  await stripe.invoiceItems.del(itemId);
  return "removed";
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
    {
      name: c.name,
      email: c.users[0]?.email,
      preferred_locales: ["de"],
      invoice_settings: customerInvoiceSettingsCreate(await loadInvoiceDefaults()),
      metadata: { customer_id: customerId },
    },
    { idempotencyKey: `customer-${customerId}` },
  );
  await prisma.customer.update({ where: { id: customerId }, data: { stripeCustomerId: created.id } });
  return created.id;
}

/** Stripe-Seite zum Hinterlegen der Zahlungsart (Lastschrift bzw. Karte mit Apple Pay und Google Pay). */
export async function createPaymentSetupUrl(
  customerId: string,
  returnUrl: string,
  opts: { zahlart?: Zahlart | null; description?: string } = {},
): Promise<string> {
  const stripe = stripeClient();
  if (!stripe) throw new Error("Stripe ist nicht eingerichtet.");
  const stripeCustomerId = await ensureStripeCustomerFor(customerId);
  const session = await createCheckoutSession(
    stripe,
    {
      mode: "setup",
      currency: "eur",
      customer: stripeCustomerId,
      locale: "de",
      success_url: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}zahlung=ok`,
      cancel_url: returnUrl,
      metadata: { kind: "payment_setup", customer_id: customerId },
      setup_intent_data: { metadata: { kind: "payment_setup", customer_id: customerId }, description: opts.description ?? "Zahlungsart für Lead-Bestellungen" },
    },
    opts.zahlart,
  );
  if (!session.url) throw new Error("Stripe hat keine Seite geliefert.");
  return session.url;
}

/**
 * Nach „Zahlungsart hinterlegen“: als Standard für Rechnungen setzen, beim Kunden und bei
 * laufenden bzw. geplanten Abos (sonst zieht das Abo weiter von der alten Zahlungsart ein).
 */
export async function savePaymentSetup(session: Stripe.Checkout.Session): Promise<void> {
  const stripe = stripeClient();
  if (!stripe) return;
  const pm = await paymentMethodOf(stripe, session);
  const customer = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (pm && customer) {
    const d = await loadInvoiceDefaults();
    await stripe.customers.update(customer, { invoice_settings: { default_payment_method: pm, ...customerInvoiceSettingsUpdate(d) } });
    const [subs, schedules] = await Promise.all([
      stripe.subscriptions.list({ customer, status: "all", limit: 10 }),
      stripe.subscriptionSchedules.list({ customer, limit: 10 }),
    ]);
    for (const sub of subs.data) {
      if (["active", "past_due", "trialing", "unpaid"].includes(sub.status) && idOfPm(sub.default_payment_method) !== pm) {
        await stripe.subscriptions.update(sub.id, { default_payment_method: pm });
      }
    }
    // Zeitpläne setzen die Zahlungsart bei jedem Phasenwechsel neu, deshalb dort ebenfalls umstellen
    for (const sc of schedules.data) {
      if ((sc.status === "not_started" || sc.status === "active") && idOfPm(sc.default_settings?.default_payment_method) !== pm) {
        await stripe.subscriptionSchedules.update(sc.id, { default_settings: { default_payment_method: pm } });
      }
    }
  }
}

const idOfPm = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

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
  /** Stripe-Produkt der Positionen (Standard: Leads). */
  productKey?: ProductKey;
}): Promise<{ invoiceId: string; status: "paid" | "processing" | "open" | "failed" }> {
  const stripe = stripeClient();
  if (!stripe) throw new Error("Stripe ist nicht eingerichtet.");
  const [product, tax, invoiceDefaults, taxIds] = await Promise.all([
    productId(stripe, opts.productKey ?? "leads"),
    resolveTax(stripe),
    loadInvoiceDefaults(),
    accountTaxIdParams(stripe),
  ]);
  const invoice = await stripe.invoices.create(
    {
      customer: opts.stripeCustomerId,
      collection_method: "charge_automatically",
      auto_advance: true,
      pending_invoice_items_behavior: "exclude",
      description: opts.description,
      metadata: opts.metadata,
      ...invoiceFooterParams(invoiceDefaults),
      ...taxIds,
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

export type AddOnResult = { ok: true; changed: boolean; note?: string; scheduledFrom?: Date } | { ok: false; error: string };

const productOf = (i: Stripe.SubscriptionItem) => (typeof i.price.product === "string" ? i.price.product : i.price.product.id);
/** Zahlrhythmus des Abos: jährlich (Intervall Jahr), halbjährlich (Monat × 6) oder monatlich. */
const intervalOf = (sub: Stripe.Subscription): Zahlrhythmus => {
  const r = sub.items.data.map((i) => rhythmusAusStripe(i.price.recurring));
  return r.includes("year") ? "year" : r.includes("halfyear") ? "halfyear" : "month";
};

/** Laufendes Abo für Änderungen vorbereiten (Zeitplan lösen); null = noch nicht möglich. */
async function editableSubscription(stripe: Stripe, stripeCustomerId: string): Promise<{ sub: Stripe.Subscription } | { note: string }> {
  const sub = await activeSubscription(stripe, stripeCustomerId);
  if (!sub) return { note: "Abo läuft noch nicht, wird beim Start abgeglichen." };
  try {
    await detachSchedule(stripe, sub);
  } catch (err) {
    if (err instanceof IntroPhaseError) return { note: "Startpreis-Phase läuft, wird danach automatisch abgeglichen." };
    throw err;
  }
  return { sub };
}

type Proration = "create_prorations" | "none";

/**
 * Einmalige Positionen einer Phase (z. B. anteiliger Betrag bis zum ersten Abrechnungstag) beim Neuschreiben der
 * Phasen behalten. Ohne das würde Stripe sie beim Update des Zeitplans verwerfen.
 */
export function keptInvoiceItems(ph: Pick<Stripe.SubscriptionSchedule.Phase, "add_invoice_items">): { add_invoice_items?: Stripe.SubscriptionScheduleUpdateParams.Phase.AddInvoiceItem[] } {
  if (!ph.add_invoice_items?.length) return {};
  const id = (v: string | { id: string }) => (typeof v === "string" ? v : v.id);
  return {
    add_invoice_items: ph.add_invoice_items.map((a) => ({
      price: id(a.price),
      quantity: a.quantity ?? 1,
      ...(a.tax_rates?.length ? { tax_rates: a.tax_rates.map((t) => id(t)) } : {}),
      ...(a.period ? { period: { start: { type: a.period.start.type, ...(a.period.start.timestamp ? { timestamp: a.period.start.timestamp } : {}) }, end: { type: a.period.end.type, ...(a.period.end.timestamp ? { timestamp: a.period.end.timestamp } : {}) } } } : {}),
      ...(a.metadata && Object.keys(a.metadata).length ? { metadata: a.metadata } : {}),
    })),
  };
}

/** Geplanter, noch nicht gestarteter Abo-Start des Kunden (Angebot vor dem Startdatum). */
async function notStartedSchedule(stripe: Stripe, stripeCustomerId: string) {
  const list = await stripe.subscriptionSchedules.list({ customer: stripeCustomerId, limit: 10 });
  return list.data.find((s) => s.status === "not_started") ?? null;
}

const fmtDay = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

/**
 * Zusatzmodul vor dem Abo-Start (Ole, 13.11.2026: auch vor dem Startdatum selbst buchbar):
 * Position in alle Phasen des geplanten Abo-Starts aufnehmen bzw. entfernen – berechnet wird ab
 * Abo-Beginn. null = kein geplanter Start vorhanden.
 */
async function setScheduleItem(
  stripe: Stripe,
  stripeCustomerId: string,
  key: "seat" | "bestand" | "empfehlung",
  quantity: number,
  monthlyUnit: number,
): Promise<{ startsAt: Date } | null> {
  const found = await notStartedSchedule(stripe, stripeCustomerId);
  if (!found) return null;
  const schedule = await stripe.subscriptionSchedules.retrieve(found.id, { expand: ["phases.items.price"] });
  const [product, tax] = await Promise.all([productId(stripe, key), resolveTax(stripe)]);
  const priceObj = (i: Stripe.SubscriptionSchedule.Phase.Item) => (typeof i.price === "string" ? null : (i.price as Stripe.Price));
  const productOfItem = (i: Stripe.SubscriptionSchedule.Phase.Item) => {
    const p = priceObj(i);
    return p ? (typeof p.product === "string" ? p.product : p.product.id) : null;
  };
  const interval = rhythmusAusStripe(priceObj(schedule.phases[0]?.items[0] as Stripe.SubscriptionSchedule.Phase.Item)?.recurring);
  const factor = rhythmusFaktor(interval);
  const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = schedule.phases.map((ph) => {
    const items: Stripe.SubscriptionScheduleUpdateParams.Phase.Item[] = ph.items
      .filter((i) => productOfItem(i) !== product)
      .map((i) => ({
        price: typeof i.price === "string" ? i.price : i.price.id,
        quantity: i.quantity ?? 1,
        ...(i.tax_rates?.length ? { tax_rates: i.tax_rates.map((t) => (typeof t === "string" ? t : t.id)) } : {}),
      }));
    if (quantity > 0) {
      items.push({
        quantity,
        price_data: { currency: "eur", product, unit_amount: cents(monthlyUnit * factor), recurring: stripeRecurring(interval), tax_behavior: "exclusive" },
        ...(tax.automatic ? {} : { tax_rates: [tax.rateId!] }),
      });
    }
    return {
      items,
      start_date: ph.start_date,
      end_date: ph.end_date,
      ...(ph.metadata && Object.keys(ph.metadata).length ? { metadata: ph.metadata } : {}),
      ...keptInvoiceItems(ph),
    };
  });
  await stripe.subscriptionSchedules.update(schedule.id, { phases, proration_behavior: "none" });
  return { startsAt: new Date(schedule.phases[0].start_date * 1000) };
}

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
  const factor = rhythmusFaktor(interval);
  if (item) {
    const unit = cents(monthlyUnit * factor);
    if (quantity === 0 && key !== "seat") {
      await stripe.subscriptionItems.del(item.id, { proration_behavior: proration });
    } else if (unit !== item.price.unit_amount && quantity > 0) {
      // Preis je Platz/Modul geändert (Admin): Position mit neuem Preis, anteilig verrechnet
      await stripe.subscriptionItems.update(item.id, {
        quantity,
        proration_behavior: "create_prorations",
        price_data: { currency: "eur", product, unit_amount: unit, recurring: stripeRecurring(interval), tax_behavior: "exclusive" },
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
    price_data: { currency: "eur", product, unit_amount: cents(monthlyUnit * factor), recurring: stripeRecurring(interval), tax_behavior: "exclusive" },
    ...(tax.automatic ? {} : { tax_rates: [tax.rateId!] }),
  });
}

/**
 * Weitere aktive Verkäufer im Abo abrechnen (Ole, 14.11.2026: „3 aktive Verkäufer inklusive“,
 * siehe lib/seats.ts). Tagesgenau über Stripe-Prorations; vor dem Abo-Start in den geplanten
 * Start übernommen (wie Zusatzmodule). Geht das nicht automatisch (kein Stripe-Kunde, kein Abo,
 * Startpreis-Phase), entsteht eine Admin-Aufgabe „Platz von Hand abrechnen“ statt still nichts.
 */
export async function syncSeatBilling(customerId: string, opts: { force?: boolean; now?: Date; decreaseOnly?: boolean } = {}): Promise<AddOnResult> {
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
    const usage = await seatUsage(customerId, opts.now);
    // Nie mehr als nach der bisherigen Regel (alle Logins), siehe seatsToBill()
    const want = seatsToBill({ ...usage, included: c.seatsIncluded, price });
    if (want === c.seatsBilled && !opts.force) return { ok: true, changed: false };
    // Täglicher Abgleich senkt nur: Erhöhungen entstehen nur durch eine Aktion im Team
    // (Einladen, „bekommt Leads“, Zuteilen). So zahlt durch die Umstellung niemand mehr (Ole, 14.11.2026).
    if (opts.decreaseOnly && want > c.seatsBilled) return { ok: true, changed: false, note: "Erhöhung nur bei Änderung im Team." };
    const stripe = stripeClient();
    let note: string | undefined;
    if (stripe && c.stripeCustomerId) {
      const ed = await editableSubscription(stripe, c.stripeCustomerId);
      if ("note" in ed) {
        // Abo startet erst noch: Plätze in den geplanten Start aufnehmen (berechnet ab Abo-Beginn)
        const planned = await setScheduleItem(stripe, c.stripeCustomerId, "seat", want, price);
        if (!planned) {
          // Kein Abo und kein geplanter Start bzw. Startpreis-Phase: Menge bleibt offen (der tägliche
          // Abgleich versucht es weiter), bis dahin von Hand abrechnen.
          if (want !== c.seatsBilled) await manualSeatTask(customerId, { from: c.seatsBilled, to: want, price, reason: ed.note });
          return { ok: true, changed: false, note: `${ed.note} Aufgabe „${MANUAL_SEAT_TASK}“ ist angelegt.` };
        }
        if (want > 0) note = `Berechnet ab Abo-Start am ${fmtDay(planned.startsAt)}.`;
      } else await setItemQuantity(stripe, ed.sub, "seat", want, price);
    } else {
      await manualSeatTask(customerId, {
        from: c.seatsBilled,
        to: want,
        price,
        reason: stripe ? "Für den Kunden ist kein Stripe-Kunde hinterlegt." : "Stripe ist nicht eingerichtet.",
      });
      note = `Ohne Stripe: Aufgabe „${MANUAL_SEAT_TASK}“ ist angelegt.`;
    }
    await prisma.customer.update({ where: { id: customerId }, data: { seatsBilled: want } });
    await audit("billing.seats", { entity: "Customer", entityId: customerId, customerId, details: { from: c.seatsBilled, to: want, logins: usage.logins, active: usage.active, price } });
    return { ok: true, changed: true, ...(note ? { note } : {}) };
  } catch (err) {
    reportError(err, "billing-seats", { customer: customerId });
    return { ok: false, error: "Die Abrechnung der Verkäufer-Plätze konnte nicht angepasst werden." };
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
        // Abo startet erst noch: Modul in den geplanten Start aufnehmen
        const planned = await setScheduleItem(stripe, c.stripeCustomerId, "bestand", mode === "book" && price > 0 ? 1 : 0, price);
        if (planned) {
          if (mode === "book" && price > 0) note = `Berechnet ab Abo-Start am ${fmtDay(planned.startsAt)}.`;
        } else {
          if (opts.requireStripe) return { ok: false, error: ed.note };
          note = ed.note;
        }
      } else await setItemQuantity(stripe, ed.sub, "bestand", mode === "book" && price > 0 ? 1 : 0, price, opts.proration);
    } else if (mode === "book" && price > 0) {
      note = "Ohne Stripe, bitte von Hand abrechnen.";
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
    // from = Monatspreis vorher (Admin → Zahlen → Buchungen)
    await audit("billing.bestand", { entity: "Customer", entityId: customerId, customerId, details: { mode, price, from: c.bestandMonthly != null ? Number(c.bestandMonthly) : null }, ...(opts.actor ? { actor: opts.actor } : {}) });
    // Kampagnen-Vorlagen gleich bei Meta einreichen (Selbstbuchung und Admin-Freischaltung laufen hier durch)
    if (mode !== "cancel") {
      const { submitTemplatesAfterModule } = await import("@/lib/whatsapp/template-submit");
      await submitTemplatesAfterModule(customerId);
    }
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
    if (!sub) {
      // Vor dem Startdatum: Buchung geht in den geplanten Abo-Start (berechnet ab Abo-Beginn)
      const planned = await notStartedSchedule(stripe, stripeCustomerId);
      if (!planned) return "Ihr Abo läuft noch nicht.";
      const pmSchedule = planned.default_settings?.default_payment_method;
      if (pmSchedule) return null;
      const cust = await stripe.customers.retrieve(stripeCustomerId);
      const pm = "deleted" in cust && cust.deleted ? null : (cust as Stripe.Customer).invoice_settings?.default_payment_method;
      return pm ? null : "Für Ihr Konto ist keine Zahlungsart hinterlegt.";
    }
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
      note = "Ohne Stripe, Abrechnung bitte von Hand beenden.";
    }
    if (!until) until = endOfBerlinMonth();
    await prisma.customer.update({ where: { id: customerId }, data: { bestandCancelAt: until } });
    await audit("billing.bestand", {
      entity: "Customer",
      entityId: customerId,
      customerId,
      details: { mode: "cancel_at_period_end", until: until.toISOString(), price: Number(c.bestandMonthly) },
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
    if (!stripe || !c.stripeCustomerId) return { ok: true, changed: false, note: "Ohne Stripe, bitte von Hand abrechnen." };
    const ed = await editableSubscription(stripe, c.stripeCustomerId);
    if ("note" in ed) {
      // Abo startet erst noch: Modul in den geplanten Start aufnehmen (berechnet ab Abo-Beginn)
      const planned = await setScheduleItem(stripe, c.stripeCustomerId, "empfehlung", monthly > 0 ? 1 : 0, monthly);
      return planned ? { ok: true, changed: true, scheduledFrom: planned.startsAt } : { ok: true, changed: false, note: ed.note };
    }
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
    await audit("billing.empfehlung", { entity: "Customer", entityId: customerId, customerId, details: { mode, price, from: c.empfehlungMonthly != null ? Number(c.empfehlungMonthly) : null }, ...(opts.actor ? { actor: opts.actor } : {}) });
    // Empfehlungs-Vorlagen gleich bei Meta einreichen (Admin-Freischaltung)
    if (mode !== "cancel") {
      const { submitTemplatesAfterModule } = await import("@/lib/whatsapp/template-submit");
      await submitTemplatesAfterModule(customerId);
    }
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
    if (c.empfehlungFree) return { ok: false, error: "Das Modul ist für Sie kostenlos freigeschaltet, bitte bei uns melden." };
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
        note = "Ohne Stripe, Abrechnung bitte von Hand beenden.";
      }
    }
    if (!until) until = endOfBerlinMonth(now);
    await prisma.customer.update({ where: { id: customerId }, data: { empfehlungCancelAt: until } });
    await audit("billing.empfehlung", { entity: "Customer", entityId: customerId, customerId, details: { mode: "cancel_at_period_end", until: until.toISOString(), price: c.empfehlungMonthly != null ? Number(c.empfehlungMonthly) : 0 } });
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

/** Zahlweise umstellen (monatlich ↔ jährlich bzw. 6 Monate im Voraus). Alle Positionen werden neu bepreist. */
export async function changeBillingInterval(customerId: string, interval: Zahlrhythmus): Promise<AddOnResult> {
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
      const from = rhythmusFaktor(intervalOf(sub));
      const to = rhythmusFaktor(interval);
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
              recurring: stripeRecurring(interval),
              tax_behavior: "exclusive" as const,
            },
            ...(tax.automatic ? {} : { tax_rates: [tax.rateId!] }),
          })),
        ],
      });
    } else {
      note = "Ohne Stripe, bitte von Hand abrechnen.";
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
    if (!stripe || !c.stripeCustomerId) return { ok: true, changed: false, note: "Ohne Stripe-Abo, Preis bitte von Hand anpassen." };
    const ed = await editableSubscription(stripe, c.stripeCustomerId);
    if ("note" in ed) return { ok: true, changed: false, note: ed.note };
    const sub = ed.sub;
    const [software, service, tax] = await Promise.all([productId(stripe, "software"), productId(stripe, "service"), resolveTax(stripe)]);
    const interval = intervalOf(sub);
    const factor = rhythmusFaktor(interval);
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
        { proration_behavior: "none", price_data: { currency: "eur", product: service, unit_amount: unit, recurring: stripeRecurring(interval), tax_behavior: "exclusive" } },
        key,
      );
    } else if (unit > 0) {
      await stripe.subscriptionItems.create(
        {
          subscription: sub.id,
          quantity: 1,
          proration_behavior: "none",
          price_data: { currency: "eur", product: service, unit_amount: unit, recurring: stripeRecurring(interval), tax_behavior: "exclusive" },
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

/**
 * Täglicher Abgleich (03 Uhr UTC): aktive Verkäufer aller Kunden mit Platz-Abrechnung. Holt
 * verschobene Änderungen nach und senkt die Menge, sobald jemand ohne Leads ist und heute keinen
 * Lead bekommen hat. Erhöht nie über die bisherige Regel (alle Logins), siehe seatsToBill().
 */
export async function reconcileSeatBilling(now = new Date()): Promise<{ changed: number; errors: number }> {
  const customers = await prisma.customer.findMany({ where: { seatsIncluded: { not: null }, archived: false, isTest: false }, select: { id: true } });
  let changed = 0;
  let errors = 0;
  for (const c of customers) {
    const r = await syncSeatBilling(c.id, { now, decreaseOnly: process.env.SEATS_RECONCILE_INCREASE !== "1" });
    if (!r.ok) errors++;
    else if (r.changed) changed++;
  }
  return { changed, errors };
}

// ─── Vertragsende nach „Vertrag hier kündigen“ (Ole, 15.11.2026) ─────────────

export type ContractEndResult =
  | { ok: true; changed: string[]; unchanged: string[] }
  | { ok: false; error: string; changed: string[] };

/**
 * Alle laufenden Abos und geplanten Abo-Starts des Kunden enden zum Zeitpunkt `endAt` (Stripe `cancel_at`,
 * keine sofortige Kündigung, keine anteilige Gutschrift). Idempotent: steht `cancel_at` schon auf `endAt`,
 * passiert nichts.
 * - Abo ohne Zeitplan bzw. in der letzten Phase: Zeitplan lösen, dann `cancel_at` am Abo
 * - Zeitplan noch nicht gestartet oder Startpreis-Phase läuft: Phasen bei `endAt` enden lassen, end_behavior „cancel“
 * Kein laufendes Abo und kein geplanter Start → ok: false (bitte von Hand prüfen).
 */
export async function endSubscriptionsAt(stripeCustomerId: string, endAt: Date, now = new Date()): Promise<ContractEndResult> {
  const stripe = stripeClient();
  if (!stripe) return { ok: false, error: "Stripe ist nicht eingerichtet.", changed: [] };
  const ts = Math.floor(endAt.getTime() / 1000);
  const changed: string[] = [];
  const unchanged: string[] = [];
  try {
    const subs = (await stripe.subscriptions.list({ customer: stripeCustomerId, status: "all", limit: 10 })).data.filter((s) =>
      ["active", "past_due", "trialing", "unpaid", "incomplete"].includes(s.status),
    );
    const handledSchedules = new Set<string>();
    for (const sub of subs) {
      const scheduleId = typeof sub.schedule === "string" ? sub.schedule : (sub.schedule?.id ?? null);
      if (scheduleId) {
        handledSchedules.add(scheduleId);
        const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
        const last = schedule.phases[schedule.phases.length - 1];
        if (schedule.status === "active" && last && last.start_date > now.getTime() / 1000) {
          // Startpreis-Phase läuft noch: den Zeitplan selbst zum Termin enden lassen
          if (await endScheduleAt(stripe, schedule, ts)) changed.push(scheduleId);
          else unchanged.push(scheduleId);
          continue;
        }
        // Letzte Phase läuft: Zeitplan lösen, danach ist das Abo frei änderbar (wie detachSchedule)
        if (schedule.status === "active") await stripe.subscriptionSchedules.release(scheduleId);
      }
      if (sub.cancel_at === ts && !sub.cancel_at_period_end) {
        unchanged.push(sub.id);
        continue;
      }
      await stripe.subscriptions.update(sub.id, { cancel_at: ts, proration_behavior: "none" }, { idempotencyKey: `contract-end-${sub.id}-${ts}` });
      changed.push(sub.id);
    }
    // Abo-Start noch nicht erreicht (Angebot vor dem Startdatum)
    const schedules = (await stripe.subscriptionSchedules.list({ customer: stripeCustomerId, limit: 10 })).data.filter(
      (s) => s.status === "not_started" && !handledSchedules.has(s.id),
    );
    for (const s of schedules) {
      if (await endScheduleAt(stripe, s, ts)) changed.push(s.id);
      else unchanged.push(s.id);
    }
    if (!changed.length && !unchanged.length) return { ok: false, error: "Kein laufendes Stripe-Abo gefunden.", changed };
    return { ok: true, changed, unchanged };
  } catch (err) {
    reportError(err, "billing-contract-end", { stripeCustomer: stripeCustomerId });
    return { ok: false, error: err instanceof Error ? err.message.slice(0, 300) : String(err), changed };
  }
}

/** Zeitplan zum Zeitpunkt `ts` enden lassen (spätere Phasen fallen weg); false = stand schon so. */
async function endScheduleAt(stripe: Stripe, schedule: Stripe.SubscriptionSchedule, ts: number): Promise<boolean> {
  const kept = schedule.phases.filter((ph) => ph.start_date < ts);
  if (!kept.length) {
    // Vertragsende vor dem Abo-Start: geplanten Start streichen
    await stripe.subscriptionSchedules.cancel(schedule.id);
    return true;
  }
  const lastKept = kept[kept.length - 1];
  if (schedule.end_behavior === "cancel" && lastKept.end_date === ts && kept.length === schedule.phases.length) return false;
  const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = kept.map((ph, i) => ({
    items: ph.items.map((it) => ({
      price: typeof it.price === "string" ? it.price : it.price.id,
      quantity: it.quantity ?? 1,
      ...(it.tax_rates?.length ? { tax_rates: it.tax_rates.map((t) => (typeof t === "string" ? t : t.id)) } : {}),
    })),
    start_date: ph.start_date,
    end_date: i === kept.length - 1 ? ts : ph.end_date,
    ...(ph.metadata && Object.keys(ph.metadata).length ? { metadata: ph.metadata } : {}),
    ...keptInvoiceItems(ph),
  }));
  await stripe.subscriptionSchedules.update(schedule.id, { phases, end_behavior: "cancel", proration_behavior: "none" });
  return true;
}
