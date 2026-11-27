"use server";

// Lead-Verlauf: Notiz posten/löschen, Police abhaken (Ole, 13.11.2026).

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { prisma } from "@/lib/prisma";
import { recordUsage } from "@/lib/usage";
import { loadLeadHistory, logLeadHistory, POLICY_TODO, type LeadHistoryEntry } from "@/lib/lead-history";

/** Notiz als Anruf-Ergebnis erkannt (lib/notiz-anruf.ts): Hinweis für den Toast, bei falscher Nummer mit Angebot. */
export type NotizHinweis = { art: "nicht_erreicht"; text: string } | { art: "falsche_nummer"; text: string; mail: boolean };
type Result = { ok: true; history: LeadHistoryEntry[]; hinweis?: NotizHinweis } | { ok: false; error: string };

async function done(leadId: string): Promise<Result> {
  revalidatePath(`/buyer/leads/${leadId}`);
  revalidatePath("/buyer");
  const ctx = await getBuyerContext();
  return { ok: true, history: await loadLeadHistory(leadId, ctx?.userId ?? null) };
}

export async function addLeadNoteAction(leadId: string, text: string): Promise<Result> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  const note = text.trim();
  if (!note) return { ok: false, error: "Bitte etwas eingeben." };
  if (note.length > 4000) return { ok: false, error: "Die Notiz ist zu lang (höchstens 4.000 Zeichen)." };
  await logLeadHistory(leadId, "notiz", note, { customerId });
  await recordUsage("action", "lead.note");
  // Notiz wie „nicht erreicht“ oder „Rufnummer ungültig“ (Ole, 27.11.2026): als Anruf-Ergebnis werten, damit der
  // Anrufplan weiterläuft bzw. stoppt und keine Wiedervorlagen liegen bleiben
  const hinweis = await notizAlsAnruf(leadId, customerId, note).catch(() => undefined);
  const res = await done(leadId);
  return res.ok && hinweis ? { ...res, hinweis } : res;
}

export async function deleteLeadNoteAction(leadId: string, entryId: string): Promise<Result> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  const ctx = await getBuyerContext();
  const entry = await prisma.leadHistory.findFirst({ where: { id: entryId, leadId, customerId, kind: "notiz" } });
  if (!entry) return { ok: false, error: "Notiz nicht gefunden." };
  // Eigene Notizen löschen; der Inhaber darf alle Notizen seines Teams löschen
  if (entry.userId && entry.userId !== ctx?.userId && ctx?.teamRole !== "owner") return { ok: false, error: "Nur eigene Notizen können gelöscht werden." };
  await prisma.leadHistory.delete({ where: { id: entry.id } });
  return done(leadId);
}

/** Police nach dem Abschluss abhaken (oder wieder öffnen). */
export async function setPolicyDoneAction(leadId: string, isDone: boolean): Promise<Result> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId }, select: { id: true, followUpNote: true, policyDoneAt: true } });
  if (!lead) return { ok: false, error: "Lead nicht gefunden." };
  if (isDone === !!lead.policyDoneAt) return done(leadId);
  await prisma.lead.update({
    where: { id: lead.id },
    data: isDone
      ? { policyDoneAt: new Date(), ...(lead.followUpNote === POLICY_TODO ? { followUpAt: null, followUpNote: null } : {}) }
      : { policyDoneAt: null, followUpAt: new Date(), followUpNote: POLICY_TODO },
  });
  await logLeadHistory(lead.id, "police", isDone ? "Police fertig gemacht" : "Police wieder offen", { customerId });
  return done(leadId);
}

async function notizAlsAnruf(leadId: string, customerId: string, note: string): Promise<NotizHinweis | undefined> {
  const { notizAnruf } = await import("@/lib/notiz-anruf");
  const art = notizAnruf(note);
  if (!art) return undefined;
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId }, select: { closedAt: true, status: true, email: true } });
  if (!lead || lead.closedAt || /^(abschluss|kein interesse|disqualifiziert)$/i.test((lead.status ?? "").trim())) return undefined;
  const ctx = await getBuyerContext();
  if (art === "nicht_erreicht") {
    const { registerCallAttempt } = await import("@/lib/call-attempts");
    const { CALL_ATTEMPTS_TARGET, fmtAttemptAt } = await import("@/lib/call-plan");
    const r = await registerCallAttempt(leadId, { customerId, userId: ctx?.userId ?? null });
    if (!r) return undefined;
    await recordUsage("action", "lead.note.nicht_erreicht");
    if (!r.counted) return { art, text: "Der Anrufversuch war schon eingetragen." };
    const naechster = r.nextAt ? `, nächster Versuch ${fmtAttemptAt(new Date(r.nextAt), new Date())}` : "";
    return { art, text: `Als Anrufversuch gezählt (${Math.min(r.attempts, CALL_ATTEMPTS_TARGET)} von ${CALL_ATTEMPTS_TARGET})${naechster}.` };
  }
  const { stoppeAnrufplan } = await import("@/lib/call-attempts");
  await stoppeAnrufplan(leadId);
  await recordUsage("action", "lead.note.falsche_nummer");
  return { art, text: "Anrufplan gestoppt.", mail: !!lead.email?.trim() };
}
