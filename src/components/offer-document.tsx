import { CheckCircle2 } from "lucide-react";
import { LegalSections } from "@/components/legal-sections";
import { AGB, PROVIDER } from "@/lib/legal-texts";
import {
  computeOfferPrice,
  eur,
  normalizeTerm,
  offerAddOns,
  PRICE_LIST,
  setupForChoice,
  vatOf,
  withVat,
  type OfferProduct,
  type OfferTerm,
} from "@/lib/offer-pricing";
// Ab wann und für welche Produkte die Garantien gelten (gleiche Regel wie die automatische Prüfung)
import { GUARANTEES_FROM, isGuaranteeProduct } from "@/lib/garantien";
import { VERTRAGS_GARANTIE_MIN_VERTRAEGE, breakEvenTageFuer } from "@/lib/rechner";

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
  /** Kunde wählt Laufzeit bzw. Startdatum bei der Annahme (vorher = Vorschlag). */
  customerChoosesTerm?: boolean;
  customerChoosesStart?: boolean;
};

type OfferRow = Omit<OfferDoc, "setupFee" | "monthlyFee" | "softwareFee" | "introMonthlyFee" | "seatMonthly" | "bestandMonthly" | "empfehlungMonthly" | "seats" | "seatsIncluded" | "annualPrepay" | "annualFreeMonths" | "vermittlerTyp"> & {
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
const eur2 = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(n);

/** Klarer Überblick: monatliche Gesamtkosten inkl. Werbebudget, netto und brutto. */
function MonthlyOverview({
  feeNet,
  adNet,
  serviceOnly,
  annual,
  intro,
}: {
  feeNet: number;
  adNet: number;
  serviceOnly: boolean;
  annual: boolean;
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
            <span className="text-[#6B7280]">(an performancegrowth{annual ? ", jährlich im Voraus – je Monat umgerechnet" : ""})</span>
          </span>
          {cell("netto", eur2(feeNet))}
          {cell("brutto", eur2(withVat(feeNet)))}
        </div>
        <div className={`${row} border-t border-[#2563EB]/10`}>
          <span className="col-span-2 sm:col-span-1">
            Werbebudget <span className="text-[#6B7280]">(zahlen Sie direkt an Meta)</span>
          </span>
          {cell("netto", `≈ ${eur2(adNet)}`)}
          {cell("brutto", `≈ ${eur2(withVat(adNet))}*`)}
        </div>
        <div className={`${row} border-t-2 border-[#2563EB]/30 font-semibold text-[#111827]`}>
          <span className="col-span-2 sm:col-span-1">Gesamt pro Monat</span>
          {cell("netto", `≈ ${eur2(totalNet)}`, true)}
          {cell("brutto", `≈ ${eur2(withVat(feeNet) + withVat(adNet))}`, true)}
        </div>
      </div>
      <p className="border-t border-[#2563EB]/20 px-5 py-3 text-xs leading-relaxed text-[#6B7280]">
        {intro ? `In den ersten ${intro.months} Monaten gilt der Startpreis von ${eur2(intro.fee)} netto (${eur2(withVat(intro.fee))} brutto) statt der oben genannten Vergütung. ` : ""}
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
  const list = computeOfferPrice({ package: serviceOnly ? "service" : "software", term, products });
  const extra = Math.max(0, products.length - 1);
  const setupIsList = Math.abs(list.setupFee - offer.setupFee) < 0.01;
  const monthlyIsList = list.monthlyFee != null && Math.abs(list.monthlyFee - offer.monthlyFee) < 0.01;
  const add = offerAddOns(offer);
  // Vor der Annahme: Laufzeit/Start wählt der Kunde unten selbst (Werte hier = Vorschlag).
  const open = offer.status === "draft" || offer.status === "sent";
  const termOpen = open && !!offer.customerChoosesTerm;
  const startOpen = open && !!offer.customerChoosesStart;
  const hasExtras = add.seatsFee > 0 || add.bestandFee > 0 || add.empfehlungFee > 0;
  const hasIntro = offer.introMonthlyFee != null && !!offer.introMonths;
  // Erster Monatsbetrag inkl. Zusätze (Startpreis gilt nur für das Paket)
  const firstMonth = round2((hasIntro ? offer.introMonthlyFee! : offer.monthlyFee) + add.seatsFee + add.bestandFee + add.empfehlungFee);
  const firstCharge = add.annualTotal ?? firstMonth;
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
              {serviceOnly ? "Leadgenerierung" : "Leadgenerierung + Software"}
              {productNames ? (
                <>
                  <br />
                  <span className="text-[#7aa2ff]">({productNames})</span>
                </>
              ) : null}
            </h1>
            <p className="mt-5 max-w-[520px] text-[15px] leading-relaxed text-[#c9d2e3]">
              {serviceOnly
                ? "Exklusive Versicherungs-Leads über Facebook & Instagram, in Echtzeit per E-Mail und im Kundenbereich."
                : "Exklusive Versicherungs-Leads über Facebook & Instagram, mit digitalem Assistenten, der die Leads per WhatsApp anschreibt und direkt Termine in Ihrem Kalender bucht."}
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 border-y border-white/15 py-6 sm:grid-cols-3 print:grid-cols-3">
            <Stat k="Setup" v={eur(offer.setupFee)} sub="einmalig, netto zzgl. 19 % USt." />
            {add.annualTotal != null ? (
              <Stat
                k="Jährlich im Voraus"
                v={eur(add.annualTotal)}
                sub={`${add.freeMonths} Monate geschenkt · entspricht ${eur(round2(add.annualTotal / 12))} im Monat, netto`}
                accent
              />
            ) : (
              <Stat
                k="Monatlich"
                v={eur(firstMonth)}
                sub={
                  hasIntro
                    ? `Startpreis Monat 1–${offer.introMonths}, danach ${eur(add.monthlyTotal)}`
                    : `${serviceOnly ? "Betreuung" : "Betreuung + Software"}${hasExtras ? " inkl. Zusätze" : ""}, netto${offer.startDate ? ` · ab ${date(offer.startDate)}` : ""}`
                }
                accent
              />
            )}
            <Stat
              k="Laufzeit"
              v={term === "12m" ? "12 Monate" : term === "3m" ? "3 Monate" : "Monatlich kündbar"}
              sub={termOpen ? "Vorschlag – Laufzeit wählen Sie unten bei der Annahme" : "Pause jederzeit möglich"}
            />
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
          <Tr k="Produkte">
            <ul className="space-y-0.5">
              {products.map((p, i) => (
                <li key={i}>
                  <span className="font-medium text-[#111827]">{p.name}</span>: {eur(p.dailyBudget)} pro Tag (≈{" "}
                  {eur(Math.round(p.dailyBudget * PRICE_LIST.daysPerMonth))} im Monat)
                </li>
              ))}
            </ul>
          </Tr>
          {add.hasSeats ? (
            <Tr k="Logins">
              {add.seats} {add.seats === 1 ? "Login" : "Logins"} für Inhaber und Berater, davon {add.seatsIncluded} inklusive. Weitere Logins
              lassen sich jederzeit im Kundenbereich unter „Team“ hinzufügen.
            </Tr>
          ) : null}
          {add.bestandActive ? (
            <Tr k="Bestandskunden-Modul">
              Bestand importieren und gezielt per WhatsApp ansprechen (Lücken, Jahresgespräch, Geburtstag, Ablauf). Inklusive
              WhatsApp-Gebühren für bis zu {PRICE_LIST.bestandIncludedMessages} Kampagnen-Nachrichten je Kalendermonat.
            </Tr>
          ) : null}
          <Tr k="Werbebudget">
            ≈ {eur(list.monthlyBudget)} im Monat. Das Werbebudget zahlt der Kunde direkt an Meta; es ist in den Preisen
            nicht enthalten.
          </Tr>
          {offer.startDate ? (
            <Tr k="Start">
              {date(offer.startDate)}. Ab diesem Tag läuft die monatliche Vergütung.
              {startOpen ? <Note>Vorschlag – das Startdatum wählen Sie unten bei der Annahme.</Note> : null}
            </Tr>
          ) : null}
        </Table>

        <H2 className="mt-12">2. Preise und Zahlungsbedingungen</H2>
        <Table>
          <Tr k="Setup (einmalig)">
            <b className="text-[#111827]">{eur2(offer.setupFee)}</b> netto zzgl. 19 % USt.
            <Note>
              {setupIsList
                ? `${term === "12m" ? "Mit 12 Monaten Laufzeit" : term === "3m" ? "Mit 3 Monaten Laufzeit" : "Ohne Vertragslaufzeit"}${extra ? `, inklusive ${extra} weiteres Produkt${extra > 1 ? "e" : ""}` : ""}`
                : "Sonderkondition"}
            </Note>
          </Tr>
          {hasIntro ? (
            <Tr k={`Startpreis Monat 1–${offer.introMonths}`}>
              <b className="text-[#111827]">{eur2(offer.introMonthlyFee!)}</b> netto pro Monat zzgl. 19 % USt.
            </Tr>
          ) : null}
          <Tr k={hasIntro ? `Ab Monat ${offer.introMonths! + 1}` : "Monatliche Vergütung"}>
            <b className="text-[#111827]">{eur2(offer.monthlyFee)}</b> netto pro Monat zzgl. 19 % USt. ({serviceOnly ? "Betreuung" : "Betreuung + Software"})
            <Note>
              {monthlyIsList
                ? `${serviceOnly ? "Paket Nur Betreuung" : `Preisstufe Werbebudget ${list.tierLabel}`}${extra ? `, inklusive ${extra} × ${eur(PRICE_LIST.extraProductMonthly)} für weitere Produkte` : ""}`
                : "Sonderkondition"}
            </Note>
          </Tr>
          {add.extraSeats > 0 ? (
            <Tr k={`Weitere Logins (${add.extraSeats})`}>
              {add.seatMonthly > 0 ? (
                <>
                  <b className="text-[#111827]">{eur2(add.seatsFee)}</b> netto pro Monat ({add.extraSeats} × {eur(add.seatMonthly)})
                  <Note>Jeder weitere Login {eur(add.seatMonthly)} netto pro Monat, tagesgenau ab Einrichtung bzw. bis zur Entfernung.</Note>
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
                  <b className="text-[#111827]">{eur2(add.bestandFee)}</b> netto pro Monat
                </>
              )}
              <Note>Inklusive WhatsApp-Gebühren bis {PRICE_LIST.bestandIncludedMessages} Kampagnen-Nachrichten im Monat; mehr auf Anfrage.</Note>
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
                  <b className="text-[#111827]">{eur2(add.empfehlungFee)}</b> netto pro Monat
                </>
              )}
              <Note>Nach jedem Abschluss automatisch um eine Google-Bewertung und später um eine Empfehlung bitten, mit Empfehlungsseite und Auswertung.</Note>
            </Tr>
          ) : null}
          {hasExtras ? (
            <Tr k="Monatlich gesamt">
              <b className="text-[#111827]">{eur2(add.monthlyTotal)}</b> netto pro Monat zzgl. 19 % USt.
            </Tr>
          ) : null}
          {add.annualTotal != null ? (
            <Tr k="Zahlweise">
              Jährlich im Voraus: <b className="text-[#111827]">{eur2(add.annualTotal)}</b> netto pro Jahr zzgl. 19 % USt.
              <Note>
                {add.freeMonths} Monate geschenkt ({12 - add.freeMonths} statt 12 Monatsbeträge), Ersparnis {eur2(add.annualSavings)}.
              </Note>
            </Tr>
          ) : null}
          <Tr k="Vertragslaufzeit">
            {add.annual
              ? "12 Monate ab Start, jährlich im Voraus bezahlt. Danach verlängert sich der Vertrag um jeweils weitere 12 Monate, wenn er nicht mit einer Frist von einem Monat zum Ende der Laufzeit gekündigt wird."
              : term === "12m"
                ? "12 Monate ab Start, danach monatlich kündbar zum Ende des Abrechnungsmonats."
                : term === "3m"
                  ? "3 Monate ab Start, danach monatlich kündbar zum Ende des Abrechnungsmonats."
                  : "Keine Mindestlaufzeit, kündbar zum Ende des jeweiligen Abrechnungsmonats."}
            {termOpen ? (
              <Note>
                Laufzeit wählen Sie unten bei der Annahme: 12 Monate (Setup {eur(setupForChoice("12m", products.length || 1))}), 3 Monate (
                {eur(setupForChoice("3m", products.length || 1))}) oder ohne Laufzeit ({eur(setupForChoice("none", products.length || 1))}), jeweils netto.
              </Note>
            ) : null}
          </Tr>
          <Tr k="Pause / Urlaub">
            {add.annual ? (
              "Jederzeit möglich; die Anzeigen werden gestoppt. Bei jährlicher Vorauszahlung erfolgt für die Pausenzeit keine Gutschrift."
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
          <Tr k="Bei Annahme fällig">
            <b className="text-[#111827]">{eur2(offer.setupFee)}</b> netto (Setup) zzgl. 19 % USt. {eur2(vatOf(offer.setupFee))}
            {" = "}
            <b className="text-[#111827]">{eur2(withVat(offer.setupFee))} brutto</b>
            <Note>
              {add.annualTotal != null ? "Jahresbetrag" : "Erste Monatsgebühr"} ({eur2(firstCharge)} netto, {eur2(withVat(firstCharge))} brutto)
              {offer.startDate ? ` am ${date(offer.startDate)}` : " zum Start"}.
              {termOpen || startOpen ? " Setup und Start richten sich nach Ihrer Wahl bei der Annahme." : ""}
            </Note>
          </Tr>
        </Table>
        <MonthlyOverview
          feeNet={add.annualTotal != null ? add.annualTotal / 12 : add.monthlyTotal ?? offer.monthlyFee}
          adNet={list.monthlyBudget}
          serviceOnly={serviceOnly}
          annual={add.annualTotal != null}
          intro={hasIntro ? { months: offer.introMonths!, fee: offer.introMonthlyFee! } : null}
        />

        <H3>2.1 Zahlung</H3>
        <p className="text-[#374151]">
          {add.annual
            ? "Die Setupgebühr wird mit Vertragsschluss fällig, die Vergütung ab dem Startdatum jährlich im Voraus, per SEPA-Lastschrift oder Karte, automatisch eingezogen. Weitere Logins, die während des Jahres dazukommen, werden anteilig berechnet."
            : "Die Setupgebühr wird mit Vertragsschluss fällig, die monatliche Vergütung ab dem Startdatum monatlich im Voraus, per SEPA-Lastschrift oder Karte, automatisch eingezogen."}
        </p>
        {offer.createdAt < GUARANTEES_FROM ? (
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
            <p className="text-[#374151]">
              <strong>Lead-Garantie:</strong> Bei mindestens 20 € Werbebudget pro Tag bekommen Sie in den ersten 30 Tagen nach
              Kampagnenstart mindestens 100 Leads. Sonst sind Betreuung und Software im Folgemonat kostenlos.
            </p>
            {makler ? (
            <p className="mt-2 text-[#374151]">
              <strong>Vertrags-Garantie (für Makler):</strong> Haben Sie nach 90 aktiven Tagen weniger als{" "}
              {VERTRAGS_GARANTIE_MIN_VERTRAEGE} Verträge abgeschlossen, betreuen wir Sie ohne Gebühr für Betreuung und Software weiter – auf Wunsch
              mit einem anderen Produkt ohne Setupgebühr –, bis Sie sie haben (längstens 6 Monate). Voraussetzung: mindestens 20 € Budget pro Tag, mindestens 80 % der gebuchten Termine
              wahrgenommen und Ergebnisse in der App eingetragen. Details in den AGB (Abschnitt „Garantien“).
            </p>
            ) : (
            <p className="mt-2 text-[#374151]">
              {breakEvenTageFuer(offer.createdAt) > 90 ? (
                <>
                  <strong>Break-even-Garantie (für Vertreter): Spätestens ab dem 4. Monat profitabel.</strong> Liegt Ihre Provision nach 4 Monaten
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
              Termine wahrgenommen und Ergebnisse in der App eingetragen. Details in den AGB (Abschnitt „Garantien“).
            </p>
            )}
          </>
        ) : null}
        {offer.specialTerms ? (
          <>
            <H3>2.3 Sondervereinbarung</H3>
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
