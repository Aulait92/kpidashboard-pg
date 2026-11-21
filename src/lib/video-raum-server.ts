// Video-Link nachtragen (Ole, 21.11.2026: „bekommen die Leads, die sich heute eintragen, den Link, sobald er morgen
// eingetragen ist?“): Wird der feste Raum gespeichert, bekommen alle künftigen Videotermine des Kunden ohne Link diesen
// Link (Appointment.meetUrl). Erinnerungen (lib/showup) lesen meetUrl, „Link kurz vorher“ und „wartet im Videoraum“
// greifen damit wieder. Beim App-Kalender (Einladung per Mail) geht eine Aktualisierung derselben Einladung mit dem Link raus.

import { prisma } from "@/lib/prisma";

export async function videoRaumNachtragen(customerId: string, url: string | null, now = new Date()): Promise<number> {
  if (!url) return 0;
  const offen = await prisma.appointment.findMany({
    where: { customerId, mode: "video", status: "booked", startsAt: { gt: now }, OR: [{ meetUrl: null }, { meetUrl: "" }] },
    select: { id: true, calendarEventId: true, calendarKey: true, startsAt: true, endsAt: true },
  });
  if (!offen.length) return 0;
  await prisma.appointment.updateMany({ where: { id: { in: offen.map((t) => t.id) } }, data: { meetUrl: url } });
  const { appUpdateEventTime } = await import("@/lib/calendar/app-kalender");
  for (const t of offen) {
    if (t.calendarEventId?.startsWith("app:") && t.endsAt) {
      await appUpdateEventTime(t.calendarKey ?? customerId, t.calendarEventId, t.startsAt, t.endsAt).catch(() => null);
    }
  }
  return offen.length;
}
