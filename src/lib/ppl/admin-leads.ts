// Admin → Pay-per-Lead → „Gelieferte Leads“: Suche über die von der App
// ausgelieferten Leads (Lead mit Bezug), z. B. um einen Storno von Heinrich
// von Kleist (kein Login, Lieferung per Mail) von Hand einzutragen.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { stornoWindowOpen } from "@/lib/ppl/storno";

/** Suchbedingung aus Name, Telefon (auch Teil, mit 0 oder +49), E-Mail oder Lead-ID. */
export function leadSearchWhere(q: string): Prisma.LeadWhereInput | null {
  const t = q.trim();
  if (!t) return null;
  const or: Prisma.LeadWhereInput[] = [{ id: t }, { name: { contains: t, mode: "insensitive" } }, { email: { contains: t, mode: "insensitive" } }];
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 5 && /^[\d\s+()/.-]+$/.test(t)) {
    // Gespeichert wird international ohne + (z. B. 4915112345678)
    or.push({ phone: { contains: digits.startsWith("00") ? digits.slice(2) : digits.startsWith("0") ? digits.slice(1) : digits } });
  }
  return { OR: or };
}

export async function searchDeliveredLeads(opts: { q?: string; subscriptionId?: string; take?: number }, now = new Date()) {
  const search = leadSearchWhere(opts.q ?? "");
  const rows = await prisma.lead.findMany({
    where: {
      subscriptionId: opts.subscriptionId ? opts.subscriptionId : { not: null },
      ...(search ?? {}),
    },
    orderBy: { deliveredAt: { sort: "desc", nulls: "last" } },
    take: opts.take ?? 50,
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      source: true,
      status: true,
      deliveredAt: true,
      stornoState: true,
      stornoReason: true,
      stornoNote: true,
      creditAmount: true,
      creditedAt: true,
      customer: { select: { name: true } },
      subscription: { select: { id: true, label: true, productKey: true, stornoDays: true, stornoReasons: true } },
      revenues: { select: { amount: true, cancelled: true }, take: 1 },
    },
  });
  return rows.map((r) => ({ ...r, outsideWindow: !stornoWindowOpen(r.deliveredAt, r.subscription?.stornoDays ?? null, now) }));
}

export type DeliveredLeadRow = Awaited<ReturnType<typeof searchDeliveredLeads>>[number];
