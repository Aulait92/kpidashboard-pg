import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, ChevronRight, Layers, Megaphone, ShoppingCart, TrendingUp, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { EmpfehlungGrowthRow } from "@/components/empfehlung/server";
import { getBuyerContext } from "@/lib/buyer-context";
import { parseRangeFromSearchParams } from "@/lib/date-ranges";
import { computeMonthlyForecast } from "@/lib/forecast";
import { formatNumber } from "@/lib/format";
import { computeKpis } from "@/lib/kpis";
import { currentPause } from "@/lib/pause";
import { prisma } from "@/lib/prisma";
import { productOverview } from "@/lib/produkt-buchen";

// Neue Oberfläche: „Wachstum“ bündelt alles, was nicht zum täglichen
// Abarbeiten gehört – Zahlen, Leads bestellen, Bestand, Werbung & Pause.
export const dynamic = "force-dynamic";
export const metadata = { title: "Wachstum | performancegrowth" };

export default async function WachstumPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  if (ctx.teamRole === "advisor") redirect("/buyer");

  const { range } = parseRangeFromSearchParams({ range: "thisMonth" });
  const [kpis, forecast, ppl, customer, pause] = await Promise.all([
    computeKpis({ range, customerId: ctx.customerId, product: null }),
    computeMonthlyForecast({ customerId: ctx.customerId, includeCloseValue: true }).catch(() => null),
    prisma.leadSubscription.count({ where: { customerId: ctx.customerId, active: true, delivery: "app" } }),
    prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { existingCustomersEnabled: true } }),
    currentPause(ctx.customerId),
  ]);
  // Dezenter Hinweis „Weitere Sparte dazubuchen“, wenn es buchbare Produkte gibt
  const bookable = await productOverview(ctx.customerId)
    .then((o) => o.bookable)
    .catch(() => []);
  const leadRow = forecast?.rows.find((r) => r.format === "number");
  const month = new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: "Europe/Berlin" }).format(new Date());

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Wachstum" subtitle="Zahlen, neue Leads und Werbung an einem Ort." />
      <div className="grid gap-4 sm:grid-cols-2">
        <HubCard
          href="/buyer/zahlen"
          icon={BarChart3}
          title="Zahlen"
          text={`Im ${month} bisher:`}
          stats={[
            { label: "Leads", value: formatNumber(kpis.nettoLeads) },
            { label: "Termine", value: formatNumber(kpis.terminLeads) },
            { label: "Abschlüsse", value: formatNumber(kpis.closedLeads) },
          ]}
          cta="Alle Zahlen ansehen"
        />
        {ppl > 0 ? (
          <HubCard href="/buyer/bestellen" icon={ShoppingCart} title="Leads bestellen" text="Neue Leads nachbestellen oder eine regelmäßige Bestellung einrichten." cta="Zur Bestellung" />
        ) : null}
        {customer?.existingCustomersEnabled ? (
          <HubCard href="/buyer/bestand" icon={Users} title="Bestand" text="Bestandskunden hochladen und gezielt wieder ansprechen." cta="Zum Bestand" />
        ) : null}
        <HubCard
          href="/buyer/konto"
          icon={Megaphone}
          title="Werbebudget & Pause"
          text={
            pause
              ? pause.status === "active"
                ? "Ihre Werbung ist gerade pausiert."
                : "Eine Pause ist geplant."
              : "Ihre Werbung läuft. Budget erhöhen oder senken, im Urlaub pausieren."
          }
          cta="Budget ändern"
        />
        <HubCard
          href="/buyer/zahlen"
          icon={TrendingUp}
          title="Hochrechnung"
          text={
            leadRow
              ? `Wenn es so weitergeht, erhalten Sie im ${month} etwa ${formatNumber(Math.round(leadRow.projected))} ${leadRow.label}.`
              : "Was bis Monatsende zu erwarten ist."
          }
          cta="Hochrechnung ansehen"
        />
      </div>
      <div className="mt-5">
        <EmpfehlungGrowthRow ctx={ctx} />
      </div>
      {bookable.length ? (
        <Link
          href="/buyer/konto#produkte"
          data-wachstum-produkt
          className="mt-3 flex items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-[color:var(--border)] px-4 py-3 text-[15px] text-[color:var(--muted)] transition hover:border-[color:var(--brand)] hover:text-[color:var(--text)]"
        >
          <Layers className="h-4 w-4 shrink-0 text-[color:var(--brand)]" />
          <span className="min-w-0 flex-1">
            Weitere Sparte dazubuchen, z. B. {bookable.slice(0, 2).map((b) => b.name).join(" oder ")}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0" />
        </Link>
      ) : null}
    </main>
  );
}

function HubCard({
  href,
  icon: Icon,
  title,
  text,
  stats,
  cta,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  text: string;
  stats?: { label: string; value: string }[];
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] p-5 shadow-[var(--shadow-md)] transition hover:border-[color:var(--brand)]"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[color:var(--brand)]">
          <Icon className="h-5 w-5" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      <p className="mt-3 text-base text-[color:var(--muted)]">{text}</p>
      {stats ? (
        <dl className="mt-3 grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2">
              <dt className="text-sm text-[color:var(--muted)]">{s.label}</dt>
              <dd className="text-xl font-semibold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <span className="mt-4 inline-flex min-h-11 items-center gap-1 text-base font-semibold text-[color:var(--brand)]">
        {cta}
        <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
