// Nachrichtenplan je Lead laden (Daten für lib/nachrichtenplan.ts planeNachrichten). Oberfläche: „Nächste Nachrichten“ am
// Kontakt (Paket P6, components/naechste-nachrichten.tsx); dazu die Zählung für „Heute“ (ladeAutomatischeNachrichten).

import type { Prisma } from "@/generated/prisma/client";
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
import { planeNachrichten, zaehleAutomatische, type PlanEintrag, type PlanEingabe } from "@/lib/nachrichtenplan";

const ABFOLGE_SELECT = {
  id: true,
  kind: true,
  step: true,
  startedAt: true,
  nextAt: true,
  stoppedAt: true,
  vorabCheckStep: true,
  neustartAt: true,
  uebersprungen: true,
  daten: true,
} as const;

const TERMIN_SELECT = {
  id: true,
  leadId: true,
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
  erinnerungenUebersprungen: true,
} as const;

/** Kann WhatsApp an den Lead gehen (Nummer, Einwilligung, kein STOPP, erreichbar oder hat selbst geschrieben)? */
function waMoeglich(
  lead: { phone: string | null; waConsent: string | null; waUnavailableAt: Date | null },
  conv: { optedOutAt: Date | null; _count: { messages: number } } | null | undefined,
): boolean {
  return !!lead.phone && lead.waConsent !== "nein" && !conv?.optedOutAt && (!lead.waUnavailableAt || (conv?._count.messages ?? 0) > 0);
}

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
      nachrichtenPausiertAt: true,
      customer: { select: { name: true, leadAddress: true, mailAblauf: true } },
    },
  });
  if (!lead || lead.erasedAt) return [];
  const [termine, abfolgen, conv, aufgaben] = await Promise.all([
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
        erinnerungenUebersprungen: true,
      },
    }),
    prisma.leadSequence.findMany({ where: { leadId, stoppedAt: null }, select: ABFOLGE_SELECT }),
    prisma.conversation.findFirst({
      where: { customerId: lead.customerId, OR: [{ leadId }, ...(lead.phone ? [{ contactPhone: lead.phone }] : [])] },
      orderBy: { lastMessageAt: "desc" },
      select: { id: true, contactEmail: true, optedOutAt: true, qualificationData: true, _count: { select: { messages: { where: { direction: "inbound" } } } } },
    }),
    // Vorschläge (M7): offene Aufgaben nach dem Abschluss
    prisma.leadTask.findMany({ where: { leadId, status: { in: ["wartet", "aktiv"] } }, orderBy: { dueAt: "asc" }, take: 5, select: { kind: true, note: true, dueAt: true, status: true } }),
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
  const whatsapp = waMoeglich(lead, conv);
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
    pausiertAt: lead.nachrichtenPausiertAt,
    // Aktive Aufgabe = die Wiedervorlage auf „Heute“; erledigt, sobald sie dort abgehakt ist
    vorschlaege: aufgaben.filter((t) => t.status === "wartet" || (!!lead.followUpAt && lead.followUpNote === t.note)),
    mailAus: await import("@/lib/mail/ablauf").then((m) => {
      const st = m.leseMailAblauf(lead.customer.mailAblauf).stufen;
      return Object.entries(st).flatMap(([k, s]) => (s === "aus" ? [k] : []));
    }),
    // E-Mail-Schritte (Angebot Tag 5, Pakete M4/M6): Text aus der Vorlage des Vermittlers
    mailVorlagen: await mailVorlagenFuer(lead.customerId, abfolgen, an),
  });
}

/** Berlin: Beginn des Tages von `d`. */
function berlinTagesbeginn(d: Date): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);
  const guess = new Date(`${ymd}T00:00:00Z`);
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(guess));
  return new Date(guess.getTime() - h * 60 * 60 * 1000);
}

/** Morgen (Berlin) als [von, bis). */
export function morgenBerlin(now: Date): { von: Date; bis: Date } {
  const von = berlinTagesbeginn(new Date(berlinTagesbeginn(now).getTime() + 36 * 60 * 60 * 1000));
  const bis = berlinTagesbeginn(new Date(von.getTime() + 36 * 60 * 60 * 1000));
  return { von, bis };
}

export type AutomatischeNachrichten = { anzahl: number; leads: { leadId: string; name: string; anzahl: number; erste: string }[] };

/**
 * Automatische Nachrichten an Leads (WhatsApp, E-Mail) in [von, bis), je Kontakt (Zeile auf „Heute“, Paket P6). Rechnet
 * mit derselben Planung wie „Nächste Nachrichten“ (planeNachrichten), ohne Texte; übersprungene und pausierte zählen nicht.
 */
