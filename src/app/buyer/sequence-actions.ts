"use server";

// Lead-Detail: laufende Nachfass-Abfolge stoppen bzw. für eine Bedenkzeit pausieren (Paket P5).

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { getCurrentSession } from "@/lib/auth";
import { writableCustomerId } from "@/lib/buyer-write";
import { bedenkzeitAusDatum, bedenkzeitDatum, istBedenkzeitWahl, tagKurz } from "@/lib/bedenkzeit";
import { startBedenkzeit, stopSequences } from "@/lib/lead-sequences";
import { recordUsage } from "@/lib/usage";

export async function stopLeadSequenceAction(leadId: string): Promise<{ ok: boolean; error?: string }> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  const n = await stopSequences(leadId, "Vom Berater gestoppt");
  if (n > 0) {
    await audit("lead.sequence_stop", { entity: "Lead", entityId: leadId, customerId });
    await recordUsage("action", "sequence.stop");
  }
  revalidatePath(`/buyer/leads/${leadId}`);
  revalidatePath("/buyer");
  return { ok: true };
}

/**
 * Bedenkzeit eintragen („meldet sich am …“): 1 Woche, 2 Wochen, Ende des Monats oder ein Datum (YYYY-MM-DD). Das
 * Nachfassen zum Angebot pausiert und startet an dem Tag neu (lib/lead-sequences.ts startBedenkzeit).
 */
export async function bedenkzeitAction(leadId: string, wann: { wahl?: string; datum?: string }): Promise<{ ok: true; bis: string; text: string } | { ok: false; error: string }> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  const now = new Date();
  const bis = istBedenkzeitWahl(wann.wahl) ? bedenkzeitDatum(wann.wahl, now) : bedenkzeitAusDatum(wann.datum, now);
  if (!bis) return { ok: false, error: "Bitte ein Datum ab morgen wählen (höchstens 90 Tage)." };
  const session = await getCurrentSession();
  const seq = await startBedenkzeit(leadId, bis, { quelle: "vermittler", userId: session?.userId ?? null, now });
  if (!seq) return { ok: false, error: "Kontakt nicht gefunden." };
  await audit("lead.bedenkzeit", { entity: "Lead", entityId: leadId, customerId, details: { bis: bis.toISOString() } });
  await recordUsage("action", "sequence.bedenkzeit");
  revalidatePath(`/buyer/leads/${leadId}`);
  revalidatePath("/buyer");
  return { ok: true, bis: bis.toISOString(), text: `Pausiert bis ${tagKurz(bis)}` };
}
