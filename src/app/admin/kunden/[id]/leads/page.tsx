import Link from "next/link";
import { connection } from "next/server";
import { Badge, Card, CardHeader } from "@/components/ui";
import { toggleSourceAction } from "@/app/admin/lead-eingang/actions";
import { prisma } from "@/lib/prisma";
import { isStorno } from "@/lib/admin-leads";
import { MetaAccountCard } from "./meta-account-card";

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

// Reiter „Leads & Formulare“: welche Leadformulare zu diesem Kunden gehören
// und die letzten Leads.
export default async function KundenLeads({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const [customer, sources, leads, total] = await Promise.all([
    prisma.customer.findUnique({ where: { id }, select: { metaAdAccountId: true } }),
    prisma.leadSource.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" } }),
    prisma.lead.findMany({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, name: true, phone: true, source: true, status: true, createdAt: true, closedAt: true, externalId: true, airtableId: true },
    }),
    prisma.lead.count({ where: { customerId: id } }),
  ]);

  return (
    <div className="grid gap-5 lg:grid-cols-[2fr_3fr]">
      <div className="space-y-5">
      <MetaAccountCard customerId={id} current={customer?.metaAdAccountId ?? null} />
      <Card>
        <CardHeader
          title="Leadformulare"
          count={sources.length}
          actions={
            <Link href="/admin/lead-eingang#zuordnen" className="text-sm font-medium text-[color:var(--brand)] hover:underline">
              + Formular zuordnen
            </Link>
          }
        />
        {sources.length === 0 ? (
          <p className="p-5 text-sm text-[color:var(--muted)]">Kein Formular zugeordnet. Leads kommen dann nur über Airtable.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--border)]">
            {sources.map((s) => (
              <li key={s.id} className={`flex items-center gap-3 px-5 py-3 text-sm ${s.active ? "" : "opacity-50"}`}>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.formName ?? s.formId}</div>
                  <div className="text-xs text-[color:var(--muted)]">
                    {s.productKey}
                    {s.leadPrice ? ` · ${Number(s.leadPrice).toLocaleString("de-DE")} € je Lead` : ""}
                    {` · letzter Lead ${s.lastLeadAt ? fmt(s.lastLeadAt) : "noch keiner"}`}
                  </div>
                </div>
                <form action={toggleSourceAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="text-xs font-medium text-[color:var(--brand)] hover:underline">{s.active ? "Pausieren" : "Aktivieren"}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
      </div>

      <Card>
        <CardHeader
          title="Letzte Leads"
          count={total}
          actions={
            <Link href={`/admin/leads?kunde=${id}`} className="text-sm font-medium text-[color:var(--brand)] hover:underline">
              Alle anzeigen →
            </Link>
          }
        />
        {leads.length === 0 ? (
          <p className="p-5 text-sm text-[color:var(--muted)]">Noch keine Leads.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--border)]">
            {leads.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="w-24 shrink-0 text-xs text-[color:var(--muted)]">{fmt(l.createdAt)}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{l.name ?? "ohne Name"}</span>
                <span className="hidden truncate text-xs text-[color:var(--muted)] sm:block">{l.source ?? ""}</span>
                {isStorno(l.status) ? (
                  <Badge tone="danger">Storno</Badge>
                ) : l.closedAt ? (
                  <Badge tone="success">Abschluss</Badge>
                ) : (
                  <span className="shrink-0 text-xs text-[color:var(--muted)]">{l.status ?? "Neu"}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
