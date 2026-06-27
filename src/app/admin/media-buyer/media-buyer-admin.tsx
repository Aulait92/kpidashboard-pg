"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { formatEUR, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AdspendAttribution } from "@/lib/ad-spend";
import {
  runApplyNow,
  runDryRun,
  savePoolSettings,
  type DryRunState,
  type SaveSettingsState,
} from "./actions";

// ─── Daten-Typen, die vom Server kommen ──────────────────────────────

export type PoolDetailRow = {
  key: string;
  label: string;
  kind: "product" | "region";
  product: string;
  region: string | null;
  goal: number;
  leadsMtd: number;
  projected: number;
  daysElapsed: number;
  daysTotal: number;
  customerCount: number;
  autopilot: boolean;
  maxDailyBudget: number | null;
  outbrainMaxDailyBudget: number | null;
  tiktokMaxDailyBudget: number | null;
  googleMaxDailyBudget: number | null;
  campaignKeyword: string | null;
  outbrainCampaignKeyword: string | null;
  tiktokCampaignKeyword: string | null;
  googleCampaignKeyword: string | null;
  cpl: number | null;
  // Channel-Split (Meta / Outbrain / TikTok / Google).
  metaLeadsMtd: number;
  metaSpendMtd: number;
  metaCpl: number | null;
  outbrainLeadsMtd: number;
  outbrainSpendMtd: number;
  outbrainCpl: number | null;
  tiktokLeadsMtd: number;
  tiktokSpendMtd: number;
  tiktokCpl: number | null;
  googleLeadsMtd: number;
  googleSpendMtd: number;
  googleCpl: number | null;
  latestAction: string | null;
  latestReason: string | null;
};

export type ActionLogRow = {
  id: string;
  poolKey: string;
  poolLabel: string;
  action: string;
  reason: string;
  leadsMtd: number;
  leadsGoal: number;
  projected: number;
  prevBudget: number | null;
  newBudget: number | null;
  dryRun: boolean;
  createdAt: string;
};

export type TopStats = {
  goal: number;
  leadsMtd: number;
  projected: number;
  autopilotOn: number;
  autopilotTotal: number;
  daysElapsed: number;
  daysTotal: number;
  monthLabel: string;
};

// ─── Status-Mapping ──────────────────────────────────────────────────

function statusFor(p: PoolDetailRow): {
  label: string;
  cls: string;
  dot: string;
  // Tailwind-Klassen für eine farbige Pill (Hintergrund + Text).
  pill: string;
  // Hex-Farbe für SVG-Gauges.
  hex: string;
} {
  if (p.goal <= 0)
    return {
      label: "Kein Ziel",
      cls: "text-zinc-500",
      dot: "bg-zinc-300",
      pill: "bg-zinc-100 text-zinc-600",
      hex: "#d4d4d8",
    };
  const projRatio = p.projected / p.goal;
  if (p.leadsMtd >= p.goal)
    return {
      label: "Ziel erreicht",
      cls: "text-emerald-600",
      dot: "bg-emerald-500",
      pill: "bg-emerald-50 text-emerald-700",
      hex: "#10b981",
    };
  if (projRatio >= 0.95)
    return {
      label: "Auf Kurs",
      cls: "text-emerald-600",
      dot: "bg-emerald-500",
      pill: "bg-emerald-50 text-emerald-700",
      hex: "#10b981",
    };
  if (projRatio >= 0.85)
    return {
      label: "Knapp",
      cls: "text-amber-600",
      dot: "bg-amber-500",
      pill: "bg-amber-50 text-amber-700",
      hex: "#f59e0b",
    };
  return {
    label: "Unterdeckung",
    cls: "text-rose-600",
    dot: "bg-rose-500",
    pill: "bg-rose-50 text-rose-700",
    hex: "#f43f5e",
  };
}

