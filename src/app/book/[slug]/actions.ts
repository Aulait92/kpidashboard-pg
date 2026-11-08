"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { buildEventDescription, eventSummary } from "@/lib/whatsapp/event-text";
import { bookAppointment, SlotBusyError } from "@/lib/calendar";
import { linkLeadToConversation } from "@/lib/whatsapp/lead-link";
import { sendBookingConfirmation } from "@/lib/whatsapp/reminders";
import { EMAIL_RE, normalizePhone } from "@/lib/whatsapp/phone";

// Öffentliche Buchung (Buchungsseite / Meta-Leadformular). Kein Login — daher
// alles serverseitig validieren, Slot direkt vor dem Anlegen neu prüfen
// (bookAppointment) und einfache Missbrauchsbremsen setzen.

const MAX_BOOKINGS_PER_10_MIN = 10;

export async function bookPublicAction(
  slug: string,
  formData: FormData,
): Promise<void> {
  const fail = (code: string): never => redirect(`/book/${slug}?err=${code}`);

  // Honeypot: für Menschen unsichtbares Feld — Bots füllen es aus.
  if (String(formData.get("website") ?? "").trim()) fail("invalid");

  const conn = await prisma.calendarConnection.findUnique({
    where: { bookingSlug: slug },
    select: { customerId: true, status: true },
  });
  if (!conn || conn.status !== "connected") fail("unavailable");
  const customerId = conn!.customerId;

  const start = String(formData.get("start") ?? "");
  const mode = formData.get("mode") === "video" ? "video" : "phone";
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();
  const consent = formData.get("consent") === "on";

  if (!start || Number.isNaN(new Date(start).getTime())) fail("slot");
  if (!name) fail("name");
  if (!phone) fail("phone");
  if (!EMAIL_RE.test(emailRaw)) fail("email");
  if (!consent) fail("consent");

  // Missbrauchsbremse je Kunde.
  const recent = await prisma.appointment.count({
    where: {
      customerId,
      createdAt: { gt: new Date(Date.now() - 10 * 60 * 1000) },
    },
  });
  if (recent >= MAX_BOOKINGS_PER_10_MIN) fail("busy");

  // Konversation über die Telefonnummer zuordnen (gleiche Nummer wie WhatsApp).
  const account = await prisma.whatsAppAccount.findUnique({
    where: { customerId },
    select: { id: true },
  });
  const conversation = await prisma.conversation.upsert({
    where: { customerId_contactPhone: { customerId, contactPhone: phone! } },
    create: {
      customerId,
      whatsAppAccountId: account?.id ?? null,
      contactPhone: phone!,
      contactName: name,
      contactEmail: emailRaw,
    },
    update: { contactName: name, contactEmail: emailRaw },
    select: { id: true, qualificationSummary: true },
  });
  await linkLeadToConversation(conversation.id).catch((e) =>
    console.error("[booking page lead-link]", e),
  );
  const linked = await prisma.conversation.findUnique({
    where: { id: conversation.id },
    select: { leadId: true, lead: { select: { source: true } } },
  });
  const product = linked?.lead?.source ?? null;
  const leadId = linked?.leadId ?? null;

  // Pro Lead nur ein offener Termin.
  const existing = await prisma.appointment.findFirst({
    where: {
      conversationId: conversation.id,
      status: "booked",
      startsAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (existing) redirect(`/book/${slug}?ok=1&a=${existing.id}&dup=1`);

  let appointmentId: string;
  try {
    const res = await bookAppointment({
      customerId,
      leadId,
      conversationId: conversation.id,
      start,
      mode,
      summary: eventSummary(mode, name, product),
      description: buildEventDescription({
        name,
        phone: phone!,
        email: emailRaw,
        product,
        mode,
        summary: conversation.qualificationSummary,
        conversationId: conversation.id,
        bookedVia: "booking_page",
      }),
      attendeeEmail: emailRaw,
    });
    appointmentId = res.appointmentId;
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "internal",
        kind: "appointment_booked",
        body: JSON.stringify({ via: "booking_page", modus: mode, start }),
        sentBy: "lead",
      },
    });
    // WhatsApp-Bestätigung (Freitext im 24h-Fenster, sonst freigegebene
    // Vorlage). Fehler dürfen die Buchung nicht scheitern lassen — die
    // Google-Einladung per E-Mail ist ohnehin raus.
    await sendBookingConfirmation({
      customerId,
      to: phone!,
      name,
      leadId,
      startsAt: new Date(res.start),
      mode,
      meetUrl: res.meetUrl,
    }).catch((e) => console.error("[booking page confirmation]", e));
  } catch (err) {
    if (err instanceof SlotBusyError) fail("taken");
    console.error("[booking page]", err);
    fail("error");
  }

  redirect(`/book/${slug}?ok=1&a=${appointmentId!}`);
}
