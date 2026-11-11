import { CheckCircle2 } from "lucide-react";
import { LegalSections } from "@/components/legal-sections";
import { AGB, PROVIDER } from "@/lib/legal-texts";
import {
  computeOfferPrice,
  eur,
  offerAddOns,
  PRICE_LIST,
  vatOf,
  withVat,
  type OfferProduct,
  type OfferTerm,
} from "@/lib/offer-pricing";
// Ab wann und für welche Produkte die Garantien gelten (gleiche Regel wie die automatische Prüfung)
import { GUARANTEES_FROM, isGuaranteeProduct } from "@/lib/garantien";

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
  annualPrepay: boolean;
  annualFreeMonths: number | null;
};

type OfferRow = Omit<OfferDoc, "setupFee" | "monthlyFee" | "softwareFee" | "introMonthlyFee" | "seatMonthly" | "bestandMonthly" | "seats" | "seatsIncluded" | "annualPrepay" | "annualFreeMonths"> & {
  setupFee: unknown;
  monthlyFee: unknown;
  softwareFee: unknown;
  introMonthlyFee: unknown;
  seats?: number | null;
  seatsIncluded?: number | null;
  seatMonthly?: unknown;
  bestandMonthly?: unknown;
  annualPrepay?: boolean;
  annualFreeMonths?: number | null;
};

/** Datenbank-Zeile (Decimal) → Darstellungsobjekt (number). */
export function toOfferDoc(o: OfferRow): OfferDoc {
  return {
    ...o,
    setupFee: Number(o.setupFee),
    monthlyFee: Number(o.monthlyFee),
    softwareFee: Number(o.softwareFee),
    introMonthlyFee: o.introMonthlyFee == null ? null : Number(o.introMonthlyFee),
    seats: o.seats ?? null,
    seatsIncluded: o.seatsIncluded ?? null,
    seatMonthly: o.seatMonthly == null ? null : Number(o.seatMonthly),
    bestandMonthly: o.bestandMonthly == null ? null : Number(o.bestandMonthly),
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
  const term = (offer.term === "12m" ? "12m" : "none") as OfferTerm;
  const serviceOnly = offer.package === "service";
  const list = computeOfferPrice({ package: serviceOnly ? "service" : "software", term, products });
  const extra = Math.max(0, products.length - 1);
  const setupIsList = Math.abs(list.setupFee - offer.setupFee) < 0.01;
  const monthlyIsList = list.monthlyFee != null && Math.abs(list.monthlyFee - offer.monthlyFee) < 0.01;
  const add = offerAddOns(offer);
  const hasExtras = add.seatsFee > 0 || add.bestandFee > 0;
  const hasIntro = offer.introMonthlyFee != null && !!offer.introMonths;
  // Erster Monatsbetrag inkl. Zusätze (Startpreis gilt nur für das Paket)
  const firstMonth = round2((hasIntro ? offer.introMonthlyFee! : offer.monthlyFee) + add.seatsFee + add.bestandFee);
  const firstCharge = add.annualTotal ?? firstMonth;
  const productNames = products.map((p) => p.name).join(" & ");

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
              performance<span className="text-[#7aa2ff]">growth</span>
            </div>
            <span className="text-xs text-[#9aa6bd]">performancegrowth.de</span>
          </div>

          <div className="mt-24 sm:mt-32">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#7aa2ff]">
              Angebot · {date(offer.createdAt)}
            </p>
            <h1 className="mt-5 text-[32px] font-bold leading-[1.15] tracking-tight sm:text-[38px]">
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
            <Stat k="Laufzeit" v={term === "12m" ? "12 Monate" : "Monatlich kündbar"} sub="Pause jederzeit möglich" />
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
          {add.bestandFee > 0 ? (
            <Tr k="Bestandskunden-Modul">
              Bestand importieren und gezielt per WhatsApp ansprechen (Lücken, Jahresgespräch, Geburtstag, Ablauf). Inklusive
              WhatsApp-Gebühren für bis zu {PRICE_LIST.bestandIncludedMessages} Kampagnen-Nachrichten je Kalendermonat.
            </Tr>
          ) : null}
          <Tr k="Werbebudget">
            ≈ {eur(list.monthlyBudget)} im Monat. Das Werbebudget zahlt der Kunde direkt an Meta; es ist in den Preisen
            nicht enthalten.
          </Tr>
          {offer.startDate ? <Tr k="Start">{date(offer.startDate)}. Ab diesem Tag läuft die monatliche Vergütung.</Tr> : null}
        </Table>

        <H2 className="mt-12">2. Preise und Zahlungsbedingungen</H2>
        <Table>
          <Tr k="Setup (einmalig)">
            <b className="text-[#111827]">{eur2(offer.setupFee)}</b> netto zzgl. 19 % USt.
            <Note>
              {setupIsList
                ? `${term === "12m" ? "Mit 12 Monaten Laufzeit" : "Ohne Vertragslaufzeit"}${extra ? `, inklusive ${extra} weiteres Produkt${extra > 1 ? "e" : ""}` : ""}`
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
          {add.bestandFee > 0 ? (
            <Tr k="Bestandskunden-Modul">
              <b className="text-[#111827]">{eur2(add.bestandFee)}</b> netto pro Monat
              <Note>Inklusive WhatsApp-Gebühren bis {PRICE_LIST.bestandIncludedMessages} Kampagnen-Nachrichten im Monat; mehr auf Anfrage.</Note>
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
                : "Keine Mindestlaufzeit, kündbar zum Ende des jeweiligen Abrechnungsmonats."}
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
            </Note>
          </Tr>
        </Table>

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
              Kampagnenstart mindestens 100 Leads. Sonst ist die Betreuung im Folgemonat kostenlos.
            </p>
            <p className="mt-2 text-[#374151]">
              <strong>Break-even-Garantie (für Vertreter):</strong> Liegt Ihre Provision nach 90 Tagen unter Ihren Kosten für Werbung und
              Betreuung, betreuen wir Sie ohne Betreuungsgebühr weiter, auf Wunsch mit einem anderen Produkt, bis es sich
              rechnet (längstens 6 Monate). Voraussetzung: mindestens 20 € Budget pro Tag, mindestens 80 % der gebuchten
              Termine wahrgenommen und Ergebnisse in der App eingetragen. Details in den AGB (Abschnitt „Garantien“).
            </p>
          </>
        ) : null}
        {offer.specialTerms ? (
          <>
            <H3>2.3 Sondervereinbarung</H3>
            <p className="whitespace-pre-wrap rounded-lg border-l-4 border-[#2563EB] bg-[#f3f6fd] px-4 py-3 text-[#111827]">
              {offer.specialTerms}
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
