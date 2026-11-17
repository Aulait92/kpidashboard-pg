// Erscheinensquote laden (lib/erscheinensquote.ts): vergangene Termine der letzten `tage` Tage, ohne Testkunden.

import { prisma } from "@/lib/prisma";
import { erscheinensquote, type Erscheinensquote } from "@/lib/erscheinensquote";

export async function loadErscheinensquote(opts: { customerId?: string | null; tage?: number; now?: Date } = {}): Promise<Erscheinensquote & { seit: string; bis: string }> {
  const now = opts.now ?? new Date();
  const tage = Math.min(Math.max(opts.tage ?? 90, 1), 730);
  const seit = new Date(now.getTime() - tage * 24 * 60 * 60 * 1000);
  const rows = await prisma.appointment.findMany({
    where: {
      startsAt: { gte: seit, lte: now },
      status: { in: ["booked", "completed", "no_show"] },
      ...(opts.customerId ? { customerId: opts.customerId } : { customer: { isTest: false } }),
    },
    select: { startsAt: true, createdAt: true, status: true, attendance: true, lead: { select: { source: true } } },
    take: 20000,
  });
  const q = erscheinensquote(rows.map((r) => ({ startsAt: r.startsAt, createdAt: r.createdAt, status: r.status, attendance: r.attendance, source: r.lead?.source ?? null })));
  return { ...q, seit: seit.toISOString(), bis: now.toISOString() };
}
