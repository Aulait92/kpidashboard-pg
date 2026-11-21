// Diagnose „buchungslinks“ (Ole, 21.11.2026: „welcher Scheduling-Link bei Kfz Lohmann?“): öffentliche Buchungsseite je
// Kunde (Kundenname, Kalender-Status, Link). Keine Personendaten, die Links sind ohnehin öffentlich.
import { prisma } from "@/lib/prisma";
import { bookingPageUrl } from "@/lib/public-url";

export async function buchungslinksDiagnose() {
  const rows = await prisma.calendarConnection.findMany({
    where: { bookingSlug: { not: null }, customer: { archived: false } },
    select: { bookingSlug: true, status: true, provider: true, customer: { select: { name: true } } },
  });
  return rows.map((r) => ({ kunde: r.customer.name, kalender: `${r.provider ?? "?"} / ${r.status}`, link: bookingPageUrl(r.bookingSlug!) }));
}
