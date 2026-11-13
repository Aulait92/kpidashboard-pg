"use server";

// Lead-Verlauf: Notiz posten/löschen, Police abhaken (Ole, 13.11.2026).

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { writableCustomerId } from "@/lib/buyer-write";
import { prisma } from "@/lib/prisma";
import { recordUsage } from "@/lib/usage";
import { loadLeadHistory, logLeadHistory, POLICY_TODO, type LeadHistoryEntry } from "@/lib/lead-history";

type Result = { ok: true; history: LeadHistoryEntry[] } | { ok: false; error: string };

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
  return done(leadId);
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
