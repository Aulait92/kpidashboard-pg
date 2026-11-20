import { statusLabel } from "@/lib/products";
import Link from "next/link";
import { connection } from "next/server";
import { Badge, Card, CardHeader } from "@/components/ui";
import { toggleSourceAction } from "@/app/admin/lead-eingang/actions";
import { prisma } from "@/lib/prisma";
import { isStorno } from "@/lib/admin-leads";
import { MetaAccountCard } from "./meta-account-card";
import { CapiCard } from "./capi-card";
import { TestLeadBadge } from "@/components/test-lead-badge";
import { isTestLeadSandbox, testLeadProducts } from "@/lib/testlead";
import { TestLeadButton, TestLeadDeleteButton } from "./testlead-button";

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

// Reiter „Leads & Formulare“: welche Leadformulare zu diesem Kunden gehören
// und die letzten Leads.
export default async function KundenLeads({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const [customer, sources, leads, total, products] = await Promise.all([
    prisma.customer.findUnique({ where: { id }, select: { name: true, metaAdAccountId: true, isTest: true, plan: true, leadAddress: true } }),
    prisma.leadSource.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" } }),
    prisma.lead.findMany({
      where: { customerId: id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, name: true, phone: true, source: true, status: true, createdAt: true, closedAt: true, externalId: true, airtableId: true, isTest: true },
    }),
    prisma.lead.count({ where: { customerId: id } }),
    testLeadProducts(id),
  ]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_3fr]">
      <div className="space-y-5">
      <MetaAccountCard customerId={id} current={customer?.metaAdAccountId ?? null} />
      <CapiCard customerId={id} />
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
          <p className="p-5 text-sm text-[color:var(--muted)]">Kein Formular zugeordnet.</p>
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
            <div className="flex items-center gap-3">
              {/* Admin-Profil hat keine eigene Telefonnummer: leer mit Platzhalter, zuletzt genutzte Nummer aus dem Browser */}
              <TestLeadButton
                customerId={id}
                testCustomer={!!customer?.isTest}
                realCustomerName={customer && !isTestLeadSandbox(customer) ? customer.name : null}
                products={products}
                defaultPhone={null}
                leadAddress={customer?.leadAddress === "du" ? "du" : "sie"}
              />
              <Link href={`/admin/leads?kunde=${id}`} className="hidden text-sm font-medium text-[color:var(--brand)] hover:underline sm:inline">
                Alle anzeigen →
              </Link>
            </div>
          }
        />
        {leads.length === 0 ? (
          <p className="p-5 text-sm text-[color:var(--muted)]">
            Noch keine Leads. Sie kommen, sobald ein Leadformular diesem Kunden zugeordnet ist:{" "}
            <Link href="/admin/lead-eingang" className="font-medium text-[color:var(--brand)] hover:underline">
              Lead-Eingang
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--border)]">
            {leads.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="w-24 shrink-0 text-xs text-[color:var(--muted)]">{fmt(l.createdAt)}</span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate font-medium">{l.name ?? "ohne Name"}</span>
                  {l.isTest ? <TestLeadBadge /> : null}
                </span>
                <span className="hidden truncate text-xs text-[color:var(--muted)] sm:block">{l.source ?? ""}</span>
                {isStorno(l.status) ? (
                  <Badge tone="danger">Storno</Badge>
                ) : l.closedAt ? (
                  <Badge tone="success">Abschluss</Badge>
                ) : (
                  <span className={`shrink-0 text-xs text-[color:var(--muted)] ${l.isTest ? "hidden sm:inline" : ""}`}>{statusLabel(l.status) ?? "Neu"}</span>
                )}
                {l.isTest ? <TestLeadDeleteButton customerId={id} leadId={l.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
