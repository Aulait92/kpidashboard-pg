// Werte des Angebotsformulars (components/offer-form.tsx) als reine Daten: Standardwerte für ein neues Angebot,
// Vorbefüllen aus einem gespeicherten Entwurf („Bearbeiten“, Ole 20.11.2026) und die Umrechnung in die Eingabe für
// createOffer bzw. updateDraftOffer (lib/offers.ts). Client und Server, ohne Datenbank.

import { UEBERWEISUNG_TAGE_STANDARD } from "@/lib/mahnwesen";
import {
  abschlussBonusStandardTag,
  berlinTodayIso,
  computeOfferPrice,
  defaultStartDate,
  normalizePackage,
  normalizeTerm,
  PPL_SOFTWARE,
  PRICE_LIST,
  prepayPossible,
  type OfferPackage,
  type OfferTerm,
  type OfferVermittler,
} from "@/lib/offer-pricing";
import { ERSTE_WOCHE_STANDARD } from "@/lib/ppl/erste-woche-shared";
import { bezugSteuer, nettoAusBrutto } from "@/lib/ppl/steuer";
import type { OfferFormInput } from "@/lib/offers";

/** Feste Sondervereinbarung eines Testangebots (createOffer setzt sie, beim Bearbeiten nicht ins Feld übernehmen). */
export const TEST_SONDERVEREINBARUNG = "Testangebot: kostenlos, ohne Zahlung. Dient nur zum Ausprobieren und wird danach gelöscht.";

export const ABSCHLUSSBONUS_FORMULAR = 300;

/** Zustand des Formulars (Eingabefelder als Text, wie getippt). */
export type OfferFormWerte = {
  contactName: string;
  company: string;
  email: string;
  street: string;
  zip: string;
  city: string;
  products: { name: string; daily: string }[];
  pkg: OfferPackage;
  term: OfferTerm;
  setupOverride: string;
  discount: string;
  monthlyOverride: string;
  introFee: string;
  introMonths: string;
  specialTerms: string;
  startDate: string;
  billingDay: string;
  billingFree: boolean;
  validDays: string;
  seats: string;
  annual: boolean;
  bestand: boolean;
  empfehlung: boolean;
  vermittler: OfferVermittler;
  customerChoice: boolean;
  customerProducts: boolean;
  allowPayLater: boolean;
  arrears: boolean;
  allowBankTransfer: boolean;
  bankTransferDays: string;
  bonusAn: boolean;
  bonusBetrag: string;
  bonusBis: string;
  test: boolean;
  wocheProdukt: string;
  wocheLabel: string;
  wochePreis: string;
  wocheBrutto: boolean;
  wocheMenge: string;
};

export const num = (v: string): number | null => {
  const n = Number(v.replace(",", "."));
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};

const STANDARD_PRODUKT = { name: "TKV-Katze", daily: "30" };

/** Vorbelegung aus dem Kontakt (neues Angebot). */
export type OfferFormInitial = {
  contactName: string;
  company: string;
  email: string;
  street?: string;
  zip?: string;
  city?: string;
  setupOverride?: string;
  specialTerms?: string;
};

/** Standardwerte eines neuen Angebots. */
export function standardFormWerte(initial: OfferFormInitial, referralDiscount: { amount: number } | null, now = new Date()): OfferFormWerte {
  return {
    contactName: initial.contactName,
    company: initial.company,
    email: initial.email,
    street: initial.street ?? "",
    zip: initial.zip ?? "",
    city: initial.city ?? "",
    products: [{ ...STANDARD_PRODUKT }],
    pkg: "software",
    term: "12m",
    setupOverride: initial.setupOverride ?? "",
    discount: referralDiscount ? String(referralDiscount.amount) : "",
    monthlyOverride: "",
    introFee: "",
    introMonths: "3",
    specialTerms: initial.specialTerms ?? "",
    startDate: defaultStartDate(now),
    billingDay: "",
    billingFree: false,
    validDays: "14",
    seats: String(PRICE_LIST.seatsIncluded),
    annual: false,
    bestand: false,
    empfehlung: false,
    vermittler: "vertreter",
    customerChoice: true,
    customerProducts: true,
    allowPayLater: false,
    arrears: false,
    allowBankTransfer: false,
    bankTransferDays: String(UEBERWEISUNG_TAGE_STANDARD),
    bonusAn: true,
    bonusBetrag: String(ABSCHLUSSBONUS_FORMULAR),
    bonusBis: abschlussBonusStandardTag(now),
    test: false,
    wocheProdukt: "",
    wocheLabel: "",
    wochePreis: "",
    wocheBrutto: false,
    wocheMenge: String(ERSTE_WOCHE_STANDARD),
  };
}

