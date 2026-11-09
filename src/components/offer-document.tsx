import { CheckCircle2 } from "lucide-react";
import {
  computeOfferPrice,
  eur,
  PRICE_LIST,
  TERM_LABEL,
  vatOf,
  withVat,
  type OfferProduct,
  type OfferTerm,
} from "@/lib/offer-pricing";

// Angebot / Auftragsbestätigung im Performancegrowth-Design. Wird auf der
// öffentlichen Angebotsseite, in der Admin-Vorschau und im PDF genutzt.

export type OfferDoc = {
  number: string;
  version: number;
  status: string;
  contactName: string;
  company: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
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
};

const TZ = "Europe/Berlin";
const date = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const dateTime = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);

function providerLines(): string[] {
  const raw = process.env.OFFER_PROVIDER_LINES?.trim();
  return raw ? raw.split("|").map((l) => l.trim()).filter(Boolean) : ["Performancegrowth"];
}

type OfferRow = Omit<OfferDoc, "setupFee" | "monthlyFee" | "softwareFee" | "introMonthlyFee"> & {
  setupFee: unknown;
  monthlyFee: unknown;
  softwareFee: unknown;
  introMonthlyFee: unknown;
};

/** Datenbank-Zeile (Decimal) → Darstellungsobjekt (number). */
export function toOfferDoc(o: OfferRow): OfferDoc {
  return {
    ...o,
    setupFee: Number(o.setupFee),
    monthlyFee: Number(o.monthlyFee),
    softwareFee: Number(o.softwareFee),
    introMonthlyFee: o.introMonthlyFee == null ? null : Number(o.introMonthlyFee),
  };
}

export function offerProducts(products: unknown): OfferProduct[] {
  return Array.isArray(products)
    ? (products as OfferProduct[]).filter((p) => p && typeof p.name === "string")
    : [];
}

