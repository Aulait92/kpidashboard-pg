"use server";

import { redirect } from "next/navigation";
import { cancelAppointment, rescheduleAppointment, SlotBusyError } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";
import { sendBookingConfirmation } from "@/lib/whatsapp/reminders";

// Lead verwaltet seinen Termin selbst über den geheimen Link. Der Token ist
// die einzige Berechtigung (144 Bit, nicht erratbar) — nur offene, künftige
// Termine sind änderbar.

async function loadOpen(token: string) {
  const appt = await prisma.appointment.findUnique({
    where: { manageToken: token },
    select: {
      id: true,
      customerId: true,
      conversationId: true,
      leadId: true,
      status: true,
      startsAt: true,
    },
  });
  if (!appt || appt.status !== "booked" || appt.startsAt.getTime() <= Date.now()) return null;
  return appt;
}

async function logInternal(conversationId: string | null, kind: string, payload: unknown) {
  if (!conversationId) return;
  await prisma.message
    .create({
      data: {
        conversationId,
        direction: "internal",
        kind,
        body: JSON.stringify(payload),
        sentBy: "lead",
      },
    })
    .catch(() => {});
}

export async function cancelManageAction(token: string): Promise<void> {
  const appt = await loadOpen(token);
  if (!appt) redirect(`/book/manage/${token}`);
  try {
    await cancelAppointment(appt.id, appt.customerId, "lead");
    await logInternal(appt.conversationId, "appointment_cancelled", { via: "manage_link" });
  } catch (err) {
    console.error("[manage cancel]", err);
    redirect(`/book/manage/${token}?err=error`);
  }
  redirect(`/book/manage/${token}?done=cancelled`);
}

export async function rescheduleManageAction(token: string, formData: FormData): Promise<void> {
  const start = String(formData.get("start") ?? "");
  const appt = await loadOpen(token);
  if (!appt) redirect(`/book/manage/${token}`);
  if (!start || Number.isNaN(new Date(start).getTime())) {
    redirect(`/book/manage/${token}?err=slot`);
  }

  let newToken: string | null = null;
  try {
    const res = await rescheduleAppointment({
      appointmentId: appt.id,
      customerId: appt.customerId,
      start,
      by: "lead",
    });
    const fresh = await prisma.appointment.findUnique({
      where: { id: res.appointmentId },
      select: { manageToken: true, mode: true },
    });
    newToken = fresh?.manageToken ?? null;
    await logInternal(appt.conversationId, "appointment_rescheduled", {
      von: appt.startsAt.toISOString(),
      auf: res.start,
      via: "manage_link",
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
  } catch (err) {
    if (err instanceof SlotBusyError) redirect(`/book/manage/${token}?err=taken`);
    console.error("[manage reschedule]", err);
    redirect(`/book/manage/${token}?err=error`);
  }
  redirect(`/book/manage/${newToken ?? token}?done=rescheduled`);
}
