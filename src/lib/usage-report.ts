// Auswertung der Nutzungsmessung: Wie aktiv ist jeder Kunde, was nutzt er,
// wo hakt es (Fehler, Feedback) und welche Aufgaben bleiben liegen?
// Genutzt von /admin/nutzung und /api/ops/usage (für die Analyse).

import { prisma } from "@/lib/prisma";
import { getCallbackLeads } from "@/lib/whatsapp/outreach";

const DAY = 24 * 60 * 60 * 1000;

export type CustomerUsage = {
  customerId: string;
  customerName: string;
  activeDays: number;
  lastSeen: string | null;
  pageViews: { name: string; count: number }[];
  actions: { name: string; count: number }[];
  errors: { name: string; count: number }[];
  feedback: { at: string; path: string | null; text: string }[];
  stalled: {
    /** Vergangene Termine ohne Ergebnis (> 24 h) */
    outcomesOpen: number;
    /** Wiedervorlagen überfällig */
    followUpsOverdue: number;
    /** offene Rückrufe (Liste) */
    callbacksOpen: number;
    /** Chats „Braucht dich" länger als 24 h offen */
    attentionOver24h: number;
  };
};

function top(rows: { name: string }[], n = 12) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.name, (m.get(r.name) ?? 0) + 1);
  return [...m.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/** Kunden, die das CRM nutzen (Buyer-Login oder WhatsApp). */
async function relevantCustomers() {
  return prisma.customer.findMany({
    where: {
      OR: [{ users: { some: { role: "BUYER" } } }, { whatsAppAccount: { isNot: null } }],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function computeUsageReport(days = 14): Promise<{ since: string; customers: CustomerUsage[] }> {
  const since = new Date(Date.now() - days * DAY);
  const now = Date.now();
  const customers = await relevantCustomers();
  const out: CustomerUsage[] = [];

  for (const c of customers) {
    const events = await prisma.usageEvent.findMany({
      where: { customerId: c.id, preview: false, at: { gte: since } },
      orderBy: { at: "desc" },
      select: { at: true, type: true, name: true, path: true, meta: true },
    });
    const [outcomesOpen, followUpsOverdue, attentionOver24h, callbacks] = await Promise.all([
      prisma.appointment.count({
        where: { customerId: c.id, status: "booked", startsAt: { lt: new Date(now - DAY), gt: new Date(now - 30 * DAY) } },
      }),
      prisma.lead.count({ where: { customerId: c.id, followUpAt: { lt: new Date(now - DAY) } } }),
      prisma.conversation.count({
        where: { customerId: c.id, needsAttention: true, attentionAt: { lt: new Date(now - DAY) } },
      }),
      getCallbackLeads(c.id).catch(() => []),
    ]);
    const days = new Set(events.map((e) => e.at.toISOString().slice(0, 10)));
    out.push({
      customerId: c.id,
      customerName: c.name,
      activeDays: days.size,
      lastSeen: events[0]?.at.toISOString() ?? null,
      pageViews: top(events.filter((e) => e.type === "page")),
      actions: top(events.filter((e) => e.type === "action")),
      errors: top(events.filter((e) => e.type === "error")),
      feedback: events
        .filter((e) => e.type === "feedback")
        .slice(0, 20)
        .map((e) => ({
          at: e.at.toISOString(),
          path: e.path,
          text: String((e.meta as { text?: string } | null)?.text ?? ""),
        })),
      stalled: { outcomesOpen, followUpsOverdue, callbacksOpen: callbacks.length, attentionOver24h },
    });
  }
  return { since: since.toISOString(), customers: out };
}
