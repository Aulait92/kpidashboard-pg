"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
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
  campaignKeyword: string | null;
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
} {
  if (p.goal <= 0) return { label: "Kein Ziel", cls: "text-zinc-500", dot: "bg-zinc-300" };
  const projRatio = p.projected / p.goal;
  if (p.leadsMtd >= p.goal)
    return { label: "Ziel erreicht", cls: "text-emerald-600", dot: "bg-emerald-500" };
  if (projRatio >= 0.95) return { label: "Auf Kurs", cls: "text-emerald-600", dot: "bg-emerald-500" };
  if (projRatio >= 0.85) return { label: "Knapp", cls: "text-amber-600", dot: "bg-amber-500" };
  return { label: "Hinterher", cls: "text-rose-600", dot: "bg-rose-500" };
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
}: {
  pools: PoolDetailRow[];
  log: ActionLogRow[];
  top: TopStats;
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
      <div className="rounded-2xl border border-[color:var(--border)] bg-white p-8 text-center text-sm text-[color:var(--muted)]">
        Noch keine Pools. Sobald in Airtable Lead-Ziele (und für Kinderwunsch
        Regionen) gepflegt und synchronisiert sind, erscheinen sie hier.
      </div>
    );
  }

  // Auf Desktop ist immer ein Pool selektiert; auf Mobil entscheidet der User.
  const desktopSelected = selected ?? filtered[0] ?? pools[0];

  return (
    <>
      <HeroCard top={top} />

      <div className="mt-4 lg:hidden">
        {/* Mobile: entweder Liste oder Detail-Ansicht (mit Back-Button). */}
        {selected ? (
          <div>
            <button
              type="button"
              onClick={() => setSelectedKey(null)}
              className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-[color:var(--brand)]"
            >
              ← Pools
            </button>
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
  const pctRounded = Math.round(pct);
  const remaining = Math.max(0, pool.goal - pool.leadsMtd);
  const daysLeft = Math.max(0, pool.daysTotal - pool.daysElapsed);
  const needPerDay =
    daysLeft > 0 ? remaining / Math.max(1, daysLeft) : 0;
  const projectedPctOfGoal =
    pool.goal > 0 ? Math.round((pool.projected / pool.goal) * 100) : 0;
  const recommendation = pool.latestReason ?? null;
  const poolHistory = log.filter((l) => l.poolKey === pool.key).slice(0, 10);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-[color:var(--border)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(37,99,235,0.08)]">
      {/* Kopfzeile */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">{pool.label}</h2>
            <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--border)] bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-700">
              {pool.kind === "product" ? "Produkt-Pool" : "Region-Pool"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className={cn("inline-flex items-center gap-1.5 font-semibold", status.cls)}>
              <span className={cn("h-2 w-2 rounded-full", status.dot)} />
              {status.label}
            </span>
            <span className="text-[color:var(--muted)]">
              {pool.customerCount} {pool.customerCount === 1 ? "Kunde" : "Kunden"}
            </span>
            <span className="text-[color:var(--muted)]">
              Keyword <span className="font-mono">#{keywordOf(pool)}</span>
            </span>
          </div>
        </div>
        <AutopilotToggle pool={pool} />
      </div>

      {/* Gauge + Zahlen */}
      <div className="grid gap-4 rounded-xl border border-[color:var(--border)] bg-zinc-50/50 p-4 sm:grid-cols-[auto_1fr]">
        <Gauge percent={pct} status={status} />
        <div className="grid grid-cols-3 gap-4">
          <Tile
            label="Ziel (Summe)"
            sublabel="Airtable"
            value={formatNumber(pool.goal)}
            unit="Leads / Monat"
          />
          <Tile
            label="Ist (MTD)"
            value={formatNumber(pool.leadsMtd)}
            unit={`${pool.daysElapsed}. Tag`}
            valueClass="text-blue-600"
          />
          <Tile
            label="Prognose"
            value={`P${pool.projected}`}
            unit={`${projectedPctOfGoal} % zum Ziel`}
            valueClass={status.cls}
          />
          <div className="col-span-3 mt-1">
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className={cn("h-full transition-all", status.dot)}
                style={{ width: `${Math.max(2, Math.min(100, pctRounded))}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-xs text-[color:var(--muted)]">
              <span>
                {remaining > 0 ? (
                  <>
                    <span className="font-semibold text-[color:var(--foreground)]">
                      {remaining}
                    </span>{" "}
                    Leads offen ·{" "}
                    <span className="tabular-nums">
                      {needPerDay.toFixed(1)}/Tag für {daysLeft} Tage
                    </span>
                  </>
                ) : (
                  <span className="font-semibold text-emerald-600">
                    Ziel erreicht 🎯
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Empfehlung */}
      {recommendation ? (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
              <span>↑</span> Letzte Entscheidung
              {pool.latestAction ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] normal-case text-blue-700">
                  {pool.latestAction}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-[color:var(--foreground)]">{recommendation}</p>
          </div>
          <ApplyNowButton compact />
        </div>
      ) : null}

      {/* Settings */}
      <PoolSettingsForm pool={pool} />

      {/* History */}
      <div>
        <h3 className="mb-2 inline-flex items-center gap-2 text-sm font-semibold">
          <span>↻</span> Verlauf dieses Pools
        </h3>
        {poolHistory.length === 0 ? (
          <p className="text-xs text-[color:var(--muted)]">
            Noch keine Entscheidungen für diesen Pool protokolliert.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {poolHistory.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-baseline gap-2 rounded-lg border border-[color:var(--border)] bg-white px-3 py-2 text-xs"
              >
                <span className="font-mono text-[color:var(--muted)]">
                  {h.createdAt}
                  {h.dryRun ? " sim" : ""}
                </span>
                <ActionBadge action={h.action} />
                <span className="flex-1 text-[color:var(--muted)]">
                  {h.reason}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ─── Gauge (kreisförmiger Fortschritt via conic-gradient) ────────────

function Gauge({
  percent,
  status,
}: {
  percent: number;
  status: { cls: string; dot: string };
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const color =
    status.dot === "bg-emerald-500"
      ? "#10b981"
      : status.dot === "bg-amber-500"
        ? "#f59e0b"
        : status.dot === "bg-rose-500"
          ? "#f43f5e"
          : "#d4d4d8";
  return (
    <div className="relative grid h-32 w-32 place-items-center">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(${color} ${clamped}%, #e4e4e7 ${clamped}% 100%)`,
        }}
        aria-hidden
      />
      <div className="absolute inset-2 rounded-full bg-white" aria-hidden />
      <div className="relative z-10 text-center">
        <div className={cn("text-2xl font-bold tabular-nums", status.cls)}>
          {Math.round(clamped)}%
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
          erreicht
        </div>
      </div>
    </div>
  );
}

function Tile({
  label,
  sublabel,
  value,
  unit,
  valueClass,
}: {
  label: string;
  sublabel?: string;
  value: string;
  unit?: string;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
        {label}
        {sublabel ? (
          <span className="rounded-full bg-zinc-100 px-1.5 py-0 text-[9px] font-medium normal-case text-zinc-600">
            {sublabel}
          </span>
        ) : null}
      </div>
      <div className={cn("mt-0.5 text-2xl font-bold tabular-nums", valueClass)}>
        {value}
      </div>
      {unit ? (
        <div className="text-[11px] text-[color:var(--muted)]">{unit}</div>
      ) : null}
    </div>
  );
}

// ─── Autopilot-Toggle (separates Mini-Form) ──────────────────────────

function AutopilotToggle({ pool }: { pool: PoolDetailRow }) {
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(pool.autopilot);
  function toggle() {
    const next = !optimistic;
    setOptimistic(next);
    const fd = new FormData();
    fd.set("poolKey", pool.key);
    if (next) fd.set("autopilot", "on");
    if (pool.maxDailyBudget != null)
      fd.set("maxDailyBudget", String(pool.maxDailyBudget));
    if (pool.campaignKeyword) fd.set("campaignKeyword", pool.campaignKeyword);
    startTransition(async () => {
      const res = await savePoolSettings({}, fd);
      if (res.error) setOptimistic(pool.autopilot); // rollback
    });
  }
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2 transition",
        optimistic
          ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]/40"
          : "border-[color:var(--border)] hover:border-[color:var(--brand)]/40",
      )}
    >
      <div className="flex flex-col items-end">
        <span className="text-xs font-semibold">Autopilot</span>
        <span className="text-[10px] text-[color:var(--muted)]">
          {optimistic ? "steuert automatisch" : "manuell"}
        </span>
      </div>
      <span
        className={cn(
          "relative h-5 w-9 rounded-full transition",
          optimistic ? "bg-[color:var(--brand)]" : "bg-zinc-300",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
            optimistic ? "left-[18px]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

// ─── Settings-Form (Budget + Keyword) ────────────────────────────────

function PoolSettingsForm({ pool }: { pool: PoolDetailRow }) {
  const [state, formAction, pending] = useActionState<SaveSettingsState, FormData>(
    savePoolSettings,
    {},
  );
  return (
    <form
      action={formAction}
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
    >
      <input type="hidden" name="poolKey" value={pool.key} />
      {/* Autopilot wird vom Toggle gesetzt; hier nur, falls jemand das Form
          ohne Toggle abschickt, den aktuellen Stand mitschicken. */}
      <input
        type="hidden"
        name="autopilot"
        value={pool.autopilot ? "on" : ""}
      />
      <label className="block">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
          Max. Budget / Tag
        </span>
        <div className="mt-1 flex items-center rounded-lg border border-[color:var(--border)] bg-white px-3">
          <span className="text-sm text-[color:var(--muted)]">€</span>
          <input
            type="number"
            name="maxDailyBudget"
            min={0}
            step={5}
            defaultValue={pool.maxDailyBudget ?? ""}
            placeholder="Env-Default"
            className="w-full bg-transparent py-2 pl-2 text-sm tabular-nums focus:outline-none"
          />
          <span className="text-xs text-[color:var(--muted)]">/Tag</span>
        </div>
      </label>
      <label className="block">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
          Kampagnen-Keyword (optional)
        </span>
        <div className="mt-1 flex items-center rounded-lg border border-[color:var(--border)] bg-white px-3">
          <span className="text-sm text-[color:var(--muted)]">#</span>
          <input
            type="text"
            name="campaignKeyword"
            defaultValue={pool.campaignKeyword ?? ""}
            placeholder={keywordOf(pool)}
            className="w-full bg-transparent py-2 pl-1 text-sm focus:outline-none"
          />
          <span className="text-xs text-[color:var(--muted)]">auto</span>
        </div>
      </label>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-300 disabled:opacity-60"
        >
          {pending ? "Speichere…" : "Speichern"}
          {state.ok ? " ✓" : ""}
        </button>
      </div>
    </form>
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
