import { UsersRound } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { formatEUR, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { BESTAND_JAHRE, cohortFutureTrail, contractProvision, STORNO_PRO_JAHR } from "@/lib/provision";
import { loadErtragData, trailContractOf } from "@/lib/ertrag";
import { leadOrigin, LEAD_ORIGIN_SELECT } from "@/lib/lead-herkunft";
import { memberName, teamMembers } from "@/lib/team";
import { nextStepRatesByAdvisor } from "@/lib/lead-next-step-server";
import { NEXT_STEP_WARN_BELOW } from "@/lib/lead-next-step";

// Auswertung je Team-Mitglied (nur Inhaber, nur wenn es ein Team gibt). Gleiche Logik wie die Karten
// (Ole, 14.11.2026): Leads und Quoten nur aus bezahlten Leads, Provision über alle Verträge
// (Empfehlungen, Cross-Selling) mit der Rate ihrer Sparte. mitBestand: gleicher Schalter wie die Karte
// Gewinn („Inkl. Bestand“), dann mit künftiger Bestandsprovision der Verträge dieses Zeitraums (5 Jahre).
export async function TeamStats({ customerId, range, mitBestand = false }: { customerId: string; range: { from: Date; to: Date }; mitBestand?: boolean }) {
  const members = await teamMembers(customerId);
  if (members.length < 2) return null;
  const [data, leads, steps] = await Promise.all([
    loadErtragData(customerId),
    prisma.lead.findMany({
      where: { customerId, createdAt: { gte: range.from, lte: range.to } },
      select: {
        assignedUserId: true,
        status: true,
        reached: true,
        ...LEAD_ORIGIN_SELECT,
        _count: { select: { appointments: true } },
      },
    }),
    // Nächster Schritt je Berater (Stand jetzt, Ziel 100 %)
    nextStepRatesByAdvisor(customerId),
  ]);
  type Row = { leads: number; reached: number; termine: number; closed: number; umsatz: number; bestand: number; future: number };
  const empty = (): Row => ({ leads: 0, reached: 0, termine: 0, closed: 0, umsatz: 0, bestand: 0, future: 0 });
  const now = new Date();
  const storno = data.storno ?? STORNO_PRO_JAHR;
  const rows = new Map<string | null, Row>();
  for (const l of leads) {
    if (l.status?.toLowerCase().startsWith("storno")) continue;
    if (leadOrigin(l) !== "paid") continue;
    const r = rows.get(l.assignedUserId) ?? empty();
    r.leads++;
    if (l.reached) r.reached++;
    if (l._count.appointments > 0) r.termine++;
    if (l.status?.toLowerCase() === "abschluss") r.closed++;
    rows.set(l.assignedUserId, r);
  }
  for (const c of data.contracts) {
    // Rückbelastung im Monat der Kündigung (wie die Karten)
    if (c.status === "storniert" && c.cancelledAt && c.cancelledAt >= range.from && c.cancelledAt <= range.to && (c.chargeback ?? 0) > 0) {
      const r = rows.get(c.assignedUserId) ?? empty();
      r.umsatz -= c.chargeback!;
      rows.set(c.assignedUserId, r);
    }
    if (c.periodAt < range.from || c.periodAt > range.to) continue;
    // Gekündigte Verträge: Abschlussprovision zählt (wie auf den Karten), Bestand nur bis zur Kündigung
    const p = contractProvision({ ...c, status: "aktiv" }, data.rates);
    const r = rows.get(c.assignedUserId) ?? empty();
    r.umsatz += p.firstYear;
    if (!(c.status === "storniert" && c.cancelledAt && c.cancelledAt <= now)) r.bestand += p.trailPerYear;
    r.future += cohortFutureTrail(trailContractOf(c, data.rates, storno), now, BESTAND_JAHRE, storno);
    rows.set(c.assignedUserId, r);
  }
  const list = [
    ...members.map((m) => ({ key: m.id, name: memberName(m), row: rows.get(m.id) })),
    ...(rows.get(null) || steps.get(null) ? [{ key: "none", name: "Nicht zugeteilt", row: rows.get(null) }] : []),
  ];
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "keine Angabe");
  const makler = data.typ === "makler";

  const provLabel = makler ? "Courtage 1. Jahr" : "Abschlussprovision";

  return (
    <Card data-team-stats>
      <CardHeader title="Team im Zeitraum" icon={UsersRound} />
      {/* Handy (UX-Runde 19.11.2026): eine Zeile je Person statt 9 Spalten zum Wischen. Name, Provision, Weg zum Abschluss,
          Warnung nur, wenn Leads ohne nächsten Schritt sind. Am Rechner bleibt die Tabelle. */}
      <ul className="divide-y divide-[color:var(--border)] sm:hidden" data-team-stats-liste>
        {list.map(({ key, name, row }) => {
          const r = row ?? empty();
          const st = steps.get(key === "none" ? null : key);
          const warn = st?.rate != null && st.rate < NEXT_STEP_WARN_BELOW && st.withoutNextStep > 0;
          return (
            <li key={key} className="px-5 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-medium">{name}</span>
                <span className="shrink-0 font-semibold tabular-nums">{formatEUR(mitBestand ? r.umsatz + r.future : r.umsatz)}</span>
              </div>
              <div className="mt-0.5 text-sm tabular-nums text-[color:var(--muted)]">
                {formatNumber(r.leads)} {r.leads === 1 ? "Lead" : "Leads"} · {formatNumber(r.termine)} {r.termine === 1 ? "Termin" : "Termine"} · {formatNumber(r.closed)}{" "}
                {r.closed === 1 ? "Abschluss" : "Abschlüsse"}
                {r.leads > 0 ? ` (${pct(r.closed, r.leads)})` : ""}
              </div>
              {warn ? (
                <div className="mt-0.5 text-sm font-semibold text-rose-600">
                  {st!.withoutNextStep} {st!.withoutNextStep === 1 ? "offener Lead" : "offene Leads"} ohne nächsten Schritt
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="border-t border-[color:var(--border)] px-5 py-2.5 text-xs text-[color:var(--muted)] sm:hidden">
        Betrag: {provLabel}
        {mitBestand ? " inkl. künftigem Bestand (5 Jahre)" : ""}, geschätzt.
      </p>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead className="border-b border-[color:var(--border)] text-left text-xs text-[color:var(--muted)]">
            <tr>
              <th className="px-5 py-2.5">Person</th>
              <th className="px-3 py-2.5 text-right" title="Nur bezahlte Leads">Leads</th>
              <th className="px-3 py-2.5 text-right">Erreicht</th>
              <th className="px-3 py-2.5 text-right">Termine</th>
              <th className="px-3 py-2.5 text-right">Abschlüsse</th>
              <th className="px-3 py-2.5 text-right">Quote</th>
              <th className="px-3 py-2.5 text-right" title="Offene Leads mit Termin, Wiedervorlage oder laufendem Gespräch, Stand jetzt. Ziel 100 %">
                Nächster Schritt
              </th>
              <th className="px-3 py-2.5 text-right" title="Geschätzt aus Sparte und Beitrag, inklusive Empfehlungen und Cross-Selling">
                {provLabel}
              </th>
              <th className={`${mitBestand ? "px-3" : "px-5"} py-2.5 text-right`} title="Laufend pro Jahr aus den Verträgen dieses Zeitraums">
                Bestand pro Jahr
              </th>
              {mitBestand ? (
                <th className="px-5 py-2.5 text-right" title="Provision plus künftige Bestandsprovision dieser Verträge über 5 Jahre (Prognose mit Ihrer Stornoquote)">
                  mit künftigem Bestand
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border)] tabular-nums">
            {list.map(({ key, name, row }) => {
              const r = row ?? empty();
              const st = steps.get(key === "none" ? null : key);
              return (
                <tr key={key}>
                  <td className="px-5 py-2.5 font-medium">{name}</td>
                  <td className="px-3 py-2.5 text-right">{formatNumber(r.leads)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {formatNumber(r.reached)} <span className="text-[color:var(--muted)]">({pct(r.reached, r.leads)})</span>
                  </td>
                  <td className="px-3 py-2.5 text-right">{formatNumber(r.termine)}</td>
                  <td className="px-3 py-2.5 text-right">{formatNumber(r.closed)}</td>
                  <td className="px-3 py-2.5 text-right">{pct(r.closed, r.leads)}</td>
                  <td className={`px-3 py-2.5 text-right ${st?.rate != null && st.rate < NEXT_STEP_WARN_BELOW ? "font-semibold text-rose-600" : ""}`}>
                    {st?.rate != null ? `${Math.round(st.rate * 100)} %` : "keine Angabe"}
                    {st && st.withoutNextStep > 0 ? <span className="block text-xs font-normal text-[color:var(--muted)]">{st.withoutNextStep} ohne</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-right">{formatEUR(r.umsatz)}</td>
                  <td className={`${mitBestand ? "px-3" : "px-5"} py-2.5 text-right`}>{formatEUR(r.bestand)}</td>
                  {mitBestand ? <td className="px-5 py-2.5 text-right">{formatEUR(r.umsatz + r.future)}</td> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
