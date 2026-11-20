"use client";

import { useActionState, useEffect, useState } from "react";
import { BellRing, CheckCircle2, Loader2, Plus, X } from "lucide-react";
import { acceptOfferAction, type AcceptState } from "./actions";
import {
  eur,
  KUNDE_MAX_PRODUKTE,
  listenMonatsgebuehr,
  monthlyBudgetOf,
  prepayFreeMonthsFor,
  prepayPossible,
  PRICE_LIST,
  vorauszahlungBetraege,
  withVat,
  type OfferProduct,
  type OfferTerm,
} from "@/lib/offer-pricing";
import { ZahlartAuswahl } from "@/components/zahlart-auswahl";
import { ZAHLART_HINWEIS, ZAHLART_HINWEIS_HALBJAHR, ZAHLART_HINWEIS_JAHR } from "@/lib/zahlart";
import { addMonthsIso, contractSummaryLines, hasPriceStep, priceStepAckText, type ContractSummaryInput } from "@/lib/vertrag-laufzeit";
import { BUSINESS_CONFIRM_TEXT } from "@/lib/unternehmer";
import { ErsteWocheFelder, type ErsteWocheProps } from "./erste-woche-felder";
import { ERSTE_WOCHE_MIN, ersteWocheFaellig } from "@/lib/ppl/erste-woche-shared";

/** Wahl von Laufzeit/Startdatum (vom Server vorberechnet; verbindlich rechnet der Server bei Annahme neu). */
export type OfferChoiceProps = {
  choosesTerm: boolean;
  choosesStart: boolean;
  initialTerm: OfferTerm;
  /** Setup je Laufzeit (netto); list = Listenpreis vor Empfehlungsrabatt (nur wenn abweichend). */
  options: { term: OfferTerm; label: string; setup: number; list?: number | null }[];
  /** Monatlich gesamt inkl. Zusätze (netto). */
  monthlyTotal: number;
  /** Kunde wählt Produkte und Tagesbudget (Ole, 19.11.2026); Monatsgebühr nach Staffel plus monthlyExtras. */
  choosesProducts?: boolean;
  /** Produkte im Angebot (Vorbelegung). */
  products?: OfferProduct[];
  /** Wählbare Produkte und Tagesbudgets (verbindlich prüft der Server). */
  productOptions?: { namen: string[]; stufen: number[] };
  /** Zusätze je Monat (weitere Verkäufer, Module), unabhängig von den Produkten. */
  monthlyExtras?: number;
  /** Vorauszahlung im Angebot vereinbart oder zur Wahl angeboten (gilt nur mit 6 oder 12 Monaten). */
  annualOffered: boolean;
  /** „Vorauszahlung anbieten“: Kunde wählt monatlich oder im Voraus (6 Monate bzw. jährlich). */
  choosesAnnual?: boolean;
  /** Vorauswahl der Zahlweise (neue Angebote: monatlich). */
  initialAnnual?: boolean;
  /** Geschenkte Monate für die Laufzeit des Angebots (initialTerm); andere Laufzeiten: Standard. */
  freeMonths: number;
  /** Altangebot mit fest vereinbarter Jahreszahlung: gilt nur mit 12 Monaten. */
  legacyAnnual?: boolean;
  start: { min: string; max: string; preset: string };
  /** Ohne Einrichtungsgebühr (Pay-per-Lead + Software): Laufzeiten ohne Setup-Zeile, „Jetzt fällig: 0 €“. */
  ohneEinrichtung?: boolean;
  /** Kampagnen im eigenen Werbekonto (Ole, 20.11.2026): Monatsbetrag ist die Software („Software monatlich“). */
  softwareMonatlich?: boolean;
};

const fmtDate = (iso: string) => iso.split("-").reverse().join(".");

