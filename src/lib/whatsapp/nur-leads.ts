// WhatsApp nur für Leads (Ole, 16.11.2026, Sicherheitsauftrag Coexistence). Allowlist statt Blocklist:
// Assistent, Erstanschreiben, Nachfassen, Terminbestätigungen und -erinnerungen, Knopf-Antworten und die
// STOPP-Bestätigung gehen NUR an Chats, die einem Kontakt aus unserer Pipeline gehören:
//   - Lead zugeordnet (Meta-Formular, Pay-per-Lead, Empfehlung, Bestandskampagne mit Antwort, „Als Lead übernehmen“)
//   - oder der Kontakt hat selbst über die Buchungsseite gebucht (Lead kommt meist 1 bis 2 Minuten später).
// Bestandskampagnen und Empfehlungen haben ihre eigene Einwilligungslogik: erlaubt nur an Leads bzw. importierte
// Bestandskunden (ExistingCustomer) mit dieser Nummer, nie an reine Coexistence-Chats.
// Unbekannte Kontakte (z. B. private Chats, sobald ein Vermittler seine WhatsApp-Business-App per Coexistence
// verbindet): kein Assistent, keine Automatik. Der Chat erscheint als „Neuer Kontakt“, der Vermittler entscheidet
// mit „Als Lead übernehmen“. Ausnahme nur mit dem Schalter „Assistent auch für neue Kontakte“ (AgentConfig.newContactsBot,
// Standard aus), und auch dann nie für Nummern aus der Business-App (WhatsAppAppContact).
// Manuelle Sendungen (Vermittler bzw. Admin klickt selbst) laufen über `manuell: true` und sind nicht betroffen.

import { prisma } from "@/lib/prisma";
import { isSupportCustomer } from "@/lib/whatsapp/support-inbox";

/** Automatische Nachricht an einen Kontakt ohne Lead-Zuordnung (Allowlist). */
export class WhatsAppKeinLeadError extends Error {
  constructor(message = "Kein Lead zugeordnet: keine automatische WhatsApp-Nachricht.") {
    super(message);
    this.name = "WhatsAppKeinLeadError";
  }
}

/** Zwecke mit eigener Einwilligungslogik (Bestandskampagnen, Empfehlungen): Lead oder importierter Bestandskunde. */
const BESTAND_ZWECKE = new Set([
  "campaign_cross_sell",
  "campaign_review",
  "campaign_birthday",
  "campaign_renewal",
  "review_request",
  "referral_request",
  "referral_thanks",
  "referral_update",
]);

export const NEUER_KONTAKT = "Neuer Kontakt";

/** Text für „Wartet auf Sie“ bei einem unbekannten Kontakt. */
export function neuerKontaktGrund(body: string | null): string {
  return body ? `${NEUER_KONTAKT}: „${body.slice(0, 100)}“` : NEUER_KONTAKT;
}

/** Nummer aus der WhatsApp-Business-App des Kunden (Coexistence)? */
export async function istAppKontakt(customerId: string, phone: string): Promise<boolean> {
  return (await prisma.whatsAppAppContact.count({ where: { customerId, phone } })) > 0;
}

/**
 * Coexistence-Metadaten merken: Nummern alter Chats („history“) bzw. gespeicherter Kontakte („smb_app_state_sync“).
 * Nur die Nummer, kein Verlauf. Legt nie Leads oder Chats an.
 */
export async function merkeAppKontakte(customerId: string, phones: string[], source: "history" | "contact"): Promise<number> {
  const clean = [...new Set(phones.map((p) => p.replace(/\D/g, "")).filter((p) => p.length >= 6))];
  if (!clean.length) return 0;
  const r = await prisma.whatsAppAppContact.createMany({
    data: clean.map((phone) => ({ customerId, phone, source })),
    skipDuplicates: true,
  });
  return r.count;
}

/** Schalter „Assistent auch für neue Kontakte“ (Standard aus). */
export async function assistentFuerNeueKontakte(customerId: string): Promise<boolean> {
  const a = await prisma.agentConfig.findUnique({ where: { customerId }, select: { newContactsBot: true } });
  return !!a?.newContactsBot;
}

/** Hat der Kontakt selbst über die Buchungsseite gebucht (Vermerk im Chat)? */
async function selbstGebucht(conversationId: string): Promise<boolean> {
  const n = await prisma.message.count({
    where: { conversationId, direction: "internal", kind: "appointment_booked", sentBy: "lead" },
  });
  return n > 0;
}

