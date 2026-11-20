// Angebote / Auftragsbestätigungen (zu einem Vertriebskontakt oder alten Deal): anlegen (Konditionen
// werden eingefroren), per geheimem Link anzeigen, online annehmen.

import { parseZahlungsziel } from "@/lib/mahnwesen";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getAppUrl, sendCustomerMail } from "@/lib/email";
import { LOGIN_EMAIL_RE, normalizeLoginEmail } from "@/lib/login-email";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import {
  berlinTagesendeIso,
  berlinTodayIso,
  isIsoDate,
  computeOfferPrice,
  mitSoftware,
  normalizePackage,
  normalizeTerm,
  PPL_SOFTWARE,
  PPL_SOFTWARE_TERMS,
  offerAddOns,
  PRICE_LIST,
  prepayFreeMonthsFor,
  prepayPossible,
  resolveOfferChoice,
  resolveProduktWahl,
  TERM_SHORT,
  termOptionsFor,
  vorauszahlungMitAnnahme,
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
import { contractSummaryLines, hasPriceStep, NACHTRAEGLICH_MAX_STARTTAG, nachtraeglichStartOk, type ContractSummaryInput } from "@/lib/vertrag-laufzeit";
import { parseAbrechnungstag } from "@/lib/abrechnungstag";
import { ERSTE_WOCHE_MIN, ERSTE_WOCHE_STANDARD, ersteWocheAus, ersteWocheMenge, ersteWocheName } from "@/lib/ppl/erste-woche-shared";
import { normalizeRegisterNummer } from "@/lib/erstinformation-shared";
import { kundenkontoAus, normalizePplModell, PPL_MODELL_KUNDENKONTO, pruefeKundenkontoProdukte, type KundenkontoProdukt } from "@/lib/ppl/kundenkonto";
import { TEST_SONDERVEREINBARUNG } from "@/lib/offer-form-werte";


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
  /**
   * Zahlung nachträglich (Ole, 19.11.2026): Vergütung jeweils nachträglich für den abgelaufenen Leistungsmonat, erste
   * Abbuchung Start + 1 Monat. Nur monatlich: nicht mit Vorauszahlung, Abrechnungstag oder kostenlosem Start.
   */
  paymentInArrears?: boolean;
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
  /**
   * Kunde wählt Produkte und Tagesbudget auf der Angebotsseite (Standard an, Ole 19.11.2026). Nur zum Listenpreis:
   * nicht mit Sonderpreis, Startpreis, Paket „Nur Betreuung“, individuellem Preis oder Testangebot.
   */
  customerChoosesProducts?: boolean;
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
  /**
   * „Ihre erste Woche“ (nur Pay-per-Lead + Software, Ole 20.11.2026; lib/ppl/erste-woche.ts): Lead-Produkt wie im
   * Bezug, Bezeichnung (optional), Preis je Lead netto und vorausgewählte Anzahl (Standard 20, ab 5). Leer = ohne.
   */
  ersteWoche?: { productKey: string; label?: string | null; price: number | null; quantity?: number | null } | null;
  /**
   * Variante von Pay-per-Lead + Software (Ole, 20.11.2026; lib/ppl/kundenkonto.ts): fehlt/„pool“ = bisher (Leads aus
   * unserem Pool, optional erste Woche), „kundenkonto“ = Kampagnen im eigenen Werbekonto des Kunden.
   */
  pplModell?: "pool" | "kundenkonto" | null;
  /** Nur „kundenkonto“: Produkte mit Preis je Lead (Endpreis brutto) und Startmenge, zusammen mindestens 1.500 €. */
  kundenkontoProdukte?: { name: string; preis: unknown; menge: unknown }[] | null;
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

type OfferOwner = { dealId: string } | { salesContactId: string };

/** Fehlermeldung, wenn ein Angebot nicht (mehr) im Entwurf ist und deshalb nicht bearbeitet werden kann. */
export const NUR_ENTWURF_BEARBEITEN =
  "Nur Entwürfe lassen sich bearbeiten. Das Angebot ist schon verschickt oder abgeschlossen, bitte eine neue Version erstellen.";

/**
 * Prüfung und Preisberechnung eines Angebots aus der Formulareingabe, gemeinsam für Anlegen ({@link createOffer}) und
 * Bearbeiten eines Entwurfs ({@link updateDraftOffer}). Liefert die eingefrorenen Konditionen (ohne Nummer, Version,
 * Token, Besitzer) und die Adresse für die Stammdaten des Vertriebskontakts.
 */
async function angebotsDaten(owner: OfferOwner, input: OfferFormInput) {
  const products = input.products
    .map((p) => ({ name: p.name.trim(), dailyBudget: Math.max(0, Number(p.dailyBudget) || 0) }))
    .filter((p) => p.name);
  if (!input.contactName.trim()) throw new Error("Bitte einen Ansprechpartner angeben.");
  // E-Mail ist Pflicht: Ohne sie entsteht nach der Zahlung kein Login für den Kunden.
  const email = normalizeLoginEmail(input.email ?? "");
  if (!LOGIN_EMAIL_RE.test(email) || email.endsWith(".invalid")) throw new Error("Bitte eine gültige E-Mail-Adresse des Empfängers angeben.");
  const pkg: OfferPackage = normalizePackage(input.package);
  // Pay-per-Lead + Software (Ole, 19.11.2026): keine Produkte und kein Werbebudget (Leads kommen per Stück aus Pay-per-Lead)
  const ppl = pkg === PPL_SOFTWARE;
  if (ppl) products.length = 0;
  else if (products.length === 0) throw new Error("Bitte mindestens ein Produkt angeben.");
  const vermittlerTyp = input.vermittlerTyp === "makler" ? "makler" : input.vermittlerTyp === "mehrfachvertreter" ? "mehrfachvertreter" : "vertreter";
  if (!input.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
    throw new Error("Bitte ein Startdatum angeben – ab dann läuft die Monatsgebühr.");
  }
  const term = normalizeTerm(input.term);
  if (ppl && !PPL_SOFTWARE_TERMS.includes(term)) throw new Error("Pay-per-Lead + Software gibt es nur ohne Mindestlaufzeit (monatlich kündbar).");
  if (ppl && (input.introMonthlyFee != null || input.annual)) throw new Error("Pay-per-Lead + Software hat keinen Startpreis und keine Vorauszahlung.");
  const abrechnungstag = parseAbrechnungstag(input.billingDay);
  if (!abrechnungstag.ok) throw new Error(abrechnungstag.error);
  // Variante „Kampagnen im eigenen Werbekonto“ (Ole, 20.11.2026): Produkte mit Preis je Lead und Startpaket ab 1.500 €,
  // ohne erste Woche aus unserem Pool
  const kundenkonto = ppl && normalizePplModell(input.pplModell) === PPL_MODELL_KUNDENKONTO;
  let kundenkontoProdukte: KundenkontoProdukt[] | null = null;
  if (kundenkonto) {
    const k = pruefeKundenkontoProdukte(input.kundenkontoProdukte);
    if (!k.ok) throw new Error(k.error);
    kundenkontoProdukte = k.produkte;
  }
  // Erste Woche (Pay-per-Lead + Software): Produkt, Preis netto, Anzahl
  let ersteWoche: { productKey: string; label: string | null; price: number; quantity: number } | null = null;
  if (ppl && !kundenkonto && input.ersteWoche?.productKey?.trim()) {
    const w = input.ersteWoche;
    const wPrice = Number(w.price);
    if (!Number.isFinite(wPrice) || wPrice <= 0) throw new Error("Bitte einen Preis je Lead für die erste Woche angeben.");
    const quantity = w.quantity == null ? ERSTE_WOCHE_STANDARD : ersteWocheMenge(w.quantity);
    if (quantity == null) throw new Error(`Die erste Woche braucht mindestens ${ERSTE_WOCHE_MIN} Leads.`);
    ersteWoche = { productKey: w.productKey.trim().slice(0, 120), label: w.label?.trim().slice(0, 120) || null, price: Math.round(wPrice * 100) / 100, quantity };
  }
  // Empfehlungsrabatt: automatisch für gültig empfohlene Kontakte, vom Admin übersteuerbar
  let discount: { amount: number; label: string; referralId: string } | null = null;
  const wanted = ppl ? null : input.setupDiscount;
  if (ppl) {
    // keine Einrichtung, also auch kein Empfehlungsrabatt darauf
  } else if ("salesContactId" in owner && owner.salesContactId) {
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
  const nachtraeglich = input.paymentInArrears === true && !test;
  if (nachtraeglich) {
    const fehler = nachtraeglichFehler({ annual: !!input.annual, billingDay: abrechnungstag.day, billingFreeStart: !!input.billingFreeStart, startIso: input.startDate });
    if (fehler) throw new Error(fehler);
  }

  const choosesStart = input.customerChoice !== false;
  // Mit Sonderpreis passt ein anderes Setup nicht zur Vereinbarung → Laufzeit fest.
  const choosesTerm = choosesStart && input.setupOverride == null && input.monthlyOverride == null;
  // Produkte und Tagesbudget: nur zum Listenpreis der Staffel (Ole, 19.11.2026)
  const choosesProducts =
    input.customerChoosesProducts !== false &&
    !test &&
    pkg === "software" &&
    input.setupOverride == null &&
    input.monthlyOverride == null &&
    input.introMonthlyFee == null &&
    !price.individual;

  const { termsUrl, dpaUrl } = legalUrls();
  const validUntil = new Date(Date.now() + (input.validDays ?? 14) * 24 * 60 * 60 * 1000);

  const data = {
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
    seats: mitSoftware(pkg) ? price.seats : null,
    seatsIncluded: mitSoftware(pkg) ? price.seatsIncluded : null,
    // Ab seatIndividualFrom sind alle Logins im individuellen Preis enthalten (0 €)
    seatMonthly: mitSoftware(pkg) ? (price.seatsIndividual || test ? 0 : PRICE_LIST.seatMonthly) : null,
    // Modul gebucht: Monatspreis; null = nicht gebucht
    bestandMonthly: price.bestandActive ? price.bestandFee : null,
    empfehlungMonthly: price.empfehlungActive ? price.empfehlungFee : null,
    // Vorauszahlung angeboten (6 oder 12 Monate): Kunde wählt bei der Annahme, monatlich vorausgewählt
    annualPrepay: false,
    annualChoice: price.annual,
    annualFreeMonths: price.annual ? prepayFreeMonthsFor(term) : null,
    introMonthlyFee: input.introMonthlyFee ?? null,
    introMonths: input.introMonthlyFee != null ? (input.introMonths ?? null) : null,
    specialTerms: test ? TEST_SONDERVEREINBARUNG : input.specialTerms?.trim() || null,
    isTest: test,
    startDate: input.startDate ? new Date(`${input.startDate}T12:00:00Z`) : null,
    billingDay: abrechnungstag.day,
    // „Gratis“ nur mit eigenem Abrechnungstag (sonst gibt es keine Zeit davor)
    billingFreeStart: abrechnungstag.day != null && input.billingFreeStart === true,
    paymentInArrears: nachtraeglich,
    customerChoosesTerm: choosesTerm && !ppl,
    customerChoosesStart: choosesStart,
    customerChoosesProducts: choosesProducts,
    // „Später zahlen“ betrifft die Einrichtung: ohne Einrichtung (Pay-per-Lead + Software) nicht nötig
    allowPayLater: input.allowPayLater === true && !test && !ppl,
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
    // Immer gesetzt (auch leer), damit Bearbeiten die erste Woche auch entfernen kann
    pplProductKey: ersteWoche?.productKey ?? null,
    pplLabel: ersteWoche?.label ?? null,
    pplPrice: ersteWoche?.price ?? null,
    pplQuantity: ersteWoche?.quantity ?? null,
    pplAutoRenew: true,
    // Variante gespeichert, damit die spätere wöchentliche Abrechnung sie findet (null = bisher)
    pplModell: kundenkonto ? PPL_MODELL_KUNDENKONTO : null,
    pplProdukte: kundenkontoProdukte ?? Prisma.DbNull,
    validUntil,
    termsUrl,
    dpaUrl,
  };
  // Adresse aus dem Angebot in die Stammdaten des Vertriebskontakts übernehmen
  const addr = {
    ...(input.street?.trim() ? { street: input.street.trim() } : {}),
    ...(input.zip?.trim() ? { zip: input.zip.trim() } : {}),
    ...(input.city?.trim() ? { city: input.city.trim() } : {}),
  };
  return { data, addr };
}

async function adresseUebernehmen(tx: Prisma.TransactionClient, owner: OfferOwner, addr: { street?: string; zip?: string; city?: string }) {
  if ("salesContactId" in owner && owner.salesContactId && Object.keys(addr).length) {
    await tx.salesContact.update({ where: { id: owner.salesContactId }, data: addr });
  }
}

export async function createOffer(target: OfferTarget, input: OfferFormInput, createdById: string | null) {
  const owner: OfferOwner = "dealId" in target ? { dealId: target.dealId } : { salesContactId: target.salesContactId };
  const { data, addr } = await angebotsDaten(owner, input);
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
            ...data,
            createdById,
          },
        });
        await adresseUebernehmen(tx, owner, addr);
        return created;
      });
    } catch (err) {
      const unique = err instanceof Error && /Unique constraint|P2002/.test(err.message);
      if (!unique || attempt === 2) throw err;
    }
  }
  throw new Error("Angebotsnummer konnte nicht vergeben werden.");
}

