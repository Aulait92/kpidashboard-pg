"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  BUDGET_MAX,
  BUDGET_MIN,
  BUDGET_STANDARD,
  CPL_MAX,
  CPL_MIN,
  CROSS_SELL_RATE_MAX,
  CROSS_SELL_VERZOEGERUNG,
  DAYS_PER_MONTH,
  SEAT_MONTHLY,
  SEATS_INCLUDED,
  HORIZONT_OPTIONEN,
  KAMPAGNE_OPTIONEN,
  STORNO_MAX,
  STORNO_MIN,
  berechne,
  berechneBestand,
  budgetVergleich,
  defaultInput,
  inputToParams,
  maklerModus,
  productsFor,
  type BestandResult,
  type BudgetVergleichZeile,
  type Horizont,
  type Kampagne,
  type RechnerConfig,
  type RechnerInput,
  type RechnerResult,
  type StaffelStufe,
} from "@/lib/rechner";
import type { CplInfo } from "@/lib/rechner";
import { PRICE_LIST, TERM_MONTHS, type OfferTerm } from "@/lib/offer-pricing";
import type { VermittlerTyp } from "@/lib/provision";

const eur = (n: number, d = 0) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: d, minimumFractionDigits: d });
const zahl = (n: number, d = 0) => n.toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: d });
const pctOut = (n: number) => Math.round(n * 1000) / 10;

