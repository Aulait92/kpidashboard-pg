// WhatsApp-Erstanschreiben + Rückrufliste.
//
// Ablauf je neuem Lead eines Kunden mit aktivem Agenten + outreachEnabled:
//   1. Wartezeit (outreachDelayMin) → Lead kann zuerst selbst über die
//      Buchungsseite einen Termin wählen.
//   2. Termin vorhanden        → kein Anschreiben (skipped_booked)
//      Lead hat selbst geschrieben → kein Anschreiben (skipped_contact)
//      sonst                   → Vorlage „outreach" senden, Konversation mit
//                                Lead verknüpfen, der Assistent übernimmt bei Antwort.
//   3. Rückrufliste: offene Leads ohne Termin, bei denen das Anschreiben nicht
//      möglich war oder 24 h danach noch kein Termin steht.

import { recordLeadProgress } from "@/lib/lead-progress";
import { prisma } from "@/lib/prisma";
import {
  firstNameOf,
  NoTemplateError,
  renderTemplate,
  sendWhatsAppNotice,
} from "@/lib/whatsapp/templates";

/** Nur frische, noch unbearbeitete Leads anschreiben. */
const OUTREACH_STATUSES = [null, "Neuer Lead"];
const OUTREACH_MAX_AGE_MS = 48 * 60 * 60 * 1000;
/** Ab hier gilt ein Lead ohne Termin als Rückruf-Fall. */
export const CALLBACK_AFTER_MS = 24 * 60 * 60 * 1000;
const CALLBACK_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const CALLBACK_STATUSES = ["Neuer Lead", "Nicht erreicht", "Im Gespräch"];

const DEFAULT_OUTREACH_TEXT =
  "Hallo {{1}}, danke für deine Anfrage! Hier ist der digitale Assistent deines Beraters. Hast du kurz Zeit für zwei Fragen, damit wir dir ein passendes Angebot machen können?";

async function hasAppointment(leadId: string, conversationId?: string | null) {
  const n = await prisma.appointment.count({
    where: {
      status: "booked",
      OR: [
        { leadId },
        ...(conversationId ? [{ conversationId }] : []),
      ],
    },
  });
  return n > 0;
}

export type OutreachResult = {
  customers: number;
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
};

export async function runOutreach(): Promise<OutreachResult> {
  const result: OutreachResult = {
    customers: 0,
    candidates: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  const agents = await prisma.agentConfig.findMany({
    where: { active: true, outreachEnabled: true },
    select: { customerId: true, outreachDelayMin: true },
  });

  for (const agent of agents) {
    const account = await prisma.whatsAppAccount.findUnique({
      where: { customerId: agent.customerId },
      select: { status: true },
    });
    if (account?.status !== "connected") continue;
    result.customers++;

    const now = Date.now();
    const leads = await prisma.lead.findMany({
      where: {
        customerId: agent.customerId,
        phone: { not: null },
        outreachAt: null,
        createdAt: {
          gte: new Date(now - OUTREACH_MAX_AGE_MS),
          lte: new Date(now - agent.outreachDelayMin * 60 * 1000),
        },
        OR: OUTREACH_STATUSES.map((s) => ({ status: s })),
      },
      select: { id: true, name: true, phone: true },
      take: 50,
    });

    // Freitext-Variante (offenes Fenster) = Text der Outreach-Vorlage.
    const tpl = await prisma.messageTemplate.findFirst({
      where: { customerId: agent.customerId, purpose: "outreach", status: "approved" },
      orderBy: { updatedAt: "desc" },
      select: { body: true },
    });

    for (const lead of leads) {
      result.candidates++;
      const phone = lead.phone!;
      const conv = await prisma.conversation.findUnique({
        where: {
          customerId_contactPhone: { customerId: agent.customerId, contactPhone: phone },
        },
        select: { id: true, leadId: true, _count: { select: { messages: true } } },
      });

      if (await hasAppointment(lead.id, conv?.id)) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { outreachAt: new Date(), outreachStatus: "skipped_booked" },
        });
        result.skipped++;
        continue;
      }
      if (conv && conv._count.messages > 0) {
        // Lead hat schon selbst geschrieben → der Assistent ist bereits im Gespräch.
        await prisma.lead.update({
          where: { id: lead.id },
          data: { outreachAt: new Date(), outreachStatus: "skipped_contact" },
        });
        if (!conv.leadId) {
          await prisma.conversation.update({
            where: { id: conv.id },
            data: { leadId: lead.id },
          });
        }
        result.skipped++;
        continue;
      }

      const params = [firstNameOf(lead.name)];
      try {
        await sendWhatsAppNotice({
          customerId: agent.customerId,
          to: phone,
          purpose: "outreach",
          params,
          text: renderTemplate(tpl?.body ?? DEFAULT_OUTREACH_TEXT, params),
          leadId: lead.id,
          contactName: lead.name,
        });
        await prisma.lead.update({
          where: { id: lead.id },
          data: { outreachAt: new Date(), outreachStatus: "sent" },
        });
        // WhatsApp-Erstanschreiben = Kontaktversuch (Zeit bis Erstkontakt).
        await recordLeadProgress(lead.id, "contact_attempt");
        result.sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (err instanceof NoTemplateError) {
          // Kein outreachAt → wird erneut versucht, sobald die Vorlage da ist.
          await prisma.lead.update({
            where: { id: lead.id },
            data: { outreachStatus: "no_template" },
          });
        } else {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { outreachAt: new Date(), outreachStatus: `failed: ${msg.slice(0, 180)}` },
          });
        }
        result.failed++;
        result.errors.push(`${lead.id}: ${msg}`);
      }
    }
  }
  return result;
}

