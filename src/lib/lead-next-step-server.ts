// Abfragen zum nächsten Schritt (Definition: lib/lead-next-step.ts). Für Liste, Pipeline, Heute, Kontakt,
// Navigation, Zahlen, Team, Admin, Erinnerung und den Monatsbericht (nextStepRate).

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  activeBotChatWhere,
  NAECHSTER_SCHRITT_ABFOLGEN,
  nextStepRateOf,
  nextStepState,
  openForNextStepWhere,
  pastOpenAppointmentWhere,
  resultMissingWhere,
  upcomingAppointmentWhere,
  withoutNextStepWhere,
  type NextStepState,
} from "@/lib/lead-next-step";
import { CALL_ATTEMPTS_TARGET, LOST_STATUSES } from "@/lib/lead-lost";

export type NextStepFlags = { upcoming: boolean; pastOpen: boolean; botActive: boolean };

/** Termine und Bot-Gespräche je Lead (für Listen, in zwei Abfragen). */
export async function loadNextStepFlags(leadIds: string[], now = new Date()): Promise<Map<string, NextStepFlags>> {
  const out = new Map<string, NextStepFlags>();
  if (!leadIds.length) return out;
  const [upcoming, past, chats, recalls] = await Promise.all([
    prisma.appointment.findMany({ where: { leadId: { in: leadIds }, ...upcomingAppointmentWhere(now) }, select: { leadId: true } }),
    prisma.appointment.findMany({ where: { leadId: { in: leadIds }, ...pastOpenAppointmentWhere(now) }, select: { leadId: true } }),
    prisma.conversation.findMany({ where: { leadId: { in: leadIds }, ...activeBotChatWhere(now) }, select: { leadId: true } }),
    // Wiedervorlage des Assistenten, Bedenkzeit (P5) bzw. Nachfassen zum Angebot zählt wie ein aktiver Chat
    prisma.leadSequence.findMany({ where: { leadId: { in: leadIds }, kind: { in: NAECHSTER_SCHRITT_ABFOLGEN }, stoppedAt: null }, select: { leadId: true } }),
  ]);
  const get = (id: string) => out.get(id) ?? { upcoming: false, pastOpen: false, botActive: false };
  for (const a of upcoming) if (a.leadId) out.set(a.leadId, { ...get(a.leadId), upcoming: true });
  for (const a of past) if (a.leadId) out.set(a.leadId, { ...get(a.leadId), pastOpen: true });
  for (const c of chats) if (c.leadId) out.set(c.leadId, { ...get(c.leadId), botActive: true });
  for (const r of recalls) out.set(r.leadId, { ...get(r.leadId), botActive: true });
  return out;
}

type LeadFacts = { id: string; status: string | null; closedAt: Date | null; erasedAt: Date | null; stornoState?: string | null; followUpAt: Date | null };

/** Zustand je Lead aus geladenen Leads und Flags. */
export function stateFor(l: LeadFacts, flags: Map<string, NextStepFlags>): NextStepState {
  const f = flags.get(l.id);
  return nextStepState({
    ...l,
    hasUpcomingAppointment: !!f?.upcoming,
    hasPastAppointmentWithoutResult: !!f?.pastOpen,
    hasActiveBotChat: !!f?.botActive,
  });
}

/** Zustand eines einzelnen Leads (Kontakt, Dialog). */
export async function nextStepStateOf(leadId: string, now = new Date()): Promise<NextStepState> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, status: true, closedAt: true, erasedAt: true, stornoState: true, followUpAt: true },
  });
  if (!lead) return "none";
  return stateFor(lead, await loadNextStepFlags([lead.id], now));
}

/** Anzahl offener Leads ohne nächsten Schritt im Sichtbereich (Navigation, Heute). */
export async function countWithoutNextStep(scope: Prisma.LeadWhereInput, now = new Date()): Promise<number> {
  return prisma.lead.count({ where: { AND: [scope, withoutNextStepWhere(now)] } });
}

export type NoStepLead = {
  leadId: string;
  name: string;
  status: string | null;
  source: string | null;
  phone: string | null;
  resultMissing: boolean;
  /** Vorbeigegangener Termin ohne Ergebnis (für „Ergebnis eintragen“). */
  appointmentId: string | null;
  callAttempts: number;
  reached: boolean;
  statusChangedAt: string;
};

/** Leads ohne nächsten Schritt (älteste Statusänderung zuerst), für „Heute“ und die Erinnerung. */
export async function listWithoutNextStep(scope: Prisma.LeadWhereInput, opts: { now?: Date; take?: number } = {}): Promise<{ total: number; leads: NoStepLead[] }> {
  const now = opts.now ?? new Date();
  const where = { AND: [scope, withoutNextStepWhere(now)] };
  const [total, rows] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: { statusChangedAt: "asc" },
      take: opts.take ?? 30,
      select: {
        id: true,
        name: true,
        status: true,
        source: true,
        phone: true,
        callAttempts: true,
        reached: true,
        statusChangedAt: true,
        appointments: { where: pastOpenAppointmentWhere(now), orderBy: { startsAt: "desc" }, take: 1, select: { id: true } },
      },
    }),
  ]);
  return {
    total,
    leads: rows.map((l) => ({
      leadId: l.id,
      name: l.name ?? "Lead",
      status: l.status,
      source: l.source,
      phone: l.phone,
      resultMissing: l.appointments.length > 0,
      appointmentId: l.appointments[0]?.id ?? null,
      callAttempts: l.callAttempts,
      reached: l.reached,
      statusChangedAt: l.statusChangedAt.toISOString(),
    })),
  };
}

