"use server";

// Termin verschieben/absagen im Kundenbereich (Dialog „Verschieben“). Gleicher
// Ablauf wie beim Lead über /book/manage (lib/calendar/manage), Berechtigung
// über die Termin-ID: eigener Kunde, Berater nur eigene Termine, Admin-Vorschau
// nur lesend.

import { revalidatePath } from "next/cache";
import { SlotBusyError, type Slot } from "@/lib/calendar";
import {
  cancelOpenAppointment,
  isOpenAppointment,
  manageAppointmentSelect,
  rescheduleDurationMin,
  rescheduleOpenAppointment,
  rescheduleSlots,
} from "@/lib/calendar/manage";
import { getBuyerContext, type BuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { appointmentScope } from "@/lib/team";
import { recordUsage } from "@/lib/usage";

export type RescheduleDialogData = {
  id: string;
  startsAt: string;
  mode: "phone" | "video";
  durationMin: number;
  name: string | null;
  /** false = Admin-Vorschau: nur ansehen. */
  canEdit: boolean;
  /** Wie der Kontakt von der Änderung erfährt (WhatsApp nur beim Verschieben). */
  notify: { whatsapp: boolean; email: boolean };
  slots: Slot[];
  /** Freie Zeiten konnten nicht geladen werden (z. B. Kalender getrennt). */
  slotsError: boolean;
};

export type RescheduleLoadResult = { ok: true; data: RescheduleDialogData } | { ok: false; error: string };
export type AppointmentChangeResult =
  | { ok: true; start?: string }
  | { ok: false; error: string; code?: "taken" | "closed" | "preview" | "notfound" | "error" };

const ERR = {
  notfound: "Termin nicht gefunden.",
  closed: "Dieser Termin ist schon vorbei oder wurde abgesagt.",
  preview: "In der Vorschau sind Änderungen deaktiviert.",
  slot: "Bitte wählen Sie eine neue Uhrzeit.",
  taken: "Diese Uhrzeit ist gerade vergeben worden. Bitte wählen Sie eine andere.",
  error: "Das hat leider nicht geklappt. Bitte versuchen Sie es erneut.",
} as const;

/** Freie Zeiten für das Blättern im Dialog (ganze zwei Wochen, nicht nur die ersten). */
const DIALOG_SLOTS = 300;
const DIALOG_DAYS = 14;

/** Termin NUR im Sichtbereich des Logins laden (Kunde, Berater: eigene Termine). */
async function loadOwn(ctx: BuyerContext, appointmentId: string) {
  // Server-Aktionen sind direkt aufrufbar: Eingaben nicht blind vertrauen.
  if (typeof appointmentId !== "string" || !appointmentId) return null;
  return prisma.appointment.findFirst({
    where: { id: appointmentId, ...appointmentScope(ctx) },
    select: { ...manageAppointmentSelect, lead: { select: { name: true } } },
  });
}

type Denied = Extract<AppointmentChangeResult, { ok: false }>;
const deny = (code: "notfound" | "preview" | "closed"): { denied: Denied } => ({ denied: { ok: false, error: ERR[code], code } });

/** Schreibzugriff: echter Login (keine Vorschau), Termin im eigenen Sichtbereich, offen und künftig. */
async function writable(appointmentId: string) {
  const ctx = await getBuyerContext();
  if (!ctx) return deny("notfound");
  if (ctx.preview || !ctx.userId) return deny("preview");
  const appt = await loadOwn(ctx, appointmentId);
  if (!appt) return deny("notfound");
  if (!isOpenAppointment(appt)) return deny("closed");
  return { userId: ctx.userId, appt };
}

/** Daten für den Dialog: aktueller Termin und freie Zeiten (auch in der Vorschau). */
export async function loadRescheduleDialog(appointmentId: string): Promise<RescheduleLoadResult> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: ERR.notfound };
  const appt = await loadOwn(ctx, appointmentId);
  if (!appt) return { ok: false, error: ERR.notfound };
  if (!isOpenAppointment(appt)) return { ok: false, error: ERR.closed };
  const conv = appt.conversationId
    ? await prisma.conversation.findUnique({
        where: { id: appt.conversationId },
        select: { contactName: true, contactEmail: true },
      })
    : null;
  let slots: Slot[] = [];
  let slotsError = false;
  try {
    // Die bisherige Uhrzeit selbst ist keine neue Zeit.
    const current = appt.startsAt.toISOString();
    slots = (await rescheduleSlots(appt, DIALOG_SLOTS, DIALOG_DAYS)).filter((s) => s.start !== current);
  } catch (err) {
    console.error("[buyer reschedule] slots", err);
    slotsError = true;
  }
  return {
    ok: true,
    data: {
      id: appt.id,
      startsAt: appt.startsAt.toISOString(),
      mode: appt.mode === "video" ? "video" : "phone",
      durationMin: await rescheduleDurationMin(appt),
      name: appt.lead?.name?.trim() || conv?.contactName?.trim() || null,
      canEdit: !ctx.preview && !!ctx.userId,
      notify: { whatsapp: !!conv, email: !!conv?.contactEmail?.trim() },
      slots,
      slotsError,
    },
  };
}

/** Auf eine neue Zeit verschieben; der Kontakt wird wie beim Lead-Link benachrichtigt. */
export async function rescheduleAppointmentBuyerAction(appointmentId: string, start: string): Promise<AppointmentChangeResult> {
  const w = await writable(appointmentId);
  if ("denied" in w) return w.denied;
  if (typeof start !== "string" || !start || Number.isNaN(new Date(start).getTime())) return { ok: false, error: ERR.slot, code: "error" };
  try {
    const res = await rescheduleOpenAppointment(w.appt, start, { by: "team", userId: w.userId }, "kundenbereich");
    await recordUsage("action", "appointment.reschedule");
    revalidatePath("/buyer", "layout");
    return { ok: true, start: res.start };
  } catch (err) {
    if (err instanceof SlotBusyError) return { ok: false, error: ERR.taken, code: "taken" };
    console.error("[buyer reschedule]", err);
    return { ok: false, error: ERR.error, code: "error" };
  }
}

/** Termin absagen (Kalendereintrag wird gelöscht, der Kontakt bekommt eine Absage). */
export async function cancelAppointmentBuyerAction(appointmentId: string): Promise<AppointmentChangeResult> {
  const w = await writable(appointmentId);
  if ("denied" in w) return w.denied;
  try {
    await cancelOpenAppointment(w.appt, { by: "team", userId: w.userId }, "kundenbereich");
    await recordUsage("action", "appointment.cancel");
    revalidatePath("/buyer", "layout");
    return { ok: true };
  } catch (err) {
    console.error("[buyer cancel appointment]", err);
    return { ok: false, error: ERR.error, code: "error" };
  }
}
