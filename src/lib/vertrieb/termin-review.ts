// Nach jedem Termin (Ole, 13.11.2026): Aufgabe „Wie lief der Termin?“ + Push.
// Quellen: Calendly-Termine (SalesMeeting, nach Ende) und eigene Termin-Aufgaben
// („Termin“ aus „Termin vereinbart“, nach Fälligkeit). Das Ergebnis wird mit einem Klick
// eingetragen: Verlauf, Pipeline-Stufe und passende Folgeaufgabe.
//
// Stufe 2 (Ole, 18.11.2026): Nachfrage und Push 15 Minuten nach Terminende („Wie lief der Termin mit {Name}?“), genau
// einmal je Termin (reviewTaskId bzw. reviewCheckedAt; bei Termin-Aufgaben die erledigte Aufgabe) und nur, wenn noch kein
// Ergebnis bzw. keine eigene Notiz seit Terminbeginn eingetragen ist. Antippen öffnet die Kontaktakte mit „Wie lief der
// Termin?“ oben (#ergebnis, Knöpfe Abschluss, Angebot, Folgetermin, Bedenkzeit, Nicht erschienen, Kein Interesse).
// Aktions-Knöpfe in der Benachrichtigung selbst gibt es nicht: Web-Push zeigt höchstens zwei (iPhone keine), die App keine.

import { prisma } from "@/lib/prisma";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import { audit } from "@/lib/audit";
import { OUTCOME_BY_ID, STAGE_RANK, TERMIN_REVIEW_CHOICES, TERMIN_REVIEW_PREFIX, istTerminAufgabe, shortName } from "@/lib/vertrieb/crm";
import { addWorkdays, dayKey, fmtDateTime, fromDayKey } from "@/lib/vertrieb/dates";
import { hatErgebnis } from "@/lib/vertrieb/termine-uebersicht";
import type { SalesStage as Stage, SalesTaskType as TaskType } from "@/generated/prisma/enums";

const MIN = 60_000;
/** Ohne Endzeit gilt ein Termin nach 45 Minuten als vorbei. */
const DEFAULT_DURATION = 45 * MIN;
/** Nachfrage und Push so lange nach Terminende (Ole, 18.11.2026). */
export const NACHFRAGE_NACH = 15 * MIN;
/** Eigene Termin-Aufgaben (ohne Endzeit): Nachfrage 60 Minuten nach der Fälligkeit (45 Minuten Termin + 15). */
const MANUAL_GRACE = DEFAULT_DURATION + NACHFRAGE_NACH;
/** Ältere Termine nicht mehr nachfragen (beim ersten Lauf nur die letzten 24 Stunden). */
const LOOKBACK = 24 * 60 * MIN;

const reviewTitle = (name: string | null | undefined) => `${TERMIN_REVIEW_PREFIX}${name ? ` mit ${shortName(name)}` : ""}?`;
/** Name für Nachfrage und Push: wer gebucht hat, sonst Ansprechpartner, sonst die Agentur (gekürzt). */
const personVon = (c: { name: string; firstName: string | null; lastName: string | null }, invitee?: string | null) =>
  invitee?.trim() || [c.firstName, c.lastName].filter(Boolean).join(" ") || shortName(c.name);

/** Ergebnis oder eigene Notiz seit `ab` (Arten wie in der Termin-Übersicht)? */
async function ergebnisDa(contactId: string, ab: Date) {
  const akt = await prisma.salesActivity.findMany({
    where: { contactId, type: { in: ["ANRUF", "EMAIL", "NOTIZ", "TERMIN"] }, occurredAt: { gte: ab } },
    select: { contactId: true, type: true, outcome: true, note: true, occurredAt: true },
  });
  return hatErgebnis(akt, ab);
}

