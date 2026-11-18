"use server";

// Lead-Detail: laufende Nachfass-Abfolge stoppen bzw. „Später melden“ (Bedenkzeit P5 und Pause P6 in einem Blatt).

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { getCurrentSession } from "@/lib/auth";
import { writableCustomerId } from "@/lib/buyer-write";
import { stopSequences } from "@/lib/lead-sequences";
import { spaeterMelden, type SpaeterErgebnis, type SpaeterWann } from "@/lib/spaeter-melden";
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
 * „Später melden“ (Ole, 18.11.2026, ein Blatt statt „Alle pausieren“ und „Bedenkzeit eintragen“): 1 Woche, 2 Wochen, Ende
 * des Monats, ein Datum (YYYY-MM-DD) oder ohne Datum. Mit Angebot: Bedenkzeit (Nachfassen zum Angebot startet am Tag
 * neu), sonst Pause bis zu dem Tag. Optional die E-Mail „Wie besprochen“ mit dem Tag (lib/spaeter-melden.ts).
 */
export async function spaeterMeldenAction(leadId: string, wann: SpaeterWann, opts: { mail?: boolean } = {}): Promise<SpaeterErgebnis> {
  const customerId = await writableCustomerId(leadId);
  if (!customerId) return { ok: false, error: "In der Vorschau nur mit Demo-Leads möglich." };
  const session = await getCurrentSession();
  const res = await spaeterMelden(leadId, { wahl: wann.wahl, datum: wann.datum, ohneDatum: !!wann.ohneDatum }, { userId: session?.userId ?? null, mail: !!opts.mail });
  if (res.ok) {
    await audit(res.weg === "bedenkzeit" ? "lead.bedenkzeit" : "lead.spaeter_melden", { entity: "Lead", entityId: leadId, customerId, details: { weg: res.weg, bis: res.bis, mail: res.mail } });
    await recordUsage("action", `sequence.spaeter.${res.weg}`);
  }
  revalidatePath(`/buyer/leads/${leadId}`);
  revalidatePath("/buyer");
  return res;
}
