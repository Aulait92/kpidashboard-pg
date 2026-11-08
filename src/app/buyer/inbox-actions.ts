"use server";

// Aktionen der Startseite „Heute": wirken sofort, liefern einen Schnappschuss
// des vorherigen Zustands zurück, damit der Nutzer per Toast „Rückgängig"
// machen kann (undoInboxAction). Schreibrecht wie überall: eigener Kunde bzw.
// Admin-Vorschau nur für Demo-Leads.

import { revalidatePath } from "next/cache";
import { updateLeadEditableFields } from "@/lib/airtable-write";
import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { prisma } from "@/lib/prisma";

type LeadPrev = {
  status: string | null;
  contactAttempts: number;
  callbackSnoozedUntil: string | null;
  reached: boolean;
  closedAt: string | null;
  closeValue: number | null;
};

export type UndoSnapshot =
  | {
      kind: "lead";
      leadId: string;
      prev: LeadPrev;
      appointment?: { id: string; status: string };
    }
  | {
      kind: "chat";
      conversationId: string;
      prev: { needsAttention: boolean; attentionReason: string | null; attentionAt: string | null };
    };

export type InboxResult = { ok: true; undo?: UndoSnapshot } | { ok: false; error: string };

const leadSelect = {
  id: true,
  airtableId: true,
  status: true,
  contactAttempts: true,
  callbackSnoozedUntil: true,
  reached: true,
  closedAt: true,
  closeValue: true,
  firstContactAt: true,
} as const;

function snapshot(l: {
  status: string | null;
  contactAttempts: number;
  callbackSnoozedUntil: Date | null;
  reached: boolean;
  closedAt: Date | null;
  closeValue: unknown;
}): LeadPrev {
  return {
    status: l.status,
    contactAttempts: l.contactAttempts,
    callbackSnoozedUntil: l.callbackSnoozedUntil?.toISOString() ?? null,
    reached: l.reached,
    closedAt: l.closedAt?.toISOString() ?? null,
    closeValue: l.closeValue == null ? null : Number(l.closeValue),
  };
}

function refresh() {
  revalidatePath("/buyer");
  revalidatePath("/buyer/leads");
  revalidatePath("/buyer/kanban");
  revalidatePath("/buyer/zahlen");
}

/** Rückruf-Ergebnis: „Nicht erreicht" (morgen wieder) oder „Verloren". */
export async function callbackOutcomeResult(
  leadId: string,
  outcome: "not_reached" | "lost",
): Promise<InboxResult> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId }, select: leadSelect });
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  const prev = snapshot(lead);
  const now = new Date();

  if (outcome === "not_reached") {
    const attempts = lead.contactAttempts + 1;
    const s = (lead.status ?? "").trim().toLowerCase();
    const nextStatus = s === "" || s === "neuer lead" ? "Nicht erreicht" : null;
    if (lead.airtableId) {
      await updateLeadEditableFields({
        airtableId: lead.airtableId,
        kontaktversuche: attempts,
        ...(nextStatus ? { bearbeitungsstatus: nextStatus } : {}),
        ...(!lead.firstContactAt ? { ersterKontaktversuch: now.toISOString() } : {}),
      }).catch((e) => console.error("[inbox callback]", e));
    }
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        contactAttempts: attempts,
        callbackSnoozedUntil: new Date(now.getTime() + 20 * 60 * 60 * 1000),
        ...(nextStatus ? { status: nextStatus, reached: false } : {}),
        ...(!lead.firstContactAt ? { firstContactAt: now } : {}),
      },
    });
  } else {
    if (lead.airtableId) {
      await updateLeadEditableFields({
        airtableId: lead.airtableId,
        bearbeitungsstatus: "Kein Interesse",
      }).catch((e) => console.error("[inbox callback]", e));
    }
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: "Kein Interesse", reached: true },
    });
  }
  refresh();
  return { ok: true, undo: { kind: "lead", leadId, prev } };
}

const OUTCOME_STATUS: Record<string, string> = {
  offer: "Angebot gesendet",
  closed: "Abschluss",
  lost: "Kein Interesse",
  no_show: "Im Gespräch",
};

