// Nachrichtenplan je Lead laden (Daten für lib/nachrichtenplan.ts planeNachrichten). Noch ohne Oberfläche (P6).

import { prisma } from "@/lib/prisma";
import { a, anredeZeile, asAnsprache, type Ansprache } from "@/lib/ansprache";
import type { VorlageKey } from "@/lib/mail/vorlagen";
import { advisorDisplayName } from "@/lib/advisor-name";
import { ansprechpartner } from "@/lib/lead-anrede";
import { splitHealthAnswers } from "@/lib/gesundheitsdaten";
import { firstNameOf } from "@/lib/whatsapp/templates";
import { terminNutzenSatz, vermittlerName, zeitKurz } from "@/lib/whatsapp/gespraech";
import { istAngebotsAbfolge, topicOf } from "@/lib/lead-sequences";
import { leadLabel } from "@/lib/showup";
import { ANTWORT_WARTEZEIT_MS, anrufStartZeitpunkt } from "@/lib/anruf-ausloeser";
import { planeNachrichten, type PlanEintrag } from "@/lib/nachrichtenplan";

function formAnswers(raw: unknown): { label: string; value: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => (x && typeof x === "object" && typeof x.label === "string" && typeof x.value === "string" ? [{ label: x.label, value: x.value }] : []));
}