export type NextStepRate = {
  /** Offene Leads, die einen nächsten Schritt brauchen */
  open: number;
  withNextStep: number;
  withoutNextStep: number;
  /** davon: Termin vorbei, Ergebnis fehlt */
  resultMissing: number;
  /** Quote 0..1 (Ziel 1 = 100 %), null ohne offene Leads */
  rate: number | null;
};

/**
 * Kennzahl „Leads mit nächstem Schritt“ (Ziel 100 %) eines Kunden, Stand jetzt.
 * opts.userId: nur Leads dieses Beraters (zugeteilt). opts.now: Stichzeitpunkt (Termine, Bot-Gespräche).
 * Auch für den Monatsbericht gedacht.
 */
export async function nextStepRate(customerId: string, opts: { userId?: string | null; now?: Date } = {}): Promise<NextStepRate> {
  const now = opts.now ?? new Date();
  const scope: Prisma.LeadWhereInput = { customerId, ...(opts.userId !== undefined ? { assignedUserId: opts.userId } : {}) };
  const [open, without, resultMissing] = await Promise.all([
    prisma.lead.count({ where: { AND: [scope, openForNextStepWhere()] } }),
    prisma.lead.count({ where: { AND: [scope, withoutNextStepWhere(now)] } }),
    prisma.lead.count({ where: { AND: [scope, resultMissingWhere(now)] } }),
  ]);
  return { open, withNextStep: open - without, withoutNextStep: without, resultMissing, rate: nextStepRateOf(open, without) };
}

/** Kennzahl je Kunde (Admin-Liste) in zwei Abfragen. */
export async function nextStepRatesByCustomer(customerIds: string[], now = new Date()): Promise<Map<string, NextStepRate>> {
  const out = new Map<string, NextStepRate>();
  if (!customerIds.length) return out;
  const base = { customerId: { in: customerIds } };
  const [open, without] = await Promise.all([
    prisma.lead.groupBy({ by: ["customerId"], where: { AND: [base, openForNextStepWhere()] }, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["customerId"], where: { AND: [base, withoutNextStepWhere(now)] }, _count: { _all: true } }),
  ]);
  const w = new Map(without.map((r) => [r.customerId, r._count._all]));
  for (const r of open) {
    const n = r._count._all;
    const wo = w.get(r.customerId) ?? 0;
    out.set(r.customerId, { open: n, withNextStep: n - wo, withoutNextStep: wo, resultMissing: 0, rate: nextStepRateOf(n, wo) });
  }
  return out;
}

/** Kennzahl je Berater (Team-Ansicht, Admin); Schlüssel null = nicht zugeteilt. */
export async function nextStepRatesByAdvisor(customerId: string, now = new Date()): Promise<Map<string | null, NextStepRate>> {
  const base = { customerId };
  const [open, without] = await Promise.all([
    prisma.lead.groupBy({ by: ["assignedUserId"], where: { AND: [base, openForNextStepWhere()] }, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["assignedUserId"], where: { AND: [base, withoutNextStepWhere(now)] }, _count: { _all: true } }),
  ]);
  const w = new Map(without.map((r) => [r.assignedUserId, r._count._all]));
  const out = new Map<string | null, NextStepRate>();
  for (const r of open) {
    const n = r._count._all;
    const wo = w.get(r.assignedUserId) ?? 0;
    out.set(r.assignedUserId, { open: n, withNextStep: n - wo, withoutNextStep: wo, resultMissing: 0, rate: nextStepRateOf(n, wo) });
  }
  return out;
}

export type LostEarlyStats = { lost: number; early: number; rate: number | null };

/**
 * „Vorzeitig verloren“: verloren, nie erreicht, unter 6 dokumentierten Anrufversuchen (die Warnung wurde
 * übergangen bzw. es gab sie noch nicht). Gründe ohne Warnung (falsche Daten, nichts angefragt, kein
 * Interesse im Gespräch) zählen nicht. Je Berater (Schlüssel null = nicht zugeteilt) und gesamt.
 */
export async function lostEarlyStats(customerId: string, since: Date): Promise<{ total: LostEarlyStats; byAdvisor: Map<string | null, LostEarlyStats> }> {
  const rows = await prisma.lead.findMany({
    where: { customerId, status: { in: [...LOST_STATUSES] }, OR: [{ lostAt: { gte: since } }, { lostAt: null, statusChangedAt: { gte: since } }] },
    select: { assignedUserId: true, lostEarly: true, reached: true, callAttempts: true, lostReason: true },
  });
  const exempt = new Set(["falsche_daten", "nicht_angefragt", "kein_interesse", "nicht_erreichbar"]);
  const early = (r: (typeof rows)[number]) => r.lostEarly || (!r.reached && r.callAttempts < CALL_ATTEMPTS_TARGET && !!r.lostReason && !exempt.has(r.lostReason));
  const byAdvisor = new Map<string | null, LostEarlyStats>();
  const total: LostEarlyStats = { lost: 0, early: 0, rate: null };
  for (const r of rows) {
    const s = byAdvisor.get(r.assignedUserId) ?? { lost: 0, early: 0, rate: null };
    s.lost++;
    total.lost++;
    if (early(r)) {
      s.early++;
      total.early++;
    }
    byAdvisor.set(r.assignedUserId, s);
  }
  for (const s of [total, ...byAdvisor.values()]) s.rate = s.lost ? s.early / s.lost : null;
  return { total, byAdvisor };
}
