// Weiterempfehlung (NPS) der letzten 12 Monate: Wert, Verteilung und die letzten Antworten.

import { HeartHandshake } from "lucide-react";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { nowMs } from "@/lib/now";
import { formatDateTime } from "@/lib/format";
import { kindLabel, npsOf, NPS_DETRACTOR_MAX, NPS_PROMOTER } from "@/lib/nps";

export async function NpsCard() {
  const since = new Date(nowMs() - 365 * 24 * 60 * 60 * 1000);
  const rows = await prisma.customerFeedback.findMany({
    where: { kind: { not: "day7" }, answeredAt: { gte: since }, score: { not: null }, customer: { plan: { not: "internal" } } },
    orderBy: { answeredAt: "desc" },
    select: { id: true, kind: true, score: true, comment: true, answeredAt: true, customer: { select: { id: true, name: true } } },
  });
  const sent = await prisma.customerFeedback.count({ where: { kind: { not: "day7" }, sentAt: { gte: since } } });
  const r = npsOf(rows.map((x) => x.score!));
  return (
    <Card className="mb-6" data-nps-card>
      <CardHeader
        title="Weiterempfehlung (NPS)"
        icon={HeartHandshake}
        actions={<span className="text-xs text-[color:var(--muted)]">letzte 12 Monate · {rows.length} von {sent} beantwortet</span>}
      />
      {!r ? (
        <EmptyState icon={HeartHandshake} title="Noch keine Antworten" text="Kunden werden nach 30 Tagen und danach alle 90 Tage gefragt, ob sie uns weiterempfehlen würden (0–10)." />
      ) : (
        <div className="p-5">
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <div className={`text-4xl font-bold tabular-nums ${r.nps >= 30 ? "text-emerald-700" : r.nps < 0 ? "text-rose-700" : ""}`}>
                {r.nps > 0 ? `+${r.nps}` : r.nps}
              </div>
              <div className="text-xs text-[color:var(--muted)]">NPS (−100 bis +100)</div>
            </div>
            <div className="text-sm">
              <span className="font-semibold text-emerald-700">{r.promoters}</span> Promotoren ({NPS_PROMOTER}–10) ·{" "}
              <span className="font-semibold">{r.passives}</span> Neutrale ·{" "}
              <span className="font-semibold text-rose-700">{r.detractors}</span> Kritiker (0–{NPS_DETRACTOR_MAX})
            </div>
          </div>
          <ul className="mt-4 divide-y divide-[color:var(--border)] rounded-[var(--radius-md)] border border-[color:var(--border)]">
            {rows.slice(0, 15).map((x) => (
              <li key={x.id} className="flex gap-3 px-4 py-2.5 text-sm">
                <b
                  className={`w-10 shrink-0 tabular-nums ${x.score! >= NPS_PROMOTER ? "text-emerald-700" : x.score! <= NPS_DETRACTOR_MAX ? "text-rose-700" : ""}`}
                >
                  {x.score}/10
                </b>
                <div className="min-w-0 flex-1">
                  <a href={`/admin/kunden/${x.customer.id}`} className="font-medium hover:underline">
                    {x.customer.name}
                  </a>
                  <span className="text-[color:var(--muted)]"> · {kindLabel(x.kind)} · {formatDateTime(x.answeredAt!)}</span>
                  {x.comment ? <p className="mt-0.5 text-[color:var(--muted)]">„{x.comment}“</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
