import Link from "next/link";
import { Download, Inbox, Phone } from "lucide-react";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";
import { FilterChips } from "@/components/ui/filter-chips";
import { Seite } from "@/components/admin-neu/ui/seite";
import { Ansichten } from "@/components/admin-neu/leads/ansichten";
import { isStorno, loadAdminLeads, priceOf, type LeadFilter } from "@/lib/admin-leads";
import { searchDeliveredLeads } from "@/lib/ppl/admin-leads";
import { prisma } from "@/lib/prisma";
import { StornoEintragen, StornoZuruecknehmen } from "@/app/admin/ppl/storno-eintragen";
import { TestLeadBadge } from "@/components/test-lead-badge";

export const metadata = { title: "Alle Leads | performancegrowth Admin" };

// Leads & Kampagnen → Alle Leads: alle Leads aller Kunden mit Filtern und CSV-Export (wie /admin/leads).
// Ansicht „Pay-per-Lead geliefert“ ersetzt die frühere PPL-Ansicht „Gelieferte Leads“: Suche auch nach Lead-ID und
// Bezug, Storno von Hand eintragen oder zurücknehmen (Bausteine aus /admin/ppl).

const PFAD = "/admin/neu/leads/alle";
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
const STORNO_STATE: Record<string, { label: string; tone: "warning" | "danger" | "neutral" }> = {
  approved: { label: "storniert", tone: "danger" },
  review: { label: "Storno in Prüfung", tone: "warning" },
  rejected: { label: "Storno abgelehnt", tone: "neutral" },
};

type Suche = LeadFilter & { seite?: string; art?: string; bezug?: string };

export default async function Page({ searchParams }: { searchParams: Promise<Suche> }) {
  const sp = await searchParams;
  const ppl = sp.art === "ppl";
  const ansichten = [
    { key: "", label: "Alle", href: PFAD },
    { key: "ppl", label: "Pay-per-Lead geliefert", href: `${PFAD}?art=ppl`, funktion: "page-geliefert--gelieferte-leads-suchen-name-telefon-e-mail-id" },
  ];
  return (
    <Seite titel="Leads & Kampagnen" reiter="leads" breit>
      <Ansichten items={ansichten} aktiv={ppl ? "ppl" : ""} />
      {ppl ? <Geliefert sp={sp} /> : <Alle sp={sp} />}
    </Seite>
  );
}

