"use client";

import { useActionState, useEffect, useState } from "react";
import { BellRing, CheckCircle2, Loader2 } from "lucide-react";
import { acceptOfferAction, type AcceptState } from "./actions";
import { eur, prepayFreeMonthsFor, prepayPossible, vorauszahlungBetraege, withVat, type OfferTerm } from "@/lib/offer-pricing";
import { ZahlartAuswahl } from "@/components/zahlart-auswahl";
import { ZAHLART_HINWEIS, ZAHLART_HINWEIS_HALBJAHR, ZAHLART_HINWEIS_JAHR } from "@/lib/zahlart";
import { contractSummaryLines, hasPriceStep, priceStepAckText, type ContractSummaryInput } from "@/lib/vertrag-laufzeit";
import { BUSINESS_CONFIRM_TEXT } from "@/lib/unternehmer";

/** Wahl von Laufzeit/Startdatum (vom Server vorberechnet; verbindlich rechnet der Server bei Annahme neu). */
export type OfferChoiceProps = {
  choosesTerm: boolean;
  choosesStart: boolean;
  initialTerm: OfferTerm;
  /** Setup je Laufzeit (netto); list = Listenpreis vor Empfehlungsrabatt (nur wenn abweichend). */
  options: { term: OfferTerm; label: string; setup: number; list?: number | null }[];
  /** Monatlich gesamt inkl. Zusätze (netto). */
  monthlyTotal: number;
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
}) {
  const [state, action, pending] = useActionState<AcceptState, FormData>(
    acceptOfferAction.bind(null, token),
    {},
  );
  const [term, setTerm] = useState<OfferTerm>(choice?.initialTerm ?? "12m");
  const [startDate, setStartDate] = useState(choice?.start.preset ?? "");
  const [annualPick, setAnnualPick] = useState(!!choice?.initialAnnual);
  // Konditionen mit der aktuellen Wahl (verbindlich rechnet der Server bei der Annahme)
  const effTerm = choice?.choosesTerm ? term : pricing.term;
  const annual = choice
    ? voraus(choice, effTerm) && (choice.choosesAnnual ? annualPick : pricing.annual)
    : pricing.annual && prepayPossible(effTerm);
  const summary: ContractSummaryInput = {
    ...pricing,
    term: effTerm,
    startIso: choice?.choosesStart ? startDate || null : pricing.startIso,
    setup: choice ? (choice.options.find((o) => o.term === effTerm)?.setup ?? pricing.setup) : pricing.setup,
    annual,
    ...(choice ? { freeMonths: freiFuer(choice, effTerm) } : {}),
  };
  const hasChoice = !!choice && (choice.choosesTerm || choice.choosesStart || !!choice.choosesAnnual);
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
      {choice && hasChoice ? (
        <ChoiceFields choice={choice} term={term} setTerm={setTerm} startDate={startDate} setStartDate={setStartDate} annual={annualPick} setAnnual={setAnnualPick} />
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
        disabled={pending}
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
  const teile = [choice.choosesTerm ? "Laufzeit" : null, choice.choosesAnnual ? "Zahlweise" : null].filter(Boolean) as string[];
  const vorne = teile.length ? `der hier gewählten ${teile.join(" und ")}` : "";
  return [vorne, choice.choosesStart ? "dem gewählten Start" : ""].filter(Boolean).join(" und ");
}

function ChoiceFields({
  choice,
  term,
  setTerm,
  startDate,
  setStartDate,
  annual: annualPick,
  setAnnual,
}: {
  choice: OfferChoiceProps;
  term: OfferTerm;
  setTerm: (t: OfferTerm) => void;
  startDate: string;
  setStartDate: (d: string) => void;
  annual: boolean;
  setAnnual: (v: boolean) => void;
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
                    Setup {o.list != null && o.list > o.setup ? <s className="mr-1">{eur(o.list)}</s> : null}
                    {eur(o.setup)} netto
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
            Ab diesem Tag läuft {annual ? "die Vergütung" : "die Monatsgebühr"}. Die Einrichtung dauert ca. 1–2 Wochen. Möglich: {fmtDate(choice.start.min)} bis{" "}
            {fmtDate(choice.start.max)}.
          </p>
        </div>
      ) : null}
      <div className="grid gap-2 border-t border-[#e5e7eb] pt-3 text-sm sm:grid-cols-2" aria-live="polite">
        <div>
          <span className="text-[color:var(--muted)]">Jetzt fällig (Setup): </span>
          {opt.list != null && opt.list > opt.setup ? <s className="mr-1 text-[color:var(--muted)]">{eur(opt.list)}</s> : null}
          <b data-testid="choice-setup">{eur(opt.setup)} netto</b>
          <span className="text-[color:var(--muted)]"> · {eur(withVat(opt.setup))} brutto</span>
        </div>
        <div>
          <span className="text-[color:var(--muted)]">{annual ? (v.months === 6 ? "6 Monate im Voraus" : "Jährlich im Voraus") : "Monatlich"}{startDate ? ` ab ${fmtDate(startDate)}` : ""}: </span>
          <b data-testid="choice-recurring">{eur(annual ? annualTotal : choice.monthlyTotal)} netto</b>
          <span className="text-[color:var(--muted)]"> · {eur(withVat(annual ? annualTotal : choice.monthlyTotal))} brutto</span>
        </div>
      </div>
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
