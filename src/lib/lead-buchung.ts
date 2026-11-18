// Termin für einen Lead aus der App buchen (Ole, 14.11.2026): gleiche freie Zeiten und gleiche Buchung wie die
// Buchungsseite (/book/<slug>), nur ohne neuen Tab. Danach Phase „Termin vereinbart“, Einladung per Mail an den
// Lead (wenn E-Mail da) und Bestätigung per WhatsApp (wenn möglich).

import { prisma } from "@/lib/prisma";
import { bookAppointment, bookingDurationMin, SlotBusyError, suggestSlots, type Slot } from "@/lib/calendar";
import { buildEventDescription, eventSummary } from "@/lib/whatsapp/event-text";
import { logLeadHistory } from "@/lib/lead-history";
import { terminArtLabel } from "@/lib/termin-art";

export type LeadSlots = { ok: true; slots: Slot[]; durationMin: number } | { ok: false; reason: "no_calendar" | "error"; error: string };

export async function leadSlots(customerId: string, leadId: string): Promise<LeadSlots> {
  const conn = await prisma.calendarConnection.findUnique({ where: { customerId }, select: { status: true } });
  if (conn?.status !== "connected") return { ok: false, reason: "no_calendar", error: "Für Terminbuchungen verbinden Sie Ihren Kalender." };
  try {
    const durationMin = await bookingDurationMin(customerId, leadId).catch(() => 30);
    // Wie die Buchungsseite: Lead-Zeiten aus „Mein Kalender“, 14 Tage
    const slots = await suggestSlots(customerId, durationMin, 24, "lead", 14, leadId);
    return { ok: true, slots, durationMin };
  } catch (err) {
    console.error("[lead-buchung] slots", err);
    return { ok: false, reason: "error", error: "Die freien Zeiten konnten gerade nicht geladen werden. Bitte gleich noch einmal versuchen." };
  }
}

export type BookForLeadResult = { ok: true; appointmentId: string; start: string } | { ok: false; error: string; taken?: boolean };

export async function bookForLead(opts: { customerId: string; leadId: string; start: string; mode: "phone" | "video"; userId: string | null }): Promise<BookForLeadResult> {
  if (!opts.start || Number.isNaN(new Date(opts.start).getTime())) return { ok: false, error: "Bitte eine Zeit wählen." };
  const lead = await prisma.lead.findFirst({
    where: { id: opts.leadId, customerId: opts.customerId, erasedAt: null },
    select: { id: true, name: true, phone: true, email: true, source: true },
  });
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  const upcoming = await prisma.appointment.findFirst({ where: { leadId: lead.id, status: "booked", startsAt: { gt: new Date() } }, select: { id: true } });
  if (upcoming) return { ok: false, error: "Für diesen Lead steht schon ein Termin an. Verschieben Sie ihn an der Termin-Karte im Kontakt." };
  const name = lead.name ?? "Lead";
  // Chat zur Nummer (wie die Buchungsseite), damit Bestätigung und Erinnerungen dort landen
  let conversationId: string | null = null;
  let summary: string | null = null;
  if (lead.phone) {
    const account = await prisma.whatsAppAccount.findUnique({ where: { customerId: opts.customerId }, select: { id: true } });
    const conv = await prisma.conversation.upsert({
      where: { customerId_contactPhone: { customerId: opts.customerId, contactPhone: lead.phone } },
      create: { customerId: opts.customerId, whatsAppAccountId: account?.id ?? null, contactPhone: lead.phone, contactName: name, contactEmail: lead.email, leadId: lead.id },
      update: {},
      select: { id: true, leadId: true, qualificationSummary: true },
    });
    if (!conv.leadId) await prisma.conversation.update({ where: { id: conv.id }, data: { leadId: lead.id } });
    conversationId = conv.id;
    summary = conv.qualificationSummary;
  }
  try {
    const res = await bookAppointment({
      customerId: opts.customerId,
      leadId: lead.id,
      conversationId,
      start: opts.start,
      bookedVia: "advisor",
      mode: opts.mode,
      summary: eventSummary(opts.mode, name, lead.source),
      description: buildEventDescription({
        name,
        phone: lead.phone ? `+${lead.phone}` : "",
        email: lead.email,
        product: lead.source,
        mode: opts.mode,
        summary,
        conversationId,
        bookedVia: "advisor",
      }),
      attendeeEmail: lead.email,
      leadName: name,
      leadPhone: lead.phone,
    });
    if (lead.phone) {
      const { sendBookingConfirmation } = await import("@/lib/whatsapp/reminders");
      await sendBookingConfirmation({
        customerId: opts.customerId,
        to: lead.phone,
        name,
        leadId: lead.id,
        startsAt: new Date(res.start),
        mode: opts.mode,
        meetUrl: res.meetUrl,
        manageUrl: res.manageUrl,
      }).catch((e) => console.error("[lead-buchung] bestätigung", e));
    }
    const when = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(res.start));
    await logLeadHistory(lead.id, "status", `Termin gebucht: ${when} Uhr, ${terminArtLabel(opts.mode)}`, { customerId: opts.customerId, userId: opts.userId });
    return { ok: true, appointmentId: res.appointmentId, start: res.start };
  } catch (err) {
    if (err instanceof SlotBusyError) return { ok: false, taken: true, error: "Diese Zeit ist gerade vergeben worden. Bitte eine andere wählen." };
    console.error("[lead-buchung]", err);
    return { ok: false, error: "Der Termin konnte nicht gebucht werden. Bitte noch einmal versuchen." };
  }
}
