import { SubTabs } from "@/components/admin-tabs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { FilterChips } from "@/components/ui/filter-chips";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isStorno, leadSelect, leadWhere, priceOf, type LeadFilter } from "@/lib/admin-leads";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads | KPI-Dashboard" };

const PAGE = 100;
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const dt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

const OUTREACH: Record<string, string> = {
  sent: "WhatsApp gesendet",
  skipped_booked: "hatte schon Termin",
  skipped_contact: "hat selbst geschrieben",
  no_template: "keine WhatsApp-Vorlage",
};

export default async function AdminLeadsPage({ searchParams }: { searchParams: Promise<LeadFilter & { seite?: string }> }) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") redirect("/login");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.seite) || 1);
  const where = leadWhere(sp);

  const [leads, total, customers, products, sums, stornos] = await Promise.all([
    prisma.lead.findMany({ where, select: leadSelect, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    prisma.lead.count({ where }),
    prisma.customer.findMany({ where: { archived: false, plan: { not: "internal" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.lead.findMany({ where: { source: { not: null } }, distinct: ["source"], select: { source: true }, orderBy: { source: "asc" } }),
    prisma.revenue.aggregate({ where: { cancelled: false, lead: where }, _sum: { amount: true } }),
    prisma.lead.count({ where: { AND: [where, { status: { startsWith: "Storno", mode: "insensitive" } }] } }),
  ]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "seite") as [string, string][]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    return d.toISOString().slice(0, 7);
  });

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <SubTabs tabs={[{ href: "/admin/leads", label: "Leads" }, { href: "/admin/ppl", label: "Pay-per-Lead" }, { href: "/admin/whatsapp", label: "WhatsApp-Chats", exact: true }]} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        </div>
        <a href={`/admin/leads/export?${qs.toString()}`} className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm font-medium">
          <Download className="h-4 w-4" /> CSV exportieren
        </a>
      </div>

      <FilterChips
        searchPlaceholder="Name, Telefon, E-Mail"
        fields={[
          { kind: "select", key: "kunde", label: "Kunde", options: customers.map((c) => ({ value: c.id, label: c.name })) },
          { kind: "select", key: "produkt", label: "Produkt", options: products.map((p) => ({ value: p.source!, label: p.source! })) },
          {
            kind: "select",
            key: "status",
            label: "Status",
            options: [
              { value: "offen", label: "Offen" },
              { value: "abschluss", label: "Abschluss" },
              { value: "storno", label: "Storno" },
            ],
          },
          {
            kind: "period",
            label: "Zeitraum",
            monthKey: "monat",
            fromKey: "von",
            toKey: "bis",
            months: months.map((m) => ({
              value: m,
              label: new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(new Date(`${m}-15T12:00:00Z`)),
            })),
          },
        ]}
      />

      <p className="text-sm text-[color:var(--muted)]">
        <b className="font-semibold text-[color:var(--foreground)]">{total.toLocaleString("de-DE")} Leads</b>
        {" · "}Umsatz netto <b className="font-semibold text-[color:var(--foreground)]">{eur(Number(sums._sum.amount ?? 0))}</b>
        {stornos ? <>{" · "}<span className="text-rose-700">{stornos} Stornos</span></> : null}
      </p>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[color:var(--border)] text-left text-xs text-[color:var(--muted)]">
              <tr>
                <th className="px-4 py-2.5">Datum</th>
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">Kontakt</th>
                <th className="px-3 py-2.5">Kunde</th>
                <th className="px-3 py-2.5">Produkt</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Preis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border)]">
              {leads.map((l) => {
                const storno = isStorno(l.status);
                const price = priceOf(l);
                const answers = Array.isArray(l.formData) ? (l.formData as { label: string; value: string }[]) : [];
                return (
                  <tr key={l.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-2.5 text-[color:var(--muted)]">{dt(l.createdAt)}</td>
                    <td className="px-3 py-2.5">
                      <details>
                        <summary className="cursor-pointer font-medium">{l.name ?? "ohne Name"}</summary>
                        <div className="mt-2 space-y-1 text-xs text-[color:var(--muted)]">
                          {answers.map((a, i) => (
                            <div key={i}>
                              <span className="text-[color:var(--foreground)]">{a.label}:</span> {a.value}
                            </div>
                          ))}
                          <div>
                            Kontaktversuche: {l.contactAttempts}
                            {l.outreachStatus ? ` · ${OUTREACH[l.outreachStatus] ?? l.outreachStatus}` : ""}
                            {l.appointments[0] ? ` · Termin ${dt(l.appointments[0].startsAt)}` : ""}
                          </div>
                          <div>
                            Eingang: {l.externalId ? "direkt (Meta)" : l.airtableId ? "Airtable" : "App"}
                            {l.adChannel ? ` · ${l.adChannel}` : ""}
                          </div>
                        </div>
                      </details>
                    </td>
                    <td className="px-3 py-2.5">
                      {l.phone ? (
                        <a href={`tel:+${l.phone}`} className="block text-[color:var(--brand)]">
                          +{l.phone}
                        </a>
                      ) : null}
                      {l.email ? <span className="block text-xs text-[color:var(--muted)]">{l.email}</span> : null}
                    </td>
                    <td className="px-3 py-2.5">{l.customer.name}</td>
                    <td className="px-3 py-2.5">{l.source ?? "-"}</td>
                    <td className="px-3 py-2.5">
                      {storno ? <Badge tone="danger">Storno</Badge> : l.closedAt ? <Badge tone="success">Abschluss</Badge> : <span>{l.status ?? "Neu"}</span>}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${storno ? "text-[color:var(--muted)] line-through" : ""}`}>
                      {price ? eur(price) : "-"}
                    </td>
                  </tr>
                );
              })}
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[color:var(--muted)]">
                    Keine Leads für diese Auswahl.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {pages > 1 ? (
        <div className="flex items-center justify-center gap-3 text-sm">
          {page > 1 ? <Link href={`/admin/leads?${qs.toString()}&seite=${page - 1}`} className="underline">zurück</Link> : null}
          <span className="text-[color:var(--muted)]">
            Seite {page} von {pages}
          </span>
          {page < pages ? <Link href={`/admin/leads?${qs.toString()}&seite=${page + 1}`} className="underline">weiter</Link> : null}
        </div>
      ) : null}
    </main>
  );
}
