"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { requireAuth } from "@/lib/vertrieb/auth";
import { updateLeadTimes, type SourceResult } from "@/lib/calendar/sources";
import { BUFFER_CHOICES, DURATION_CHOICES, NOTICE_CHOICES, VERTRIEB_CUSTOMER_ID, DEFAULT_BOOKING_TYPE, loadBookingType } from "@/lib/vertrieb/buchung";

const PATH = "/admin/vertrieb/buchungsseite";
const pick = <T extends number>(choices: readonly T[], raw: unknown, fallback: T): T => {
  const n = Number(raw);
  return (choices as readonly number[]).includes(n) ? (n as T) : fallback;
};

/** Termintyp: Dauer, Puffer, Vorlauf, fester Videolink, aktiv. */
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
