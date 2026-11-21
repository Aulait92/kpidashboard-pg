// Abfragen zum Team-Überblick (Regeln und Schwellen: lib/team-ueberblick.ts). Nur für den Inhaber eines Teams.

import { prisma } from "@/lib/prisma";
import { memberName, teamMembers, type TeamCtx } from "@/lib/team";
import { getCallbackLeads } from "@/lib/whatsapp/outreach";
import { POST_STATUSES, offeneWiedervorlageWhere } from "@/lib/inbox";
import { wiedervorlageHinterTermin } from "@/lib/lead-followup";
import { nextStepRatesByAdvisor } from "@/lib/lead-next-step-server";
import { pastOpenAppointmentWhere, upcomingAppointmentWhere, withoutNextStepWhere } from "@/lib/lead-next-step";
import { baueTeamUeberblick, heuteAuswahl, heuteSatz, TERMINE_TAGE, type MitgliedUeberblick } from "@/lib/team-ueberblick";

const DAY = 24 * 60 * 60 * 1000;
/** Obergrenze je Liste beim Laden (Agenturen mit 3 bis 10 Personen bleiben weit darunter). */
const MAX_ZEILEN = 2000;

/**
 * Überblick je Mitglied (Termine der nächsten 7 Tage, offene Punkte). null für Berater (nur der Inhaber sieht das Team)
 * und für Konten ohne Team (weniger als 2 Personen).
 */
export async function ladeTeamUeberblick(
  ctx: TeamCtx,
  now = new Date(),
  geladen?: Awaited<ReturnType<typeof teamMembers>>,
): Promise<Map<string, MitgliedUeberblick> | null> {
  if (ctx.teamRole !== "owner") return null;
  const customerId = ctx.customerId;
  const members = geladen ?? (await teamMembers(customerId));
  if (members.length < 2) return null;
  const memberIds = members.map((m) => m.id);
  // Nicht Zugeteiltes sieht der Inhaber (lib/team.ts): beim angemeldeten Inhaber, sonst (Vorschau) beim ersten Inhaber
  const fallbackUserId = ctx.userId && memberIds.includes(ctx.userId) ? ctx.userId : (members.find((m) => m.teamRole !== "advisor")?.id ?? memberIds[0]);

  const [termine, callbacks, wiedervorlagen, ergebnisse, ohneSchritt, quoten] = await Promise.all([
    prisma.appointment.findMany({
      where: { customerId, ...upcomingAppointmentWhere(now), startsAt: { gt: new Date(now.getTime() - 30 * 60 * 1000), lt: new Date(now.getTime() + TERMINE_TAGE * DAY) } },
      orderBy: { startsAt: "asc" },
      take: MAX_ZEILEN,
      select: { id: true, startsAt: true, mode: true, calendarKey: true, leadId: true, lead: { select: { name: true, assignedUserId: true } } },
    }),
    // Rückrufliste wie auf Heute (gleiche Regeln, inklusive „Nicht erreicht“ bis morgen ausgeblendet)
    getCallbackLeads(customerId),
    prisma.lead.findMany({
      where: { customerId, followUpAt: { lt: now }, ...offeneWiedervorlageWhere() },
      orderBy: { followUpAt: "asc" },
      take: MAX_ZEILEN,
      select: { id: true, name: true, followUpAt: true, followUpNote: true, assignedUserId: true, appointments: { where: { status: "booked", startsAt: { gt: now } }, select: { id: true }, take: 1 } },
    }),
    // „Wie lief's?“ auf Heute: Termin vorbei, Ergebnis fehlt, bis 30 Tage zurück
    prisma.appointment.findMany({
      where: { customerId, ...pastOpenAppointmentWhere(now), startsAt: { lte: new Date(now.getTime() - 30 * 60 * 1000), gt: new Date(now.getTime() - 30 * DAY) }, leadId: { not: null } },
      orderBy: { startsAt: "desc" },
      take: MAX_ZEILEN,
      select: { startsAt: true, calendarKey: true, leadId: true, lead: { select: { name: true, status: true, assignedUserId: true } } },
    }),
    prisma.lead.findMany({
      where: { AND: [{ customerId }, withoutNextStepWhere(now)] },
      orderBy: { statusChangedAt: "asc" },
      take: MAX_ZEILEN,
      select: { id: true, name: true, statusChangedAt: true, assignedUserId: true },
    }),
    nextStepRatesByAdvisor(customerId, now),
  ]);

  const zuteilung = callbacks.length
    ? new Map((await prisma.lead.findMany({ where: { id: { in: callbacks.map((c) => c.id) } }, select: { id: true, assignedUserId: true } })).map((l) => [l.id, l.assignedUserId]))
    : new Map<string, string | null>();
  const offeneErgebnisse = ergebnisse.filter((a) => !POST_STATUSES.includes(a.lead?.status ?? ""));
  const mitErgebnisOffen = new Set(offeneErgebnisse.map((a) => a.leadId));

  return baueTeamUeberblick({
    now,
    memberIds,
    fallbackUserId,
    termine: termine.map((t) => ({ id: t.id, startsAt: t.startsAt, mode: t.mode, calendarKey: t.calendarKey, leadId: t.leadId, leadName: t.lead?.name ?? null, leadAssignedUserId: t.lead?.assignedUserId ?? null })),
    anrufe: callbacks.map((c) => ({ leadId: c.id, name: c.name, createdAt: c.createdAt, urgent: !!c.urgent, assignedUserId: zuteilung.get(c.id) ?? null })),
    // Wie Heute: Wiedervorlage hinter einem Termin bzw. „Wie lief's?“ zählt nicht extra
    wiedervorlagen: wiedervorlagen
      .filter((w) => !(wiedervorlageHinterTermin(w.followUpNote) && (w.appointments.length > 0 || mitErgebnisOffen.has(w.id))))
      .map((w) => ({ leadId: w.id, name: w.name, followUpAt: w.followUpAt!, assignedUserId: w.assignedUserId })),
    ergebnisse: offeneErgebnisse.map((a) => ({ leadId: a.leadId!, name: a.lead?.name ?? null, startsAt: a.startsAt, calendarKey: a.calendarKey, leadAssignedUserId: a.lead?.assignedUserId ?? null })),
    ohneSchritt: ohneSchritt.map((l) => ({ leadId: l.id, name: l.name, statusChangedAt: l.statusChangedAt, assignedUserId: l.assignedUserId })),
    quoten,
  });
}

export type TeamHeuteZeile = { userId: string; name: string; satz: string };

/** Zeilen für die Karte „Team“ auf Heute des Inhabers (höchstens 3, leer ohne Befund). */
export async function ladeTeamHeute(ctx: TeamCtx, now = new Date()): Promise<TeamHeuteZeile[]> {
  if (ctx.teamRole !== "owner") return [];
  const members = await teamMembers(ctx.customerId);
  const u = await ladeTeamUeberblick(ctx, now, members);
  if (!u) return [];
  const name = new Map(members.map((m) => [m.id, memberName(m)]));
  return heuteAuswahl([...u.values()], ctx.userId).map((m) => ({ userId: m.userId, name: name.get(m.userId) ?? "Mitglied", satz: heuteSatz(m)! }));
}
