// „Neue Leads, die auf den Vermittler warten“ (Ole, 19.11.2026): eine Menge für zwei Stellen,
// die Karte „Neue Leads: jetzt anrufen“ auf Heute und den Zähler „N neu“ an Kontakte in der Navigation.
// Gemeint sind neue Leads, die niemand anschreibt (kein WhatsApp bzw. kein Erstanschreiben), nicht die,
// die der Assistent gerade per WhatsApp betreut. Grundlage ist getCallbackLeads (urgent).

import { getCallbackLeads } from "@/lib/whatsapp/outreach";
import { isAdvisor, leadScope, type TeamCtx } from "@/lib/team";
import { istWartenderNeuerLead } from "@/lib/neue-leads-shared";

export { istWartenderNeuerLead };

/** Rückruf-Kandidaten im Sichtbereich des Logins (Berater: nur eigene Leads), wie auf „Heute“. */
export function callbackLeadsFor(ctx: TeamCtx) {
  return getCallbackLeads(ctx.customerId, isAdvisor(ctx) ? leadScope(ctx) : undefined);
}

/** Neue Leads, die jetzt auf einen Anruf warten (Zähler an „Kontakte“). */
export async function wartendeNeueLeads(ctx: TeamCtx) {
  return (await callbackLeadsFor(ctx)).filter(istWartenderNeuerLead);
}