type ConvRef = { id: string; customerId: string; contactPhone: string; leadId: string | null };

/** Gehört der Chat zur Pipeline (Lead zugeordnet oder selbst über die Buchungsseite gebucht)? */
export async function istPipelineChat(conv: ConvRef): Promise<boolean> {
  if (isSupportCustomer(conv.customerId)) return false;
  if (conv.leadId) return true;
  return selbstGebucht(conv.id);
}

/**
 * Darf der Assistent in diesem Chat antworten? Pipeline-Chat, sonst nur mit dem Schalter „Assistent auch für
 * neue Kontakte“, wenn der Kontakt selbst geschrieben hat und nicht aus der Business-App stammt.
 */
export async function assistentDarfAntworten(conv: ConvRef): Promise<boolean> {
  if (isSupportCustomer(conv.customerId)) return false;
  if (await istPipelineChat(conv)) return true;
  if (!(await assistentFuerNeueKontakte(conv.customerId))) return false;
  if (await istAppKontakt(conv.customerId, conv.contactPhone)) return false;
  const wrote = await prisma.message.count({ where: { conversationId: conv.id, direction: "inbound" } });
  return wrote > 0;
}

/**
 * Prüfung vor jeder automatischen Vorlage bzw. Systemnachricht (sendWhatsAppNotice). Wirft WhatsAppKeinLeadError,
 * wenn der Empfänger nicht in der Allowlist steht.
 */
export async function pruefeAutomatik(opts: { customerId: string; to: string; purpose: string; leadId: string | null; conversationId: string | null }): Promise<void> {
  // Support-Nummer: keine Lead-Vorlagen und keine Kampagnen; Vertriebs-Erinnerungen laufen über lib/vertrieb/termin-whatsapp.ts
  if (isSupportCustomer(opts.customerId)) throw new WhatsAppKeinLeadError("Support-Nummer: keine automatischen Vorlagen.");
  if (opts.leadId) {
    const lead = await prisma.lead.count({ where: { id: opts.leadId, customerId: opts.customerId } });
    if (lead) return;
  }
  if (BESTAND_ZWECKE.has(opts.purpose)) {
    const ec = await prisma.existingCustomer.count({ where: { customerId: opts.customerId, phone: opts.to, optOutAt: null } });
    if (ec) return;
    throw new WhatsAppKeinLeadError("Weder Lead noch importierter Bestandskunde: keine Kampagne bzw. Empfehlung.");
  }
  if (opts.conversationId) {
    const conv = await prisma.conversation.findUnique({ where: { id: opts.conversationId }, select: { id: true, customerId: true, contactPhone: true, leadId: true } });
    if (conv && (await assistentDarfAntworten(conv))) return;
  }
  throw new WhatsAppKeinLeadError();
}

/**
 * Ein Lead wurde dem Chat gerade zugeordnet (Webhook, Lead-Import, Erstanschreiben, „Als Lead übernehmen“).
 * War der Chat ein „Neuer Kontakt“ (Assistent aus, noch nie etwas von uns geschrieben), übernimmt jetzt der
 * Assistent: einschalten, Hinweis „Neuer Kontakt“ zurücksetzen und mit antworten=true die offene Nachricht
 * beantworten (Rennen Webhook vor Lead-Import). Chats mit Verlauf (der Vermittler hat schon geschrieben) bleiben,
 * wie sie sind.
 */
export async function nachLeadZuordnung(conversationId: string, opts: { antworten?: boolean; force?: boolean } = {}): Promise<boolean> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, customerId: true, leadId: true, botActive: true, optedOutAt: true, attentionReason: true, windowExpiresAt: true },
  });
  if (!conv?.leadId || conv.optedOutAt || isSupportCustomer(conv.customerId)) return false;
  let activated = false;
  if (!conv.botActive) {
    const outbound = opts.force ? 0 : await prisma.message.count({ where: { conversationId, direction: "outbound" } });
    const handover = opts.force ? 0 : await prisma.message.count({ where: { conversationId, direction: "internal", kind: { in: ["ki_handover", "handover", "opt_out"] } } });
    if (outbound > 0 || handover > 0) return false;
    await prisma.conversation.update({ where: { id: conversationId }, data: { botActive: true } });
    activated = true;
  }
  if (conv.attentionReason?.startsWith(NEUER_KONTAKT)) {
    await prisma.conversation.update({ where: { id: conversationId }, data: { needsAttention: false, attentionReason: null, attentionAt: null } });
  }
  if (opts.antworten && conv.windowExpiresAt && conv.windowExpiresAt.getTime() > Date.now()) {
    const last = await prisma.message.findFirst({
      where: { conversationId, direction: { in: ["inbound", "outbound"] } },
      orderBy: { createdAt: "desc" },
      select: { direction: true },
    });
    if (last?.direction === "inbound") {
      try {
        const { runBotTurn } = await import("@/lib/whatsapp/bot");
        await runBotTurn(conversationId);
      } catch (e) {
        console.error("[whatsapp nur-leads] Assistent nach Zuordnung", e);
      }
    }
  }
  return activated;
}

