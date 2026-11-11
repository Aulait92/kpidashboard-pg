// „Ich bin abwesend“: Eintragen, Ändern, Beenden und was dabei automatisch
// passiert. Rechte: jeder für sich selbst, der Inhaber für das ganze Team,
// die Admin-Vorschau nur lesend.
//
// Beim Speichern:
//   - Aufgaben (Wiedervorlagen, zurückgestellte Rückrufe) im Zeitraum gehen an
//     die Vertretung oder rücken auf den ersten Arbeitstag nach der Rückkehr
//     (rückgängig machbar).
//   - Termine im Zeitraum werden aufgelistet: alle verschieben (Lead bekommt
//     die Verschiebe-Nachricht mit Link zum Umbuchen), an die Vertretung
//     übergeben oder einzeln entscheiden.
// Neue Leads und Buchungen meiden die Person automatisch (lib/team, lib/calendar).

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { adapterFor, rescheduleAppointment, suggestSlots } from "@/lib/calendar";
import { userCalendarKey, userIdOfKey } from "@/lib/calendar/tokens";
import { planPause } from "@/lib/pause";
import { sendRescheduleNotice } from "@/lib/whatsapp/reminders";
import { memberName } from "@/lib/team";
import {
  absenceDays,
  absenceRange,
  addDaysYmd,
  berlinMidnight,
  berlinYmd,
  blockedSpans,
  absencesBetween,
  isAbsenceKind,
  returnDayYmd,
  toAbsenceView,
  type AbsenceView,
} from "@/lib/absence";

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HOUR = 60 * 60 * 1000;

export type AbsenceActor = {
  customerId: string;
  userId: string | null;
  teamRole: "owner" | "advisor";
  preview: boolean;
};

/** Fehler mit Text für die Oberfläche. */
export class AbsenceError extends Error {}

export type AbsenceInput = {
  absenceId?: string | null;
  userId: string;
  from: string;
  to: string;
  kind: string;
  substituteUserId?: string | null;
};

export type AffectedAppointment = {
  id: string;
  leadId: string | null;
  leadName: string;
  startsAt: string;
  mode: string;
  /** Vertretung ist zu dieser Zeit da und frei. */
  canHandover: boolean;
};

export type MovedTask = {
  leadId: string;
  followUpAt: string | null;
  callbackSnoozedUntil: string | null;
  assignedUserId: string | null;
  /** moved = auf Rückkehr verschoben, transferred = an Vertretung */
  how: "moved" | "transferred";
};

export type AbsenceOverview = {
  absence: AbsenceView;
  personName: string;
  appointments: AffectedAppointment[];
  tasks: { moved: number; transferred: number };
  /** Einzel-Vertreter, ab 7 Tagen: Anzeigen pausieren anbieten. */
  pauseHint: { from: string; until: string } | null;
};

// ─── Rechte ─────────────────────────────────────────────────────────────

async function teamMember(customerId: string, userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, customerId, role: "BUYER" },
    select: { id: true, email: true, displayName: true, teamRole: true, advisorCalendar: { select: { status: true } } },
  });
}

/** Darf `actor` die Abwesenheit von `targetUserId` ändern? */
export async function assertCanManage(actor: AbsenceActor, targetUserId: string) {
  if (actor.preview || !actor.userId) throw new AbsenceError("In der Vorschau nur lesend.");
  const target = await teamMember(actor.customerId, targetUserId);
  if (!target) throw new AbsenceError("Person nicht gefunden.");
  if (target.id !== actor.userId && actor.teamRole !== "owner") {
    throw new AbsenceError("Du kannst nur deine eigene Abwesenheit eintragen.");
  }
  return target;
}

async function loadAbsence(actor: AbsenceActor, absenceId: string) {
  const a = await prisma.userAbsence.findFirst({
    where: { id: absenceId, customerId: actor.customerId },
    include: { substitute: { select: { id: true, displayName: true, email: true } } },
  });
  if (!a) throw new AbsenceError("Abwesenheit nicht gefunden.");
  return a;
}

/** Lesen: eigene Abwesenheit, Inhaber alle, Admin-Vorschau alle. */
function assertCanRead(actor: AbsenceActor, userId: string) {
  if (actor.preview || actor.teamRole === "owner" || actor.userId === userId) return;
  throw new AbsenceError("Keine Berechtigung.");
}

