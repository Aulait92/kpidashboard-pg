"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import type { ZahlenData } from "@/lib/zahlen";
import { saveUpdateTextsAction } from "@/app/admin/zahlen/actions";
import { cn } from "@/lib/utils";

// ─── Format ──────────────────────────────────────────────────────────────
const eur = (v: number, d = 0) => v.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: d, minimumFractionDigits: d });
const kEur = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} T€` : eur(v));
const pct = (v: number, d = 1) => `${v.toLocaleString("de-DE", { maximumFractionDigits: d, minimumFractionDigits: d })} %`;
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const longMonth = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;
const shortMonth = (k: string) => MONTHS[Number(k.slice(5, 7)) - 1].slice(0, 3);

const STREAMS = [
  { key: "ppl", name: "Pay-per-Lead", color: "var(--z-s1)" },
  { key: "service", name: "Betreuung", color: "var(--z-s2)" },
  { key: "software", name: "Software", color: "var(--z-s3)" },
] as const;

// Validierte Palette (Kategorie 1–3), hell und dunkel; Status für Brücke.
const PALETTE = {
  "--z-s1": "#2a78d6",
  "--z-s2": "#eb6834",
  "--z-s3": "#1baf7a",
  "--z-good": "#0ca30c",
  "--z-bad": "#d03b3b",
  "--z-seq-1": "#cde2fb",
  "--z-seq-2": "#9ec5f4",
  "--z-seq-3": "#6da7ec",
  "--z-seq-4": "#3987e5",
  "--z-seq-5": "#256abf",
  "--z-seq-6": "#184f95",
} as CSSProperties;

type Tab = "wachstum" | "kunden" | "wirtschaft" | "wirkung" | "vertrieb" | "ppl";
const TABS: { key: Tab; label: string; internal?: boolean }[] = [
  { key: "wachstum", label: "Wachstum" },
  { key: "kunden", label: "Kunden" },
  { key: "wirtschaft", label: "Wirtschaftlichkeit" },
  { key: "wirkung", label: "Wirkung beim Vertreter" },
  { key: "vertrieb", label: "Vertrieb", internal: true },
  { key: "ppl", label: "Pay-per-Lead", internal: true },
];

// ─── Tooltip ─────────────────────────────────────────────────────────────
type TipState = { x: number; y: number; html: ReactNode } | null;
let setTipGlobal: ((t: TipState) => void) | null = null;
const tipHandlers = (content: ReactNode) => ({
  onPointerEnter: (e: React.PointerEvent) => setTipGlobal?.({ x: e.clientX, y: e.clientY, html: content }),
  onPointerMove: (e: React.PointerEvent) => setTipGlobal?.({ x: e.clientX, y: e.clientY, html: content }),
  onPointerLeave: () => setTipGlobal?.(null),
});

function Tooltip() {
  const [tip, setTip] = useState<TipState>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setTipGlobal = setTip;
    return () => {
      setTipGlobal = null;
    };
  }, []);
  // Position erst nach dem Rendern (Größe des Tooltips ist dann bekannt)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !tip) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    el.style.left = `${tip.x + 14 + w > window.innerWidth - 8 ? tip.x - w - 14 : tip.x + 14}px`;
    el.style.top = `${tip.y - h - 10 < 8 ? tip.y + 16 : tip.y - h - 10}px`;
  }, [tip]);
  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none fixed left-0 top-0 z-50 max-w-[260px] rounded-lg bg-[color:var(--foreground)] px-3 py-2 text-[12.5px] text-white shadow-lg transition-opacity"
      style={{ opacity: tip ? 1 : 0 }}
    >
      {tip?.html}
    </div>
  );
}

function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / (p / 2)) * (p / 2);
}

function roundTop(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return "";
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

// ─── Bausteine ───────────────────────────────────────────────────────────
function Card({ title, cap, children, className, style }: { title?: string; cap?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section className={cn("min-w-0 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-sm)] sm:p-5", className)} style={style}>
      {title ? <h2 className="text-[15px] font-semibold">{title}</h2> : null}
      {cap ? <p className="mb-3 mt-0.5 text-[13px] text-[color:var(--muted)]">{cap}</p> : null}
      {children}
    </section>
  );
}

function Empty({ children = "Noch keine Daten." }: { children?: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-[color:var(--border)] px-3 py-6 text-center text-sm text-[color:var(--muted)]">{children}</p>;
}

function Early() {
  return <span className="rounded px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-wide text-amber-800" style={{ background: "#fff4dc" }}>früh</span>;
}

function KV({ items }: { items: { k: string; v: ReactNode; s?: ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map((i) => (
        <div key={i.k} className="min-w-0 rounded-[10px] bg-[color:var(--surface-sunken)] px-3 py-2.5">
          <div className="text-xs text-[color:var(--muted)]">{i.k}</div>
          <div className="text-[19px] font-semibold tabular-nums tracking-tight">{i.v}</div>
          {i.s ? <div className="text-xs text-[color:var(--muted)]">{i.s}</div> : null}
        </div>
      ))}
    </div>
  );
}

function BarRow({ label, value, max, color, right, labelWidth = 120 }: { label: string; value: number; max: number; color: string; right: ReactNode; labelWidth?: number }) {
  return (
    <div className="my-2 grid items-center gap-2.5 text-[13px]" style={{ gridTemplateColumns: `${labelWidth}px minmax(0,1fr) auto` }}>
      <span className="truncate">{label}</span>
      <div className="h-3 overflow-hidden rounded bg-[color:var(--surface-sunken)]">
        <div className="h-full rounded-r" style={{ width: `${max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0}%`, background: color }} />
      </div>
      <span className="text-right font-semibold tabular-nums">{right}</span>
    </div>
  );
}

function Def({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return null;
  return <div className="mt-2 border-t border-dashed border-[color:var(--border)] pt-2 text-xs text-[color:var(--muted)]">{children}</div>;
}

// ─── Hauptansicht ────────────────────────────────────────────────────────
export function ZahlenView({ data }: { data: ZahlenData }) {
  const [tab, setTab] = useState<Tab>("wachstum");
  const [investor, setInvestor] = useState(false);
  const [update, setUpdate] = useState(false);
  useEffect(() => {
    try {
      const t = localStorage.getItem("zahlen-tab") as Tab | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- gemerkter Bereich erst nach dem Laden
      if (t && TABS.some((x) => x.key === t)) setTab(t);
    } catch {}
  }, []);
  const choose = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem("zahlen-tab", t);
    } catch {}
  };
  const visibleTabs = TABS.filter((t) => !(investor && t.internal));
  const active = visibleTabs.some((t) => t.key === tab) ? tab : "wachstum";
  const h = data.headline;
  const growthUp = (h.growth ?? 0) >= 0;
  const hasRevenue = data.totals.some((t) => t.recurring > 0);

  const tiles = [
    { lbl: "Jahresumsatz (Laufrate)", val: kEur(h.arr), delta: h.growth != null ? `${growthUp ? "+" : ""}${pct(h.growth * 100)}` : null, up: growthUp, note: "MRR × 12", def: "Wiederkehrender Monatsumsatz × 12. Ohne Einrichtungs- und WhatsApp-Gebühren." },
    { lbl: "MRR", val: kEur(h.mrr), delta: h.mrrPrev > 0 ? `${h.mrr >= h.mrrPrev ? "+" : "−"}${kEur(Math.abs(h.mrr - h.mrrPrev))}` : null, up: h.mrr >= h.mrrPrev, note: `davon vertraglich ${kEur(h.contractual)}`, def: "Wiederkehrender Monatsumsatz des laufenden Monats (hochgerechnet): Software, Betreuung und Pay-per-Lead nach Stornos." },
    { lbl: "Wachstum zum Vormonat", val: h.growth != null ? `${growthUp ? "+" : ""}${pct(h.growth * 100)}` : "–", delta: h.avgGrowth != null ? `Ø ${h.avgGrowth >= 0 ? "+" : ""}${pct(h.avgGrowth * 100, 0)} pro Monat` : null, up: (h.avgGrowth ?? 0) >= 0, note: `${shortMonth(data.current)}* vs. ${shortMonth(data.lastComplete)}`, def: "Veränderung des MRR gegenüber dem letzten abgeschlossenen Monat; Ø = durchschnittliches Monatswachstum seit dem ersten Umsatzmonat." },
    { lbl: "Umsatzbindung", early: h.early, val: h.retention ? `${h.retention.pct} %` : "–", delta: null, up: true, note: h.retention ? `${h.retention.customers} Kunden, nach ${h.retention.lag} Monaten` : "noch zu wenig Historie", def: "Umsatz im letzten abgeschlossenen Monat von Kunden, die vor 3 (ab einem Jahr Historie: 12) Monaten aktiv waren, geteilt durch deren Umsatz damals. Mit Ausbau, abzüglich Kündigungen." },
    { lbl: "Bruttomarge", val: h.grossMargin != null ? pct(h.grossMargin * 100, 0) : "–", delta: h.grossMargin != null && h.grossMarginPrev != null ? `${h.grossMargin >= h.grossMarginPrev ? "+" : "−"}${pct(Math.abs(h.grossMargin - h.grossMarginPrev) * 100, 0).replace(" %", " Pkt.")}` : null, up: (h.grossMargin ?? 0) >= (h.grossMarginPrev ?? 0), note: `${longMonth(data.lastComplete)}, nach direkten Kosten`, def: "(Wiederkehrender Umsatz − direkte Kosten) ÷ Umsatz. Direkt: Meta-Werbung für Kunden-Leads und laufende Kosten mit Zweck „Pay-per-Lead“ oder „Software“." },
    { lbl: "Aktive Kunden", val: String(h.active), delta: `${h.active - h.activePrev >= 0 ? "+" : ""}${h.active - h.activePrev}`, up: h.active >= h.activePrev, note: `${longMonth(data.lastComplete)} · ${h.churnedTotal} ${h.churnedTotal === 1 ? "Kündigung" : "Kündigungen"} seit Start`, def: "Kunden mit wiederkehrendem Umsatz im letzten abgeschlossenen Monat (ein Kunde zählt einmal, auch mit mehreren Strömen)." },
  ];

  return (
    <div style={PALETTE} className="zahlen-root">
      <Tooltip />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Zahlen</h1>
          <p className="mt-0.5 text-sm text-[color:var(--muted)]">
            Stand {new Date(data.generatedAt).toLocaleDateString("de-DE")} · {longMonth(data.current)} hochgerechnet · Pay-per-Lead seit Juni 2026
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={investor}
            onClick={() => setInvestor((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--border)] bg-white py-1.5 pl-1.5 pr-3 text-sm"
          >
            <span className={cn("relative h-5 w-[34px] rounded-full transition", investor ? "bg-[color:var(--brand)]" : "bg-slate-300")}>
              <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", investor ? "left-4" : "left-0.5")} />
            </span>
            Investoren-Ansicht
          </button>
          <button type="button" onClick={() => setUpdate(true)} className="rounded-[10px] bg-[color:var(--brand)] px-3.5 py-2 text-sm font-semibold text-white">
            Investoren-Update
          </button>
        </div>
      </div>

      {!hasRevenue ? (
        <p className="mb-4 rounded-[10px] bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          Noch keine Umsätze im Umsatzbuch. In der Produktion stehen hier ab dem Livegang die echten Zahlen seit Juni 2026.
        </p>
      ) : null}

      <section className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6" aria-label="Kennzahlen">
        {tiles.map((t) => (
          <div key={t.lbl} className="min-w-0 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-3.5 shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-1.5 text-[12.5px] text-[color:var(--muted)]">
              {t.lbl}
              {t.early ? <Early /> : null}
            </div>
            <div className="mt-1 text-[24px] font-semibold tabular-nums tracking-tight sm:text-[26px]">{t.val}</div>
            {t.delta ? (
              <span className={cn("mt-1 inline-flex rounded-md px-1.5 py-px text-[12.5px] font-semibold tabular-nums", t.up ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700")}>
                {t.up ? "▲" : "▼"} {t.delta}
              </span>
            ) : null}
            <div className="mt-1 text-xs text-[color:var(--muted)]">{t.note}</div>
            <Def show={investor}>{t.def}</Def>
          </div>
        ))}
      </section>

      <div className="mb-3.5 flex gap-1.5 overflow-x-auto pb-0.5" role="tablist">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={active === t.key}
            onClick={() => choose(t.key)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium",
              active === t.key ? "border-[color:var(--foreground)] bg-[color:var(--foreground)] text-white" : "border-[color:var(--border)] bg-white text-[color:var(--muted)]",
            )}
          >
            {t.label}
          </button>
        ))}
        {!investor ? (
          <>
            <Link href="/" className="shrink-0 whitespace-nowrap rounded-full border border-dashed border-[color:var(--border)] px-3.5 py-1.5 text-sm text-[color:var(--muted)]">
              Pay-per-Lead (Details) →
            </Link>
            <Link href="/admin/einstellungen/kosten" className="shrink-0 whitespace-nowrap rounded-full border border-dashed border-[color:var(--border)] px-3.5 py-1.5 text-sm text-[color:var(--muted)]">
              Laufende Kosten →
            </Link>
          </>
        ) : null}
      </div>

      {active === "wachstum" ? <Wachstum data={data} /> : null}
      {active === "kunden" ? <Kunden data={data} investor={investor} /> : null}
      {active === "wirtschaft" ? <Wirtschaft data={data} investor={investor} /> : null}
      {active === "wirkung" ? <Wirkung data={data} investor={investor} /> : null}
      {active === "vertrieb" ? <Vertrieb data={data} /> : null}
      {active === "ppl" ? <Ppl data={data} /> : null}

      {update ? <UpdateSheet data={data} onClose={() => setUpdate(false)} /> : null}
    </div>
  );
}

// ─── Wachstum ────────────────────────────────────────────────────────────
function Wachstum({ data }: { data: ZahlenData }) {
  const [table, setTable] = useState(false);
  const cur = data.totals.find((t) => t.month === data.current);
  const last = data.totals.find((t) => t.month === data.lastComplete);
  const contractualShare = (t?: { recurring: number; service: number; software: number }) => (t && t.recurring > 0 ? (t.service + t.software) / t.recurring : null);
  const b = data.bridge;
  const ausbauShare = b && b.neu + b.ausbau > 0 ? b.ausbau / (b.neu + b.ausbau) : null;
  return (
    <div className="space-y-3.5">
      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title="Umsatz je Monat nach Strom" cap="Wiederkehrender Umsatz. Einrichtungsgebühren getrennt, WhatsApp-Gebühren nicht enthalten (durchlaufend).">
          <Legend />
          <RevenueChart data={data} />
          <button type="button" className="text-[12.5px] text-[color:var(--brand)]" onClick={() => setTable((v) => !v)}>
            {table ? "Tabelle ausblenden" : "Als Tabelle anzeigen"}
          </button>
          {table ? (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[13px] tabular-nums">
                <thead className="text-left text-[color:var(--muted)]">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium">Monat</th>
                    {STREAMS.map((s) => <th key={s.key} className="px-2 text-right font-medium">{s.name}</th>)}
                    <th className="px-2 text-right font-medium">Gesamt</th>
                    <th className="pl-2 text-right font-medium">Einrichtung</th>
                  </tr>
                </thead>
                <tbody>
                  {data.totals.map((t) => (
                    <tr key={t.month} className="border-t border-[color:var(--border)]">
                      <td className="py-1.5 pr-2">{shortMonth(t.month)}{t.month === data.current ? "*" : ""}</td>
                      {STREAMS.map((s) => <td key={s.key} className="px-2 text-right">{eur(t[s.key])}</td>)}
                      <td className="px-2 text-right font-semibold">{eur(t.recurring)}</td>
                      <td className="pl-2 text-right">{eur(t.setup)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
        <Card title={b ? `MRR-Brücke ${longMonth(b.from).split(" ")[0]} → ${longMonth(b.to).split(" ")[0]}` : "MRR-Brücke"} cap="Woher das Wachstum kommt: neue Kunden, Ausbau, Verkleinerung, Kündigungen (abgeschlossene Monate).">
          {b ? (
            <>
              <BridgeChart b={b} />
              {ausbauShare != null ? (
                <div className="mt-3 rounded-[10px] bg-[color:var(--brand-soft)] px-3 py-2.5 text-[13px]">
                  <b>Lesart:</b> {pct(ausbauShare * 100, 0)} des Zuwachses kommen von bestehenden Kunden, die mehr kaufen.
                </div>
              ) : null}
            </>
          ) : (
            <Empty>Braucht zwei abgeschlossene Monate.</Empty>
          )}
        </Card>
      </div>
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card title="Umsatzmix" cap={`Anteil wiederkehrender Umsatz im ${longMonth(data.current)} (hochgerechnet).`}>
          {cur && cur.recurring > 0 ? (
            <>
              <div className="flex h-[22px] gap-0.5 overflow-hidden rounded-md">
                {STREAMS.map((s) => (cur[s.key] > 0 ? <div key={s.key} {...tipHandlers(<><b>{s.name}</b><br />{eur(cur[s.key])} · {pct((cur[s.key] / cur.recurring) * 100)}</>)} style={{ width: `${(cur[s.key] / cur.recurring) * 100}%`, background: s.color }} /> : null))}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-3.5 text-[12.5px] text-[color:var(--muted)]">
                {STREAMS.map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-1.5">
                    <i className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
                    {s.name} <b className="tabular-nums text-[color:var(--foreground)]">{pct((cur[s.key] / cur.recurring) * 100, 0)}</b>
                  </span>
                ))}
              </div>
              <div className="mt-2.5">
                <KV
                  items={[
                    { k: "Vertraglich (Software + Betreuung)", v: kEur(cur.service + cur.software), s: `${pct((contractualShare(cur) ?? 0) * 100, 0)}${contractualShare(last) != null ? ` · Vormonat ${pct((contractualShare(last) ?? 0) * 100, 0)}` : ""}` },
                    { k: "Nutzungsbasiert (Pay-per-Lead)", v: kEur(cur.ppl), s: `${pct((cur.ppl / cur.recurring) * 100, 0)} · wöchentliche Bestellungen` },
                  ]}
                />
              </div>
              <p className="mt-2.5 text-[12.5px] text-[color:var(--muted)]">Ziel: Software und Betreuung wachsen schneller als Pay-per-Lead. Das macht den Umsatz planbarer und erhöht die Bewertung.</p>
            </>
          ) : (
            <Empty />
          )}
        </Card>
        <Card title="Einmalige Umsätze" cap="Einrichtungsgebühren, bewusst nicht im MRR.">
          {data.totals.some((t) => t.setup > 0) ? (
            <>
              {data.totals.map((t) => (
                <BarRow key={t.month} label={shortMonth(t.month)} value={t.setup} max={Math.max(...data.totals.map((x) => x.setup))} color="#b8c2d3" right={eur(t.setup)} labelWidth={50} />
              ))}
              <p className="mt-2 text-[12.5px] text-[color:var(--muted)]">Summe seit Juni: {eur(data.totals.reduce((s, t) => s + t.setup, 0))}.</p>
            </>
          ) : (
            <Empty>Noch keine Einrichtungsgebühren.</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="mb-2 flex flex-wrap gap-3.5 text-[12.5px] text-[color:var(--muted)]">
      {STREAMS.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

function RevenueChart({ data }: { data: ZahlenData }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 260, L = 46, R = 8, T = 20, B = 26;
  const max = niceMax(Math.max(...data.totals.map((t) => t.recurring), 1) * 1.08);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const step = (W - L - R) / Math.max(1, data.totals.length);
  const bw = Math.min(46, step * 0.56);
  const cx = (i: number) => L + step * (i + 0.5);
  return (
    <div ref={ref}>
      <svg width={W} height={H} role="img" aria-label="Umsatz je Monat nach Strom" className="block">
        <defs>
          <pattern id="z-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#fff" strokeWidth="2" opacity=".55" />
          </pattern>
        </defs>
        {[0, 1, 2, 3, 4].map((k) => {
          const v = (max / 4) * k;
          return (
            <g key={k}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--border)" />
              <text x={L - 8} y={y(v) + 4} textAnchor="end" className="fill-slate-400 text-[11px] tabular-nums">{v ? kEur(v).replace(" T€", " T") : "0"}</text>
            </g>
          );
        })}
        {data.totals.map((t, i) => {
          let acc = 0;
          const segs = STREAMS.filter((s) => t[s.key] > 0);
          const projected = t.month === data.current;
          return (
            <g key={t.month}>
              {segs.map((s, j) => {
                const v = t[s.key];
                const top = y(acc + v);
                const hgt = Math.max(0, y(acc) - top - (j > 0 ? 2 : 0));
                const d = roundTop(cx(i) - bw / 2, top, bw, hgt, j === segs.length - 1 ? 4 : 0);
                acc += v;
                return (
                  <g key={s.key}>
                    <path d={d} fill={s.color} />
                    {projected ? <path d={d} fill="url(#z-hatch)" /> : null}
                  </g>
                );
              })}
              {t.recurring > 0 ? <text x={cx(i)} y={y(t.recurring) - 6} textAnchor="middle" className="fill-[color:var(--foreground)] text-[11.5px] font-semibold tabular-nums">{kEur(t.recurring)}</text> : null}
              <text x={cx(i)} y={H - 8} textAnchor="middle" className="fill-slate-400 text-[11px]">{shortMonth(t.month)}{projected ? "*" : ""}</text>
              <rect
                x={cx(i) - step / 2}
                y={T}
                width={step}
                height={H - T - B}
                fill="transparent"
                {...tipHandlers(
                  <>
                    <b>{longMonth(t.month)}{projected ? " (hochgerechnet)" : ""}</b>
                    {STREAMS.map((s) => <div key={s.key}>{s.name}: {eur(t[s.key])}</div>)}
                    <b>Gesamt: {eur(t.recurring)}</b>
                  </>,
                )}
              />
            </g>
          );
        })}
      </svg>
      <p className="mt-0.5 text-[12.5px] text-[color:var(--muted)]">* {longMonth(data.current)} hochgerechnet (schraffiert).</p>
    </div>
  );
}

function BridgeChart({ b }: { b: NonNullable<ZahlenData["bridge"]> }) {
  const [ref, W] = useWidth<HTMLDivElement>(420);
  const steps = [
    { name: `MRR ${shortMonth(b.from)}`, short: shortMonth(b.from), v: b.start, base: true, n: 0 },
    { name: "Neu", short: "Neu", v: b.neu, base: false, n: b.counts.neu },
    { name: "Ausbau", short: "Ausbau", v: b.ausbau, base: false, n: b.counts.ausbau },
    { name: "Verkleinert", short: "Kleiner", v: b.verkleinert, base: false, n: b.counts.verkleinert },
    { name: "Gekündigt", short: "Kündig.", v: b.gekuendigt, base: false, n: b.counts.gekuendigt },
    { name: `MRR ${shortMonth(b.to)}`, short: shortMonth(b.to), v: b.end, base: true, n: 0 },
  ];
  const H = 240, L = 8, R = 8, T = 22, B = 30;
  let peak = 0;
  let run = 0;
  for (const s of steps) {
    run = s.base ? s.v : run + s.v;
    peak = Math.max(peak, run, s.v);
  }
  const max = niceMax(peak * 1.12 || 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const step = (W - L - R) / steps.length;
  const bw = Math.min(44, step * 0.62);
  let acc = 0;
  return (
    <div ref={ref}>
      <svg width={W} height={H} role="img" aria-label="MRR-Brücke" className="block">
        <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--border)" />
        {steps.map((s, i) => {
          const x = L + step * i + (step - bw) / 2;
          let from: number, to: number, fill: string;
          if (s.base) { from = 0; to = s.v; acc = s.v; fill = "var(--z-s1)"; }
          else { from = acc; to = acc + s.v; acc = to; fill = s.v >= 0 ? "var(--z-good)" : "var(--z-bad)"; }
          const top = y(Math.max(from, to));
          const hgt = Math.max(s.v === 0 && !s.base ? 0 : 1.5, Math.abs(y(from) - y(to)));
          const label = s.base || s.v === 0 ? kEur(s.v) : `${s.v > 0 ? "+" : "−"}${kEur(Math.abs(s.v))}`;
          return (
            <g key={s.name}>
              <path d={roundTop(x, top, bw, hgt, s.base ? 4 : 2)} fill={fill} />
              <text x={x + bw / 2} y={top - 6} textAnchor="middle" className="fill-[color:var(--foreground)] text-[11.5px] font-semibold tabular-nums">{label}</text>
              <text x={x + bw / 2} y={H - 10} textAnchor="middle" className="fill-slate-400 text-[11px]">{step < 72 ? s.short : s.name}</text>
              <rect x={L + step * i} y={T} width={step} height={H - T - B} fill="transparent" {...tipHandlers(<><b>{s.name}</b><br />{label}{!s.base ? <><br />{s.n} {s.n === 1 ? "Kunde" : "Kunden"}</> : null}</>)} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Kunden ──────────────────────────────────────────────────────────────
const SEQ = ["var(--z-seq-1)", "var(--z-seq-2)", "var(--z-seq-3)", "var(--z-seq-4)", "var(--z-seq-5)", "var(--z-seq-6)"];
const shade = (p: number) => (p >= 170 ? SEQ[5] : p >= 145 ? SEQ[4] : p >= 125 ? SEQ[3] : p >= 110 ? SEQ[2] : p >= 100 ? SEQ[1] : SEQ[0]);

function Kunden({ data, investor }: { data: ZahlenData; investor: boolean }) {
  const maxAge = Math.max(0, ...data.cohorts.map((c) => c.values.length));
  const c = data.concentration;
  return (
    <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card title="Kohorten: Umsatz je Startmonat" cap="100 % = Umsatz im ersten Monat. Über 100 % heißt: Kunden kaufen mit der Zeit mehr.">
        {data.cohorts.length ? (
          <div className="overflow-x-auto">
            <table className="w-full border-separate text-[12.5px] tabular-nums" style={{ borderSpacing: 3 }}>
              <thead className="text-[color:var(--muted)]">
                <tr>
                  <th className="text-left font-medium">Start</th>
                  <th className="text-right font-medium">Kunden</th>
                  {Array.from({ length: maxAge }, (_, k) => <th key={k} className="font-medium">Monat {k}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.cohorts.map((co) => (
                  <tr key={co.start}>
                    <td>{shortMonth(co.start)}</td>
                    <td className="text-right">{co.customers}</td>
                    {Array.from({ length: maxAge }, (_, k) => {
                      const p = co.values[k];
                      if (p == null) return <td key={k} />;
                      return (
                        <td key={k} className="rounded-md px-1 py-1.5 text-center" style={{ background: shade(p), color: p >= 125 ? "#fff" : "var(--foreground)" }} {...tipHandlers(<><b>Start {longMonth(co.start)}</b>, Monat {k}<br />{p} % des Startumsatzes</>)}>
                          {p} %
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Braucht mindestens einen abgeschlossenen Monat mit Umsatz.</Empty>
        )}
        <p className="mt-2.5 text-[12.5px] text-[color:var(--muted)]">
          <Early /> Monat 0 ist oft ein Teilmonat (Start mitten im Monat), dadurch wirkt Monat 1 höher. Ab 12 Monaten Historie zeigt die Seite die echte Netto-Umsatzbindung.
        </p>
      </Card>
      <Card title="Kundenbasis" cap={`Aktive Kunden je Strom im ${longMonth(data.lastComplete)} (ein Kunde kann mehrere Ströme haben).`}>
        <KV
          items={[
            { k: "Pay-per-Lead", v: data.customersByStream.ppl },
            { k: "Betreuung", v: data.customersByStream.service },
            { k: "Software", v: data.customersByStream.software },
            { k: "Kündigungsquote", v: data.churn ? pct(data.churn.rate * 100) : "–", s: data.churn ? `pro Monat (${data.churn.churned} von Ø ${Math.round(data.churn.avgActive)} Kunden)` : "noch zu wenig Historie" },
          ]}
        />
        <Def show={investor}>Kündigung = Kunde hatte im Vormonat wiederkehrenden Umsatz und im Monat keinen. Pay-per-Lead-Käufer, die einen Monat aussetzen, zählen dabei als Kündigung und bei Rückkehr als neu.</Def>
        <h2 className="mt-4 text-[15px] font-semibold">Abhängigkeit</h2>
        <p className="mb-3 mt-0.5 text-[13px] text-[color:var(--muted)]">Anteil der größten Kunden am Umsatz im {longMonth(data.lastComplete)}.</p>
        {c ? (
          <>
            <div className="flex h-[22px] gap-0.5 overflow-hidden rounded-md">
              {c.top.map((t, i) => <div key={i} style={{ width: `${t.pct}%`, background: SEQ[5 - i] ?? SEQ[1] }} {...tipHandlers(<><b>{investor ? `Kunde ${i + 1}` : t.name}</b><br />{pct(t.pct)} des Umsatzes</>)} />)}
              {100 - c.topPct > 0 ? <div className="bg-[color:var(--surface-sunken)]" style={{ width: `${100 - c.topPct}%` }} {...tipHandlers(<><b>Übrige {c.rest} Kunden</b><br />{pct(100 - c.topPct)}</>)} /> : null}
            </div>
            <p className="mt-2.5 text-[12.5px] text-[color:var(--muted)]">
              Top {c.top.length}: <b className="text-[color:var(--foreground)]">{pct(c.topPct, 0)}</b> · größter Kunde {pct(c.largestPct, 0)}. Ab ~20 % für einen Kunden fragen Investoren nach.
            </p>
          </>
        ) : (
          <Empty />
        )}
      </Card>
    </div>
  );
}

// ─── Wirtschaftlichkeit ──────────────────────────────────────────────────
function Wirtschaft({ data, investor }: { data: ZahlenData; investor: boolean }) {
  const u = data.unit;
  const m = data.margins;
  const fmtMonths = (v: number | null) => (v == null ? "–" : `${v.toLocaleString("de-DE", { maximumFractionDigits: 1 })} Mon.`);
  const PURPOSE: Record<string, string> = { ppl: "direkt (Pay-per-Lead)", software: "direkt (Software)", akquise: "Kundengewinnung", betrieb: "sonstiger Betrieb" };
  return (
    <div className="space-y-3.5">
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Card title="Kundengewinnung" cap={`Was ein neuer Kunde kostet und einbringt (${u.window.map(shortMonth).join(", ") || "–"}).`}>
          <KV
            items={[
              { k: "Kosten je Neukunde (CAC)", v: u.cac != null ? eur(u.cac) : "–", s: u.cacFounder != null ? `mit Gründerzeit ${eur(u.cacFounder)}` : `${u.newCustomers} neue Kunden` },
              { k: "Rohertrag je Kunde/Monat", v: u.grossProfitPerCustomer != null ? eur(u.grossProfitPerCustomer) : "–", s: "Umsatz − direkte Kosten" },
              { k: "Amortisation", v: fmtMonths(u.payback), s: u.paybackFounder != null ? `mit Gründerzeit ${fmtMonths(u.paybackFounder)}` : undefined },
              { k: "Kundenwert / CAC", v: u.ltvCac != null ? `${u.ltvCac.toLocaleString("de-DE", { maximumFractionDigits: 0 })}×` : "–", s: "LTV auf 24 Mon. gedeckelt, mit Gründerzeit · Ziel > 3×" },
            ]}
          />
          <div className="mt-3 rounded-[10px] bg-[color:var(--brand-soft)] px-3 py-2.5 text-[13px]">
            Kein Gehalt im Vertrieb, daher sehr niedrige Gewinnungskosten. Zusätzlich gerechnet <b>mit Gründerzeit</b>: {u.settings.hours} Std./Woche × {eur(u.settings.rate)}/Std. ≈ {eur(u.founderMonthly)}/Monat.
          </div>
          <Def show={investor}>CAC = Kosten der Kundengewinnung (eigene Meta-Kampagnen, Instantly u. a.) ÷ neue Kunden der letzten 3 Monate. Neukunde = erster Monat mit wiederkehrendem Umsatz. LTV = Rohertrag je Kunde × erwartete Laufzeit (1 ÷ Kündigungsquote, höchstens 24 Monate).</Def>
        </Card>
        <Card title="Bruttomarge je Strom" cap={`${longMonth(data.lastComplete)}: Umsatz abzüglich direkter Kosten.`}>
          {(
            [
              { name: "Betreuung", v: m.service, color: "var(--z-s2)" },
              { name: "Software", v: m.software, color: "var(--z-s3)" },
              { name: "Pay-per-Lead", v: m.ppl, color: "var(--z-s1)" },
              { name: "Gesamt", v: m.total, color: "var(--foreground)" },
            ] as const
          ).map((r) => <BarRow key={r.name} label={r.name} value={(r.v ?? 0) * 100} max={100} color={r.color} right={r.v != null ? pct(r.v * 100, 0) : "–"} />)}
          <p className="mt-2 text-[12.5px] text-[color:var(--muted)]">Ohne Personalkosten. Betreuung: Kunden zahlen ihr Werbebudget selbst. Software: KI, Server, WhatsApp (als laufende Kosten „Software“ pflegen).</p>
        </Card>
      </div>
      <Card title={`Kosten im ${longMonth(data.lastComplete)}`} cap="Zugeordnet nach Zweck: direkte Kosten (Marge), Kundengewinnung (CAC) oder sonstiger Betrieb.">
        {data.costTable.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] tabular-nums">
              <thead className="text-left text-[color:var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2 font-medium">Kosten</th>
                  <th className="px-2 font-medium">Zweck</th>
                  <th className="px-2 text-right font-medium">Betrag</th>
                  <th className="pl-2 text-right font-medium">Anteil am Umsatz</th>
                </tr>
              </thead>
              <tbody>
                {data.costTable.map((c, i) => (
                  <tr key={i} className="border-t border-[color:var(--border)]">
                    <td className="py-1.5 pr-2">{c.name}</td>
                    <td className="px-2">{PURPOSE[c.purpose] ?? c.purpose}</td>
                    <td className="px-2 text-right">{eur(c.amount)}</td>
                    <td className="pl-2 text-right">{c.share != null ? pct(c.share * 100) : "–"}</td>
                  </tr>
                ))}
                <tr className="border-t border-[color:var(--border)] font-semibold">
                  <td className="py-1.5 pr-2">Summe</td>
                  <td />
                  <td className="px-2 text-right">{eur(data.costTotal)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            Noch keine Kosten im {longMonth(data.lastComplete)}. Tools wie Instantly, Zapier und Claude unter{" "}
            <Link href="/admin/einstellungen/kosten" className="text-[color:var(--brand)]">Laufende Kosten</Link> eintragen.
          </Empty>
        )}
      </Card>
    </div>
  );
}

// ─── Wirkung ─────────────────────────────────────────────────────────────
function Funnel({ steps, labelWidth = 150 }: { steps: { name: string; v: number }[]; labelWidth?: number }) {
  const max = steps[0]?.v ?? 0;
  if (!max) return <Empty />;
  return (
    <>
      {steps.map((s, i) => (
        <BarRow
          key={s.name}
          label={s.name}
          value={s.v}
          max={max}
          color="var(--z-s1)"
          labelWidth={labelWidth}
          right={
            <>
              {s.v.toLocaleString("de-DE")}
              {i > 0 && steps[i - 1].v > 0 ? <span className="ml-1 font-normal text-[color:var(--muted)]">{pct((s.v / steps[i - 1].v) * 100, 0)}</span> : null}
            </>
          }
        />
      ))}
      <p className="mt-2 text-[12.5px] text-[color:var(--muted)]">Prozent = Anteil der vorherigen Stufe.</p>
    </>
  );
}

function Wirkung({ data, investor }: { data: ZahlenData; investor: boolean }) {
  const w = data.impact;
  const speed = w.speedMedianSec == null ? "–" : w.speedMedianSec < 120 ? `${Math.round(w.speedMedianSec)} Sek.` : w.speedMedianSec < 7200 ? `${Math.round(w.speedMedianSec / 60)} Min.` : `${(w.speedMedianSec / 3600).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Std.`;
  return (
    <div className="space-y-3.5">
      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="rounded-[var(--radius-lg)] p-5 text-white" style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
          <h2 className="text-[15px] font-semibold">Pro 1 € an performancegrowth</h2>
          <p className="text-[13px] text-white/80">verdienen Vertreter im Schnitt</p>
          <div className="my-1.5 text-[34px] font-bold tabular-nums tracking-tight sm:text-[40px]">{w.perEuro != null ? `${w.perEuro.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € Provision` : "noch keine Daten"}</div>
          <p className="text-[13px] text-white/80">
            {w.window.map(shortMonth).join(", ")}: {w.qualifying} Kunden mit vollständig gemeldeten Ergebnissen · {w.leadsOfQualifying.toLocaleString("de-DE")} Leads → {w.closes} Abschlüsse → {eur(w.provision)} Provision bei {eur(w.revenue)} Umsatz mit uns.
          </p>
          <p className="mt-2 text-[13px] text-white/80">Basis: {w.qualifying} von {w.totalCustomers} Kunden.</p>
          {investor ? <div className="mt-2 border-t border-white/30 pt-2 text-xs text-white/85">Nur Kunden, die mindestens 80 % ihrer Leads mit Ergebnis versehen (mind. 5 Leads). Gemeldete Abschlüsse × Provision je Produkt (eigene Sätze des Kunden, sonst Standard), geteilt durch unseren Umsatz mit genau diesen Kunden im selben Zeitraum.</div> : null}
        </section>
        <Card title="Vom Lead zum Abschluss" cap={`${w.window.map(shortMonth).join(", ")}, alle Kunden. Spätere Stufen nur, soweit Vertreter sie melden.`}>
          <Funnel steps={w.funnel} labelWidth={90} />
        </Card>
      </div>
      <Card title="Tempo">
        <KV
          items={[
            { k: "Erste Nachricht an den Lead", v: speed, s: "Median, Eingang → erster Kontakt" },
            { k: "Automatisch kontaktiert", v: w.automatedShare != null ? pct(w.automatedShare * 100, 0) : "–", s: "Leads mit Nachricht vom WhatsApp-Assistenten (Kunden mit WhatsApp)" },
          ]}
        />
      </Card>
    </div>
  );
}

// ─── Vertrieb ────────────────────────────────────────────────────────────
function Vertrieb({ data }: { data: ZahlenData }) {
  const s = data.sales;
  return (
    <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card title="Vertriebstrichter (letzte 90 Tage)" cap="Von der ersten Ansprache bis zum Vertrag.">
        <Funnel steps={s.funnel} labelWidth={170} />
      </Card>
      <Card title="Pipeline">
        <KV
          items={[
            { k: "Offene Angebote", v: s.openOffers, s: `${eur(s.openMrr)} MRR` },
            { k: "Abschlussquote Angebote", v: s.winRate != null ? pct(s.winRate * 100, 0) : "–", s: "letzte 90 Tage" },
            { k: "Dauer bis Abschluss", v: s.cycleDays != null ? `${Math.round(s.cycleDays)} Tage` : "–", s: "Median, Erstkontakt → Vertrag" },
            { k: "Gewichtete Pipeline", v: s.weighted != null ? eur(s.weighted) : "–", s: "MRR × Abschlussquote" },
          ]}
        />
        <h2 className="mt-4 text-[15px] font-semibold">Woher Kunden kommen</h2>
        {s.channels.length ? (
          s.channels.map((c) => <BarRow key={c.name} label={c.name} value={c.v} max={100} color="var(--z-s1)" right={`${c.v} %`} labelWidth={160} />)
        ) : (
          <Empty>Noch keine Kunden mit Akquise-Kanal.</Empty>
        )}
      </Card>
    </div>
  );
}

// ─── Pay-per-Lead ────────────────────────────────────────────────────────
function Ppl({ data }: { data: ZahlenData }) {
  const p = data.ppl;
  const max = Math.max(...p.months.map((m) => m.leads), 0);
  return (
    <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card title="Verkaufte Leads je Monat" cap="Nicht stornierte Leads (Revenue-Zeilen).">
        {max ? p.months.map((m) => <BarRow key={m.month} label={`${shortMonth(m.month)}${m.month === data.current ? " (bisher)" : ""}`} value={m.leads} max={max} color="var(--z-s1)" right={m.leads.toLocaleString("de-DE")} labelWidth={90} />) : <Empty />}
      </Card>
      <Card title={`Lead-Wirtschaftlichkeit (${longMonth(data.lastComplete)})`}>
        <KV
          items={[
            { k: "Meta-Kosten je verkauftem Lead", v: p.costPerLead != null ? eur(p.costPerLead, 2) : "–" },
            { k: "Ø Verkaufspreis", v: p.avgPrice != null ? eur(p.avgPrice, 2) : "–", s: "nach Stornos" },
            { k: "Marge Pay-per-Lead", v: p.leadMargin != null ? pct(p.leadMargin * 100, 0) : "–", s: "nach Werbung und Tools" },
            { k: "Stornoquote", v: p.stornoQuote != null ? pct(p.stornoQuote * 100) : "–" },
            { k: "Geparkt", v: p.parked, s: "ohne freien Käufer" },
          ]}
        />
        <Link href="/" className="mt-3 inline-block text-[13px] text-[color:var(--brand)]">Alle Lead-Kennzahlen (Details) →</Link>
      </Card>
    </div>
  );
}

// ─── Investoren-Update ───────────────────────────────────────────────────
function UpdateSheet({ data, onClose }: { data: ZahlenData; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const h = data.headline;
  const first = data.totals.find((t) => t.recurring > 0 && t.month < data.current);
  const last = data.totals.find((t) => t.month === data.lastComplete);
  const highlights: string[] = [];
  if (first && last && first.month !== last.month) {
    highlights.push(`MRR seit ${longMonth(first.month).split(" ")[0]} von ${kEur(first.recurring)} auf ${kEur(last.recurring)}${h.avgGrowth != null ? `, im Schnitt ${h.avgGrowth >= 0 ? "+" : ""}${pct(h.avgGrowth * 100, 0)} pro Monat` : ""}.`);
  }
  if (h.growth != null) highlights.push(`${longMonth(data.current)} hochgerechnet: ${kEur(h.mrr)} MRR (${h.growth >= 0 ? "+" : ""}${pct(h.growth * 100)} zum Vormonat), davon vertraglich ${kEur(h.contractual)}.`);
  if (data.bridge && data.bridge.neu + data.bridge.ausbau > 0) highlights.push(`${data.bridge.counts.neu} neue Kunden, ${data.bridge.counts.ausbau} haben ausgebaut (${kEur(data.bridge.neu + data.bridge.ausbau)} Zuwachs im ${longMonth(data.bridge.to).split(" ")[0]}).`);
  if (h.retention) highlights.push(`Umsatzbindung nach ${h.retention.lag} Monaten: ${h.retention.pct} %.`);
  if (data.unit.paybackFounder != null) highlights.push(`Kundengewinnung amortisiert sich in ${data.unit.paybackFounder.toLocaleString("de-DE", { maximumFractionDigits: 1 })} Monaten, inklusive kalkulierter Gründerzeit.`);
  if (data.impact.perEuro != null) highlights.push(`Vertreter verdienen ${data.impact.perEuro.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € Provision je 1 € an uns (${data.impact.qualifying} Kunden mit vollständigen Ergebnissen).`);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-8 print:static print:bg-white print:p-0" role="dialog" aria-modal="true" aria-label="Investoren-Update" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-[760px] rounded-xl bg-white p-5 text-[#0b1220] shadow-2xl sm:p-9 print:shadow-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold sm:text-[22px]">performancegrowth · Update {longMonth(data.lastComplete)}</h3>
            <p className="mb-4 text-[#66758f]">Monatliches Investoren-Update</p>
          </div>
          <div className="flex shrink-0 gap-2 print:hidden">
            <button type="button" onClick={() => window.print()} className="rounded-[10px] border border-[color:var(--border)] px-3 py-1.5 text-sm font-semibold">Drucken</button>
            <button type="button" onClick={onClose} className="rounded-[10px] border border-[color:var(--border)] px-3 py-1.5 text-sm font-semibold">Schließen</button>
          </div>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            ["Jahresumsatz (Laufrate)", kEur(h.arr)],
            ["MRR", kEur(h.mrr)],
            ["Wachstum ggü. Vormonat", h.growth != null ? `${h.growth >= 0 ? "+" : ""}${pct(h.growth * 100)}` : "–"],
            ["Bruttomarge", h.grossMargin != null ? pct(h.grossMargin * 100, 0) : "–"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-[10px] border border-[#e3e9f3] p-2.5">
              <div className="text-xs text-[#66758f]">{k}</div>
              <div className="text-xl font-bold tabular-nums">{v}</div>
            </div>
          ))}
        </div>
        <h4 className="mb-1.5 mt-4 text-sm font-semibold">Highlights</h4>
        {highlights.length ? <ul className="list-disc space-y-1 pl-5 text-sm">{highlights.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="text-sm text-[#66758f]">Noch keine Zahlen für Highlights.</p>}
        <form
          action={(fd) =>
            start(async () => {
              await saveUpdateTextsAction(fd);
              setSaved(true);
            })
          }
        >
          <h4 className="mb-1.5 mt-4 text-sm font-semibold">Herausforderungen</h4>
          <textarea name="challenges" defaultValue={data.settings.updateChallenges} rows={3} placeholder="z. B. Abhängigkeit von Meta-Kosten pro Lead" className="w-full rounded-lg border border-[#e3e9f3] p-2 text-sm print:border-0 print:p-0" />
          <h4 className="mb-1.5 mt-3 text-sm font-semibold">Nächste 30 Tage</h4>
          <textarea name="next" defaultValue={data.settings.updateNext} rows={3} placeholder="z. B. Pilot Allianz-Vertretung ab 1.12." className="w-full rounded-lg border border-[#e3e9f3] p-2 text-sm print:border-0 print:p-0" />
          <div className="mt-2 flex items-center gap-3 print:hidden">
            <button disabled={pending} className="rounded-[10px] bg-[color:var(--brand)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Speichere …" : "Texte speichern"}</button>
            {saved && !pending ? <span className="text-sm text-emerald-700">Gespeichert</span> : null}
          </div>
        </form>
        <p className="mt-5 border-t border-[#e3e9f3] pt-2.5 text-xs text-[#8b97ab]">
          Definitionen: MRR = wiederkehrender Monatsumsatz (Software, Betreuung, Pay-per-Lead nach Stornos), ohne Einrichtungs- und WhatsApp-Gebühren; laufender Monat hochgerechnet. Laufrate = MRR × 12. Bruttomarge = (Umsatz − direkte Kosten) ÷ Umsatz, ohne Personalkosten.
        </p>
      </div>
    </div>
  );
}
