// WhatsApp-Erstanschreiben + Rückrufliste.
//
// Ablauf je neuem Lead eines Kunden mit aktivem Agenten + outreachEnabled:
//   1. Wartezeit (outreachDelayMin) → Lead kann zuerst selbst über die
//      Buchungsseite einen Termin wählen.
//   2. Termin vorhanden        → kein Anschreiben (skipped_booked)
//      Lead hat selbst geschrieben → kein Anschreiben (skipped_contact)
//      sonst                   → Vorlage „outreach" senden, Konversation mit
//                                Lead verknüpfen, der Assistent übernimmt bei Antwort.
//      Ohne Häkchen zur Einwilligung im Leadformular (Lead.waConsent = "nein") → kein WhatsApp
//      (skipped_no_consent), der Lead steht auf der Rückrufliste (E-Mail/Telefon).
//      Nummer hat „STOPP“ geschrieben → kein Anschreiben (skipped_optout).
//   3. Rückrufliste: offene Leads ohne Termin, bei denen das Anschreiben nicht
//      möglich war oder 24 h danach noch kein Termin steht.

import { recordLeadProgress } from "@/lib/lead-progress";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { firstNameOf, NoTemplateError, noticeText, sendWhatsAppNotice, type NoticePurpose } from "@/lib/whatsapp/templates";
import { outreachProdukt } from "@/lib/whatsapp/erstanschreiben";
import { abVariantFor } from "@/lib/whatsapp/ab-test";
import { restartSilentSequence } from "@/lib/lead-sequences";
import { produktCheckliste } from "@/lib/whatsapp/produkt-fragen";
import { anspracheOf } from "@/lib/whatsapp/reminders";
import { ansprechpartner } from "@/lib/lead-anrede";
import type { Ansprache } from "@/lib/ansprache";
import { erstinfoUrlFor } from "@/lib/erstinformation";
import { sendErstinfoPdf } from "@/lib/whatsapp/erstinfo-pdf";
import { KEIN_WHATSAPP_REASON } from "@/lib/whatsapp/kein-whatsapp";

/**
 * Erstanschreiben (v4, Ole 15.11.2026): Vorlage je Produkt mit der ersten Frage und Knöpfen (lib/whatsapp/erstanschreiben.ts),
 * KI-Hinweis im Text, Erstinformation als PDF im Kopf (§ 16 VersVermV; nur vollständige Erstinformation).
 * legacyParams: für die bisher freigegebene v3-Fassung (Vorname, Link zur Erstinformation), bis v4 freigegeben ist.
 * Freitext (offenes Fenster): gleicher Text, das PDF geht dann direkt hinterher (sendErstinfoPdf).
 */
export async function outreachMessage(opts: { customerId: string; leadId: string; phone: string; name: string | null; an: Ansprache; source?: string | null }) {
  const who = await ansprechpartner({ customerId: opts.customerId, leadId: opts.leadId, phone: opts.phone, name: opts.name });
  const url = await erstinfoUrlFor(opts.customerId);
  const produkt = outreachProdukt(opts.source);
  const purpose: NoticePurpose = produkt?.purpose ?? "outreach";
  const rest = produkt ? [produkt.produkt] : [];
  let document: { link: string; filename: string } | null = null;
  try {
    const { erstinfoBereit, erstinfoDokument, erstinfoPdfUrlFor } = await import("@/lib/erstinformation");
    if (await erstinfoBereit(opts.customerId)) {
      const doc = await erstinfoDokument({ customerId: opts.customerId });
      if (doc) document = { link: await erstinfoPdfUrlFor(opts.customerId), filename: doc.fileName };
    }
  } catch (err) {
    console.error("[outreach] Erstinformation als PDF", err instanceof Error ? err.message : err);
  }
  const variant = await abVariantFor(purpose, opts.leadId);
  return {
    who,
    purpose,
    variant,
    params: [firstNameOf(opts.name), ...rest],
    legacyParams: [firstNameOf(opts.name), url],
    document,
    text: noticeText(purpose, opts.an, who, who.kontakt, rest, variant),
  };
}

