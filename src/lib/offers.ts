// Angebote / Auftragsbestätigungen (zu einem Vertriebskontakt oder alten Deal): anlegen (Konditionen
// werden eingefroren), per geheimem Link anzeigen, online annehmen.

import { parseZahlungsziel } from "@/lib/mahnwesen";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getAppUrl, sendCustomerMail } from "@/lib/email";
import { LOGIN_EMAIL_RE, normalizeLoginEmail } from "@/lib/login-email";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import {
  berlinTagesendeIso,
  berlinTodayIso,
  isIsoDate,
  computeOfferPrice,
  normalizeTerm,
  offerAddOns,
  PRICE_LIST,
  prepayFreeMonthsFor,
  prepayPossible,
  resolveOfferChoice,
  TERM_SHORT,
  termOptionsFor,
  type OfferPackage,
  type OfferProduct,
  type OfferTerm,
} from "@/lib/offer-pricing";
import { customerGreeting, logOfferActivity, offerAdminHref, setContactCustomerStage, type OfferTarget } from "@/lib/offer-links";
import { billingEnabled } from "@/lib/billing";
import { startOnboarding } from "@/lib/onboarding";
import { audit } from "@/lib/audit";
import { referralSetupDiscount } from "@/lib/kollegen";
import { checkBusiness, type BusinessInput } from "@/lib/unternehmer";
import { contractSummaryLines, hasPriceStep, type ContractSummaryInput } from "@/lib/vertrag-laufzeit";
import { parseAbrechnungstag } from "@/lib/abrechnungstag";


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
  /** Abrechnungstag 1 bis 28 (lib/abrechnungstag.ts); leer = wie Start. */
  billingDay?: number | null;
  /** Zeit vom Start bis zum ersten Abrechnungstag kostenlos („kostenloser Start“, Standard aus = anteilig). */
  billingFreeStart?: boolean;
  validDays?: number;
  /** Aktive Verkäufer gesamt (bekommen Leads); 3 inklusive, Mitglieder ohne Leads kostenlos. */
  seats?: number | null;
  /**
   * „Jahreszahlung anbieten“ (nur 12 Monate Laufzeit, nicht mit Startpreis): Der Kunde wählt bei der Annahme
   * monatlich (vorausgewählt) oder jährlich im Voraus (Ole, 18.11.2026; vorher war das Angebot dann nur jährlich).
   */
  annual?: boolean;
  /** Bestandskunden-Modul dazubuchen. */
  bestandModule?: boolean;
  /** Modul „Empfehlungen & Bewertungen“ dazubuchen. */
  empfehlungModule?: boolean;
  /** Vertreter (Standard) oder Makler: bestimmt die Garantien. */
  vermittlerTyp?: "vertreter" | "mehrfachvertreter" | "makler";
  /**
   * Testangebot (Ole, 15.11.2026): alles 0 €, Annahme ohne Zahlung, legt einen Testkunden an
   * (zählt nicht in Admin-Zahlen und Abrechnung, später löschbar).
   */
  test?: boolean;
  /**
   * Empfehlungsrabatt auf die Einrichtung (netto). undefined = automatisch aus der
   * Kollegen-Empfehlung des Kontakts; Zahl = vom Admin übersteuert (0 = kein Rabatt).
   */
  setupDiscount?: number | null;
  /**
   * Kunde darf Laufzeit und Startdatum auf der Angebotsseite selbst wählen (Standard an).
   * Mit Sonderpreis (Setup/Monat abweichend) nur das Startdatum.
   */
  customerChoice?: boolean;
  /** „Ich zahle später, erinnern Sie mich am …“ auf der Angebotsseite erlauben (Standard aus, Ole 16.11.2026). */
  allowPayLater?: boolean;
  /** Überweisung erlauben (nur auf Anfrage des Kunden, Standard aus, Ole 17.11.2026) und Zahlungsziel in Tagen (Standard 14). */
  allowBankTransfer?: boolean;
  bankTransferDays?: number | null;
  /**
   * Abschlussbonus auf die Einrichtung (netto) bei Annahme und Zahlung am Versandtag (Ole, 16.11.2026).
   * Das Formular schlägt 300 € vor (ABSCHLUSSBONUS_STANDARD); leer/0 = kein Bonus. Nicht bei Testangeboten oder ohne Einrichtung.
   */
  abschlussBonus?: number | null;
  /** Letzter Tag des Bonus (YYYY-MM-DD, gilt bis 23:59 Uhr Berlin); leer = Versandtag. */
  abschlussBonusBis?: string | null;
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

