import { statusLabel } from "@/lib/products";
import { KundenTabs } from "@/components/admin/kunden-tabs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Inbox, Phone } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { FilterChips } from "@/components/ui/filter-chips";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isStorno, loadAdminLeads, priceOf, type LeadFilter } from "@/lib/admin-leads";
import { TestLeadBadge } from "@/components/test-lead-badge";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads | performancegrowth Admin" };

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

  const { leads, total, customers, products, sums, stornos } = await loadAdminLeads(sp, page, PAGE);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "seite") as [string, string][]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    return d.toISOString().slice(0, 7);
  });

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <KundenTabs />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
        </div>
        <a href={`/admin/leads/export?${qs.toString()}`} className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm font-medium">
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

      {/* Handy: Liste statt 7-Spalten-Tabelle (Kunde, Status und Preis lagen außerhalb des Bildschirms) */}
      <Card className="md:hidden">
        {leads.length ? (
          <ul className="divide-y divide-[color:var(--border)]">
            {leads.map((l) => {
              const storno = isStorno(l.status);
              const price = priceOf(l);
              return (
                <li key={l.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{l.name ?? "ohne Name"}</span>
                      {l.isTest ? <TestLeadBadge /> : null}
                      {storno ? <Badge tone="danger">Storno</Badge> : l.closedAt ? <Badge tone="success">Abschluss</Badge> : null}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-[color:var(--muted)]">
                      {dt(l.createdAt)} · {l.customer.name}
                      {l.source ? ` · ${l.source}` : ""}
                    </div>
                  </div>
                  <span className={`shrink-0 tabular-nums ${storno ? "text-[color:var(--muted)] line-through" : ""}`}>{price ? eur(price) : ""}</span>
                  {l.phone ? (
                    <a href={`tel:+${l.phone}`} aria-label={`${l.name ?? "Lead"} anrufen`} className="-my-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--brand)] hover:bg-[color:var(--surface-sunken)]">
                      <Phone className="h-4 w-4" />
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={Inbox} title="Keine Leads für diese Auswahl." text="Filter oben ändern, z. B. einen anderen Zeitraum wählen." />
        )}
      </Card>

      <Card className="hidden md:block">
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
                        <summary className="cursor-pointer font-medium">
                          {l.name ?? "ohne Name"}
                          {l.isTest ? <TestLeadBadge className="ml-2 align-middle" /> : null}
                        </summary>
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
                      {storno ? <Badge tone="danger">Storno</Badge> : l.closedAt ? <Badge tone="success">Abschluss</Badge> : <span>{statusLabel(l.status) ?? "Neu"}</span>}
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
          {page > 1 ? <Link href={`/admin/leads?${qs.toString()}&seite=${page - 1}`} className="inline-flex min-h-10 items-center underline">zurück</Link> : null}
          <span className="text-[color:var(--muted)]">
            Seite {page} von {pages}
          </span>
          {page < pages ? <Link href={`/admin/leads?${qs.toString()}&seite=${page + 1}`} className="inline-flex min-h-10 items-center underline">weiter</Link> : null}
        </div>
      ) : null}
    </main>
  );
}
