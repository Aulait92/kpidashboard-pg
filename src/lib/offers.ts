// Angebote / Auftragsbestätigungen (zu einem Vertriebskontakt oder alten Deal): anlegen (Konditionen
// werden eingefroren), per geheimem Link anzeigen, online annehmen.

import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/email";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import { computeOfferPrice, normalizeTerm, offerAddOns, PRICE_LIST, type OfferPackage, type OfferProduct, type OfferTerm } from "@/lib/offer-pricing";
import { logOfferActivity, offerAdminHref, setContactCustomerStage, type OfferTarget } from "@/lib/offer-links";
import { billingEnabled } from "@/lib/billing";
import { startOnboarding } from "@/lib/onboarding";
import { audit } from "@/lib/audit";


export type OfferFormInput = {
  contactName: string;
  company?: string | null;
  email?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  package?: OfferPackage;
  term: OfferTerm;
  products: OfferProduct[];
  setupOverride?: number | null;
  monthlyOverride?: number | null;
  introMonthlyFee?: number | null;
  introMonths?: number | null;
  specialTerms?: string | null;
  startDate?: string | null; // YYYY-MM-DD
  validDays?: number;
  /** Logins gesamt (Inhaber + Berater); 3 inklusive. */
  seats?: number | null;
  /** Jährlich im Voraus (nur 12 Monate Laufzeit, nicht mit Startpreis). */
  annual?: boolean;
  /** Bestandskunden-Modul dazubuchen. */
  bestandModule?: boolean;
  /** Vertreter (Standard) oder Makler: bestimmt die Garantien. */
  vermittlerTyp?: "vertreter" | "makler";
};

/** Rechtstexte, denen bei der Annahme zugestimmt wird (per Umgebungsvariable). */
export function legalUrls() {
  let base: string | null = null;
  try {
    base = getAppUrl();
  } catch {
    base = null;
  }
  // Standard: eigene Seiten /rechtliches/agb und /rechtliches/avv (Stand im
  // Seitenkopf). Per Umgebungsvariable auf andere URLs umstellbar.
  return {
    termsUrl: process.env.OFFER_TERMS_URL?.trim() || (base ? `${base}/rechtliches/agb` : null),
    dpaUrl: process.env.OFFER_DPA_URL?.trim() || (base ? `${base}/rechtliches/avv` : null),
  };
}

