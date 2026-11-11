// Admin → Pay-per-Lead: Übersicht je Kunde und Auswertung (Tag/Woche/Monat).
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { GRANULARITIES, REJECT_LABELS, type CustomerOverviewRow, type PeriodStats, type PplReport, type RejectKey } from "@/lib/ppl/auswertung";

const eur = (n: number | null, d = 0) => (n == null ? "–" : n.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: d, maximumFractionDigits: d }));
const num = (n: number | null) => (n == null ? "–" : n.toLocaleString("de-DE"));
const th = "whitespace-nowrap px-3 py-2 font-medium";
const td = "whitespace-nowrap px-3 py-2 tabular-nums";

function Period({ p }: { p: PeriodStats }) {
  return (
    <>
      <td className={td}>{num(p.ordered)}</td>
      <td className={`${td} ${p.behind ? "font-semibold text-rose-700" : ""}`}>
        {p.delivered}
        {p.behind ? <span className="ml-1 text-xs font-normal">(soll {p.expected})</span> : null}
      </td>
      <td className={td}>{p.ordered != null ? Math.max(0, p.ordered - p.delivered) : "–"}</td>
      <td className={td}>{p.complaints || "–"}</td>
      <td className={td}>{eur(p.revenue)}</td>
    </>
  );
}

export function PplOverview({ rows }: { rows: CustomerOverviewRow[] }) {
  const behind = rows.filter((r) => r.week.behind || r.month.behind);
  const sum = (k: "week" | "month") => rows.reduce((a, r) => ({ d: a.d + r[k].delivered, c: a.c + r[k].complaints, u: a.u + r[k].revenue }), { d: 0, c: 0, u: 0 });
  const w = sum("week");
  const m = sum("month");
  return (
    <div className="space-y-4">
      {behind.length ? (
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <b>Liegt zurück:</b> {behind.map((r) => `${r.customer} (${r.product})`).join(", ")} – weniger geliefert als anteilig bestellt.
          </span>
        </div>
      ) : null}
      <Card>
        <CardHeader title="Übersicht je Kunde" hint={`Diese Woche: ${w.d} geliefert, ${w.c} reklamiert, ${eur(w.u)} · Dieser Monat: ${m.d} geliefert, ${m.c} reklamiert, ${eur(m.u)}`} />
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[color:var(--muted)]">
                <tr className="border-b border-[color:var(--border)]">
                  <th className={th} rowSpan={2}>Kunde</th>
                  <th className={th} rowSpan={2}>Produkt</th>
                  <th className={`${th} border-l border-[color:var(--border)]`} colSpan={5}>Diese Woche</th>
                  <th className={`${th} border-l border-[color:var(--border)]`} colSpan={5}>Dieser Monat</th>
                </tr>
                <tr className="border-b border-[color:var(--border)]">
                  {["Bestellt", "Geliefert", "Rest", "Reklamiert", "Umsatz", "Bestellt", "Geliefert", "Rest", "Reklamiert", "Umsatz"].map((h, i) => (
                    <th key={i} className={`${th} ${i === 0 || i === 5 ? "border-l border-[color:var(--border)]" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--border)]">
                {rows.map((r) => (
                  <tr key={`${r.customerId}-${r.product}`}>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Link href={`/admin/kunden/${r.customerId}`} className="font-medium text-[color:var(--brand)] hover:underline">{r.customer}</Link>
                      {r.source === "airtable" ? <span className="ml-1.5 text-xs text-[color:var(--muted)]">Airtable</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{r.product}</td>
                    <Period p={r.week} />
                    <Period p={r.month} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-5 text-sm text-[color:var(--muted)]">Diese Woche und diesen Monat noch keine Pay-per-Lead-Kunden mit Bestellung oder Lieferung.</p>
        )}
        <p className="border-t border-[color:var(--border)] px-5 py-3 text-xs text-[color:var(--muted)]">
          Bestellt: Wochenbestellung bzw. Monatsziel des Bezugs (Airtable: Lead-Ziel je Monat, Woche anteilig). Geliefert = verkaufte Leads im Zeitraum,
          reklamiert = davon storniert. „Liegt zurück“: weniger geliefert als bis heute anteilig bestellt.
        </p>
      </Card>
    </div>
  );
}

function Bars({ rows }: { rows: PplReport["rows"] }) {
  const max = Math.max(1, ...rows.map((r) => r.delivered + r.rejectedTotal));
  return (
    <div className="flex h-36 items-end gap-1 px-5 pt-4" aria-label="Geliefert, abgelehnt und reklamiert je Zeitraum">
      {rows.map((r) => (
        <div key={r.key} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${r.label}: ${r.delivered} geliefert (${r.complaints} reklamiert), ${r.rejectedTotal} abgelehnt`}>
          <div className="flex w-full flex-col-reverse overflow-hidden rounded-t" style={{ height: `${((r.delivered + r.rejectedTotal) / max) * 100}px` }}>
            <div className="bg-[color:var(--brand)]" style={{ height: `${((r.delivered - r.complaints) / max) * 100}px` }} />
            <div className="bg-amber-400" style={{ height: `${(r.complaints / max) * 100}px` }} />
            <div className="bg-slate-300" style={{ height: `${(r.rejectedTotal / max) * 100}px` }} />
          </div>
          <span className={`w-full truncate text-center text-[10px] ${r.current ? "font-semibold" : "text-[color:var(--muted)]"}`}>{r.label}</span>
        </div>
      ))}
    </div>
  );
}

