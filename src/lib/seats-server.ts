// Platz-Abrechnung „aktive Verkäufer“ (lib/seats.ts): Zählung aus der Datenbank und
// Admin-Aufgabe, wenn eine Änderung nicht automatisch abgerechnet werden kann.
// Kein Import aus billing.ts (billing.ts nutzt diese Datei).

import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { berlinDayStart, countActiveSellers, fmtSeatPrice } from "@/lib/seats";

/** Logins und aktive Verkäufer eines Kunden (heute, Berliner Zeit). */
export async function seatUsage(customerId: string, now = new Date()): Promise<{ logins: number; active: number }> {
  const members = await prisma.user.findMany({ where: { customerId, role: "BUYER" }, select: { receivesLeads: true, leadReceivedAt: true } });
  return { logins: members.length, active: countActiveSellers(members, berlinDayStart(now)) };
}

/** Lead-Zuweisung merken: zählt heute als aktiver Verkäufer. */
export async function markLeadReceived(userId: string, now = new Date()): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { leadReceivedAt: now } }).catch((err) => reportError(err, "seat-lead-received"));
}

export const MANUAL_SEAT_TASK = "Platz von Hand abrechnen";

/**
 * Sichtbare Admin-Aufgabe (Heute → Aufgaben), wenn die Platz-Menge nicht automatisch ins
 * Abo kann (kein Stripe-Kunde, kein laufendes oder geplantes Abo, Startpreis-Phase).
 * Keine Duplikate: eine offene Aufgabe je Kunde wird auf den neuen Stand gebracht; eine
 * schon erledigte Aufgabe mit genau diesem Stand (letzte 90 Tage) wird nicht neu angelegt.
 */
export async function manualSeatTask(
  customerId: string,
  o: { from: number; to: number; price: number; reason: string },
  now = new Date(),
): Promise<"created" | "updated" | "skipped"> {
  try {
    const c = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { name: true, salesContact: { select: { id: true } }, onboarding: { select: { salesContactId: true } } },
    });
    if (!c) return "skipped";
    const contactId = c.salesContact?.id ?? c.onboarding?.salesContactId ?? null;
    const prefix = `${MANUAL_SEAT_TASK}: ${c.name}`;
    const title = `${prefix} (${o.to} ${o.to === 1 ? "weiterer Verkäufer" : "weitere Verkäufer"})`;
    const note = [
      `Weitere aktive Verkäufer über den inklusiven: bisher ${o.from}, jetzt ${o.to} (je ${fmtSeatPrice(o.price)} im Monat, tagesgenau).`,
      `Automatisch nicht möglich: ${o.reason}`,
      `Kunden-ID ${customerId} · Kundenakte → Abrechnung: /admin/kunden/${customerId}/abrechnung`,
    ].join("\n");
    const marker = `Kunden-ID ${customerId}`;
    const open = await prisma.salesTask.findFirst({
      where: { doneAt: null, title: { startsWith: MANUAL_SEAT_TASK }, note: { contains: marker } },
      select: { id: true, title: true },
    });
    if (open) {
      if (open.title === title) return "skipped";
      await prisma.salesTask.update({ where: { id: open.id }, data: { title, note } });
      return "updated";
    }
    const since = new Date(now.getTime() - 90 * 86_400_000);
    const done = await prisma.salesTask.findFirst({ where: { title, note: { contains: marker }, createdAt: { gte: since } }, select: { id: true } });
    if (done) return "skipped";
    await prisma.salesTask.create({ data: { contactId, type: "SONSTIGES", title, note, dueAt: now } });
    const { sendToAdmins } = await import("@/lib/push");
    await sendToAdmins({ title: `${MANUAL_SEAT_TASK}: ${c.name}`, body: `${o.to} weitere aktive Verkäufer. ${o.reason}`, url: `/admin/kunden/${customerId}/abrechnung` }).catch(() => {});
    return "created";
  } catch (err) {
    reportError(err, "seat-manual-task", { customer: customerId });
    return "skipped";
  }
}
