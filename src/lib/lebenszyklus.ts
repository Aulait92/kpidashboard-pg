// Admin → Zahlen → „Kündigung & Rückkehr“ (Ole, 15.11.2026): lädt Lebenszyklus und Umsatzbuch und rechnet mit
// lib/lebenszyklus-kpi.ts. Testkunden und interne Kunden zählen nicht.

import { prisma } from "@/lib/prisma";
import { loadLedger } from "@/lib/zahlen";
import { mrrMovement, type Bridge } from "@/lib/revenue-ledger";
import { churnReasonLabel, isHalteKind } from "@/lib/anti-churn";
import { HALTE_LABEL, halteStats, type HalteGroup, type HalteStats } from "@/lib/halteangebote";
import {
  dormancyStats,
  lifecycleMonths,
  reactivationByCancelMonth,
  reasonsComeback,
  type DormancyStats,
  type LcEvent,
  type LcMonth,
  type ReactivationRateRow,
} from "@/lib/lebenszyklus-kpi";

export type LebenszyklusData = {
  current: string;
  months: LcMonth[];
  movement: Bridge[];
  stats: DormancyStats;
  byCancelMonth: ReactivationRateRow[];
  reasons: { label: string; cancelled: number; reactivated: number; rate: number | null }[];
  dormant: { customerId: string; name: string; since: string; deleteAfter: string | null; retention: string | null; mrr: number | null; reason: string }[];
  reactivations: { customerId: string; name: string; at: string; mrr: number | null; dormantDays: number | null; reason: string }[];
  /** Halteangebote (lib/halteangebote.ts): angenommen je Grund und Angebot, geretteter Monatsbetrag, später gekündigt */
  halte: Omit<HalteStats, "byReason" | "byKind"> & { byReason: (HalteGroup & { label: string })[]; byKind: (HalteGroup & { label: string })[] };
  /** Rückkehrangebot 30 Tage nach Vertragsende: verschickt, danach reaktiviert */
  winback: { sent: number; reactivated: number };
};

const MONTHS = 12;

export async function loadLebenszyklus(now = new Date()): Promise<LebenszyklusData> {
  const [{ ledger }, rows] = await Promise.all([
    loadLedger(now),
    prisma.customerLifecycleEvent.findMany({
      where: { customer: { isTest: false, plan: { not: "internal" } } },
      orderBy: { at: "asc" },
      select: { customerId: true, kind: true, at: true, mrr: true, churnReason: true, details: true, customer: { select: { name: true } } },
    }),
  ]);
  const events: LcEvent[] = rows.map((r) => ({ customerId: r.customerId, kind: r.kind, at: r.at, mrr: r.mrr == null ? null : Number(r.mrr), churnReason: r.churnReason }));
  const keys = ledger.months.map((m) => m.key).slice(-(MONTHS + 1));
  const months = lifecycleMonths(events, ledger.rows, keys.slice(1)).reverse();
  const movement = mrrMovement(ledger.rows, keys).reverse();

  const dormantRows = await prisma.customer.findMany({
    where: { dormantSince: { not: null }, dataDeletedAt: null, isTest: false, plan: { not: "internal" } },
    orderBy: { deleteAfter: "asc" },
    select: { id: true, name: true, dormantSince: true, deleteAfter: true, retentionChoice: true },
  });
  const [offerRows, winbackSent] = await Promise.all([
    prisma.retentionOffer.findMany({
      where: { customer: { isTest: false, plan: { not: "internal" } } },
      select: { reason: true, kind: true, mrrSaved: true, cancelledLaterAt: true, createdAt: true },
    }),
    prisma.customer.count({ where: { winbackOfferAt: { not: null }, isTest: false, plan: { not: "internal" } } }),
  ]);
  const hs = halteStats(offerRows.map((o) => ({ ...o, mrrSaved: o.mrrSaved == null ? null : Number(o.mrrSaved) })));
  const winbackReactivated = rows.filter((r) => r.kind === "reactivated" && (r.details as { winback?: unknown } | null)?.winback === true).length;
  const lastOf = (id: string, kind: string) => [...rows].reverse().find((r) => r.customerId === id && r.kind === kind);
  return {
    current: ledger.current,
    months,
    movement,
    stats: dormancyStats(events, now),
    halte: {
      ...hs,
      byReason: hs.byReason.map((g) => ({ ...g, label: churnReasonLabel(g.key || null) })),
      byKind: hs.byKind.map((g) => ({ ...g, label: isHalteKind(g.key) ? HALTE_LABEL[g.key] : g.key })),
    },
    winback: { sent: winbackSent, reactivated: winbackReactivated },
    byCancelMonth: reactivationByCancelMonth(events).reverse(),
    reasons: reasonsComeback(events).map((r) => ({ label: churnReasonLabel(r.reason), cancelled: r.cancelled, reactivated: r.reactivated, rate: r.rate })),
    dormant: dormantRows.map((c) => {
      const d = lastOf(c.id, "dormant");
      const cancel = lastOf(c.id, "cancelled");
      return {
        customerId: c.id,
        name: c.name,
        since: c.dormantSince!.toISOString(),
        deleteAfter: c.deleteAfter?.toISOString() ?? null,
        retention: c.retentionChoice,
        mrr: d?.mrr == null ? null : Number(d.mrr),
        reason: churnReasonLabel(cancel?.churnReason),
      };
    }),
    reactivations: rows
      .filter((r) => r.kind === "reactivated")
      .reverse()
      .slice(0, 20)
      .map((r) => ({
        customerId: r.customerId,
        name: r.customer.name,
        at: r.at.toISOString(),
        mrr: r.mrr == null ? null : Number(r.mrr),
        dormantDays: typeof (r.details as { dormantDays?: unknown } | null)?.dormantDays === "number" ? (r.details as { dormantDays: number }).dormantDays : null,
        reason: churnReasonLabel(r.churnReason),
      })),
  };
}
