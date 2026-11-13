"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Loader2, Minus, Plus, TrendingUp } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { success as hapticSuccess, selection } from "@/lib/haptics";
import { PRICE_LIST } from "@/lib/offer-pricing";
import {
  BUDGET_MAX_DAILY,
  BUDGET_MIN_DAILY,
  BUDGET_STEP,
  LEAD_GUARANTEE_MIN_DAILY,
  needsAcknowledge,
  previewChange,
  tierSentence,
  type BudgetContext,
  type BudgetLine,
} from "@/lib/budget-shared";
import { changeBudgetAction, type BudgetFormState } from "./actions";

const eur0 = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;
const eur2 = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const d = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
const clamp = (n: number) => Math.min(BUDGET_MAX_DAILY, Math.max(BUDGET_MIN_DAILY, Math.round(n / BUDGET_STEP) * BUDGET_STEP));

export type BudgetCardProps = {
  lines: BudgetLine[];
  upcoming: { product: string; dailyBudget: number; validFrom: string }[];
  ctx: BudgetContext;
  pending: { monthlyBudgetTo: number; createdAt: string } | null;
  today: string;
  readOnly: boolean;
  /** Budget aus den Werbeausgaben geschätzt (Kunde ohne Angebot in der App) */
  estimated?: boolean;
};

