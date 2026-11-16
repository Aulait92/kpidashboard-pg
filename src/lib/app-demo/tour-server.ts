// Ziele des Rundgangs in der App-Demo (components/app-demo-rahmen.tsx): ein Chat mit Terminbuchung und der Termin
// für Terminvorbereitung und Präsentation. Liest nur (in Demo-Anfragen aus der Demo-Datenbank, src/lib/prisma.ts).

import { prisma } from "@/lib/prisma";
import type { DemoTourZiele } from "@/components/app-demo-rahmen";

export async function demoTourZiele(customerId: string): Promise<DemoTourZiele> {
  const jetzt = new Date();
  const [chat, termin] = await Promise.all([
    prisma.conversation
      .findFirst({
        where: { customerId, messages: { some: { body: { contains: "ist gebucht" } } }, lead: { appointments: { some: { status: "booked", startsAt: { gt: jetzt } } } } },
        orderBy: { lastMessageAt: "desc" },
        select: { id: true },
      })
      .catch(() => null),
    prisma.appointment
      .findFirst({ where: { customerId, status: "booked", startsAt: { gt: jetzt }, lead: { name: "Dominik Schmid" } }, select: { id: true } })
      .catch(() => null),
  ]);
  return { chat: chat?.id ?? null, termin: termin?.id ?? null };
}
