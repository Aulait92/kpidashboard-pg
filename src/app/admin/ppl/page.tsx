import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Plus } from "lucide-react";
import { SubTabs } from "@/components/admin-tabs";
import { Badge, Card, CardHeader } from "@/components/ui";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { quotaFor } from "@/lib/ppl/engine";
import { fmtWeek, weekRange } from "@/lib/ppl/periods";
import { assignParkedAction, decideStornoAction, discardParkedAction } from "./actions";
import { loadCustomerOverview, loadPplReport, type Granularity } from "@/lib/ppl/auswertung";
import { PplOverview, PplReportView } from "@/components/admin/ppl-auswertung";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pay-per-Lead | KPI-Dashboard" };

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const dt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
const PERIOD: Record<string, string> = { week: "Wochenbestellung", month: "monatlich", once: "einmalig" };
const DELIVERY: Record<string, string> = { app: "Kundenbereich", email: "E-Mail", webhook: "Webhook" };
const POOL_STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  delivered: { label: "ausgeliefert", tone: "success" },
  parked: { label: "geparkt", tone: "warning" },
  duplicate: { label: "Dublette", tone: "neutral" },
  invalid: { label: "ungültig", tone: "danger" },
};

export default async function PplPage({ searchParams }: { searchParams: Promise<{ ansicht?: string; zeitraum?: string; produkt?: string }> }) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") redirect("/login");
  const { ansicht = "", zeitraum, produkt } = await searchParams;
  const [subs, parkedCount, reviewCount] = await Promise.all([
    prisma.leadSubscription.findMany({ include: { customer: { select: { name: true } } }, orderBy: [{ productKey: "asc" }, { active: "desc" }, { createdAt: "asc" }] }),
    prisma.poolLead.count({ where: { status: "parked" } }),
    prisma.lead.count({ where: { stornoState: "review" } }),
  ]);
  const views = [
    { key: "", label: "Bezüge" },
    { key: "uebersicht", label: "Übersicht je Kunde" },
    { key: "auswertung", label: "Auswertung" },
    { key: "geparkt", label: "Geparkt", count: parkedCount },
    { key: "storno", label: "Storno prüfen", count: reviewCount },
    { key: "eingang", label: "Eingang" },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-8 sm:px-6 lg:px-8">
      <SubTabs tabs={[{ href: "/admin/leads", label: "Leads" }, { href: "/admin/ppl", label: "Pay-per-Lead" }, { href: "/admin/whatsapp", label: "WhatsApp-Chats", exact: true }]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Pay-per-Lead</h1>
        <div className="flex gap-2">
        <Link href="/admin/ppl/import" className="inline-flex h-9 items-center rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm font-medium">
          Aus Airtable übernehmen
        </Link>
        <Link href="/admin/ppl/bezug/neu" className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-3 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" /> Bezug anlegen
        </Link>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto">
        {views.map((v) => (
          <Link
            key={v.key || "bezuege"}
            href={v.key ? `/admin/ppl?ansicht=${v.key}` : "/admin/ppl"}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${ansicht === v.key ? "bg-[color:var(--foreground)] text-white" : "text-[color:var(--muted)] hover:bg-white"}`}
          >
            {v.label}
            {v.count ? <span className={`rounded-full px-1.5 text-xs ${ansicht === v.key ? "bg-white/20" : "bg-amber-100 text-amber-800"}`}>{v.count}</span> : null}
          </Link>
        ))}
      </nav>
      {ansicht === "uebersicht" ? (
        <PplOverview rows={await loadCustomerOverview()} />
      ) : ansicht === "auswertung" ? (
        <PplReportView report={await loadPplReport((["tag", "woche", "monat"].includes(zeitraum ?? "") ? zeitraum : "tag") as Granularity, produkt ?? null)} />
      ) : ansicht === "geparkt" ? (
        <Parked subs={subs} />
      ) : ansicht === "storno" ? (
        <Review />
      ) : ansicht === "eingang" ? (
        <Intake />
      ) : (
        <Subscriptions subs={subs} />
      )}
    </main>
  );
}

type Subs = Awaited<ReturnType<typeof prisma.leadSubscription.findMany<{ include: { customer: { select: { name: true } } } }>>>;

async function Subscriptions({ subs }: { subs: Subs }) {
  const { start } = weekRange();
  const rows = await Promise.all(subs.map(async (s) => ({ s, q: s.active ? await quotaFor(s) : null })));
  const products = [...new Set(subs.map((s) => s.productKey))];
  if (!subs.length) return <Card><p className="p-5 text-sm text-[color:var(--muted)]">Noch keine Bezüge. Über „Bezug anlegen“ oder per Import aus Airtable.</p></Card>;
  return (
    <div className="space-y-5">
      {products.map((p) => (
        <Card key={p}>
          <CardHeader title={p} count={rows.filter((r) => r.s.productKey === p && r.s.active).length} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[color:var(--border)] text-left text-xs text-[color:var(--muted)]">
                <tr>
                  <th className="px-4 py-2">Käufer</th>
                  <th className="px-3 py-2">Kontingent</th>
                  <th className="px-3 py-2">Geliefert</th>
                  <th className="px-3 py-2">Preis</th>
                  <th className="px-3 py-2">Filter</th>
                  <th className="px-3 py-2">Lieferung</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border)]">
                {rows
                  .filter((r) => r.s.productKey === p)
                  .map(({ s, q }) => {
                    const filters = [
                      s.plzRanges ? "PLZ" : null,
                      !s.acceptWeak ? `keine schwachen${s.weakThreshold ? ` (<${s.weakThreshold} €)` : ""}` : null,
                      s.onlyWeak ? "nur schwache" : null,
                      !s.acceptCivilServants ? "keine Beamten" : null,
                      s.insurerInclude.length ? `nur ${s.insurerInclude.length} Ges.` : null,
                      s.insurerExclude.length ? `ohne ${s.insurerExclude.length} Ges.` : null,
                      s.scoreFloor ? `Score ≥ ${s.scoreFloor}` : null,
                    ].filter(Boolean);
                    return (
                      <tr key={s.id} className={s.active ? "" : "opacity-50"}>
                        <td className="px-4 py-2.5">
                          <div className="font-medium">{s.customer.name}</div>
                          <div className="text-xs text-[color:var(--muted)]">
                            {s.status === "test" ? <Badge tone="warning">Test {s.testQuantity ?? ""}</Badge> : null} {s.active ? "" : "pausiert"}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {PERIOD[s.period]}
                          {s.period === "week" ? (
                            <div className="text-xs text-[color:var(--muted)]">{q ? `${q.quota} für ${fmtWeek(start)}` : `nichts bezahlt für ${fmtWeek(start)}`}</div>
                          ) : (
                            <div className="text-xs text-[color:var(--muted)]">{s.goal ?? s.testQuantity ?? "–"} Leads</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">{q ? `${q.delivered} / ${q.quota}` : "–"}</td>
                        <td className="px-3 py-2.5 tabular-nums">
                          {eur(Number(s.price))}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-[color:var(--muted)]">{filters.join(" · ") || "–"}</td>
                        <td className="px-3 py-2.5 text-xs">{DELIVERY[s.delivery] ?? s.delivery}</td>
                        <td className="px-3 py-2.5 text-right">
                          <Link href={`/admin/ppl/bezug/${s.id}`} className="text-sm font-medium text-[color:var(--brand)] hover:underline">
                            Bearbeiten
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}

async function Parked({ subs }: { subs: Subs }) {
  const parked = await prisma.poolLead.findMany({ where: { status: "parked" }, orderBy: { createdAt: "desc" }, take: 100 });
  if (!parked.length) return <Card><p className="p-5 text-sm text-[color:var(--muted)]">Keine geparkten Leads.</p></Card>;
  return (
    <Card>
      <ul className="divide-y divide-[color:var(--border)]">
        {parked.map((p) => {
          const options = subs.filter((s) => s.active && s.productKey === p.productKey);
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {p.productKey} · {dt(p.createdAt)}
                </div>
                <div className="text-xs text-[color:var(--muted)]">
                  {[p.plz ? `PLZ ${p.plz}` : null, p.contribution ? `${p.contribution} €` : null, p.weak ? "schwach" : null, p.insurer].filter(Boolean).join(" · ")}
                  {p.reason ? <span className="ml-1 text-amber-700">· {p.reason}</span> : null}
                </div>
              </div>
              <form action={assignParkedAction} className="flex items-center gap-2">
                <input type="hidden" name="poolLeadId" value={p.id} />
                <select name="subscriptionId" className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-2 text-sm" required>
                  {options.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.customer.name}
                    </option>
                  ))}
                </select>
                <button className="h-9 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-3 text-sm font-semibold text-white" disabled={!options.length}>
                  Ausliefern
                </button>
              </form>
              <form action={discardParkedAction}>
                <input type="hidden" name="poolLeadId" value={p.id} />
                <button className="text-xs font-medium text-[color:var(--muted)] hover:text-rose-700">Verwerfen</button>
              </form>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

async function Review() {
  const leads = await prisma.lead.findMany({
    where: { stornoState: "review" },
    orderBy: { stornoRequestedAt: "asc" },
    select: { id: true, name: true, source: true, deliveredAt: true, stornoReason: true, stornoNote: true, customer: { select: { name: true } }, creditAmount: true, revenues: { select: { amount: true }, take: 1 } },
  });
  if (!leads.length) return <Card><p className="p-5 text-sm text-[color:var(--muted)]">Keine Stornos zu prüfen.</p></Card>;
  return (
    <Card>
      <ul className="divide-y divide-[color:var(--border)]">
        {leads.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {l.customer.name} · {l.source} · {l.name ?? "Lead"}
              </div>
              <div className="text-xs text-[color:var(--muted)]">
                {l.stornoReason}
                {l.stornoNote ? `: „${l.stornoNote}“` : ""} · geliefert {l.deliveredAt ? dt(l.deliveredAt) : "–"} · {eur(Number(l.revenues[0]?.amount ?? 0))}
              </div>
            </div>
            {(["approve", "reject"] as const).map((d) => (
              <form key={d} action={decideStornoAction}>
                <input type="hidden" name="leadId" value={l.id} />
                <input type="hidden" name="decision" value={d} />
                <button className={`h-9 rounded-[var(--radius-sm)] px-3 text-sm font-semibold ${d === "approve" ? "bg-emerald-600 text-white" : "border border-[color:var(--border)] bg-white"}`}>
                  {d === "approve" ? "Gutschreiben" : "Ablehnen"}
                </button>
              </form>
            ))}
          </li>
        ))}
      </ul>
    </Card>
  );
}

async function Intake() {
  const rows = await prisma.poolLead.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  const leadIds = rows.map((r) => r.leadId).filter((x): x is string => !!x);
  const owners = new Map(
    (await prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, customer: { select: { name: true } } } })).map((l) => [l.id, l.customer.name]),
  );
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[color:var(--border)] text-left text-xs text-[color:var(--muted)]">
            <tr>
              <th className="px-4 py-2">Eingang</th>
              <th className="px-3 py-2">Produkt</th>
              <th className="px-3 py-2">Merkmale</th>
              <th className="px-3 py-2">Ergebnis</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border)]">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 text-[color:var(--muted)]">{dt(r.createdAt)}</td>
                <td className="px-3 py-2">{r.productKey}</td>
                <td className="px-3 py-2 text-xs text-[color:var(--muted)]">
                  {[r.plz, r.contribution ? `${r.contribution} €` : null, r.weak ? "schwach" : null, r.smsVerified ? "SMS" : null].filter(Boolean).join(" · ")}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={POOL_STATUS[r.status]?.tone ?? "neutral"}>{POOL_STATUS[r.status]?.label ?? r.status}</Badge>{" "}
                  <span className="text-xs text-[color:var(--muted)]">{r.leadId ? owners.get(r.leadId) : r.reason}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