async function Alle({ sp }: { sp: Suche }) {
  const page = Math.max(1, Number(sp.seite) || 1);
  const filter: LeadFilter = { q: sp.q, kunde: sp.kunde, produkt: sp.produkt, status: sp.status, von: sp.von, bis: sp.bis, monat: sp.monat };
  const { leads, total, customers, products, sums, stornos } = await loadAdminLeads(filter, page, PAGE);
  const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    return d.toISOString().slice(0, 7);
  });

  return (
    <div data-funktion="page--alle-leads-aller-kunden-mit-status-und-preis">
      <div data-funktion="page-morefilters--filter-kunde-produkt-status-zeitraum-monat-oder">
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
              months: months.map((m) => ({ value: m, label: new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(new Date(`${m}-15T12:00:00Z`)) })),
            },
          ]}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[color:var(--muted)]">
          <b className="font-semibold text-[color:var(--foreground)]">{total.toLocaleString("de-DE")} Leads</b>
          {" · "}Umsatz netto <b className="font-semibold text-[color:var(--foreground)]">{eur(Number(sums._sum.amount ?? 0))}</b>
          {stornos ? (
            <>
              {" · "}
              <span className="text-rose-700">{stornos} Stornos</span>
            </>
          ) : null}
        </p>
        <span data-funktion="route-get--csv-export-der-gefilterten-leads-mit-protokoll">
          <a href={`/admin/leads/export?${qs.toString()}`} download className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-[color:var(--brand)] hover:underline">
            <Download className="h-4 w-4" /> CSV exportieren
          </a>
        </span>
      </div>

      <Card>
        {leads.length ? (
          <ul className="divide-y divide-[color:var(--border)]">
            {leads.map((l) => {
              const storno = isStorno(l.status);
              const price = priceOf(l);
              const answers = Array.isArray(l.formData) ? (l.formData as { label: string; value: string }[]) : [];
              return (
                <li key={l.id} className="flex items-start gap-3 px-4 py-3 text-sm sm:px-5">
                  <details className="group min-w-0 flex-1 [&>summary::-webkit-details-marker]:hidden">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate font-medium">{l.name ?? "ohne Name"}</span>
                        {l.isTest ? (
                          <span data-funktion="test-lead-badge-testleadbadge--testleads-in-lead-listen-mit-kennzeichen-test">
                            <TestLeadBadge />
                          </span>
                        ) : null}
                        {storno ? <Badge tone="danger">Storno</Badge> : l.closedAt ? <Badge tone="success">Abschluss</Badge> : <Badge>{l.status ?? "Neu"}</Badge>}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-[color:var(--muted)]">
                        {dt(l.createdAt)} · {l.customer.name}
                        {l.source ? ` · ${l.source}` : ""}
                        <span className="hidden sm:inline">
                          {l.phone ? ` · +${l.phone}` : ""}
                          {l.email ? ` · ${l.email}` : ""}
                        </span>
                      </div>
                    </summary>
                    <div className="mt-2 space-y-1 rounded-[var(--radius-sm)] bg-[color:var(--surface-sunken)] px-3 py-2 text-xs text-[color:var(--muted)]">
                      {l.phone || l.email ? (
                        <div className="break-all">
                          {l.phone ? `+${l.phone}` : ""}
                          {l.phone && l.email ? " · " : ""}
                          {l.email ?? ""}
                        </div>
                      ) : null}
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
                  <span className={`shrink-0 pt-0.5 tabular-nums ${storno ? "text-[color:var(--muted)] line-through" : ""}`}>{price ? eur(price) : ""}</span>
                  {l.phone ? (
                    <a
                      href={`tel:+${l.phone}`}
                      aria-label={`${l.name ?? "Lead"} anrufen`}
                      data-funktion="page-tel--lead-anrufen"
                      className="-my-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--brand)] hover:bg-[color:var(--surface-sunken)]"
                    >
                      <Phone className="h-4 w-4" />
                    </a>
                  ) : (
                    <span className="w-10 shrink-0" />
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={Inbox} title="Keine Leads für diese Auswahl." text="Filter oben ändern, z. B. einen anderen Zeitraum wählen." />
        )}
      </Card>

      {pages > 1 ? (
        <div className="mt-3 flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link href={`${PFAD}?${qs.toString()}&seite=${page - 1}`} className="inline-flex min-h-10 items-center underline">
              zurück
            </Link>
          ) : null}
          <span className="text-[color:var(--muted)]">
            Seite {page} von {pages}
          </span>
          {page < pages ? (
            <Link href={`${PFAD}?${qs.toString()}&seite=${page + 1}`} className="inline-flex min-h-10 items-center underline">
              weiter
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Von der App ausgelieferte Pay-per-Lead-Leads: suchen, Storno von Hand eintragen oder zurücknehmen. */
async function Geliefert({ sp }: { sp: Suche }) {
  const [leads, subs] = await Promise.all([
    searchDeliveredLeads({ q: sp.q ?? "", subscriptionId: sp.bezug || undefined }),
    prisma.leadSubscription.findMany({ select: { id: true, label: true, productKey: true, customer: { select: { name: true } } }, orderBy: [{ productKey: "asc" }, { createdAt: "asc" }] }),
  ]);
  return (
    <div>
      <FilterChips
        searchPlaceholder="Name, Telefon, E-Mail oder Lead-ID"
        fields={[{ kind: "select", key: "bezug", label: "Bezug", options: subs.map((s) => ({ value: s.id, label: `${s.customer.name} · ${s.label ?? s.productKey}` })) }]}
      />
      <p className="mb-3 text-sm text-[color:var(--muted)]">Neueste 50 gelieferte Leads.</p>
      <Card>
        {leads.length ? (
          <ul className="divide-y divide-[color:var(--border)]">
            {leads.map((l) => {
              const st = l.stornoState ? STORNO_STATE[l.stornoState] : null;
              return (
                <li key={l.id} className="space-y-1.5 px-4 py-3 text-sm sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{l.name ?? "Lead"}</span>
                    <span className="text-[color:var(--muted)]">
                      {l.customer.name} · {l.subscription?.label ?? l.source}
                    </span>
                    {st ? <Badge tone={st.tone}>{st.label}</Badge> : null}
                    {l.creditedAt ? <Badge>Gutschrift verrechnet</Badge> : null}
                  </div>
                  <div className="break-words text-xs text-[color:var(--muted)]">
                    {[l.phone ? `+${l.phone}` : null, l.email, l.deliveredAt ? `geliefert ${dt(l.deliveredAt)}` : null, l.revenues[0] ? eur(Number(l.revenues[0].amount)) : null, `ID ${l.id}`]
                      .filter(Boolean)
                      .join(" · ")}
                    {l.stornoReason ? (
                      <span>
                        {" "}
                        · Grund: {l.stornoReason}
                        {l.stornoNote ? ` („${l.stornoNote}“)` : ""}
                      </span>
                    ) : null}
                  </div>
                  {l.stornoState === "approved" ? (
                    !l.creditedAt ? (
                      <div data-funktion="actions-undostornoaction--storno-zuruecknehmen">
                        <StornoZuruecknehmen leadId={l.id} />
                      </div>
                    ) : null
                  ) : (
                    <div data-funktion="actions-adminstornoaction--storno-von-hand-eintragen-grund-notiz">
                      <StornoEintragen leadId={l.id} reasons={l.subscription?.stornoReasons ?? []} outsideWindow={l.outsideWindow} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={Inbox}
            title="Keine gelieferten Leads gefunden."
            text="Suche oder Bezug ändern."
            action={
              <ButtonLink href={`${PFAD}?art=ppl`} variant="secondary">
                Filter zurücksetzen
              </ButtonLink>
            }
          />
        )}
      </Card>
    </div>
  );
}