/** Legt 15 Minuten nach Terminende die Nachfrage-Aufgaben an und schickt den Push. Gibt die Anzahl neuer Aufgaben zurück. */
export async function createMeetingReviews(now = new Date()): Promise<number> {
  let created = 0;
  const since = new Date(now.getTime() - LOOKBACK);
  const kontakt = { select: { id: true, name: true, firstName: true, lastName: true } } as const;

  // 1) Gebuchte Termine (Calendly, Buchungsseite, von Hand), die seit 15 Minuten vorbei sind
  const meetings = await prisma.salesMeeting.findMany({
    where: { status: "GEPLANT", reviewTaskId: null, reviewCheckedAt: null, startAt: { gte: since, lte: now } },
    include: { contact: kontakt },
    take: 50,
  });
  for (const m of meetings) {
    const end = m.endAt ?? new Date(m.startAt.getTime() + DEFAULT_DURATION);
    if (end.getTime() + NACHFRAGE_NACH > now.getTime()) continue;
    const person = personVon(m.contact, m.inviteeName);
    // Ergebnis schon eingetragen (z. B. gleich nach dem Gespräch): keine Nachfrage, kein Push, nur merken
    if (await ergebnisDa(m.contactId, m.startAt)) {
      const merk = await prisma.salesMeeting.updateMany({ where: { id: m.id, reviewTaskId: null, reviewCheckedAt: null }, data: { reviewCheckedAt: now } });
      if (merk.count && m.taskId) await prisma.salesTask.updateMany({ where: { id: m.taskId, doneAt: null }, data: { doneAt: now } });
      continue;
    }
    const task = await prisma.salesTask.create({
      data: {
        contactId: m.contactId,
        title: reviewTitle(person),
        type: "TERMIN",
        dueAt: now,
        note: `${m.title} am ${fmtDateTime(m.startAt)}, Ergebnis mit einem Klick eintragen.`,
      },
    });
    // Nur setzen, wenn noch frei (paralleler Lauf legt keine zweite Aufgabe an)
    const claimed = await prisma.salesMeeting.updateMany({ where: { id: m.id, reviewTaskId: null, reviewCheckedAt: null }, data: { reviewTaskId: task.id, reviewCheckedAt: now } });
    if (!claimed.count) {
      await prisma.salesTask.delete({ where: { id: task.id } });
      continue;
    }
    // Die Termin-Aufgabe selbst ist damit erledigt
    if (m.taskId) await prisma.salesTask.updateMany({ where: { id: m.taskId, doneAt: null }, data: { doneAt: now } });
    created++;
    await push(m.contactId, person, m.id);
  }

  // 2) Eigene Termin-Aufgaben (ohne Buchung), deren Zeit seit 15 Minuten vorbei ist
  const linked = await prisma.salesMeeting.findMany({ where: { taskId: { not: null }, startAt: { gte: since } }, select: { taskId: true } });
  const linkedIds = linked.map((l) => l.taskId!).filter(Boolean);
  const manual = await prisma.salesTask.findMany({
    where: {
      type: "TERMIN",
      doneAt: null,
      dueAt: { gte: since, lte: new Date(now.getTime() - MANUAL_GRACE) },
      ...(linkedIds.length ? { id: { notIn: linkedIds } } : {}),
    },
    include: { contact: kontakt },
    take: 50,
  });
  for (const t of manual) {
    if (!istTerminAufgabe(t.title)) continue;
    // Erledigt setzen und Nachfrage anlegen, in einem Schritt, damit es keine doppelten Nachfragen gibt
    const done = await prisma.salesTask.updateMany({ where: { id: t.id, doneAt: null }, data: { doneAt: now } });
    if (!done.count) continue;
    if (t.contactId && (await ergebnisDa(t.contactId, t.dueAt))) continue;
    const person = t.contact ? personVon(t.contact) : null;
    await prisma.salesTask.create({
      data: {
        contactId: t.contactId,
        title: reviewTitle(person),
        type: "TERMIN",
        dueAt: now,
        note: `Termin am ${fmtDateTime(t.dueAt)}, Ergebnis mit einem Klick eintragen.`,
      },
    });
    created++;
    await push(t.contactId, person, t.id);
  }
  return created;
}

async function push(contactId: string | null, person: string | null, terminId: string) {
  await sendToAdmins({
    title: reviewTitle(person),
    body: "Antippen und mit einem Tipp eintragen: Angebot, Folgetermin, kein Interesse oder nicht erschienen.",
    url: contactId ? `/admin/neu/vertrieb/kontakte/${contactId}#ergebnis` : "/admin/neu/vertrieb/aufgaben",
    tag: `termin-review:${terminId}`,
  }).catch((e) => reportError(e, "termin-review-push"));
}

/** Folgeaufgabe nach „Wie lief der Termin?“, wenn sie von der beim Erfassen abweicht. */
const REVIEW_TASK: Record<string, { title: string; type: TaskType; workdays: number }> = {
  // Folgetermin: erst buchen (die Buchung bringt ihren eigenen Termin mit), kein Platzhalter „Termin“ in 2 Tagen
  termin: { title: "Folgetermin buchen", type: "TERMIN", workdays: 0 },
};