/** Öffentlicher Break-even-Rechner: Eingaben links, Ergebnis rechts, Zustand in der URL. */
export function RechnerView({ config, cpl, initial }: { config: RechnerConfig; cpl: Record<string, CplInfo>; initial: RechnerInput }) {
  const [input, setInput] = useState<RechnerInput>(initial);
  // Zähler, damit Zahlenfelder nach Produkt-/Typwechsel ihre Startwerte neu zeigen
  const [version, setVersion] = useState(0);
  const [copied, setCopied] = useState(false);

  const products = productsFor(config, input.typ);
  const product = products.find((p) => p.key === input.produkt) ?? products[0] ?? config.products[0];
  const cplBasis: CplInfo = cpl[product.key] ?? { cpl: product.cpl, source: "erfahrungswert", note: product.cplNote || "Erfahrungswert" };
  // Makler-Modus rechnet mit eigenem Wert (TKV: 4 € reales Ergebnis), Vertreter mit Puffer
  const cplInfo = maklerModus(product, input) ? (cplBasis.makler ?? cplBasis) : cplBasis;
  // Eigener Leadpreis (Feld „Kosten pro Lead“) hat Vorrang vor unserem Wert
  const cplWert = input.cpl ?? cplInfo.cpl;
  const r = berechne(product, input, cplWert); // günstig, ohne Memo
  const bestand = berechneBestand(product, input, r);
  const makler = maklerModus(product, input) && bestand != null;

  // URL mitführen (teilbar), ohne neuen Verlaufseintrag
  useEffect(() => {
    const q = inputToParams(config, input).toString();
    window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
  }, [config, input]);

  const set = (patch: Partial<RechnerInput>) => setInput((i) => ({ ...i, ...patch }));
  const reset = (typ: VermittlerTyp, key: string) => {
    const list = productsFor(config, typ);
    const p = list.find((x) => x.key === key) ?? list[0];
    setInput((i) =>
      defaultInput(p, typ, {
        // Standardbudget mitwechseln (Vertreter 30 €, Makler 40 €), eigenes Budget behalten
        budget: i.typ !== typ && i.budget === BUDGET_STANDARD[i.typ] ? BUDGET_STANDARD[typ] : i.budget, laufzeit: i.laufzeit, jaehrlich: i.jaehrlich, berater: i.berater, ust: i.ust,
        storno: i.storno, kampagne: i.kampagne, horizont: i.horizont,
      }),
    );
    setVersion((v) => v + 1);
  };


  return (
    <div className="min-h-screen bg-[color:var(--background)]">
      <header className="border-b border-[color:var(--border)] bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:px-6">
          <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[color:var(--brand)] text-sm font-bold text-white">↗</span>
          <span className="font-semibold">performance<span className="text-[color:var(--brand)]">growth</span></span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-4xl">{config.headline}</h1>
        {config.intro ? <p className="mt-2 max-w-2xl text-[color:var(--muted)]">{config.intro}</p> : null}

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start">
          {/* ── Eingaben ─────────────────────────────────────────── */}
          <section className="space-y-4" aria-label="Eingaben">
            <Card>
              <Label>Ich arbeite als</Label>
              <Segmented
                value={input.typ}
                options={[{ value: "vertreter", label: "Vertreter" }, { value: "makler", label: "Makler" }]}
                onChange={(v) => reset(v as VermittlerTyp, input.produkt)}
              />
              <div className="mt-5">
                <div className="flex items-baseline justify-between gap-2">
                  <Label htmlFor="budget">Werbebudget pro Tag</Label>
                  <span className="text-lg font-semibold tabular-nums">{eur(input.budget)}</span>
                </div>
                <input
                  id="budget"
                  type="range"
                  min={BUDGET_MIN}
                  max={BUDGET_MAX}
                  step={1}
                  value={input.budget}
                  onChange={(e) => set({ budget: Number(e.target.value) })}
                  className="mt-2 w-full accent-[color:var(--brand)]"
                />
                <p className="text-xs text-[color:var(--muted)]">≈ {eur(input.budget * DAYS_PER_MONTH)} im Monat, zahlen Sie direkt an Meta</p>
              </div>
              <div className="mt-5" data-leadpreis>
                <NumField
                  key={`cpl-${product.key}-${input.typ}-${version}`}
                  label="Kosten pro Lead"
                  hint={input.cpl == null ? cplInfo.note : `eigener Wert · unser Wert: ${eur(cplInfo.cpl, 2)} (${cplInfo.note})`}
                  suffix="€"
                  value={cplWert}
                  min={CPL_MIN}
                  max={CPL_MAX}
                  onChange={(v) => set({ cpl: Math.abs(v - cplInfo.cpl) < 0.005 ? null : v })}
                />
                <p className="mt-1 text-xs text-[color:var(--muted)]">
                  ≈ <b className="tabular-nums text-[color:var(--foreground)]">{Math.round(r.leads).toLocaleString("de-DE")}</b> Leads im Monat
                  {input.cpl != null ? (
                    <>
                      {" · "}
                      <button
                        type="button"
                        className="font-medium text-[color:var(--brand)] underline"
                        onClick={() => {
                          set({ cpl: null });
                          setVersion((v) => v + 1);
                        }}
                      >
                        Unseren Wert nehmen
                      </button>
                    </>
                  ) : null}
                </p>
              </div>
            </Card>

            <Card>
              <h2 className="text-base font-semibold">Ihre Provision</h2>
              <p className="mb-3 text-sm text-[color:var(--muted)]">Vorausgefüllt mit üblichen Sätzen für {input.typ === "makler" ? "Makler" : "Vertreter"}. Tragen Sie Ihre eigenen ein.</p>
              {product.kind === "monthly" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumField key={`mb-${version}`} label="Provision in Monatsbeiträgen" suffix="×" value={input.months} min={0} max={24} onChange={(v) => set({ months: v })} />
                  <NumField key={`bt-${version}`} label="Ø Monatsbeitrag" suffix="€" value={input.beitrag} min={1} max={100000} onChange={(v) => set({ beitrag: v })} />
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <NumField key={`ap-${version}`} label="Abschlussprovision" hint="vom Jahresbeitrag" suffix="%" value={pctOut(input.rate)} min={0} max={100} onChange={(v) => set({ rate: v / 100 })} />
                  <NumField key={`bp-${version}`} label="Bestandsprovision" hint="pro Jahr" suffix="%" value={pctOut(input.trail)} min={0} max={100} onChange={(v) => set({ trail: v / 100 })} />
                  <NumField key={`bt-${version}`} label="Ø Jahresbeitrag" hint="pro Vertrag" suffix="€" value={input.beitrag} min={1} max={100000} onChange={(v) => set({ beitrag: v })} />
                </div>
              )}
              <p className="mt-2 text-sm">
                = <b className="tabular-nums">{eur(r.provisionJeVertrag)}</b> Provision je Vertrag
                {product.kind === "percent" && input.trail > 0 ? <span className="text-[color:var(--muted)]"> (inkl. Bestand 1. Jahr)</span> : null}
              </p>
              <Staffel key={`st-${version}`} kind={product.kind} value={input.staffel} onChange={(staffel) => set({ staffel })} />
            </Card>

            <Card>
              <details>
                <summary className="cursor-pointer text-base font-semibold">Ihre Erfahrungswerte</summary>
                <p className="mb-3 mt-1 text-sm text-[color:var(--muted)]">Vorausgefüllt mit unseren Ergebnissen aus echten Kampagnen.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumField key={`kq-${version}`} label="Leads, die Kunde werden" suffix="%" value={pctOut(input.customerRate)} min={0} max={100} onChange={(v) => set({ customerRate: v / 100 })} />
                  <NumField key={`vk-${version}`} label="Verträge pro Kunde" hint="z. B. mehrere Katzen" suffix="×" value={Math.round(input.contractsPerCustomer * 100) / 100} min={1} max={10} onChange={(v) => set({ contractsPerCustomer: v })} />
                  {bestand ? (
                    <NumField key={`st-${version}`} label="Storno pro Jahr" hint="Anteil Verträge, die jährlich wegfallen" suffix="%" value={pctOut(input.storno)} min={STORNO_MIN * 100} max={STORNO_MAX * 100} onChange={(v) => set({ storno: v / 100 })} />
                  ) : null}
                </div>
              </details>
            </Card>

            {makler || !maklerModus(product, input) || input.xs ? (
              <Card>
                <div data-cross-selling>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1 h-4 w-4" checked={input.xs} onChange={(e) => set({ xs: e.target.checked })} />
                    <span>
                      <span className="block text-base font-semibold">Cross-Selling einrechnen</span>
                      {maklerModus(product, input) ? (
                        <span className="block text-sm text-[color:var(--muted)]">
                          Jeder neue Kunde ist ein Kontakt für Haftpflicht, Hausrat und Unfall. Erfahrungswert eines großen Versicherers: 1 Zusatzvertrag je Kunde,
                          {CROSS_SELL_VERZOEGERUNG === 0 ? " direkt beim Abschluss." : ` ${CROSS_SELL_VERZOEGERUNG} Monate später.`}
                        </span>
                      ) : (
                        <span className="block text-sm text-[color:var(--muted)]">
                          Jeder neue Kunde ist ein Kontakt für weitere Verträge, z. B. Haftpflicht, Hausrat oder Unfall. Tragen Sie ein, wie viel Sie zusätzlich abschließen.
                        </span>
                      )}
                    </span>
                  </label>
                  {input.xs && !maklerModus(product, input) ? (
                    <>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2" data-cross-selling-vertreter>
                        <NumField key={`xr-${version}`} label="Zusatzverträge" hint="je Vertrag, z. B. 0,5 = jeder zweite" suffix="×" value={input.xRate} min={0} max={CROSS_SELL_RATE_MAX} step={0.1} onChange={(v) => set({ xRate: v })} />
                        <NumField key={`xb-${version}`} label="Ø Jahresbeitrag" hint="Zusatzvertrag" suffix="€" value={input.xBeitrag} min={1} max={100000} onChange={(v) => set({ xBeitrag: v })} />
                        <NumField key={`xa-${version}`} label="Abschlussprovision" hint="vom Jahresbeitrag" suffix="%" value={pctOut(input.xAp)} min={0} max={100} onChange={(v) => set({ xAp: v / 100 })} />
                        <NumField key={`xp-${version}`} label="Bestandsprovision" hint="pro Jahr" suffix="%" value={pctOut(input.xTrail)} min={0} max={100} onChange={(v) => set({ xTrail: v / 100 })} />
                      </div>
                      <p className="mt-2 text-sm">
                        = <b className="tabular-nums">{eur(input.xRate * input.xBeitrag * (input.xAp + input.xTrail))}</b> zusätzliche Provision je Vertrag
                        {input.xTrail > 0 ? <span className="text-[color:var(--muted)]"> (inkl. Bestand 1. Jahr)</span> : null}
                      </p>
                    </>
                  ) : null}
                  {input.xs && maklerModus(product, input) ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <NumField key={`xr-${version}`} label="Zusatzverträge" hint="je Vertrag" suffix="×" value={input.xRate} min={0} max={CROSS_SELL_RATE_MAX} step={0.1} onChange={(v) => set({ xRate: v })} />
                      <NumField key={`xb-${version}`} label="Ø Jahresbeitrag" hint="Zusatzvertrag" suffix="€" value={input.xBeitrag} min={1} max={100000} onChange={(v) => set({ xBeitrag: v })} />
                      <NumField key={`xp-${version}`} label="Bestandscourtage" hint="pro Jahr" suffix="%" value={pctOut(input.xTrail)} min={0} max={100} onChange={(v) => set({ xTrail: v / 100 })} />
                    </div>
                  ) : null}
                </div>
              </Card>
            ) : null}

            <Card>
              <h2 className="mb-3 text-base font-semibold">Ihr Paket</h2>
              <Segmented
                value={input.laufzeit}
                options={[
                  { value: "12m", label: `12 Monate (${eur(PRICE_LIST.setup12m)})` },
                  { value: "3m", label: `3 Monate (${eur(PRICE_LIST.setup3m)})` },
                  { value: "none", label: `Ohne Laufzeit (${eur(PRICE_LIST.setupNoTerm)})` },
                ]}
                onChange={(v) => set({ laufzeit: v as OfferTerm, jaehrlich: v === "12m" ? input.jaehrlich : false })}
              />
              <label className={`mt-3 flex items-center gap-2 text-sm ${input.laufzeit !== "12m" ? "opacity-50" : ""}`}>
                <input type="checkbox" className="h-4 w-4" checked={input.jaehrlich} disabled={input.laufzeit !== "12m"} onChange={(e) => set({ jaehrlich: e.target.checked })} />
                Jährlich im Voraus zahlen: 2 Monate geschenkt
              </label>
              {makler ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2" data-bestand-eingaben>
                  <div>
                    <Label>Kampagnendauer</Label>
                    <Segmented
                      value={String(input.kampagne)}
                      options={KAMPAGNE_OPTIONEN.map((k) => ({ value: String(k), label: `${k} Mon.` }))}
                      onChange={(v) => set({ kampagne: Number(v) as Kampagne })}
                    />
                  </div>
                  <div>
                    <Label>Courtage zählen bis</Label>
                    <Segmented
                      value={String(input.horizont)}
                      options={HORIZONT_OPTIONEN.map((h) => ({ value: String(h), label: `+${h} J.` }))}
                      onChange={(v) => set({ horizont: Number(v) as Horizont })}
                    />
                    <span className="mt-1 block text-xs text-[color:var(--muted)]">Jahre nach Kampagnenende</span>
                  </div>
                </div>
              ) : null}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <NumField key={`ber-${version}`} label="Berater im Team" hint={`${SEATS_INCLUDED} inklusive, jeder weitere ${SEAT_MONTHLY} €`} value={input.berater} min={1} max={99} step={1} onChange={(v) => set({ berater: Math.round(v) })} />
              </div>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={input.ust} onChange={(e) => set({ ust: e.target.checked })} />
                <span>Kosten inkl. 19 % USt. <span className="text-[color:var(--muted)]">(Vertreter können die Vorsteuer meist nicht abziehen)</span></span>
              </label>
            </Card>
          </section>

          {/* ── Ergebnis ─────────────────────────────────────────── */}
          <section className="space-y-4 lg:sticky lg:top-6" aria-label="Ergebnis" aria-live="polite">
            {makler && bestand ? (
              <MaklerErgebnis r={r} b={bestand} input={input} vergleich={budgetVergleich(product, input, cplWert)} />
            ) : (
              <Ergebnis r={r} bestand={bestand} storno={input.storno} />
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <a href={config.contactUrl} className="inline-flex h-11 flex-1 items-center justify-center rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 font-semibold text-white hover:bg-[color:var(--brand-dark)]">
                {config.contactLabel}
              </a>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    /* Zwischenablage gesperrt */
                  }
                }}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-5 font-semibold hover:bg-[color:var(--surface-sunken)]"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                {copied ? "Kopiert" : "Link kopieren"}
              </button>
            </div>
            <p className="text-xs leading-relaxed text-[color:var(--muted)]">
              {config.footer} Werbebudget und Betreuung {input.ust ? "inkl." : "zzgl."} 19 % USt.; Provision aus Versicherungsvermittlung ist umsatzsteuerfrei.
              Betreuung nach Werbebudget-Staffel{r.individuell ? " (ab 10.000 € individuelles Angebot)" : ""}, WhatsApp-Gebühren inklusive.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

