// Diagnose-Abfrage „kunde-abrechnung“ (Ole, 17.11.2026, Überweisung als Einzelfall): nur lesend.
// Angebot(e) und Abrechnungsstand eines Kunden: Preise, Laufzeit, Start, Bonus, Zahlstatus, Stripe-Verknüpfung.
//   GET /api/ops/diagnose?q=kunde-abrechnung&kunde=<Kunden-ID>

import { prisma } from "@/lib/prisma";

const OFFER_FELDER = {
  number: true, version: true, status: true, company: true, contactName: true, package: true, vermittlerTyp: true, term: true, products: true,
  setupFee: true, setupListFee: true, setupDiscount: true, setupDiscountLabel: true, monthlyFee: true, softwareFee: true, introMonthlyFee: true,
  introMonths: true, specialTerms: true, startDate: true, billingDay: true, billingFreeStart: true, customerChoosesTerm: true, customerChoosesStart: true, validUntil: true, sentAt: true,
  acceptedAt: true, acceptedCompany: true, acceptedAsBusiness: true, seats: true, seatsIncluded: true, seatMonthly: true, bestandMonthly: true,
  empfehlungMonthly: true, annualPrepay: true, annualFreeMonths: true, annualChoice: true, abschlussBonus: true, abschlussBonusBis: true, abschlussBonusGewaehrt: true,
  stripeCustomerId: true, stripeSubscriptionId: true, stripeScheduleId: true, paymentStatus: true, subscriptionStatus: true, paidAt: true,
  paymentReminderAt: true, allowPayLater: true, paymentReminderCount: true, startShiftedFrom: true, createdAt: true,
} as const;

export async function kundeAbrechnung(p: URLSearchParams) {
  const suche = (p.get("suche") ?? "").trim();
  if (suche.length >= 3) return angeboteSuche(suche);
  const id = p.get("kunde") ?? "";
  if (!id) return { fehler: "kunde=<Kunden-ID> oder suche=<Name> fehlt" };
  const c = await prisma.customer.findUnique({
    where: { id },
    select: {
      id: true, name: true, plan: true, vermittlerTyp: true, stripeCustomerId: true, billingInterval: true, retainerMonthly: true, retainerStart: true,
      retainerEnd: true, billingDay: true, billingStart: true, seatsIncluded: true, seatMonthly: true, paymentOverdueSince: true, createdAt: true,
      customerProducts: { select: { startDate: true, leadPrice: true, leadGoal: true, testMode: true, product: { select: { name: true } } } },
      salesContact: { select: { id: true, name: true } },
    },
  });
  if (!c) return { fehler: "Kunde nicht gefunden" };
  const offers = c.salesContact
    ? await prisma.offer.findMany({ where: { salesContactId: c.salesContact.id }, orderBy: { createdAt: "asc" }, select: OFFER_FELDER })
    : [];
  return { kunde: c, angebote: offers };
}

/** Angebote nach Name/Firma (&suche=), mit dem Kundenkonto, das die Annahme nutzen würde (Kontakt bzw. Login-E-Mail). */
async function angeboteSuche(suche: string) {
  const offers = await prisma.offer.findMany({
    where: { OR: [{ contactName: { contains: suche, mode: "insensitive" } }, { company: { contains: suche, mode: "insensitive" } }] },
    orderBy: { createdAt: "asc" },
    select: { ...OFFER_FELDER, email: true, salesContactId: true, allowBankTransfer: true, bankTransferDays: true, zahlweise: true },
  });
  const out = [];
  for (const o of offers) {
    const contact = o.salesContactId ? await prisma.salesContact.findUnique({ where: { id: o.salesContactId }, select: { customerId: true, email: true } }) : null;
    const mails = [o.email, contact?.email].map((e) => (e ?? "").trim().toLowerCase()).filter((e) => e.includes("@"));
    const konten = mails.length
      ? await prisma.user.findMany({ where: { email: { in: mails, mode: "insensitive" }, customerId: { not: null } }, select: { customer: { select: { id: true, name: true } } } })
      : [];
    const { email: _e, ...rest } = o;
    void _e;
    out.push({ ...rest, kontaktKunde: contact?.customerId ?? null, loginKonten: konten.map((k) => k.customer) });
  }
  return { suche, angebote: out };
}