/** Alle geplanten automatischen Nachrichten und Aufgaben eines Leads (leer, wenn der Lead fehlt). */
export async function loadNachrichtenPlan(leadId: string, now = new Date()): Promise<PlanEintrag[]> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      customerId: true,
      name: true,
      phone: true,
      email: true,
      source: true,
      formData: true,
      contactOverrides: true,
      erasedAt: true,
      waConsent: true,
      waUnavailableAt: true,
      outreachAt: true,
      outreachStatus: true,
      autoCallAt: true,
      callAttempts: true,
      callPlanStartedAt: true,
      lastCallAttemptAt: true,
      followUpAt: true,
      followUpNote: true,
      customer: { select: { name: true, leadAddress: true } },
    },
  });
  if (!lead || lead.erasedAt) return [];
  const [termine, abfolgen, conv] = await Promise.all([
    prisma.appointment.findMany({
      where: { leadId, status: "booked", startsAt: { gt: new Date(now.getTime() - 60 * 60 * 1000) } },
      orderBy: { startsAt: "asc" },
      take: 5,
      select: {
        id: true,
        startsAt: true,
        createdAt: true,
        endsAt: true,
        mode: true,
        meetUrl: true,
        status: true,
        komplettcheck: true,
        reminderSentAt: true,
        soonReminderSentAt: true,
        startReminderSentAt: true,
        startPushAt: true,
        rescheduleRequestedAt: true,
        attendance: true,
        conversationId: true,
      },
    }),
    prisma.leadSequence.findMany({ where: { leadId, stoppedAt: null }, select: { id: true, kind: true, step: true, startedAt: true, nextAt: true, stoppedAt: true, vorabCheckStep: true, neustartAt: true, daten: true } }),
    prisma.conversation.findFirst({
      where: { customerId: lead.customerId, OR: [{ leadId }, ...(lead.phone ? [{ contactPhone: lead.phone }] : [])] },
      orderBy: { lastMessageAt: "desc" },
      select: { id: true, contactEmail: true, optedOutAt: true, qualificationData: true, _count: { select: { messages: { where: { direction: "inbound" } } } } },
    }),
  ]);
  const an = asAnsprache(lead.customer.leadAddress);
  const who = await ansprechpartner({ customerId: lead.customerId, leadId, phone: lead.phone, name: lead.name });
  const fallback = who.advisor || advisorDisplayName(lead.customer.name) || a(an, "dein Berater", "Ihr Berater");
  const person = vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback });
  const formular = splitHealthAnswers(formAnswers(lead.formData)).normal;
  const nutzen: Record<string, string> = {};
  const wann: Record<string, string> = {};
  const mailBetreff: Record<string, string> = {};
  const { erinnerungsBetreff } = await import("@/lib/calendar/lead-email");
  for (const t of termine) {
    nutzen[t.id] = terminNutzenSatz({ source: lead.source, formular, angaben: conv?.qualificationData, an, person, video: t.mode === "video" });
    // Gesendet wird ca. 24 h vorher: aus dieser Sicht „morgen um …“
    const vortag = new Date(t.startsAt.getTime() - 24 * 60 * 60 * 1000);
    wann[t.id] = zeitKurz(t.startsAt, vortag);
    mailBetreff[t.id] = erinnerungsBetreff({ start: t.startsAt, now: vortag, mode: t.mode === "video" ? "video" : "phone", an, person });
  }
  const whatsapp = !!lead.phone && lead.waConsent !== "nein" && !conv?.optedOutAt && (!lead.waUnavailableAt || (conv?._count.messages ?? 0) > 0);
  let anrufAusloeserAt: Date | null = null;
  if (lead.outreachStatus === "sent" && lead.outreachAt && !lead.autoCallAt && lead.callAttempts === 0 && !(conv?._count.messages ?? 0) && !termine.length) {
    const { bookingKeys } = await import("@/lib/calendar");
    const { loadLeadTimes, DEFAULT_LEAD_TIMES } = await import("@/lib/calendar/lead-times");
    const keys = await bookingKeys(lead.customerId, leadId).catch(() => [lead.customerId]);
    const lt = await loadLeadTimes(keys[0] ?? lead.customerId).catch(() => DEFAULT_LEAD_TIMES);
    anrufAusloeserAt = anrufStartZeitpunkt(new Date(lead.outreachAt.getTime() + ANTWORT_WARTEZEIT_MS), lt);
  }
  return planeNachrichten({
    now,
    an,
    hi: anredeZeile(an, who.kontakt),
    person,
    label: leadLabel(who.kontakt, lead.name),
    leadId,
    termine,
    nutzen,
    wann,
    mailBetreff,
    // Die Vortags-Mail geht an die Adresse aus dem Chat (lib/calendar/lead-email.ts)
    email: !!conv?.contactEmail,
    // Nachfass-Mail zum Angebot: Adresse am Kontakt bzw. aus dem Chat (lib/angebot-senden-server.ts)
    emailKontakt: !!lead.email || !!conv?.contactEmail,
    whatsapp,
    abfolgen,
    abfolgeKontext: {
      firstName: firstNameOf(lead.name),
      hi: anredeZeile(an, who.kontakt),
      kontakt: who.kontakt,
      // Angebot (P3): Thema aus der Auswahl im Termin, wie beim Senden (lib/lead-sequences.ts sendStep)
      topic:
        (abfolgen.some((s) => istAngebotsAbfolge(s.kind)) ? await import("@/lib/angebot-senden-server").then((m) => m.angebotThemaFuerLead(leadId)) : null) ??
        topicOf(lead.formData, lead.source, an),
      an,
      person,
    },
    anrufplan: { followUpAt: lead.followUpAt, followUpNote: lead.followUpNote, callAttempts: lead.callAttempts, callPlanStartedAt: lead.callPlanStartedAt, lastCallAttemptAt: lead.lastCallAttemptAt },
    anrufAusloeserAt,
    // E-Mail-Schritte (Angebot Tag 5, Pakete M4/M6): Text aus der Vorlage des Vermittlers
    mailVorlagen: await mailVorlagenFuer(lead.customerId, abfolgen, an),
  });
}

/** Vorlagen der Mail-Schritte laufender Abfolgen (Kunden-Vorlage, sonst Standard). */
async function mailVorlagenFuer(customerId: string, abfolgen: { kind: string; stoppedAt: Date | null }[], an: Ansprache) {
  const { SEQUENCES } = await import("@/lib/lead-sequences");
  const keys = new Set<VorlageKey>();
  for (const a of abfolgen) {
    if (a.stoppedAt) continue;
    for (const st of SEQUENCES[a.kind as keyof typeof SEQUENCES]?.steps ?? []) if (st.action === "email") keys.add(st.vorlage);
  }
  if (!keys.size) return undefined;
  const { mailVorlage } = await import("@/lib/angebot-senden-server");
  const out: Partial<Record<VorlageKey, Awaited<ReturnType<typeof mailVorlage>>>> = {};
  for (const k of keys) out[k] = await mailVorlage(customerId, k, an);
  return out;
}
