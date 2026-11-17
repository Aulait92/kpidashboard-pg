"use server";

// Aktionen der Startseite „Heute": wirken sofort, liefern einen Schnappschuss
// des vorherigen Zustands zurück, damit der Nutzer per Toast „Rückgängig"
// machen kann (undoInboxAction). Schreibrecht wie überall: eigener Kunde bzw.
// Admin-Vorschau nur für Demo-Leads.

import { revalidatePath } from "next/cache";
import { updateLeadEditableFields } from "@/lib/airtable-write";
import { getBuyerContext } from "@/lib/buyer-context";
import { conversationScope } from "@/lib/team";
import { writableCustomerId } from "@/lib/buyer-write";
import { syncFollowUpWithStatus, workdaysFromNow } from "@/lib/lead-followup";
import { prisma } from "@/lib/prisma";
import { recordUsage } from "@/lib/usage";
import { abschlussText, fmtDayShort, logLeadHistory, POLICY_TODO } from "@/lib/lead-history";
import { syncPrimaryContract } from "@/lib/vertraege";
import { startSequence, stopSequences } from "@/lib/lead-sequences";
import { registerCallAttempt, type CallAttemptResult } from "@/lib/call-attempts";
import { fmtAttemptAt } from "@/lib/call-plan";
import { anrufErledigt } from "@/lib/telefonat-server";

type LeadPrev = {
  status: string | null;
  contactAttempts: number;
  callbackSnoozedUntil: string | null;
  reached: boolean;
  closedAt: string | null;
  closeValue: number | null;
  followUpAt?: string | null;
  followUpNote?: string | null;
  /** Dokumentierte Anrufversuche (lib/call-attempts.ts) */
  callAttempts?: number;
  lastCallAttemptAt?: string | null;
  /** Verloren-Grund (lib/lead-lost.ts) */
  lost?: { reason: string | null; note: string | null; at: string | null; early: boolean; disqualifyReason: string | null };
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

export type InboxResult = { ok: true; undo?: UndoSnapshot; attempt?: CallAttemptResult & { nextLabel: string | null } } | { ok: false; error: string };

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
  followUpAt: true,
  followUpNote: true,
  source: true,
  policyDoneAt: true,
  callAttempts: true,
  lastCallAttemptAt: true,
} as const;