// ─── Speichern ──────────────────────────────────────────────────────────

export async function saveAbsence(actor: AbsenceActor, input: AbsenceInput, now = new Date()): Promise<AbsenceOverview> {
  const target = await assertCanManage(actor, input.userId);
  const existing = input.absenceId ? await loadAbsence(actor, input.absenceId) : null;
  if (existing && existing.userId !== target.id) throw new AbsenceError("Abwesenheit gehört zu einer anderen Person.");

  const today = berlinYmd(now);
  if (!YMD.test(input.from) || !YMD.test(input.to)) throw new AbsenceError("Bitte Start und Ende wählen.");
  if (input.to < input.from) throw new AbsenceError("Das Ende liegt vor dem Start.");
  if (input.to < today) throw new AbsenceError("Das Ende liegt in der Vergangenheit.");
  // Neue Abwesenheit frühestens heute; eine laufende behält ihren Start.
  const startedAlready = existing && existing.startsAt.getTime() <= now.getTime();
  const from = startedAlready ? berlinYmd(existing.startsAt) : input.from;
  if (!startedAlready && from < today) throw new AbsenceError("Die Abwesenheit kann frühestens heute beginnen.");
  if (input.to > addDaysYmd(from, 365)) throw new AbsenceError("Bitte höchstens ein Jahr am Stück eintragen.");
  if (!isAbsenceKind(input.kind)) throw new AbsenceError("Bitte einen Grund wählen.");

  let substituteUserId: string | null = input.substituteUserId || null;
  if (substituteUserId) {
    if (substituteUserId === target.id) throw new AbsenceError("Die Vertretung muss eine andere Person sein.");
    const sub = await teamMember(actor.customerId, substituteUserId);
    if (!sub) throw new AbsenceError("Vertretung nicht im Team.");
    substituteUserId = sub.id;
  }

  const span = absenceRange(from, input.to);
  const overlap = await prisma.userAbsence.findFirst({
    where: {
      userId: target.id,
      startsAt: { lt: span.endsAt },
      endsAt: { gt: span.startsAt },
      ...(existing ? { NOT: { id: existing.id } } : {}),
    },
    select: { id: true },
  });
  if (overlap) throw new AbsenceError("Für diese Zeit ist schon eine Abwesenheit eingetragen.");

  const data = { startsAt: span.startsAt, endsAt: span.endsAt, kind: input.kind, substituteUserId };
  const absence = existing
    ? await prisma.userAbsence.update({ where: { id: existing.id }, data })
    : await prisma.userAbsence.create({
        data: { ...data, userId: target.id, customerId: actor.customerId, createdById: actor.userId },
      });

  await moveTasks(absence.id, now);
  await audit(existing ? "absence.change" : "absence.create", {
    entity: "UserAbsence",
    entityId: absence.id,
    customerId: actor.customerId,
    details: { person: target.email, from, to: input.to, kind: input.kind, substitute: substituteUserId },
  });
  return absenceOverview(actor, absence.id, now);
}

// ─── Übersicht ──────────────────────────────────────────────────────────

/** Wem gehören Termine/Leads? Inhaber zusätzlich: alles ohne Zuständigen. */
function ownedLeadFilter(userId: string, isOwner: boolean): Prisma.LeadWhereInput {
  return isOwner ? { OR: [{ assignedUserId: userId }, { assignedUserId: null }] } : { assignedUserId: userId };
}

async function affectedAppointmentRows(absence: { userId: string; customerId: string; startsAt: Date; endsAt: Date }, now: Date) {
  const person = await prisma.user.findUnique({ where: { id: absence.userId }, select: { teamRole: true } });
  const isOwner = person?.teamRole !== "advisor";
  const from = absence.startsAt.getTime() > now.getTime() ? absence.startsAt : now;
  return prisma.appointment.findMany({
    where: {
      customerId: absence.customerId,
      status: "booked",
      startsAt: { gte: from, lt: absence.endsAt },
      OR: [
        { calendarKey: userCalendarKey(absence.userId) },
        { calendarKey: null, lead: { assignedUserId: absence.userId } },
        ...(isOwner ? [{ calendarKey: null, leadId: null }, { calendarKey: null, lead: { assignedUserId: null } }] : []),
      ],
    },
    select: {
      id: true,
      leadId: true,
      startsAt: true,
      endsAt: true,
      mode: true,
      calendarKey: true,
      conversationId: true,
      lead: { select: { name: true } },
    },
    orderBy: { startsAt: "asc" },
  });
}

