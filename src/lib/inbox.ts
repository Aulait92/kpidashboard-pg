// Daten der Startseite „Heute" (Aufgabenliste für WhatsApp-Kunden):
// Termine heute/morgen, Termine ohne Ergebnis, Chats die den Berater
// brauchen, Rückrufe. Alles serialisierbar für die Client-Komponente.

import { prisma } from "@/lib/prisma";
import { getCallbackLeads } from "@/lib/whatsapp/outreach";
import { getOrCreateBookingSlug } from "@/lib/calendar";

const TZ = "Europe/Berlin";
const DAY = 24 * 60 * 60 * 1000;
const POST_STATUSES = ["Angebot gesendet", "Abschluss", "Kein Interesse", "Disqualifiziert"];

function berlinDayStart(d: Date): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
  const guess = new Date(`${ymd}T00:00:00Z`);
  const h = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(guess),
  );
  return new Date(guess.getTime() - h * 60 * 60 * 1000);
}

export type InboxAppointment = {
  id: string;
  startsAt: string;
  isToday: boolean;
  mode: string;
  meetUrl: string | null;
  manageToken: string | null;
  leadId: string | null;
  conversationId: string | null;
  name: string;
  phone: string | null;
  summary: string | null;
};
export type InboxOutcome = { id: string; startsAt: string; mode: string; leadId: string; name: string };
export type InboxChat = { conversationId: string; name: string; reason: string | null; at: string | null };
export type InboxCallback = {
  leadId: string;
  name: string;
  phone: string | null;
  reason: string;
  createdAt: string;
  conversationId: string | null;
};
export type InboxData = {
  appointments: InboxAppointment[];
  outcomes: InboxOutcome[];
  chats: InboxChat[];
  callbacks: InboxCallback[];
  bookingSlug: string | null;
};

export async function loadInbox(customerId: string): Promise<InboxData> {
  const now = new Date();
  const todayStart = berlinDayStart(now);
  const tomorrowEnd = new Date(todayStart.getTime() + 2 * DAY);

  const [upcoming, past, chats, callbacks, cal] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        customerId,
        status: "booked",
        startsAt: { gte: new Date(now.getTime() - 60 * 60 * 1000), lt: tomorrowEnd },
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        startsAt: true,
        mode: true,
        meetUrl: true,
        manageToken: true,
        leadId: true,
        conversationId: true,
        lead: { select: { name: true, phone: true } },
      },
    }),
    prisma.appointment.findMany({
      where: {
        customerId,
        status: "booked",
        leadId: { not: null },
        startsAt: { lt: new Date(now.getTime() - 30 * 60 * 1000), gt: new Date(now.getTime() - 30 * DAY) },
      },
      orderBy: { startsAt: "desc" },
      take: 20,
      select: { id: true, startsAt: true, mode: true, leadId: true, lead: { select: { name: true, status: true } } },
    }),
    prisma.conversation.findMany({
      where: { customerId, needsAttention: true },
      orderBy: { attentionAt: "desc" },
      select: { id: true, contactName: true, contactPhone: true, attentionReason: true, attentionAt: true },
    }),
    getCallbackLeads(customerId),
    prisma.calendarConnection.findUnique({ where: { customerId }, select: { status: true } }),
  ]);

  const convIds = upcoming.map((a) => a.conversationId).filter((x): x is string => !!x);
  const convs = convIds.length
    ? await prisma.conversation.findMany({
        where: { id: { in: convIds } },
        select: { id: true, contactName: true, contactPhone: true, qualificationSummary: true },
      })
    : [];
  const convById = new Map(convs.map((c) => [c.id, c]));

  return {
    appointments: upcoming.map((a) => {
      const conv = a.conversationId ? convById.get(a.conversationId) : undefined;
      return {
        id: a.id,
        startsAt: a.startsAt.toISOString(),
        isToday: a.startsAt.getTime() < todayStart.getTime() + DAY,
        mode: a.mode,
        meetUrl: a.meetUrl,
        manageToken: a.manageToken,
        leadId: a.leadId,
        conversationId: a.conversationId,
        name: a.lead?.name ?? conv?.contactName ?? "Lead",
        phone: a.lead?.phone ?? conv?.contactPhone ?? null,
        summary: conv?.qualificationSummary ?? null,
      };
    }),
    outcomes: past
      .filter((a) => !POST_STATUSES.includes(a.lead?.status ?? ""))
      .map((a) => ({
        id: a.id,
        startsAt: a.startsAt.toISOString(),
        mode: a.mode,
        leadId: a.leadId!,
        name: a.lead?.name ?? "Lead",
      })),
    chats: chats.map((c) => ({
      conversationId: c.id,
      name: c.contactName ?? `+${c.contactPhone}`,
      reason: c.attentionReason,
      at: c.attentionAt?.toISOString() ?? null,
    })),
    callbacks: callbacks.map((c) => ({
      leadId: c.id,
      name: c.name ?? "Unbekannt",
      phone: c.phone,
      reason: c.reason,
      createdAt: c.createdAt.toISOString(),
      conversationId: c.conversationId,
    })),
    bookingSlug: cal?.status === "connected" ? await getOrCreateBookingSlug(customerId) : null,
  };
}