/** Gespeicherter Entwurf (Felder von prisma Offer, Decimal als unknown). */
export type OfferEntwurf = {
  contactName: string;
  company: string | null;
  email: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  package: string;
  vermittlerTyp: string;
  term: string;
  products: unknown;
  setupFee: unknown;
  monthlyFee: unknown;
  introMonthlyFee: unknown;
  introMonths: number | null;
  specialTerms: string | null;
  isTest: boolean;
  startDate: Date | null;
  billingDay: number | null;
  billingFreeStart: boolean;
  paymentInArrears: boolean;
  customerChoosesTerm: boolean;
  customerChoosesStart: boolean;
  customerChoosesProducts: boolean;
  seats: number | null;
  bestandMonthly: unknown;
  empfehlungMonthly: unknown;
  annualPrepay: boolean;
  annualChoice: boolean;
  setupDiscount: unknown;
  allowPayLater: boolean;
  allowBankTransfer: boolean;
  bankTransferDays: number;
  abschlussBonus: unknown;
  abschlussBonusBis: Date | null;
  pplProductKey: string | null;
  pplLabel: string | null;
  pplPrice: unknown;
  pplQuantity: number | null;
  validUntil: Date;
};

const zahl = (v: unknown): number | null => (v == null ? null : Number(v));
const text = (n: number) => String(Math.round(n * 100) / 100);

function produkteAus(raw: unknown): { name: string; dailyBudget: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p) => ({ name: String((p as { name?: unknown })?.name ?? "").trim(), dailyBudget: Number((p as { dailyBudget?: unknown })?.dailyBudget) || 0 }))
    .filter((p) => p.name);
}

/**
 * Formularwerte aus einem gespeicherten Entwurf. Sonderpreise stehen nicht als eigene Felder im Angebot: Sie werden
 * aus der Abweichung vom Listenpreis zurückgerechnet, so dass erneutes Speichern ohne Änderung dieselben Werte ergibt.
 */
