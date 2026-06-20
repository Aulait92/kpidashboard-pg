"use server";

import { revalidatePath } from "next/cache";
import { markLeadAsCancelled } from "@/lib/airtable-write";
import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type CancelLeadState = {
  ok?: boolean;
  error?: string;
  leadId?: string;
};

// Storno aus dem Buyer-Dashboard. Schreibt zuerst nach Airtable (Source of
// Truth) und spiegelt das Ergebnis lokal in der DB, damit das UI sofort den
// neuen Status zeigt und nicht erst beim nächsten Sync nachzieht.
export async function cancelLeadAction(
  _prev: CancelLeadState,
  formData: FormData,
): Promise<CancelLeadState> {
  const session = await getCurrentSession();
  if (!session || session.role !== "BUYER" || !session.customerId) {
    return { error: "Nicht eingeloggt." };
  }

  const leadId = String(formData.get("leadId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!leadId) return { error: "Lead fehlt.", leadId };
  if (reason.length < 3) {
    return { error: "Bitte einen Stornogrund angeben (min. 3 Zeichen).", leadId };
  }

  // Zugriffsschutz: Buyer darf nur eigene Leads stornieren.
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, customerId: session.customerId },
    select: { id: true, airtableId: true, status: true },
  });
  if (!lead) {
    return { error: "Lead nicht gefunden.", leadId };
  }
  if (!lead.airtableId) {
    return {
      error: "Lead ohne Airtable-Referenz — bitte den Admin informieren.",
      leadId,
    };
  }
  if (lead.status && lead.status.toLowerCase().startsWith("storno")) {
    // Idempotent: schon storniert → erfolgreich quittieren.
    return { ok: true, leadId };
  }

  try {
    await markLeadAsCancelled({
      airtableId: lead.airtableId,
      reason,
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Storno fehlgeschlagen.",
      leadId,
    };
  }

  // Lokal sofort spiegeln, damit das Dashboard die Änderung anzeigt.
  await prisma.$transaction([
    prisma.lead.update({
      where: { id: lead.id },
      data: { status: "Storno", reached: false, closedAt: null },
    }),
    prisma.revenue.updateMany({
      where: { leadId: lead.id, cancelled: false },
      data: { cancelled: true },
    }),
  ]);

  revalidatePath("/buyer");
  return { ok: true, leadId };
}