/** Startwert der laufenden Nummer (OFFER_NUMBER_START, z. B. 141 = weiter nach Papierkram). */
export function offerNumberStart(): number {
  const n = Math.floor(Number(process.env.OFFER_NUMBER_START));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** Nächste laufende Nummer: nach der letzten vergebenen, mindestens der Startwert. */
export function nextNumberAfter(last: string | null, prefix: string, start: number): string {
  const lastN = last ? Number(last.slice(prefix.length)) : NaN;
  const n = Math.max(Number.isFinite(lastN) ? lastN + 1 : 1, start);
  return `${prefix}${String(n).padStart(4, "0")}`;
}

async function nextOfferNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PG-${year}-`;
  const last = await prisma.offer.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return nextNumberAfter(last?.number ?? null, prefix, offerNumberStart());
}

export async function createOffer(target: OfferTarget, input: OfferFormInput, createdById: string | null) {
  const owner = "dealId" in target ? { dealId: target.dealId } : { salesContactId: target.salesContactId };
  const products = input.products
    .map((p) => ({ name: p.name.trim(), dailyBudget: Math.max(0, Number(p.dailyBudget) || 0) }))
    .filter((p) => p.name);
  if (!input.contactName.trim()) throw new Error("Bitte einen Ansprechpartner angeben.");
  // E-Mail ist Pflicht: Ohne sie entsteht nach der Zahlung kein Login für den Kunden.
  const email = normalizeLoginEmail(input.email ?? "");
  if (!LOGIN_EMAIL_RE.test(email) || email.endsWith(".invalid")) throw new Error("Bitte eine gültige E-Mail-Adresse des Empfängers angeben.");
  if (products.length === 0) throw new Error("Bitte mindestens ein Produkt angeben.");

  const pkg: OfferPackage = input.package === "service" ? "service" : "software";
  const vermittlerTyp = input.vermittlerTyp === "makler" ? "makler" : input.vermittlerTyp === "mehrfachvertreter" ? "mehrfachvertreter" : "vertreter";
  if (!input.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
    throw new Error("Bitte ein Startdatum angeben – ab dann läuft die Monatsgebühr.");
  }
  const term = normalizeTerm(input.term);
  const abrechnungstag = parseAbrechnungstag(input.billingDay);
  if (!abrechnungstag.ok) throw new Error(abrechnungstag.error);
  // Empfehlungsrabatt: automatisch für gültig empfohlene Kontakte, vom Admin übersteuerbar
  let discount: { amount: number; label: string; referralId: string } | null = null;
  const wanted = input.setupDiscount;
  if ("salesContactId" in owner && owner.salesContactId) {
    const d = await referralSetupDiscount(owner.salesContactId);
    const amount = wanted !== undefined ? wanted : d?.eligible ? d.amount : null;
    if (amount != null && Number.isFinite(amount) && amount > 0) {
      if (!d) throw new Error("Einen Empfehlungsrabatt gibt es nur für empfohlene Kontakte. Bitte sonst „Setup abweichend“ eintragen.");
      discount = { amount: Math.round(amount * 100) / 100, label: d.label, referralId: d.referralId };
    }
  } else if (wanted != null && wanted > 0) {
    throw new Error("Einen Empfehlungsrabatt gibt es nur für empfohlene Kontakte.");
  }
  const price = computeOfferPrice({
    package: pkg,
    term,
    products,
    setupOverride: input.setupOverride,
    monthlyOverride: input.monthlyOverride,
    seats: input.seats,
    annual: input.annual,
    bestandModule: input.bestandModule,
    empfehlungModule: input.empfehlungModule,
    setupDiscount: discount?.amount ?? null,
  });
  const test = input.test === true;
  if (test) {
    // Testangebot: alle Beträge 0 €, keine Jahreszahlung, kein Startpreis, kein Empfehlungsrabatt
    Object.assign(price, { setupFee: 0, monthlyFee: 0, softwareFee: 0, listSetup: 0, setupDiscount: 0, annual: false, bestandFee: 0, empfehlungFee: 0 });
    input = { ...input, annual: false, introMonthlyFee: null, introMonths: null };
    discount = null;
  }
  // Ist „Setup abweichend“ günstiger, gilt nur dieser (Rabatt wird nicht addiert)
  const discountApplied = discount != null && price.setupDiscount > 0;
  if (price.monthlyFee == null) {
    throw new Error(
      price.seatsIndividual
        ? `Ab ${PRICE_LIST.seatIndividualFrom} aktiven Verkäufern gibt es keinen Listenpreis. Bitte die Monatsgebühr individuell eintragen (inklusive aller Verkäufer).`
        : "Ab 10.000 € Werbebudget gibt es keinen Listenpreis, bitte die Monatsgebühr individuell eintragen.",
    );
  }
  if (input.annual && !prepayPossible(term)) throw new Error("Vorauszahlung geht nur mit 6 oder 12 Monaten Laufzeit.");
  if (input.annual && input.introMonthlyFee != null) throw new Error("Startpreis und Vorauszahlung lassen sich nicht kombinieren.");

  const choosesStart = input.customerChoice !== false;
  // Mit Sonderpreis passt ein anderes Setup nicht zur Vereinbarung → Laufzeit fest.
  const choosesTerm = choosesStart && input.setupOverride == null && input.monthlyOverride == null;

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
        const created = await tx.offer.create({
          data: {
            ...owner,
            number,
            version: (maxVersion._max.version ?? 0) + 1,
            token: crypto.randomBytes(24).toString("base64url"),
            contactName: input.contactName.trim(),
            company: input.company?.trim() || null,
            email,
            street: input.street?.trim() || null,
            zip: input.zip?.trim() || null,
            city: input.city?.trim() || null,
            package: pkg,
            vermittlerTyp,
            term,
            products,
            setupFee: price.setupFee,
            setupListFee: discountApplied ? price.listSetup : null,
            setupDiscount: discountApplied ? discount!.amount : null,
            setupDiscountLabel: discountApplied ? discount!.label : null,
            referralId: discountApplied ? discount!.referralId : null,
            monthlyFee: price.monthlyFee!,
            softwareFee: price.softwareFee,
            // Zusätze (nur Paket mit Software): Logins, Modul, Zahlweise
            seats: pkg === "software" ? price.seats : null,
            seatsIncluded: pkg === "software" ? price.seatsIncluded : null,
            // Ab seatIndividualFrom sind alle Logins im individuellen Preis enthalten (0 €)
            seatMonthly: pkg === "software" ? (price.seatsIndividual || test ? 0 : PRICE_LIST.seatMonthly) : null,
            // Modul gebucht: Monatspreis; null = nicht gebucht
            bestandMonthly: price.bestandActive ? price.bestandFee : null,
            empfehlungMonthly: price.empfehlungActive ? price.empfehlungFee : null,
            // Vorauszahlung angeboten (6 oder 12 Monate): Kunde wählt bei der Annahme, monatlich vorausgewählt
            annualPrepay: false,
            annualChoice: price.annual,
            annualFreeMonths: price.annual ? prepayFreeMonthsFor(term) : null,
            introMonthlyFee: input.introMonthlyFee ?? null,
            introMonths: input.introMonthlyFee != null ? (input.introMonths ?? null) : null,
            specialTerms: test ? "Testangebot: kostenlos, ohne Zahlung. Dient nur zum Ausprobieren und wird danach gelöscht." : input.specialTerms?.trim() || null,
            isTest: test,
            startDate: input.startDate ? new Date(`${input.startDate}T12:00:00Z`) : null,
            billingDay: abrechnungstag.day,
            // „Gratis“ nur mit eigenem Abrechnungstag (sonst gibt es keine Zeit davor)
            billingFreeStart: abrechnungstag.day != null && input.billingFreeStart === true,
            customerChoosesTerm: choosesTerm,
            customerChoosesStart: choosesStart,
            allowPayLater: input.allowPayLater === true && !test,
            allowBankTransfer: input.allowBankTransfer === true && !test,
            bankTransferDays: parseZahlungsziel(input.bankTransferDays),
            abschlussBonus:
              test || !(price.setupFee > 0)
                ? null
                : (() => {
                    const b = Number(input.abschlussBonus ?? 0);
                    return Number.isFinite(b) && b > 0 ? Math.min(b, price.setupFee) : null;
                  })(),
            abschlussBonusBis:
              !test && price.setupFee > 0 && input.abschlussBonus !== 0 && isIsoDate(input.abschlussBonusBis) && input.abschlussBonusBis >= berlinTodayIso()
                ? berlinTagesendeIso(input.abschlussBonusBis)
                : null,
            validUntil,
            termsUrl,
            dpaUrl,
            createdById,
          },
        });
        // Adresse aus dem Angebot in die Stammdaten des Vertriebskontakts übernehmen
        const addr = {
          ...(input.street?.trim() ? { street: input.street.trim() } : {}),
          ...(input.zip?.trim() ? { zip: input.zip.trim() } : {}),
          ...(input.city?.trim() ? { city: input.city.trim() } : {}),
        };
        if ("salesContactId" in owner && owner.salesContactId && Object.keys(addr).length) {
          await tx.salesContact.update({ where: { id: owner.salesContactId }, data: addr });
        }
        return created;
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
  opts: {
    name: string;
    ip: string | null;
    agent: string | null;
    termsAccepted: boolean;
    /** Firma, USt-IdNr. (freiwillig) und Bestätigung „Unternehmer nach § 14 BGB“ (Pflicht, gespeichert). */
    business?: BusinessInput | null;
    /** Häkchen zum Übergang vom Startpreis in die reguläre Vergütung (Pflicht, wenn das Angebot einen Startpreis hat). */
    priceStepAck?: boolean;
    /** Wahl des Kunden (nur wenn im Angebot freigegeben; serverseitig geprüft). */
    term?: string | null;
    startDate?: string | null;
    /** Zahlweise: true = jährlich im Voraus, false = monatlich (nur mit „Jahreszahlung anbieten“); fehlt = Vorauswahl. */
    annual?: boolean | null;
  },
): Promise<AcceptResult> {
  const offer = await getOfferByToken(token);
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  if (offer.status === "accepted") return { ok: true };
  if (offer.status === "superseded") return { ok: false, error: "Dieses Angebot wurde durch eine neuere Version ersetzt." };
  if (offer.status === "declined") return { ok: false, error: "Dieses Angebot ist nicht mehr gültig, melden Sie sich gern bei mir." };
  if (offer.validUntil.getTime() < Date.now()) return { ok: false, error: "Dieses Angebot ist abgelaufen. Bitte fordern Sie ein neues an." };
  if (!offer.termsUrl || !offer.dpaUrl) return { ok: false, error: "Die Online-Annahme ist für dieses Angebot noch nicht freigeschaltet." };
  if (!opts.termsAccepted) return { ok: false, error: "Bitte bestätigen Sie AGB und Auftragsverarbeitungsvertrag." };
  const name = opts.name.trim();
  if (name.length < 3) return { ok: false, error: "Bitte geben Sie Ihren vollständigen Namen ein." };
  const business = checkBusiness(opts.business);
  if (!business.ok) return { ok: false, error: business.error };

  // Laufzeit/Startdatum: Wahl des Kunden prüfen und Preise serverseitig neu berechnen.
  const choice = resolveOfferChoice(
    {
      term: offer.term,
      productCount: Array.isArray(offer.products) ? offer.products.length : 1,
      setupFee: Number(offer.setupFee),
      startIso: offer.startDate ? offer.startDate.toISOString().slice(0, 10) : null,
      annualPrepay: offer.annualPrepay,
      annualFreeMonths: offer.annualFreeMonths,
      annualChoice: offer.annualChoice,
      choosesTerm: offer.customerChoosesTerm,
      choosesStart: offer.customerChoosesStart,
      // 6 Monate zur Wahl erst für Angebote ab dem Livegang (ältere bleiben wie verschickt)
      termOptions: termOptionsFor(offer.createdAt, offer.term),
      setupDiscount: offer.setupDiscount == null ? null : Number(offer.setupDiscount),
      setupListFee: offer.setupListFee == null ? null : Number(offer.setupListFee),
    },
    { term: opts.term, startDate: opts.startDate, annual: opts.annual },
    berlinTodayIso(),
  );
  if (!choice.ok) return { ok: false, error: choice.error };
  const startDate = choice.startIso ? new Date(`${choice.startIso}T12:00:00Z`) : null;
  // Konditionen wie direkt am Annahme-Knopf (Startpreis mit Übergang braucht ein eigenes Häkchen)
  const summary = offerSummaryInput(offer, { term: choice.term, startIso: choice.startIso, setup: choice.setupFee, annual: choice.annualPrepay, freeMonths: choice.annualFreeMonths });
  const priceStep = hasPriceStep(summary);
  if (priceStep && !opts.priceStepAck) return { ok: false, error: "Bitte bestätigen Sie den Übergang vom Startpreis in die reguläre Vergütung." };

  const now = new Date();
  const updated = await prisma.offer.updateMany({
    where: { id: offer.id, status: { in: ["draft", "sent"] } },
    data: {
      status: "accepted",
      acceptedAt: now,
      acceptedName: name.slice(0, 200),
      acceptedIp: opts.ip?.slice(0, 100) ?? null,
      acceptedAgent: opts.agent?.slice(0, 400) ?? null,
      acceptedCompany: business.company,
      acceptedVatId: business.vatId,
      acceptedAsBusiness: true,
      acceptedPriceStep: priceStep,
      // Firma fehlte im Angebot: die bei der Annahme angegebene übernehmen (Rechnung, Stripe)
      ...(offer.company?.trim() ? {} : { company: business.company }),
      term: choice.term,
      setupFee: choice.setupFee,
      ...(offer.setupDiscount != null ? { setupListFee: choice.setupListFee } : {}),
      startDate,
      annualPrepay: choice.annualPrepay,
      annualFreeMonths: choice.annualFreeMonths,
    },
  });
  if (updated.count === 0) return { ok: false, error: "Dieses Angebot kann nicht mehr angenommen werden." };
  // Ab hier mit den angenommenen Werten weiterarbeiten.
  const accepted = { ...offer, term: choice.term, startDate, annualPrepay: choice.annualPrepay, annualFreeMonths: choice.annualFreeMonths };
  const chosenText = `${TERM_SHORT[choice.term]}${offer.annualChoice && prepayPossible(choice.term) ? (choice.annualPrepay ? (choice.term === "6m" ? ", 6 Monate im Voraus" : ", jährlich im Voraus") : ", monatlich") : ""}${startDate ? `, Start ${startDate.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" })}` : ""}`;
  await audit("offer.accept", {
    entity: "Offer",
    entityId: offer.id,
    details: {
      number: offer.number,
      name: name.slice(0, 200),
      ip: opts.ip?.slice(0, 100) ?? null,
      term: choice.term,
      startDate: choice.startIso,
      setupFee: choice.setupFee,
      annualPrepay: choice.annualPrepay,
      annualChoice: offer.annualChoice,
      chosenByCustomer: offer.customerChoosesTerm || offer.customerChoosesStart || offer.annualChoice,
      company: business.company,
      vatId: business.vatId,
      asBusiness: true,
      priceStep,
    },
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
          monthlyValue: Math.round(offerAddOns(offerAddOnsOf(accepted)).monthlyTotal),
          ...(products ? { products } : {}),
          contractStart: startDate ?? now,
        },
      })
      .catch((err) => reportError(err, "offer-accept-contact-update", { offer: offer.number }));
    await logOfferActivity(offer, `Angebot ${offer.number} online angenommen von ${name}: ${chosenText}`, "Kunden-Pipeline: Vertrag");
  } else if (offer.dealId) {
    // Altes Deal-Board (abgeschaltet): nur in der Historie vermerken.
    await logOfferActivity(offer, `Angebot ${offer.number} online angenommen von ${name}: ${chosenText}`);
  }

  // Ohne Online-Zahlung startet das Onboarding direkt mit der Annahme
  // (sonst, sobald die Zahlung eingerichtet ist – siehe Stripe-Webhook). Testangebote laufen nie über Stripe.
  if (!billingEnabled() || offer.isTest) {
    await startOnboarding(offer.id).catch((err) => reportError(err, "onboarding-start", { offer: offer.number }));
  }

  // Auftragsbestätigung mit Datum und Betrag (Startpreis, Laufzeit, Kündigung); Testangebote ohne
  if (!offer.isTest && offer.email) {
    await sendAcceptanceMail({ ...offer, company: offer.company?.trim() || business.company }, summary).catch((err) => reportError(err, "offer-accept-mail", { offer: offer.number }));
  }

  await sendToAdmins({
    title: `✅ Angebot angenommen: ${offer.company ?? offer.contactName}`,
    body: `${offer.number} · ${name}`,
    url: offerAdminHref(offer),
    tag: `offer:${offer.id}`,
  }).catch((err) => reportError(err, "offer-accept-push"));

  return { ok: true };
}

type OfferRecord = NonNullable<Awaited<ReturnType<typeof getOfferByToken>>>;

/** Eingaben für {@link contractSummaryLines} aus einem Angebot (Wahl des Kunden geht vor). */
export function offerSummaryInput(
  offer: Pick<OfferRecord, "term" | "startDate" | "setupFee" | "introMonthlyFee" | "introMonths" | "annualPrepay" | "annualFreeMonths"> &
    Partial<Pick<OfferRecord, "billingDay" | "billingFreeStart">> &
    Parameters<typeof offerAddOnsOf>[0],
  chosen: Partial<{ term: OfferTerm; startIso: string | null; setup: number; annual: boolean; freeMonths: number | null }> = {},
): ContractSummaryInput {
  const add = offerAddOns(offerAddOnsOf(offer));
  const extras = add.monthlyTotal - Number(offer.monthlyFee);
  const intro = offer.introMonthlyFee != null && offer.introMonths ? { months: offer.introMonths, monthly: Math.round((Number(offer.introMonthlyFee) + extras) * 100) / 100 } : null;
  return {
    term: chosen.term ?? normalizeTerm(offer.term),
    startIso: chosen.startIso !== undefined ? chosen.startIso : offer.startDate ? offer.startDate.toISOString().slice(0, 10) : null,
    setup: chosen.setup ?? Number(offer.setupFee),
    monthlyTotal: add.monthlyTotal,
    intro,
    annual: chosen.annual ?? offer.annualPrepay,
    freeMonths: chosen.freeMonths ?? offer.annualFreeMonths ?? prepayFreeMonthsFor(chosen.term ?? offer.term),
    billingDay: offer.billingDay ?? null,
    freeStart: !!offer.billingFreeStart,
  };
}

async function sendAcceptanceMail(offer: OfferRecord, summary: ContractSummaryInput) {
  let url: string | null = null;
  try {
    url = `${getAppUrl()}/angebot/${offer.token}`;
  } catch {
    url = null;
  }
  const res = await sendCustomerMail({
    to: offer.email!,
    subject: `Ihre Auftragsbestätigung ${offer.number}`,
    greeting: await customerGreeting({ salesContactId: offer.salesContactId, contactName: offer.contactName }),
    paragraphs: [
      `vielen Dank für Ihren Auftrag${offer.company ? ` für ${offer.company}` : ""}. Wir bestätigen die Annahme des Angebots ${offer.number} zu diesen Konditionen:`,
      "Die AGB und den Auftragsverarbeitungsvertrag in der bei der Annahme gültigen Fassung finden Sie über den Link zum Angebot. Den Zugang zum Kundenbereich bekommen Sie mit einer eigenen E-Mail.",
    ],
    list: contractSummaryLines(summary),
    ...(url ? { button: { label: "Angebot ansehen", url } } : {}),
  });
  if (!res.ok) reportError(new Error(res.error), "offer-accept-mail", { offer: offer.number });
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
  empfehlungMonthly?: unknown;
  annualPrepay: boolean;
  annualFreeMonths: number | null;
  /** Laufzeit: bestimmt den Vorauszahlungszeitraum (6 oder 12 Monate). */
  term?: string | null;
}) {
  return {
    monthlyFee: Number(o.monthlyFee),
    seats: o.seats,
    seatsIncluded: o.seatsIncluded,
    seatMonthly: o.seatMonthly == null ? null : Number(o.seatMonthly),
    bestandMonthly: o.bestandMonthly == null ? null : Number(o.bestandMonthly),
    empfehlungMonthly: o.empfehlungMonthly == null ? null : Number(o.empfehlungMonthly),
    annualPrepay: o.annualPrepay,
    annualFreeMonths: o.annualFreeMonths,
    term: o.term ?? null,
  };
}