function Ergebnis({ r, bestand, storno }: { r: RechnerResult; bestand: BestandResult | null; storno: number }) {
  const plus = r.ueberschuss >= 0;
  return (
    <>
      <Card>
        <p className="text-sm text-[color:var(--muted)]">Überschuss pro Monat</p>
        <p className={`text-4xl font-bold tracking-tight tabular-nums ${plus ? "text-emerald-700" : "text-rose-600"}`} data-ueberschuss>
          {plus ? "+ " : "− "}{eur(Math.abs(r.ueberschuss))}
        </p>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Provision {eur(r.provision)} − Kosten {eur(r.kosten)}
        </p>
        {r.provisionZusatz > 0 ? (
          <p className="mt-1 text-sm text-[color:var(--muted)]" data-cross-selling-anteil>
            davon Cross-Selling: <b className="tabular-nums text-[color:var(--foreground)]">{eur(r.provisionZusatz)}</b> aus {zahl(r.zusatzVertraege, 1)} Zusatzverträgen
          </p>
        ) : null}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Leads" value={zahl(r.leads)} />
          <Stat label="Kunden" value={zahl(r.kunden)} />
          <Stat label="Verträge" value={zahl(r.vertraege, 1)} sub={r.zusatzVertraege > 0 ? `+ ${zahl(r.zusatzVertraege, 1)} Zusatzverträge` : undefined} />
          <Stat label="Provision" value={eur(r.provision)} />
          <Stat label="Kosten" value={eur(r.kosten)} sub="Werbung + Betreuung" />
          <Stat label="Pro 1 € Kosten" value={`${zahl(r.proEuro, 2)} €`} sub="Provision" />
        </div>
      </Card>

      <Card>
        {r.breakEvenVertraege != null ? (
          <p className="text-base" data-breakeven>
            Ab <b className="text-[color:var(--brand)]">{zahl(r.breakEvenVertraege)} Verträgen</b> im Monat verdienen Sie Geld
            {r.breakEvenAnteilLeads != null ? <> – das sind <b>{zahl(r.breakEvenAnteilLeads * 100, 1)} von 100 Leads</b></> : null}.
            <span className="text-[color:var(--muted)]"> Mit Ihren Werten erwarten Sie {zahl(r.vertraege, 1)}.</span>
          </p>
        ) : (
          <p className="text-base">Mit diesen Provisionssätzen ist kein Break-even möglich.</p>
        )}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2 text-sm">
            <span className="text-[color:var(--muted)]">Setup ({eur(r.setup)}) wieder drin</span>
            <b className="block tabular-nums">{r.setupMonate != null ? `nach ${zahl(Math.max(r.setupMonate, 0.1), 1)} Monaten` : "–"}</b>
          </div>
          <div className="rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2 text-sm">
            <span className="text-[color:var(--muted)]">Überschuss im ersten Jahr</span>
            <b className={`block tabular-nums ${r.jahr1 >= 0 ? "text-emerald-700" : "text-rose-600"}`}>{r.jahr1 >= 0 ? "+ " : "− "}{eur(Math.abs(r.jahr1))}</b>
          </div>
        </div>
        <Verlauf r={r} />
        <p className="mt-1 text-xs text-[color:var(--muted)]">Kumulierter Überschuss nach Setup.</p>
        {bestand ? (
          <p className="mt-3 text-sm" data-bestand-hinweis>
            Dazu baut sich Bestand auf: nach {bestand.kampagne} Monaten ≈ <b className="tabular-nums">{zahl(bestand.vertraegeNachKampagne)} Verträge</b>,
            die bei {zahl(storno * 100, 1)} % Storno pro Jahr weiter ≈ <b className="tabular-nums">{eur(bestand.courtageJahrNachKampagne)}</b> Bestandsprovision im Jahr bringen.
          </p>
        ) : null}
      </Card>
    </>
  );
}