function poolColor(p: PoolDetailRow): string {
  // Farb-Punkt im Sidebar-Eintrag — pro Pool eindeutig genug.
  if (p.kind === "product") {
    return p.product === "Wechsel" ? "bg-emerald-500" : "bg-rose-500";
  }
  // Region: stabile Farb-Zuordnung anhand des Hashes.
  const palette = [
    "bg-amber-500",
    "bg-blue-500",
    "bg-violet-500",
    "bg-pink-500",
    "bg-teal-500",
  ];
  let h = 0;
  for (let i = 0; i < (p.region ?? "").length; i++)
    h = (h * 31 + (p.region ?? "").charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

function keywordOf(p: PoolDetailRow): string {
  const raw =
    p.campaignKeyword?.trim() ||
    (p.kind === "product" ? `pkv-${p.product}` : (p.region ?? ""));
  return raw.toLowerCase().replace(/\s+/g, "-");
}

// ─── Haupt-Layout ────────────────────────────────────────────────────

export function MediaBuyerLayout({
  pools,
  log,
  top,
  attribution,
}: {
  pools: PoolDetailRow[];
  log: ActionLogRow[];
  top: TopStats;
  attribution: AdspendAttribution;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<"alle" | "pkv" | "kw">("alle");
  const filtered = useMemo(() => {
    if (filter === "pkv") return pools.filter((p) => p.kind === "product");
    if (filter === "kw") return pools.filter((p) => p.kind === "region");
    return pools;
  }, [pools, filter]);
  const selected = pools.find((p) => p.key === selectedKey) ?? null;

  if (pools.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-[color:var(--border)] bg-white p-8 text-center text-sm text-[color:var(--muted)]">
          Noch keine Pools. Sobald in Airtable Lead-Ziele (und für Kinderwunsch
          Regionen) gepflegt und synchronisiert sind, erscheinen sie hier.
        </div>
        <AttributionCard attribution={attribution} />
      </div>
    );
  }

  // Auf Desktop ist immer ein Pool selektiert; auf Mobil entscheidet der User.
  const desktopSelected = selected ?? filtered[0] ?? pools[0];

  return (
    <>
      <div className={cn(selected ? "hidden" : "block", "lg:block")}>
        <HeroCard top={top} />
      </div>

      <div className="mt-4 lg:hidden">
        {/* Mobile: entweder Liste oder Detail-Ansicht (mit Top-Bar). */}
        {selected ? (
          <div>
            <div className="-mx-4 mb-4 grid grid-cols-[1fr_auto_1fr] items-center border-b border-[color:var(--border)] bg-white/80 px-4 py-3 backdrop-blur">
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
                className="justify-self-start text-sm font-semibold text-[color:var(--brand)]"
              >
                ← Pools
              </button>
              <h2 className="text-base font-bold">{selected.label}</h2>
              <span aria-hidden />
            </div>
            <PoolDetail pool={selected} log={log} />
          </div>
        ) : (
          <>
            <Filters filter={filter} onChange={setFilter} />
            <PoolList
              pools={filtered}
              totalCount={pools.length}
              selectedKey={null}
              onSelect={setSelectedKey}
            />
          </>
        )}
      </div>

      <div className="mt-4 hidden gap-4 lg:grid lg:grid-cols-[340px_1fr]">
        {/* Desktop: zweispaltig. */}
        <aside className="flex flex-col gap-4 rounded-2xl border border-[color:var(--border)] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <Filters filter={filter} onChange={setFilter} />
          <PoolList
            pools={filtered}
            totalCount={pools.length}
            selectedKey={desktopSelected?.key ?? null}
            onSelect={setSelectedKey}
            compactCard
          />
          <div className="mt-1 flex gap-2 border-t border-[color:var(--border)] pt-3">
            <DryRunButton />
            <ApplyNowButton />
          </div>
        </aside>
        {desktopSelected ? <PoolDetail pool={desktopSelected} log={log} /> : null}
      </div>

      {/* Adspend-Zuordnung: welche Kampagnen fließen in die Cost-Berechnung. */}
      <div className={cn(selected ? "hidden" : "block", "lg:block", "mt-4")}>
        <AttributionCard attribution={attribution} />
      </div>

      {/* Sticky Bottom-Action-Bar nur mobil und nur wenn Liste sichtbar. */}
      {!selected ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[color:var(--border)] bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-[1400px] gap-3">
            <DryRunButton />
            <ApplyNowButton />
          </div>
        </div>
      ) : null}
    </>
  );
}

// ─── Adspend-Zuordnung ───────────────────────────────────────────────
// Transparenz: welche Kampagnen je Produkt in den angerechneten Spend (MTD)
// fließen — und welche Kampagnen ignoriert werden (kein Keyword-Match).
function AttributionCard({
  attribution,
}: {
  attribution: AdspendAttribution;
}) {
  const [open, setOpen] = useState(false);
  const { matched, matchedTotal, unmatched, unmatchedTotal, monthLabel } =
    attribution;

  const channelTone: Record<string, string> = {
    Meta: "bg-blue-50 text-blue-700",
    Outbrain: "bg-amber-50 text-amber-700",
    TikTok: "bg-rose-50 text-rose-700",
    Google: "bg-emerald-50 text-emerald-700",
  };
  const badge = (channel: string) => (
    <span
      className={cn(
        "inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold",
        channelTone[channel] ?? "bg-slate-100 text-slate-600",
      )}
    >
      {channel}
    </span>
  );

  return (
    <section className="rounded-2xl border border-[color:var(--border)] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <h2 className="text-base font-bold">Adspend-Zuordnung</h2>
          <p className="mt-0.5 text-xs text-[color:var(--muted)]">
            Welche Kampagnen in die Cost-Berechnung einfließen · {monthLabel}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-semibold">
              {formatEUR(matchedTotal)}
            </div>
            <div className="text-[10px] text-[color:var(--muted)]">
              zugeordnet
            </div>
          </div>
          {unmatchedTotal > 0 ? (
            <div className="text-right">
              <div className="text-sm font-semibold text-amber-600">
                {formatEUR(unmatchedTotal)}
              </div>
              <div className="text-[10px] text-[color:var(--muted)]">
                ignoriert
              </div>
            </div>
          ) : null}
          <span className="text-[color:var(--muted)]">
            {open ? "▲" : "▼"}
          </span>
        </div>
      </button>

      {open ? (
        <div className="mt-4 flex flex-col gap-5">
          {/* Zugeordnete Kampagnen je Produkt */}
          {matched.length === 0 ? (
            <p className="text-sm text-[color:var(--muted)]">
              Diesen Monat noch kein zugeordneter Ad-Spend.
            </p>
          ) : (
            matched.map((g) => (
              <div key={g.product}>
                <div className="mb-1.5 flex items-center justify-between border-b border-[color:var(--border)] pb-1">
                  <span className="text-sm font-semibold">{g.label}</span>
                  <span className="text-sm font-semibold">
                    {formatEUR(g.total)}
                  </span>
                </div>
                <ul className="flex flex-col gap-1">
                  {g.campaigns.map((c) => (
                    <li
                      key={`${c.channel}|${c.campaign}`}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        {badge(c.channel)}
                        <span className="truncate">{c.campaign}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-[color:var(--muted)]">
                        {formatEUR(c.spend)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}

          {/* Ignorierte Kampagnen (kein Keyword-Match) */}
          <div>
            <div className="mb-1.5 flex items-center justify-between border-b border-amber-200 pb-1">
              <span className="text-sm font-semibold text-amber-700">
                Nicht zugeordnet · fließt NICHT in die Berechnung
              </span>
              <span className="text-sm font-semibold text-amber-700">
                {formatEUR(unmatchedTotal)}
              </span>
            </div>
            {unmatched.length === 0 ? (
              <p className="text-xs text-[color:var(--muted)]">
                Aktuell wird aller Spend einem Produkt zugeordnet. 🎯
              </p>
            ) : (
              <>
                <p className="mb-1.5 text-[11px] text-[color:var(--muted)]">
                  Spend aus dem letzten Sync-Zeitraum. Fehlt hier ein Produkt,
                  ein Keyword/Slug/Alias in der Airtable-Produkte-Tabelle
                  ergänzen, dann matcht der nächste Sync.
                </p>
                <ul className="flex flex-col gap-1">
                  {unmatched.map((c) => (
                    <li
                      key={`${c.channel}|${c.campaign}`}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        {badge(c.channel)}
                        <span className="truncate">{c.campaign}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-amber-600">
                        {formatEUR(c.spend)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ─── Hero-Karte (Aggregat) ───────────────────────────────────────────

function HeroCard({ top }: { top: TopStats }) {
  const ratio = top.goal > 0 ? top.leadsMtd / top.goal : 0;
  const projectedRatio = top.goal > 0 ? top.projected / top.goal : 0;
  const paceFraction = top.daysTotal > 0 ? top.daysElapsed / top.daysTotal : 0;
  const projectedColor =
    projectedRatio >= 0.98
      ? "text-emerald-600"
      : projectedRatio >= 0.85
        ? "text-amber-600"
        : "text-rose-600";
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-5">
      <div className="grid grid-cols-[auto_1fr] items-center gap-4 sm:gap-6">
        <BigGauge percent={ratio * 100} label="Ist/Ziel" />
        <div>
          <div className="grid grid-cols-3 gap-3 sm:gap-6">
            <HeroStat
              label="Ist (MTD)"
              value={String(top.leadsMtd)}
              sub={`/ ${top.goal}`}
            />
            <HeroStat
              label="Prognose"
              value={`${Math.round(projectedRatio * 100)}%`}
              valueClass={projectedColor}
            />
            <HeroStat
              label="Autopilot"
              value={`${top.autopilotOn}/${top.autopilotTotal}`}
            />
          </div>
          {/* Progress mit Pace-Markierung */}
          <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full bg-[color:var(--brand)] transition-all"
              style={{ width: `${Math.max(2, Math.min(100, ratio * 100))}%` }}
            />
            {/* Pace-Marker (heutiger Soll-Stand) */}
            <div
              className="absolute top-0 h-full w-px bg-zinc-900/60"
              style={{ left: `${Math.min(100, paceFraction * 100)}%` }}
              aria-hidden
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function BigGauge({ percent, label }: { percent: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const color = "#2563eb"; // brand
  return (
    <div className="relative grid h-24 w-24 place-items-center sm:h-28 sm:w-28">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(${color} ${clamped}%, #e4e4e7 ${clamped}% 100%)`,
        }}
        aria-hidden
      />
      <div className="absolute inset-2 rounded-full bg-white" aria-hidden />
      <div className="relative z-10 text-center leading-tight">
        <div className="text-xl font-bold tabular-nums sm:text-2xl">
          {Math.round(clamped)}%
        </div>
        <div className="text-[9px] font-medium text-[color:var(--muted)] sm:text-[10px]">
          {label}
        </div>
      </div>
    </div>
  );
}

function HeroStat({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
        {label}
      </div>
      <div className={cn("mt-0.5 truncate text-xl font-bold tabular-nums sm:text-2xl", valueClass)}>
        {value}
        {sub ? (
          <span className="ml-1 text-xs font-medium text-[color:var(--muted)]">
            {sub}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ─── Filter-Pills ────────────────────────────────────────────────────

function Filters({
  filter,
  onChange,
}: {
  filter: "alle" | "pkv" | "kw";
  onChange: (f: "alle" | "pkv" | "kw") => void;
}) {
  const tabs = [
    { id: "alle" as const, label: "Alle" },
    { id: "pkv" as const, label: "PKV" },
    { id: "kw" as const, label: "Kinderwunsch" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={cn(
            "rounded-full border px-4 py-1.5 text-sm font-semibold transition",
            filter === t.id
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-[color:var(--border)] bg-white text-[color:var(--foreground)] hover:border-zinc-400",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Pool-Liste ──────────────────────────────────────────────────────

function PoolList({
  pools,
  totalCount,
  selectedKey,
  onSelect,
  compactCard = false,
}: {
  pools: PoolDetailRow[];
  totalCount: number;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  compactCard?: boolean;
}) {
  return (
    <div className={cn(compactCard ? "" : "mt-4")}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
          Liefer-Pools
        </h2>
        <span className="text-xs font-semibold text-zinc-400">{totalCount}</span>
      </div>
      <ul
        className={cn(
          "flex flex-col",
          compactCard
            ? "gap-2"
            : "divide-y divide-[color:var(--border)] overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        )}
      >
        {pools.map((p) => {
          const status = statusFor(p);
          const pct =
            p.goal > 0
              ? Math.min(120, Math.round((p.leadsMtd / p.goal) * 100))
              : 0;
          const isSelected = p.key === selectedKey;
          return (
            <li key={p.key}>
              <button
                type="button"
                onClick={() => onSelect(p.key)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 text-left transition",
                  compactCard
                    ? cn(
                        "rounded-xl border",
                        isSelected
                          ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]/40 shadow-sm"
                          : "border-[color:var(--border)] hover:border-[color:var(--brand)]/40",
                      )
                    : "hover:bg-zinc-50/60",
                )}
              >
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", poolColor(p))} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{p.label}</span>
                    {p.autopilot ? (
                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[color:var(--brand)]">
                        ⚡ Auto
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                        manuell
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline gap-3 text-xs">
                    <span className="font-semibold tabular-nums text-[color:var(--muted)]">
                      {p.leadsMtd}/{p.goal}
                    </span>
                    <span className="text-zinc-300">|</span>
                    <span className={cn("font-bold tabular-nums", status.cls)}>
                      {pct}%
                    </span>
                  </div>
                </div>
                <span className="text-zinc-400">›</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Detail-Panel ────────────────────────────────────────────────────

function PoolDetail({
  pool,
  log,
}: {
  pool: PoolDetailRow;
  log: ActionLogRow[];
}) {
  const status = statusFor(pool);
  const pct = pool.goal > 0 ? (pool.leadsMtd / pool.goal) * 100 : 0;
  const remaining = Math.max(0, pool.goal - pool.leadsMtd);
  const daysLeft = Math.max(0, pool.daysTotal - pool.daysElapsed);
  const needPerDay = daysLeft > 0 ? remaining / Math.max(1, daysLeft) : 0;
  const projectedPctOfGoal =
    pool.goal > 0 ? Math.round((pool.projected / pool.goal) * 100) : 0;
  const paceFraction =
    pool.daysTotal > 0 ? pool.daysElapsed / pool.daysTotal : 0;
  const poolHistory = log.filter((l) => l.poolKey === pool.key).slice(0, 10);

  // Empfehlungs-Karte: ohne Autopilot ist sie „Übersprungen"; sonst zeigt
  // sie die letzte Entscheidung des Buyers.
  const empfehlung = !pool.autopilot
    ? {
        badge: "Übersprungen",
        badgeCls: "border border-[color:var(--border)] bg-white text-zinc-600",
        text:
          remaining > 0
            ? `Autopilot aus — keine automatische Steuerung. ${remaining} Leads offen, manuelle Freigabe nötig.`
            : "Autopilot aus — keine automatische Steuerung. Ziel bereits erreicht.",
      }
    : pool.latestReason
      ? {
          badge:
            ACTION_LABEL[pool.latestAction ?? "none"]?.label ?? "Aktualisiert",
          badgeCls:
            ACTION_LABEL[pool.latestAction ?? "none"]?.cls ??
            "bg-zinc-50 text-zinc-500",
          text: pool.latestReason,
        }
      : null;

  return (
    <section className="flex flex-col gap-4">
      {/* Status-Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold",
            status.pill,
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
          {status.label}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border)] bg-white px-3 py-1 text-sm font-medium text-zinc-700">
          <span aria-hidden>◆</span>
          {pool.kind === "product" ? "Produkt-Pool" : "Region-Pool"}
        </span>
      </div>

      {/* Stats-Karte */}
      <div className="rounded-2xl border border-[color:var(--border)] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-5">
        <div className="grid grid-cols-[auto_1fr] items-center gap-4 sm:gap-6">
          <ArcGauge percent={pct} hex={status.hex} label="erreicht" />
          <div className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-3 gap-y-2 text-sm">
            <span className="text-[color:var(--muted)]">Ziel</span>
            <span className="text-2xl font-bold tabular-nums">
              {formatNumber(pool.goal)}
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
              Airtable
            </span>

            <span className="text-[color:var(--muted)]">Ist (MTD)</span>
            <span className="text-2xl font-bold tabular-nums text-blue-600">
              {formatNumber(pool.leadsMtd)}
            </span>
            <span className="text-xs text-[color:var(--muted)]">
              {pool.daysElapsed} {pool.daysElapsed === 1 ? "Tag" : "Tage"}
            </span>

            <span className="text-[color:var(--muted)]">Prognose</span>
            <span className={cn("text-2xl font-bold tabular-nums", status.cls)}>
              P{pool.projected}
            </span>
            <span className={cn("text-xs font-semibold", status.cls)}>
              · {projectedPctOfGoal}%
            </span>
          </div>
        </div>

        {/* Progress mit Pace-Marker */}
        <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-zinc-100">
          <div
            className={cn("h-full transition-all", status.dot)}
            style={{
              width: `${Math.max(2, Math.min(100, pct))}%`,
            }}
          />
          {/* Erwartungs-Korridor: schraffierter Bereich bis Pace */}
          {pct < paceFraction * 100 ? (
            <div
              className={cn(
                "absolute top-0 h-full border-y border-dashed",
                status.dot.replace("bg-", "border-"),
              )}
              style={{
                left: `${Math.max(0, Math.min(100, pct))}%`,
                width: `${Math.max(0, Math.min(100, paceFraction * 100) - Math.min(100, pct))}%`,
                background:
                  "repeating-linear-gradient(45deg, rgba(244,63,94,0.08) 0 4px, transparent 4px 8px)",
              }}
              aria-hidden
            />
          ) : null}
          <div
            className="absolute top-0 h-full w-px bg-zinc-900/70"
            style={{ left: `${Math.min(100, paceFraction * 100)}%` }}
            aria-hidden
          />
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-2 text-xs">
          <span>
            {remaining > 0 ? (
              <>
                <span className="font-semibold text-[color:var(--foreground)]">
                  {remaining}
                </span>{" "}
                <span className="text-[color:var(--muted)]">offen ·</span>{" "}
                <span className="tabular-nums">
                  {needPerDay.toFixed(1).replace(".", ",")}/Tag
                </span>
              </>
            ) : (
              <span className="font-semibold text-emerald-600">Ziel erreicht 🎯</span>
            )}
          </span>
          {pool.cpl != null ? (
            <span className="text-[color:var(--muted)]">
              Ø CPL{" "}
              <span className="font-semibold text-[color:var(--foreground)]">
                {pool.cpl.toFixed(2).replace(".", ",")} €
              </span>
            </span>
          ) : null}
        </div>
      </div>

      {/* Channel-Split */}
      <ChannelSplitCard pool={pool} />

      {/* Empfehlung */}
      {empfehlung ? (
        <div className="rounded-2xl border border-[color:var(--border)] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full border border-[color:var(--border)] text-zinc-500">
                ⓘ
              </span>
              <span className="text-lg font-bold">Empfehlung</span>
            </div>
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                empfehlung.badgeCls,
              )}
            >
              {empfehlung.badge}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[color:var(--foreground)]">
            {empfehlung.text}
          </p>
          {pool.autopilot ? (
            <div className="mt-3">
              <ApplyNowButton compact />
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Settings-Liste */}
      <PoolSettingsList pool={pool} />

      {/* History */}
      <div>
        <h3 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
          Verlauf dieses Pools
        </h3>
        {poolHistory.length === 0 ? (
          <p className="rounded-2xl border border-[color:var(--border)] bg-white p-4 text-xs text-[color:var(--muted)]">
            Noch keine Entscheidungen für diesen Pool protokolliert.
          </p>
        ) : (
          <ul className="space-y-2">
            {poolHistory.map((h) => (
              <li
                key={h.id}
                className="rounded-2xl border border-[color:var(--border)] bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-[color:var(--muted)]">
                    {h.createdAt}
                    {h.dryRun ? " sim" : ""}
                  </span>
                  <ActionBadge action={h.action} />
                </div>
                <p className="mt-1 text-sm leading-snug text-[color:var(--foreground)]">
                  {h.reason}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ─── Arc-Gauge (3/4-Kreis-Stil wie im Mockup) ────────────────────────

function ArcGauge({
  percent,
  hex,
  label,
}: {
  percent: number;
  hex: string;
  label: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  // SVG-Kreis-Stroke für klareren Look als conic-gradient
  const r = 42;
  const c = 2 * Math.PI * r;
  const dash = (clamped / 100) * c;
  return (
    <div className="relative grid h-28 w-28 place-items-center sm:h-32 sm:w-32">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e4e4e7" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={hex}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <div className="relative z-10 text-center leading-tight">
        <div className="text-2xl font-bold tabular-nums">
          {Math.round(clamped)}%
        </div>
        <div className="text-[10px] font-medium text-[color:var(--muted)]">
          {label}
        </div>
      </div>
    </div>
  );
}

// ─── Channel-Split (Meta vs. Outbrain) ──────────────────────────────

function ChannelSplitCard({ pool }: { pool: PoolDetailRow }) {
  const totalChannelLeads =
    pool.metaLeadsMtd +
    pool.outbrainLeadsMtd +
    pool.tiktokLeadsMtd +
    pool.googleLeadsMtd;
  if (
    totalChannelLeads === 0 &&
    pool.metaSpendMtd === 0 &&
    pool.outbrainSpendMtd === 0 &&
    pool.tiktokSpendMtd === 0 &&
    pool.googleSpendMtd === 0
  ) {
    return null;
  }
  const rows: {
    label: string;
    leads: number;
    spend: number;
    cpl: number | null;
    share: number;
    color: string;
  }[] = [
    {
      label: "Meta",
      leads: pool.metaLeadsMtd,
      spend: pool.metaSpendMtd,
      cpl: pool.metaCpl,
      share:
        totalChannelLeads > 0 ? pool.metaLeadsMtd / totalChannelLeads : 0,
      color: "bg-blue-500",
    },
    {
      label: "Outbrain",
      leads: pool.outbrainLeadsMtd,
      spend: pool.outbrainSpendMtd,
      cpl: pool.outbrainCpl,
      share:
        totalChannelLeads > 0 ? pool.outbrainLeadsMtd / totalChannelLeads : 0,
      color: "bg-amber-500",
    },
    {
      label: "TikTok",
      leads: pool.tiktokLeadsMtd,
      spend: pool.tiktokSpendMtd,
      cpl: pool.tiktokCpl,
      share:
        totalChannelLeads > 0 ? pool.tiktokLeadsMtd / totalChannelLeads : 0,
      color: "bg-rose-500",
    },
    {
      label: "Google",
      leads: pool.googleLeadsMtd,
      spend: pool.googleSpendMtd,
      cpl: pool.googleCpl,
      share:
        totalChannelLeads > 0 ? pool.googleLeadsMtd / totalChannelLeads : 0,
      color: "bg-emerald-500",
    },
  ];

  function fmtEur(v: number | null): string {
    if (v == null) return "—";
    return `${v.toFixed(2).replace(".", ",")} €`;
  }
  function fmtSpend(v: number): string {
    if (v === 0) return "—";
    return `${Math.round(v).toLocaleString("de-DE")} €`;
  }

  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-bold">Performance pro Kanal</span>
        <span className="text-[11px] uppercase tracking-wider text-[color:var(--muted)]">
          MTD
        </span>
      </div>
      <div className="mt-3 divide-y divide-[color:var(--border)]">
        {rows.map((r) => (
          <div key={r.label} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className={cn("h-2 w-2 rounded-full", r.color)}
                  aria-hidden
                />
                <span className="text-sm font-semibold">{r.label}</span>
                <span className="text-[11px] text-[color:var(--muted)]">
                  ({Math.round(r.share * 100)} %)
                </span>
              </div>
              <span className="text-sm font-semibold tabular-nums">
                CPL{" "}
                <span
                  className={cn(
                    r.cpl == null
                      ? "text-[color:var(--muted)]"
                      : "text-[color:var(--foreground)]",
                  )}
                >
                  {fmtEur(r.cpl)}
                </span>
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-[color:var(--muted)]">
              <span>
                <span className="tabular-nums text-[color:var(--foreground)]">
                  {r.leads}
                </span>{" "}
                Leads
              </span>
              <span>
                Spend{" "}
                <span className="tabular-nums text-[color:var(--foreground)]">
                  {fmtSpend(r.spend)}
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-100">
              <div
                className={cn("h-full", r.color)}
                style={{ width: `${r.share * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Settings als Listen-Karte (Autopilot + Budget/Keyword) ──────────

function PoolSettingsList({ pool }: { pool: PoolDetailRow }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<SaveSettingsState, FormData>(
    savePoolSettings,
    {},
  );
  // Optimistischer Autopilot-Schalter, wird sofort gespiegelt.
  const [autopilotOn, setAutopilotOn] = useState(pool.autopilot);
  const [, startAutopilotTransition] = useTransition();
  function toggleAutopilot() {
    const next = !autopilotOn;
    setAutopilotOn(next);
    const fd = new FormData();
    fd.set("poolKey", pool.key);
    if (next) fd.set("autopilot", "on");
    if (pool.maxDailyBudget != null)
      fd.set("maxDailyBudget", String(pool.maxDailyBudget));
    if (pool.outbrainMaxDailyBudget != null)
      fd.set("outbrainMaxDailyBudget", String(pool.outbrainMaxDailyBudget));
    if (pool.tiktokMaxDailyBudget != null)
      fd.set("tiktokMaxDailyBudget", String(pool.tiktokMaxDailyBudget));
    if (pool.googleMaxDailyBudget != null)
      fd.set("googleMaxDailyBudget", String(pool.googleMaxDailyBudget));
    if (pool.campaignKeyword) fd.set("campaignKeyword", pool.campaignKeyword);
    if (pool.outbrainCampaignKeyword)
      fd.set("outbrainCampaignKeyword", pool.outbrainCampaignKeyword);
    if (pool.tiktokCampaignKeyword)
      fd.set("tiktokCampaignKeyword", pool.tiktokCampaignKeyword);
    if (pool.googleCampaignKeyword)
      fd.set("googleCampaignKeyword", pool.googleCampaignKeyword);
    startAutopilotTransition(async () => {
      const res = await savePoolSettings({}, fd);
      if (res.error) setAutopilotOn(pool.autopilot);
    });
  }
  // Schließe Editor automatisch nach erfolgreichem Speichern.
  if (state.ok && editing) {
    setEditing(false);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {/* Autopilot-Zeile */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100 text-zinc-500">
          ⚡
        </span>
        <div className="flex-1">
          <div className="text-base font-bold">Autopilot</div>
          <div className="text-xs text-[color:var(--muted)]">
            {autopilotOn ? "steuert automatisch" : "manuelle Steuerung"}
          </div>
        </div>
        <button
          type="button"
          onClick={toggleAutopilot}
          className={cn(
            "relative h-6 w-11 rounded-full transition",
            autopilotOn ? "bg-[color:var(--brand)]" : "bg-zinc-300",
          )}
          aria-pressed={autopilotOn}
          aria-label="Autopilot umschalten"
        >
          <span
            className={cn(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
              autopilotOn ? "left-[22px]" : "left-0.5",
            )}
          />
        </button>
      </div>

      <div className="h-px bg-[color:var(--border)]" />

      {/* Budget/Keyword-Zeile */}
      <button
        type="button"
        onClick={() => setEditing((e) => !e)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-50/60"
      >
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-zinc-100 text-zinc-500">
          📊
        </span>
        <div className="flex-1">
          <div className="text-base font-bold">Max. Budget / Tag</div>
          <div className="text-xs text-[color:var(--muted)]">
            Keyword <span className="font-mono">#{keywordOf(pool)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-right">
          <span className="text-base font-bold tabular-nums">
            {pool.maxDailyBudget != null
              ? `${Math.round(pool.maxDailyBudget)} €`
              : "—"}
          </span>
          <span className="text-zinc-400">{editing ? "˅" : "›"}</span>
        </div>
      </button>

      {/* Inline-Editor */}
      {editing ? (
        <form
          action={formAction}
          className="grid gap-3 border-t border-[color:var(--border)] bg-zinc-50/50 px-4 py-3 sm:grid-cols-2"
        >
          <input type="hidden" name="poolKey" value={pool.key} />
          <input
            type="hidden"
            name="autopilot"
            value={autopilotOn ? "on" : ""}
          />
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
              Meta-Max-Budget / Tag (€)
            </span>
            <input
              type="number"
              name="maxDailyBudget"
              min={0}
              step={5}
              defaultValue={pool.maxDailyBudget ?? ""}
              placeholder="Env-Default"
              className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm tabular-nums focus:border-[color:var(--brand)] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
              Outbrain-Max-Budget / Tag (€)
            </span>
            <input
              type="number"
              name="outbrainMaxDailyBudget"
              min={0}
              step={5}
              defaultValue={pool.outbrainMaxDailyBudget ?? ""}
              placeholder="Env-Default"
              className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm tabular-nums focus:border-[color:var(--brand)] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
              TikTok-Max-Budget / Tag (€)
            </span>
            <input
              type="number"
              name="tiktokMaxDailyBudget"
              min={0}
              step={5}
              defaultValue={pool.tiktokMaxDailyBudget ?? ""}
              placeholder="Env-Default"
              className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm tabular-nums focus:border-[color:var(--brand)] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
              Google-Max-Budget / Tag (€)
            </span>
            <input
              type="number"
              name="googleMaxDailyBudget"
              min={0}
              step={5}
              defaultValue={pool.googleMaxDailyBudget ?? ""}
              placeholder="Env-Default"
              className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm tabular-nums focus:border-[color:var(--brand)] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
              Meta-Kampagnen-Keyword
            </span>
            <input
              type="text"
              name="campaignKeyword"
              defaultValue={pool.campaignKeyword ?? ""}
              placeholder={keywordOf(pool)}
              className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
              Outbrain-Kampagnen-Keyword
            </span>
            <input
              type="text"
              name="outbrainCampaignKeyword"
              defaultValue={pool.outbrainCampaignKeyword ?? ""}
              placeholder={"z. B. PKV Wechsler (leer = aus)"}
              className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
              TikTok-Kampagnen-Keyword
            </span>
            <input
              type="text"
              name="tiktokCampaignKeyword"
              defaultValue={pool.tiktokCampaignKeyword ?? ""}
              placeholder={"z. B. PKV-Wechsler (leer = aus)"}
              className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
              Google-Kampagnen-Keyword
            </span>
            <input
              type="text"
              name="googleCampaignKeyword"
              defaultValue={pool.googleCampaignKeyword ?? ""}
              placeholder={"z. B. PKV Tarifoptimierung (leer = aus)"}
              className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm focus:border-[color:var(--brand)] focus:outline-none"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-[color:var(--brand)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60"
            >
              {pending ? "…" : "Speichern"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm transition hover:border-[color:var(--brand)]"
            >
              ✕
            </button>
          </div>
          {state.error ? (
            <div className="sm:col-span-3 text-xs font-medium text-rose-600">
              {state.error}
            </div>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

// ─── Action-Badges & Buttons ─────────────────────────────────────────

const ACTION_LABEL: Record<string, { label: string; cls: string }> = {
  increase: { label: "Budget ↑", cls: "bg-emerald-50 text-emerald-700" },
  decrease: { label: "Budget ↓", cls: "bg-amber-50 text-amber-700" },
  boost: { label: "Endspurt 🚀", cls: "bg-indigo-50 text-indigo-700" },
  pause: { label: "Pausiert", cls: "bg-zinc-100 text-zinc-600" },
  activate: { label: "Reaktiviert", cls: "bg-blue-50 text-blue-700" },
  none: { label: "Gehalten", cls: "bg-zinc-50 text-zinc-500" },
};

function ActionBadge({ action }: { action: string }) {
  const cfg = ACTION_LABEL[action] ?? ACTION_LABEL.none;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
        cfg.cls,
      )}
    >
      {cfg.label}
    </span>
  );
}

function DryRunButton() {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<DryRunState>({});
  function run() {
    startTransition(async () => setState(await runDryRun()));
  }
  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className="flex-1 rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-sm font-semibold transition hover:border-[color:var(--brand)] disabled:opacity-60"
      title={state.error ?? (state.results ? `${state.results.length} simuliert` : "")}
    >
      ▷ {pending ? "…" : "Simulieren"}
    </button>
  );
}

function ApplyNowButton({ compact = false }: { compact?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [, setState] = useState<DryRunState>({});
  function run() {
    if (
      !window.confirm(
        "Jetzt wirklich anwenden? Das ändert sofort die Budgets/Status der Autopilot-Pools bei Meta.",
      )
    )
      return;
    startTransition(async () => setState(await runApplyNow()));
  }
  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className={cn(
        "rounded-lg bg-[color:var(--brand)] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[color:var(--brand-dark)] disabled:opacity-60",
        compact ? "" : "flex-1",
      )}
    >
      ⚡ {pending ? "…" : "Anwenden"}
    </button>
  );
}