async function nextOfferNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PG-${year}-`;
  const last = await prisma.offer.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const n = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

export async function createOffer(target: OfferTarget, input: OfferFormInput, createdById: string | null) {
  const owner = "dealId" in target ? { dealId: target.dealId } : { salesContactId: target.salesContactId };
  const products = input.products
    .map((p) => ({ name: p.name.trim(), dailyBudget: Math.max(0, Number(p.dailyBudget) || 0) }))
    .filter((p) => p.name);
  if (!input.contactName.trim()) throw new Error("Bitte einen Ansprechpartner angeben.");
  if (products.length === 0) throw new Error("Bitte mindestens ein Produkt angeben.");

  const pkg: OfferPackage = input.package === "service" ? "service" : "software";
  const vermittlerTyp = input.vermittlerTyp === "makler" ? "makler" : "vertreter";
  if (!input.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
    throw new Error("Bitte ein Startdatum angeben – ab dann läuft die Monatsgebühr.");
  }
  const term = normalizeTerm(input.term);
  const price = computeOfferPrice({
    package: pkg,
    term,
    products,
    setupOverride: input.setupOverride,
    monthlyOverride: input.monthlyOverride,
    seats: input.seats,
    annual: input.annual,
    bestandModule: input.bestandModule,
  });
  if (price.monthlyFee == null) {
    throw new Error(
      price.seatsIndividual
        ? `Ab ${PRICE_LIST.seatIndividualFrom} Logins gibt es keinen Listenpreis – bitte die Monatsgebühr individuell eintragen (inklusive aller Logins).`
        : "Ab 10.000 € Werbebudget gibt es keinen Listenpreis – bitte die Monatsgebühr individuell eintragen.",
    );
  }
  if (input.annual && term !== "12m") throw new Error("Jährliche Vorauszahlung geht nur mit 12 Monaten Laufzeit.");
  if (input.annual && input.introMonthlyFee != null) throw new Error("Startpreis und jährliche Vorauszahlung lassen sich nicht kombinieren.");

  const { termsUrl, dpaUrl } = legalUrls();
  const validUntil = new Date(Date.now() + (input.validDays ?? 14) * 24 * 60 * 60 * 1000);

  // Nummer kann bei gleichzeitigem Anlegen kollidieren → wenige Versuche.
  for (let attempt = 0; attempt < 3; attempt++) {
    const number = await nextOfferNumber();
    try {
      return await prisma.$transaction(async (tx) => {
        const previous = await tx.offer.findMany({
          where: { ...owner, status: { in: ["draft", "sent"] } },
          select: { id: true, version: true },
        });
        const maxVersion = await tx.offer.aggregate({ where: owner, _max: { version: true } });
        if (previous.length) {
          await tx.offer.updateMany({
            where: { id: { in: previous.map((p) => p.id) } },
            data: { status: "superseded" },
          });
        }
        return tx.offer.create({
          data: {
            ...owner,
            number,
            version: (maxVersion._max.version ?? 0) + 1,
            token: crypto.randomBytes(24).toString("base64url"),
            contactName: input.contactName.trim(),
            company: input.company?.trim() || null,
            email: input.email?.trim() || null,
            street: input.street?.trim() || null,
            zip: input.zip?.trim() || null,
            city: input.city?.trim() || null,
            package: pkg,
            vermittlerTyp,
            term,
            products,
            setupFee: price.setupFee,
            monthlyFee: price.monthlyFee!,
            softwareFee: price.softwareFee,
            // Zusätze (nur Paket mit Software): Logins, Modul, Zahlweise
            seats: pkg === "software" ? price.seats : null,
            seatsIncluded: pkg === "software" ? price.seatsIncluded : null,
            // Ab seatIndividualFrom sind alle Logins im individuellen Preis enthalten (0 €)
            seatMonthly: pkg === "software" ? (price.seatsIndividual ? 0 : PRICE_LIST.seatMonthly) : null,
            // Modul gebucht: Monatspreis; null = nicht gebucht
            bestandMonthly: price.bestandActive ? price.bestandFee : null,
            annualPrepay: price.annual,
            annualFreeMonths: price.annual ? PRICE_LIST.annualFreeMonths : null,
            introMonthlyFee: input.introMonthlyFee ?? null,
            introMonths: input.introMonthlyFee != null ? (input.introMonths ?? null) : null,
            specialTerms: input.specialTerms?.trim() || null,
            startDate: input.startDate ? new Date(`${input.startDate}T12:00:00Z`) : null,
            validUntil,
            termsUrl,
            dpaUrl,
            createdById,
          },
        });
      });
    } catch (err) {
      const unique = err instanceof Error && /Unique constraint|P2002/.test(err.message);
      if (!unique || attempt === 2) throw err;
    }
  }
  throw new Error("Angebotsnummer konnte nicht vergeben werden.");
}

export async function getOfferByToken(token: string) {
  if (!token || token.length < 20) return null;
  return prisma.offer.findUnique({ where: { token } });
}

export type AcceptResult = { ok: true } | { ok: false; error: string };

export async function acceptOffer(
  token: string,
  opts: { name: string; ip: string | null; agent: string | null; termsAccepted: boolean },
): Promise<AcceptResult> {
  const offer = await getOfferByToken(token);
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  if (offer.status === "accepted") return { ok: true };
  if (offer.status === "superseded") return { ok: false, error: "Dieses Angebot wurde durch eine neuere Version ersetzt." };
  if (offer.validUntil.getTime() < Date.now()) return { ok: false, error: "Dieses Angebot ist abgelaufen. Bitte fordere ein neues an." };
  if (!offer.termsUrl || !offer.dpaUrl) return { ok: false, error: "Die Online-Annahme ist für dieses Angebot noch nicht freigeschaltet." };
  if (!opts.termsAccepted) return { ok: false, error: "Bitte bestätige AGB und Auftragsverarbeitungsvertrag." };
  const name = opts.name.trim();
  if (name.length < 3) return { ok: false, error: "Bitte gib deinen vollständigen Namen ein." };

  const now = new Date();
  const updated = await prisma.offer.updateMany({
    where: { id: offer.id, status: { in: ["draft", "sent"] } },
    data: {
      status: "accepted",
      acceptedAt: now,
      acceptedName: name.slice(0, 200),
      acceptedIp: opts.ip?.slice(0, 100) ?? null,
      acceptedAgent: opts.agent?.slice(0, 400) ?? null,
    },
  });
  if (updated.count === 0) return { ok: false, error: "Dieses Angebot kann nicht mehr angenommen werden." };
  await audit("offer.accept", {
    entity: "Offer",
    entityId: offer.id,
    details: { number: offer.number, name: name.slice(0, 200), ip: opts.ip?.slice(0, 100) ?? null },
    actor: { email: offer.email ?? null, role: "kunde" },
  });

  // Deal bzw. Kontakt auf „gewonnen“ setzen und in der Historie vermerken.
  if (offer.salesContactId) {
    await setContactCustomerStage(offer, "VERTRAG");
    const products = Array.isArray(offer.products)
      ? (offer.products as { name?: string }[]).map((p) => p?.name).filter(Boolean).join(", ")
      : "";
    await prisma.salesContact
      .update({
        where: { id: offer.salesContactId },
        data: {
          // Monatlich gesamt inkl. Logins und Modul (bei Jahreszahlung ohne Rabatt)
          monthlyValue: Math.round(offerAddOns(offerAddOnsOf(offer)).monthlyTotal),
          ...(products ? { products } : {}),
          contractStart: offer.startDate ?? now,
        },
      })
      .catch((err) => reportError(err, "offer-accept-contact-update", { offer: offer.number }));
    await logOfferActivity(offer, `Angebot ${offer.number} online angenommen von ${name}`, "Kunden-Pipeline: Vertrag");
  } else if (offer.dealId) {
    // Altes Deal-Board (abgeschaltet): nur in der Historie vermerken.
    await logOfferActivity(offer, `Angebot ${offer.number} online angenommen von ${name}`);
  }

  // Ohne Online-Zahlung startet das Onboarding direkt mit der Annahme
  // (sonst, sobald die Zahlung eingerichtet ist – siehe Stripe-Webhook).
  if (!billingEnabled()) {
    await startOnboarding(offer.id).catch((err) => reportError(err, "onboarding-start", { offer: offer.number }));
  }

  await sendToAdmins({
    title: `✅ Angebot angenommen: ${offer.company ?? offer.contactName}`,
    body: `${offer.number} · ${name}`,
    url: offerAdminHref(offer),
    tag: `offer:${offer.id}`,
  }).catch((err) => reportError(err, "offer-accept-push"));

  return { ok: true };
}

export async function markOfferViewed(id: string) {
  await prisma.offer
    .updateMany({ where: { id, viewedAt: null }, data: { viewedAt: new Date() } })
    .catch(() => {});
}

/** Snapshot-Felder eines Angebots für {@link offerAddOns}. */
export function offerAddOnsOf(o: {
  monthlyFee: unknown;
  seats: number | null;
  seatsIncluded: number | null;
  seatMonthly: unknown;
  bestandMonthly: unknown;
  annualPrepay: boolean;
  annualFreeMonths: number | null;
}) {
  return {
    monthlyFee: Number(o.monthlyFee),
    seats: o.seats,
    seatsIncluded: o.seatsIncluded,
    seatMonthly: o.seatMonthly == null ? null : Number(o.seatMonthly),
    bestandMonthly: o.bestandMonthly == null ? null : Number(o.bestandMonthly),
    annualPrepay: o.annualPrepay,
    annualFreeMonths: o.annualFreeMonths,
  };
}
