// Admin → Nutzung: Fragen an die KI-Hilfe (ohne Admin-Vorschau), neueste zuerst.

import { prisma } from "@/lib/prisma";

export type HelpQuestion = { id: string; at: Date; customer: string; question: string; answer: string; rating: "up" | "down" | null };

export async function loadHelpQuestions(days: number, take = 60): Promise<HelpQuestion[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const events = await prisma.usageEvent.findMany({
    where: { type: "help", preview: false, at: { gte: since } },
    orderBy: { at: "desc" },
    take,
    select: { id: true, at: true, customerId: true, meta: true },
  });
  const names = new Map(
    (await prisma.customer.findMany({ where: { id: { in: [...new Set(events.map((e) => e.customerId))] } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]),
  );
  return events.map((e) => {
    const m = (e.meta ?? {}) as { question?: string; answer?: string; rating?: "up" | "down" };
    return { id: e.id, at: e.at, customer: names.get(e.customerId) ?? "Kunde", question: m.question ?? "", answer: m.answer ?? "", rating: m.rating ?? null };
  });
}