export function PplReportView({ report }: { report: PplReport }) {
  const q = (g: string, p: string | null) => `/admin/ppl?ansicht=auswertung&zeitraum=${g}${p ? `&produkt=${encodeURIComponent(p)}` : ""}`;
  const rows = [...report.rows].reverse();
  const keys = Object.keys(REJECT_LABELS) as RejectKey[];
  const tot = report.rows.reduce(
    (a, r) => ({ d: a.d + r.delivered, rj: a.rj + r.rejectedTotal, c: a.c + r.complaints, u: a.u + r.revenue, s: a.s + r.spend, mc: a.mc + r.metaCost }),
    { d: 0, rj: 0, c: 0, u: 0, s: 0, mc: 0 },
  );
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-[13px] ${active ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] font-semibold text-[color:var(--brand)]" : "border-[color:var(--border)] bg-white text-[color:var(--muted)]"}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {GRANULARITIES.map((g) => (
          <Link key={g.key} href={q(g.key, report.product)} className={chip(report.granularity === g.key)} scroll={false}>
            {g.label}
          </Link>
        ))}
        <span className="mx-1 h-5 w-px bg-[color:var(--border)]" />
        <Link href={q(report.granularity, null)} className={chip(!report.product)} scroll={false}>Alle Produkte</Link>
        {report.products.map((p) => (
          <Link key={p} href={q(report.granularity, p)} className={chip(report.product === p)} scroll={false}>{p}</Link>
        ))}
      </div>
      <Card>
        <CardHeader
          title={`Pay-per-Lead je ${GRANULARITIES.find((g) => g.key === report.granularity)!.label}`}
          hint={`Summe: ${tot.d} geliefert · ${tot.rj} von uns abgelehnt · ${tot.c} reklamiert · Umsatz ${eur(tot.u)} · Ausgaben ${eur(tot.s)} · Gewinn ${eur(tot.u - tot.s)}${tot.u > 0 ? ` (${Math.round(((tot.u - tot.s) / tot.u) * 100)} %)` : ""}`}
        />
        <Bars rows={report.rows} />
        <div className="flex flex-wrap gap-3 px-5 pb-3 pt-1 text-xs text-[color:var(--muted)]">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[color:var(--brand)]" />geliefert</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-400" />reklamiert</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-slate-300" />von uns abgelehnt</span>
        </div>
        <div className="overflow-x-auto border-t border-[color:var(--border)]">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[color:var(--muted)]">
              <tr className="border-b border-[color:var(--border)]">
                <th className={`${th} sticky left-0 bg-white`}>Zeitraum</th>
                <th className={th}>Eingang</th>
                <th className={th}>Geliefert</th>
                <th className={th}>Offen</th>
                <th className={th}>Abgelehnt (wir)</th>
                {keys.map((k) => (
                  <th key={k} className={`${th} font-normal`}>{REJECT_LABELS[k]}</th>
                ))}
                <th className={th}>Reklamiert (Kunde)</th>
                <th className={th}>Leadpreis vor Ablehnung</th>
                <th className={th}>nach Ablehnung</th>
                <th className={th}>nach Reklamation</th>
                <th className={th}>Umsatz</th>
                <th className={th}>Ausgaben</th>
                <th className={th}>Gewinn</th>
                <th className={th}>Marge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border)]">
              {rows.map((r) => (
                <tr key={r.key} className={r.current ? "bg-[color:var(--brand-soft)]/40" : ""}>
                  <td className={`${td} sticky left-0 bg-white font-medium`}>{r.label}{r.current ? " (bisher)" : ""}</td>
                  <td className={td}>{num(r.received)}</td>
                  <td className={td}>{r.delivered}</td>
                  <td className={`${td} text-[color:var(--muted)]`} title="wartet auf Zustimmung bzw. noch in Bearbeitung">{r.pending || "–"}</td>
                  <td className={td}>{r.rejectedTotal || "–"}</td>
                  {keys.map((k) => (
                    <td key={k} className={`${td} text-[color:var(--muted)]`}>{r.rejected[k] || "–"}</td>
                  ))}
                  <td className={td}>{r.complaints || "–"}</td>
                  <td className={td}>{eur(r.cplBefore, 2)}</td>
                  <td className={td}>{eur(r.cplAfterReject, 2)}</td>
                  <td className={td}>{eur(r.cplAfterComplaints, 2)}</td>
                  <td className={td}>{eur(r.revenue)}</td>
                  <td className={td} title={`Meta ${eur(r.metaCost)}${r.otherCost ? ` + sonstige ${eur(r.otherCost)}` : ""}`}>{eur(r.spend)}</td>
                  <td className={`${td} ${r.profit < 0 ? "text-rose-700" : ""}`}>{eur(r.profit)}</td>
                  <td className={`${td} ${r.margin != null && r.margin < 0 ? "text-rose-700" : ""}`}>{r.margin == null ? "–" : `${r.margin.toLocaleString("de-DE")} %`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-1 border-t border-[color:var(--border)] px-5 py-3 text-xs text-[color:var(--muted)]">
          <p>
            Leadpreis = Meta-Kosten Pay-per-Lead (ohne eigene Akquise-Kampagnen) ÷ Eingang bzw. ÷ geliefert bzw. ÷ (geliefert − reklamiert). Umsatz = verkaufte Leads
            nach Reklamationen. Ausgaben = Meta-Kosten + direkte Pay-per-Lead-Kosten aus Bank/Karte und laufenden Kosten (anteilig je Tag).
          </p>
          <p>
            Eingang und „von uns abgelehnt“ kommen aus der Airtable-Leads-Tabelle (alle eingegangenen Leads, auch nicht verteilte) und nach der Umstellung aus
            der App. Leads ohne Produkt (z. B. Pflege-Check) zählen nicht dazu. „Offen“ = wartet auf Zustimmung zur Weitergabe oder noch in Bearbeitung.
          </p>
          {report.poolSince ? null : (
            <p className="font-medium text-amber-800">Noch keine Eingangsdaten – sie erscheinen nach dem nächsten Airtable-Abgleich.</p>
          )}
          {report.otherCostNote ? <p>Mit Produktfilter: nur Meta-Kosten des Produkts; sonstige Pay-per-Lead-Kosten lassen sich keinem Produkt zuordnen.</p> : null}
        </div>
      </Card>
    </div>
  );
}
