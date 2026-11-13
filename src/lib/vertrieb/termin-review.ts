// Nach jedem Termin (Ole, 13.11.2026): Aufgabe „Wie lief der Termin?“ + Push.
// Quellen: Calendly-Termine (SalesMeeting, nach Ende) und eigene Termin-Aufgaben
// („Termin“ aus „Termin vereinbart“, nach Fälligkeit). Das Ergebnis wird mit einem Klick
// eingetragen: Verlauf, Pipeline-Stufe und passende Folgeaufgabe.

import { prisma } from "@/lib/prisma";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import { OUTCOME_BY_ID, STAGE_RANK, TERMIN_REVIEW_CHOICES, TERMIN_REVIEW_PREFIX, isTerminReview, shortName } from "@/lib/vertrieb/crm";
import { addWorkdays, dayKey, fmtDateTime, fromDayKey } from "@/lib/vertrieb/dates";
import type { SalesStage as Stage } from "@/generated/prisma/enums";

const MIN = 60_000;
/** Ohne Endzeit gilt ein Termin nach 45 Minuten als vorbei. */
const DEFAULT_DURATION = 45 * MIN;
/** Eigene Termin-Aufgaben: Nachfrage 60 Minuten nach der Fälligkeit. */
const MANUAL_GRACE = 60 * MIN;
/** Ältere Termine nicht mehr nachfragen (beim ersten Lauf nur die letzten 24 Stunden). */
const LOOKBACK = 24 * 60 * MIN;
/** Eigene Termin-Aufgaben: nur echte Termine, nicht „Termin vorbereiten“ o. Ä. */
const MANUAL_TITLE = /^Termin(?:$|:|\s+mit\b)/i;

const reviewTitle = (name: string | null | undefined) => `${TERMIN_REVIEW_PREFIX}${name ? ` mit ${shortName(name)}` : ""}?`;

/** Legt nach Terminende die Nachfrage-Aufgaben an. Gibt die Anzahl neuer Aufgaben zurück. */
export async function createMeetingReviews(now = new Date()): Promise<number> {
  let created = 0;
  const since = new Date(now.getTime() - LOOKBACK);

  // 1) Calendly-Termine, die vorbei sind
  const meetings = await prisma.salesMeeting.findMany({
    where: { status: "GEPLANT", reviewTaskId: null, startAt: { gte: since, lte: now } },
    include: { contact: { select: { id: true, name: true } } },
    take: 50,
  });
  for (const m of meetings) {
    const end = m.endAt ?? new Date(m.startAt.getTime() + DEFAULT_DURATION);
    if (end > now) continue;
    const task = await prisma.salesTask.create({
      data: {
        contactId: m.contactId,
        title: reviewTitle(m.contact.name),
        type: "TERMIN",
        dueAt: now,
        note: `${m.title} am ${fmtDateTime(m.startAt)} – Ergebnis mit einem Klick eintragen.`,
      },
    });
    // Nur setzen, wenn noch frei (paralleler Lauf legt keine zweite Aufgabe an)
    const claimed = await prisma.salesMeeting.updateMany({ where: { id: m.id, reviewTaskId: null }, data: { reviewTaskId: task.id } });
    if (!claimed.count) {
      await prisma.salesTask.delete({ where: { id: task.id } });
      continue;
    }
    // Die Termin-Aufgabe selbst ist damit erledigt
    if (m.taskId) await prisma.salesTask.updateMany({ where: { id: m.taskId, doneAt: null }, data: { doneAt: now } });
    created++;
    await push(m.contact.id, m.contact.name, m.title);
  }

  // 2) Eigene Termin-Aufgaben (ohne Calendly), deren Zeit vorbei ist
  const linked = await prisma.salesMeeting.findMany({ where: { taskId: { not: null }, startAt: { gte: since } }, select: { taskId: true } });
  const linkedIds = linked.map((l) => l.taskId!).filter(Boolean);
  const manual = await prisma.salesTask.findMany({
    where: {
      type: "TERMIN",
      doneAt: null,
      dueAt: { gte: since, lte: new Date(now.getTime() - MANUAL_GRACE) },
      ...(linkedIds.length ? { id: { notIn: linkedIds } } : {}),
    },
    include: { contact: { select: { id: true, name: true } } },
    take: 50,
  });
  for (const t of manual) {
    if (isTerminReview(t.title) || !MANUAL_TITLE.test(t.title.trim())) continue;
    // Erledigt setzen und Nachfrage anlegen – in einem Schritt, damit es keine doppelten Nachfragen gibt
    const done = await prisma.salesTask.updateMany({ where: { id: t.id, doneAt: null }, data: { doneAt: now } });
    if (!done.count) continue;
    await prisma.salesTask.create({
      data: {
        contactId: t.contactId,
        title: reviewTitle(t.contact?.name),
        type: "TERMIN",
        dueAt: now,
        note: `Termin am ${fmtDateTime(t.dueAt)} – Ergebnis mit einem Klick eintragen.`,
      },
    });
    created++;
    await push(t.contactId, t.contact?.name ?? null, "Termin");
  }
  return created;
}