const ALLOWED = new Set(TERMIN_REVIEW_CHOICES.map((c) => c.outcome));

/**
 * Ergebnis eines Termins eintragen: Nachfrage erledigt, Verlauf, Stufe, Folgeaufgabe.
 * Bei „Kein Interesse“ werden alle offenen Aufgaben des Kontakts erledigt.
 */
export async function recordMeetingOutcome(taskId: string, outcomeId: string, now = new Date()): Promise<{ ok: true; contactId: string; activityId: string } | { ok: false; error: string }> {
  if (!ALLOWED.has(outcomeId)) return { ok: false, error: "Unbekanntes Ergebnis." };
  const outcome = OUTCOME_BY_ID[outcomeId];
  const task = await prisma.salesTask.findUnique({ where: { id: taskId }, include: { contact: { select: { id: true, stage: true, customerStage: true, lossReason: true, lastContactAt: true } } } });
  if (!task || !task.contact) return { ok: false, error: "Die Aufgabe gibt es nicht mehr." };
  if (task.doneAt) return { ok: false, error: "Das Ergebnis ist schon eingetragen." };
  const contact = task.contact;

  // Stufe nie zurückstufen (z. B. Gewonnen bleibt Gewonnen)
  let stage: Stage | undefined;
  if (outcome.stage && (outcome.stage === "VERLOREN" || STAGE_RANK[outcome.stage] >= STAGE_RANK[contact.stage])) stage = outcome.stage;

  // Für „Rückgängig“ (Ole, 24.11.2026): Zustand vorher, geschlossene und neue Aufgaben
  const geschlossen: string[] = [task.id];
  let neueAufgabe: string | null = null;
  const activityId = await prisma.$transaction(async (tx) => {
    await tx.salesTask.update({ where: { id: task.id }, data: { doneAt: now } });
    const act = await tx.salesActivity.create({ data: { contactId: contact.id, type: "TERMIN", outcome: outcome.label, occurredAt: now } });
    await tx.salesContact.update({
      where: { id: contact.id },
      data: {
        ...(stage ? { stage } : {}),
        ...(stage === "GEWONNEN" && !contact.customerStage ? { customerStage: "VERTRAG" } : {}),
        ...(stage === "VERLOREN" ? { lossReason: "KEIN_INTERESSE" } : stage ? { lossReason: null } : {}),
        lastContactAt: now,
      },
    });
    if (outcome.closesTasks) {
      const offen = await tx.salesTask.findMany({ where: { contactId: contact.id, doneAt: null }, select: { id: true } });
      geschlossen.push(...offen.map((o) => o.id));
      await tx.salesTask.updateMany({ where: { id: { in: offen.map((o) => o.id) } }, data: { doneAt: now } });
    }
    // Folgetermin schon gebucht: keine Aufgabe „Folgetermin buchen“
    const folge = REVIEW_TASK[outcomeId] ?? outcome.task;
    const schonGebucht = outcomeId === "termin" && (await tx.salesMeeting.count({ where: { contactId: contact.id, status: "GEPLANT", startAt: { gt: now } } })) > 0;
    if (folge && !schonGebucht) {
      const due = folge.workdays === 0 ? now : fromDayKey(dayKey(addWorkdays(now, folge.workdays)), "09:00");
      neueAufgabe = (await tx.salesTask.create({ data: { contactId: contact.id, title: folge.title, type: folge.type, dueAt: due } })).id;
    }
    return act.id;
  });
  await audit(RUECKGAENGIG_AKTION, {
    entity: "SalesActivity",
    entityId: activityId,
    details: {
      contactId: contact.id,
      outcome: outcomeId,
      vorher: { stage: contact.stage, customerStage: contact.customerStage, lossReason: contact.lossReason, lastContactAt: contact.lastContactAt?.toISOString() ?? null },
      nachher: { stage: stage ?? null },
      geschlossen,
      neueAufgabe,
    },
  });
  return { ok: true, contactId: contact.id, activityId };
}

