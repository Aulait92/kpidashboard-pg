import { UsersRound } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { formatEUR, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { contractProvision } from "@/lib/provision";
import { loadErtragData } from "@/lib/ertrag";
import { leadOrigin, LEAD_ORIGIN_SELECT } from "@/lib/lead-herkunft";
import { memberName, teamMembers } from "@/lib/team";

// Auswertung je Team-Mitglied (nur Inhaber, nur wenn es ein Team gibt). Gleiche Logik wie die Karten
// (Ole, 14.11.2026): Leads und Quoten nur aus bezahlten Leads, Provision über alle Verträge
// (Empfehlungen, Cross-Selling) mit der Rate ihrer Sparte.
export async function TeamStats({ customerId, range }: { customerId: string; range: { from: Date; to: Date } }) {
  const members = await teamMembers(customerId);
  if (members.length < 2) return null;
  const [data, leads] = await Promise.all([
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
  ]);
  type Row = { leads: number; reached: number; termine: number; closed: number; umsatz: number; bestand: number };
  const empty = (): Row => ({ leads: 0, reached: 0, termine: 0, closed: 0, umsatz: 0, bestand: 0 });
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
    if (c.periodAt < range.from || c.periodAt > range.to) continue;
    const p = contractProvision(c, data.rates);
    const r = rows.get(c.assignedUserId) ?? empty();
    r.umsatz += p.firstYear;
    r.bestand += p.trailPerYear;
    rows.set(c.assignedUserId, r);
  }
  const list = [
    ...members.map((m) => ({ key: m.id, name: memberName(m), row: rows.get(m.id) })),
    ...(rows.get(null) ? [{ key: "none", name: "Nicht zugeteilt", row: rows.get(null) }] : []),
  ];
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "keine Angabe");
  const makler = data.typ === "makler";

  return (
    <Card className="mt-6">
      <CardHeader title="Team im Zeitraum" icon={UsersRound} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[color:var(--border)] text-left text-xs text-[color:var(--muted)]">
            <tr>
              <th className="px-5 py-2.5">Person</th>
              <th className="px-3 py-2.5 text-right" title="Nur bezahlte Leads">Leads</th>
              <th className="px-3 py-2.5 text-right">Erreicht</th>
              <th className="px-3 py-2.5 text-right">Termine</th>
              <th className="px-3 py-2.5 text-right">Abschlüsse</th>
              <th className="px-3 py-2.5 text-right">Quote</th>
              <th className="px-3 py-2.5 text-right" title="Geschätzt aus Sparte und Beitrag, inklusive Empfehlungen und Cross-Selling">
                {makler ? "Courtage 1. Jahr" : "Abschlussprovision"}
              </th>
              <th className="px-5 py-2.5 text-right" title="Laufend pro Jahr aus den Verträgen dieses Zeitraums">
                Bestand pro Jahr
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border)] tabular-nums">
            {list.map(({ key, name, row }) => {
              const r = row ?? empty();
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
                  <td className="px-3 py-2.5 text-right">{formatEUR(r.umsatz)}</td>
                  <td className="px-5 py-2.5 text-right">{formatEUR(r.bestand)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