/** Makler-Modus: Bestandssicht statt „Überschuss pro Monat“. */
function MaklerErgebnis({
  r, b, input, vergleich,
}: { r: RechnerResult; b: BestandResult; input: RechnerInput; vergleich: BudgetVergleichZeile[] }) {
  const plus = b.ergebnis >= 0;
  const jahre = b.horizont === 1 ? "1 Jahr" : `${b.horizont} Jahre`;
  return (
    <>
      <Card>
        <p className="text-sm text-[color:var(--muted)]">Courtage bis {jahre} nach Kampagnenende</p>
        <p className={`text-4xl font-bold tracking-tight tabular-nums ${plus ? "text-emerald-700" : "text-rose-600"}`} data-courtage-gesamt>
          ≈ {eur(b.gesamtCourtage)}
        </p>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Kosten ≈ <b className="text-[color:var(--foreground)] tabular-nums">{eur(b.gesamtKosten)}</b> ({b.kampagne} Monate Kampagne inkl. Setup)
          {b.gesamtKosten > 0 ? <> · <b className="text-[color:var(--foreground)] tabular-nums">{zahl(b.faktor, 1)}×</b> Ihre Kosten</> : null}
        </p>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          davon {eur(b.courtageKampagne)} während der Kampagne + {eur(b.courtageNachlauf)} in den {jahre}n danach
        </p>
        {b.crossSell ? (
          <p className="mt-1 text-sm text-[color:var(--muted)]" data-courtage-split>
            Hauptverträge: {eur(b.courtageHaupt)} · Cross-Selling: {eur(b.courtageZusatz)}
          </p>
        ) : null}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2" data-je-vertrag>
            <div className="text-xs text-[color:var(--muted)]">Je Vertrag</div>
            <div className="text-sm">
              {b.crossSell ? "Ø " : ""}<b className="tabular-nums">{eur(b.lebenszeitJeVertrag)}</b> Courtage über die Laufzeit
            </div>
            <div className="text-sm">
              <b className="tabular-nums">{b.kostenJeVertrag != null ? eur(b.kostenJeVertrag) : "–"}</b> Kosten je Vertrag
            </div>
          </div>
          <div className="rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2" data-nach-kampagne>
            <div className="text-xs text-[color:var(--muted)]">Nach {b.kampagne} Monaten Kampagne</div>
            <div className="text-sm">
              <b className="tabular-nums">{zahl(b.vertraegeNachKampagne)}</b> Verträge im Bestand
              {b.crossSell ? <> + <b className="tabular-nums">{zahl(b.zusatzNachKampagne)}</b> Zusatzverträge</> : null}
            </div>
            <div className="text-sm"><b className="tabular-nums">{eur(b.courtageJahrNachKampagne)}</b> Courtage pro Jahr, ohne weitere Kosten</div>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Stat label="Leads/Monat" value={zahl(r.leads)} />
          <Stat label="Verträge/Monat" value={zahl(r.vertraege, 1)} />
          <Stat label="Kosten/Monat" value={eur(r.kosten)} sub="Werbung + Betreuung" />
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1" data-kosten-je-vertrag>
          <h2 className="text-base font-semibold">Kosten je Vertrag</h2>
          <p className="text-3xl font-bold tracking-tight tabular-nums">{b.kostenJeVertrag != null ? eur(b.kostenJeVertrag) : "–"}</p>
        </div>
        <p className="text-sm text-[color:var(--muted)]">
          Werbung + Betreuung/Software{input.ust ? " inkl. USt." : ""} pro Monat ({eur(r.kosten)}) ÷{" "}
          {b.crossSell ? <>({zahl(r.vertraege, 1)} Verträge + {zahl(r.vertraege * input.xRate, 1)} Zusatzverträge)</> : <>{zahl(r.vertraege, 1)} neue Verträge</>} pro Monat.
          Dem stehen Ø {eur(b.lebenszeitJeVertrag)} Courtage je Vertrag über die Laufzeit gegenüber.
        </p>
        <p className="mt-2 text-sm font-medium" data-budget-hinweis>
          Die Betreuung kostet bis {eur(PRICE_LIST.tiers[0].maxBudget)} Werbebudget immer gleich viel – mehr Budget macht jeden Vertrag günstiger.
        </p>
        <div className="mt-3 overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--border)]">
          <table className="w-full text-sm tabular-nums" data-budget-vergleich>
            <thead className="bg-[color:var(--surface-sunken)] text-xs text-[color:var(--muted)]">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Budget/Tag</th>
                <th className="px-3 py-1.5 text-right font-medium">je Vertrag</th>
                <th className="px-3 py-1.5 text-right font-medium">Courtage/Jahr nach 12 Mon.</th>
              </tr>
            </thead>
            <tbody>
              {vergleich.map((z, k) => {
                const aktiv = z.budget === input.budget;
                const stufe = k > 0 && z.betreuung > vergleich[k - 1].betreuung;
                return (
                  <tr key={z.budget} className={`border-t border-[color:var(--border)] ${aktiv ? "bg-[color:var(--brand-soft)] font-semibold" : ""}`}>
                    <td className="px-3 py-1.5">{eur(z.budget)}{aktiv ? <span className="ml-1 text-xs font-normal text-[color:var(--muted)]">Ihre Wahl</span> : null}</td>
                    <td className="px-3 py-1.5 text-right">
                      {z.kostenJeVertrag != null ? eur(z.kostenJeVertrag) : "–"}
                      {stufe ? <span className="block text-[11px] font-normal text-[color:var(--muted)]">höhere Betreuungsstufe</span> : null}
                    </td>
                    <td className="px-3 py-1.5 text-right">{eur(z.courtageJahrNach12)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-[color:var(--muted)]" data-vergleich-hinweis>
          12 Monate Kampagne, {b.crossSell ? "inkl. Cross-Selling" : "ohne Cross-Selling"}.
        </p>
      </Card>

      <Card>
        <p className="text-base" data-breakeven>
          {b.breakEvenMonat != null ? (
            <>Ihre Kosten sind ab <b className="text-[color:var(--brand)]">Monat {b.breakEvenMonat}</b> wieder drin{b.breakEvenMonat > b.kampagne ? <> – {b.breakEvenMonat - b.kampagne} Monate nach Kampagnenende, der Bestand zahlt weiter</> : null}.</>
          ) : (
            <>Bis {jahre} nach Kampagnenende ist die Courtage noch unter den Kosten.</>
          )}
          {b.laufendGedecktMonat != null ? (
            <span className="block text-sm text-[color:var(--muted)]" data-laufend-gedeckt>
              Ab Monat {b.laufendGedecktMonat} deckt die laufende Courtage die monatlichen Kosten.
            </span>
          ) : null}
          {b.ohneCrossSell ? (
            <span className="mt-1 block text-sm text-[color:var(--muted)]" data-ohne-cross-selling>
              Ohne Cross-Selling: {b.ohneCrossSell.laufendGedecktMonat != null ? `gedeckt ab Monat ${b.ohneCrossSell.laufendGedecktMonat}` : "laufend nicht gedeckt während der Kampagne"},{" "}
              {b.ohneCrossSell.breakEvenMonat != null ? `alles zurück nach Monat ${b.ohneCrossSell.breakEvenMonat}` : `bis ${jahre} danach nicht zurück`} ({eur(b.ohneCrossSell.gesamtCourtage)} Courtage).
            </span>
          ) : null}
        </p>
        <BestandVerlauf b={b} />
        <p className="mt-3 text-xs leading-relaxed text-[color:var(--muted)]" data-annahmen>
          Ehrlich gerechnet: Courtage nicht abgezinst. Annahmen: {zahl(input.storno * 100, 1)} % Storno pro Jahr (monatlich gleichmäßig),
          Ø Jahresbeitrag {eur(input.beitrag)}, {zahl(input.trail * 100, 1)} % Bestandscourtage pro Jahr
          {input.rate > 0 ? `, ${zahl(input.rate * 100, 1)} % Abschluss` : ""}, Beitrag und Satz bleiben gleich. Nach der Kampagne keine
          Kosten mehr{TERM_MONTHS[input.laufzeit] > b.kampagne ? ` (Betreuung läuft bis Vertragsende nach ${TERM_MONTHS[input.laufzeit]} Monaten)` : ""}.
          „Je Vertrag“ = Jahrescourtage ÷ Storno (Faustformel{b.crossSell ? ", Ø über Verträge und Zusatzverträge" : ""}).
          {b.crossSell ? (
            <>
              {" "}Cross-Selling: Erfahrungswert eines großen Versicherers – {zahl(input.xRate, Number.isInteger(input.xRate) ? 0 : 1)} {input.xRate === 1 ? "Zusatzvertrag" : "Zusatzverträge"} je Kunde,
              {CROSS_SELL_VERZOEGERUNG === 0 ? " direkt beim Abschluss" : ` ${CROSS_SELL_VERZOEGERUNG} Monate später`}; Ø Jahresbeitrag {eur(input.xBeitrag)},
              {" "}{zahl(input.xTrail * 100, 1)} % Bestandscourtage, gleicher Storno.
            </>
          ) : null}
        </p>
      </Card>
    </>
  );
}

const KOSTEN_FARBE = "#c2410c"; // zweite Serie, gegen --brand geprüft (Farbsehschwäche, Kontrast)

/** Kumulierte Courtage vs. kumulierte Kosten: Kampagnenende und Break-even markiert. */
function BestandVerlauf({ b }: { b: BestandResult }) {
  const [hover, setHover] = useState<number | null>(null);
  // Breite in echten Pixeln, damit Beschriftungen auf dem Handy lesbar bleiben (nicht mitskaliert)
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 230, L = 8, R = 8, T = 22, B = 26;
  const n = b.monate;
  const max = Math.max(1, ...b.kumCourtage, ...b.kumKosten);
  const x = (m: number) => L + ((W - L - R) * m) / n;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const path = (vals: number[]) => vals.map((v, m) => `${m ? "L" : "M"}${x(m).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const jahre = n / 12;
  const platz = Math.max(2, Math.floor(W / 64)); // eine Beschriftung je ~64 px
  const step = Math.max(1, Math.ceil(jahre / platz));
  const ticks: number[] = [];
  for (let j = 0; j <= jahre; j += step) ticks.push(j * 12);
  const be = b.breakEvenMonat;
  // Direkte Beschriftung am Linienende, bei Nähe auseinanderschieben
  let yc = y(b.kumCourtage[n]) - 6, yk = y(b.kumKosten[n]) - 6;
  if (Math.abs(yc - yk) < 14) {
    if (b.kumCourtage[n] >= b.kumKosten[n]) yk = yc + 14;
    else yc = yk + 14;
  }
  const h = hover;
  const frac = h != null ? x(h) / W : 0;
  // Monat unter dem Zeiger (Maus: Bewegung, Handy: Antippen)
  const zeige = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const vx = ((e.clientX - box.left) / box.width) * W;
    setHover(Math.max(0, Math.min(n, Math.round(((vx - L) / (W - L - R)) * n))));
  };
  return (
    <div className="mt-4">
      <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--muted)]" aria-hidden>
        <span className="inline-flex items-center gap-1.5"><svg width="18" height="6"><line x1="0" x2="18" y1="3" y2="3" stroke="var(--brand)" strokeWidth="2.5" /></svg>Courtage kumuliert</span>
        <span className="inline-flex items-center gap-1.5"><svg width="18" height="6"><line x1="0" x2="18" y1="3" y2="3" stroke={KOSTEN_FARBE} strokeWidth="2" strokeDasharray="5 3" /></svg>Kosten kumuliert</span>
        {b.ohneCrossSell ? (
          <span className="inline-flex items-center gap-1.5"><svg width="18" height="6"><line x1="0" x2="18" y1="3" y2="3" stroke="var(--brand)" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="2 3" /></svg>Courtage ohne Cross-Selling</span>
        ) : null}
      </div>
      <div className="relative" ref={box}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Kumulierte Courtage ${eur(b.gesamtCourtage)} gegenüber Kosten ${eur(b.gesamtKosten)} über ${n} Monate${be != null ? `, Break-even in Monat ${be}` : ""}`}
          data-bestand-chart
        >
          <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" strokeWidth="1" />
          {/* Kampagnenende */}
          <line x1={x(b.kampagne)} x2={x(b.kampagne)} y1={T - 6} y2={y(0)} stroke="var(--border-strong)" strokeWidth="1" strokeDasharray="3 3" />
          <text x={x(b.kampagne) + 4} y={T - 8} fontSize="12" fill="var(--muted)">Kampagnenende</text>
          <path d={path(b.kumKosten)} fill="none" stroke={KOSTEN_FARBE} strokeWidth="2" strokeDasharray="6 4" strokeLinejoin="round" />
          {b.ohneCrossSell ? (
            <path d={path(b.ohneCrossSell.kumCourtage)} fill="none" stroke="var(--brand)" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="2 3" strokeLinejoin="round" data-ohne-linie />
          ) : null}
          <path d={path(b.kumCourtage)} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" />
          <text x={W - R} y={yc} textAnchor="end" fontSize="12" fill="var(--foreground)">Courtage</text>
          <text x={W - R} y={yk} textAnchor="end" fontSize="12" fill="var(--muted)">Kosten</text>
          {be != null ? (
            <g data-breakeven-marker>
              <circle cx={x(be)} cy={y(b.kumCourtage[be])} r={5} fill="var(--foreground)" stroke="#fff" strokeWidth="2" />
              <text
                x={x(be)}
                y={y(b.kumCourtage[be]) + 22}
                textAnchor={x(be) / W > 0.8 ? "end" : x(be) / W < 0.2 ? "start" : "middle"}
                fontSize="12"
                fill="var(--foreground)"
                stroke="#fff"
                strokeWidth="4"
                paintOrder="stroke"
              >
                Break-even Monat {be}
              </text>
            </g>
          ) : null}
          {h != null ? (
            <g pointerEvents="none">
              <line x1={x(h)} x2={x(h)} y1={T} y2={y(0)} stroke="var(--muted)" strokeWidth="1" />
              <circle cx={x(h)} cy={y(b.kumCourtage[h])} r={4} fill="var(--brand)" stroke="#fff" strokeWidth="2" />
              <circle cx={x(h)} cy={y(b.kumKosten[h])} r={4} fill={KOSTEN_FARBE} stroke="#fff" strokeWidth="2" />
            </g>
          ) : null}
          {ticks.map((m) => (
            <text key={m} x={x(m)} y={H - 8} textAnchor={m === 0 ? "start" : m >= n - 6 ? "end" : "middle"} fontSize="12" fill="var(--muted)">
              {m === 0 ? "Start" : `Jahr ${m / 12}`}
            </text>
          ))}
          <rect
            x={L}
            y={0}
            width={W - L - R}
            height={H}
            fill="transparent"
            onPointerMove={zeige}
            onPointerDown={zeige}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {h != null ? (
          <div
            className={`pointer-events-none absolute whitespace-nowrap rounded-[6px] bg-[color:var(--foreground)] px-2 py-1 text-xs text-white shadow ${
              frac < 0.3 ? "" : frac > 0.7 ? "-translate-x-full" : "-translate-x-1/2"
            }`}
            style={{ left: `${frac * 100}%`, top: 0 }}
            data-tooltip
          >
            <b>{h === 0 ? "Start (Setup)" : `Monat ${h}`}</b> · Courtage {eur(b.kumCourtage[h])} · Kosten {eur(b.kumKosten[h])}
            {h > 0 ? (
              <span className="block opacity-80">
                {zahl(b.bestand[h])} Verträge im Bestand{b.crossSell ? ` + ${zahl(b.bestandZusatz[h])} Zusatzverträge` : ""}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Kumulierter Überschuss über 12 Monate: eine Linie, Nulllinie, Break-even-Monat markiert. */
function Verlauf({ r }: { r: RechnerResult }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = 190, L = 8, R = 8, T = 16, B = 26;
  const vals = r.kumuliert;
  const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
  const span = max - min || 1;
  const x = (m: number) => L + ((W - L - R) * m) / 12;
  const y = (v: number) => T + (H - T - B) * (1 - (v - min) / span);
  const path = vals.map((v, m) => `${m ? "L" : "M"}${x(m).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const h = hover ?? r.breakEvenMonat;
  return (
    <div className="relative mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Kumulierter Überschuss über 12 Monate">
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" strokeWidth="1" />
        <text x={W - R} y={y(0) - 4} textAnchor="end" fontSize="11" fill="var(--muted)">0 €</text>
        <path d={path} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" />
        {vals.map((v, m) => (
          <g key={m}>
            <circle cx={x(m)} cy={y(v)} r={m === r.breakEvenMonat ? 5 : 3} fill={m === r.breakEvenMonat ? "#059669" : "var(--brand)"} stroke="#fff" strokeWidth="2" />
            {m % 3 === 0 || m === 12 ? (
              <text x={x(m)} y={H - 8} textAnchor={m === 0 ? "start" : m === 12 ? "end" : "middle"} fontSize="11" fill="var(--muted)">{m === 0 ? "Start" : `Monat ${m}`}</text>
            ) : null}
            <rect x={x(m) - 22} y={T} width={44} height={H - T - B} fill="transparent" onPointerEnter={() => setHover(m)} onPointerLeave={() => setHover(null)} />
          </g>
        ))}
      </svg>
      {h != null ? (
        <div
          // am Rand bündig ausrichten, damit der Hinweis nicht aus der Karte ragt
          className={`pointer-events-none absolute whitespace-nowrap rounded-[6px] bg-[color:var(--foreground)] px-2 py-1 text-xs text-white shadow ${
            h <= 3 ? "" : h >= 9 ? "-translate-x-full" : "-translate-x-1/2"
          }`}
          style={{ left: `${(x(h) / W) * 100}%`, top: 0 }}
        >
          {h === 0 ? "Start (Setup)" : `Monat ${h}`}: {vals[h] >= 0 ? "+" : "−"} {eur(Math.abs(vals[h]))}
          {h === r.breakEvenMonat && hover == null ? " · Break-even" : ""}
        </div>
      ) : null}
    </div>
  );
}

function Staffel({ kind, value, onChange }: { kind: "percent" | "monthly"; value: StaffelStufe[]; onChange: (s: StaffelStufe[]) => void }) {
  const [rows, setRows] = useState<{ ab: string; wert: string }[]>(
    value.map((s) => ({ ab: String(s.ab), wert: String(kind === "monthly" ? s.wert : pctOut(s.wert)) })),
  );
  const emit = (next: { ab: string; wert: string }[]) => {
    setRows(next);
    const parsed: StaffelStufe[] = [];
    for (const r of next) {
      const ab = Number(r.ab.replace(",", "."));
      const w = Number(r.wert.replace(",", "."));
      if (Number.isFinite(ab) && ab >= 1 && Number.isFinite(w) && w >= 0 && r.ab.trim() && r.wert.trim()) parsed.push({ ab: Math.round(ab), wert: kind === "monthly" ? w : w / 100 });
    }
    onChange(parsed.sort((a, b) => a.ab - b.ab));
  };
  return (
    <details className="mt-3" open={rows.length > 0}>
      <summary className="cursor-pointer text-sm font-medium text-[color:var(--brand)]">Provisionsstaffel (optional)</summary>
      <p className="mt-1 text-xs text-[color:var(--muted)]">Ab einer Zahl Verträge im Monat gilt ein höherer Satz – für alle Verträge des Monats.</p>
      <div className="mt-2 space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
            ab
            <input inputMode="numeric" aria-label="ab Verträgen" value={r.ab} onChange={(e) => emit(rows.map((x, k) => (k === i ? { ...x, ab: e.target.value } : x)))} className={`${inputCls} w-20`} />
            Verträgen:
            <input inputMode="decimal" aria-label="Satz" value={r.wert} onChange={(e) => emit(rows.map((x, k) => (k === i ? { ...x, wert: e.target.value } : x)))} className={`${inputCls} w-20`} />
            {kind === "monthly" ? "Monatsbeiträge" : "%"}
            <button type="button" onClick={() => emit(rows.filter((_, k) => k !== i))} className="text-[color:var(--muted)] hover:text-rose-600" aria-label="Stufe entfernen">✕</button>
          </div>
        ))}
        {rows.length < 3 ? (
          <button type="button" onClick={() => emit([...rows, { ab: "", wert: "" }])} className="text-sm font-medium text-[color:var(--brand)]">+ Stufe</button>
        ) : null}
      </div>
    </details>
  );
}

const inputCls =
  "h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-base outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/15";

function NumField({
  label, hint, suffix, value, min, max, step, onChange,
}: { label: string; hint?: string; suffix?: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(() => String(Math.round(value * 100) / 100).replace(".", ","));
  const n = Number(text.replace(",", "."));
  const bad = text.trim() !== "" && (!Number.isFinite(n) || n < min || n > max);
  return (
    <label className="block min-w-0">
      <span className="block text-sm font-medium">{label}</span>
      {hint ? <span className="block text-xs text-[color:var(--muted)]">{hint}</span> : null}
      <span className="relative mt-1 block">
        <input
          inputMode="decimal"
          value={text}
          step={step}
          aria-invalid={bad}
          onChange={(e) => {
            setText(e.target.value);
            const v = Number(e.target.value.replace(",", "."));
            if (e.target.value.trim() !== "" && Number.isFinite(v) && v >= min && v <= max) onChange(v);
          }}
          className={`${inputCls} ${suffix ? "pr-10" : ""} ${bad ? "border-rose-400" : ""}`}
        />
        {suffix ? <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[color:var(--muted)]">{suffix}</span> : null}
      </span>
    </label>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-flow-col gap-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] p-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-10 rounded-[6px] px-2 py-1.5 text-sm font-medium transition ${value === o.value ? "bg-white text-[color:var(--foreground)] shadow-sm" : "text-[color:var(--muted)]"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-sm)] sm:p-5">{children}</div>;
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">{children}</label>;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2">
      <div className="text-xs text-[color:var(--muted)]">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
      {sub ? <div className="text-[11px] text-[color:var(--muted)]">{sub}</div> : null}
    </div>
  );
}