export function OfferDocument({ offer }: { offer: OfferDoc }) {
  const products = offerProducts(offer.products);
  const term = (offer.term === "12m" ? "12m" : "none") as OfferTerm;
  const list = computeOfferPrice({ term, products });
  const monthlyBudget = list.monthlyBudget;
  const setupIsList = Math.abs(list.setupFee - offer.setupFee) < 0.01;
  const monthlyIsList = list.monthlyFee != null && Math.abs(list.monthlyFee - offer.monthlyFee) < 0.01;
  const extra = Math.max(0, products.length - 1);

  return (
    <article className="offer-doc mx-auto w-full max-w-[860px] bg-white text-[15px] leading-relaxed text-[#111114]">
      {/* Kopf */}
      <header className="flex flex-col gap-6 border-b border-[#e3e8f2] pb-8 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2563EB] text-white">↗</span>
            performance<span className="text-[#2563EB]">growth</span>
          </div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight">Angebot &amp; Auftragsbestätigung</h1>
          <p className="mt-1 text-[#5b5e68]">Leadgenerierung + Software für Versicherungsvermittler</p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm sm:text-right">
          <dt className="text-[#5b5e68]">Angebot</dt>
          <dd className="whitespace-nowrap font-semibold">{offer.number}{offer.version > 1 ? ` (Version ${offer.version})` : ""}</dd>
          <dt className="text-[#5b5e68]">Datum</dt>
          <dd>{date(offer.createdAt)}</dd>
          <dt className="text-[#5b5e68]">Gültig bis</dt>
          <dd>{date(offer.validUntil)}</dd>
        </dl>
      </header>

      {/* Parteien */}
      <section className="grid gap-6 border-b border-[#e3e8f2] py-8 sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[#5b5e68]">Für</div>
          <div className="mt-2">
            {offer.company ? <div className="font-semibold">{offer.company}</div> : null}
            <div>{offer.contactName}</div>
            {offer.street ? <div>{offer.street}</div> : null}
            {offer.zip || offer.city ? <div>{[offer.zip, offer.city].filter(Boolean).join(" ")}</div> : null}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[#5b5e68]">Von</div>
          <div className="mt-2">
            {providerLines().map((l, i) => (
              <div key={i} className={i === 0 ? "font-semibold" : undefined}>{l}</div>
            ))}
          </div>
        </div>
      </section>

      {/* Leistungen */}
      <section className="break-inside-avoid border-b border-[#e3e8f2] py-8">
        <h2 className="text-lg font-bold">Leistungen</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-[#EFF6FF] p-5">
            <div className="font-semibold">Leadgenerierung</div>
            <ul className="mt-2 space-y-1 text-sm text-[#33343a]">
              <li>• Kampagnen auf Facebook &amp; Instagram</li>
              <li>• Werbemittel und Lead-Formular</li>
              <li>• Laufende Optimierung und Austausch müder Anzeigen</li>
              <li>• Exklusive Leads – nur für Sie</li>
            </ul>
          </div>
          <div className="rounded-xl bg-[#EFF6FF] p-5">
            <div className="font-semibold">Software</div>
            <ul className="mt-2 space-y-1 text-sm text-[#33343a]">
              <li>• Digitaler Assistent auf WhatsApp</li>
              <li>• Terminbuchung im eigenen Kalender inkl. Erinnerungen</li>
              <li>• „Heute“-Liste, Pipeline und Wiedervorlagen</li>
              <li>• Zahlen: Kosten pro Lead, Termin und Abschluss</li>
            </ul>
          </div>
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-[#e3e8f2] text-left text-[#5b5e68]">
              <th className="py-2 font-medium">Produkt</th>
              <th className="py-2 text-right font-medium">pro Tag</th>
              <th className="whitespace-nowrap py-2 text-right font-medium">≈ pro Monat</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={i} className="border-b border-[#eef1f6]">
                <td className="py-2">{p.name}</td>
                <td className="whitespace-nowrap py-2 text-right">{eur(p.dailyBudget)}</td>
                <td className="whitespace-nowrap py-2 text-right">{eur(Math.round(p.dailyBudget * PRICE_LIST.daysPerMonth))}</td>
              </tr>
            ))}
            <tr>
              <td className="py-2 font-semibold">Gesamt</td>
              <td />
              <td className="whitespace-nowrap py-2 text-right font-semibold">{eur(monthlyBudget)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-[#5b5e68]">Das Werbebudget zahlen Sie direkt an Meta. Es ist in den Preisen unten nicht enthalten.</p>
      </section>

      {/* Preise */}
      <section className="break-inside-avoid border-b border-[#e3e8f2] py-8">
        <h2 className="text-lg font-bold">Preise</h2>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-[#e3e8f2] text-left text-[#5b5e68]">
              <th className="py-2 font-medium">Position</th>
              <th className="py-2 text-right font-medium">Netto</th>
              <th className="hidden whitespace-nowrap py-2 text-right font-medium sm:table-cell print:table-cell">USt. 19 %</th>
              <th className="py-2 text-right font-medium">Brutto</th>
            </tr>
          </thead>
          <tbody>
            <PriceRow
              label="Setup (einmalig)"
              note={
                setupIsList
                  ? `${term === "12m" ? "Mit 12 Monaten Laufzeit" : "Ohne Laufzeit"}${extra ? ` · inkl. ${extra} weiteres Produkt${extra > 1 ? "e" : ""}` : ""}`
                  : "Sonderkondition"
              }
              net={offer.setupFee}
            />
            {offer.introMonthlyFee != null && offer.introMonths ? (
              <PriceRow
                label={`Betreuung + Software – Monat 1 bis ${offer.introMonths}`}
                note="Startpreis"
                net={offer.introMonthlyFee}
              />
            ) : null}
            <PriceRow
              label={
                offer.introMonthlyFee != null && offer.introMonths
                  ? `Betreuung + Software – ab Monat ${offer.introMonths + 1}`
                  : "Betreuung + Software (monatlich)"
              }
              note={
                monthlyIsList
                  ? `Werbebudget ${list.tierLabel}${extra ? ` · inkl. ${extra} × ${eur(PRICE_LIST.extraProductMonthly)} für weitere Produkte` : ""}`
                  : "Sonderkondition"
              }
              net={offer.monthlyFee}
            />
          </tbody>
        </table>
      </section>

      {/* Konditionen */}
      <section className="break-inside-avoid border-b border-[#e3e8f2] py-8">
        <h2 className="text-lg font-bold">Konditionen</h2>
        <ul className="mt-4 space-y-2 text-sm">
          <Cond>
            <b>Laufzeit:</b> {TERM_LABEL[term]}
            {offer.startDate ? `, Start ${date(offer.startDate)}` : ""}.
          </Cond>
          <Cond>
            <b>Pause oder Urlaub jederzeit:</b> Die Anzeigen werden gestoppt, Sie zahlen in dieser Zeit nur die
            Software ({eur(offer.softwareFee)} netto im Monat).
          </Cond>
          <Cond>
            <b>WhatsApp-Gebühren</b> von Meta werden nach Verbrauch weiterberechnet (meist 10–40 € im Monat).
          </Cond>
          <Cond>
            <b>Garantie:</b> Läuft ein Produkt für Sie nicht profitabel, richten wir ein weiteres Produkt Ihrer Wahl
            kostenlos ein – so lange, bis Sie ein Produkt haben, mit dem Sie zufrieden sind.
          </Cond>
        </ul>
        {offer.specialTerms ? (
          <div className="mt-5 rounded-xl border-l-4 border-[#2563EB] bg-[#EFF6FF] px-5 py-4 text-sm">
            <div className="font-semibold">Sondervereinbarung</div>
            <p className="mt-1 whitespace-pre-wrap">{offer.specialTerms}</p>
          </div>
        ) : null}
        <p className="mt-4 text-xs text-[#5b5e68]">
          Alle Preise in Euro, netto zzgl. 19 % USt.
          {offer.termsUrl ? (
            <>
              {" "}Es gelten unsere <a className="underline" href={offer.termsUrl} target="_blank" rel="noreferrer">AGB</a>
              {offer.dpaUrl ? (
                <> und der <a className="underline" href={offer.dpaUrl} target="_blank" rel="noreferrer">Auftragsverarbeitungsvertrag</a></>
              ) : null}
              .
            </>
          ) : null}
        </p>
      </section>

      {offer.acceptedAt ? (
        <section className="py-8">
          <div className="flex items-start gap-3 rounded-xl bg-emerald-50 px-5 py-4 text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="text-sm">
              <div className="font-semibold">Angenommen</div>
              Online angenommen am {dateTime(offer.acceptedAt)} Uhr von {offer.acceptedName}.
            </div>
          </div>
        </section>
      ) : null}
    </article>
  );
}

function PriceRow({ label, note, net }: { label: string; note?: string; net: number }) {
  return (
    <tr className="border-b border-[#eef1f6] align-top">
      <td className="py-3">
        <div className="font-medium">{label}</div>
        {note ? <div className="text-xs text-[#5b5e68]">{note}</div> : null}
      </td>
      <td className="whitespace-nowrap py-3 pl-3 text-right font-semibold">{eur(net)}</td>
      <td className="hidden whitespace-nowrap py-3 pl-3 text-right text-[#5b5e68] sm:table-cell print:table-cell">{eur(vatOf(net))}</td>
      <td className="whitespace-nowrap py-3 pl-3 text-right">{eur(withVat(net))}</td>
    </tr>
  );
}

function Cond({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2563EB]" />
      <span>{children}</span>
    </li>
  );
}
