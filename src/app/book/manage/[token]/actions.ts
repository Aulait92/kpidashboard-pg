"use server";

import { redirect } from "next/navigation";
import { SlotBusyError } from "@/lib/calendar";
import {
  cancelOpenAppointment,
  isOpenAppointment,
  manageAppointmentSelect,
  rescheduleOpenAppointment,
} from "@/lib/calendar/manage";
import { prisma } from "@/lib/prisma";
import { checkLimit, requestIp } from "@/lib/rate-limit";

// Lead verwaltet seinen Termin selbst über den geheimen Link. Der Token ist
// die einzige Berechtigung (144 Bit, nicht erratbar) — nur offene, künftige
// Termine sind änderbar.

async function loadOpen(token: string) {
  const appt = await prisma.appointment.findUnique({
    where: { manageToken: token },
    select: manageAppointmentSelect,
  });
  if (!appt || !isOpenAppointment(appt)) return null;
  return appt;
}

export async function cancelManageAction(token: string): Promise<void> {
  if (!checkLimit("publicBooking", await requestIp()).ok) redirect(`/book/manage/${token}?err=busy`);
  const appt = await loadOpen(token);
  if (!appt) redirect(`/book/manage/${token}`);
  try {
    await cancelOpenAppointment(appt, { by: "lead" }, "manage_link");
  } catch (err) {
    console.error("[manage cancel]", err);
    redirect(`/book/manage/${token}?err=error`);
  }
  redirect(`/book/manage/${token}?done=cancelled`);
}

export async function rescheduleManageAction(token: string, formData: FormData): Promise<void> {
  if (!checkLimit("publicBooking", await requestIp()).ok) redirect(`/book/manage/${token}?err=busy`);
  const start = String(formData.get("start") ?? "");
  const appt = await loadOpen(token);
  if (!appt) redirect(`/book/manage/${token}`);
  if (!start || Number.isNaN(new Date(start).getTime())) {
    redirect(`/book/manage/${token}?err=slot`);
  }

  let newToken: string | null = null;
  try {
    const res = await rescheduleOpenAppointment(appt, start, { by: "lead" }, "manage_link");
    newToken = res.manageToken;
  } catch (err) {
    if (err instanceof SlotBusyError) redirect(`/book/manage/${token}?err=taken`);
    console.error("[manage reschedule]", err);
    redirect(`/book/manage/${token}?err=error`);
  }
  redirect(`/book/manage/${newToken ?? token}?done=rescheduled`);
}
