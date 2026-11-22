"use client";

import { InfoHinweis } from "@/components/info-hinweis";
import { BETREUUNG_ERKLAERT } from "@/lib/begriffe";
import { useActionState, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Layers, Loader2, Minus, Plus, ShieldCheck } from "lucide-react";
import { Badge, Card, CardHeader } from "@/components/ui";
import { Sheet } from "@/components/ui/sheet";
import { success as hapticSuccess, selection } from "@/lib/haptics";
import { PRICE_LIST } from "@/lib/offer-pricing";
import { BUDGET_MAX_DAILY, BUDGET_MIN_DAILY, BUDGET_STEP, LEAD_GUARANTEE_MIN_DAILY, type BudgetContext, type BudgetLine } from "@/lib/budget-shared";
import { bookingSentence, NEU_BADGE, NEU_HINWEIS, previewBooking, STATUS_LABEL } from "@/lib/produkt-buchen-shared";
import { erfahrungswertText } from "@/lib/rechner";
import type { BookableProduct, BookedProduct } from "@/lib/produkt-buchen";
import { bookProductAction, requestOtherProductAction, requestProductEndAction, type ProductFormState } from "./actions";

const eur0 = (n: number) => `${Math.round(n).toLocaleString("de-DE")} €`;
const d = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
const clamp = (n: number) => Math.min(BUDGET_MAX_DAILY, Math.max(BUDGET_MIN_DAILY, Math.round(n / BUDGET_STEP) * BUDGET_STEP));
/** Standard-Tagesbudget für ein neues Produkt (Lead-Garantie-Grenze bzw. Makler-Empfehlung). */
const DEFAULT_DAILY = 30;

export type ProductsCardProps = {
  booked: BookedProduct[];
  bookable: BookableProduct[];
  lines: BudgetLine[];
  ctx: BudgetContext;
  today: string;
  readOnly: boolean;
};

/** Konto → Produkte: gebuchte Produkte und weitere Sparten selbst dazubuchen. */
export function ProductsCard({ booked, bookable, lines, ctx, today, readOnly }: ProductsCardProps) {
  const [pick, setPick] = useState<BookableProduct | null>(null);
  return (
    <Card>
      <div id="produkte" className="scroll-mt-24" />
      <CardHeader title="Produkte" icon={Layers} hint="Sparten und Kampagnen" />
      <div className="space-y-5 p-5" data-konto-produkte>
        {booked.length ? (
          <ul className="space-y-2">
            {booked.map((b) => (
              <BookedRow key={`${b.name}-${b.bookingId ?? "live"}`} b={b} readOnly={readOnly} />
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-[color:var(--muted)]">Noch kein Produkt hinterlegt.</p>
        )}

        {bookable.length ? (
          // Katalog zugeklappt (UX, Ole 15.11.2026): sonst schiebt er Budget und Pause weit nach unten
          <details className="group space-y-2" data-produkte-katalog>
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <Plus className="h-4 w-4 text-[color:var(--brand)] transition group-open:rotate-45" />
              Weitere Sparte dazubuchen <span className="font-normal text-[color:var(--muted)]">· {bookable.length}</span>
            </summary>
            <ul className="mt-2 space-y-2">
              {bookable.map((p) => (
                <li key={p.key} className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[color:var(--border)] p-4 sm:flex-row sm:items-center" data-bookable={p.key}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{p.name}</span>
                      {p.proven ? <Badge tone="success">Bewährt</Badge> : <Badge tone="info">{NEU_BADGE}</Badge>}
                      {p.guarantee ? <Badge tone="neutral">mit Garantie</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">{p.benefit}</p>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">
                      {/* Spanne wie in Oles PDFs; gerechnet wird mit dem oberen Wert */}
                      {p.cpl ? erfahrungswertText(p.cpl, p.cplFrom, DEFAULT_DAILY) : NEU_HINWEIS}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => (selection(), setPick(p))}
                    className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-4 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
                  >
                    <Plus className="h-4 w-4" /> Produkt buchen
                  </button>
                </li>
              ))}
            </ul>
            {readOnly ? <p className="text-sm text-[color:var(--muted)]">In der Vorschau nicht möglich.</p> : null}
          </details>
        ) : null}

        {!readOnly ? <OtherProductRequest /> : null}

        <p className="text-sm text-[color:var(--muted)]">
          {eur0(PRICE_LIST.extraProductMonthly)} im Monat je Sparte (netto), ohne Einrichtungsgebühr{PRICE_LIST.extraProductSetupSelfService > 0 ? ` (sonst ${eur0(PRICE_LIST.extraProductSetupSelfService)})` : ""}. Neue Leads in wenigen Tagen. Ihr Werbebudget ändern Sie
          oben unter <a href="#budget" className="underline">Werbebudget</a>.
        </p>
      </div>
      {pick ? <BookSheet key={pick.key} product={pick} lines={lines} ctx={ctx} today={today} onClose={() => setPick(null)} /> : null}
    </Card>
  );
}

/** „Weitere Produkte auf Anfrage“: kurzer Wunsch an uns (Aufgabe + Push für Ole). */
function OtherProductRequest() {
  const [state, action, pending] = useActionState<ProductFormState, FormData>(requestOtherProductAction, {});
  const [open, setOpen] = useState(false);
  if (state.ok) return <p className="flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {state.message}</p>;
  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border)] p-4" data-produkt-anfrage>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-[color:var(--brand)] hover:underline">
          Weitere Produkte auf Anfrage, Wunsch senden
        </button>
      ) : (
        <form action={action} className="space-y-2">
          <label className="block text-sm font-semibold" htmlFor="produkt-wunsch">Welches Produkt interessiert Sie?</label>
          <input id="produkt-wunsch" name="wish" required minLength={3} maxLength={300} placeholder="z. B. Berufsunfähigkeit, Kfz, Wohngebäude" className="h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px]" />
          {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
          <button type="submit" disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-4 text-sm font-semibold text-white disabled:opacity-50">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Anfrage senden
          </button>
        </form>
      )}
    </div>
  );
}

