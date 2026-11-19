// Ohne Datenbank, auch im Browser nutzbar (components/today-inbox.tsx). Server: lib/neue-leads.ts.

/**
 * Wartet dieser neue Lead auf den Vermittler? Ja, wenn niemand ihn anschreibt (kein WhatsApp bzw. kein
 * Erstanschreiben, lib/whatsapp/outreach.ts getCallbackLeads → urgent). Leads, die der Assistent per WhatsApp
 * betreut, zählen nicht. Gleiche Regel für „Neue Leads: jetzt anrufen“ auf Heute und den Zähler an „Kontakte“.
 */
export function istWartenderNeuerLead(c: { urgent?: boolean | null }): boolean {
  return !!c.urgent;
}