export type CallbackLead = {
  id: string;
  name: string | null;
  phone: string | null;
  source: string | null;
  createdAt: Date;
  reason: string;
  replied: boolean;
  /** Konversation zum Nachlesen vor dem Anruf (falls vorhanden). */
  conversationId: string | null;
};

/** Hat dieser Kunde den WhatsApp-Agenten mit Erstanschreiben aktiv? */
export async function hasWhatsAppOutreach(customerId: string): Promise<boolean> {
  const agent = await prisma.agentConfig.findUnique({
    where: { customerId },
    select: { active: true, outreachEnabled: true },
  });
  return !!agent?.active && !!agent.outreachEnabled;
}

/**
 * Leads, die der Kunde selbst anrufen sollte: offen, kein gebuchter Termin
 * und WhatsApp hat nicht zum Termin geführt (nicht zustellbar oder 24 h nach
 * dem Anschreiben bzw. Eingang noch kein Termin).
 */
export async function getCallbackLeads(customerId: string): Promise<CallbackLead[]> {
  const now = Date.now();
  const leads = await prisma.lead.findMany({
    where: {
      customerId,
      createdAt: { gte: new Date(now - CALLBACK_WINDOW_MS) },
      AND: [
        { OR: [{ status: null }, { status: { in: CALLBACK_STATUSES } }] },
        // „Nicht erreicht" geklickt → bis zum nächsten Tag ausgeblendet.
        { OR: [{ callbackSnoozedUntil: null }, { callbackSnoozedUntil: { lt: new Date(now) } }] },
      ],
      appointments: { none: { status: "booked" } },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      name: true,
      phone: true,
      source: true,
      createdAt: true,
      outreachAt: true,
      outreachStatus: true,
      // Letzte Absage (Lead/Berater) → sofort zurückrufen statt 24 h warten.
      appointments: {
        where: {
          OR: [
            { status: "cancelled", cancelledBy: { in: ["lead", "advisor"] } },
            { status: "no_show" },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { cancelledBy: true, status: true },
      },
      conversations: {
        select: {
          id: true,
          _count: { select: { messages: { where: { direction: "inbound" } } } },
        },
      },
    },
  });

  const out: CallbackLead[] = [];
  for (const l of leads) {
    // Termine, die nur an der Konversation hängen (Altfälle), ebenfalls prüfen.
    const convIds = l.conversations.map((c) => c.id);
    if (convIds.length > 0) {
      const booked = await prisma.appointment.count({
        where: { status: "booked", conversationId: { in: convIds } },
      });
      if (booked > 0) continue;
    }
    const replied = l.conversations.some((c) => c._count.messages > 0);
    const status = l.outreachStatus ?? "";

    let reason: string | null = null;
    const lastCancel = l.appointments[0]?.cancelledBy;
    if (l.appointments[0]?.status === "no_show") {
      reason = "Nicht zum Termin erschienen – neuen Termin vereinbaren";
    } else if (lastCancel === "advisor") {
      reason = "Du hast den Termin abgelehnt – bitte neuen Termin vereinbaren";
    } else if (lastCancel === "lead") {
      reason = "Lead hat den Termin abgesagt – kurz nachfassen";
    } else if (!l.phone) {
      reason = "Keine Handynummer – bitte per E-Mail/Telefon nachfassen";
    } else if (status.startsWith("failed")) {
      reason = "WhatsApp nicht zustellbar";
    } else if (l.outreachAt && now - l.outreachAt.getTime() >= CALLBACK_AFTER_MS) {
      reason = replied
        ? "Hat im Chat geantwortet, aber keinen Termin gebucht"
        : "Keine Reaktion auf WhatsApp";
    } else if (!l.outreachAt && now - l.createdAt.getTime() >= CALLBACK_AFTER_MS) {
      reason = "Nicht per WhatsApp angeschrieben";
    }
    if (reason) {
      out.push({
        id: l.id,
        name: l.name,
        phone: l.phone,
        source: l.source,
        createdAt: l.createdAt,
        reason,
        replied,
        conversationId: l.conversations[0]?.id ?? null,
      });
    }
  }
  return out;
}