function snapshot(l: {
  status: string | null;
  contactAttempts: number;
  callbackSnoozedUntil: Date | null;
  reached: boolean;
  closedAt: Date | null;
  closeValue: unknown;
  followUpAt?: Date | null;
  followUpNote?: string | null;
  callAttempts?: number;
  lastCallAttemptAt?: Date | null;
}): LeadPrev {
  return {
    ...(l.callAttempts !== undefined ? { callAttempts: l.callAttempts, lastCallAttemptAt: l.lastCallAttemptAt?.toISOString() ?? null } : {}),
    followUpAt: l.followUpAt?.toISOString() ?? null,
    followUpNote: l.followUpNote ?? null,
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
  revalidatePath("/buyer/kontakte", "layout");
  revalidatePath("/buyer/zahlen");
}

/** Rückruf-Ergebnis: „Nicht erreicht" (morgen wieder) oder „Verloren". */
export async function callbackOutcomeResult(
  leadId: string,
  outcome: "not_reached" | "lost" | "offer" | "won",
  closeValue?: number | null,
  sparte?: string | null,
): Promise<InboxResult> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId }, select: leadSelect });
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  const prev = snapshot(lead);
  // Ergebnis eingetragen: Pause des Assistenten nach „Anrufen“ endet (lib/telefonat.ts)
  await anrufErledigt(lead.id);
  const now = new Date();

  if (outcome === "not_reached") {
    // Anrufversuch zählen (30-Minuten-Sperre), nächsten Versuch nach Plan, Nicht-erreicht-Abfolge, Verlauf
    const r = await registerCallAttempt(lead.id, { customerId, now });
    await recordUsage("action", "callback.not_reached");
    refresh();
    return { ok: true, ...(r?.counted ? { undo: { kind: "lead" as const, leadId, prev } } : {}), ...(r ? { attempt: { ...r, nextLabel: r.nextAt ? fmtAttemptAt(new Date(r.nextAt), now) : null } } : {}) };
  } else if (outcome === "offer" || outcome === "won") {
    // Am Telefon direkt Angebot geschickt bzw. abgeschlossen.
    const status = outcome === "won" ? "Abschluss" : "Angebot gesendet";
    const value = outcome === "won" && closeValue != null && Number.isFinite(closeValue) ? closeValue : null;
    if (lead.airtableId) {
      await updateLeadEditableFields({
        airtableId: lead.airtableId,
        bearbeitungsstatus: status,
        ...(outcome === "won" ? { closeValue: value } : {}),
      }).catch((e) => console.error("[inbox callback]", e));
    }
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        status,
        reached: true,
        callbackSnoozedUntil: null,
        ...(outcome === "won" ? { closedAt: now, closeValue: value } : {}),
        ...(!lead.firstContactAt ? { firstContactAt: now } : {}),
      },
    });
    await syncFollowUpWithStatus(lead.id, status);
    if (outcome === "won") await syncPrimaryContract(lead.id, { sparte, reopen: true }).catch((e) => console.error("[vertraege]", e));
    await logLeadHistory(lead.id, outcome === "won" ? "abschluss" : "anruf", outcome === "won" ? await abschlussText(customerId, lead.source, value, lead.id) : "Anruf: Angebot gesendet", { customerId });
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
    await syncFollowUpWithStatus(lead.id, "Kein Interesse");
    await logLeadHistory(lead.id, "anruf", "Anruf: kein Interesse", { customerId });
  }
  await recordUsage("action", `callback.${outcome}`);
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
  sparte?: string | null,
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
  // Ergebnis eingetragen: Pause des Assistenten nach „Anrufen“ endet (lib/telefonat.ts)
  await anrufErledigt(lead.id);
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
  await syncFollowUpWithStatus(lead.id, nextStatus);
  if (outcome === "closed") await syncPrimaryContract(lead.id, { sparte, reopen: true }).catch((e) => console.error("[vertraege]", e));
  await logLeadHistory(
    lead.id,
    outcome === "closed" ? "abschluss" : "status",
    outcome === "closed"
      ? await abschlussText(customerId, lead.source, value, lead.id)
      : outcome === "no_show"
        ? "Termin: nicht erschienen"
        : `Termin: ${nextStatus}`,
    { customerId },
  );
  if (outcome === "no_show") await startSequence(lead.id, "no_show").catch((e) => console.error("[lead-sequences]", e));
  await recordUsage("action", `outcome.${outcome}`);
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
    where: { id: conversationId, ...conversationScope(ctx) },
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
  await recordUsage("action", "chat.done");
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
      where: { id: undo.conversationId, ...conversationScope(ctx) },
      data: {
        needsAttention: undo.prev.needsAttention,
        attentionReason: undo.prev.attentionReason,
        attentionAt: undo.prev.attentionAt ? new Date(undo.prev.attentionAt) : null,
      },
    });
    await recordUsage("action", `undo.${undo.kind}`);
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
      ...(p.followUpAt !== undefined
        ? { followUpAt: p.followUpAt ? new Date(p.followUpAt) : null, followUpNote: p.followUpNote ?? null }
        : {}),
      ...(p.callAttempts !== undefined
        ? { callAttempts: p.callAttempts, lastCallAttemptAt: p.lastCallAttemptAt ? new Date(p.lastCallAttemptAt) : null }
        : {}),
      ...(p.lost
        ? { lostReason: p.lost.reason, lostNote: p.lost.note, lostAt: p.lost.at ? new Date(p.lost.at) : null, lostEarly: p.lost.early, disqualifyReason: p.lost.disqualifyReason }
        : {}),
    },
  });
  // Gerade gestartete Nachfass-Abfolge mit zurücknehmen.
  await stopSequences(lead.id, "Rückgängig gemacht", { since: new Date(Date.now() - 15 * 60 * 1000) }).catch((e) => console.error("[lead-sequences]", e));
  await recordUsage("action", `undo.${undo.kind}`);
  refresh();
  return { ok: true };
}

/**
 * Wiedervorlage setzen („Ruf mich in 1 Woche an"). days = Werktage ab heute
 * oder ein festes Datum (YYYY-MM-DD). Rückruf-Leads verschwinden bis dahin
 * aus der Rückrufliste und erscheinen am Fälligkeitstag unter „Heute".
 */
/**
 * Wiedervorlage angerufen, aber nicht erreicht (Ole, 16.11.2026: im Menü der Wiedervorlage fehlte „Nicht erreicht“):
 * Versuch zählen und im Verlauf festhalten wie beim Rückruf; die Wiedervorlage rückt auf den nächsten Werktag
 * (Notiz bleibt), statt überfällig in der Liste stehen zu bleiben.
 */
