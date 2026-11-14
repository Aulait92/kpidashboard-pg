// Termin verschieben/absagen: gemeinsamer Ablauf für den Lead (geheimer Link
// /book/manage/<token>) und den Kundenbereich (Dialog „Verschieben“). Wer
// berechtigt ist, prüft der Aufrufer; hier stehen freie Zeiten, Verschieben
// samt Benachrichtigung und Absagen, damit beide Wege gleich arbeiten.

import { bookingDurationMin, cancelAppointment, rescheduleAppointment, suggestSlots, type Slot } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";
import { sendBookingConfirmation } from "@/lib/whatsapp/reminders";

export const manageAppointmentSelect = {
  id: true,
  customerId: true,
  conversationId: true,
  leadId: true,
  status: true,
  startsAt: true,
  endsAt: true,
  mode: true,
} as const;

export type ManageAppointment = {
  id: string;
  customerId: string;
  conversationId: string | null;
  leadId: string | null;
  status: string;
  startsAt: Date;
  endsAt: Date | null;
  mode: string;
};

/** Wer ändert: der Lead selbst oder das Team im Kundenbereich. */
export type ManageActor = { by: "lead" } | { by: "team"; userId: string | null };

/** Nur offene, künftige Termine lassen sich verschieben oder absagen. */
export function isOpenAppointment(appt: { status: string; startsAt: Date }, now = Date.now()): boolean {
  return appt.status === "booked" && appt.startsAt.getTime() > now;
}

/** Dauer beim Verschieben: die des Termins, sonst die eingestellte Termindauer. */
export async function rescheduleDurationMin(appt: Pick<ManageAppointment, "customerId" | "leadId" | "startsAt" | "endsAt">): Promise<number> {
  return appt.endsAt
    ? Math.max(15, Math.round((appt.endsAt.getTime() - appt.startsAt.getTime()) / 60000))
    : bookingDurationMin(appt.customerId, appt.leadId);
}

/**
 * Freie Zeiten zum Verschieben: Lead-Zeiten des zuständigen Kalenders, die
 * dort frei sind (Abwesenheiten und Team berücksichtigt), in der Dauer des
 * Termins.
 */
export async function rescheduleSlots(
  appt: Pick<ManageAppointment, "customerId" | "leadId" | "startsAt" | "endsAt">,
  count = 24,
  days = 14,
): Promise<Slot[]> {
  const durationMin = await rescheduleDurationMin(appt);
  return suggestSlots(appt.customerId, durationMin, count, "lead", days, appt.leadId);
}

async function logInternal(appt: ManageAppointment, actor: ManageActor, kind: string, payload: unknown) {
  if (!appt.conversationId) return;
  await prisma.message
    .create({
      data: {
        conversationId: appt.conversationId,
        direction: "internal",
        kind,
        body: JSON.stringify(payload),
        sentBy: actor.by,
        sentByUserId: actor.by === "team" ? actor.userId : null,
      },
    })
    .catch(() => {});
}

/**
 * Verschieben: neuer Termin in gleicher Dauer (Slot wird erneut geprüft,
 * SlotBusyError wenn inzwischen belegt), Kalendereintrag und Mail an den Lead
 * über rescheduleAppointment, dazu die WhatsApp-Bestätigung der neuen Zeit.
 */
export async function rescheduleOpenAppointment(
  appt: ManageAppointment,
  start: string,
  actor: ManageActor,
  via: string,
): Promise<{ appointmentId: string; start: string; manageToken: string | null; mode: string }> {
  const res = await rescheduleAppointment({
    appointmentId: appt.id,
    customerId: appt.customerId,
    start,
    by: actor.by,
  });
  const fresh = await prisma.appointment.findUnique({
    where: { id: res.appointmentId },
    select: { manageToken: true, mode: true },
  });
  await logInternal(appt, actor, "appointment_rescheduled", {
    von: appt.startsAt.toISOString(),
    auf: res.start,
    via,
  });
  // WhatsApp-Bestätigung der neuen Zeit (Fehler blockieren nicht).
  const conv = appt.conversationId
    ? await prisma.conversation.findUnique({
        where: { id: appt.conversationId },
        select: { contactPhone: true, contactName: true },
      })
    : null;
  if (conv) {
    await sendBookingConfirmation({
      customerId: appt.customerId,
      to: conv.contactPhone,
      name: conv.contactName,
      leadId: appt.leadId,
      startsAt: new Date(res.start),
      mode: fresh?.mode ?? "phone",
      meetUrl: res.meetUrl,
      manageUrl: res.manageUrl,
    }).catch((e) => console.error("[manage reschedule confirmation]", e));
  }
  return { appointmentId: res.appointmentId, start: res.start, manageToken: fresh?.manageToken ?? null, mode: fresh?.mode ?? appt.mode };
}

/** Absagen: Kalendereintrag löschen, Lead per Mail informieren, im Chat vermerken. */
export async function cancelOpenAppointment(appt: ManageAppointment, actor: ManageActor, via: string): Promise<void> {
  await cancelAppointment(appt.id, appt.customerId, actor.by);
  await logInternal(appt, actor, "appointment_cancelled", { via });
}