/** Vorauszahlung mit dieser Laufzeit möglich (Altangebote mit fester Jahreszahlung: nur 12 Monate). */
const voraus = (choice: Pick<OfferChoiceProps, "annualOffered" | "legacyAnnual">, t: OfferTerm) =>
  choice.annualOffered && (choice.legacyAnnual ? t === "12m" : prepayPossible(t));
/** Geschenkte Monate je Laufzeit: gespeicherter Wert für die Laufzeit des Angebots, sonst Standard (6m: 1, 12m: 2). */
const freiFuer = (choice: Pick<OfferChoiceProps, "initialTerm" | "freeMonths">, t: OfferTerm) =>
  t === choice.initialTerm ? choice.freeMonths : prepayFreeMonthsFor(t);

export function AcceptForm({
  token,
  termsUrl,
  dpaUrl,
  defaultName,
  defaultCompany = "",
  pricing,
  choice,
  payment = false,
  payLater = false,
  ueberweisungTage = null,
  ersteWoche = null,
  kundenkontoFaellig = null,
}: {
  token: string;
  termsUrl: string;
  dpaUrl: string;
  defaultName: string;
  defaultCompany?: string;
  /** Feste Konditionen des Angebots; Laufzeit/Start/Setup aus der Wahl gehen vor (Anzeige direkt am Knopf). */
  pricing: ContractSummaryInput;
  choice?: OfferChoiceProps | null;
  /** Online-Zahlung eingerichtet: Zahlart vor dem Weiterleiten wählen (Lastschrift vorausgewählt) */
  payment?: boolean;
  /** „Später zahlen“ erlaubt (Ole am Angebot): Hinweis vor der Annahme, die Wahl kommt danach im Zahlungsfeld */
  payLater?: boolean;
  /** Überweisung am Angebot freigegeben (nur auf Anfrage): Zahlungsziel in Tagen */
  ueberweisungTage?: number | null;
  /** „Ihre erste Woche“ (Pay-per-Lead + Software mit Lead-Produkt): Anzahl, Wiederholung, Registernummer */
  ersteWoche?: ErsteWocheProps | null;
  /** Kampagnen im eigenen Werbekonto: Startpaket statt „Jetzt fällig: 0 €“ (lib/ppl/kundenkonto.ts kundenkontoFaellig) */
  kundenkontoFaellig?: { label: string; betrag: string; zusatz: string } | null;
}) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(
    acceptOfferAction.bind(null, token),
    {},
  );
  const [term, setTerm] = useState<OfferTerm>(choice?.initialTerm ?? "12m");
  const [startDate, setStartDate] = useState(choice?.start.preset ?? "");
  const [annualPick, setAnnualPick] = useState(!!choice?.initialAnnual);
  const [produkte, setProdukte] = useState<OfferProduct[]>(choice?.products ?? []);
  // Erste Woche: Anzahl und Wiederholung hier, damit Zusammenfassung und fälliger Betrag live mitgehen
  const [wocheQty, setWocheQty] = useState(Math.max(ERSTE_WOCHE_MIN, ersteWoche?.quantity ?? ERSTE_WOCHE_MIN));
  const [wocheRenew, setWocheRenew] = useState(true);
  const wocheWahl = ersteWoche
    ? { productKey: ersteWoche.productKey, name: ersteWoche.name, price: ersteWoche.price, quantity: Math.max(ERSTE_WOCHE_MIN, wocheQty), autoRenew: wocheRenew }
    : null;
  // Produktwahl: Monatsgebühr nach Staffel (null = individuell, dann keine Online-Annahme)
  const waehltProdukte = !!choice?.choosesProducts && produkte.length > 0;
  const gebuehr = waehltProdukte ? listenMonatsgebuehr(produkte) : null;
  const individuell = waehltProdukte && gebuehr == null;
  const monthlyTotal = waehltProdukte && gebuehr != null ? Math.round((gebuehr + (choice?.monthlyExtras ?? 0)) * 100) / 100 : (choice?.monthlyTotal ?? pricing.monthlyTotal);
  // Konditionen mit der aktuellen Wahl (verbindlich rechnet der Server bei der Annahme)
  const effTerm = choice?.choosesTerm ? term : pricing.term;
  const annual = choice
    ? voraus(choice, effTerm) && (choice.choosesAnnual ? annualPick : pricing.annual)
    : pricing.annual && prepayPossible(effTerm);
  const summary: ContractSummaryInput = {
    ...pricing,
    monthlyTotal,
    term: effTerm,
    startIso: choice?.choosesStart ? startDate || null : pricing.startIso,
    setup: choice ? (choice.options.find((o) => o.term === effTerm)?.setup ?? pricing.setup) : pricing.setup,
    annual,
    ...(choice ? { freeMonths: freiFuer(choice, effTerm) } : {}),
    ...(wocheWahl ? { ersteWoche: wocheWahl } : {}),
  };
  const hasChoice = !!choice && (choice.choosesTerm || choice.choosesStart || !!choice.choosesAnnual || !!choice.choosesProducts);
  const priceStep = hasPriceStep(summary);

  useEffect(() => {
    if (state.checkoutUrl) window.location.href = state.checkoutUrl;
  }, [state.checkoutUrl]);

  if (state.ok && state.checkoutUrl) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-[#EFF6FF] px-5 py-4 text-[#1e3a8a]">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
        <div>
          <div className="font-semibold">Vielen Dank, Ihr Auftrag ist bestätigt.</div>
          <p className="mt-1 text-sm">Sie werden zur sicheren Zahlungseinrichtung (Stripe) weitergeleitet …</p>
        </div>
      </div>
    );
  }

  if (state.ok) {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-emerald-50 px-5 py-4 text-emerald-900">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <div className="font-semibold">Vielen Dank, Ihr Auftrag ist bestätigt.</div>
          <p className="mt-1 text-sm">Sie bekommen gleich eine E-Mail mit Ihrem Zugang. Die Einrichtung dauert ca. 20 bis 30 Minuten, Sie können jederzeit unterbrechen; auf Wunsch helfen wir Ihnen in einem 15-Minuten-Termin.</p>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {ersteWoche ? <ErsteWocheFelder {...ersteWoche} qty={wocheQty} setQty={setWocheQty} autoRenew={wocheRenew} setAutoRenew={setWocheRenew} /> : null}
      {choice && hasChoice ? (
        <ChoiceFields choice={{ ...choice, monthlyTotal }} produkte={produkte} setProdukte={setProdukte} individuell={individuell} term={term} setTerm={setTerm} startDate={startDate} setStartDate={setStartDate} annual={annualPick} setAnnual={setAnnualPick} arrears={!!pricing.paymentInArrears} faellig={wocheWahl ? ersteWocheFaellig(wocheWahl) : kundenkontoFaellig} />
      ) : null}
      <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-4 text-sm sm:p-5" data-accept-summary aria-live="polite">
        <div className="font-semibold">Das vereinbaren Sie mit dem Klick</div>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[#374151]">
          {contractSummaryLines(summary).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="company" className="text-sm font-medium">
            Firma bzw. Unternehmen
          </label>
          <input
            id="company"
            name="company"
            required
            minLength={2}
            defaultValue={defaultCompany}
            autoComplete="organization"
            className="mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20"
          />
        </div>
        <div>
          <label htmlFor="vatId" className="text-sm font-medium">
            USt-IdNr. <span className="font-normal text-[color:var(--muted)]">(falls vorhanden)</span>
          </label>
          <input
            id="vatId"
            name="vatId"
            placeholder="DE123456789"
            className="mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20"
          />
        </div>
      </div>
      <div>
        <label htmlFor="name" className="text-sm font-medium">
          Ihr vollständiger Name
        </label>
        <input
          id="name"
          name="name"
          required
          minLength={3}
          defaultValue={defaultName}
          autoComplete="name"
          className="mt-1 h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20"
        />
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="business" required className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--brand)]" />
        <span>{BUSINESS_CONFIRM_TEXT}</span>
      </label>
      {priceStep ? (
        <label className="flex items-start gap-3 text-sm" data-accept-price-step>
          <input type="checkbox" name="priceStep" required className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--brand)]" />
          <span>{priceStepAckText(summary)}</span>
        </label>
      ) : null}
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--brand)]" />
        <span>
          Ich akzeptiere die{" "}
          <a href={termsUrl} target="_blank" rel="noreferrer" className="font-medium text-[color:var(--brand)] underline">
            AGB
          </a>{" "}
          und den{" "}
          <a href={dpaUrl} target="_blank" rel="noreferrer" className="font-medium text-[color:var(--brand)] underline">
            Auftragsverarbeitungsvertrag
          </a>{" "}
          und nehme dieses Angebot verbindlich an.
        </span>
      </label>
      {payment ? (
        <div className="max-w-md">
          <ZahlartAuswahl ueberweisungTage={ueberweisungTage} hint={annual ? (effTerm === "6m" ? ZAHLART_HINWEIS_HALBJAHR : ZAHLART_HINWEIS_JAHR) : ZAHLART_HINWEIS} />
        </div>
      ) : payLater ? (
        <p className="flex items-start gap-2 text-sm text-[color:var(--muted)]" data-pay-later-hinweis>
          <BellRing className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Nach der Annahme zahlen Sie direkt oder wählen einen späteren Tag, an dem wir Sie an die Zahlung erinnern.</span>
        </p>
      ) : null}
      {state.error ? <p className="text-sm font-medium text-rose-700">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending || individuell}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white shadow-[var(--shadow-sm)] transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60 sm:w-auto"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        Angebot verbindlich annehmen
      </button>
      <p className="text-xs text-[color:var(--muted)]">
        Mit dem Klick schließen Sie den Vertrag zu den oben genannten Konditionen
        {choice && hasChoice ? ` mit ${gewaehltText(choice)}` : ""}.
        Zeitpunkt und Name werden zur Dokumentation gespeichert.
      </p>
    </form>
  );
}