function BookedRow({ b, readOnly }: { b: BookedProduct; readOnly: boolean }) {
  const [state, action, pending] = useActionState<ProductFormState, FormData>(requestProductEndAction, {});
  const [confirm, setConfirm] = useState(false);
  const tone = b.status === "live" ? "success" : b.status === "setup" ? "warning" : "info";
  return (
    <li className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-4" data-booked={b.name}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{b.name}</span>
        <Badge tone={tone}>{b.status === "live" ? "Läuft" : STATUS_LABEL[b.status]}</Badge>
        <span className="text-sm text-[color:var(--muted)]">{eur0(b.dailyBudget)} pro Tag</span>
        {b.status === "live" ? (
          <a href="#werbebudget" className="-my-2 ml-auto py-2 text-sm font-medium text-[color:var(--brand)] hover:underline">
            Budget ändern
          </a>
        ) : null}
      </div>
      {b.status === "setup" ? (
        <p className="mt-1 text-sm text-[color:var(--muted)]">Wir richten Kampagne, Formular und Assistent ein{b.startWish ? `, gewünschter Start ${d(b.startWish)}` : ""}. Sie bekommen Bescheid, sobald es läuft.</p>
      ) : b.status === "requested" ? (
        <p className="mt-1 text-sm text-[color:var(--muted)]">Ihre Anfrage liegt uns vor. Wir melden uns mit einem individuellen Angebot.</p>
      ) : b.endRequestedAt ? (
        <p className="mt-1 text-sm text-[color:var(--muted)]">Beenden angefragt am {d(b.endRequestedAt)}. Wir melden uns mit dem möglichen Enddatum.</p>
      ) : !readOnly ? (
        <form action={action} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="product" value={b.name} />
          {confirm ? (
            <>
              <span className="text-sm">Wirklich beenden? Wir prüfen Ihre Laufzeit und melden uns.</span>
              <button className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-rose-300 px-3 text-sm font-medium text-rose-700" disabled={pending}>
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Beenden anfragen
              </button>
              <button type="button" className="text-sm text-[color:var(--muted)] hover:underline" onClick={() => setConfirm(false)}>
                Abbrechen
              </button>
            </>
          ) : (
            <button type="button" className="-my-2 py-2 text-sm text-[color:var(--muted)] hover:underline" onClick={() => setConfirm(true)}>
              Produkt beenden anfragen
            </button>
          )}
          {state.error ? <span className="text-sm font-medium text-rose-700">{state.error}</span> : null}
          {state.ok && state.message ? <span className="text-sm font-medium text-emerald-700">{state.message}</span> : null}
        </form>
      ) : null}
    </li>
  );
}

