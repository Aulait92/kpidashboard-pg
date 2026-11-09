import { redirect } from "next/navigation";
import { CheckCircle2, Inbox, PlugZap, Workflow, XCircle } from "lucide-react";
import { Badge, Card, CardHeader } from "@/components/ui";
import { getCurrentSession } from "@/lib/auth";
import { getAppUrl } from "@/lib/email";
import { listPageForms, metaDiagnostics, type MetaForm } from "@/lib/meta-leads";
import { prisma } from "@/lib/prisma";
import { assignFormAction, dismissUnassignedAction, toggleSourceAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lead-Eingang | KPI-Dashboard" };

const input =
  "h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm outline-none focus:border-[color:var(--brand)]";
const fmt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

export default async function LeadIntakePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; ok?: string; err?: string; form?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") redirect("/login");
  const sp = await searchParams;

  const [diag, sources, customers, products, leadSources, unassigned] = await Promise.all([
    metaDiagnostics(),
    prisma.leadSource.findMany({ include: { customer: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.customer.findMany({ where: { plan: { not: "internal" }, archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.product.findMany({ where: { active: true }, select: { name: true }, orderBy: { name: "asc" } }),
    prisma.lead.findMany({ where: { source: { not: null } }, distinct: ["source"], select: { source: true }, take: 50 }),
    prisma.unassignedLead.groupBy({ by: ["formId"], where: { resolvedAt: null }, _count: { _all: true }, _max: { createdAt: true } }),
  ]);
  const productOptions = Array.from(new Set([...products.map((p) => p.name), ...leadSources.map((l) => l.source!)])).sort();

  let forms: MetaForm[] = [];
  let formsError: string | null = null;
  if (sp.page) {
    try {
      forms = await listPageForms(sp.page);
    } catch (err) {
      formsError = err instanceof Error ? err.message : String(err);
    }
  }

  let base = "";
  try {
    base = getAppUrl();
  } catch {
    base = "";
  }
  const metaReady = diag.tokenSet && diag.appSecretSet && diag.verifyTokenSet && !diag.missing.includes("leads_retrieval");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lead-Eingang</h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">Leadformular einem Kunden zuordnen, dann kommen Leads direkt in die App.</p>
      </div>
      {sp.ok ? <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{sp.ok}</p> : null}
      {sp.err ? <p className="rounded-md bg-rose-50 px-4 py-2 text-sm text-rose-800">{sp.err}</p> : null}

      <details open={!metaReady} className="group rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-md)] [&>summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer items-center gap-2.5 px-5 py-3.5 group-open:border-b group-open:border-[color:var(--border)]">
          <PlugZap className="h-4 w-4 text-[color:var(--muted)]" />
          <span className="flex-1 text-[15px] font-semibold">Meta-Verbindung</span>
          {metaReady ? <Badge tone="success">bereit</Badge> : <Badge tone="warning">unvollständig</Badge>}
        </summary>
        <div className="grid gap-4 p-5 text-sm md:grid-cols-2">
          <ul className="space-y-1.5">
            <Check ok={diag.tokenSet} label="System-User-Token (META_ACCESS_TOKEN)" />
            <Check ok={diag.appSecretSet} label="App-Geheimschlüssel (META_APP_SECRET)" />
            <Check ok={diag.verifyTokenSet} label="Webhook-Bestätigungstoken (META_WEBHOOK_VERIFY_TOKEN)" />
            <Check ok={!diag.missing.includes("leads_retrieval")} label="Berechtigung leads_retrieval" />
            <Check ok={!diag.missing.includes("pages_manage_metadata")} label="Berechtigung pages_manage_metadata (Seiten abonnieren)" />
            <Check ok={!diag.missing.includes("ads_management")} label="Berechtigung ads_management (Pause: Anzeigen stoppen)" />
          </ul>
          <div className="space-y-1.5 text-[color:var(--muted)]">
            <div>
              App: <b className="text-[color:var(--foreground)]">{diag.appName ?? "unbekannt"}</b>
              {diag.appId ? ` (${diag.appId})` : ""}
            </div>
            <div>Seiten mit Zugriff: {diag.pages.length}</div>
            {diag.scopes.length ? <div className="break-words text-xs">Berechtigungen: {diag.scopes.join(", ")}</div> : null}
            {diag.error ? <div className="text-rose-700">{diag.error}</div> : null}
            <div className="pt-2">
              Webhook-URL in der Meta-App (Produkt Webhooks → Page → Feld <code>leadgen</code>):
              <code className="mt-1 block break-all rounded bg-[color:var(--surface-sunken,#f1f5f9)] px-2 py-1 text-xs text-[color:var(--foreground)]">
                {base}/api/meta/leadgen
              </code>
            </div>
          </div>
        </div>
      </details>

      {unassigned.length ? (
        <Card tone="attention">
          <CardHeader title="Posteingang: Leads ohne Zuordnung" icon={Inbox} count={unassigned.reduce((a, u) => a + u._count._all, 0)} />
          <ul className="divide-y divide-[color:var(--border)] text-sm">
            {unassigned.map((u) => (
              <li key={u.formId ?? "none"} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span>
                  Formular <b>{u.formId ?? "unbekannt"}</b> · {u._count._all} Lead(s), zuletzt {u._max.createdAt ? fmt(u._max.createdAt) : "-"}
                </span>
                <a href={`/admin/lead-eingang?form=${u.formId ?? ""}#zuordnen`} className="ml-auto font-medium text-[color:var(--brand)] underline">
                  Zuordnen
                </a>
                <form action={dismissUnassignedAction}>
                  <input type="hidden" name="formId" value={u.formId ?? ""} />
                  <button className="text-xs text-[color:var(--muted)] underline">verwerfen</button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Zuordnungen" icon={Workflow} count={sources.length} />
        {sources.length === 0 ? (
          <p className="p-5 text-sm text-[color:var(--muted)]">Noch keine Formulare zugeordnet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[color:var(--muted)]">
                <tr>
                  <th className="px-5 py-2">Formular</th>
                  <th className="px-3 py-2">Kunde</th>
                  <th className="px-3 py-2">Produkt</th>
                  <th className="px-3 py-2">Lead-Preis</th>
                  <th className="px-3 py-2">Letzter Lead</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border)]">
                {sources.map((s) => (
                  <tr key={s.id} className={s.active ? "" : "opacity-50"}>
                    <td className="px-5 py-2">
                      <div className="font-medium">{s.formName ?? "Formular"}</div>
                      <div className="text-xs text-[color:var(--muted)]">{s.formId}</div>
                    </td>
                    <td className="px-3 py-2">{s.customer.name}</td>
                    <td className="px-3 py-2">{s.productKey}</td>
                    <td className="px-3 py-2">{s.leadPrice ? `${Number(s.leadPrice).toLocaleString("de-DE")} €` : "-"}</td>
                    <td className="px-3 py-2">{s.lastLeadAt ? fmt(s.lastLeadAt) : "-"}</td>
                    <td className="px-3 py-2 text-right">
                      <form action={toggleSourceAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className="text-xs font-medium text-[color:var(--brand)] underline">{s.active ? "pausieren" : "aktivieren"}</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Formular zuordnen" />
        <div id="zuordnen" className="space-y-4 p-5 text-sm">
          {diag.pages.length ? (
            <form className="flex flex-wrap items-end gap-2">
              <label className="block min-w-[260px] flex-1 space-y-1">
                <span className="text-xs font-medium text-[color:var(--muted)]">Facebook-Seite (Formulare laden)</span>
                <select name="page" defaultValue={sp.page ?? ""} className={input}>
                  <option value="">Seite wählen</option>
                  {diag.pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="h-10 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-4 font-medium">Formulare laden</button>
            </form>
          ) : null}
          {formsError ? <p className="text-rose-700">{formsError}</p> : null}
          <form action={assignFormAction} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="pageId" value={sp.page ?? ""} />
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[color:var(--muted)]">Leadformular</span>
              {forms.length ? (
                <select name="formId" required className={input}>
                  {forms.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.status ?? "?"})
                    </option>
                  ))}
                </select>
              ) : (
                <input name="formId" required defaultValue={sp.form ?? ""} placeholder="Formular-ID, z. B. 1909684100014197" className={input} />
              )}
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[color:var(--muted)]">Kunde</span>
              <select name="customerId" required className={input} defaultValue="">
                <option value="" disabled>
                  Kunde wählen
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[color:var(--muted)]">Produkt</span>
              <input name="productKey" required list="lead-products" placeholder="z. B. Privatschutz" className={input} />
              <datalist id="lead-products">
                {productOptions.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[color:var(--muted)]">Lead-Preis netto (nur Pay-per-Lead)</span>
              <input name="leadPrice" inputMode="decimal" placeholder="leer = kein Lead-Preis" className={input} />
            </label>
            <details className="md:col-span-2">
              <summary className="cursor-pointer text-xs font-medium text-[color:var(--muted)]">Erweitert: Airtable-Bezug für Stornogründe</summary>
              <input name="bezugAirtableId" placeholder="rec… (leer lassen bei Retainer-Kunden)" className={`${input} mt-2`} />
            </details>
            <div className="md:col-span-2">
              <button className="h-10 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 font-semibold text-white">Zuordnen</button>
              <span className="ml-3 text-xs text-[color:var(--muted)]">Wartende Leads des Formulars werden übernommen.</span>
            </div>
          </form>
        </div>
      </Card>

      <details className="group rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-md)] [&>summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer px-5 py-3.5 text-[15px] font-semibold group-open:border-b group-open:border-[color:var(--border)]">Übergang: Webhook für Zapier</summary>
        <div className="space-y-2 p-5 text-sm text-[color:var(--muted)]">
          <p>
            Solange ein Formular noch über Zapier läuft: im Zap den Airtable-Schritt durch „Webhooks by Zapier → POST“ ersetzen
            (Payload: JSON, alle Felder des Leads). Die Zuordnung erfolgt über die <code>form_id</code> wie oben.
          </p>
          <code className="block break-all rounded bg-[color:var(--surface-sunken,#f1f5f9)] px-2 py-1 text-xs text-[color:var(--foreground)]">
            {base}/api/leads/eingang?token={process.env.LEAD_WEBHOOK_TOKEN ? process.env.LEAD_WEBHOOK_TOKEN : "(LEAD_WEBHOOK_TOKEN setzen)"}
          </code>
        </div>
      </details>
    </main>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-500" />}
      {label}
    </li>
  );
}