/** „der hier gewählten Laufzeit, Zahlweise und dem gewählten Start“ je nach freigegebener Wahl. */
function gewaehltText(choice: OfferChoiceProps): string {
  const teile = [choice.choosesProducts ? "Produkte" : null, choice.choosesTerm ? "Laufzeit" : null, choice.choosesAnnual ? "Zahlweise" : null].filter(Boolean) as string[];
  const vorne = teile.length ? `der hier gewählten ${teile.join(" und ")}` : "";
  return [vorne, choice.choosesStart ? "dem gewählten Start" : ""].filter(Boolean).join(" und ");
}

function ChoiceFields({
  choice,
  produkte,
  setProdukte,
  individuell,
  term,
  setTerm,
  startDate,
  setStartDate,
  annual: annualPick,
  setAnnual,
  arrears = false,
  faellig = null,
}: {
  choice: OfferChoiceProps;
  produkte: OfferProduct[];
  setProdukte: (p: OfferProduct[]) => void;
  /** Gewähltes Werbebudget über der Staffel: individuelles Angebot, keine Online-Annahme */
  individuell: boolean;
  term: OfferTerm;
  setTerm: (t: OfferTerm) => void;
  startDate: string;
  setStartDate: (d: string) => void;
  annual: boolean;
  setAnnual: (v: boolean) => void;
  /** Zahlung nachträglich für den abgelaufenen Monat (Ole, 19.11.2026) */
  arrears?: boolean;
  /** Erste Woche (Pay-per-Lead + Software): Leadkosten statt „Jetzt fällig: 0 €“ */
  faellig?: ReturnType<typeof ersteWocheFaellig> | null;
}) {
  const opt = choice.options.find((o) => o.term === term) ?? choice.options[0];
  // Vorauszahlung mit 6 Monaten (6 Monate im Voraus) oder 12 Monaten (jährlich); zur Wahl angeboten → Wahl des
  // Kunden, sonst wie vereinbart
  const effTerm = choice.choosesTerm ? term : choice.initialTerm;
  const annualPossible = voraus(choice, effTerm);
  const annual = annualPossible && (choice.choosesAnnual ? annualPick : true);
  const v = vorauszahlungBetraege(choice.monthlyTotal, effTerm, freiFuer(choice, effTerm));
  const annualTotal = v.total;
  return (
    <div className="space-y-4 rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-4 sm:p-5">
      {choice.choosesProducts && choice.productOptions ? (
        <ProduktWahl produkte={produkte} setProdukte={setProdukte} optionen={choice.productOptions} individuell={individuell} />
      ) : null}
      {choice.choosesTerm ? (
        <fieldset>
          <legend className="text-sm font-medium">Laufzeit wählen</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup">
            {choice.options.map((o) => (
              <label
                key={o.term}
                className={`flex cursor-pointer items-start gap-2 rounded-[var(--radius-md)] border bg-white px-3 py-2.5 text-sm transition ${
                  term === o.term
                    ? "border-[color:var(--brand)] ring-2 ring-[color:var(--brand)]/20"
                    : "border-[color:var(--border)] hover:border-[color:var(--border-strong)]"
                }`}
              >
                <input
                  type="radio"
                  name="term"
                  value={o.term}
                  checked={term === o.term}
                  onChange={() => setTerm(o.term)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--brand)]"
                />
                <span className="min-w-0">
                  <span className="block font-semibold">{o.label}</span>
                  <span className="block text-xs text-[color:var(--muted)]">
                    {choice.ohneEinrichtung ? (
                      o.term === "none" ? "monatlich kündbar" : "danach monatlich kündbar"
                    ) : (
                      <>
                        Setup {o.list != null && o.list > o.setup ? <s className="mr-1">{eur(o.list)}</s> : null}
                        {eur(o.setup)} netto
                      </>
                    )}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {choice.choosesAnnual && annualPossible ? (
        <ZahlweiseWahl monthly={choice.monthlyTotal} v={v} annual={annualPick} setAnnual={setAnnual} />
      ) : null}
      {choice.choosesStart ? (
        <div>
          <label htmlFor="startDate" className="block text-sm font-medium">
            Start
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            required
            min={choice.start.min}
            max={choice.start.max}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 block h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20 sm:w-60"
          />
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            Ab diesem Tag läuft {annual ? "die Vergütung" : "die Monatsgebühr"}.{choice.ohneEinrichtung ? "" : " Die Einrichtung dauert ca. 1–2 Wochen."} Möglich: {fmtDate(choice.start.min)} bis{" "}
            {fmtDate(choice.start.max)}.
          </p>
        </div>
      ) : null}
      <div className="grid gap-2 border-t border-[#e5e7eb] pt-3 text-sm sm:grid-cols-2" aria-live="polite">
        {annual ? (
          // Vorauszahlung mit der Annahme fällig (Ole, 19.11.2026): Setup und erster Zeitraum jetzt, danach zur Verlängerung
          <>
            <div>
              <span className="text-[color:var(--muted)]">Jetzt fällig (Setup und Vorauszahlung): </span>
              <b data-testid="choice-setup">{eur(opt.setup + annualTotal)} netto</b>
              <span className="text-[color:var(--muted)]"> · {eur(withVat(opt.setup + annualTotal))} brutto</span>
            </div>
            <div>
              <span className="text-[color:var(--muted)]">
                {v.months === 6 ? "Danach alle 6 Monate" : "Danach jährlich"}
                {startDate ? ` ab ${fmtDate(addMonthsIso(startDate, v.months))}` : ""}:{" "}
              </span>
              <b data-testid="choice-recurring">{eur(annualTotal)} netto</b>
              <span className="text-[color:var(--muted)]"> · {eur(withVat(annualTotal))} brutto</span>
            </div>
          </>
        ) : (
          <>
            {choice.ohneEinrichtung && faellig ? (
              // Faire Anzeige (Ole, 20.11.2026): Leadkosten der ersten Woche statt „0 €“; abgebucht nach der Registerprüfung
              <div data-erste-woche-faellig>
                <span className="text-[color:var(--muted)]">{faellig.label}</span>
                <b data-testid="choice-setup">{faellig.betrag}</b>
                <span className="text-[color:var(--muted)]">{faellig.zusatz}</span>
                <span className="block text-xs text-[color:var(--muted)]">Keine Einrichtungsgebühr</span>
              </div>
            ) : choice.ohneEinrichtung ? (
              <div>
                <span className="text-[color:var(--muted)]">Jetzt fällig: </span>
                <b data-testid="choice-setup">{eur(0)}</b>
                <span className="text-[color:var(--muted)]">, keine Einrichtungsgebühr</span>
              </div>
            ) : (
            <div>
              <span className="text-[color:var(--muted)]">Jetzt fällig (Setup): </span>
              {opt.list != null && opt.list > opt.setup ? <s className="mr-1 text-[color:var(--muted)]">{eur(opt.list)}</s> : null}
              <b data-testid="choice-setup">{eur(opt.setup)} netto</b>
              <span className="text-[color:var(--muted)]"> · {eur(withVat(opt.setup))} brutto</span>
            </div>
            )}
            <div>
              <span className="text-[color:var(--muted)]">
                {arrears
                  ? `Monatlich nachträglich, erstmals ${startDate ? `am ${fmtDate(addMonthsIso(startDate, 1))}` : "einen Monat nach dem Start"}: `
                  : `${choice.softwareMonatlich ? "Software monatlich" : "Monatlich"}${startDate ? ` ab ${fmtDate(startDate)}` : ""}: `}
              </span>
              <b data-testid="choice-recurring">{eur(choice.monthlyTotal)} netto</b>
              <span className="text-[color:var(--muted)]"> · {eur(withVat(choice.monthlyTotal))} brutto</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Produkte und Tagesbudget (Ole, 19.11.2026): je Produkt eine Zeile mit zwei Auswahlfeldern, darunter das Werbebudget im
 * Monat. Feld „produkte“ (JSON); verbindlich prüft und rechnet der Server (lib/offer-pricing.ts resolveProduktWahl).
 */
function ProduktWahl({
  produkte,
  setProdukte,
  optionen,
  individuell,
}: {
  produkte: OfferProduct[];
  setProdukte: (p: OfferProduct[]) => void;
  optionen: { namen: string[]; stufen: number[] };
  individuell: boolean;
}) {
  const feld =
    "h-11 min-w-0 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-[15px] outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/20";
  const setze = (i: number, p: Partial<OfferProduct>) => setProdukte(produkte.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const frei = optionen.namen.filter((n) => !produkte.some((p) => p.name === n));
  const budget = monthlyBudgetOf(produkte);
  return (
    <div role="group" aria-labelledby="produkt-wahl-titel" data-produkt-wahl className="min-w-0">
      <div id="produkt-wahl-titel" className="text-sm font-medium">
        Produkte und Tagesbudget
      </div>
      <input type="hidden" name="produkte" value={JSON.stringify(produkte)} />
      <div className="mt-2 space-y-2 sm:max-w-md">
        {produkte.map((p, i) => (
          <div key={i} className="flex items-center gap-2" data-produkt-zeile>
            <select aria-label={`Produkt ${i + 1}`} value={p.name} onChange={(e) => setze(i, { name: e.target.value })} className={`${feld} w-0 flex-1`}>
              {optionen.namen
                .filter((n) => n === p.name || !produkte.some((x) => x.name === n))
                .map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
            </select>
            <select
              aria-label={`Tagesbudget ${p.name}`}
              value={p.dailyBudget}
              onChange={(e) => setze(i, { dailyBudget: Number(e.target.value) })}
              className={`${feld} w-[124px] shrink-0`}
            >
              {optionen.stufen.map((d) => (
                <option key={d} value={d}>
                  {d} €/Tag
                </option>
              ))}
            </select>
            {produkte.length > 1 ? (
              <button
                type="button"
                aria-label={`${p.name} entfernen`}
                onClick={() => setProdukte(produkte.filter((_, j) => j !== i))}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[color:var(--muted)] hover:bg-white hover:text-[#0b1220]"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
        {produkte.length < KUNDE_MAX_PRODUKTE && frei.length ? (
          <button
            type="button"
            onClick={() => setProdukte([...produkte, { name: frei[0], dailyBudget: optionen.stufen.includes(20) ? 20 : optionen.stufen[0] }])}
            className="inline-flex h-9 items-center gap-1 font-medium text-[color:var(--brand)]"
          >
            <Plus className="h-4 w-4" /> Produkt hinzufügen
          </button>
        ) : (
          <span />
        )}
        <span className="text-[color:var(--muted)]" aria-live="polite" data-werbebudget>
          Werbebudget ca. {eur(budget)} im Monat, direkt an Meta
        </span>
      </div>
      {individuell ? (
        <p className="mt-2 text-sm font-medium text-rose-700" data-produkt-individuell>
          Ab {eur(PRICE_LIST.individualFrom)} Werbebudget im Monat gibt es ein individuelles Angebot. Bitte ein kleineres Budget wählen oder uns ansprechen.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Zahlweise zur Wahl (Ole, 18.11.2026): zwei Karten, monatlich vorausgewählt, Vorauszahlung als „Empfohlen“ markiert.
 * 12 Monate: „Jährlich im Voraus“, 6 Monate: „6 Monate im Voraus“ (gleiche Karte, gleiche Logik).
 * Feldname „rhythmus“ (monat | jahr | voraus); verbindlich rechnet der Server bei der Annahme. Keine Gedankenstriche.
 */
function ZahlweiseWahl({
  monthly,
  v,
  annual,
  setAnnual,
}: {
  monthly: number;
  v: { total: number; savings: number; freeMonths: number; months: number };
  annual: boolean;
  setAnnual: (v: boolean) => void;
}) {
  const halb = v.months === 6;
  const card = (active: boolean) =>
    `flex cursor-pointer items-start gap-2 rounded-[var(--radius-md)] border bg-white px-3 py-2.5 text-sm transition ${
      active ? "border-[color:var(--brand)] ring-2 ring-[color:var(--brand)]/20" : "border-[color:var(--border)] hover:border-[color:var(--border-strong)]"
    }`;
  const radio = "mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--brand)]";
  return (
    <fieldset data-zahlweise-wahl>
      <legend className="text-sm font-medium">Zahlweise wählen</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup">
        <label className={card(!annual)} data-zahlweise="monat">
          <input type="radio" name="rhythmus" value="monat" checked={!annual} onChange={() => setAnnual(false)} className={radio} />
          <span className="min-w-0">
            <span className="block font-semibold">Monatlich</span>
            <span className="block text-[13px] text-[#374151]">{eur(monthly)} netto im Monat</span>
          </span>
        </label>
        <label className={card(annual)} data-zahlweise={halb ? "voraus" : "jahr"}>
          <input type="radio" name="rhythmus" value={halb ? "voraus" : "jahr"} checked={annual} onChange={() => setAnnual(true)} className={radio} />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">{halb ? "6 Monate im Voraus" : "Jährlich im Voraus"}</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Empfohlen</span>
            </span>
            <span className="block text-[13px] text-[#374151]">{eur(v.total)} netto {halb ? "für 6 Monate" : "im Jahr"}</span>
            <span className="block text-xs font-medium text-emerald-700">
              {v.freeMonths} {v.freeMonths === 1 ? "Monat" : "Monate"} geschenkt, Sie sparen {eur(v.savings)}
            </span>
          </span>
        </label>
      </div>
    </fieldset>
  );
}