/**
 * Entwurf bearbeiten (Ole, 20.11.2026): gleiche Nummer, gleicher Link (Token), gleiche Version; Prüfung und
 * Preisberechnung wie beim Anlegen. Nur solange das Angebot beim Speichern noch ein Entwurf ist (atomar), verschickte
 * Angebote bekommen eine neue Version.
 */
export async function updateDraftOffer(offerId: string, input: OfferFormInput) {
  const existing = await prisma.offer.findUnique({ where: { id: offerId }, select: { id: true, status: true, dealId: true, salesContactId: true } });
  if (!existing) throw new Error("Angebot nicht gefunden.");
  if (existing.status !== "draft") throw new Error(NUR_ENTWURF_BEARBEITEN);
  const owner: OfferOwner | null = existing.salesContactId
    ? { salesContactId: existing.salesContactId }
    : existing.dealId
      ? { dealId: existing.dealId }
      : null;
  if (!owner) throw new Error("Angebot nicht gefunden.");
  const { data, addr } = await angebotsDaten(owner, input);
  return prisma.$transaction(async (tx) => {
    const res = await tx.offer.updateMany({ where: { id: offerId, status: "draft" }, data });
    if (res.count === 0) throw new Error(NUR_ENTWURF_BEARBEITEN);
    await adresseUebernehmen(tx, owner, addr);
    return tx.offer.findUniqueOrThrow({ where: { id: offerId } });
  });
}

