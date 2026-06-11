// Outbound-Trigger für den WhatsApp-Vorqualifizierungs-Bot.
//
// Wird nach jedem Airtable-Sync aufgerufen: für jeden frischen Lead mit
// Telefonnummer und ohne existierende Conversation senden wir das
// genehmigte Outbound-Template (Parameter: Vorname + Produkt) und legen
// eine Conversation im Zustand „pending_template" an.
//
// Voraussetzung: WHATSAPP_PHONE_NUMBER_ID + WHATSAPP_ACCESS_TOKEN gesetzt
// und Template im Meta Business Manager genehmigt. Sind die ENVs leer,
// no-op — kein Crash, kein Spam in den Errors.

import { prisma } from "@/lib/prisma";
import { sendTemplate } from "@/lib/whatsapp";
import type { NewLead } from "@/lib/airtable";

export type OutboundResult = {
  attempted: number;
  sent: number;
  skipped: number;
  errors: string[];
};

function isConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN,
  );
}

// Vorname aus Lead-Name extrahieren (für Template-Parameter {{1}}). Wenn der
// Name leer ist, nutzen wir „hallo" als generische Anrede.
function firstName(name: string | null | undefined): string {
  if (!name) return "hallo";
  const trimmed = name.trim();
  if (!trimmed) return "hallo";
  return trimmed.split(/\s+/)[0];
}

function productLabel(product: string): string {
  if (product === "Wechsel") return "PKV-Wechsel";
  if (product === "Neugeschäft") return "PKV-Neugeschäft";
  if (product === "Kinderwunsch") return "Kinderwunsch";
  return product;
}

export async function triggerOutboundForNewLeads(
  leads: NewLead[],
): Promise<OutboundResult> {
  const result: OutboundResult = {
    attempted: 0,
    sent: 0,
    skipped: 0,
    errors: [],
  };
  if (!isConfigured()) {
    // ENVs nicht gesetzt → Modul still abgeschaltet. Nichts loggen,
    // nichts pushen.
    return result;
  }

  for (const lead of leads) {
    if (!lead.phone) {
      result.skipped += 1;
      continue;
    }
    result.attempted += 1;

    // Doppelte Conversations pro Telefonnummer vermeiden — der Lead könnte
    // aus mehreren Airtable-Tabellen kommen oder ein Re-Sync diesen Pfad
    // erneut treffen.
    const existing = await prisma.whatsappConversation.findUnique({
      where: { phone: lead.phone },
      select: { id: true },
    });
    if (existing) {
      result.skipped += 1;
      continue;
    }

    // Lead-DB-ID nachschlagen (sync hat den Lead schon angelegt).
    const dbLead = await prisma.lead.findUnique({
      where: { airtableId: lead.airtableId },
      select: { id: true },
    });
    if (!dbLead) {
      result.skipped += 1;
      continue;
    }

    const parameters = [firstName(lead.name), productLabel(lead.product)];

    try {
      const sent = await sendTemplate({
        to: lead.phone,
        parameters,
      });
      await prisma.whatsappConversation.create({
        data: {
          phone: lead.phone,
          leadId: dbLead.id,
          product: lead.product,
          state: "pending_template",
          templateMessageId: sent.wamid,
          messages: {
            create: {
              direction: "out",
              wamid: sent.wamid,
              body: `[Template: ${process.env.WHATSAPP_TEMPLATE_NAME ?? "pkv_intro_v1"}] ${parameters.join(" | ")}`,
            },
          },
        },
      });
      result.sent += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${lead.phone}: ${msg}`);
      // Conversation trotzdem anlegen, damit wir nicht beim nächsten Sync
      // erneut hartnäckig dieselbe Nummer mit demselben Fehler bombardieren.
      try {
        await prisma.whatsappConversation.create({
          data: {
            phone: lead.phone,
            leadId: dbLead.id,
            product: lead.product,
            state: "failed",
            lastError: msg.slice(0, 500),
          },
        });
      } catch {
        // Race-Condition: bereits angelegt → egal.
      }
    }
  }

  return result;
}