export function BudgetCard({ lines, upcoming, ctx, pending, today, readOnly, estimated = false }: BudgetCardProps) {
  const [values, setValues] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((l) => [l.product, l.dailyBudget])));
  const [when, setWhen] = useState<"now" | "date">("now");
  const [ack, setAck] = useState(false);
  const [state, action, saving] = useActionState<BudgetFormState, FormData>(changeBudgetAction, {});

  useEffect(() => {
    if (state.ok) hapticSuccess();
  }, [state]);

  const next = useMemo(() => lines.map((l) => ({ product: l.product, dailyBudget: values[l.product] ?? l.dailyBudget })), [lines, values]);
  const p = useMemo(() => previewChange(lines, next, ctx), [lines, next, ctx]);
  const sentence = tierSentence(p);
  const mustAck = needsAcknowledge(p);
  const sliderMax = Math.max(200, ...lines.map((l) => l.dailyBudget * 2));

  const set = (product: string, v: number) => {
    setValues((s) => ({ ...s, [product]: clamp(v) }));
    setAck(false);
  };

  if (!lines.length) {
    return (
      <Card>
        <CardHeader title="Werbebudget" icon={TrendingUp} />
        <p className="p-5 text-[15px] text-[color:var(--muted)]">
          Für Ihr Konto ist noch kein Tagesbudget hinterlegt. Möchten Sie Ihr Budget ändern, antworten Sie einfach auf eine unserer E-Mails oder rufen Sie uns an.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div id="werbebudget" className="scroll-mt-24" />
      <CardHeader title="Werbebudget" icon={TrendingUp} hint="Tagesbudget je Produkt" />
      <form action={action} className="space-y-5 p-5" data-konto-budget>
        {pending ? (
          <div className="rounded-[var(--radius-md)] bg-sky-50 px-4 py-3 text-[15px] text-sky-900">
            Ihre Anfrage über {eur0(pending.monthlyBudgetTo)} im Monat vom {d(pending.createdAt)} liegt uns vor. Wir melden uns mit einem individuellen Angebot.
          </div>
        ) : null}

        {estimated ? (
          <p className="text-sm text-[color:var(--muted)]" data-budget-geschaetzt>
            Ihr aktuelles Budget haben wir aus Ihren Werbeausgaben der letzten 14 Tage ermittelt. Stellen Sie hier ein, was künftig gelten soll.
          </p>
        ) : null}
        <div className="space-y-4">
          {lines.map((l) => {
            const v = values[l.product] ?? l.dailyBudget;
            const low = v < LEAD_GUARANTEE_MIN_DAILY;
            return (
              <div key={l.product} className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-4">
                <input type="hidden" name="product" value={l.product} />
                <input type="hidden" name="daily" value={v} />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-semibold">{l.product}</div>
                  <div className="text-sm text-[color:var(--muted)]">aktuell {eur0(l.dailyBudget)} pro Tag</div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    aria-label={`${l.product}: ${BUDGET_STEP} € weniger`}
                    disabled={readOnly || v <= BUDGET_MIN_DAILY}
                    onClick={() => (selection(), set(l.product, v - BUDGET_STEP))}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[color:var(--border)] bg-white disabled:opacity-40"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="min-w-0 flex-1 text-center">
                    <div className="text-2xl font-bold tabular-nums">{eur0(v)}</div>
                    <div className="text-xs text-[color:var(--muted)]">pro Tag</div>
                  </div>
                  <button
                    type="button"
                    aria-label={`${l.product}: ${BUDGET_STEP} € mehr`}
                    disabled={readOnly || v >= BUDGET_MAX_DAILY}
                    onClick={() => (selection(), set(l.product, v + BUDGET_STEP))}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[color:var(--border)] bg-white disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <input
                  type="range"
                  aria-label={`Tagesbudget ${l.product}`}
                  min={BUDGET_MIN_DAILY}
                  max={sliderMax}
                  step={BUDGET_STEP}
                  value={Math.min(v, sliderMax)}
                  disabled={readOnly}
                  onChange={(e) => set(l.product, Number(e.target.value))}
                  className="mt-3 w-full accent-[color:var(--brand)]"
                />
                {low ? (
                  <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> Lead-Garantie gilt ab {LEAD_GUARANTEE_MIN_DAILY} €/Tag
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Live-Vorschau */}
        <dl className="grid grid-cols-2 gap-3 text-[15px]" data-budget-preview>
          <div className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] p-3">
            <dt className="text-xs text-[color:var(--muted)]">Werbebudget pro Monat</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-1.5 font-semibold tabular-nums">
              {p.changed ? (
                <>
                  <span className="text-[color:var(--muted)] line-through decoration-1">{eur0(p.monthlyFrom)}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[color:var(--muted)]" />
                </>
              ) : null}
              {eur0(p.monthlyTo)}
            </dd>
          </div>
          <div className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] p-3">
            <dt className="text-xs text-[color:var(--muted)]">Erwartete Leads pro Monat</dt>
            <dd className="mt-1 font-semibold tabular-nums">
              ca. {p.leadsTo.toLocaleString("de-DE")}
              {p.changed ? <span className="ml-1 text-sm font-normal text-[color:var(--muted)]">(bisher ca. {p.leadsFrom.toLocaleString("de-DE")})</span> : null}
            </dd>
          </div>
          <p className="col-span-2 -mt-1 text-xs text-[color:var(--muted)]">
            {ctx.cplSource === "kunde"
              ? `Gerechnet mit Ihrem Leadpreis der letzten 30 Tage (${eur2(ctx.cpl)}). Monat = ${PRICE_LIST.daysPerMonth} Tage.`
              : `Gerechnet mit einem üblichen Leadpreis von ${eur2(ctx.cpl)}. Monat = ${PRICE_LIST.daysPerMonth} Tage. Keine Zusage.`}
          </p>
        </dl>

        {/* Betreuungsstufe: sehr deutlich */}
        {sentence ? (
          <div
            data-budget-tier
            className={`rounded-[var(--radius-md)] border-2 px-4 py-4 text-[16px] leading-snug ${
              p.overIndividual ? "border-sky-300 bg-sky-50 text-sky-950" : "border-amber-300 bg-amber-50 text-amber-950"
            }`}
          >
            <div className="mb-1 text-xs font-bold uppercase tracking-wide">{p.overIndividual ? "Individuelles Angebot" : "Neue Betreuungsstufe"}</div>
            <p className="font-semibold">{sentence}</p>
            {p.pricing === "individual" && !p.overIndividual ? (
              <p className="mt-2 text-sm">Ihre Konditionen sind individuell, wir bestätigen den neuen Preis. Ihr Budget gilt trotzdem wie gewählt.</p>
            ) : null}
          </div>
        ) : ctx.plan !== "service" && p.tierTo ? (
          <p className="text-sm text-[color:var(--muted)]" data-budget-tier>
            Ihre Betreuungsstufe bleibt gleich ({p.tierTo.label}){p.pricing === "list" && p.feeTo != null ? `: ${eur0(p.feeTo)} netto im Monat` : ""}.
          </p>
        ) : ctx.plan === "service" ? (
          <p className="text-sm text-[color:var(--muted)]">Paket „Nur Betreuung“: Ihr Monatspreis hängt nicht vom Werbebudget ab.</p>
        ) : null}

        {upcoming.length ? (
          <div className="text-sm text-[color:var(--muted)]">
            Geplant: {upcoming.map((u) => `${u.product} ${eur0(u.dailyBudget)}/Tag ab ${d(u.validFrom)}`).join(", ")}
          </div>
        ) : null}

        {p.changed && !p.overIndividual ? (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold">Ab wann?</legend>
            <label className="flex items-center gap-2 text-[15px]">
              <input type="radio" name="when" value="now" checked={when === "now"} onChange={() => setWhen("now")} /> Sofort
            </label>
            <label className="flex flex-wrap items-center gap-2 text-[15px]">
              <input type="radio" name="when" value="date" checked={when === "date"} onChange={() => setWhen("date")} /> Ab Datum
              {when === "date" ? (
                <input type="date" name="date" min={today} required className="h-10 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3" />
              ) : null}
            </label>
          </fieldset>
        ) : (
          <input type="hidden" name="when" value="now" />
        )}

        {p.changed && mustAck ? (
          <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-amber-300 p-3 text-[15px]">
            <input type="checkbox" name="ack" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" />
            <span>Ich habe den neuen Monatspreis zur Kenntnis genommen.</span>
          </label>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={readOnly || saving || !p.changed || (mustAck && !ack) || (p.overIndividual && !!pending)}
            className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-[15px] font-semibold text-white transition hover:bg-[color:var(--brand-dark)] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {p.overIndividual ? "Anfrage senden" : "Budget ändern"}
          </button>
          {readOnly ? <span className="text-sm text-[color:var(--muted)]">In der Vorschau nicht möglich.</span> : null}
          {state.error ? <span className="text-sm font-medium text-rose-700">{state.error}</span> : null}
          {state.ok && state.message ? <span className="text-sm font-medium text-emerald-700" role="status">{state.message}</span> : null}
        </div>
        <p className="text-xs text-[color:var(--muted)]">
          Erhöhen und senken können Sie jederzeit. Eine neue Betreuungsstufe gilt ab dem folgenden Abrechnungsmonat. Die Anzeigen bei Meta stellen wir in der Regel
          innerhalb eines Werktags um.
        </p>
      </form>
    </Card>
  );
}
