// Daten der Startseite „Heute" (Aufgabenliste für WhatsApp-Kunden):
// Termine heute/morgen, Termine ohne Ergebnis, Chats die den Berater
// brauchen, Rückrufe. Alles serialisierbar für die Client-Komponente.

import { POLICY_TODO } from "@/lib/lead-followup";
import { prisma } from "@/lib/prisma";
import { getCallbackLeads } from "@/lib/whatsapp/outreach";
import { getOrCreateBookingSlug } from "@/lib/calendar";
import { appointmentScope, conversationScope, isAdvisor, leadScope, type TeamCtx } from "@/lib/team";

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
export type InboxOutcome = { id: string; startsAt: string; mode: string; leadId: string; name: string; source: string | null };
export type InboxChat = { conversationId: string; name: string; reason: string | null; at: string | null };
export type InboxCallback = {
  leadId: string;
  name: string;
  source: string | null;
  phone: string | null;
  reason: string;
  createdAt: string;
  conversationId: string | null;
};
export type InboxFollowUp = {
  leadId: string;
  name: string;
  source: string | null;
  phone: string | null;
  status: string | null;
  note: string | null;
  dueAt: string;
  overdue: boolean;
  conversationId: string | null;
};
/** Kommende Tage (Ole, 13.11.2026): Wiedervorlagen ab morgen und Termine ab übermorgen, 14 Tage. */
export type InboxUpcoming = { key: string; kind: "wiedervorlage" | "termin"; leadId: string | null; name: string; note: string | null; at: string };
export type InboxData = {
  followUps: InboxFollowUp[];
  upcoming: InboxUpcoming[];
  appointments: InboxAppointment[];
  outcomes: InboxOutcome[];
  chats: InboxChat[];
  callbacks: InboxCallback[];
  bookingSlug: string | null;
};

export async function loadInbox(ctx: TeamCtx): Promise<InboxData> {
  const customerId = ctx.customerId;
  const apptScope = appointmentScope(ctx);
  const now = new Date();
  const todayStart = berlinDayStart(now);
  const tomorrowEnd = new Date(todayStart.getTime() + 2 * DAY);

  const horizon = new Date(todayStart.getTime() + 15 * DAY);
  const followUpOpen = {
    OR: [
      { NOT: { status: { in: POST_STATUSES.filter((x) => x !== "Angebot gesendet") } } },
      { status: "Abschluss", policyDoneAt: null, followUpNote: POLICY_TODO },
    ],
  };
  const [laterFollowUps, laterAppts] = await Promise.all([
    prisma.lead.findMany({
      where: { ...leadScope(ctx), followUpAt: { gte: new Date(todayStart.getTime() + DAY), lt: horizon }, ...followUpOpen },
      orderBy: { followUpAt: "asc" },
      take: 100,
      select: { id: true, name: true, followUpAt: true, followUpNote: true },
    }),
    prisma.appointment.findMany({
      where: { ...apptScope, status: "booked", startsAt: { gte: tomorrowEnd, lt: horizon } },
      orderBy: { startsAt: "asc" },
      take: 100,
      select: { id: true, startsAt: true, mode: true, leadId: true, lead: { select: { name: true } } },
    }),
  ]);
  const [upcoming, past, chats, callbacks, cal, followUps] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        ...apptScope,
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
        ...apptScope,
        status: "booked",
        leadId: { not: null },
        startsAt: { lt: new Date(now.getTime() - 30 * 60 * 1000), gt: new Date(now.getTime() - 30 * DAY) },
      },
      orderBy: { startsAt: "desc" },
      take: 20,
      select: { id: true, startsAt: true, mode: true, leadId: true, lead: { select: { name: true, status: true, source: true } } },
    }),
    prisma.conversation.findMany({
      where: { ...conversationScope(ctx), needsAttention: true },
      orderBy: { attentionAt: "desc" },
      select: { id: true, contactName: true, contactPhone: true, attentionReason: true, attentionAt: true },
    }),
    getCallbackLeads(customerId, isAdvisor(ctx) ? leadScope(ctx) : undefined),
    prisma.calendarConnection.findUnique({ where: { customerId }, select: { status: true } }),
    prisma.lead.findMany({
      where: {
        ...leadScope(ctx),
        followUpAt: { lt: new Date(todayStart.getTime() + DAY) },
        // Nach dem Abschluss bleibt nur „Police fertig machen“ (Ole, 13.11.2026)
        OR: [
          { NOT: { status: { in: POST_STATUSES.filter((x) => x !== "Angebot gesendet") } } },
          { status: "Abschluss", policyDoneAt: null, followUpNote: POLICY_TODO },
        ],
      },
      orderBy: { followUpAt: "asc" },
      take: 50,
      select: {
        id: true,
        name: true,
        source: true,
        phone: true,
        status: true,
        followUpAt: true,
        followUpNote: true,
        conversations: { select: { id: true }, take: 1 },
      },
    }),
  ]);
  const followUpIds = new Set(followUps.map((f) => f.id));

  const convIds = upcoming.map((a) => a.conversationId).filter((x): x is string => !!x);
  const convs = convIds.length
    ? await prisma.conversation.findMany({
        where: { id: { in: convIds } },
        select: { id: true, contactName: true, contactPhone: true, qualificationSummary: true },
      })
    : [];
  const convById = new Map(convs.map((c) => [c.id, c]));

  return {
    upcoming: [
      ...laterFollowUps.map((f) => ({
        key: `f:${f.id}`,
        kind: "wiedervorlage" as const,
        leadId: f.id,
        name: f.name ?? "Lead",
        note: f.followUpNote,
        at: f.followUpAt!.toISOString(),
      })),
      ...laterAppts.map((a) => ({
        key: `a:${a.id}`,
        kind: "termin" as const,
        leadId: a.leadId,
        name: a.lead?.name ?? "Termin",
        note: a.mode === "video" ? "Videocall" : "Telefonat",
        at: a.startsAt.toISOString(),
      })),
    ].sort((x, y) => x.at.localeCompare(y.at)),
    followUps: followUps.map((f) => ({
      leadId: f.id,
      name: f.name ?? "Lead",
      source: f.source,
      phone: f.phone,
      status: f.status,
      note: f.followUpNote,
      dueAt: f.followUpAt!.toISOString(),
      overdue: f.followUpAt!.getTime() < todayStart.getTime(),
      conversationId: f.conversations[0]?.id ?? null,
    })),
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
        source: a.lead?.source ?? null,
      })),
    chats: chats.map((c) => ({
      conversationId: c.id,
      name: c.contactName ?? `+${c.contactPhone}`,
      reason: c.attentionReason,
      at: c.attentionAt?.toISOString() ?? null,
    })),
    callbacks: callbacks.filter((c) => !followUpIds.has(c.id)).map((c) => ({
      leadId: c.id,
      name: c.name ?? "Unbekannt",
      source: c.source ?? null,
      phone: c.phone,
      reason: c.reason,
      createdAt: c.createdAt.toISOString(),
      conversationId: c.conversationId,
    })),
    bookingSlug: cal?.status === "connected" ? await getOrCreateBookingSlug(customerId) : null,
  };
}