export async function ladeAutomatischeNachrichten(scope: Prisma.LeadWhereInput, von: Date, bis: Date, now = new Date()): Promise<AutomatischeNachrichten> {
  const DAY = 24 * 60 * 60 * 1000;
  const aktiv: Prisma.LeadWhereInput = { AND: [scope, { erasedAt: null, nachrichtenPausiertAt: null }] };
  // Kandidaten: Termine bis einen Tag nach `bis` (Vortags-Erinnerung) und Abfolgen mit dem nächsten Schritt bis `bis`
  const [termine, abfolgen] = await Promise.all([
    prisma.appointment.findMany({
      where: { status: "booked", startsAt: { gt: new Date(Math.max(now.getTime(), von.getTime()) - 60 * 60 * 1000), lte: new Date(bis.getTime() + DAY + 60 * 60 * 1000) }, leadId: { not: null }, lead: aktiv },
      select: TERMIN_SELECT,
      orderBy: { startsAt: "asc" },
      take: 500,
    }),
    prisma.leadSequence.findMany({ where: { stoppedAt: null, nextAt: { not: null, lt: bis }, lead: aktiv }, select: { ...ABFOLGE_SELECT, leadId: true }, take: 500 }),
  ]);
  const ids = [...new Set([...termine.map((t) => t.leadId!), ...abfolgen.map((a) => a.leadId)])];
  if (!ids.length) return { anzahl: 0, leads: [] };
  const [leads, convs, kommend] = await Promise.all([
    prisma.lead.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, phone: true, email: true, waConsent: true, waUnavailableAt: true } }),
    prisma.conversation.findMany({
      where: { leadId: { in: ids } },
      orderBy: { lastMessageAt: "desc" },
      select: { leadId: true, contactEmail: true, optedOutAt: true, _count: { select: { messages: { where: { direction: "inbound" } } } } },
    }),
    // Ein anstehender Termin beendet laufende Abfolgen (planeNachrichten): auch Termine nach `bis`
    prisma.appointment.findMany({ where: { leadId: { in: ids }, status: "booked", startsAt: { gt: now } }, select: { leadId: true }, distinct: ["leadId"] }),
  ]);
  const convByLead = new Map<string, (typeof convs)[number]>();
  for (const c of convs) if (c.leadId && !convByLead.has(c.leadId)) convByLead.set(c.leadId, c);
  const mitTermin = new Set(kommend.map((k) => k.leadId));
  const person = { nom: "", dat: "" };
  const out: AutomatischeNachrichten["leads"] = [];
  for (const lead of leads) {
    const conv = convByLead.get(lead.id);
    const eigene = termine.filter((t) => t.leadId === lead.id);
    const eingabe: PlanEingabe = {
      now,
      an: "sie",
      hi: "",
      person,
      label: lead.name ?? "",
      leadId: lead.id,
      // Ohne Texte: Termine nach `bis` nur, damit laufende Abfolgen wie im Plan entfallen
      termine: [...eigene, ...(mitTermin.has(lead.id) && !eigene.some((t) => t.startsAt > now) ? [{ ...TERMIN_PLATZHALTER, startsAt: new Date(bis.getTime() + 2 * DAY), createdAt: now }] : [])],
      email: !!conv?.contactEmail,
      emailKontakt: !!lead.email || !!conv?.contactEmail,
      whatsapp: waMoeglich(lead, conv),
      abfolgen: abfolgen.filter((a) => a.leadId === lead.id),
      abfolgeKontext: { firstName: "", hi: "", kontakt: {}, topic: "", an: "sie", person },
      anrufplan: { followUpAt: null, followUpNote: null, callAttempts: 0, callPlanStartedAt: null, lastCallAttemptAt: null },
    };
    const treffer = zaehleAutomatische(planeNachrichten(eingabe), von, bis);
    if (treffer.length) out.push({ leadId: lead.id, name: lead.name ?? "Kontakt", anzahl: treffer.length, erste: treffer[0].at });
  }
  out.sort((x, y) => x.erste.localeCompare(y.erste));
  return { anzahl: out.reduce((n, l) => n + l.anzahl, 0), leads: out };
}

/** Termin ohne Erinnerungen (nur „steht noch an“). */
const TERMIN_PLATZHALTER = {
  id: "kommend",
  endsAt: null,
  mode: "phone",
  meetUrl: null,
  status: "booked",
  komplettcheck: null,
  reminderSentAt: new Date(0),
  soonReminderSentAt: new Date(0),
  startReminderSentAt: new Date(0),
  startPushAt: new Date(0),
  rescheduleRequestedAt: null,
  attendance: null,
};

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
