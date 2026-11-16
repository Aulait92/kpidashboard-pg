"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { requireAuth } from "@/lib/vertrieb/auth";
import { updateLeadTimes, type SourceResult } from "@/lib/calendar/sources";
import { berlinAt } from "@/lib/calendar/lead-times";
import {
  BUFFER_CHOICES,
  DURATION_CHOICES,
  NOTICE_CHOICES,
  WINDOW_CHOICES,
  VERTRIEB_CUSTOMER_ID,
  DEFAULT_BOOKING_TYPE,
  adminBookSalesMeeting,
  adminRescheduleSalesMeeting,
  conflictText,
  loadBookingType,
  type AdminResult,
} from "@/lib/vertrieb/buchung";

const PATH = "/admin/vertrieb/buchungsseite";
const pick = <T extends number>(choices: readonly T[], raw: unknown, fallback: T): T => {
  const n = Number(raw);
  return (choices as readonly number[]).includes(n) ? (n as T) : fallback;
};

/** Termintyp: Dauer, Puffer, Vorlauf, Zeitraum (Buchungsfenster), fester Videolink, aktiv. */
export async function saveBookingTypeAction(_prev: SourceResult, fd: FormData): Promise<SourceResult> {
  await requireAuth();
  const t = await prisma.salesBookingType.findUnique({ where: { id: String(fd.get("id") ?? "") } });
  if (!t) return { error: "Termintyp nicht gefunden." };
  const videoUrl = String(fd.get("videoUrl") ?? "").trim();
  if (videoUrl && !/^https:\/\/\S+$/.test(videoUrl)) return { error: "Bitte einen Link mit https:// angeben." };
  await prisma.salesBookingType.update({
    where: { id: t.id },
    data: {
      durationMin: pick(DURATION_CHOICES, fd.get("durationMin"), 45),
      bufferMin: pick(BUFFER_CHOICES, fd.get("bufferMin"), 15),
      noticeMin: pick(NOTICE_CHOICES, fd.get("noticeMin"), 240),
      bookingWindowDays: pick(WINDOW_CHOICES, fd.get("bookingWindowDays"), 7),
      videoUrl: videoUrl || null,
      active: fd.get("active") === "on",
    },
  });
  await audit("vertrieb.buchungsseite", { entity: "SalesBookingType", entityId: t.id });
  revalidatePath(PATH);
  return { ok: true, info: "Gespeichert." };
}

/** Zeiten je Wochentag des Vertriebskalenders (gleiche Logik wie „Mein Kalender“ der Kunden). */
export async function saveSalesTimesAction(_prev: SourceResult, fd: FormData): Promise<SourceResult> {
  await requireAuth();
  const main = await loadBookingType(DEFAULT_BOOKING_TYPE);
  fd.set("duration", String(main?.durationMin ?? 45));
  const res = await updateLeadTimes(VERTRIEB_CUSTOMER_ID, VERTRIEB_CUSTOMER_ID, fd);
  if (res.ok) revalidatePath(PATH);
  return res;
}

/** Kalender trennen (z. B. um auf Outlook zu wechseln). */
export async function disconnectSalesCalendarAction(): Promise<void> {
  await requireAuth();
  await prisma.calendarConnection.updateMany({
    where: { customerId: VERTRIEB_CUSTOMER_ID },
    data: { status: "pending", accessTokenEnc: null, refreshTokenEnc: null, tokenExpiresAt: null, accountEmail: null, calendarId: "primary" },
  });
  await audit("calendar.disconnect", { customerId: VERTRIEB_CUSTOMER_ID, entity: "CalendarConnection" });
  revalidatePath(PATH);
}

// ─── Termin buchen bzw. verschieben aus dem Vertriebskontakt (nur Admins, ohne Buchungsfenster) ───

export type AdminTerminState = { ok?: boolean; error?: string; conflicts?: string[] };

const ADMIN_ERRORS: Record<Exclude<AdminResult, { ok: true }>["error"], string> = {
  not_found: "Termin bzw. Kontakt nicht gefunden.",
  closed: "Dieser Termin ist schon vorbei oder abgesagt.",
  unavailable: "Der Kalender ist nicht verbunden (Meine Buchungsseite).",
  past: "Bitte einen Zeitpunkt in der Zukunft wählen.",
  email: "Bitte eine gültige E-Mail-Adresse für die Einladung angeben.",
  error: "Der Kalendertermin konnte nicht angelegt werden. Bitte erneut versuchen.",
  conflict: "Überschneidung mit einem anderen Termin.",
};

/** Datum (JJJJ-MM-TT) und Uhrzeit (HH:MM) in Berliner Zeit. */
function startOf(fd: FormData): Date | null {
  const ymd = String(fd.get("date") ?? "");
  const hhmm = String(fd.get("time") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return null;
  const d = berlinAt(ymd, hhmm);
  return Number.isNaN(d.getTime()) ? null : d;
}

function stateOf(res: AdminResult): AdminTerminState {
  if (res.ok) return { ok: true };
  if (res.error === "conflict") return { error: ADMIN_ERRORS.conflict, conflicts: res.conflicts.map(conflictText) };
  return { error: ADMIN_ERRORS[res.error] };
}

/** „Termin buchen“ im Vertriebskontakt: Termintyp, Datum und Uhrzeit frei; bei Überschneidung erst Warnung, dann „Trotzdem buchen“. */
export async function adminBookTerminAction(_prev: AdminTerminState, fd: FormData): Promise<AdminTerminState> {
  await requireAuth();
  const contactId = String(fd.get("contactId") ?? "");
  const type = await loadBookingType(String(fd.get("art") ?? ""));
  if (!type) return { error: "Termintyp nicht gefunden." };
  const start = startOf(fd);
  if (!start) return { error: "Bitte Datum und Uhrzeit wählen." };
  const res = await adminBookSalesMeeting({ type, contactId, start, email: String(fd.get("email") ?? ""), force: fd.get("force") === "1" });
  if (res.ok) {
    await audit("vertrieb.termin.gebucht", { entity: "SalesMeeting", entityId: res.meetingId, details: { contactId, art: type.slug } });
    revalidatePath(`/admin/vertrieb/kontakte/${contactId}`);
  }
  return stateOf(res);
}

/** Termin der eigenen Buchungsseite verschieben (Admin): Datum und Uhrzeit frei, Warnung bei Überschneidung. */
export async function adminRescheduleTerminAction(_prev: AdminTerminState, fd: FormData): Promise<AdminTerminState> {
  await requireAuth();
  const meetingId = String(fd.get("meetingId") ?? "");
  const start = startOf(fd);
  if (!start) return { error: "Bitte Datum und Uhrzeit wählen." };
  const res = await adminRescheduleSalesMeeting(meetingId, start, { force: fd.get("force") === "1" });
  if (res.ok) {
    await audit("vertrieb.termin.verschoben", { entity: "SalesMeeting", entityId: res.meetingId, details: { from: meetingId } });
    const m = await prisma.salesMeeting.findUnique({ where: { id: res.meetingId }, select: { contactId: true } });
    if (m) revalidatePath(`/admin/vertrieb/kontakte/${m.contactId}`);
  }
  return stateOf(res);
}