type ApptRow = Awaited<ReturnType<typeof affectedAppointmentRows>>[number];

/** Kann die Vertretung diese Termine übernehmen (da und im Kalender frei)? */
async function handoverCheck(customerId: string, substituteUserId: string | null, rows: ApptRow[]): Promise<Set<string>> {
  const ok = new Set<string>();
  if (!substituteUserId || rows.length === 0) return ok;
  const sub = await teamMember(customerId, substituteUserId);
  if (!sub) return ok;
  const subKey = sub.advisorCalendar?.status === "connected" ? userCalendarKey(sub.id) : customerId;
  const min = rows[0].startsAt;
  const max = new Date(Math.max(...rows.map((r) => (r.endsAt ?? new Date(r.startsAt.getTime() + 30 * 60000)).getTime())));
  const subAbsent = blockedSpans([sub.id], (await absencesBetween(customerId, min, max)).map((a) => ({ ...a })));
  let busy: Array<{ start: Date; end: Date }> | null = null;
  for (const r of rows) {
    if (!r.leadId) continue; // ohne Lead nichts zu übergeben
    const end = r.endsAt ?? new Date(r.startsAt.getTime() + 30 * 60000);
    if (subAbsent.some((b) => b.start < end && b.end > r.startsAt)) continue;
    // Termin liegt schon im Agentur-Kalender und die Vertretung nutzt ihn auch → nur umhängen.
    const sameCalendar = (r.calendarKey ?? customerId) === subKey;
    if (!sameCalendar) {
      if (busy === null) {
        try {
          busy = await (await adapterFor(subKey)).getBusy(min, max);
        } catch {
          busy = [{ start: new Date(0), end: new Date(8.64e15) }]; // Kalender nicht erreichbar → nicht anbieten
        }
      }
      if (busy.some((b) => b.start < end && b.end > r.startsAt)) continue;
    }
    ok.add(r.id);
  }
  return ok;
}

export async function absenceOverview(actor: AbsenceActor, absenceId: string, now = new Date()): Promise<AbsenceOverview> {
  const absence = await loadAbsence(actor, absenceId);
  assertCanRead(actor, absence.userId);
  const person = await teamMember(actor.customerId, absence.userId);
  const rows = await affectedAppointmentRows(absence, now);
  const canHandover = await handoverCheck(actor.customerId, absence.substituteUserId, rows);
  const convNames = new Map(
    (
      await prisma.conversation.findMany({
        where: { id: { in: rows.map((r) => r.conversationId).filter((x): x is string => !!x) } },
        select: { id: true, contactName: true },
      })
    ).map((c) => [c.id, c.contactName]),
  );
  const tasks = (absence.movedTasks as MovedTask[] | null) ?? [];
  const members = await prisma.user.count({ where: { customerId: actor.customerId, role: "BUYER" } });
  const openPause = await prisma.customerPause.count({ where: { customerId: actor.customerId, status: { in: ["planned", "active"] } } });
  const view = toAbsenceView(absence, now);
  const today = berlinYmd(now);
  return {
    absence: view,
    personName: person ? memberName(person) : "",
    appointments: rows.map((r) => ({
      id: r.id,
      leadId: r.leadId,
      leadName: r.lead?.name?.trim() || (r.conversationId ? convNames.get(r.conversationId) : null) || "Kontakt",
      startsAt: r.startsAt.toISOString(),
      mode: r.mode,
      canHandover: canHandover.has(r.id),
    })),
    tasks: {
      moved: tasks.filter((t) => t.how === "moved").length,
      transferred: tasks.filter((t) => t.how === "transferred").length,
    },
    pauseHint:
      members === 1 && openPause === 0 && absenceDays(absence) >= 7 && actor.teamRole === "owner"
        ? { from: view.from > today ? view.from : today, until: view.returnDay }
        : null,
  };
}