/** Ergebnis eines vergangenen Termins („Wie lief's?"). */
export async function appointmentOutcomeResult(
  appointmentId: string,
  outcome: "offer" | "closed" | "lost" | "no_show",
  closeValue?: number | null,
): Promise<InboxResult> {
  const nextStatus = OUTCOME_STATUS[outcome];
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, leadId: true, customerId: true, status: true },
  });
  if (!appt?.leadId || !nextStatus) return { ok: false, error: "Termin nicht gefunden." };
  const customerId = await writableCustomerId(appt.leadId);
  if (!customerId || customerId !== appt.customerId) {
    return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  }
  const lead = await prisma.lead.findUnique({ where: { id: appt.leadId }, select: leadSelect });
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  const prev = snapshot(lead);
  const value = outcome === "closed" && closeValue != null && Number.isFinite(closeValue) ? closeValue : null;

  await prisma.appointment.update({
    where: { id: appt.id },
    data: { status: outcome === "no_show" ? "no_show" : "completed" },
  });
  if (lead.airtableId) {
    await updateLeadEditableFields({
      airtableId: lead.airtableId,
      bearbeitungsstatus: nextStatus,
      ...(outcome === "closed" ? { closeValue: value } : {}),
    }).catch((e) => console.error("[inbox outcome]", e));
  }
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status: nextStatus,
      reached: true,
      closedAt: outcome === "closed" ? new Date() : null,
      ...(outcome === "closed" ? { closeValue: value } : {}),
      ...(outcome === "no_show" ? { callbackSnoozedUntil: null } : {}),
    },
  });
  refresh();
  return {
    ok: true,
    undo: { kind: "lead", leadId: lead.id, prev, appointment: { id: appt.id, status: appt.status } },
  };
}

/** „Braucht dich" erledigt. */
export async function chatDoneResult(conversationId: string): Promise<InboxResult> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Nicht angemeldet." };
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, customerId: ctx.customerId },
    select: { id: true, needsAttention: true, attentionReason: true, attentionAt: true, leadId: true },
  });
  if (!conv) return { ok: false, error: "Chat nicht gefunden." };
  // Vorschau: nur Demo-Chats.
  if (ctx.preview && !(conv.leadId && (await writableCustomerId(conv.leadId)))) {
    return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  }
  await prisma.conversation.update({
    where: { id: conv.id },
    data: { needsAttention: false, attentionReason: null, attentionAt: null },
  });
  refresh();
  revalidatePath("/buyer/chats");
  return {
    ok: true,
    undo: {
      kind: "chat",
      conversationId: conv.id,
      prev: {
        needsAttention: conv.needsAttention,
        attentionReason: conv.attentionReason,
        attentionAt: conv.attentionAt?.toISOString() ?? null,
      },
    },
  };
}

/** Rückgängig: vorherigen Zustand wiederherstellen (DB + Airtable-Status). */
export async function undoInboxAction(undo: UndoSnapshot): Promise<InboxResult> {
  if (undo.kind === "chat") {
    const ctx = await getBuyerContext();
    if (!ctx) return { ok: false, error: "Nicht angemeldet." };
    await prisma.conversation.updateMany({
      where: { id: undo.conversationId, customerId: ctx.customerId },
      data: {
        needsAttention: undo.prev.needsAttention,
        attentionReason: undo.prev.attentionReason,
        attentionAt: undo.prev.attentionAt ? new Date(undo.prev.attentionAt) : null,
      },
    });
    refresh();
    revalidatePath("/buyer/chats");
    return { ok: true };
  }
  const customerId = await writableCustomerId(undo.leadId);
  if (!customerId) return { ok: false, error: "Nicht erlaubt." };
  const lead = await prisma.lead.findFirst({
    where: { id: undo.leadId, customerId },
    select: { id: true, airtableId: true },
  });
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  const p = undo.prev;
  if (undo.appointment) {
    await prisma.appointment.updateMany({
      where: { id: undo.appointment.id, customerId },
      data: { status: undo.appointment.status },
    });
  }
  if (lead.airtableId) {
    await updateLeadEditableFields({
      airtableId: lead.airtableId,
      ...(p.status ? { bearbeitungsstatus: p.status } : {}),
      kontaktversuche: p.contactAttempts,
      closeValue: p.closeValue,
    }).catch((e) => console.error("[inbox undo]", e));
  }
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      status: p.status,
      contactAttempts: p.contactAttempts,
      callbackSnoozedUntil: p.callbackSnoozedUntil ? new Date(p.callbackSnoozedUntil) : null,
      reached: p.reached,
      closedAt: p.closedAt ? new Date(p.closedAt) : null,
      closeValue: p.closeValue,
    },
  });
  refresh();
  return { ok: true };
}