/**
 * Erstanschreiben senden: Vorlage des Produkts; ist sie (noch) nicht freigegeben, die allgemeine Fassung
 * (aktuell oder die bisherige v3 mit Link). Nach Freitext folgt das PDF der Erstinformation sofort.
 */
export async function sendOutreach(opts: { customerId: string; leadId: string; phone: string; name: string | null; an: Ansprache; source: string | null }) {
  const m = await outreachMessage(opts);
  const send = (purpose: NoticePurpose, params: string[], text: string, variant = m.variant) =>
    sendWhatsAppNotice({
      customerId: opts.customerId,
      to: opts.phone,
      purpose,
      params,
      legacyParams: m.legacyParams,
      text,
      leadId: opts.leadId,
      contactName: opts.name,
      anrede: m.who.kontakt,
      document: m.document,
      variant,
    });
  let notice;
  try {
    notice = await send(m.purpose, m.params, m.text);
  } catch (err) {
    if (!(err instanceof NoTemplateError) || m.purpose === "outreach") throw err;
    notice = await send("outreach", [m.params[0]], noticeText("outreach", opts.an, m.who, m.who.kontakt, []), "a");
  }
  // Fenster offen (Freitext): Erstinformation gleich als PDF hinterher (§ 16 VersVermV). Nach einer Vorlage mit PDF im
  // Kopf ist sie schon da; nach einer Vorlage ohne Kopf folgt das PDF mit der ersten Antwort (lib/whatsapp/erstinfo-pdf.ts).
  if (notice.mode === "text") {
    await sendErstinfoPdf({ conversationId: notice.conversationId, an: opts.an, advisorName: m.who.advisor || m.who.firm });
  }
  return notice;
}

/** Nur frische, noch unbearbeitete Leads anschreiben. */
const OUTREACH_STATUSES = [null, "Neuer Lead"];
const OUTREACH_MAX_AGE_MS = 48 * 60 * 60 * 1000;
/** Ab hier gilt ein Lead ohne Termin als Rückruf-Fall. */
export const CALLBACK_AFTER_MS = 24 * 60 * 60 * 1000;
const CALLBACK_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const CALLBACK_STATUSES = ["Neuer Lead", "Nicht erreicht", "Im Gespräch"];

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

