import { CheckCircle2 } from "lucide-react";
import { InfoHinweis } from "@/components/info-hinweis";
import { PREISSTUFE_ERKLAERT } from "@/lib/begriffe";
import { LegalSections } from "@/components/legal-sections";
import { AGB, PPL_KUNDENKONTO_BEDINGUNGEN, PPL_NUR_LEADS_BEDINGUNGEN, PROVIDER } from "@/lib/legal-texts";
import {
  beispielRechnung,
  KUNDENKONTO_ABRECHNUNG,
  KUNDENKONTO_BUDGET,
  KUNDENKONTO_NAME,
  KUNDENKONTO_OBERGRENZE,
  KUNDENKONTO_VORAUSSETZUNG,
  kundenkontoAus,
  MINDESTBESTELLUNG_KUNDENKONTO,
  startMengeText,
  type KundenkontoAngebot,
} from "@/lib/ppl/kundenkonto";
import {
  betreuungsSatz,
  computeOfferPrice,
  eur,
  PPL_SOFTWARE,
  PPL_NUR_LEADS,
  normalizeTerm,
  staffelDesPreises,
  TERM_MONTHS,
  termOptionsFor,
  vorauszahlungBetraege,
  VORAUSZAHLUNG,
  offerAddOns,
  offerSetupDiscount,
  PRICE_LIST,
  bestandPacksText,
  setupForChoice,
  tierStaffelText,
  vatOf,
  vorauszahlungMitAnnahme,
  withVat,
  type OfferProduct,
  type OfferTerm,
} from "@/lib/offer-pricing";
// Ab wann und für welche Produkte die Garantien gelten (gleiche Regel wie die automatische Prüfung)
import { GUARANTEES_FROM, angebotMitGarantien, garantieDatum, isGuaranteeProduct } from "@/lib/garantien";
import { VERTRAGS_GARANTIE_MIN_VERTRAEGE, breakEvenTageFuer, vertragTageFuer } from "@/lib/rechner";
import { abrechnungsplan, abrechnungstagSaetze } from "@/lib/abrechnungstag";
import { ersteWocheAus, ersteWocheBetrag, ersteWocheName, ersteWocheSteuerKurz, ersteWocheZahlen, eurCent, ERSTE_WOCHE_ABBUCHUNG } from "@/lib/ppl/erste-woche-shared";
import { bruttoJeLead } from "@/lib/ppl/steuer";
import { addMonthsIso, fmtIso, nachtraeglichErsteIso, nachtraeglichLeistungsmonat, PPL_LEADS_SEPARAT, PPL_NUR_LEADS_REKLAMATION, PPL_NUR_LEADS_SEPARAT, PPL_REKLAMATION, vorauszahlungFaellig, VORAUSZAHLUNG_MIT_ANNAHME } from "@/lib/vertrag-laufzeit";

// Angebot / Auftragsbestätigung im Performancegrowth-Design (dunkles Deckblatt,
// nummerierte Abschnitte, AGB als Bestandteil). Genutzt auf der öffentlichen
// Angebotsseite und im PDF (Druckansicht).

export type OfferDoc = {
  number: string;
  version: number;
  status: string;
  contactName: string;
  company: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  package: string;
  /** "vertreter" | "makler" (Alt-Angebote: vertreter) */
  vermittlerTyp: string;
  term: string;
  products: unknown;
  setupFee: number;
  monthlyFee: number;
  softwareFee: number;
  introMonthlyFee: number | null;
  introMonths: number | null;
  specialTerms: string | null;
  startDate: Date | null;
  validUntil: Date;
  createdAt: Date;
  acceptedAt: Date | null;
  acceptedName: string | null;
  termsUrl: string | null;
  dpaUrl: string | null;
  /** Zusätze (null = Alt-Angebot ohne Platz-Abrechnung). */
  seats: number | null;
  seatsIncluded: number | null;
  seatMonthly: number | null;
  bestandMonthly: number | null;
  /** Modul „Empfehlungen & Bewertungen“ (fehlt bei Alt-Angeboten). */
  empfehlungMonthly?: number | null;
  annualPrepay: boolean;
  annualFreeMonths: number | null;
  /** Jahreszahlung angeboten: Kunde wählt bei der Annahme monatlich oder jährlich im Voraus (nur mit 12 Monaten). */
  annualChoice?: boolean;
  /** Kunde wählt Laufzeit bzw. Startdatum bei der Annahme (vorher = Vorschlag). */
  customerChoosesTerm?: boolean;
  customerChoosesStart?: boolean;
  /** Kunde wählt Produkte und Tagesbudget bei der Annahme (Ole, 19.11.2026; Werte hier = Vorschlag). */
  customerChoosesProducts?: boolean;
  /** Empfehlungsrabatt: Listenpreis der Einrichtung, vereinbarter Rabatt, Zeile im Angebot. */
  setupListFee?: number | null;
  setupDiscount?: number | null;
  setupDiscountLabel?: string | null;
  /** Abrechnungstag (1 bis 28, null = wie Start) und kostenloser Start bis dahin (lib/abrechnungstag.ts). */
  billingDay?: number | null;
  billingFreeStart?: boolean;
  /** Vorauszahlung mit der Annahme fällig (seit 19.11.2026; Annahmen davor: zum Start). */
  prepayAtAcceptance?: boolean;
  /** Zahlung nachträglich für den abgelaufenen Leistungsmonat (Ole, 19.11.2026; nur monatlich). */
  paymentInArrears?: boolean;
  /** „Ihre erste Woche“ (Pay-per-Lead + Software, Ole 20.11.2026; lib/ppl/erste-woche-shared.ts). */
  pplProductKey?: string | null;
  pplLabel?: string | null;
  pplPrice?: unknown;
  pplQuantity?: number | null;
  /** Variante „Kampagnen im eigenen Werbekonto“ (Ole, 20.11.2026; lib/ppl/kundenkonto.ts). */
  pplModell?: string | null;
  pplProdukte?: unknown;
};

type OfferRow = Omit<OfferDoc, "setupFee" | "monthlyFee" | "softwareFee" | "introMonthlyFee" | "seatMonthly" | "bestandMonthly" | "empfehlungMonthly" | "seats" | "seatsIncluded" | "annualPrepay" | "annualFreeMonths" | "vermittlerTyp" | "setupListFee" | "setupDiscount"> & {
  setupListFee?: unknown;
  setupDiscount?: unknown;
  vermittlerTyp?: string | null;
  setupFee: unknown;
  monthlyFee: unknown;
  softwareFee: unknown;
  introMonthlyFee: unknown;
  seats?: number | null;
  seatsIncluded?: number | null;
  seatMonthly?: unknown;
  bestandMonthly?: unknown;
  empfehlungMonthly?: unknown;
  annualPrepay?: boolean;
  annualFreeMonths?: number | null;
};

/** Datenbank-Zeile (Decimal) → Darstellungsobjekt (number). */
export function toOfferDoc(o: OfferRow): OfferDoc {
  return {
    ...o,
    vermittlerTyp: o.vermittlerTyp === "makler" ? "makler" : "vertreter",
    setupFee: Number(o.setupFee),
    monthlyFee: Number(o.monthlyFee),
    softwareFee: Number(o.softwareFee),
    introMonthlyFee: o.introMonthlyFee == null ? null : Number(o.introMonthlyFee),
    seats: o.seats ?? null,
    seatsIncluded: o.seatsIncluded ?? null,
    seatMonthly: o.seatMonthly == null ? null : Number(o.seatMonthly),
    bestandMonthly: o.bestandMonthly == null ? null : Number(o.bestandMonthly),
    empfehlungMonthly: o.empfehlungMonthly == null ? null : Number(o.empfehlungMonthly),
    annualPrepay: !!o.annualPrepay,
    annualFreeMonths: o.annualFreeMonths ?? null,
    setupListFee: o.setupListFee == null ? null : Number(o.setupListFee),
    setupDiscount: o.setupDiscount == null ? null : Number(o.setupDiscount),
    setupDiscountLabel: o.setupDiscountLabel ?? null,
  };
}

export function offerProducts(products: unknown): OfferProduct[] {
  return Array.isArray(products)
    ? (products as OfferProduct[]).filter((p) => p && typeof p.name === "string")
    : [];
}

const TZ = "Europe/Berlin";
const date = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const dateTime = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);

