"use server";

// Termin verschieben/absagen aus dem Admin-Chat (Seitenleiste, Dialog
// „Verschieben“). Gleicher Ablauf wie im Kundenbereich (lib/calendar/manage),
// nur die Berechtigung ist anders: nur Admins, dafür jeder Kunde.

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { SlotBusyError } from "@/lib/calendar";
import {
  cancelOpenAppointment,
  isOpenAppointment,
  manageAppointmentSelect,
  rescheduleDialogData,
  rescheduleOpenAppointment,
  type AppointmentChangeResult,
  type RescheduleLoadResult,
} from "@/lib/calendar/manage";
import { prisma } from "@/lib/prisma";

const ERR = {
  notfound: "Termin nicht gefunden.",
  closed: "Dieser Termin ist schon vorbei oder wurde abgesagt.",
  slot: "Bitte wählen Sie eine neue Uhrzeit.",
  taken: "Diese Uhrzeit ist gerade vergeben worden. Bitte wählen Sie eine andere.",
  error: "Das hat leider nicht geklappt. Bitte versuchen Sie es erneut.",
} as const;

/** Nur Admins; Termin per ID (Admins sehen alle Kunden). */
async function loadForAdmin(appointmentId: unknown) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return null;
  // Server-Aktionen sind direkt aufrufbar: Eingaben nicht blind vertrauen.
  if (typeof appointmentId !== "string" || !appointmentId) return null;
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { ...manageAppointmentSelect, lead: { select: { name: true } } },
  });
  return appt ? { userId: session.userId, appt } : null;
}

export async function loadRescheduleDialogAdmin(appointmentId: string): Promise<RescheduleLoadResult> {
  const r = await loadForAdmin(appointmentId);
  if (!r) return { ok: false, error: ERR.notfound };
  if (!isOpenAppointment(r.appt)) return { ok: false, error: ERR.closed };
  return { ok: true, data: await rescheduleDialogData(r.appt, true, "admin reschedule") };
}

export async function rescheduleAppointmentAdminAction(appointmentId: string, start: string): Promise<AppointmentChangeResult> {
  const r = await loadForAdmin(appointmentId);
  if (!r) return { ok: false, error: ERR.notfound, code: "notfound" };
  if (!isOpenAppointment(r.appt)) return { ok: false, error: ERR.closed, code: "closed" };
  if (typeof start !== "string" || !start || Number.isNaN(new Date(start).getTime())) return { ok: false, error: ERR.slot, code: "error" };
  try {
    const res = await rescheduleOpenAppointment(r.appt, start, { by: "team", userId: r.userId }, "admin");
    revalidatePath("/admin/whatsapp");
    revalidatePath("/admin/neu", "layout");
    return { ok: true, start: res.start };
  } catch (err) {
    if (err instanceof SlotBusyError) return { ok: false, error: ERR.taken, code: "taken" };
    console.error("[admin reschedule]", err);
    return { ok: false, error: ERR.error, code: "error" };
  }
}

export async function cancelAppointmentAdminAction(appointmentId: string): Promise<AppointmentChangeResult> {
  const r = await loadForAdmin(appointmentId);
  if (!r) return { ok: false, error: ERR.notfound, code: "notfound" };
  if (!isOpenAppointment(r.appt)) return { ok: false, error: ERR.closed, code: "closed" };
  try {
    await cancelOpenAppointment(r.appt, { by: "team", userId: r.userId }, "admin");
    revalidatePath("/admin/whatsapp");
    revalidatePath("/admin/neu", "layout");
    return { ok: true };
  } catch (err) {
    console.error("[admin cancel appointment]", err);
    return { ok: false, error: ERR.error, code: "error" };
  }
}