/** Optional nur für einen Kunden (z. B. direkt nach einem neuen Lead). */
export async function runOutreach(onlyCustomerId?: string): Promise<OutreachResult> {
  const result: OutreachResult = {
    customers: 0,
    candidates: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  const agents = await prisma.agentConfig.findMany({
    // Ruhende Konten (Vertrag beendet, lib/ruhend.ts) schreiben niemanden an
    where: { active: true, outreachEnabled: true, customer: { dormantSince: null }, ...(onlyCustomerId ? { customerId: onlyCustomerId } : {}) },
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
      select: { id: true, name: true, phone: true, waConsent: true, source: true, waUnavailableAt: true },
      take: 50,
    });

    // Freitext (offenes Fenster) = Text der aktuellen Outreach-Vorlage mit Anrede nach Regel;
    // Vorlage passend zu Ansprache und Kontakt (sendWhatsAppNotice → rankTemplates)
    const an = await anspracheOf(agent.customerId);

    for (const lead of leads) {
      result.candidates++;
      const phone = lead.phone!;
      const conv = await prisma.conversation.findUnique({
        where: {
          customerId_contactPhone: { customerId: agent.customerId, contactPhone: phone },
        },
        select: { id: true, leadId: true, optedOutAt: true, _count: { select: { messages: true } } },
      });

      // Nummer schon als „kein WhatsApp“ bekannt (lib/whatsapp/kein-whatsapp.ts): nicht anschreiben, steht oben auf der Anrufliste
      if (lead.waUnavailableAt) {
        await prisma.lead.update({ where: { id: lead.id }, data: { outreachAt: new Date(), outreachStatus: "no_whatsapp" } });
        result.skipped++;
        continue;
      }
      // Einwilligungs-Häkchen im Formular fehlt bzw. „STOPP“: kein WhatsApp (nur E-Mail/Telefon zur Anfrage)
      if (lead.waConsent === "nein" || conv?.optedOutAt) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { outreachAt: new Date(), outreachStatus: lead.waConsent === "nein" ? "skipped_no_consent" : "skipped_optout" },
        });
        result.skipped++;
        continue;
      }

      // Schon über die Buchungsseite (z. B. Meta-Leadformular) gebucht: Bei Produkten mit Angaben fürs Angebot
      // (lib/whatsapp/produkt-fragen) meldet sich der Assistent trotzdem, bestätigt den Termin im Gespräch und
      // fragt die Angaben ab (Ole, 15.11.2026). Sonst wie bisher kein Erstanschreiben.
      const booked = await hasAppointment(lead.id, conv?.id);
      if (booked && !produktCheckliste(lead.source)) {
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

      try {
        await sendOutreach({ customerId: agent.customerId, leadId: lead.id, phone, name: lead.name, an, source: lead.source });
        // Kam der Status „kein WhatsApp“ schon während des Sendens (Webhook), bleibt „no_whatsapp“ stehen
        await prisma.lead.updateMany({
          where: { id: lead.id, waUnavailableAt: null },
          data: { outreachAt: new Date(), outreachStatus: booked ? "sent_booked" : "sent" },
        });
        // WhatsApp-Erstanschreiben = Kontaktversuch (Zeit bis Erstkontakt).
        await recordLeadProgress(lead.id, "contact_attempt");
        // Keine Antwort → nach wenigen Stunden nachfassen (lib/lead-sequences.ts, „Chat ruht“)
        await restartSilentSequence(lead.id).catch((e) => console.error("[lead-sequences silent]", e));
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
  /** Sofort anrufen (kein WhatsApp): steht ganz oben auf Heute/Anrufliste. */
  urgent?: boolean;
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
export async function getCallbackLeads(customerId: string, scope?: Prisma.LeadWhereInput): Promise<CallbackLead[]> {
  const now = Date.now();
  const leads = await prisma.lead.findMany({
    where: {
      ...(scope ?? {}),
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
      waConsent: true,
      waUnavailableAt: true,
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
    let urgent = false;
    const lastCancel = l.appointments[0]?.cancelledBy;
    if (l.waUnavailableAt && !replied) {
      // Nummer nicht per WhatsApp erreichbar (lib/whatsapp/kein-whatsapp.ts): sofort, ganz oben
      reason = KEIN_WHATSAPP_REASON;
      urgent = true;
    } else if (l.appointments[0]?.status === "no_show") {
      reason = "Nicht zum Termin erschienen, neuen Termin vereinbaren";
    } else if (lastCancel === "advisor") {
      reason = "Sie haben den Termin abgelehnt, bitte neuen Termin vereinbaren";
    } else if (lastCancel === "lead") {
      reason = "Lead hat den Termin abgesagt, kurz nachfassen";
    } else if (!l.phone) {
      reason = "Keine Handynummer, bitte per E-Mail/Telefon nachfassen";
    } else if (l.waConsent === "nein" || status === "skipped_no_consent") {
      reason = "Ohne WhatsApp-Einwilligung im Formular: bitte anrufen oder per E-Mail melden";
    } else if (status === "skipped_optout") {
      reason = "Möchte keine WhatsApp-Nachrichten („STOPP“): bitte anrufen oder per E-Mail melden";
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
        ...(urgent ? { urgent: true } : {}),
      });
    }
  }
  // „Kein WhatsApp“ zuerst (jüngster oben), sonst wie bisher nach Eingang
  const top = out.filter((c) => c.urgent).sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
  return [...top, ...out.filter((c) => !c.urgent)];
}
