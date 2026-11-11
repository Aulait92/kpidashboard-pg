"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { validHeuteKey } from "@/lib/admin-heute";
import { decideStorno } from "@/lib/ppl/storno";
import { addDays } from "@/lib/vertrieb/dates";
import { gewaehreFall, lehneFallAb } from "@/lib/garantien-server";

// Sofort-Aktionen in „Heute“ (Admin-A). Jede Aktion liefert, was „Rückgängig“
// braucht. Server Functions sind per POST direkt erreichbar → überall requireAuth.

export type HeuteResult = { ok: true; message: string; undo?: HeuteUndo } | { ok: false; error: string };
export type HeuteUndo =
  | { kind: "task-open"; taskId: string }
  | { kind: "task-due"; taskId: string; dueAt: string }
  | { kind: "undismiss"; key: string; activityId?: string };

const DAY = 86_400_000;

function refresh(contactId?: string | null) {
  revalidatePath("/admin/heute");
  revalidatePath("/admin/vertrieb", "layout");
  if (contactId) revalidatePath(`/admin/vertrieb/kontakte/${contactId}`);
}

const fail = (error = "Das hat nicht geklappt. Bitte die Seite neu laden."): HeuteResult => ({ ok: false, error });

export async function completeTaskAction(taskId: string): Promise<HeuteResult> {
  await requireAuth();
  const t = await prisma.salesTask.findUnique({ where: { id: String(taskId) }, select: { id: true, doneAt: true, contactId: true } });
  if (!t) return fail("Die Aufgabe gibt es nicht mehr.");
  if (!t.doneAt) await prisma.salesTask.update({ where: { id: t.id }, data: { doneAt: new Date() } });
  refresh(t.contactId);
  return { ok: true, message: "Aufgabe erledigt", undo: { kind: "task-open", taskId: t.id } };
}

export async function postponeTaskAction(taskId: string): Promise<HeuteResult> {
  await requireAuth();
  const t = await prisma.salesTask.findUnique({ where: { id: String(taskId) }, select: { id: true, dueAt: true, contactId: true } });
  if (!t) return fail("Die Aufgabe gibt es nicht mehr.");
  // Überfällige auf morgen zur gleichen Uhrzeit, sonst einen Tag weiter (wie „Verschieben“ im Vertrieb).
  const now = new Date();
  const base = t.dueAt < now ? new Date(new Date(now).setUTCHours(t.dueAt.getUTCHours(), t.dueAt.getUTCMinutes(), 0, 0)) : t.dueAt;
  await prisma.salesTask.update({ where: { id: t.id }, data: { dueAt: addDays(base, 1) } });
  refresh(t.contactId);
  return { ok: true, message: "Auf morgen verschoben", undo: { kind: "task-due", taskId: t.id, dueAt: t.dueAt.toISOString() } };
}

export async function decideStornoQuickAction(leadId: string, approve: boolean): Promise<HeuteResult> {
  await requireAuth();
  const done = await decideStorno(String(leadId), approve === true);
  revalidatePath("/admin/heute");
  revalidatePath("/admin/ppl", "layout");
  if (!done) return fail("Diese Reklamation ist schon entschieden.");
  return { ok: true, message: approve ? "Reklamation anerkannt, Gutschrift auf die nächste Rechnung" : "Reklamation abgelehnt" };
}

/** Garantiefall gewähren: Stripe-Gutschrift + Protokoll (kein „Rückgängig“ – Gutschrift ist gebucht). */
export async function garantieGewaehrenAction(fallId: string): Promise<HeuteResult> {
  const session = await requireAuth();
  const res = await gewaehreFall(String(fallId), { id: session.userId, email: session.email, role: session.role });
  revalidatePath("/admin/heute");
  revalidatePath("/admin/kunden", "layout");
  return res.ok ? { ok: true, message: res.message } : fail(res.error);
}

/** Garantiefall ablehnen (Begründung Pflicht) + Protokoll. */
export async function garantieAblehnenAction(fallId: string, grund: string): Promise<HeuteResult> {
  const session = await requireAuth();
  const res = await lehneFallAb(String(fallId), String(grund ?? ""), { id: session.userId, email: session.email, role: session.role });
  revalidatePath("/admin/heute");
  revalidatePath("/admin/kunden", "layout");
  return res.ok ? { ok: true, message: res.message } : fail(res.error);
}

/** Angebot nachgefasst: Notiz am Kontakt und 5 Tage ausblenden. */
export async function offerFollowedUpAction(offerId: string, contactId: string): Promise<HeuteResult> {
  const session = await requireAuth();
  const offer = await prisma.offer.findUnique({ where: { id: String(offerId) }, select: { id: true, salesContactId: true } });
  if (!offer || offer.salesContactId !== contactId) return fail("Das Angebot gibt es nicht mehr.");
  const key = `offer:${offer.id}`;
  const [activity] = await prisma.$transaction([
    prisma.salesActivity.create({ data: { contactId, type: "NOTIZ", note: "Angebot nachgefasst (aus „Heute“)" }, select: { id: true } }),
    dismissQuery(session.userId, key, 5),
  ]);
  refresh(contactId);
  return { ok: true, message: "Als nachgefasst notiert, kommt in 5 Tagen wieder", undo: { kind: "undismiss", key, activityId: activity.id } };
}

/** „Später“, „Gelesen“, „Erledigt“: Punkt für einige Tage ausblenden. */
export async function dismissAction(key: string, days: number): Promise<HeuteResult> {
  const session = await requireAuth();
  if (!validHeuteKey(key)) return fail();
  const d = Math.min(60, Math.max(1, Math.round(Number(days) || 1)));
  await dismissQuery(session.userId, key, d);
  revalidatePath("/admin/heute");
  return { ok: true, message: d === 1 ? "Kommt morgen wieder" : d >= 30 ? "Ausgeblendet" : `Kommt in ${d} Tagen wieder, falls noch offen`, undo: { kind: "undismiss", key } };
}

export async function undoHeuteAction(undo: HeuteUndo): Promise<HeuteResult> {
  const session = await requireAuth();
  if (undo.kind === "task-open") {
    const t = await prisma.salesTask.update({ where: { id: String(undo.taskId) }, data: { doneAt: null }, select: { contactId: true } }).catch(() => null);
    if (!t) return fail();
    refresh(t.contactId);
  } else if (undo.kind === "task-due") {
    const dueAt = new Date(undo.dueAt);
    if (Number.isNaN(dueAt.getTime())) return fail();
    const t = await prisma.salesTask.update({ where: { id: String(undo.taskId) }, data: { dueAt }, select: { contactId: true } }).catch(() => null);
    if (!t) return fail();
    refresh(t.contactId);
  } else if (undo.kind === "undismiss") {
    if (!validHeuteKey(undo.key)) return fail();
    await prisma.adminDismissal.deleteMany({ where: { userId: session.userId, key: undo.key } });
    if (undo.activityId) {
      // Nur die eben angelegte Notiz entfernen (gleicher Text, jung)
      await prisma.salesActivity.deleteMany({
        where: { id: String(undo.activityId), note: "Angebot nachgefasst (aus „Heute“)", occurredAt: { gt: new Date(Date.now() - DAY) } },
      });
    }
    refresh();
  } else {
    return fail();
  }
  return { ok: true, message: "Rückgängig gemacht" };
}

function dismissQuery(userId: string, key: string, days: number) {
  const until = new Date(Date.now() + days * DAY);
  return prisma.adminDismissal.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, until },
    update: { until },
  });
}
