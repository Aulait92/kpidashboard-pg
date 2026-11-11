"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ShieldCheck } from "lucide-react";
import {
  BUDGET_MAX,
  BUDGET_MIN,
  DAYS_PER_MONTH,
  SEAT_MONTHLY,
  SEATS_INCLUDED,
  berechne,
  defaultInput,
  inputToParams,
  leadGuaranteeFor,
  productsFor,
  type RechnerConfig,
  type RechnerInput,
  type RechnerProduct,
  type RechnerResult,
  type StaffelStufe,
} from "@/lib/rechner";
import type { CplInfo } from "@/lib/rechner";
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
  const cplInfo = cpl[product.key] ?? { cpl: product.cpl, source: "erfahrungswert" as const, note: product.cplNote || "Erfahrungswert" };
  const r = berechne(product, input, cplInfo.cpl); // günstig, ohne Memo

  // URL mitführen (teilbar), ohne neuen Verlaufseintrag
  useEffect(() => {
    const q = inputToParams(config, input).toString();
    window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
  }, [config, input]);

  const set = (patch: Partial<RechnerInput>) => setInput((i) => ({ ...i, ...patch }));
  const reset = (typ: VermittlerTyp, key: string) => {
    const list = productsFor(config, typ);
    const p = list.find((x) => x.key === key) ?? list[0];
    setInput((i) => defaultInput(p, typ, { budget: i.budget, laufzeit: i.laufzeit, jaehrlich: i.jaehrlich, berater: i.berater, ust: i.ust }));
    setVersion((v) => v + 1);
  };

  const guarantee = leadGuaranteeFor(config, product, input.budget);
  const anyGuarantee = config.guarantees.productSwap.enabled || !!guarantee || config.guarantees.breakEven.enabled;

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
              {products.length > 1 ? (
                <div className="mt-4">
                  <Label htmlFor="produkt">Produkt</Label>
                  <select id="produkt" value={product.key} onChange={(e) => reset(input.typ, e.target.value)} className={inputCls}>
                    {products.map((p) => (
                      <option key={p.key} value={p.key}>{p.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="mt-4 text-sm"><span className="text-[color:var(--muted)]">Produkt: </span><b>{product.name}</b></p>
              )}
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
                  <NumField key={`tq-${version}`} label="Leads mit Termin (optional)" hint="nur zur Info" suffix="%" value={pctOut(input.terminRate)} min={0} max={100} onChange={(v) => set({ terminRate: v / 100 })} />
                </div>
                <p className="mt-3 text-sm text-[color:var(--muted)]">
                  Kosten pro Lead: <b className="text-[color:var(--foreground)] tabular-nums">{eur(cplInfo.cpl, 2)}</b> · {cplInfo.note}
                </p>
              </details>
            </Card>

            <Card>
              <h2 className="mb-3 text-base font-semibold">Ihr Paket</h2>
              <Segmented
                value={input.laufzeit}
                options={[{ value: "12m", label: "12 Monate (Setup 990 €)" }, { value: "none", label: "Ohne Laufzeit (2.490 €)" }]}
                onChange={(v) => set({ laufzeit: v as "12m" | "none", jaehrlich: v === "12m" ? input.jaehrlich : false })}
              />
              <label className={`mt-3 flex items-center gap-2 text-sm ${input.laufzeit !== "12m" ? "opacity-50" : ""}`}>
                <input type="checkbox" className="h-4 w-4" checked={input.jaehrlich} disabled={input.laufzeit !== "12m"} onChange={(e) => set({ jaehrlich: e.target.checked })} />
                Jährlich im Voraus zahlen: 2 Monate geschenkt
              </label>
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
            <Ergebnis r={r} product={product} />
            {anyGuarantee ? (
              <Card>
                <h2 className="mb-2 flex items-center gap-2 text-base font-semibold"><ShieldCheck className="h-5 w-5 text-emerald-600" /> Ihre Sicherheit</h2>
                <ul className="space-y-3 text-sm" data-garantien>
                  {guarantee ? (
                    <li>
                      <b>{config.guarantees.leads.title}: mindestens {zahl(guarantee.minLeads)} Leads in 30 Tagen</b>
                      {guarantee.erfuellt ? null : (
                        <span className="text-amber-700"> – gilt ab {eur(guarantee.minBudget)} pro Tag, erhöhen Sie das Budget</span>
                      )}
                      <p className="text-[color:var(--muted)]">{config.guarantees.leads.text}</p>
                    </li>
                  ) : null}
                  {config.guarantees.breakEven.enabled ? (
                    <li><b>{config.guarantees.breakEven.title}</b><p className="text-[color:var(--muted)]">{config.guarantees.breakEven.text}</p></li>
                  ) : null}
                  {config.guarantees.productSwap.enabled ? (
                    <li><b>{config.guarantees.productSwap.title}</b><p className="text-[color:var(--muted)]">{config.guarantees.productSwap.text}</p></li>
                  ) : null}
                </ul>
                <p className="mt-3 text-xs text-[color:var(--muted)]">
                  <a href={config.termsUrl} target="_blank" rel="noopener" className="underline hover:text-[color:var(--brand)]" data-agb-link>Details in unseren AGB</a>
                </p>
              </Card>
            ) : null}
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

function Ergebnis({ r, product }: { r: RechnerResult; product: RechnerProduct }) {
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
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Leads" value={zahl(r.leads)} />
          <Stat label="Kunden" value={zahl(r.kunden)} sub={r.termine > 0 ? `≈ ${zahl(r.termine)} Termine` : undefined} />
          <Stat label="Verträge" value={zahl(r.vertraege, 1)} />
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
        <p className="mt-1 text-xs text-[color:var(--muted)]">Kumulierter Überschuss nach Setup, {product.name}.</p>
      </Card>
    </>
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
