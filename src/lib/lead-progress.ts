// Fortschritt eines Leads aus dem WhatsApp-/Buchungs-Flow ins CRM spiegeln —
// in die DB UND nach Airtable. Nur DB reicht nicht: der Airtable-Sync würde den
// Status beim nächsten Lauf wieder überschreiben, und die KPI-Kacheln
// (Erreichbarkeit, Termine, Zeit bis Erstkontakt) blieben leer.
//
// Regeln:
// - Absage: „In Beratung" → „Neuer Lead", wenn kein Termin mehr gebucht ist.
// - Status wird nur „hochgestuft" (Neuer Lead / Nicht erreicht / leer →
//   In Beratung), nie zurückgesetzt — Angebot/Abschluss bleiben unangetastet.
// - „Erster Kontaktversuch" wird nur gesetzt, wenn er noch leer ist.
// Fehler werden geloggt, brechen den aufrufenden Flow aber nie ab.

import { updateLeadEditableFields } from "@/lib/airtable-write";
import { prisma } from "@/lib/prisma";

const UPGRADABLE = new Set(["", "neuer lead", "nicht erreicht"]);
const BOOKED_STATUS = "In Beratung";
const RESET_STATUS = "Neuer Lead";

export async function recordLeadProgress(
  leadId: string | null | undefined,
  event: "contact_attempt" | "booked" | "cancelled",
): Promise<void> {
  if (!leadId) return;
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        airtableId: true,
        status: true,
        firstContactAt: true,
        contactAttempts: true,
        reached: true,
      },
    });
    if (!lead) return;

    if (event === "cancelled") {
      // Termin abgesagt: nur den von uns gesetzten Status „In Beratung"
      // zurücknehmen, und nur wenn kein anderer Termin mehr gebucht ist
      // (Verschieben bucht erst neu und sagt dann ab). Danach zählt der Lead
      // nicht mehr als Termin, bleibt aber „erreicht" und steht in der
      // Rückrufliste („Lead hat den Termin abgesagt").
      if ((lead.status ?? "").trim().toLowerCase() !== BOOKED_STATUS.toLowerCase()) return;
      const stillBooked = await prisma.appointment.count({
        where: { leadId, status: "booked" },
      });
      if (stillBooked > 0) return;
      if (lead.airtableId) {
        await updateLeadEditableFields({
          airtableId: lead.airtableId,
          bearbeitungsstatus: RESET_STATUS,
        });
      }
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: RESET_STATUS, reached: false },
      });
      return;
    }

    const now = new Date();
    const setFirstContact = !lead.firstContactAt;
    const attempts =
      event === "contact_attempt"
        ? lead.contactAttempts + 1
        : Math.max(1, lead.contactAttempts);
    // Termin gebucht ⇒ In Beratung (= erreicht + Termin).
    const upgrade =
      event !== "contact_attempt" && UPGRADABLE.has((lead.status ?? "").trim().toLowerCase());
    const reached = upgrade ? true : lead.reached;

    if (lead.airtableId) {
      await updateLeadEditableFields({
        airtableId: lead.airtableId,
        kontaktversuche: attempts,
        ...(setFirstContact ? { ersterKontaktversuch: now.toISOString() } : {}),
        ...(upgrade ? { bearbeitungsstatus: BOOKED_STATUS } : {}),
      });
    }
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        contactAttempts: attempts,
        reached,
        ...(setFirstContact ? { firstContactAt: now } : {}),
        ...(upgrade ? { status: BOOKED_STATUS } : {}),
      },
    });
  } catch (err) {
    console.error("[lead progress]", event, leadId, err instanceof Error ? err.message : err);
  }
}
