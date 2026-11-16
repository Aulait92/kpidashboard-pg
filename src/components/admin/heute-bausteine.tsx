import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronRight, ClipboardList, TrendingUp } from "lucide-react";
import { HEUTE_FILTERS, type AutoRow, type HeuteItem } from "@/lib/admin-heute";
import { HEUTE_ICONS as ICONS } from "@/components/admin/heute-icons";
import { cn } from "@/lib/utils";

// Bausteine von „Heute“, gemeinsam für die alte (/admin/heute) und die neue Oberfläche (/admin/neu).
// `basis` = Adresse der Heute-Seite für die Filter-Links.

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Filter-Chips (Alle, Vertrieb, Kunden, Chats, Freigaben); leere Filter ausgeblendet (außer dem gewählten). */
export function HeuteFilterChips({ items, aktiv, basis }: { items: HeuteItem[]; aktiv: string; basis: string }) {
  if (!items.length) return null;
  return (
    <div className="mb-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Bereich">
      {HEUTE_FILTERS.map((f) => {
        const n = items.filter(f.match).length;
        if (!n && f.key && f.key !== aktiv) return null;
        const active = f.key === aktiv;
        return (
          <Link
            key={f.key}
            href={f.key ? `${basis}?bereich=${f.key}` : basis}
            aria-current={active ? "true" : undefined}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition",
              active
                ? "border-[color:var(--foreground)] bg-[color:var(--foreground)] text-white"
                : "border-[color:var(--border)] bg-white text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
            )}
          >
            {f.label}
            <span className={cn("text-xs", active ? "text-white/70" : "")}>{n}</span>
          </Link>
        );
      })}
    </div>
  );
}

/** Leerer Zustand der Liste „Braucht Sie“. */
export function HeuteAllesErledigt({ gefiltert }: { gefiltert: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-4 py-12 text-center shadow-[var(--shadow-sm)]">
      <CheckCircle2 className="h-10 w-10 text-emerald-500" strokeWidth={1.5} />
      <p className="font-medium">{gefiltert ? "In diesem Bereich ist alles erledigt." : "Alles erledigt."}</p>
      <p className="text-sm text-[color:var(--muted)]">Neue Punkte erscheinen hier automatisch.</p>
    </div>
  );
}

/** Hinweis „X neue Buchungen seit Ihrem letzten Besuch“ (nur wenn > 0). */
export function NeueBuchungenHinweis({ anzahl, href = "/admin/zahlen/buchungen" }: { anzahl: number; href?: string }) {
  if (anzahl <= 0) return null;
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-blue-200 bg-blue-50 px-4 py-3 shadow-[var(--shadow-sm)] transition hover:border-blue-300"
      data-neue-buchungen={anzahl}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[color:var(--brand)]">
        <ClipboardList className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{anzahl === 1 ? "1 neue Buchung" : `${anzahl} neue Buchungen`} seit Ihrem letzten Besuch</span>
        <span className="block text-xs text-[color:var(--muted)]">Angebote, Produkte, Module, Budget, Pausen, Kündigungen</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
    </Link>
  );
}

/** „Läuft von allein“: was die App in 7 Tagen automatisch erledigt hat. `zugeklappt` = als Aufklapper (neuer Admin). */
export function LaeuftVonAllein({ auto, zugeklappt }: { auto: AutoRow[]; zugeklappt?: boolean }) {
  const liste = auto.length ? (
    <ul className="divide-y divide-[color:var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
      {auto.map((r) => {
        const Icon = ICONS[r.icon];
        return (
          <li key={r.key} className="flex gap-3 px-4 py-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-sunken)] text-[color:var(--muted)]">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium">{r.title}</div>
              <div className="text-xs text-[color:var(--muted)]">{r.detail}</div>
            </div>
          </li>
        );
      })}
    </ul>
  ) : (
    <p className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] px-4 py-6 text-center text-sm text-[color:var(--muted)]">
      In den letzten 7 Tagen ist noch nichts automatisch gelaufen.
    </p>
  );
  if (zugeklappt) {
    return (
      <details className="group">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 text-base font-semibold [&::-webkit-details-marker]:hidden">
          Läuft von allein
          <span className="flex items-center gap-1 text-sm font-normal text-[color:var(--muted)]">
            {auto.length ? `${auto.length} in 7 Tagen` : "7 Tage"}
            <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
          </span>
        </summary>
        <div className="mt-2">{liste}</div>
      </details>
    );
  }
  return (
    <section>
      <h2 className="mb-1 text-base font-semibold">Läuft von allein</h2>
      <p className="mb-3 text-sm text-[color:var(--muted)]">Das hat die App in den letzten 7 Tagen erledigt, ohne Sie zu fragen.</p>
      {liste}
    </section>
  );
}

type ForecastRow = { label: string; mtd: number; projected: number };

/** Umsatz bzw. Gewinn bis heute mit Hochrechnung für den Monat (Link zu den Zahlen). */
export function HochrechnungKarte({ rows, href = "/", titel = "Zahlen" }: { rows: ForecastRow[] | null | undefined; href?: string; titel?: string | null }) {
  const revenue = rows?.find((r) => r.label === "Umsatz");
  const profit = rows?.find((r) => /gewinn/i.test(r.label));
  if (!revenue) return null;
  return (
    <section>
      {titel ? <h2 className="mb-3 text-base font-semibold">{titel}</h2> : null}
      <Link
        href={href}
        className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white px-4 py-3 shadow-[var(--shadow-sm)] transition hover:border-[color:var(--border-strong)]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[color:var(--brand)]">
          <TrendingUp className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{profit ? `${profit.label} bis heute: ${eur(profit.mtd)}` : `Umsatz bis heute: ${eur(revenue.mtd)}`}</span>
          <span className="block text-xs text-[color:var(--muted)]">
            Hochrechnung Monat: Umsatz {eur(revenue.projected)}
            {profit ? ` · ${profit.label} ${eur(profit.projected)}` : ""}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
      </Link>
    </section>
  );
}