export function entwurfZuFormWerte(o: OfferEntwurf, referralDiscount: { amount: number } | null, now = new Date()): OfferFormWerte {
  const pkg = normalizePackage(o.package);
  const term = normalizeTerm(o.term);
  const ppl = pkg === PPL_SOFTWARE;
  const test = o.isTest;
  const produkte = produkteAus(o.products);
  const seats = o.seats ?? PRICE_LIST.seatsIncluded;
  const annual = o.annualChoice || o.annualPrepay;
  const bestand = o.bestandMonthly != null;
  const empfehlung = o.empfehlungMonthly != null;
  // Listenpreis ohne Sonderpreise, um diese zurückzurechnen
  const liste = computeOfferPrice({ package: pkg, term, products: produkte, seats, annual, bestandModule: bestand, empfehlungModule: empfehlung });
  const setupFee = zahl(o.setupFee) ?? 0;
  const monthlyFee = zahl(o.monthlyFee) ?? 0;
  const rabatt = zahl(o.setupDiscount);
  let setupOverride = "";
  let monthlyOverride = "";
  if (!test) {
    if (liste.listMonthly == null || monthlyFee !== liste.listMonthly) monthlyOverride = text(monthlyFee);
    // Mit Empfehlungsrabatt ist der Betrag der Rabatt; ein teureres „Setup abweichend“ hatte keine Wirkung
    if (!ppl && rabatt == null && setupFee !== liste.listSetup) setupOverride = text(setupFee);
    // Sonderpreis gleich Listenpreis: nur an der festen Laufzeit erkennbar (createOffer: choosesTerm)
    if (!ppl && o.customerChoosesStart && !o.customerChoosesTerm && !setupOverride && !monthlyOverride) setupOverride = text(rabatt == null ? setupFee : liste.listSetup);
  }
  const introFee = test ? null : zahl(o.introMonthlyFee);
  const produktWahlMoeglich = pkg === "software" && !test && !setupOverride && !monthlyOverride && introFee == null && !liste.individual;
  const bonus = zahl(o.abschlussBonus);
  const heute = berlinTodayIso(now);
  const bonusBisIso = o.abschlussBonusBis ? berlinTodayIso(o.abschlussBonusBis) : null;
  const tageGueltig = Math.max(1, Math.ceil((o.validUntil.getTime() - now.getTime()) / 86_400_000));
  const vermittler: OfferVermittler = o.vermittlerTyp === "makler" ? "makler" : o.vermittlerTyp === "mehrfachvertreter" ? "mehrfachvertreter" : "vertreter";
  return {
    contactName: o.contactName,
    company: o.company ?? "",
    email: o.email ?? "",
    street: o.street ?? "",
    zip: o.zip ?? "",
    city: o.city ?? "",
    products: produkte.length ? produkte.map((p) => ({ name: p.name, daily: text(p.dailyBudget) })) : [{ ...STANDARD_PRODUKT }],
    pkg,
    term,
    setupOverride,
    discount: referralDiscount ? text(rabatt ?? 0) : "",
    monthlyOverride,
    introFee: introFee == null ? "" : text(introFee),
    introMonths: String(o.introMonths ?? 3),
    specialTerms: test && o.specialTerms === TEST_SONDERVEREINBARUNG ? "" : (o.specialTerms ?? ""),
    startDate: o.startDate ? o.startDate.toISOString().slice(0, 10) : defaultStartDate(now),
    billingDay: o.billingDay == null ? "" : String(o.billingDay),
    billingFree: o.billingFreeStart,
    validDays: String(tageGueltig),
    seats: String(seats),
    annual,
    bestand,
    empfehlung,
    vermittler,
    customerChoice: o.customerChoosesStart,
    // Nur ein bewusst abgewählter Haken zählt; wo die Wahl nicht möglich war, bleibt der Standard (an)
    customerProducts: produktWahlMoeglich ? o.customerChoosesProducts : true,
    allowPayLater: o.allowPayLater,
    arrears: o.paymentInArrears,
    allowBankTransfer: o.allowBankTransfer,
    bankTransferDays: String(o.bankTransferDays),
    // Bonus wird bei Test, Pay-per-Lead oder ohne Einrichtung nicht gespeichert: dort Standard (an) lassen
    bonusAn: bonus != null || test || ppl || !(setupFee > 0),
    bonusBetrag: text(bonus ?? ABSCHLUSSBONUS_FORMULAR),
    bonusBis: bonusBisIso && bonusBisIso >= heute ? bonusBisIso : abschlussBonusStandardTag(now),
    test,
    wocheProdukt: o.pplProductKey ?? "",
    wocheLabel: o.pplLabel ?? "",
    wochePreis: o.pplPrice == null ? "" : text(Number(o.pplPrice)),
    wocheBrutto: false,
    wocheMenge: String(o.pplQuantity ?? ERSTE_WOCHE_STANDARD),
  };
}

/** Preis je Lead der ersten Woche netto (Eingabe brutto nur bei steuerpflichtigen Produkten). */
export function wocheNettoAus(w: Pick<OfferFormWerte, "wocheProdukt" | "wochePreis" | "wocheBrutto">): number | null {
  const p = num(w.wochePreis);
  if (p == null) return null;
  return w.wocheBrutto && bezugSteuer({ productKey: w.wocheProdukt }) === "steuerpflichtig" ? nettoAusBrutto(p) : p;
}