// ─── Aufgaben ───────────────────────────────────────────────────────────

/**
 * Wiedervorlagen und zurückgestellte Rückrufe im Zeitraum: an die Vertretung
 * (Lead wechselt den Zuständigen) oder auf den ersten Arbeitstag nach der
 * Rückkehr, 8 Uhr. Der vorige Stand wird zum Rückgängigmachen gemerkt.
 */
export async function moveTasks(absenceId: string, now = new Date()): Promise<{ moved: number; transferred: number }> {
  const absence = await prisma.userAbsence.findUnique({ where: { id: absenceId } });
  if (!absence) return { moved: 0, transferred: 0 };
  const person = await prisma.user.findUnique({ where: { id: absence.userId }, select: { teamRole: true } });
  const isOwner = person?.teamRole !== "advisor";
  const started = absence.startsAt.getTime() <= now.getTime();
  const lower = started ? now : absence.startsAt;
  const leads = await prisma.lead.findMany({
    where: {
      customerId: absence.customerId,
      erasedAt: null,
      AND: [
        ownedLeadFilter(absence.userId, isOwner),
        {
          OR: [
            // Läuft die Abwesenheit schon, zählen auch überfällige Wiedervorlagen.
            { followUpAt: started ? { lt: absence.endsAt } : { gte: absence.startsAt, lt: absence.endsAt } },
            { callbackSnoozedUntil: { gte: lower, lt: absence.endsAt } },
          ],
        },
      ],
    },
    select: { id: true, followUpAt: true, callbackSnoozedUntil: true, assignedUserId: true },
  });
  // Leads mit Termin im Zeitraum: Zuständigkeit entscheidet die Termin-Liste
  // (verschieben oder übergeben) – ihre Aufgaben rücken nur zeitlich.
  const withAppt = new Set(
    (await affectedAppointmentRows(absence, now)).map((r) => r.leadId).filter((x): x is string => !!x),
  );
  const prev = ((absence.movedTasks as MovedTask[] | null) ?? []).slice();
  const known = new Set(prev.map((t) => t.leadId));
  const back = new Date(berlinMidnight(returnDayYmd(absence)).getTime() + 8 * HOUR);
  const sub = absence.substituteUserId;
  let moved = 0;
  let transferred = 0;
  for (const l of leads) {
    const transfer = !!sub && !withAppt.has(l.id);
    if (!known.has(l.id)) {
      prev.push({
        leadId: l.id,
        followUpAt: l.followUpAt?.toISOString() ?? null,
        callbackSnoozedUntil: l.callbackSnoozedUntil?.toISOString() ?? null,
        assignedUserId: l.assignedUserId,
        how: transfer ? "transferred" : "moved",
      });
      known.add(l.id);
    }
    if (transfer) {
      await prisma.lead.update({ where: { id: l.id }, data: { assignedUserId: sub } });
      transferred++;
    } else {
      const inWindow = (d: Date | null) => !!d && d.getTime() < absence.endsAt.getTime();
      await prisma.lead.update({
        where: { id: l.id },
        data: {
          ...(inWindow(l.followUpAt) ? { followUpAt: back } : {}),
          ...(inWindow(l.callbackSnoozedUntil) ? { callbackSnoozedUntil: back } : {}),
        },
      });
      moved++;
    }
  }
  if (leads.length) {
    await prisma.userAbsence.update({ where: { id: absence.id }, data: { movedTasks: prev as unknown as Prisma.InputJsonValue } });
  }
  return { moved, transferred };
}

/** Aufgaben-Verschiebung rückgängig machen. */
export async function undoTaskMoves(actor: AbsenceActor, absenceId: string): Promise<number> {
  const absence = await loadAbsence(actor, absenceId);
  await assertCanManage(actor, absence.userId);
  const tasks = (absence.movedTasks as MovedTask[] | null) ?? [];
  for (const t of tasks) {
    // Nur zurückdrehen, was die Abwesenheit geändert hat (eine spätere Termin-
    // Übergabe bleibt bestehen).
    await prisma.lead.updateMany({
      where: { id: t.leadId, customerId: actor.customerId },
      data:
        t.how === "transferred"
          ? { assignedUserId: t.assignedUserId }
          : {
              followUpAt: t.followUpAt ? new Date(t.followUpAt) : null,
              callbackSnoozedUntil: t.callbackSnoozedUntil ? new Date(t.callbackSnoozedUntil) : null,
            },
    });
  }
  await prisma.userAbsence.update({ where: { id: absence.id }, data: { movedTasks: [] } });
  await audit("absence.undo_tasks", { entity: "UserAbsence", entityId: absence.id, customerId: actor.customerId, details: { count: tasks.length } });
  return tasks.length;
}