/** Klarer Überblick: monatliche Gesamtkosten inkl. Werbebudget, netto und brutto. */
function MonthlyOverview({
  feeNet,
  adNet,
  serviceOnly,
  annual,
  halbjahr = false,
  intro,
}: {
  feeNet: number;
  adNet: number;
  serviceOnly: boolean;
  annual: boolean;
  /** Vorauszahlung für 6 Monate statt jährlich */
  halbjahr?: boolean;
  intro: { months: number; fee: number } | null;
}) {
  const totalNet = feeNet + adNet;
  const row = "grid grid-cols-2 gap-x-4 gap-y-1 py-3 text-[15px] sm:grid-cols-[1fr_9rem_9rem] sm:items-baseline";
  const num = "whitespace-nowrap tabular-nums sm:text-right";
  const cell = (label: string, value: string, strong = false) => (
    <span className={num}>
      <span className="mr-1 text-xs font-normal text-[#6B7280] sm:hidden">{label}</span>
      <span className={strong ? "font-semibold" : undefined}>{value}</span>
    </span>
  );
  return (
    <div className="mt-8 overflow-hidden rounded-xl border-2 border-[#2563EB]/30 bg-[#F5F8FF]" data-offer-monthly-overview>
      <div className="border-b border-[#2563EB]/20 px-5 py-3 text-[15px] font-semibold text-[#111827]">Ihre monatlichen Kosten im Überblick</div>
      <div className="px-5">
        <div className="hidden grid-cols-[1fr_9rem_9rem] gap-x-4 pt-3 text-xs font-medium uppercase tracking-wide text-[#6B7280] sm:grid">
          <span />
          <span className="text-right">netto</span>
          <span className="text-right">brutto</span>
        </div>
        <div className={row}>
          <span className="col-span-2 sm:col-span-1">
            {serviceOnly ? "Betreuung" : "Betreuung + Software"}{" "}
            <span className="text-[#6B7280]">(an performancegrowth{annual ? `, ${halbjahr ? "6 Monate" : "jährlich"} im Voraus, je Monat umgerechnet` : ""})</span>
          </span>
          {cell("netto", eur(feeNet))}
          {cell("brutto", eur(withVat(feeNet)))}
        </div>
        <div className={`${row} border-t border-[#2563EB]/10`}>
          <span className="col-span-2 sm:col-span-1">
            Werbebudget <span className="text-[#6B7280]">(zahlen Sie direkt an Meta)</span>
          </span>
          {cell("netto", `≈ ${eur(adNet)}`)}
          {cell("brutto", `≈ ${eur(withVat(adNet))}*`)}
        </div>
        <div className={`${row} border-t-2 border-[#2563EB]/30 font-semibold text-[#111827]`}>
          <span className="col-span-2 sm:col-span-1">Gesamt pro Monat</span>
          {cell("netto", `≈ ${eur(totalNet)}`, true)}
          {cell("brutto", `≈ ${eur(withVat(feeNet) + withVat(adNet))}`, true)}
        </div>
      </div>
      <p className="border-t border-[#2563EB]/20 px-5 py-3 text-xs leading-relaxed text-[#6B7280]">
        {intro ? `In den ersten ${intro.months} Monaten gilt der Startpreis von ${eur(intro.fee)} netto (${eur(withVat(intro.fee))} brutto) statt der oben genannten Vergütung. ` : ""}
        Brutto = inkl. 19 % USt. * Versicherungsvermittler sind in der Regel nicht zum Vorsteuerabzug berechtigt. Auf das Werbebudget fällt dann zusätzlich 19 % USt. an
        (von Meta berechnet bzw. als Reverse-Charge). Mit Vorsteuerabzug gilt der Nettobetrag. Das Werbebudget richtet sich nach Ihrem gewählten
        Tagesbudget × 30 Tage und lässt sich jederzeit anpassen.
      </p>
    </div>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const SHORT_NAME = PROVIDER.name.replace(" (haftungsbeschränkt)", "");
export const PROVIDER_FOOTER = `${SHORT_NAME} · ${PROVIDER.street} · ${PROVIDER.city}`;

export function OfferDocument({
  offer,
  part = "all",
  collapseAgb = false,
}: {
  offer: OfferDoc;
  part?: "all" | "cover" | "body";
  /** Web-Ansicht: AGB zugeklappt (PDF: immer ausgeschrieben). */
  collapseAgb?: boolean;
}) {
  const products = offerProducts(offer.products);
  const term: OfferTerm = normalizeTerm(offer.term);
  const serviceOnly = offer.package === "service";
  // Pay-per-Lead + Software (Ole, 19.11.2026): nur Software, keine Einrichtung, kein Werbebudget, keine Garantien
  const ppl = offer.package === PPL_SOFTWARE || offer.package === PPL_NUR_LEADS;
  // „Nur Leads“ (Ole, 24.11.2026): Leads per Stück ohne Software, ohne Monatsgebühr, ohne Laufzeit
  const nurLeads = offer.package === PPL_NUR_LEADS;
  // Abschnitt 2.2 Garantie(n) gibt es nur in Angeboten vor GUARANTEES_UNTIL (Ole, 22.11.2026: ohne Garantie verkaufen)
  const mitGarantieAbschnitt =
    !ppl && angebotMitGarantien(garantieDatum(offer)) && (garantieDatum(offer) < GUARANTEES_FROM || products.some((p) => isGuaranteeProduct(p.name)));
  const paketName = ppl ? "Software" : serviceOnly ? "Betreuung" : "Betreuung + Software";
  const list = computeOfferPrice({ package: serviceOnly ? "service" : "software", term, products });
  const extra = Math.max(0, products.length - 1);
  // Empfehlungsrabatt: Listenpreis durchgestrichen, eigene Zeile „Empfehlungsrabatt (empfohlen von …)“
  const disc = offerSetupDiscount(offer);
  const discLabel = offer.setupDiscountLabel || "Empfehlungsrabatt";
  const setupIsList = disc != null || Math.abs(list.setupFee - offer.setupFee) < 0.01;
  const choiceDiscount = offer.setupDiscount ?? null;
  // Angenommene Angebote zum alten Listenpreis (bis 18.11.2026) behalten ihre Staffel (Preisstaffel laut Angebot)
  const staffel = serviceOnly ? null : staffelDesPreises(list.monthlyBudget, list.extraProducts + 1, offer.monthlyFee);
  const monthlyIsList = serviceOnly ? list.monthlyFee != null && Math.abs(list.monthlyFee - offer.monthlyFee) < 0.01 : staffel != null;
  const budgetSatz = betreuungsSatz({ package: offer.package, monthlyBudget: list.monthlyBudget, productCount: list.extraProducts + 1, monthlyFee: offer.monthlyFee });
  const add = offerAddOns(offer);
  // Vor der Annahme: Laufzeit/Start wählt der Kunde unten selbst (Werte hier = Vorschlag).
  const open = offer.status === "draft" || offer.status === "sent";
  // Erste Woche (Pay-per-Lead + Software mit Lead-Produkt): Menge, Preis je Lead, Summe, Steuer
  const ersteW = ppl ? ersteWocheAus(offer) : null;
  // Kampagnen im eigenen Werbekonto (Ole, 20.11.2026): Startpaket und Software inklusive statt erster Woche
  const kk = kundenkontoAus(offer);
  const woche = ersteW ? ersteWocheZahlen(ersteW) : null;
  const wocheSub =
    ersteW && woche
      ? `${ersteW.quantity} Leads ${ersteWocheName(ersteW)} à ${eurCent(woche.jeLead)}, ${woche.steuer === "steuerfrei_4_11" ? "umsatzsteuerfrei für geprüfte Vermittler" : ersteWocheSteuerKurz(woche.steuer)} · ${open ? "Anzahl wählen Sie bei der Annahme" : "keine Einrichtungsgebühr"}`
      : "";
  const termOpen = open && !!offer.customerChoosesTerm;
  const startOpen = open && !!offer.customerChoosesStart;
  const produkteOpen = open && !!offer.customerChoosesProducts;
  // Vorauszahlung zur Wahl (Ole, 18.11.2026): vor der Annahme beide Beträge, danach die Wahl des Kunden.
  // 12 Monate: jährlich im Voraus (3 geschenkt, PRICE_LIST.annualFreeMonths), 6 Monate: 6 Monate im Voraus (1 geschenkt), eine Rechnung.
  const annualOpen = open && !!offer.annualChoice && !add.annual;
  // Vorauszahlung mit der Annahme fällig, Laufzeit ab Start (Ole, 19.11.2026); ältere Annahmen: zum Start
  const mitAnnahme = vorauszahlungMitAnnahme(offer);
  const pm = add.prepayMonths;
  const halb = pm === 6;
  const vorausName = halb ? "6 Monate im Voraus" : "jährlich im Voraus";
  const v = vorauszahlungBetraege(add.monthlyTotal, term, offer.annualFreeMonths);
  const geschenkt = (n: number) => `${n} ${n === 1 ? "Monat" : "Monate"} geschenkt`;
  // 12 Monate: Wortlaut wie bisher („Jahreszahlung“), 6 Monate: „Vorauszahlung“
  const vorausWort = halb ? "Vorauszahlung" : "Jahreszahlung";
  const hasExtras = add.seatsFee > 0 || add.bestandFee > 0 || add.empfehlungFee > 0;
  const hasIntro = offer.introMonthlyFee != null && !!offer.introMonths;
  // Erster Monatsbetrag inkl. Zusätze (Startpreis gilt nur für das Paket)
  const firstMonth = round2((hasIntro ? offer.introMonthlyFee! : offer.monthlyFee) + add.seatsFee + add.bestandFee + add.empfehlungFee);
  const firstCharge = add.annualTotal ?? firstMonth;
  // Eigener Abrechnungstag: erste Abbuchung am ersten Abrechnungstag, Zeit davor kostenlos oder anteilig.
  // Vorauszahlung: Abrechnungstag gilt nicht, voller Betrag zum Start (Ole, 18.11.2026)
  const startIso = offer.startDate ? offer.startDate.toISOString().slice(0, 10) : null;
  const plan = abrechnungsplan({
    startIso,
    billingDay: offer.billingDay,
    freeStart: offer.billingFreeStart,
    annual: add.annualTotal != null,
  });
  const billingDiffers = !!plan?.differs;
  // Zahlung nachträglich (Ole, 19.11.2026): Leistung ab Start, Abbuchung jeweils einen Monat später für den Vormonat
  const arrears = !!offer.paymentInArrears && add.annualTotal == null && !annualOpen;
  const ersteIso = arrears && startIso ? nachtraeglichErsteIso(startIso) : null;
  const ersterMonat = ersteIso ? nachtraeglichLeistungsmonat(ersteIso) : null;
  const ersteText = ersteIso ? `am ${fmtIso(ersteIso)}` : "einen Monat nach dem Start";
  const productNames = products.map((p) => p.name).join(" & ");
  const makler = offer.vermittlerTyp === "makler";
  // Modul ohne Aufpreis vereinbart (Sonderkondition)
  const bestandInklusive = add.bestandActive && add.bestandFee === 0;

  return (
    <article className="offer-doc mx-auto w-full max-w-[880px] text-[#111827]">
      {/* ── Deckblatt ─────────────────────────────────────────────── */}
      {part !== "body" ? (
      <section className="offer-cover relative overflow-hidden rounded-[20px] bg-[#0b1220] px-8 pb-8 pt-10 text-white sm:px-14 print:h-[297mm] print:rounded-none print:px-[18mm] print:pb-[12mm] print:pt-[18mm]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_100%_100%,rgba(37,99,235,0.45),transparent_60%)]" />
        <div className="relative flex min-h-[640px] flex-col print:h-full print:min-h-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[17px] font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#2563EB] text-[13px]">↗</span>
              <span>
                performance<span className="text-[#7aa2ff]">growth</span>
              </span>
            </div>
            <span className="hidden text-xs text-[#9aa6bd] sm:inline print:inline">performancegrowth.de</span>
          </div>

          <div className="mt-24 sm:mt-32">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7aa2ff]">
              Angebot · {date(offer.createdAt)}
            </p>
            <h1 lang="de" className="mt-5 hyphens-auto break-words text-[28px] font-bold leading-[1.15] tracking-tight sm:text-[38px]">
              {nurLeads ? "Leads per Stück" : ppl ? "Pay-per-Lead + Software" : serviceOnly ? "Leadgenerierung" : "Leadgenerierung + Software"}
              {productNames && !ppl ? (
                <>
                  <br />
                  <span className="text-[#7aa2ff]">({productNames})</span>
                </>
              ) : null}
            </h1>
            <p className="mt-5 max-w-[520px] text-[15px] leading-relaxed text-[#c9d2e3]">
              {nurLeads
                ? "Anfragen zu Versicherungen, genau so viele, wie Sie möchten. Jeden Lead sehen Sie mit Kontaktdaten im Kundenbereich, halten dort den Stand fest und reklamieren mit einem Klick."
                : kk
                ? "Kampagnen in Ihrem eigenen Meta-Werbekonto, abgerechnet je Lead. Ihr digitaler Assistent schreibt jeden Lead per WhatsApp an und bucht Termine direkt in Ihren Kalender."
                : ppl
                ? "Ihr digitaler Assistent schreibt Ihre Pay-per-Lead-Leads per WhatsApp an, fragt den Bedarf ab und bucht Termine direkt in Ihren Kalender."
                : serviceOnly
                ? "Exklusive Versicherungs-Leads über Facebook & Instagram, in Echtzeit per E-Mail und im Kundenbereich."
                : "Exklusive Versicherungs-Leads über Facebook & Instagram, mit digitalem Assistenten, der die Leads per WhatsApp anschreibt und direkt Termine in Ihrem Kalender bucht."}
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 border-y border-white/15 py-6 sm:grid-cols-3 print:grid-cols-3">
            {kk ? (
              <Stat k="Startpaket" v={eurCent(kk.startUmsatz)} sub={`${startMengeText(kk.produkte)}, inkl. USt. · abgerechnet nach Lieferung`} />
            ) : ppl && offer.setupFee === 0 && woche ? (
              // Faire Anzeige (Ole, 20.11.2026): Leadkosten der ersten Woche statt „0 € Einrichtung“
              <Stat k={nurLeads ? "Erste Bestellung" : "Erste Woche"} v={eurCent(woche.summe)} sub={wocheSub} />
            ) : ppl && offer.setupFee === 0 ? (
              <Stat k="Einrichtung" v={eur(0)} sub="keine Einrichtungsgebühr" />
            ) : (
              <Stat
                k="Setup"
                v={eur(offer.setupFee)}
                sub={disc ? `einmalig, netto zzgl. 19 % USt. · statt ${eur(disc.list)} (${discLabel})` : "einmalig, netto zzgl. 19 % USt."}
              />
            )}
            {nurLeads ? (
              <Stat k="Monatsgebühr" v={eur(0)} sub="keine Software, keine Grundgebühr" accent />
            ) : kk ? (
              <Stat k="Software" v="inklusive" sub={`solange Sie mindestens ${eur(MINDESTBESTELLUNG_KUNDENKONTO)} Leads im Monat beziehen, sonst ${eur(add.monthlyTotal)} netto im Monat`} accent />
            ) : add.annualTotal != null ? (
              <Stat
                k={halb ? "6 Monate im Voraus" : "Jährlich im Voraus"}
                v={eur(add.annualTotal)}
                sub={`${geschenkt(add.freeMonths)} · entspricht ${eur(round2(add.annualTotal / pm))} im Monat, netto`}
                accent
              />
            ) : (
              <Stat
                k="Monatlich"
                v={eur(firstMonth)}
                sub={
                  hasIntro
                    ? `Startpreis Monat 1 bis ${offer.introMonths}, danach ${eur(add.monthlyTotal)}`
                    : annualOpen
                      ? `netto · oder ${vorausName} ${eur(v.total)}, ${geschenkt(v.freeMonths)}`
                      : `${paketName}${hasExtras ? " inkl. Zusätze" : ""}, netto${offer.startDate ? ` · ab ${date(offer.startDate)}` : ""}${ppl ? " · Leads separat" : ""}`
                }
                accent
              />
            )}
            {nurLeads ? (
              <Stat k="Laufzeit" v="Keine" sub="weitere Leads nur, wenn Sie bestellen" />
            ) : (
            <Stat
              k="Laufzeit"
              v={TERM_MONTHS[term] > 0 ? `${TERM_MONTHS[term]} Monate` : "Monatlich kündbar"}
              sub={termOpen ? "Vorschlag, Laufzeit wählen Sie unten bei der Annahme" : ppl ? (TERM_MONTHS[term] > 0 ? "danach monatlich kündbar" : "keine Mindestlaufzeit") : "Pause jederzeit möglich"}
            />
            )}
          </div>

          <div className="mt-8 grid gap-6 text-sm sm:grid-cols-2 print:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7aa2ff]">Anbieter</p>
              <p className="mt-3 font-semibold">{SHORT_NAME}</p>
              <p className="text-[#c9d2e3]">
                {PROVIDER.street}, {PROVIDER.city}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7aa2ff]">Angebot an</p>
              <p className="mt-3 font-semibold">{offer.contactName}</p>
              {offer.company ? <p className="text-[#c9d2e3]">{offer.company}</p> : null}
              {offer.street || offer.city ? (
                <p className="text-[#c9d2e3]">
                  {[offer.street, [offer.zip, offer.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-auto flex flex-wrap justify-between gap-2 pt-12 text-[11px] text-[#6b7894]">
            <span>{PROVIDER_FOOTER}</span>
            <span>
              {offer.number}
              {offer.version > 1 ? ` · Version ${offer.version}` : ""} · gültig bis {date(offer.validUntil)}
            </span>
          </div>
        </div>
      </section>
      ) : null}

      {/* ── Inhalt ────────────────────────────────────────────────── */}
      {part !== "cover" ? (
      <div className="offer-body mt-6 rounded-[20px] border border-[#e5e7eb] bg-white px-6 py-10 text-[15px] leading-relaxed sm:px-12 print:mt-0 print:rounded-none print:border-0 print:p-0">
        {nurLeads ? (
          <NurLeadsBody offer={offer} collapse={collapseAgb} />
        ) : ppl ? (
          <PplSoftwareBody offer={offer} term={term} add={add} firstMonth={firstMonth} termOpen={termOpen} startOpen={startOpen} arrears={arrears} ersteText={ersteText} billingDiffers={billingDiffers} plan={plan} kk={kk} collapse={collapseAgb} />
        ) : (
        <>
        <H2>1. Angebotsgegenstand und Umfang</H2>
        <p className="mt-3 text-[#374151]">
          Gegenstand dieses Angebots ist die Generierung exklusiver Interessenten-Datensätze („Leads“) für die unten
          genannten Versicherungsprodukte{serviceOnly ? "." : " sowie die Bereitstellung der Software zur Bearbeitung der Leads."}
        </p>
        <Table>
          <Tr k="Leadgenerierung">
            Konzeption, Erstellung und laufende Optimierung von Kampagnen auf Facebook &amp; Instagram im Werbekonto des
            Kunden, inklusive Werbemitteln und Lead-Formular. Die Leads gehen exklusiv an den Kunden.
          </Tr>
          {serviceOnly ? (
            <Tr k="Lead-Zustellung">
              Jeder Lead sofort per E-Mail; dazu ein Kundenbereich mit allen Leads und Auswertungen (Leads, Kosten pro
              Lead). Die Software mit WhatsApp-Assistent und Terminbuchung kann jederzeit dazugebucht werden.
            </Tr>
          ) : (
            <Tr k="Software">
              Digitaler Assistent auf WhatsApp (Erstkontakt, Bedarfsfragen, Terminbuchung), Terminbuchung im eigenen
              Kalender mit Erinnerungen, „Heute“-Liste, Pipeline, Wiedervorlagen und Auswertungen bis zu den Kosten pro
              Abschluss.
            </Tr>
          )}
          {/* Ole, 16.11.2026: Produkte nur mit Namen; das Budget steht unter „Werbebudget“, damit es sich nicht wie unser Preis liest */}
          <Tr k="Produkte">
            {products.length === 1 ? (
              <span className="font-medium text-[#111827]">{products[0].name}</span>
            ) : (
              <ul className="space-y-0.5">
                {products.map((p, i) => (
                  <li key={i} className="font-medium text-[#111827]">
                    {p.name}
                  </li>
                ))}
              </ul>
            )}
          </Tr>
          {add.hasSeats ? (
            <Tr k="Verkäufer">
              {add.seats} {add.seats === 1 ? "aktiver Verkäufer" : "aktive Verkäufer"}, davon {add.seatsIncluded} inklusive. Aktiv ist, wer Leads bekommt.
              Mitglieder ohne Leads (z. B. Inhaber, der nur steuert, oder Assistenz) sind kostenlos. Weitere Mitglieder lassen sich
              jederzeit im Kundenbereich unter „Team“ hinzufügen.
            </Tr>
          ) : null}
          {add.bestandActive ? (
            <Tr k="Bestandskunden-Modul">
              Bestand importieren und gezielt per WhatsApp ansprechen (Lücken, Jahresgespräch, Geburtstag, Ablauf). Inklusive
              WhatsApp-Gebühren für bis zu {PRICE_LIST.bestandIncludedMessages} Kampagnen-Nachrichten je Kalendermonat. Mehr Nachrichten jederzeit
              als Zusatzpaket: {bestandPacksText()}.
            </Tr>
          ) : null}
          <Tr k="Werbebudget">
            {products.length === 1 ? (
              <>
                {eur(products[0].dailyBudget)} pro Tag, etwa {eur(list.monthlyBudget)} im Monat.
              </>
            ) : (
              <ul className="space-y-0.5">
                {products.map((p, i) => (
                  <li key={i}>
                    {p.name}: {eur(p.dailyBudget)} pro Tag, etwa {eur(Math.round(p.dailyBudget * PRICE_LIST.daysPerMonth))} im Monat
                  </li>
                ))}
                <li>Zusammen etwa {eur(list.monthlyBudget)} im Monat.</li>
              </ul>
            )}{" "}
            Das Werbebudget zahlen Sie direkt an Meta, es ist nicht Teil unserer Rechnung.
            {budgetSatz ? <Note>{budgetSatz}</Note> : null}
            {produkteOpen ? <Note>Vorschlag: Produkte und Tagesbudget wählen Sie unten bei der Annahme.</Note> : null}
          </Tr>
          {offer.startDate ? (
            <Tr k="Start">
              {billingDiffers
                ? abrechnungstagSaetze(plan, { firstNet: firstCharge }).join(" ")
                : add.annualTotal != null
                  ? mitAnnahme
                    ? `${date(offer.startDate)}. Ab diesem Tag läuft die Laufzeit: ${eur(add.annualTotal)} netto ${vorausName}, ${vorauszahlungFaellig(startIso, pm, { mitAnnahme })}.`
                    : `${date(offer.startDate)}. Ab diesem Tag läuft die Vergütung: ${eur(add.annualTotal)} netto ${vorausName}, ${vorauszahlungFaellig(startIso, pm)}.`
                  : arrears
                    ? `${date(offer.startDate)}. Ab diesem Tag läuft die Leistung, bezahlt wird jeweils nachträglich für den abgelaufenen Monat, erstmals ${ersteText}.`
                    : `${date(offer.startDate)}. Ab diesem Tag läuft die monatliche Vergütung.`}
              {add.annualTotal != null && mitAnnahme ? <Note>{VORAUSZAHLUNG_MIT_ANNAHME}</Note> : null}
              {annualOpen && billingDiffers ? (
                <Note>
                  {mitAnnahme
                    ? `Bei ${vorausWort} gilt der Abrechnungstag nicht. ${VORAUSZAHLUNG_MIT_ANNAHME}`
                    : `Bei ${vorausWort} ist der volle ${halb ? "Betrag für 6 Monate" : "Jahresbetrag"} schon zum Start am ${date(offer.startDate)} fällig.`}
                </Note>
              ) : null}
              {startOpen ? <Note>Vorschlag, das Startdatum wählen Sie unten bei der Annahme.</Note> : null}
            </Tr>
          ) : null}
        </Table>

        <H2 className="mt-12">2. Preise und Zahlungsbedingungen</H2>
        <Table>
          <Tr k="Setup (einmalig)">
            {disc ? (
              <>
                <s className="mr-2 text-[#6B7280]" data-offer-setup-list>
                  {eur(disc.list)}
                </s>{" "}
              </>
            ) : null}
            <b className="text-[#111827]">{eur(offer.setupFee)}</b> netto zzgl. 19 % USt.
            <Note>
              {setupIsList
                ? `${TERM_MONTHS[term] > 0 ? `Mit ${TERM_MONTHS[term]} Monaten Laufzeit` : "Ohne Vertragslaufzeit"}${extra ? (PRICE_LIST.extraProductSetup > 0 ? `, inklusive ${extra} weiteres Produkt${extra > 1 ? "e" : ""}` : `, weitere Produkte ohne Einrichtungsgebühr`) : ""}`
                : "Sonderkondition"}
            </Note>
          </Tr>
          {disc ? (
            <Tr k={discLabel}>
              <b className="text-[#047857]" data-offer-setup-discount>
                − {eur(disc.discount)}
              </b>{" "}
              netto auf die Einrichtung
              <Note>Listenpreis {eur(disc.list)}, Sie zahlen {eur(offer.setupFee)} netto.</Note>
            </Tr>
          ) : null}
          {hasIntro ? (
            <Tr k={`Startpreis Monat 1 bis ${offer.introMonths}`}>
              <b className="text-[#111827]">{eur(offer.introMonthlyFee!)}</b> netto pro Monat zzgl. 19 % USt.
            </Tr>
          ) : null}
          <Tr k={hasIntro ? `Ab Monat ${offer.introMonths! + 1}` : "Monatliche Vergütung"}>
            <b className="text-[#111827]">{eur(offer.monthlyFee)}</b> netto pro Monat zzgl. 19 % USt. ({serviceOnly ? "Betreuung" : "Betreuung + Software"})
            <Note>
              {monthlyIsList
                ? `${serviceOnly ? "Paket Nur Betreuung" : `Preisstufe Werbebudget ${list.tierLabel}`}${extra ? `, inklusive ${extra} × ${eur(PRICE_LIST.extraProductMonthly)} für weitere Produkte` : ""}`
                : "Sonderkondition"}
              {monthlyIsList && !serviceOnly ? <InfoHinweis begriff="Preisstufe Werbebudget" text={PREISSTUFE_ERKLAERT} className="ml-1 print:hidden" /> : null}
            </Note>
            {staffel ? <Note>{tierStaffelText(staffel)}</Note> : null}
          </Tr>
          {add.extraSeats > 0 ? (
            <Tr k={`Weitere Verkäufer (${add.extraSeats})`}>
              {add.seatMonthly > 0 ? (
                <>
                  <b className="text-[#111827]">{eur(add.seatsFee)}</b> netto pro Monat ({add.extraSeats} × {eur(add.seatMonthly)})
                  <Note>Jeder weitere aktive Verkäufer {eur(add.seatMonthly)} netto pro Monat, tagesgenau ab dem Tag, an dem er Leads bekommt, bis zum Abschalten.</Note>
                </>
              ) : (
                "Im individuellen Monatspreis enthalten."
              )}
            </Tr>
          ) : null}
          {add.bestandActive ? (
            <Tr k="Bestandskunden-Modul">
              {bestandInklusive ? (
                <>
                  <b className="text-[#111827]">Ohne Aufpreis</b> (Sonderkondition)
                </>
              ) : (
                <>
                  <b className="text-[#111827]">{eur(add.bestandFee)}</b> netto pro Monat
                </>
              )}
              <Note>
                Inklusive WhatsApp-Gebühren bis {PRICE_LIST.bestandIncludedMessages} Kampagnen-Nachrichten im Monat. Zusatzpakete: {bestandPacksText()}.
              </Note>
            </Tr>
          ) : null}
          {add.empfehlungActive ? (
            <Tr k="Empfehlungen & Bewertungen">
              {add.empfehlungFee === 0 ? (
                <>
                  <b className="text-[#111827]">Ohne Aufpreis</b> (Sonderkondition)
                </>
              ) : (
                <>
                  <b className="text-[#111827]">{eur(add.empfehlungFee)}</b> netto pro Monat
                </>
              )}
              <Note>Nach jedem Abschluss automatisch um eine Google-Bewertung und später um eine Empfehlung bitten, mit Empfehlungsseite und Auswertung.</Note>
            </Tr>
          ) : null}
          {hasExtras ? (
            <Tr k="Monatlich gesamt">
              <b className="text-[#111827]">{eur(add.monthlyTotal)}</b> netto pro Monat zzgl. 19 % USt.
            </Tr>
          ) : null}
          {add.annualTotal != null ? (
            <Tr k="Zahlweise">
              {halb ? "6 Monate im Voraus" : "Jährlich im Voraus"}: <b className="text-[#111827]">{eur(add.annualTotal)}</b> netto {halb ? "je 6 Monate" : "pro Jahr"} zzgl. 19 % USt.
              <Note>
                {geschenkt(add.freeMonths)} ({pm - add.freeMonths} statt {pm} Monatsbeträge), Ersparnis {eur(add.annualSavings)}.
                {offer.annualChoice ? " Bei der Annahme gewählt." : ""}
              </Note>
            </Tr>
          ) : annualOpen ? (
            <Tr k="Zahlweise">
              <span data-offer-zahlweise-wahl>
                Wählen Sie bei der Annahme: monatlich <b className="text-[#111827]">{eur(add.monthlyTotal)}</b> netto im Monat oder {vorausName}{" "}
                <b className="text-[#111827]">{eur(v.total)}</b> netto {halb ? "für 6 Monate" : "im Jahr"}, jeweils zzgl. 19 % USt.
              </span>
              <Note>
                Bei {vorausWort} {geschenkt(v.freeMonths)}, Sie sparen {eur(v.savings)}.
                {termOpen
                  ? halb
                    ? ` Vorauszahlung für 6 Monate gibt es mit 6 Monaten Laufzeit, jährlich im Voraus mit 12 Monaten Laufzeit (${geschenkt(VORAUSZAHLUNG["12m"].freeMonths)}).`
                    : ` Jahreszahlung gibt es mit 12 Monaten Laufzeit${termOptionsFor(offer.createdAt, offer.term).includes("6m") ? `, 6 Monate im Voraus mit 6 Monaten Laufzeit (${geschenkt(VORAUSZAHLUNG["6m"].freeMonths)})` : ""}.`
                  : ""}{" "}
                Der Vertrag verlängert sich dann nach {pm} Monaten um jeweils weitere {pm} Monate, wenn er nicht mit einer Frist von einem Monat zum Ende der
                Laufzeit gekündigt wird. Für Pausen gibt es bei {vorausWort} keine Gutschrift.
              </Note>
            </Tr>
          ) : arrears ? (
            <Tr k="Zahlweise">
              Monatlich nachträglich: <b className="text-[#111827]">{eur(firstMonth)}</b> netto jeweils für den abgelaufenen Leistungsmonat, erstmals {ersteText}
              {ersterMonat ? ` für ${fmtIso(ersterMonat.fromIso)} bis ${fmtIso(ersterMonat.toIso)}` : ""}.
              <Note>Auch nach der Mindestlaufzeit zahlen Sie nachträglich. Die Zahlung für den letzten Monat folgt nach Vertragsende.</Note>
            </Tr>
          ) : offer.annualChoice && !open ? (
            <Tr k="Zahlweise">Monatlich im Voraus, bei der Annahme gewählt.</Tr>
          ) : null}
          <Tr k="Vertragslaufzeit">
            {add.annual
              ? `${pm} Monate ab ${billingDiffers ? "dem ersten Abrechnungstag" : "Start"}, ${vorausName} bezahlt. Danach verlängert sich der Vertrag um jeweils weitere ${pm} Monate, wenn er nicht mit einer Frist von einem Monat zum Ende der Laufzeit gekündigt wird.`
              : arrears
                ? TERM_MONTHS[term] > 0
                  ? `${TERM_MONTHS[term]} Monate ab Start, danach monatlich kündbar zum Ende des jeweiligen Leistungsmonats.`
                  : "Keine Mindestlaufzeit, kündbar zum Ende des jeweiligen Leistungsmonats."
                : TERM_MONTHS[term] > 0
                  ? `${TERM_MONTHS[term]} Monate ab ${billingDiffers ? "dem ersten Abrechnungstag" : "Start"}, danach monatlich kündbar zum Ende des Abrechnungsmonats.`
                  : "Keine Mindestlaufzeit, kündbar zum Ende des jeweiligen Abrechnungsmonats."}
            {termOpen ? (
              <Note>
                Laufzeit wählen Sie unten bei der Annahme:{" "}
                {termOptionsFor(offer.createdAt, offer.term)
                  .map((t) => `${TERM_MONTHS[t] > 0 ? `${TERM_MONTHS[t]} Monate` : "ohne Laufzeit"} (${t === "12m" ? "Setup " : ""}${eur(setupForChoice(t, products.length || 1, choiceDiscount))})`)
                  .join(", ")
                  .replace(/, ([^,]*)$/, " oder $1")}
                , jeweils netto{choiceDiscount ? `, ${discLabel} schon abgezogen` : ""}.
              </Note>
            ) : null}
          </Tr>
          <Tr k="Pause / Urlaub">
            {add.annual ? (
              `Jederzeit möglich; die Anzeigen werden gestoppt. Bei ${halb ? "Vorauszahlung" : "jährlicher Vorauszahlung"} erfolgt für die Pausenzeit keine Gutschrift.`
            ) : offer.softwareFee > 0 ? (
              <>
                Jederzeit möglich. Die Anzeigen werden gestoppt; in dieser Zeit fällt nur die Software-Gebühr von{" "}
                {eur(offer.softwareFee)} netto im Monat an.
              </>
            ) : (
              "Jederzeit möglich. Die Anzeigen werden gestoppt; in dieser Zeit fällt keine Vergütung an."
            )}
          </Tr>
          {serviceOnly ? null : (
            <Tr k="WhatsApp-Gebühren">
              {PRICE_LIST.whatsappIncluded
                ? "Im Preis enthalten (Erstkontakt, Erinnerungen, Nachfassen ohne Begrenzung)."
                : "Gebühren von Meta nach Verbrauch, in der Regel 10–40 € im Monat."}
            </Tr>
          )}
          {add.annualTotal != null && mitAnnahme ? (
            <Tr k="Bei Annahme fällig">
              <b className="text-[#111827]">{eur(offer.setupFee + add.annualTotal)}</b> netto (Setup {eur(offer.setupFee)} und {halb ? "Vorauszahlung für 6 Monate" : "Jahresbetrag"}{" "}
              {eur(add.annualTotal)}) zzgl. 19 % USt. {eur(vatOf(offer.setupFee + add.annualTotal))}
              {" = "}
              <b className="text-[#111827]">{eur(withVat(offer.setupFee + add.annualTotal))} brutto</b>
              <Note>
                {VORAUSZAHLUNG_MIT_ANNAHME}
                {startIso ? ` Die nächste Vorauszahlung ist am ${fmtIso(addMonthsIso(startIso, pm))} fällig.` : ""}
                {termOpen || startOpen ? " Setup und Start richten sich nach Ihrer Wahl bei der Annahme." : ""}
              </Note>
            </Tr>
          ) : arrears ? (
            <Tr k="Bei Annahme fällig">
              {offer.setupFee > 0 ? (
                <>
                  <b className="text-[#111827]">{eur(offer.setupFee)}</b> netto (Setup) zzgl. 19 % USt. {eur(vatOf(offer.setupFee))}
                  {" = "}
                  <b className="text-[#111827]">{eur(withVat(offer.setupFee))} brutto</b>
                </>
              ) : (
                <>
                  <b className="text-[#111827]">{eur(0)}</b>, keine Einrichtungsgebühr
                </>
              )}
              <Note>
                {offer.setupFee > 0 ? "" : "Bei der Annahme hinterlegen Sie nur Ihre Zahlungsart. "}
                Die erste Monatsgebühr ({eur(firstMonth)} netto, {eur(withVat(firstMonth))} brutto) wird nachträglich {ersteText} fällig
                {ersterMonat ? `, für den Monat ${fmtIso(ersterMonat.fromIso)} bis ${fmtIso(ersterMonat.toIso)}` : ""}.
                {startOpen ? " Der Start richtet sich nach Ihrer Wahl bei der Annahme." : ""}
              </Note>
            </Tr>
          ) : (
          <Tr k="Bei Annahme fällig">
            <b className="text-[#111827]">{eur(offer.setupFee)}</b> netto (Setup) zzgl. 19 % USt. {eur(vatOf(offer.setupFee))}
            {" = "}
            <b className="text-[#111827]">{eur(withVat(offer.setupFee))} brutto</b>
            <Note>
              {add.annualTotal != null ? (halb ? "Betrag für 6 Monate" : "Jahresbetrag") : "Erste Monatsgebühr"} ({eur(firstCharge)} netto, {eur(withVat(firstCharge))} brutto)
              {plan && billingDiffers ? ` am ${plan.firstIso.split("-").reverse().join(".")}` : offer.startDate ? ` am ${date(offer.startDate)}` : " zum Start"}
              {billingDiffers && !plan!.free ? " zuzüglich des anteiligen Betrags für die Zeit davor" : ""}.
              {annualOpen
                ? mitAnnahme
                  ? `${halb ? ` Bei Vorauszahlung kommt der Betrag von ${eur(v.total)} netto für 6 Monate dazu` : ` Bei Jahreszahlung kommt der Jahresbetrag von ${eur(v.total)} netto dazu`}. ${VORAUSZAHLUNG_MIT_ANNAHME}`
                  : `${halb ? ` Bei Vorauszahlung ist es der Betrag von ${eur(v.total)} netto für 6 Monate` : ` Bei Jahreszahlung ist es der Jahresbetrag von ${eur(v.total)} netto`}${billingDiffers ? `, fällig zum Start am ${date(offer.startDate!)}` : ""}.`
                : ""}
              {termOpen || startOpen ? " Setup und Start richten sich nach Ihrer Wahl bei der Annahme." : ""}
            </Note>
          </Tr>
          )}
        </Table>
        <MonthlyOverview
          feeNet={add.annualTotal != null ? add.annualTotal / pm : add.monthlyTotal ?? offer.monthlyFee}
          adNet={list.monthlyBudget}
          serviceOnly={serviceOnly}
          annual={add.annualTotal != null}
          halbjahr={halb}
          intro={hasIntro ? { months: offer.introMonths!, fee: offer.introMonthlyFee! } : null}
        />

        <H3>2.1 Zahlung</H3>
        <p className="text-[#374151]">
          {add.annual
            ? mitAnnahme
              ? halb
                ? "Die Setupgebühr und die Vorauszahlung für die ersten 6 Monate werden mit Vertragsschluss fällig, danach die Vergütung für jeweils 6 Monate im Voraus, per SEPA-Lastschrift oder Karte, automatisch eingezogen. Die Laufzeit beginnt mit dem Start der Kampagne. Weitere aktive Verkäufer, die während dieser 6 Monate dazukommen, werden anteilig berechnet."
                : "Die Setupgebühr und die Vorauszahlung für die ersten 12 Monate werden mit Vertragsschluss fällig, danach die Vergütung jährlich im Voraus, per SEPA-Lastschrift oder Karte, automatisch eingezogen. Die Laufzeit beginnt mit dem Start der Kampagne. Weitere aktive Verkäufer, die während des Jahres dazukommen, werden anteilig berechnet."
              : halb
                ? "Die Setupgebühr wird mit Vertragsschluss fällig, die Vergütung ab dem Startdatum für jeweils 6 Monate im Voraus, per SEPA-Lastschrift oder Karte, automatisch eingezogen. Weitere aktive Verkäufer, die während dieser 6 Monate dazukommen, werden anteilig berechnet."
                : "Die Setupgebühr wird mit Vertragsschluss fällig, die Vergütung ab dem Startdatum jährlich im Voraus, per SEPA-Lastschrift oder Karte, automatisch eingezogen. Weitere aktive Verkäufer, die während des Jahres dazukommen, werden anteilig berechnet."
            : arrears
              ? `${offer.setupFee > 0 ? "Die Setupgebühr wird mit Vertragsschluss fällig. " : ""}Die monatliche Vergütung wird jeweils nachträglich für den abgelaufenen Leistungsmonat fällig, erstmals einen Monat nach dem Startdatum, und per SEPA-Lastschrift oder Karte automatisch eingezogen. Das gilt auch nach der Mindestlaufzeit; die Vergütung für den letzten Monat wird nach Vertragsende eingezogen.`
              : `Die Setupgebühr wird mit Vertragsschluss fällig, die monatliche Vergütung ab dem Startdatum monatlich im Voraus, per SEPA-Lastschrift oder Karte, automatisch eingezogen.${
                annualOpen
                  ? mitAnnahme
                    ? halb
                      ? " Bei Vorauszahlung wird die Vergütung für die ersten 6 Monate mit Vertragsschluss fällig, danach für jeweils 6 Monate im Voraus."
                      : " Bei Jahreszahlung wird die Vergütung für die ersten 12 Monate mit Vertragsschluss fällig, danach jährlich im Voraus."
                    : halb
                      ? " Bei Vorauszahlung wird die Vergütung für jeweils 6 Monate im Voraus eingezogen."
                      : " Bei Jahreszahlung wird die Vergütung jährlich im Voraus eingezogen."
                  : ""
              }`}
        </p>
        {/* Angebote ab GUARANTEES_UNTIL (22.11.2026) ohne Garantien; ältere behalten ihren Abschnitt */}
        {!angebotMitGarantien(garantieDatum(offer)) ? null : garantieDatum(offer) < GUARANTEES_FROM ? (
          <>
            <H3>2.2 Garantie</H3>
            <p className="text-[#374151]">
              Läuft ein Produkt für Sie nicht profitabel, richten wir ein weiteres Produkt Ihrer Wahl ohne Setupgebühr ein,
              so lange, bis Sie ein Produkt haben, mit dem Sie zufrieden sind.
            </p>
          </>
        ) : products.some((p) => isGuaranteeProduct(p.name)) ? (
          <>
            <H3>2.2 Ihre Garantien</H3>
            <p className="mb-2 text-sm text-[#6B7280]">
              Die Garantien gelten für {products.filter((p) => isGuaranteeProduct(p.name)).map((p) => p.name).join(", ")}.
            </p>
            <p className="text-[#374151]">
              <strong>Lead-Garantie:</strong> Bei mindestens 20 € Werbebudget pro Tag bekommen Sie in den ersten 30 Tagen nach
              Kampagnenstart mindestens 100 Leads. Sonst sind Betreuung und Software im Folgemonat kostenlos.
            </p>
            {makler ? (
            <p className="mt-2 text-[#374151]">
              {/* Frist je Angebotsdatum: neue Angebote 120 aktive Tage, ältere behalten 90 (lib/rechner vertragTageFuer) */}
              <strong>Vertrags-Garantie (für Makler):</strong> Haben Sie nach {vertragTageFuer(offer.createdAt)} aktiven Tagen weniger als{" "}
              {VERTRAGS_GARANTIE_MIN_VERTRAEGE} Verträge abgeschlossen, betreuen wir Sie ohne Gebühr für Betreuung und Software weiter, auf Wunsch
              mit einem anderen Produkt ohne Setupgebühr, bis Sie sie haben (längstens 6 Monate). Voraussetzung: mindestens 20 € Budget pro Tag, mindestens 80 % der gebuchten Termine von Ihnen
              wahrgenommen (Absagen und Nichterscheinen von Interessenten zählen nicht gegen Sie) und Ergebnisse in der App eingetragen. Details in den AGB (Abschnitt „Garantien“).
            </p>
            ) : (
            <p className="mt-2 text-[#374151]">
              {breakEvenTageFuer(offer.createdAt) > 90 ? (
                <>
                  <strong>Break-even-Garantie (für Vertreter): Spätestens ab dem 5. Monat profitabel.</strong> Liegt Ihre Provision nach 4 Monaten
                  unter Ihren Kosten für Werbung und Betreuung, betreuen wir Sie ohne Betreuungsgebühr weiter, auf Wunsch mit einem anderen Produkt,
                  bis es sich rechnet (längstens 6 Monate).
                </>
              ) : (
                <>
                  <strong>Break-even-Garantie (für Vertreter):</strong> Liegt Ihre Provision nach 90 Tagen unter Ihren Kosten für Werbung und
                  Betreuung, betreuen wir Sie ohne Betreuungsgebühr weiter, auf Wunsch mit einem anderen Produkt, bis es sich
                  rechnet (längstens 6 Monate).
                </>
              )} Voraussetzung: mindestens 20 € Budget pro Tag, mindestens 80 % der gebuchten
              Termine von Ihnen wahrgenommen (Absagen und Nichterscheinen von Interessenten zählen nicht gegen Sie) und Ergebnisse in der App eingetragen. Details in den AGB (Abschnitt „Garantien“).
            </p>
            )}
          </>
        ) : null}
        </>
        )}
        {offer.specialTerms ? (
          <>
            {/* ältere Angebote behalten ihre Nummer 2.3 */}
            <H3>{mitGarantieAbschnitt || angebotMitGarantien(garantieDatum(offer)) ? "2.3" : "2.2"} Sondervereinbarung</H3>
            <p className="whitespace-pre-wrap rounded-lg border-l-4 border-[#2563EB] bg-[#f3f6fd] px-4 py-3 text-[#111827]">
              {withBold(offer.specialTerms)}
            </p>
          </>
        ) : null}

        {collapseAgb ? (
          // Web-Ansicht: AGB zum Aufklappen (im PDF immer vollständig).
          <details className="offer-agb group mt-14 rounded-xl border border-[#e5e7eb] [&>summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4">
              <span>
                <span className="block text-lg font-bold">Allgemeine Geschäftsbedingungen (AGB)</span>
                <span className="text-sm text-[#6b7280]">Bestandteil dieses Angebots. Zum Lesen antippen.</span>
              </span>
              <span className="text-xl text-[#6b7280] transition group-open:rotate-45">+</span>
            </summary>
            <div className="border-t border-[#e5e7eb] px-5 pb-5">
            <div className="mt-4">
          <h2 className="text-xl font-bold">Allgemeine Geschäftsbedingungen (AGB)</h2>
          <p className="mb-6 mt-1 text-sm text-[#6b7280]">
            Die nachfolgenden Bedingungen sind Bestandteil dieses Angebots.
            {offer.dpaUrl ? (
              <>
                {" "}Ergänzend gilt der{" "}
                <a href={offer.dpaUrl} target="_blank" rel="noreferrer" className="underline">
                  Auftragsverarbeitungsvertrag
                </a>
                .
              </>
            ) : null}
          </p>
          <LegalSections sections={AGB} compact />
        </div>

            </div>
          </details>
        ) : (
        <div className="offer-agb mt-14">
          <h2 className="text-xl font-bold">Allgemeine Geschäftsbedingungen (AGB)</h2>
          <p className="mb-6 mt-1 text-sm text-[#6b7280]">
            Die nachfolgenden Bedingungen sind Bestandteil dieses Angebots.
            {offer.dpaUrl ? (
              <>
                {" "}Ergänzend gilt der{" "}
                <a href={offer.dpaUrl} target="_blank" rel="noreferrer" className="underline">
                  Auftragsverarbeitungsvertrag
                </a>
                .
              </>
            ) : null}
          </p>
          <LegalSections sections={AGB} compact />
        </div>

        )}

        <section className="mt-10 break-inside-avoid">
          <H2>Annahme des Angebots</H2>
          <p className="mt-3 text-[#374151]">
            Die Annahme erfolgt online über den Angebotslink oder in Textform per E-Mail. Mit der Annahme nimmt der
            Kunde das vorstehende Angebot einschließlich der Allgemeinen Geschäftsbedingungen und des
            Auftragsverarbeitungsvertrags verbindlich an. Das Angebot gilt bis {date(offer.validUntil)}.
          </p>
          <p className="mt-6 text-[#374151]">
            Berlin, {date(offer.createdAt)}
            <br />
            <b className="text-[#111827]">Ole Kannapinn</b> · {SHORT_NAME} (Anbieter)
          </p>
          {offer.acceptedAt ? (
            <div className="mt-6 flex items-start gap-3 rounded-xl bg-emerald-50 px-5 py-4 text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="text-sm">
                <div className="font-semibold">Angenommen</div>
                Online angenommen am {dateTime(offer.acceptedAt)} Uhr von {offer.acceptedName}.
              </div>
            </div>
          ) : null}
        </section>
      </div>
      ) : null}
    </article>
  );
}

/** Erste Woche im Angebot (Pay-per-Lead + Software): Produkt, Anzahl, Preis je Lead mit Steuerhinweis, eigene Rechnung. */
function ErsteWocheNote({ offer, nurLeads = false }: { offer: OfferDoc; nurLeads?: boolean }) {
  const w = ersteWocheAus(offer);
  if (!w) return null;
  const b = ersteWocheBetrag(w, w.quantity);
  const frei = b.steuer === "steuerfrei_4_11";
  const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  return (
    <Note>
      <span data-offer-erste-woche>
        {nurLeads ? "Ihre erste Bestellung" : "Ihre erste Woche"}: {w.quantity} Leads {ersteWocheName(w)} à {eur(bruttoJeLead(w.price, b.steuer))}, zusammen {eur(b.brutto)}
        {frei ? ", umsatzsteuerfrei nach § 4 Nr. 11 UStG für geprüfte Versicherungsvermittler" : " inkl. 19 % USt."}.
        {offer.acceptedAt ? "" : " Die Anzahl wählen Sie bei der Annahme."} Leads stehen auf einer eigenen Rechnung.
      </span>
    </Note>
  );
}

/** Satz unter „Bei Annahme fällig“: Leads der ersten Woche (eigene Rechnung, Abbuchung nach der Registerprüfung). */
function ErsteWocheFaelligSatz({ offer }: { offer: OfferDoc }) {
  const w = ersteWocheAus(offer);
  if (!w) return null;
  const z = ersteWocheZahlen(w);
  return (
    <span data-offer-erste-woche-faellig>
      {` Leads der ersten Woche: ${eurCent(z.summe)} (${w.quantity} Leads, ${ersteWocheSteuerKurz(z.steuer)}), eigene Rechnung, ${ERSTE_WOCHE_ABBUCHUNG}.`}
    </span>
  );
}

/**
 * Inhalt „Pay-per-Lead + Software“ (Ole, 19.11.2026): Software ohne Betreuung und ohne eigene Kampagnen, keine Einrichtung,
 * kein Werbebudget, keine Garantien; Leads separat per Stück nach den Pay-per-Lead-Bedingungen. Keine Gedankenstriche.
 */
function PplSoftwareBody({
  offer,
  term,
  add,
  firstMonth,
  termOpen,
  startOpen,
  arrears,
  ersteText,
  billingDiffers,
  plan,
  kk = null,
  collapse = false,
}: {
  kk?: KundenkontoAngebot | null;
  collapse?: boolean;
  offer: OfferDoc;
  term: OfferTerm;
  add: ReturnType<typeof offerAddOns>;
  firstMonth: number;
  termOpen: boolean;
  startOpen: boolean;
  arrears: boolean;
  ersteText: string;
  billingDiffers: boolean;
  plan: ReturnType<typeof abrechnungsplan>;
}) {
  const hasExtras = add.seatsFee > 0 || add.bestandFee > 0 || add.empfehlungFee > 0;
  const monthlyIsList = Math.abs(offer.monthlyFee - PRICE_LIST.softwareFee) < 0.01;
  const months = TERM_MONTHS[term];
  return (
    <>
      <H2>1. Angebotsgegenstand und Umfang</H2>
      <p className="mt-3 text-[#374151]">
        {kk
          ? "Gegenstand dieses Angebots sind Werbekampagnen in Ihrem eigenen Meta-Werbekonto, abgerechnet je Lead, und unsere Software zur Bearbeitung Ihrer Leads."
          : "Gegenstand dieses Angebots ist die Bereitstellung unserer Software zur Bearbeitung Ihrer Leads, ohne Betreuung und ohne eigene Werbekampagnen."}
      </p>
      <Table>
        {kk ? (
          <Tr k={KUNDENKONTO_NAME}>
            <span data-offer-kundenkonto>
              Wir erstellen und steuern Ihre Kampagnen auf Facebook und Instagram in Ihrem eigenen Meta-Werbekonto, mit Partnerzugriff für uns. {KUNDENKONTO_BUDGET}
            </span>
            <Note>Konto, Pixel, Zielgruppen und Leads gehören Ihnen. Sie geben die Anzeigen vor dem Start frei.</Note>
          </Tr>
        ) : null}
        <Tr k="Software">
          Digitaler Assistent auf WhatsApp (Erstkontakt, Bedarfsfragen, Terminbuchung), Terminbuchung im eigenen Kalender mit
          Erinnerungen, „Heute“-Liste, Pipeline, Wiedervorlagen und Auswertungen bis zu den Kosten pro Abschluss.
        </Tr>
        {kk ? (
          <Tr k="Leads">
            Jeder Lead aus Ihren Kampagnen landet direkt in der App, Ihr Assistent übernimmt ihn automatisch.
            <Note>{KUNDENKONTO_VORAUSSETZUNG}</Note>
          </Tr>
        ) : (
        <Tr k="Leads">
          <span data-offer-ppl-leads>{PPL_LEADS_SEPARAT}</span>
          <ErsteWocheNote offer={offer} />
          <Note>Bestellt wird im Kundenbereich unter „Leads bestellen“. Ihr Assistent übernimmt jeden gelieferten Lead automatisch.</Note>
          <Note>
            <span data-offer-ppl-reklamation>{PPL_REKLAMATION}</span>
          </Note>
        </Tr>
        )}
        {add.hasSeats ? (
          <Tr k="Verkäufer">
            {add.seats} {add.seats === 1 ? "aktiver Verkäufer" : "aktive Verkäufer"}, davon {add.seatsIncluded} inklusive. Aktiv ist, wer Leads bekommt.
            Mitglieder ohne Leads (z. B. Assistenz) sind kostenlos. Weitere Mitglieder fügen Sie jederzeit im Kundenbereich unter „Team“ hinzu.
          </Tr>
        ) : null}
        {add.bestandActive ? (
          <Tr k="Bestandskunden-Modul">
            Bestand importieren und gezielt per WhatsApp ansprechen (Lücken, Jahresgespräch, Geburtstag, Ablauf). Inklusive WhatsApp-Gebühren für bis zu{" "}
            {PRICE_LIST.bestandIncludedMessages} Kampagnen-Nachrichten je Kalendermonat. Mehr Nachrichten jederzeit als Zusatzpaket: {bestandPacksText()}.
          </Tr>
        ) : null}
        {offer.startDate ? (
          <Tr k="Start">
            {billingDiffers
              ? abrechnungstagSaetze(plan, { firstNet: firstMonth }).join(" ")
              : arrears
                ? `${date(offer.startDate)}. Ab diesem Tag läuft die Leistung, bezahlt wird jeweils nachträglich für den abgelaufenen Monat, erstmals ${ersteText}.`
                : `${date(offer.startDate)}. Ab diesem Tag läuft die monatliche Vergütung.`}
            {startOpen ? <Note>Vorschlag, das Startdatum wählen Sie unten bei der Annahme.</Note> : null}
          </Tr>
        ) : null}
      </Table>

      <H2 className="mt-12">2. Preise und Zahlungsbedingungen</H2>
      <Table>
        <Tr k="Einrichtung">
          {offer.setupFee > 0 ? (
            <>
              <b className="text-[#111827]">{eur(offer.setupFee)}</b> netto zzgl. 19 % USt. <Note>Sonderkondition</Note>
            </>
          ) : (
            <>
              <b className="text-[#111827]">Keine Einrichtungsgebühr</b>
              <Note>Die Einrichtung machen Sie selbst im Kundenbereich (ca. 20 bis 30 Minuten), auf Wunsch gemeinsam in einem 15-Minuten-Termin.</Note>
            </>
          )}
        </Tr>
        {kk ? <KundenkontoPreise kk={kk} /> : null}
        <Tr k={kk ? "Software" : "Monatliche Vergütung"}>
          {kk ? (
            <>
              <b className="text-[#111827]">Inklusive</b>, solange Sie mindestens {eur(MINDESTBESTELLUNG_KUNDENKONTO)} Leads im Monat beziehen, sonst{" "}
              <b className="text-[#111827]">{eur(offer.monthlyFee)}</b> netto pro Monat zzgl. 19 % USt.
              <Note>
                Abgebucht wird die Software monatlich im Voraus; in Monaten mit Software inklusive verrechnen wir sie mit Ihrer Leadabrechnung. Auf der
                Rechnung steht sie als eigene Position.
              </Note>
            </>
          ) : (
            <>
              <b className="text-[#111827]">{eur(offer.monthlyFee)}</b> netto pro Monat zzgl. 19 % USt. (Software)
              <Note>{monthlyIsList ? "Paket Pay-per-Lead + Software" : "Sonderkondition"}</Note>
            </>
          )}
        </Tr>
        {add.extraSeats > 0 ? (
          <Tr k={`Weitere Verkäufer (${add.extraSeats})`}>
            {add.seatMonthly > 0 ? (
              <>
                <b className="text-[#111827]">{eur(add.seatsFee)}</b> netto pro Monat ({add.extraSeats} × {eur(add.seatMonthly)})
                <Note>Jeder weitere aktive Verkäufer {eur(add.seatMonthly)} netto pro Monat, tagesgenau ab dem Tag, an dem er Leads bekommt, bis zum Abschalten.</Note>
              </>
            ) : (
              "Im individuellen Monatspreis enthalten."
            )}
          </Tr>
        ) : null}
        {add.bestandActive ? (
          <Tr k="Bestandskunden-Modul">
            {add.bestandFee === 0 ? (
              <>
                <b className="text-[#111827]">Ohne Aufpreis</b> (Sonderkondition)
              </>
            ) : (
              <>
                <b className="text-[#111827]">{eur(add.bestandFee)}</b> netto pro Monat
              </>
            )}
          </Tr>
        ) : null}
        {add.empfehlungActive ? (
          <Tr k="Empfehlungen & Bewertungen">
            {add.empfehlungFee === 0 ? (
              <>
                <b className="text-[#111827]">Ohne Aufpreis</b> (Sonderkondition)
              </>
            ) : (
              <>
                <b className="text-[#111827]">{eur(add.empfehlungFee)}</b> netto pro Monat
              </>
            )}
            <Note>Nach jedem Abschluss automatisch um eine Google-Bewertung und später um eine Empfehlung bitten, mit Empfehlungsseite und Auswertung.</Note>
          </Tr>
        ) : null}
        {hasExtras ? (
          <Tr k="Monatlich gesamt">
            <b className="text-[#111827]">{eur(add.monthlyTotal)}</b> netto pro Monat zzgl. 19 % USt.
          </Tr>
        ) : null}
        {kk ? null : (
        <Tr k="Leads">
          Separat per Stück zum Preis je Lead laut Bestellung, nicht Teil der Monatsgebühr. Keine Mindestabnahme.
        </Tr>
        )}
        {arrears ? (
          <Tr k="Zahlweise">
            Monatlich nachträglich: <b className="text-[#111827]">{eur(firstMonth)}</b> netto jeweils für den abgelaufenen Leistungsmonat, erstmals {ersteText}.
          </Tr>
        ) : null}
        <Tr k="Vertragslaufzeit">
          {months > 0
            ? `${months} Monate ab ${billingDiffers ? "dem ersten Abrechnungstag" : "Start"}, danach monatlich kündbar zum Ende des ${arrears ? "jeweiligen Leistungsmonats" : "Abrechnungsmonats"}.`
            : `Keine Mindestlaufzeit, monatlich kündbar zum Ende des jeweiligen ${arrears ? "Leistungsmonats" : "Abrechnungsmonats"}.`}
          {termOpen ? <Note>Laufzeit wählen Sie unten bei der Annahme: ohne Mindestlaufzeit oder 3 Monate, jeweils ohne Einrichtungsgebühr.</Note> : null}
        </Tr>
        <Tr k="WhatsApp-Gebühren">
          {PRICE_LIST.whatsappIncluded ? "Im Preis enthalten (Erstkontakt, Erinnerungen, Nachfassen ohne Begrenzung)." : "Gebühren von Meta nach Verbrauch, in der Regel 10–40 € im Monat."}
        </Tr>
        <Tr k="Bei Annahme fällig">
          {offer.setupFee > 0 ? (
            <>
              <b className="text-[#111827]">{eur(offer.setupFee)}</b> netto zzgl. 19 % USt. {eur(vatOf(offer.setupFee))} = <b className="text-[#111827]">{eur(withVat(offer.setupFee))} brutto</b>
            </>
          ) : (
            <>
              <b className="text-[#111827]">{eur(0)}</b>, Sie hinterlegen nur Ihre Zahlungsart{kk ? " (auch für die wöchentliche Lastschrift)" : ""}
            </>
          )}
          <Note>
            {arrears
              ? `Die erste Monatsgebühr (${eur(firstMonth)} netto, ${eur(withVat(firstMonth))} brutto) wird nachträglich ${ersteText} fällig.`
              : `Erste Monatsgebühr (${eur(firstMonth)} netto, ${eur(withVat(firstMonth))} brutto)${plan && billingDiffers ? ` am ${plan.firstIso.split("-").reverse().join(".")}` : offer.startDate ? ` am ${date(offer.startDate)}` : " zum Start"}.`}
            {startOpen ? " Der Start richtet sich nach Ihrer Wahl bei der Annahme." : ""}
            <ErsteWocheFaelligSatz offer={offer} />
          </Note>
        </Tr>
      </Table>

      <H3>2.1 Zahlung</H3>
      <p className="text-[#374151]">
        {arrears
          ? "Die monatliche Vergütung wird jeweils nachträglich für den abgelaufenen Leistungsmonat fällig, erstmals einen Monat nach dem Startdatum, und per SEPA-Lastschrift oder Karte automatisch eingezogen."
          : "Die monatliche Vergütung wird ab dem Startdatum monatlich im Voraus per SEPA-Lastschrift oder Karte automatisch eingezogen."}{" "}
        {kk ? "Leads werden wöchentlich per Lastschrift abgerechnet, wie oben beschrieben." : "Bestellte Leads werden je Bestellung separat berechnet."}
      </p>
      {kk ? <KundenkontoBedingungen collapse={collapse} /> : null}
    </>
  );
}

/** Inhalt „Nur Leads“ (Ole, 24.11.2026): Gegenstand, Preise, Reklamation, Besondere Bedingungen. */
function NurLeadsBody({ offer, collapse }: { offer: OfferDoc; collapse: boolean }) {
  const w = ersteWocheAus(offer);
  const z = w ? ersteWocheZahlen(w) : null;
  return (
    <>
      <H2>1. Angebotsgegenstand und Umfang</H2>
      <p className="mt-3 text-[#374151]">
        Gegenstand dieses Angebots sind Interessenten-Datensätze („Leads“) per Stück, ohne Software, ohne Betreuung und ohne eigene Werbekampagnen.
      </p>
      <Table>
        <Tr k="Leads">
          <span data-offer-nur-leads>{PPL_NUR_LEADS_SEPARAT}</span>
          <ErsteWocheNote offer={offer} nurLeads />
          <Note>
            <span data-offer-ppl-reklamation>{PPL_NUR_LEADS_REKLAMATION}</span>
          </Note>
        </Tr>
        <Tr k="Kundenbereich">
          Alle Leads mit Kontaktdaten und Formularangaben, einfacher Bearbeitungsstand (z. B. erreicht, Termin, Abschluss), Reklamation, Bestellungen und
          Rechnungen. Ohne Einrichtung: Sie loggen sich ein und legen los.
        </Tr>
      </Table>

      <H2 className="mt-12">2. Preise und Zahlungsbedingungen</H2>
      <Table>
        <Tr k="Monatsgebühr">
          <b className="text-[#111827]">Keine</b>
          <Note>Keine Software, keine Einrichtung, keine Laufzeit.</Note>
        </Tr>
        <Tr k="Leads">Per Stück zum Preis je Lead laut Bestellung, jede Bestellung mit eigener Rechnung. Keine Mindestabnahme.</Tr>
        <Tr k="Bei Annahme fällig">
          <b className="text-[#111827]">{eur(0)}</b>, Sie hinterlegen nur Ihre Zahlungsart
          {w && z ? (
            <Note>
              <span data-offer-erste-woche-faellig>{`Erste Bestellung: ${eurCent(z.summe)} (${w.quantity} Leads, ${ersteWocheSteuerKurz(z.steuer)}), eigene Rechnung, Abbuchung nach Prüfung Ihrer Registernummer.`}</span>
            </Note>
          ) : null}
        </Tr>
      </Table>
      <NurLeadsBedingungen collapse={collapse} />
    </>
  );
}

/** Besondere Bedingungen „Nur Leads“ (Bestandteil des Angebots, lib/legal-texts.ts PPL_NUR_LEADS_BEDINGUNGEN). */
function NurLeadsBedingungen({ collapse }: { collapse: boolean }) {
  const titel = "Besondere Bedingungen: Nur Leads";
  const inhalt = <LegalSections sections={PPL_NUR_LEADS_BEDINGUNGEN} compact />;
  return collapse ? (
    <details className="group mt-10 rounded-xl border border-[#e5e7eb] [&>summary::-webkit-details-marker]:hidden" data-offer-nur-leads-bedingungen>
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4">
        <span>
          <span className="block text-lg font-bold">{titel}</span>
          <span className="text-sm text-[#6b7280]">Bestandteil dieses Angebots, gehen den AGB vor. Zum Lesen antippen.</span>
        </span>
        <span className="text-xl text-[#6b7280] transition group-open:rotate-45">+</span>
      </summary>
      <div className="border-t border-[#e5e7eb] px-5 pb-5 pt-4">{inhalt}</div>
    </details>
  ) : (
    <div className="mt-10" data-offer-nur-leads-bedingungen>
      <H2>{titel}</H2>
      <p className="mb-4 mt-1 text-sm text-[#6b7280]">Bestandteil dieses Angebots, gehen den AGB vor.</p>
      {inhalt}
    </div>
  );
}

/** Preise der Variante „Kampagnen im eigenen Werbekonto“: Preis je Lead, Werbebudget, Abrechnung, Startpaket, Beispiel. */
function KundenkontoPreise({ kk }: { kk: KundenkontoAngebot }) {
  const beispiel = beispielRechnung(kk.produkte[0]);
  return (
    <>
      <Tr k="Preis je Lead">
        <ul className="space-y-0.5" data-offer-kk-preise>
          {kk.produkte.map((p) => (
            <li key={p.name}>
              {p.name}: höchstens <b className="text-[#111827]">{eurCent(p.preis)}</b> inkl. USt.
            </li>
          ))}
        </ul>
        <Note>{KUNDENKONTO_OBERGRENZE}</Note>
      </Tr>
      <Tr k="Werbebudget">{KUNDENKONTO_BUDGET}</Tr>
      <Tr k="Abrechnung">
        {KUNDENKONTO_ABRECHNUNG}
        {beispiel ? <Note>{beispiel.text}</Note> : null}
      </Tr>
      <Tr k="Startpaket">
        <b className="text-[#111827]">{eurCent(kk.startUmsatz)}</b> Leadumsatz inkl. USt.: {startMengeText(kk.produkte)}
        <Note>Abgerechnet wird nach Lieferung, keine Vorauszahlung. Mindestens {eur(MINDESTBESTELLUNG_KUNDENKONTO)} zum Start.</Note>
      </Tr>
    </>
  );
}

/** Besondere Bedingungen der Variante (Bestandteil des Angebots, lib/legal-texts.ts PPL_KUNDENKONTO_BEDINGUNGEN). */
function KundenkontoBedingungen({ collapse }: { collapse: boolean }) {
  const titel = `Besondere Bedingungen: ${KUNDENKONTO_NAME}`;
  const inhalt = <LegalSections sections={PPL_KUNDENKONTO_BEDINGUNGEN} compact />;
  return collapse ? (
    <details className="group mt-10 rounded-xl border border-[#e5e7eb] [&>summary::-webkit-details-marker]:hidden" data-offer-kk-bedingungen>
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4">
        <span>
          <span className="block text-lg font-bold">{titel}</span>
          <span className="text-sm text-[#6b7280]">Bestandteil dieses Angebots, gehen den AGB vor. Zum Lesen antippen.</span>
        </span>
        <span className="text-xl text-[#6b7280] transition group-open:rotate-45">+</span>
      </summary>
      <div className="border-t border-[#e5e7eb] px-5 pb-5 pt-4">{inhalt}</div>
    </details>
  ) : (
    <div className="mt-10" data-offer-kk-bedingungen>
      <H2>{titel}</H2>
      <p className="mb-4 mt-1 text-sm text-[#6b7280]">Bestandteil dieses Angebots, gehen den AGB vor.</p>
      {inhalt}
    </div>
  );
}

function Stat({ k, v, sub, accent }: { k: string; v: string; sub: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7aa2ff]">{k}</p>
      <p className={`mt-2 text-xl font-bold ${accent ? "text-[#7aa2ff]" : ""}`}>{v}</p>
      <p className="mt-1 text-[11px] text-[#9aa6bd]">{sub}</p>
    </div>
  );
}

function H2({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-xl font-bold tracking-tight ${className}`}>{children}</h2>;
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1 mt-6 text-[15px] font-bold">{children}</h3>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <span className="mt-0.5 block text-[13px] text-[#6b7280]">{children}</span>;
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 overflow-hidden rounded-md border border-[#e5e7eb]">
      <table className="w-full border-collapse text-[14px]">
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Tr({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <tr className="break-inside-avoid border-b border-[#e5e7eb] align-top last:border-0">
      <th className="w-[34%] bg-[#f6f7f9] px-4 py-3 text-left font-semibold text-[#111827]">{k}</th>
      <td className="px-4 py-3 text-[#374151]">{children}</td>
    </tr>
  );
}

/** **fett** im Freitext der Sondervereinbarung als Fettdruck (sonst wörtlich). */
function withBold(text: string): (string | React.JSX.Element)[] {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <b key={i} className="font-semibold">
        {part.slice(2, -2)}
      </b>
    ) : (
      part
    ),
  );
}
