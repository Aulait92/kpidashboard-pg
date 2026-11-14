// Trust-Fakten für LinkedIn-Posts (Ole, 14.11.2026): echte, zusammengefasste Zahlen aus der
// Software (ohne Kundennamen) plus Oles eigenes Trust-Material. Nur das darf als Beleg in Posts.

import { prisma } from "@/lib/prisma";
import { npsOf } from "@/lib/nps";
import { median } from "@/lib/linkedin/posts";

const DAY = 86_400_000;
const REAL_LEAD = { customer: { plan: { not: "internal" } }, NOT: { bezugAirtableId: "demo" } };

const fmtMin = (min: number) => (min < 1 ? "unter 1 Minute" : min < 60 ? `${Math.round(min)} Minuten` : `${Math.round(min / 60)} Stunden`);

export async function loadTrustFacts(now = new Date()): Promise<string[]> {
  const since = new Date(now.getTime() - 30 * DAY);
  const [leads, contacted, booked, feedback, updates, customers] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: since }, ...REAL_LEAD } }),
    prisma.lead.findMany({ where: { createdAt: { gte: since }, firstContactAt: { not: null }, ...REAL_LEAD }, select: { createdAt: true, firstContactAt: true }, take: 5000 }),
    prisma.appointment.count({ where: { createdAt: { gte: since }, status: { not: "cancelled" }, customer: { plan: { not: "internal" } } } }),
    prisma.customerFeedback.findMany({
      where: { kind: { not: "day7" }, answeredAt: { gte: new Date(now.getTime() - 365 * DAY) }, score: { not: null }, customer: { plan: { not: "internal" } } },
      select: { score: true },
    }),
    prisma.productUpdate.findMany({ where: { publishedAt: { gte: since, lte: now } }, orderBy: { publishedAt: "desc" }, take: 8, select: { title: true } }),
    prisma.customer.count({ where: { archived: false, plan: { not: "internal" }, users: { some: { role: "BUYER" } } } }),
  ]);
  const facts: string[] = [];
  if (leads) facts.push(`Leads für Vermittler in den letzten 30 Tagen: ${leads}`);
  const mins = contacted.map((l) => (l.firstContactAt!.getTime() - l.createdAt.getTime()) / 60_000).filter((m) => m >= 0);
  const med = median(mins.map((m) => Math.round(m * 10) / 10));
  if (med != null && mins.length >= 5) facts.push(`So schnell schreibt der WhatsApp-Assistent neue Leads an (Median, letzte 30 Tage): ${fmtMin(med)}`);
  if (booked) facts.push(`Termine in den letzten 30 Tagen gebucht: ${booked}`);
  const nps = npsOf(feedback.map((f) => f.score!));
  if (nps && nps.total >= 3) facts.push(`Weiterempfehlungs-Wert (NPS) unserer Kunden, letzte 12 Monate: ${nps.nps} (${nps.total} Antworten)`);
  if (customers) facts.push(`Aktive Kunden (Vermittler mit Zugang): ${customers}`);
  if (updates.length) facts.push(`Neu in der Software (letzte 30 Tage): ${updates.map((u) => u.title).join("; ")}`);
  return facts;
}