// ─── Termine ────────────────────────────────────────────────────────────

async function selectedRows(actor: AbsenceActor, absenceId: string, ids: string[] | null, now: Date) {
  const absence = await loadAbsence(actor, absenceId);
  await assertCanManage(actor, absence.userId);
  const rows = await affectedAppointmentRows(absence, now);
  return { absence, rows: ids ? rows.filter((r) => ids.includes(r.id)) : rows };
}

export type RescheduleResult = { moved: Array<{ id: string; newStart: string }>; failed: string[] };

/**
 * Termine auf die Zeit nach der Rückkehr verschieben (gleiche Uhrzeit, wenn
 * frei). Der Lead bekommt die Verschiebe-Mail und per WhatsApp die neue Zeit
 * mit Link, um selbst eine andere zu wählen.
 */
export async function rescheduleAfterAbsence(
  actor: AbsenceActor,
  absenceId: string,
  ids: string[] | null,
  now = new Date(),
): Promise<RescheduleResult> {
  const { absence, rows } = await selectedRows(actor, absenceId, ids, now);
  const from = berlinMidnight(returnDayYmd(absence));
  const used = new Set<string>();
  const res: RescheduleResult = { moved: [], failed: [] };
  for (const r of rows) {
    try {
      const durationMin = r.endsAt ? Math.max(15, Math.round((r.endsAt.getTime() - r.startsAt.getTime()) / 60000)) : 30;
      const wall = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(r.startsAt);
      const h = Number(wall.find((p) => p.type === "hour")?.value);
      const m = Number(wall.find((p) => p.type === "minute")?.value);
      const hours = [...new Set([...(m === 0 && h >= 8 && h <= 18 ? [h] : []), 10, 14, 16])];
      const slots = await suggestSlots(actor.customerId, durationMin, used.size + 3, hours, 10, r.leadId, from);
      const slot = slots.find((s) => !used.has(s.start));
      if (!slot) {
        res.failed.push(r.id);
        continue;
      }
      used.add(slot.start);
      const booked = await rescheduleAppointment({ appointmentId: r.id, customerId: actor.customerId, start: slot.start, by: "team" });
      res.moved.push({ id: r.id, newStart: booked.start });
      if (r.conversationId) {
        await prisma.message
          .create({
            data: {
              conversationId: r.conversationId,
              direction: "internal",
              kind: "appointment_rescheduled",
              body: JSON.stringify({ von: r.startsAt.toISOString(), auf: booked.start, via: "abwesenheit" }),
              sentBy: "team",
            },
          })
          .catch(() => {});
        const conv = await prisma.conversation.findUnique({ where: { id: r.conversationId }, select: { contactPhone: true, contactName: true } });
        if (conv) {
          await sendRescheduleNotice({
            customerId: actor.customerId,
            to: conv.contactPhone,
            name: conv.contactName,
            leadId: r.leadId,
            startsAt: new Date(booked.start),
            mode: r.mode,
            meetUrl: booked.meetUrl,
            manageUrl: booked.manageUrl,
          }).catch((err) => reportError(err, "absence-reschedule-notice", { appointment: r.id }));
        }
      }
    } catch (err) {
      reportError(err, "absence-reschedule", { appointment: r.id });
      res.failed.push(r.id);
    }
  }
  await audit("absence.reschedule", {
    entity: "UserAbsence",
    entityId: absence.id,
    customerId: actor.customerId,
    details: { moved: res.moved.length, failed: res.failed.length },
  });
  return res;
}

export type HandoverResult = { handedOver: string[]; failed: string[] };

/**
 * Termine an die Vertretung übergeben: Lead wechselt den Zuständigen, der
 * Termin bleibt zur selben Zeit (bei eigenem Kalender der Vertretung wird er
 * dorthin umgetragen, ohne Nachricht an den Lead).
 */