/** Produkte aus Offer.products (Json) als Liste; Unbrauchbares fällt weg. */
export function offerProductList(raw: unknown): OfferProduct[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => ({ name: String((p as { name?: unknown })?.name ?? "").trim(), dailyBudget: Number((p as { dailyBudget?: unknown })?.dailyBudget) || 0 }))
    .filter((p) => p.name);
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
    /** Produkte mit Tagesbudget (nur mit customerChoosesProducts; serverseitig geprüft, Preis neu nach Staffel); fehlt = wie im Angebot. */
    products?: unknown;
    /** Erste Woche (nur Angebote mit erster Woche): Anzahl (ab 5), jede Woche wiederholen, Registernummer (Pflicht). */
    ersteWoche?: { quantity?: unknown; autoRenew?: boolean | null; registerNr?: string | null } | null;
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

  // Erste Woche (Ole, 20.11.2026): Anzahl ab 5, Registernummer Pflicht (Format D-XXXX-XXXXX-XX)
  const ersteWoche = ersteWocheAus(offer);
  let ersteWocheWahl: { quantity: number; autoRenew: boolean; registerNr: string } | null = null;
  if (ersteWoche) {
    const quantity = opts.ersteWoche?.quantity == null ? ersteWoche.quantity : ersteWocheMenge(opts.ersteWoche.quantity);
    if (quantity == null) return { ok: false, error: `Bitte mindestens ${ERSTE_WOCHE_MIN} Leads für die erste Woche wählen.` };
    const registerNr = normalizeRegisterNummer(opts.ersteWoche?.registerNr);
    if (!registerNr) return { ok: false, error: "Bitte Ihre Registernummer so angeben, wie sie im Vermittlerregister steht, z. B. D-XXXX-XXXXX-XX." };
    ersteWocheWahl = { quantity, autoRenew: opts.ersteWoche?.autoRenew !== false, registerNr };
  }

  // Produkte und Tagesbudget: Wahl prüfen, Monatsgebühr nach Staffel neu (Ole, 19.11.2026)
  const produktWahl = resolveProduktWahl(
    { products: offerProductList(offer.products), monthlyFee: Number(offer.monthlyFee), choosesProducts: offer.customerChoosesProducts },
    opts.products,
  );
  if (!produktWahl.ok) return { ok: false, error: produktWahl.error };
  // Ab hier gelten die gewählten Produkte und die neue Monatsgebühr (Zusammenfassung, Mail, Kontakt, Stripe aus der DB)
  const offerEff: typeof offer = produktWahl.geaendert ? { ...offer, products: produktWahl.products, monthlyFee: new Prisma.Decimal(produktWahl.monthlyFee) } : offer;

  // Laufzeit/Startdatum: Wahl des Kunden prüfen und Preise serverseitig neu berechnen.
  const choice = resolveOfferChoice(
    {
      term: offer.term,
      productCount: produktWahl.products.length || 1,
      setupFee: Number(offer.setupFee),
      startIso: offer.startDate ? offer.startDate.toISOString().slice(0, 10) : null,
      annualPrepay: offer.annualPrepay,
      annualFreeMonths: offer.annualFreeMonths,
      annualChoice: offer.annualChoice,
      choosesTerm: offer.customerChoosesTerm,
      choosesStart: offer.customerChoosesStart,
      // 6 Monate zur Wahl erst für Angebote ab dem Livegang (ältere bleiben wie verschickt)
      termOptions: termOptionsFor(offer.createdAt, offer.term, offer.package),
      package: offer.package,
      setupDiscount: offer.setupDiscount == null ? null : Number(offer.setupDiscount),
      setupListFee: offer.setupListFee == null ? null : Number(offer.setupListFee),
    },
    { term: opts.term, startDate: opts.startDate, annual: opts.annual },
    berlinTodayIso(),
  );
  if (!choice.ok) return { ok: false, error: choice.error };
  if (offer.paymentInArrears && (choice.annualPrepay || !nachtraeglichStartOk(choice.startIso))) {
    return { ok: false, error: choice.annualPrepay ? "Bei nachträglicher Zahlung ist nur monatliche Zahlung möglich." : `Bei nachträglicher Zahlung wählen Sie bitte einen Start zwischen dem 1. und ${NACHTRAEGLICH_MAX_STARTTAG}. eines Monats.` };
  }
  const startDate = choice.startIso ? new Date(`${choice.startIso}T12:00:00Z`) : null;
  // Konditionen wie direkt am Annahme-Knopf (Startpreis mit Übergang braucht ein eigenes Häkchen)
  const summary = offerSummaryInput(offerEff, { term: choice.term, startIso: choice.startIso, setup: choice.setupFee, annual: choice.annualPrepay, freeMonths: choice.annualFreeMonths, ersteWoche: ersteWocheWahl });
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
      // Vorauszahlung mit der Annahme fällig (Ole, 19.11.2026): Setup und erster Zeitraum auf einer Rechnung (lib/billing.ts)
      prepayAtAcceptance: choice.annualPrepay,
      ...(produktWahl.geaendert ? { products: produktWahl.products, monthlyFee: produktWahl.monthlyFee } : {}),
      ...(ersteWocheWahl ? { pplQuantity: ersteWocheWahl.quantity, pplAutoRenew: ersteWocheWahl.autoRenew, pplRegisterNr: ersteWocheWahl.registerNr } : {}),
    },
  });
  if (updated.count === 0) return { ok: false, error: "Dieses Angebot kann nicht mehr angenommen werden." };
  // Ab hier mit den angenommenen Werten weiterarbeiten.
  const accepted = { ...offerEff, term: choice.term, startDate, annualPrepay: choice.annualPrepay, annualFreeMonths: choice.annualFreeMonths };
  const produktText = produktWahl.geaendert ? `${produktWahl.products.map((p) => `${p.name} ${p.dailyBudget} €/Tag`).join(", ")}, ` : "";
  const chosenText = `${produktText}${TERM_SHORT[choice.term]}${offer.annualChoice && prepayPossible(choice.term) ? (choice.annualPrepay ? (choice.term === "6m" ? ", 6 Monate im Voraus" : ", jährlich im Voraus") : ", monatlich") : ""}${startDate ? `, Start ${startDate.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" })}` : ""}${ersteWocheWahl ? `, erste Woche ${ersteWocheWahl.quantity} Leads${ersteWocheWahl.autoRenew ? " (jede Woche)" : ""}, Registernummer ${ersteWocheWahl.registerNr}` : ""}`;
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
      chosenByCustomer: offer.customerChoosesTerm || offer.customerChoosesStart || offer.annualChoice || produktWahl.geaendert,
      ...(produktWahl.geaendert ? { products: produktWahl.products, monthlyFee: produktWahl.monthlyFee } : {}),
      ...(ersteWocheWahl ? { ersteWoche: ersteWocheWahl } : {}),
      ...(offer.pplModell ? { pplModell: offer.pplModell } : {}),
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
    const products = offerProductList(offerEff.products).map((p) => p.name).join(", ");
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

  // Variante „Kampagnen im eigenen Werbekonto“: Bei der Annahme wird nichts zusätzlich abgebucht, nur das Software-Abo
  // läuft wie bei Pay-per-Lead + Software (Stripe, ab Start). TODO(wöchentliche Abrechnung, noch nicht gebaut): Leads
  // der Vorwoche × Preis abzüglich Meta-Kosten per Lastschrift (lib/ppl/kundenkonto.ts wochenAbrechnung); in Monaten mit
  // Software inklusive (softwareInklusive, ab 1.500 € Leadumsatz) die schon abgebuchte Software dort verrechnen
  // (rechnungsPositionen: Software als eigene Position, Leadteil entsprechend kleiner).
  // Ohne Online-Zahlung startet das Onboarding direkt mit der Annahme
  // (sonst, sobald die Zahlung eingerichtet ist – siehe Stripe-Webhook). Testangebote laufen nie über Stripe.
  if (!billingEnabled() || offer.isTest) {
    await startOnboarding(offer.id).catch((err) => reportError(err, "onboarding-start", { offer: offer.number }));
  }

  // Auftragsbestätigung mit Datum und Betrag (Startpreis, Laufzeit, Kündigung); Testangebote ohne
  if (!offer.isTest && offer.email) {
    await sendAcceptanceMail({ ...offerEff, company: offer.company?.trim() || business.company }, summary).catch((err) => reportError(err, "offer-accept-mail", { offer: offer.number }));
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
    Partial<Pick<OfferRecord, "billingDay" | "billingFreeStart" | "acceptedAt" | "prepayAtAcceptance" | "paymentInArrears" | "package" | "pplProductKey" | "pplLabel" | "pplPrice" | "pplQuantity" | "pplAutoRenew" | "pplModell" | "pplProdukte">> &
    Parameters<typeof offerAddOnsOf>[0],
  chosen: Partial<{ term: OfferTerm; startIso: string | null; setup: number; annual: boolean; freeMonths: number | null; ersteWoche: { quantity: number; autoRenew: boolean } | null }> = {},
): ContractSummaryInput {
  const add = offerAddOns(offerAddOnsOf(offer));
  // Erste Woche (Pay-per-Lead + Software): Wahl des Kunden geht vor, sonst wie im Angebot
  const w = ersteWocheAus(offer);
  const ersteWoche = w
    ? { productKey: w.productKey, name: ersteWocheName(w), price: w.price, quantity: chosen.ersteWoche?.quantity ?? w.quantity, autoRenew: chosen.ersteWoche?.autoRenew ?? offer.pplAutoRenew ?? true }
    : null;
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
    prepayAtAcceptance: vorauszahlungMitAnnahme(offer),
    paymentInArrears: !!offer.paymentInArrears,
    paket: offer.package ?? null,
    ersteWoche,
    kundenkonto: kundenkontoAus(offer),
  };
}

/**
 * Zahlung nachträglich (Ole, 19.11.2026) nur monatlich: nicht mit Vorauszahlung, eigenem Abrechnungstag oder kostenlosem
 * Start; Start am 1. bis 28. (sonst verschiebt Stripe die Abbuchung in kurzen Monaten). null = passt.
 */
export function nachtraeglichFehler(o: { annual: boolean; billingDay: number | null | undefined; billingFreeStart?: boolean; startIso?: string | null }): string | null {
  if (o.annual) return "Zahlung nachträglich geht nur mit monatlicher Zahlung, nicht mit Vorauszahlung.";
  if (o.billingDay != null || o.billingFreeStart) return "Zahlung nachträglich lässt sich nicht mit eigenem Abrechnungstag oder kostenlosem Start kombinieren.";
  if (!nachtraeglichStartOk(o.startIso)) return `Bei Zahlung nachträglich bitte einen Start zwischen dem 1. und ${NACHTRAEGLICH_MAX_STARTTAG}. eines Monats wählen.`;
  return null;
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