export async function followUpNotReachedResult(leadId: string): Promise<InboxResult> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId }, select: leadSelect });
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  const prev = snapshot(lead);
  // Ergebnis eingetragen: Pause des Assistenten nach „Anrufen“ endet (lib/telefonat.ts)
  await anrufErledigt(lead.id);
  const now = new Date();
  await registerCallAttempt(lead.id, { customerId, now });
  const cur = await prisma.lead.findUnique({ where: { id: lead.id }, select: { followUpAt: true } });
  // Hat der Anrufplan keinen späteren Versuch gesetzt: Wiedervorlage auf den nächsten Werktag
  if (!cur?.followUpAt || cur.followUpAt.getTime() <= now.getTime() + 4 * 60 * 60 * 1000) {
    const at = workdaysFromNow(1);
    await prisma.lead.update({ where: { id: lead.id }, data: { followUpAt: at, followUpNote: lead.followUpNote ?? null, callbackSnoozedUntil: at } });
  }
  await recordUsage("action", "followup.not_reached");
  refresh();
  return { ok: true, undo: { kind: "lead", leadId, prev } };
}

export async function setFollowUpResult(
  leadId: string,
  when: { days: number } | { date: string; time?: string | null },
  note?: string | null,
): Promise<InboxResult> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId }, select: leadSelect });
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  const prev = snapshot(lead);
  // Ergebnis eingetragen: Pause des Assistenten nach „Anrufen“ endet (lib/telefonat.ts)
  await anrufErledigt(lead.id);
  let at: Date;
  if ("days" in when) {
    at = workdaysFromNow(Math.max(1, Math.min(60, Math.round(when.days))));
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(when.date)) return { ok: false, error: "Ungültiges Datum." };
    if (when.time) {
      // Rückruf mit Uhrzeit (Ole, 17.11.2026): genauer Zeitpunkt, steht auch im Kalender des Beraters
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(when.time)) return { ok: false, error: "Ungültige Uhrzeit." };
      const { berlinAt } = await import("@/lib/calendar/lead-times");
      at = berlinAt(when.date, when.time);
      if (at.getTime() < Date.now()) return { ok: false, error: "Die Uhrzeit liegt in der Vergangenheit." };
    } else {
      at = new Date(`${when.date}T08:00:00.000Z`);
      if (at.getTime() < Date.now() - 24 * 60 * 60 * 1000) return { ok: false, error: "Datum liegt in der Vergangenheit." };
    }
  }
  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      followUpAt: at,
      followUpNote: (note ?? "").trim().slice(0, 200) || lead.followUpNote || null,
      callbackSnoozedUntil: at,
    },
  });
  const noteText = (note ?? "").trim() || lead.followUpNote;
  const mitZeit = "date" in when && !!when.time;
  // Kalender: Rückruf mit Uhrzeit eintragen, sonst einen früheren Eintrag entfernen
  const rk = await import("@/lib/calendar/rueckruf");
  const imKalender = mitZeit ? (await rk.rueckrufInKalender(lead.id, at, { appUrl: process.env.APP_URL ?? null })) === "eingetragen" : (await rk.rueckrufAusKalender(lead.id), false);
  await logLeadHistory(
    lead.id,
    "wiedervorlage",
    `${mitZeit ? `Rückruf ${fmtDayShort(at)} ${when.time} Uhr${imKalender ? " (im Kalender)" : ""}` : `Wiedervorlage ${fmtDayShort(at)}`}${noteText ? ` · ${noteText}` : ""}`,
    { customerId },
  );
  await recordUsage("action", "followup.set", { meta: "days" in when ? { days: when.days } : { date: true } });
  refresh();
  return { ok: true, undo: { kind: "lead", leadId, prev } };
}

/** Wiedervorlage erledigt (entfernt). */
export async function clearFollowUpResult(leadId: string): Promise<InboxResult> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId }, select: leadSelect });
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  const prev = snapshot(lead);
  // Ergebnis eingetragen: Pause des Assistenten nach „Anrufen“ endet (lib/telefonat.ts)
  await anrufErledigt(lead.id);
  // Rückruf erledigt: Kalender-Eintrag entfernen (lib/calendar/rueckruf.ts)
  await (await import("@/lib/calendar/rueckruf")).rueckrufAusKalender(lead.id);
  // „Police fertig machen“ erledigt → Police abgehakt
  const police = lead.followUpNote === POLICY_TODO && !lead.policyDoneAt;
  await prisma.lead.update({ where: { id: lead.id }, data: { followUpAt: null, followUpNote: null, ...(police ? { policyDoneAt: new Date() } : {}) } });
  await logLeadHistory(lead.id, police ? "police" : "wiedervorlage", police ? "Police fertig gemacht" : `Wiedervorlage erledigt${lead.followUpNote ? ` · ${lead.followUpNote}` : ""}`, { customerId });
  await recordUsage("action", "followup.done");
  refresh();
  return { ok: true, undo: { kind: "lead", leadId, prev } };
}