export async function handoverToSubstitute(
  actor: AbsenceActor,
  absenceId: string,
  ids: string[] | null,
  now = new Date(),
): Promise<HandoverResult> {
  const { absence, rows } = await selectedRows(actor, absenceId, ids, now);
  if (!absence.substituteUserId) throw new AbsenceError("Keine Vertretung eingetragen.");
  const sub = absence.substituteUserId;
  const ok = await handoverCheck(actor.customerId, sub, rows);
  const res: HandoverResult = { handedOver: [], failed: [] };
  for (const r of rows) {
    if (!ok.has(r.id) || !r.leadId) {
      res.failed.push(r.id);
      continue;
    }
    try {
      const prevAssignee = (await prisma.lead.findUnique({ where: { id: r.leadId }, select: { assignedUserId: true } }))?.assignedUserId ?? null;
      await prisma.lead.update({ where: { id: r.leadId }, data: { assignedUserId: sub } });
      const subHasOwn = !!(await prisma.advisorCalendar.findFirst({ where: { userId: sub, status: "connected" }, select: { id: true } }));
      const currentKey = r.calendarKey ?? actor.customerId;
      const targetKey = subHasOwn ? userCalendarKey(sub) : actor.customerId;
      if (currentKey !== targetKey) {
        try {
          // Gleiche Zeit im Kalender der Vertretung, alter Eintrag still weg.
          await rescheduleAppointment({ appointmentId: r.id, customerId: actor.customerId, start: r.startsAt.toISOString(), by: "team", silent: true });
        } catch (err) {
          await prisma.lead.update({ where: { id: r.leadId }, data: { assignedUserId: prevAssignee } });
          throw err;
        }
      } else if (!userIdOfKey(currentKey)) {
        // Agentur-Kalender bleibt; nur die Zuständigkeit wechselt. Vertretung informieren.
        const { sendToUser } = await import("@/lib/push");
        await sendToUser(sub, {
          title: `Termin übernommen: ${r.lead?.name ?? "Kontakt"}`,
          body: new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(r.startsAt) + " Uhr",
          tag: `appt:${r.id}`,
          url: "/buyer",
        }).catch(() => {});
      }
      res.handedOver.push(r.id);
    } catch (err) {
      reportError(err, "absence-handover", { appointment: r.id });
      res.failed.push(r.id);
    }
  }
  await audit("absence.handover", {
    entity: "UserAbsence",
    entityId: absence.id,
    customerId: actor.customerId,
    details: { handedOver: res.handedOver.length, failed: res.failed.length },
  });
  return res;
}

// ─── Beenden, Pause ─────────────────────────────────────────────────────

/** Vorzeitig beenden (laufend) bzw. absagen (noch nicht begonnen). */
export async function endAbsence(actor: AbsenceActor, absenceId: string, now = new Date()): Promise<void> {
  const absence = await loadAbsence(actor, absenceId);
  await assertCanManage(actor, absence.userId);
  if (absence.startsAt.getTime() > now.getTime()) {
    await prisma.userAbsence.delete({ where: { id: absence.id } });
  } else if (absence.endsAt.getTime() > now.getTime()) {
    await prisma.userAbsence.update({ where: { id: absence.id }, data: { endsAt: now, endedAt: now } });
  }
  await audit("absence.end", { entity: "UserAbsence", entityId: absence.id, customerId: actor.customerId, details: { at: now.toISOString() } });
}

/** Einzel-Vertreter: Anzeigen für die Abwesenheit pausieren (bestehende Pause-Funktion). */
export async function pauseAdsForAbsence(actor: AbsenceActor, absenceId: string, now = new Date()) {
  if (actor.teamRole !== "owner") throw new AbsenceError("Nur der Inhaber kann die Anzeigen pausieren.");
  const absence = await loadAbsence(actor, absenceId);
  await assertCanManage(actor, absence.userId);
  const today = berlinYmd(now);
  const from = berlinYmd(absence.startsAt) > today ? berlinYmd(absence.startsAt) : today;
  const res = await planPause(actor.customerId, { from, until: returnDayYmd(absence), reason: "Abwesenheit" }, "customer");
  if (!res.ok) throw new AbsenceError(res.error);
}
