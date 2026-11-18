import { Card, CardHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { nowMs } from "@/lib/now";
import { NOCH_KEINE_DATEN } from "@/lib/platzhalter";

const TAG = 24 * 60 * 60 * 1000;
const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function Kachel({ label, wert, hinweis }: { label: string; wert: string; hinweis?: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 shadow-[var(--shadow-sm)]">
      <div className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{wert}</div>
      {hinweis ? <div className="truncate text-xs text-[color:var(--muted)]">{hinweis}</div> : null}
    </div>
  );
}

/** Kundenakte › Übersicht: Leads, Termine, Abschlüsse und Kosten je Termin der letzten 30 Tage. */
export async function Kennzahlen({ customerId }: { customerId: string }) {
  const seit = new Date(nowMs() - 30 * TAG);
  const [leads, termine, abschluesse, kosten] = await Promise.all([
    prisma.lead.count({ where: { customerId, createdAt: { gte: seit } } }),
    prisma.appointment.count({ where: { customerId, createdAt: { gte: seit }, status: { not: "cancelled" } } }),
    prisma.lead.count({ where: { customerId, closedAt: { gte: seit } } }),
    prisma.lead.aggregate({ where: { customerId, createdAt: { gte: seit } }, _sum: { acquisitionCost: true } }),
  ]);
  const summe = Number(kosten._sum.acquisitionCost ?? 0);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kachel label="Leads (30 Tage)" wert={leads.toLocaleString("de-DE")} />
      <Kachel label="Termine (30 Tage)" wert={termine.toLocaleString("de-DE")} hinweis={leads ? `${Math.round((termine / leads) * 100)} % der Leads` : undefined} />
      <Kachel label="Abschlüsse (30 Tage)" wert={abschluesse.toLocaleString("de-DE")} />
      <Kachel label="Kosten je Termin (30 Tage)" wert={termine && summe ? eur(summe / termine) : NOCH_KEINE_DATEN} hinweis={summe ? `${eur(summe)} Leadkosten` : undefined} />
    </div>
  );
}

/** Leads je Tag (30 Tage) als schlichte Balken; ohne Leads keine Karte. */
export async function LeadsJeTag({ customerId }: { customerId: string }) {
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const start = new Date(heute.getTime() - 29 * TAG);
  const leads = await prisma.lead.findMany({ where: { customerId, createdAt: { gte: start } }, select: { createdAt: true } });
  if (!leads.length) return null;
  const tage = Array.from({ length: 30 }, () => 0);
  for (const l of leads) {
    const i = Math.floor((l.createdAt.getTime() - start.getTime()) / TAG);
    if (i >= 0 && i < 30) tage[i]++;
  }
  const max = Math.max(1, ...tage);
  return (
    <Card>
      <CardHeader title="Leads je Tag" hint="letzte 30 Tage" />
      <div className="flex h-28 items-end gap-[3px] px-5 pb-4 pt-3" role="img" aria-label={`Leads je Tag, höchstens ${max}`}>
        {tage.map((n, i) => (
          <div
            key={i}
            title={`${new Date(start.getTime() + i * TAG).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}: ${n}`}
            className="flex-1 rounded-t-sm bg-[color:var(--brand)] opacity-80"
            style={{ height: `${Math.max(3, (n / max) * 100)}%`, opacity: n ? 0.85 : 0.15 }}
          />
        ))}
      </div>
    </Card>
  );
}