const RUECKGAENGIG_AKTION = "vertrieb.termin_ergebnis";
/** Ergebnis-Bezeichnungen aus „Wie lief der Termin?“ (Verlaufseintrag Typ TERMIN), die sich zurücknehmen lassen. */
export const TERMIN_ERGEBNIS_LABELS = new Set(TERMIN_REVIEW_CHOICES.map((c) => OUTCOME_BY_ID[c.outcome]?.label).filter(Boolean));
/** Zurücknehmen bis 30 Tage nach dem Klick. */
const RUECKGAENGIG_TAGE = 30;

export function terminErgebnisRuecknehmbar(a: { type: string; outcome: string | null; occurredAt: Date }, now = new Date()): boolean {
  return a.type === "TERMIN" && !!a.outcome && TERMIN_ERGEBNIS_LABELS.has(a.outcome) && now.getTime() - a.occurredAt.getTime() < RUECKGAENGIG_TAGE * 86_400_000;
}

/**
 * Ergebnis aus „Wie lief der Termin?“ zurücknehmen (Ole, 24.11.2026: versehentlich „Kein Interesse“): Aufgaben wieder
 * öffnen, die der Klick geschlossen hat, Folgeaufgabe entfernen (wenn noch offen), Stufe, Verlustgrund und letzten
 * Kontakt wie vorher, Verlaufseintrag löschen. Ältere Klicks ohne Protokoll: Aufgaben mit gleichem Erledigt-Zeitpunkt
 * wieder öffnen, Stufe zurück auf „Termin“, wenn sie noch so steht, wie der Klick sie gesetzt hat.
 */
export async function undoMeetingOutcome(activityId: string, now = new Date()): Promise<{ ok: true; contactId: string } | { ok: false; error: string }> {
  const act = await prisma.salesActivity.findUnique({ where: { id: activityId } });
  if (!act || !terminErgebnisRuecknehmbar(act, now)) return { ok: false, error: "Das lässt sich nicht mehr zurücknehmen." };
  const log = await prisma.auditLog.findFirst({ where: { action: RUECKGAENGIG_AKTION, entityId: act.id }, orderBy: { at: "desc" } });
  const d = (log?.details ?? null) as {
    contactId?: string;
    vorher?: { stage: Stage; customerStage: string | null; lossReason: string | null; lastContactAt: string | null };
    nachher?: { stage: Stage | null };
    geschlossen?: string[];
    neueAufgabe?: string | null;
  } | null;
  if (d?.contactId && d.contactId !== act.contactId) return { ok: false, error: "Das lässt sich nicht mehr zurücknehmen." };
  const outcomeId = Object.values(OUTCOME_BY_ID).find((o) => o.label === act.outcome)?.id;
  const gesetzt: Stage | null = d?.nachher ? d.nachher.stage : (outcomeId && OUTCOME_BY_ID[outcomeId]?.stage) || null;
  const c = await prisma.salesContact.findUnique({ where: { id: act.contactId }, select: { stage: true } });
  if (!c) return { ok: false, error: "Den Kontakt gibt es nicht mehr." };

  await prisma.$transaction(async (tx) => {
    // Nur Aufgaben, die genau dieser Klick geschlossen hat (gleicher Zeitpunkt)
    await tx.salesTask.updateMany({
      where: { contactId: act.contactId, doneAt: act.occurredAt, ...(d?.geschlossen ? { id: { in: d.geschlossen } } : {}) },
      data: { doneAt: null },
    });
    if (d?.neueAufgabe) await tx.salesTask.deleteMany({ where: { id: d.neueAufgabe, contactId: act.contactId, doneAt: null } });
    // Stufe nur zurück, wenn sie noch so steht, wie der Klick sie gesetzt hat (sonst hat jemand danach etwas geändert)
    if (gesetzt && c.stage === gesetzt) {
      await tx.salesContact.update({
        where: { id: act.contactId },
        data: d?.vorher
          ? {
              stage: d.vorher.stage,
              lossReason: (d.vorher.lossReason as never) ?? null,
              ...(gesetzt === "GEWONNEN" ? { customerStage: (d.vorher.customerStage as never) ?? null } : {}),
              lastContactAt: d.vorher.lastContactAt ? new Date(d.vorher.lastContactAt) : null,
            }
          : { stage: "TERMIN", lossReason: null },
      });
    }
    await tx.salesActivity.delete({ where: { id: act.id } });
  });
  await audit("vertrieb.termin_ergebnis_rueckgaengig", { entity: "SalesContact", entityId: act.contactId, details: { outcome: act.outcome, at: act.occurredAt.toISOString() } });
  return { ok: true, contactId: act.contactId };
}