export type UebernahmeResult = { ok: true; leadId: string } | { ok: false; error: string };

/**
 * „Als Lead übernehmen“ im Chat (Vermittler entscheidet bei einem neuen Kontakt): Lead anlegen bzw. vorhandenen
 * Lead mit derselben Nummer zuordnen, dann den Assistenten einschalten und die offene Nachricht beantworten.
 * Herkunft „Eigener Kontakt“ (kein bezahlter Lead). Kein Erstanschreiben: der Kontakt hat selbst geschrieben.
 */
export async function alsLeadUebernehmen(opts: { conversationId: string; customerId: string; userId: string | null; now?: Date }): Promise<UebernahmeResult> {
  const now = opts.now ?? new Date();
  if (isSupportCustomer(opts.customerId)) return { ok: false, error: "Im Support-Postfach gibt es keine Leads." };
  const conv = await prisma.conversation.findFirst({
    where: { id: opts.conversationId, customerId: opts.customerId },
    select: { id: true, leadId: true, contactPhone: true, contactName: true, contactEmail: true },
  });
  if (!conv) return { ok: false, error: "Chat nicht gefunden." };
  let leadId = conv.leadId;
  if (!leadId) {
    // Gibt es den Lead schon (gleiche Nummer bzw. E-Mail)? Dann nur zuordnen.
    const { linkLeadToConversation } = await import("@/lib/whatsapp/lead-link");
    await linkLeadToConversation(conv.id);
    leadId = (await prisma.conversation.findUnique({ where: { id: conv.id }, select: { leadId: true } }))?.leadId ?? null;
  }
  if (!leadId) {
    const { EIGEN_CHANNEL } = await import("@/lib/lead-herkunft");
    const stamp = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" }).format(now);
    const { inboundLeadIsTest } = await import("@/lib/testlead");
    const lead = await prisma.lead.create({
      data: {
        customerId: opts.customerId,
        // Testkunde bzw. interner Kunde (z. B. Sandbox-Nummer): Testlead, zählt nirgends
        isTest: await inboundLeadIsTest(opts.customerId),
        adChannel: EIGEN_CHANNEL,
        name: conv.contactName,
        phone: conv.contactPhone,
        email: conv.contactEmail,
        status: "Neuer Lead",
        // Hat selbst geschrieben: kein automatisches Erstanschreiben
        outreachAt: now,
        outreachStatus: "skipped_contact",
        formData: [{ label: "Kontakt", value: `Hat selbst per WhatsApp geschrieben, im Chat als Lead übernommen (${stamp})` }],
      },
      select: { id: true },
    });
    leadId = lead.id;
    await prisma.conversation.update({ where: { id: conv.id }, data: { leadId } });
    const { assignLead } = await import("@/lib/team");
    await assignLead(leadId).catch(() => null);
    const { logLeadHistory } = await import("@/lib/lead-history");
    await logLeadHistory(leadId, "status", "Im Chat als Lead übernommen (eigener Kontakt)", { customerId: opts.customerId, userId: opts.userId });
    const wrote = await prisma.message.count({ where: { conversationId: conv.id, direction: "inbound" } });
    if (wrote) {
      const { recordLeadProgress } = await import("@/lib/lead-progress");
      await recordLeadProgress(leadId, "replied").catch(() => null);
    }
  }
  // Ausdrückliche Entscheidung des Vermittlers: Assistent an, auch wenn er schon selbst geschrieben hat
  await nachLeadZuordnung(conv.id, { antworten: true, force: true });
  return { ok: true, leadId };
}
