import { UsersRound } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { formatEUR, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { memberName, teamMembers } from "@/lib/team";

// Auswertung je Team-Mitglied (nur Inhaber, nur wenn es ein Team gibt).
export async function TeamStats({ customerId, range }: { customerId: string; range: { from: Date; to: Date } }) {
  const members = await teamMembers(customerId);
  if (members.length < 2) return null;
  const leads = await prisma.lead.findMany({
    where: { customerId, createdAt: { gte: range.from, lte: range.to } },
    select: {
      assignedUserId: true,
      status: true,
      reached: true,
      closeValue: true,
      _count: { select: { appointments: true } },
    },
  });
  type Row = { leads: number; reached: number; termine: number; closed: number; umsatz: number };
  const rows = new Map<string | null, Row>();
  for (const l of leads) {
    if (l.status?.toLowerCase().startsWith("storno")) continue;
    const r = rows.get(l.assignedUserId) ?? { leads: 0, reached: 0, termine: 0, closed: 0, umsatz: 0 };
    r.leads++;
    if (l.reached) r.reached++;
    if (l._count.appointments > 0) r.termine++;
    if (l.status?.toLowerCase() === "abschluss") {
      r.closed++;
      r.umsatz += Number(l.closeValue ?? 0) || 0;
    }
    rows.set(l.assignedUserId, r);
  }
  const list = [
    ...members.map((m) => ({ key: m.id, name: memberName(m), row: rows.get(m.id) })),
    ...(rows.get(null) ? [{ key: "none", name: "Nicht zugeteilt", row: rows.get(null) }] : []),
  ];
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "-");

  return (
    <Card className="mt-6">
      <CardHeader title="Team im Zeitraum" icon={UsersRound} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[color:var(--border)] text-left text-xs text-[color:var(--muted)]">
            <tr>
              <th className="px-5 py-2.5">Person</th>
              <th className="px-3 py-2.5 text-right">Leads</th>
              <th className="px-3 py-2.5 text-right">Erreicht</th>
              <th className="px-3 py-2.5 text-right">Termine</th>
              <th className="px-3 py-2.5 text-right">Abschlüsse</th>
              <th className="px-3 py-2.5 text-right">Quote</th>
              <th className="px-5 py-2.5 text-right">Umsatz</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--border)] tabular-nums">
            {list.map(({ key, name, row }) => {
              const r = row ?? { leads: 0, reached: 0, termine: 0, closed: 0, umsatz: 0 };
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
                  <td className="px-5 py-2.5 text-right">{formatEUR(r.umsatz)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