async function push(contactId: string | null, name: string | null, title: string) {
  await sendToAdmins({
    title: `🗓️ ${reviewTitle(name)}`,
    body: `${title} ist vorbei – Ergebnis mit einem Klick eintragen.`,
    url: contactId ? `/admin/vertrieb/kontakte/${contactId}` : "/admin/vertrieb/aufgaben",
    tag: `termin-review:${contactId}`,
  }).catch((e) => reportError(e, "termin-review-push"));
}

const ALLOWED = new Set(TERMIN_REVIEW_CHOICES.map((c) => c.outcome));

/**
 * Ergebnis eines Termins eintragen: Nachfrage erledigt, Verlauf, Stufe, Folgeaufgabe.
 * Bei „Kein Interesse“ werden alle offenen Aufgaben des Kontakts erledigt.
 */
export async function recordMeetingOutcome(taskId: string, outcomeId: string, now = new Date()): Promise<{ ok: true; contactId: string } | { ok: false; error: string }> {
  if (!ALLOWED.has(outcomeId)) return { ok: false, error: "Unbekanntes Ergebnis." };
  const outcome = OUTCOME_BY_ID[outcomeId];
  const task = await prisma.salesTask.findUnique({ where: { id: taskId }, include: { contact: { select: { id: true, stage: true, customerStage: true } } } });
  if (!task || !task.contact) return { ok: false, error: "Die Aufgabe gibt es nicht mehr." };
  if (task.doneAt) return { ok: false, error: "Das Ergebnis ist schon eingetragen." };
  const contact = task.contact;

  // Stufe nie zurückstufen (z. B. Gewonnen bleibt Gewonnen)
  let stage: Stage | undefined;
  if (outcome.stage && (outcome.stage === "VERLOREN" || STAGE_RANK[outcome.stage] >= STAGE_RANK[contact.stage])) stage = outcome.stage;

  await prisma.$transaction(async (tx) => {
    await tx.salesTask.update({ where: { id: task.id }, data: { doneAt: now } });
    await tx.salesActivity.create({ data: { contactId: contact.id, type: "TERMIN", outcome: outcome.label, occurredAt: now } });
    await tx.salesContact.update({
      where: { id: contact.id },
      data: {
        ...(stage ? { stage } : {}),
        ...(stage === "GEWONNEN" && !contact.customerStage ? { customerStage: "VERTRAG" } : {}),
        ...(stage === "VERLOREN" ? { lossReason: "KEIN_INTERESSE" } : stage ? { lossReason: null } : {}),
        lastContactAt: now,
      },
    });
    if (outcome.closesTasks) await tx.salesTask.updateMany({ where: { contactId: contact.id, doneAt: null }, data: { doneAt: now } });
    if (outcome.task) {
      const due = outcome.task.workdays === 0 ? now : fromDayKey(dayKey(addWorkdays(now, outcome.task.workdays)), "09:00");
      await tx.salesTask.create({ data: { contactId: contact.id, title: outcome.task.title, type: outcome.task.type, dueAt: due } });
    }
  });
  return { ok: true, contactId: contact.id };
}