/** Neuer Monatspreis Betreuung + Software: Listenpreis der neuen Stufe, bei individuellem Preis bisher + Aufschlag. */
function neuerMonatspreis(p: ReturnType<typeof previewBooking>): number | null {
  if (p.overIndividual) return null;
  if (p.bookingPricing === "list" && p.feeTo != null) return p.feeTo;
  if (p.manualReason === "individual_terms" && p.feeFrom != null) return p.feeFrom + p.extraMonthly;
  return null;
}

function BookSheet({ product, lines, ctx, today, onClose }: { product: BookableProduct; lines: BudgetLine[]; ctx: BudgetContext; today: string; onClose: () => void }) {
  const [daily, setDaily] = useState(DEFAULT_DAILY);
  const [when, setWhen] = useState<"asap" | "date">("asap");
  const [ack, setAck] = useState(false);
  const [state, action, saving] = useActionState<ProductFormState, FormData>(bookProductAction, {});
  useEffect(() => {
    if (state.ok) hapticSuccess();
  }, [state]);
  const p = useMemo(() => previewBooking(lines, { product: product.name, dailyBudget: daily }, ctx, product.cpl), [lines, product, daily, ctx]);
  const sentence = bookingSentence(p);
  const set = (v: number) => (setDaily(clamp(v)), setAck(false));

  return (
    <Sheet open onClose={onClose} title={`${product.name} buchen`} message={product.benefit}>
      {state.ok ? (
        <div className="space-y-4 p-5 text-center" data-book-done>
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
          <p className="text-[15px] font-medium">{state.message}</p>
          <button type="button" onClick={onClose} className="h-11 w-full rounded-[var(--radius-sm)] bg-[color:var(--brand)] text-[15px] font-semibold text-white">
            Fertig
          </button>
        </div>
      ) : (
        <form action={action} className="max-h-[calc(100dvh-11rem)] space-y-5 overflow-y-auto overscroll-contain p-5" data-book-sheet>
          <input type="hidden" name="catalogKey" value={product.key} />
          <input type="hidden" name="daily" value={daily} />
          <div>
            <div className="text-sm font-semibold">Tagesbudget</div>
            <div className="mt-2 flex items-center gap-3">
              <button type="button" aria-label={`${product.name}: 5 € weniger`} disabled={daily <= BUDGET_MIN_DAILY} onClick={() => (selection(), set(daily - BUDGET_STEP))} className="grid h-11 w-11 place-items-center rounded-full border border-[color:var(--border)] bg-white disabled:opacity-40">
                <Minus className="h-4 w-4" />
              </button>
              <div className="flex-1 text-center">
                <div className="text-2xl font-bold tabular-nums">{eur0(daily)}</div>
                <div className="text-sm text-[color:var(--muted)]">pro Tag · {eur0(daily * PRICE_LIST.daysPerMonth)} im Monat</div>
              </div>
              <button type="button" aria-label={`${product.name}: 5 € mehr`} disabled={daily >= BUDGET_MAX_DAILY} onClick={() => (selection(), set(daily + BUDGET_STEP))} className="grid h-11 w-11 place-items-center rounded-full border border-[color:var(--border)] bg-white disabled:opacity-40">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <input type="range" aria-label={`Tagesbudget ${product.name}`} min={BUDGET_MIN_DAILY} max={200} step={BUDGET_STEP} value={Math.min(daily, 200)} onChange={(e) => set(Number(e.target.value))} className="mt-3 w-full accent-[color:var(--brand)]" />
            {p.guarantee && daily < LEAD_GUARANTEE_MIN_DAILY ? (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4" /> Lead-Garantie gilt ab {eur0(LEAD_GUARANTEE_MIN_DAILY)} pro Tag.
              </p>
            ) : null}
          </div>

          <dl className="grid grid-cols-2 gap-3 text-[15px]" data-book-preview>
            <div className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] p-3">
              <dt className="text-sm text-[color:var(--muted)]">Einrichtung (einmalig)</dt>
              <dd className="mt-1 font-semibold tabular-nums">{p.setupFee > 0 ? `${eur0(p.setupFee)} netto` : "kostenlos"}</dd>
            </div>
            {/* Neuer Monatsbetrag für Betreuung + Software klar sichtbar (Ole, 17.11.2026) */}
            <div className="rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] p-3" data-book-fee>
              <dt className="text-sm text-[color:var(--muted)]">Betreuung + Software</dt>
              {neuerMonatspreis(p) != null ? (
                <dd className="mt-1 tabular-nums">
                  <span className="font-semibold">{eur0(neuerMonatspreis(p)!)} netto im Monat</span>
                  {p.feeFrom != null ? <span className="block text-sm text-[color:var(--muted)]">bisher {eur0(p.feeFrom)}, ab Start</span> : null}
                </dd>
              ) : (
                <dd className="mt-1 font-semibold tabular-nums">+{eur0(p.extraMonthly)} netto im Monat</dd>
              )}
            </div>
            <div className="col-span-2 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] p-3">
              <dt className="text-sm text-[color:var(--muted)]">Werbebudget gesamt pro Monat</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-1.5 font-semibold tabular-nums">
                <span className="text-[color:var(--muted)] line-through decoration-1">{eur0(p.monthlyFrom)}</span>
                <ArrowRight className="h-3.5 w-3.5 text-[color:var(--muted)]" />
                {eur0(p.monthlyTo)}
                {p.leadsNew != null ? <span className="ml-1 text-sm font-normal text-[color:var(--muted)]">(neu ca. {p.leadsNew} Leads im Monat)</span> : null}
              </dd>
            </div>
          </dl>

          {sentence && (p.tierChange || p.overIndividual || p.bookingPricing === "individual") ? (
            <div
              data-book-tier
              className={`rounded-[var(--radius-md)] border-2 px-4 py-4 text-[16px] leading-snug ${p.overIndividual ? "border-sky-300 bg-sky-50 text-sky-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}
            >
              <div className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">{p.tierChange && !p.overIndividual ? <InfoHinweis begriff="Betreuungsstufe" text={BETREUUNG_ERKLAERT} className="order-last" /> : null}{p.overIndividual ? "Individuelles Angebot" : p.tierChange ? "Neue Betreuungsstufe" : "Individuelle Konditionen"}</div>
              <p className="font-semibold">{sentence}</p>
            </div>
          ) : null}

          {/* Nur für Kunden mit Garantie-Angebot (Angebote bis 22.11.2026) */}
          {ctx.garantien !== false ? (
            <p className="flex items-start gap-2 text-sm text-[color:var(--muted)]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              {p.guarantee
                ? "Für dieses Produkt gelten unsere Garantien (Lead-Garantie ab 20 € pro Tag), ab dem Start der Kampagne."
                : "Für dieses Produkt gelten keine Garantien. Es ist ein neues Produkt, wir optimieren gemeinsam mit Ihnen."}
            </p>
          ) : null}

          {!p.overIndividual ? (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-semibold">Start</legend>
              <label className="flex items-center gap-2 text-[15px]">
                <input type="radio" name="when" value="asap" checked={when === "asap"} onChange={() => setWhen("asap")} /> So bald wie möglich
              </label>
              <label className="flex flex-wrap items-center gap-2 text-[15px]">
                <input type="radio" name="when" value="date" checked={when === "date"} onChange={() => setWhen("date")} /> Ab Datum
                {when === "date" ? <input type="date" name="date" min={today} required className="h-10 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3" /> : null}
              </label>
              <p className="text-sm text-[color:var(--muted)]">Die Einrichtung dauert in der Regel wenige Werktage.</p>
            </fieldset>
          ) : (
            <input type="hidden" name="when" value="asap" />
          )}

          <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-amber-300 p-3 text-[15px]">
            <input type="checkbox" name="ack" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-1 h-5 w-5 shrink-0" />
            <span>
              {p.overIndividual
                ? "Ich möchte ein individuelles Angebot für dieses Produkt."
                : `Ich buche ${product.name}${p.setupFee > 0 ? ` mit einmalig ${eur0(p.setupFee)} Einrichtung` : " ohne Einrichtungsgebühr"}. ${neuerMonatspreis(p) != null ? `Neuer Monatspreis ${eur0(neuerMonatspreis(p)!)}` : `Zusätzlich ${eur0(p.extraMonthly)} im Monat`} (netto, zzgl. USt.), berechnet ab Start der Kampagne; Laufzeit und Kündigung wie mein bestehender Vertrag.`}
            </span>
          </label>

          <button
            type="submit"
            disabled={saving || !ack}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {p.overIndividual ? "Anfrage senden" : "Jetzt kostenpflichtig buchen"}
          </button>
          {state.error ? <p className="text-sm font-medium text-rose-700">{state.error}</p> : null}
        </form>
      )}
    </Sheet>
  );
}
