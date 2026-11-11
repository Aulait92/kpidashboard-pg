import Link from "next/link";
import { packageLabel } from "@/lib/customer-package";
import { connection } from "next/server";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { onboardingProgressFor } from "@/lib/onboarding";
import { CUSTOMER_COLOR, CUSTOMER_LABEL } from "@/lib/vertrieb/crm";
import { isAdminNewUi } from "@/lib/admin-ui";
import { cn } from "@/lib/utils";

export const metadata = { title: "Kunden | performancegrowth Admin" };

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const FILTERS = [
  { key: "", label: "Alle" },
  { key: "warnung", label: "Zahlung offen" },
  { key: "onboarding", label: "Onboarding" },
  { key: "pausiert", label: "Pausiert" },
] as const;

// Alle Kunden auf einen Blick; Klick öffnet die Kundenakte.
export default async function KundenUebersicht({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  await connection();
  const newUi = await isAdminNewUi();
  const { filter: rawFilter = "" } = await searchParams;
  const filter = newUi && FILTERS.some((f) => f.key === rawFilter) ? rawFilter : "";
  const since = daysAgo(30);
  const customers = await prisma.customer.findMany({
    where: { plan: { not: "internal" }, archived: false },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      plan: true,
      retainerMonthly: true,
      paymentOverdueSince: true,
      onboarding: { select: { id: true } },
      salesContact: { select: { customerStage: true, monthlyValue: true } },
      pauses: { where: { status: "active" }, select: { kind: true }, take: 1 },
      _count: { select: { leads: { where: { createdAt: { gte: since } } }, users: { where: { role: "BUYER" } } } },
    },
  });
  const progress = await onboardingProgressFor(customers.filter((c) => c.onboarding).map((c) => c.id));
  const matches = (c: (typeof customers)[number], key: string) => {
    const ob = progress.get(c.id);
    if (key === "warnung") return !!c.paymentOverdueSince;
    if (key === "onboarding") return !!ob && !ob.live;
    if (key === "pausiert") return c.pauses.length > 0;
    return true;
  };
  const visible = customers.filter((c) => matches(c, filter));
  const mrr = customers.reduce((a, c) => a + (c.salesContact?.customerStage === "AKTIV" ? (c.salesContact.monthlyValue ?? 0) : 0), 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[color:var(--muted)]">
        {customers.length} Kunden · {eur(mrr)} Monatsumsatz aktiv
      </p>
      {newUi ? (
        <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Filter">
          {FILTERS.map((f) => {
            const n = customers.filter((c) => matches(c, f.key)).length;
            if (f.key && !n) return null;
            const active = f.key === filter;
            return (
              <Link
                key={f.key}
                href={f.key ? `/admin/kunden?filter=${f.key}` : "/admin/kunden"}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition",
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
      ) : null}
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white shadow-[var(--shadow-sm)]">
        <ul className="divide-y divide-[color:var(--border)]">
          {visible.map((c) => {
            const ob = progress.get(c.id);
            const stage = c.salesContact?.customerStage ?? null;
            const pause = c.pauses[0];
            return (
              <li key={c.id}>
                <Link href={`/admin/kunden/${c.id}`} className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-[color:var(--surface-sunken)]">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{c.name.replace(/^Allianz\s+/i, "")}</span>
                      {stage ? <span className={`badge ${CUSTOMER_COLOR[stage]}`}>{CUSTOMER_LABEL[stage]}</span> : <Badge>Leads (Airtable)</Badge>}
                      {c.paymentOverdueSince ? <Badge tone="danger">Zahlung offen</Badge> : null}
                      {pause ? <Badge tone="warning">{pause.kind === "dunning" ? "pausiert (Zahlung)" : "pausiert"}</Badge> : null}
                    </div>
                    <div className="mt-0.5 text-xs text-[color:var(--muted)]">
                      {packageLabel(c)}
                      {c.salesContact?.monthlyValue ? ` · ${eur(c.salesContact.monthlyValue)}/Monat` : ""}
                      {` · ${c._count.leads} Leads in 30 Tagen · ${c._count.users} ${c._count.users === 1 ? "Login" : "Logins"}`}
                    </div>
                  </div>
                  {ob && !ob.live ? (
                    <div className="hidden w-40 shrink-0 sm:block">
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-[color:var(--brand)]" style={{ width: `${ob.percent}%` }} />
                      </div>
                      <div className="mt-1 text-[11px] text-[color:var(--muted)]">Onboarding {ob.percent} %{ob.waitingYou ? ` · ${ob.waitingYou} bei dir` : ""}</div>
                    </div>
                  ) : null}
                  <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
                </Link>
              </li>
            );
          })}
          {visible.length === 0 ? (
            <li className="px-5 py-8 text-center text-sm text-[color:var(--muted)]">{customers.length ? "Kein Kunde passt zu diesem Filter." : "Noch keine Kunden."}</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