/** Produktwahl durch den Kunden nur zum Listenpreis (wie createOffer). */
export function produktWahlMoeglich(w: OfferFormWerte, individual: boolean): boolean {
  return w.pkg === "software" && !w.test && num(w.setupOverride) == null && num(w.monthlyOverride) == null && num(w.introFee) == null && !individual;
}

/** Vorauszahlung möglich: 6 oder 12 Monate, ohne Startpreis, nicht Pay-per-Lead. */
export function vorauszahlungMoeglich(w: Pick<OfferFormWerte, "pkg" | "term" | "introFee">): boolean {
  return w.pkg !== PPL_SOFTWARE && prepayPossible(w.term) && num(w.introFee) == null;
}

/** Eingabe für createOffer/updateDraftOffer aus den Formularwerten. */
export function formWerteZuInput(w: OfferFormWerte, opts: { referral: boolean; ueberweisungVerfuegbar: boolean }): OfferFormInput {
  const ppl = w.pkg === PPL_SOFTWARE;
  const softwarePkg = w.pkg !== "service";
  const parsedProducts = w.products.map((p) => ({ name: p.name, dailyBudget: num(p.daily) ?? 0 }));
  const annualPossible = vorauszahlungMoeglich(w);
  const price = computeOfferPrice({
    package: w.pkg,
    term: w.term,
    products: parsedProducts,
    setupOverride: num(w.setupOverride),
    monthlyOverride: num(w.monthlyOverride),
    seats: num(w.seats),
    annual: w.annual && prepayPossible(w.term),
    bestandModule: w.bestand && softwarePkg,
    empfehlungModule: w.empfehlung && softwarePkg,
    setupDiscount: opts.referral ? num(w.discount) : null,
  });
  const bonus = w.bonusAn && !w.test && !ppl;
  return {
    contactName: w.contactName,
    company: w.company,
    email: w.email,
    street: w.street,
    zip: w.zip,
    city: w.city,
    package: w.pkg,
    term: w.term,
    products: parsedProducts,
    setupOverride: ppl ? null : num(w.setupOverride),
    // Empfohlener Kontakt: Wert aus dem Feld (0 = bewusst kein Rabatt), sonst automatisch
    setupDiscount: ppl ? null : opts.referral ? (num(w.discount) ?? 0) : undefined,
    monthlyOverride: num(w.monthlyOverride),
    introMonthlyFee: ppl ? null : num(w.introFee),
    introMonths: num(w.introMonths),
    specialTerms: w.specialTerms,
    startDate: w.startDate || null,
    billingDay: num(w.billingDay),
    billingFreeStart: w.billingFree && !!w.billingDay,
    paymentInArrears: w.arrears && !w.test,
    validDays: num(w.validDays) ?? 14,
    seats: softwarePkg ? num(w.seats) : null,
    annual: w.annual && annualPossible,
    bestandModule: w.bestand && softwarePkg,
    empfehlungModule: w.empfehlung && softwarePkg,
    vermittlerTyp: w.vermittler,
    customerChoice: w.customerChoice,
    customerChoosesProducts: w.customerProducts && produktWahlMoeglich(w, price.individual),
    allowPayLater: w.allowPayLater && !w.test && !ppl,
    allowBankTransfer: opts.ueberweisungVerfuegbar && w.allowBankTransfer && !w.test,
    bankTransferDays: num(w.bankTransferDays),
    abschlussBonus: bonus ? (num(w.bonusBetrag) ?? ABSCHLUSSBONUS_FORMULAR) : 0,
    abschlussBonusBis: bonus ? w.bonusBis : null,
    test: w.test,
    ersteWoche: ppl && w.wocheProdukt.trim() ? { productKey: w.wocheProdukt, label: w.wocheLabel || null, price: wocheNettoAus(w), quantity: num(w.wocheMenge) } : null,
  };
}
