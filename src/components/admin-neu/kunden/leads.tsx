import Link from "next/link";
import { Badge, Card, CardHeader } from "@/components/ui";
import { toggleSourceAction } from "@/app/admin/lead-eingang/actions";
import { MetaAccountCard } from "@/app/admin/kunden/[id]/leads/meta-account-card";
import { CapiCard } from "@/app/admin/kunden/[id]/leads/capi-card";
import { TestLeadButton, TestLeadDeleteButton } from "@/app/admin/kunden/[id]/leads/testlead-button";
import { TestLeadBadge } from "@/components/test-lead-badge";
import { isStorno } from "@/lib/admin-leads";
import { displayProduct, statusLabel } from "@/lib/products";
import { prisma } from "@/lib/prisma";
import { isTestLeadSandbox, testLeadProducts } from "@/lib/testlead";

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

// Kundenakte › Leads (Umbau 20.11.2026): dieselben Daten, Bausteine und Actions wie /admin/kunden/[id]/leads, aber in zwei
// Teilen, damit die letzten Leads oben stehen und Werbekonto, CAPI und Formulare (Einrichtung, selten) zugeklappt sind.
// Links führen in den neuen Admin (Liefern › Leads bzw. Lead-Eingang) statt in den alten.

/** Letzte 10 Leads mit Status, „Testlead schicken“ und Sprung in alle Leads dieses Kunden. */
export async function LetzteLeads({ customerId }: { customerId: string }) {
  const [customer, leads, total, products] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { name: true, isTest: true, plan: true, leadAddress: true } }),
    prisma.lead.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, name: true, source: true, status: true, createdAt: true, closedAt: true, isTest: true },
    }),
    prisma.lead.count({ where: { customerId } }),
    testLeadProducts(customerId),
  ]);
  return (
    <Card>
      <CardHeader
        title="Letzte Leads"
        count={total}
        actions={
          <span data-funktion="testlead-actions-sendtestleadaction--testlead-schicken-echter-ablauf-zaehlt-nirgends">
            <TestLeadButton
              customerId={customerId}
              testCustomer={!!customer?.isTest}
              realCustomerName={customer && !isTestLeadSandbox(customer) ? customer.name : null}
              products={products}
              defaultPhone={null}
              leadAddress={customer?.leadAddress === "du" ? "du" : "sie"}
            />
          </span>
        }
      />
      {leads.length === 0 ? (
        <p className="p-5 text-sm text-[color:var(--muted)]">
          Noch keine Leads. Sie kommen, sobald ein Leadformular diesem Kunden zugeordnet ist:{" "}
          <Link href="/admin/neu/leads" className="font-medium text-[color:var(--brand)] hover:underline">
            Formular zuordnen
          </Link>
        </p>
      ) : (
        <>
          <ul className="divide-y divide-[color:var(--border)]" data-funktion="page--letzte-leads-mit-abschluss-storno">
            {leads.map((l) => (
              <li key={l.id} className="flex min-h-11 items-center gap-3 px-5 py-2.5 text-sm">
                <span className="w-[5.5rem] shrink-0 text-xs tabular-nums text-[color:var(--muted)]">{fmt(l.createdAt)}</span>
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
                {l.isTest ? <TestLeadDeleteButton customerId={customerId} leadId={l.id} /> : null}
              </li>
            ))}
          </ul>
          {total > leads.length ? (
            <Link
              href={`/admin/neu/leads/alle?kunde=${customerId}`}
              className="flex min-h-11 items-center justify-center border-t border-[color:var(--border)] text-sm font-medium text-[color:var(--brand)] hover:bg-[color:var(--surface-sunken)]"
            >
              Alle {total} Leads ansehen
            </Link>
          ) : null}
        </>
      )}
    </Card>
  );
}

/** Kurzfassung für die zugeklappte Zeile „Werbekonto & Formulare“. */
export async function werbekontoStand(customerId: string): Promise<string> {
  const [c, formulare] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { metaAdAccountId: true } }),
    prisma.leadSource.count({ where: { customerId, active: true } }),
  ]);
  const konto = c?.metaAdAccountId ? `act_${c.metaAdAccountId}` : "kein Werbekonto";
  return `${konto} · ${formulare} ${formulare === 1 ? "Formular aktiv" : "Formulare aktiv"}`;
}

/** Meta-Werbekonto, Rückmeldung an Meta (CAPI) und Leadformulare des Kunden (an/aus). */
export async function WerbekontoFormulare({ customerId }: { customerId: string }) {
  const [c, sources] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerId }, select: { metaAdAccountId: true } }),
    prisma.leadSource.findMany({ where: { customerId }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <div className="space-y-3">
      <div data-funktion="meta-account-actions-setmetaadaccountaction--meta-werbekonto-id-setzen">
        <MetaAccountCard customerId={customerId} current={c?.metaAdAccountId ?? null} />
      </div>
      <div data-funktion="capi-actions-setcapidatasetaction--capi-rueckmeldung-status-und-dataset-setzen">
        <CapiCard customerId={customerId} />
      </div>
      <Card>
        <div data-funktion="actions-togglesourceaction--leadformulare-des-kunden-an-aus">
          <CardHeader
            title="Leadformulare"
            count={sources.length}
            actions={
              <Link href="/admin/neu/leads" className="inline-flex min-h-10 items-center text-sm font-medium text-[color:var(--brand)] hover:underline">
                Formular zuordnen
              </Link>
            }
          />
          {sources.length === 0 ? (
            <p className="p-5 text-sm text-[color:var(--muted)]">Noch kein Formular zugeordnet.</p>
          ) : (
            <ul className="divide-y divide-[color:var(--border)]">
              {sources.map((s) => (
                <li key={s.id} className={`flex items-center gap-3 px-5 py-3 text-sm ${s.active ? "" : "opacity-50"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{s.formName ?? s.formId}</div>
                    <div className="text-xs text-[color:var(--muted)]">
                      {displayProduct(s.productKey)}
                      {s.leadPrice ? ` · ${Number(s.leadPrice).toLocaleString("de-DE")} € je Lead` : ""}
                      {` · letzter Lead ${s.lastLeadAt ? fmt(s.lastLeadAt) : "noch keiner"}`}
                    </div>
                  </div>
                  <form action={toggleSourceAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="inline-flex min-h-10 items-center text-xs font-medium text-[color:var(--brand)] hover:underline">{s.active ? "Pausieren" : "Aktivieren"}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
