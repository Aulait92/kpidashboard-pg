"use server";

// Lead-Stammdaten im Kontakt korrigieren (Ole, 14.11.2026). Berater nur bei eigenen Leads (writableCustomerId).

import { revalidatePath } from "next/cache";
import { getBuyerContext } from "@/lib/buyer-context";
import { adminVorschauCustomerId, writableCustomerId } from "@/lib/buyer-write";
import { fetchLeadRecord } from "@/lib/airtable-write";
import { prisma } from "@/lib/prisma";
import { recordUsage } from "@/lib/usage";
import { erstnachrichtAnNeueNummer, saveLeadStammdaten, type SaveStammdatenResult, type StammdatenInput } from "@/lib/lead-stammdaten";

export async function saveLeadStammdatenAction(leadId: string, input: Partial<StammdatenInput>): Promise<SaveStammdatenResult> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: "Diesen Lead können Sie nicht bearbeiten." };
  const ctx = await getBuyerContext();
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId }, select: { airtableId: true } });
  let fields: Record<string, unknown> | null = null;
  if (lead?.airtableId) {
    try {
      fields = await fetchLeadRecord({ airtableId: lead.airtableId });
    } catch {
      /* ohne Airtable-Felder: Verlauf zeigt dann nur die bekannten Werte */
    }
  }
  const r = await saveLeadStammdaten({ leadId, customerId, userId: ctx?.userId ?? null, input, fields });
  if (r.ok && r.changed.length) {
    await recordUsage("action", "lead.stammdaten");
    revalidatePath(`/buyer/leads/${leadId}`);
    revalidatePath("/buyer/leads");
    revalidatePath("/buyer");
  }
  return r;
}

/** Nach dem Ändern der Nummer: Erstnachricht per WhatsApp an die neue Nummer (Klick des Vermittlers, Ole 22.11.2026). */
export async function erstnachrichtAnNeueNummerAction(leadId: string): Promise<{ ok: boolean; text: string }> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, text: "Diesen Lead können Sie nicht bearbeiten." };
  const r = await erstnachrichtAnNeueNummer(leadId, customerId);
  if (r.ok) {
    await recordUsage("action", "lead.erstnachricht_neue_nummer");
    revalidatePath(`/buyer/leads/${leadId}`);
  }
  return r;
}

/**
 * „Hat doch WhatsApp“ (Ole, 23.11.2026): Meta meldet 131026 auch, wenn der Lead WhatsApp hat, aber eine alte Version
 * nutzt oder die Nutzungsbedingungen noch nicht bestätigt hat. Der Vermittler hebt „Kein WhatsApp“ per Klick auf, die
 * App versucht es erneut (wie nach einer Nummernkorrektur). Kommt wieder 131026, markiert der Webhook den Lead erneut.
 */
export async function dochWhatsAppAction(leadId: string): Promise<{ ok: boolean; text: string }> {
  // Admin in der Vorschau darf das auch bei echten Leads (wie Nachrichten steuern, lib/buyer-write.ts)
  const customerId = (await writableCustomerId(leadId)) ?? (await adminVorschauCustomerId(leadId));
  if (!customerId) return { ok: false, text: "Diesen Lead können Sie nicht bearbeiten." };
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId, erasedAt: null }, select: { id: true, waUnavailableAt: true } });
  if (!lead?.waUnavailableAt) return { ok: false, text: "Der Kontakt ist nicht als „Kein WhatsApp“ markiert." };
  const ctx = await getBuyerContext();
  const { logLeadHistory } = await import("@/lib/lead-history");
  await logLeadHistory(leadId, "status", "„Kein WhatsApp“ aufgehoben: Die Nummer hat laut Ihnen WhatsApp. Neuer Versuch per WhatsApp.", {
    customerId,
    userId: ctx?.userId ?? null,
  });
  const { nachNummernKorrektur } = await import("@/lib/whatsapp/kein-whatsapp");
  const r = await nachNummernKorrektur(leadId);
  await recordUsage("action", "lead.doch_whatsapp");
  revalidatePath(`/buyer/leads/${leadId}`);
  revalidatePath("/buyer/leads");
  revalidatePath("/buyer");
  if (r === "termin") return { ok: true, text: "Die Terminbestätigung geht per WhatsApp raus. Kommt sie nicht an, sehen Sie das hier wieder." };
  if (r === "erstanschreiben") return { ok: true, text: "Der Assistent schreibt per WhatsApp. Kommt die Nachricht nicht an, sehen Sie das hier wieder." };
  return { ok: true, text: "„Kein WhatsApp“ ist aufgehoben. Der Assistent schreibt beim nächsten Anlass per WhatsApp." };
}
