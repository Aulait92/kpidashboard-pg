// Daten der Startseite „Heute" (Aufgabenliste für WhatsApp-Kunden):
// Termine heute/morgen, Termine ohne Ergebnis, Chats die den Berater
// brauchen, Rückrufe. Alles serialisierbar für die Client-Komponente.

import { terminArtKurz, terminArtLabel } from "@/lib/termin-art";
import { POLICY_TODO, wiedervorlageHinterTermin } from "@/lib/lead-followup";
import { NACH_ABSCHLUSS_TODOS, UEBERTRAGUNG_TODO } from "@/lib/vertraege-shared";
import { prisma } from "@/lib/prisma";
import { callbackLeadsFor } from "@/lib/neue-leads";
import { getOrCreateBookingSlug } from "@/lib/calendar";
import { appointmentScope, conversationScope, isAdvisor, leadScope, type TeamCtx } from "@/lib/team";
import { listWithoutNextStep, type NoStepLead } from "@/lib/lead-next-step-server";
import { APPOINTMENT_RESULT_AFTER_MS } from "@/lib/lead-next-step";
import { isErneutNote } from "@/lib/lead-erneut";
import { CALL_PAUSE_MAX_MS } from "@/lib/telefonat";
import { kontaktFromLead } from "@/lib/lead-anrede";
import { leadLabel } from "@/lib/showup";
import { wartetStand } from "@/lib/showup-server";

const TZ = "Europe/Berlin";
const DAY = 24 * 60 * 60 * 1000;
const POST_STATUSES = ["Angebot gesendet", "Abschluss", "Kein Interesse", "Disqualifiziert"];

function berlinDayStart(d: Date): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
  const guess = new Date(`${ymd}T00:00:00Z`);
  const h = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(guess),
  );
  return new Date(guess.getTime() - h * 60 * 60 * 1000);
}

export type InboxAppointment = {
  id: string;
  startsAt: string;
  isToday: boolean;
  mode: string;
  meetUrl: string | null;
  leadId: string | null;
  conversationId: string | null;
  name: string;
  phone: string | null;
  summary: string | null;
  /** Ende des Termins (Show-up-Paket: Frage „Ist … da?“ bis zum Ende) */
  endsAt?: string | null;
  /** Anwesenheit (lib/showup.ts): erschienen | fehlt | nicht_erschienen */
  attendance?: string | null;
  /** Name für die Frage „Ist Frau Becker da?“ */
  label?: string;
  /** Nach „Fehlt noch“: ging die WhatsApp mit dem Link raus? */
  wa?: "gesendet" | "vorlage" | "nicht_moeglich" | null;
};
export type InboxOutcome = {
  id: string;
  startsAt: string;
  mode: string;
  leadId: string;
  name: string;
  source: string | null;
  /** „Fehlt noch“ ohne weitere Antwort: Rückfrage „Ist … noch gekommen?“ statt Ergebnis */
  attendance?: string | null;
  label?: string;
};
/**
 * Angebot ablegen und senden (Paket P3, Ole 17.11.2026): Termin mit Ergebnis „Angebot gesendet“, aber noch nicht über
 * die App gesendet bzw. als „selbst gesendet“ vermerkt. Das Nachfassen startet erst mit einem der beiden Wege.
 */
export type InboxAngebot = { id: string; startsAt: string; mode: string; leadId: string; name: string };
/** Angerufen, Ergebnis fehlt (lib/telefonat.ts): Assistent pausiert, bis das Ergebnis eingetragen ist. */
export type InboxOpenCall = { leadId: string; name: string; source: string | null; at: string };
export type InboxChat = { conversationId: string; name: string; reason: string | null; at: string | null };
export type InboxCallback = {
  leadId: string;
  name: string;
  source: string | null;
  phone: string | null;
  reason: string;
  createdAt: string;
  conversationId: string | null;
  /** Kein WhatsApp: sofort anrufen, ganz oben (lib/whatsapp/kein-whatsapp.ts) */
  urgent?: boolean;
  /** Was der Assistent im Chat schon erfahren hat (Conversation.qualificationSummary), für die Anrufliste */
  known?: string | null;
  /** Empfohlene Person: ganz oben mit Gesprächseinstieg (lib/whatsapp/outreach.ts getCallbackLeads) */
  empfehlung?: { einstieg: string } | null;
};
export type InboxFollowUp = {
  leadId: string;
  name: string;
  source: string | null;
  phone: string | null;
  status: string | null;
  note: string | null;
  dueAt: string;
  overdue: boolean;
  conversationId: string | null;
  /** Was der Assistent im Chat schon erfahren hat, für die Anrufliste */
  known?: string | null;
  /**
   * „Erledigt, kein weiterer Anruf nötig“ nur, wenn danach trotzdem ein Schritt bleibt: Termin geplant oder
   * Abschluss (Police, Cross-Selling). Sonst stünde der Kontakt ohne nächsten Schritt da (Ole, 16.11.2026).
   */
  erledigtOk: boolean;
};
/** Kommende Tage (Ole, 13.11.2026): Wiedervorlagen ab morgen und Termine ab übermorgen, 14 Tage. */
export type InboxUpcoming = { key: string; kind: "wiedervorlage" | "termin"; leadId: string | null; name: string; note: string | null; at: string };
export type InboxData = {
  followUps: InboxFollowUp[];
  upcoming: InboxUpcoming[];
  appointments: InboxAppointment[];
  outcomes: InboxOutcome[];
  /** „Angebot ablegen und senden“ (Paket P3) */
  angebote?: InboxAngebot[];
  openCalls?: InboxOpenCall[];
  chats: InboxChat[];
  callbacks: InboxCallback[];
  bookingSlug: string | null;
  /** Offene Leads ohne nächsten Schritt (lib/lead-next-step.ts), älteste zuerst; total = alle. */
  noNextStep: { total: number; leads: NoStepLead[] };
  /**
   * Abschluss mit einem Tipp (P4): Abschlüsse von gestern und älter (bis 14 Tage) mit typischem statt echtem Beitrag.
   * Gesammelt am nächsten Morgen als eine Karte mit Chips, kein eigener Push.
   */
  beitragFehlt?: InboxBeitragFehlt[];
  /** Offene Datenschutz-Anfragen (Betroffenenrechte, lib/dsgvo/server.ts), ganz oben auf Heute */
  datenschutz?: import("@/lib/dsgvo/server").HeuteDsgvo[];
};

export type InboxBeitragFehlt = { leadId: string; name: string; sparte: string; chips: number[]; einheit: "/Jahr" | "/Monat"; ersparnis: boolean };

/** Abschlüsse mit typischem Beitrag (premiumSource „standard“), ab dem Tag nach dem Abschluss, höchstens 14 Tage. */
export async function loadBeitragFehlt(ctx: TeamCtx, now = new Date()): Promise<InboxBeitragFehlt[]> {
  const todayStart = berlinDayStart(now);
  const rows = await prisma.leadContract.findMany({
    where: {
      customerId: ctx.customerId,
      primaryLeadId: { not: null },
      premiumSource: "standard",
      status: "aktiv",
      signedAt: { lt: todayStart, gte: new Date(todayStart.getTime() - 14 * DAY) },
      lead: { ...leadScope(ctx), status: "Abschluss", erasedAt: null },
    },
    orderBy: { signedAt: "desc" },
    take: 10,
    select: { leadId: true, sparte: true, lead: { select: { name: true, formData: true, contactOverrides: true } } },
  });
  if (!rows.length) return [];
  const [{ loadCustomerProvision }, { beitragsChips, beitragEinheit }, { sparteLabel }] = await Promise.all([
    import("@/lib/provision-server"),
    import("@/lib/abschluss"),
    import("@/lib/provision"),
  ]);
  const rates = (await loadCustomerProvision(ctx.customerId)).rates;
  return rows.map((r) => {
    const e = beitragEinheit(r.sparte);
    return { leadId: r.leadId, name: leadLabel(kontaktFromLead(r.lead), r.lead.name), sparte: sparteLabel(r.sparte), chips: beitragsChips(r.sparte, rates), einheit: e.suffix, ersparnis: e.ersparnis };
  });
}

export async function loadInbox(ctx: TeamCtx): Promise<InboxData> {
  const customerId = ctx.customerId;
  const apptScope = appointmentScope(ctx);
  const now = new Date();
  const todayStart = berlinDayStart(now);
  const tomorrowEnd = new Date(todayStart.getTime() + 2 * DAY);

  const horizon = new Date(todayStart.getTime() + 15 * DAY);
  const followUpOpen = {
    OR: [
      { NOT: { status: { in: POST_STATUSES.filter((x) => x !== "Angebot gesendet") } } },
      { status: "Abschluss", policyDoneAt: null, followUpNote: POLICY_TODO },
      // Aufgaben nach dem Abschluss (lib/lead-aufgaben.ts): „Police da …?“ nach 2, „Weiteres Produkt anbieten?“ nach 6 Wochen
      ...NACH_ABSCHLUSS_TODOS.map((t) => ({ status: "Abschluss", followUpNote: { startsWith: t } })),
      // Bestandsübertragung bestätigt? (Maklervollmacht) in jeder Phase
      { followUpNote: { startsWith: UEBERTRAGUNG_TODO } },
    ],
  };
  const [laterFollowUps, laterAppts] = await Promise.all([
    prisma.lead.findMany({
      where: { ...leadScope(ctx), followUpAt: { gte: new Date(todayStart.getTime() + DAY), lt: horizon }, ...followUpOpen },
      orderBy: { followUpAt: "asc" },
      take: 100,
      select: { id: true, name: true, followUpAt: true, followUpNote: true, appointments: { where: { status: "booked", startsAt: { gt: now } }, select: { id: true }, take: 1 } },
    }),
    prisma.appointment.findMany({
      where: { ...apptScope, status: "booked", startsAt: { gte: tomorrowEnd, lt: horizon } },
      orderBy: { startsAt: "asc" },
      take: 100,
      select: { id: true, startsAt: true, mode: true, leadId: true, lead: { select: { name: true } } },
    }),
  ]);
  const [upcoming, past, chats, callbacks, cal, followUps] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        ...apptScope,
        status: "booked",
        startsAt: { gte: new Date(now.getTime() - 60 * 60 * 1000), lt: tomorrowEnd },
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        mode: true,
        meetUrl: true,
        leadId: true,
        conversationId: true,
        attendance: true,
        attendanceAt: true,
        lead: { select: { name: true, phone: true, formData: true, contactOverrides: true } },
      },
    }),
    prisma.appointment.findMany({
      where: {
        ...apptScope,
        status: "booked",
        leadId: { not: null },
        startsAt: { lte: new Date(now.getTime() - APPOINTMENT_RESULT_AFTER_MS), gt: new Date(now.getTime() - 30 * DAY) },
      },
      orderBy: { startsAt: "desc" },
      take: 20,
      select: { id: true, startsAt: true, mode: true, leadId: true, attendance: true, lead: { select: { name: true, status: true, source: true, formData: true, contactOverrides: true } } },
    }),
    prisma.conversation.findMany({
      where: { ...conversationScope(ctx), needsAttention: true },
      orderBy: { attentionAt: "desc" },
      select: { id: true, contactName: true, contactPhone: true, attentionReason: true, attentionAt: true },
    }),
    callbackLeadsFor(ctx),
    prisma.calendarConnection.findUnique({ where: { customerId }, select: { status: true } }),
    prisma.lead.findMany({
      where: {
        ...leadScope(ctx),
        followUpAt: { lt: new Date(todayStart.getTime() + DAY) },
        // Nach dem Abschluss bleibt nur „Police fertig machen“ (Ole, 13.11.2026)
        OR: [
          { NOT: { status: { in: POST_STATUSES.filter((x) => x !== "Angebot gesendet") } } },
          { status: "Abschluss", policyDoneAt: null, followUpNote: POLICY_TODO },
          ...NACH_ABSCHLUSS_TODOS.map((t) => ({ status: "Abschluss", followUpNote: { startsWith: t } })),
          // Bestandsübertragung bestätigt? (Maklervollmacht) in jeder Phase
          { followUpNote: { startsWith: UEBERTRAGUNG_TODO } },
        ],
      },
      orderBy: { followUpAt: "asc" },
      take: 50,
      select: {
        id: true,
        name: true,
        source: true,
        phone: true,
        status: true,
        followUpAt: true,
        followUpNote: true,
        conversations: { select: { id: true }, take: 1 },
        appointments: { where: { status: "booked", startsAt: { gt: now } }, select: { id: true }, take: 1 },
      },
    }),
  ]);
  const followUpIds = new Set(followUps.map((f) => f.id));
  // Angerufen, aber noch kein Ergebnis (älter als 2 Minuten, höchstens 3 Stunden)
  const openCalls = await prisma.lead.findMany({
    where: { ...leadScope(ctx), callStartedAt: { lt: new Date(now.getTime() - 2 * 60 * 1000), gt: new Date(now.getTime() - CALL_PAUSE_MAX_MS) } },
    orderBy: { callStartedAt: "desc" },
    take: 20,
    select: { id: true, name: true, source: true, callStartedAt: true },
  });
  // Angebot ablegen und senden (Paket P3): Ergebnis „Angebot gesendet“, noch nicht gesendet, kein Nachfassen läuft
  const angebote = await prisma.appointment.findMany({
    where: {
      ...apptScope,
      leadId: { not: null },
      status: { in: ["completed", "booked"] },
      angebotGesendetAt: null,
      startsAt: { lte: now, gt: new Date(now.getTime() - 14 * DAY) },
      lead: { status: "Angebot gesendet", erasedAt: null, sequences: { none: { stoppedAt: null, kind: { in: ["offer", "offer_selbst", "offer_bedenkzeit", "offer_selbst_bedenkzeit"] } } } },
    },
    orderBy: { startsAt: "desc" },
    take: 20,
    select: { id: true, startsAt: true, mode: true, leadId: true, lead: { select: { name: true } } },
  });
  // „X Leads ohne nächsten Schritt“: Termine ohne Ergebnis, die schon unter „Wie lief's?“ stehen, nicht doppelt
  const noStep = await listWithoutNextStep(leadScope(ctx), { now, take: 30 });
  const outcomeLeadIds = new Set(past.filter((a) => !POST_STATUSES.includes(a.lead?.status ?? "")).map((a) => a.leadId));
  // Termin vor Wiedervorlage (Usability-Check 18.11.2026): Wer heute bzw. demnächst mit einem Termin oder unter
  // „Wie lief's?“ steht, erscheint nicht zusätzlich mit seiner Wiedervorlage. Das Ergebnis des Termins erledigt sie
  // (lib/lead-followup.ts wiedervorlageVorTerminErledigen); wird der Termin abgesagt, steht sie wieder da.
  const mitTermin = new Set([...upcoming.map((a) => a.leadId), ...laterAppts.map((a) => a.leadId), ...outcomeLeadIds].filter((x): x is string => !!x));
  const zeigen = (f: { id: string; followUpNote: string | null; appointments: unknown[] }) => !(wiedervorlageHinterTermin(f.followUpNote) && (f.appointments.length > 0 || mitTermin.has(f.id)));
  const wiedervorlagen = followUps.filter(zeigen);

  // Auch für die Anrufliste: was der Assistent schon weiß (Ole, 16.11.2026)
  const convIds = [
    ...upcoming.map((a) => a.conversationId),
    ...callbacks.map((c) => c.conversationId),
    ...followUps.map((f) => f.conversations[0]?.id ?? null),
  ].filter((x): x is string => !!x);
  const convs = convIds.length
    ? await prisma.conversation.findMany({
        where: { id: { in: convIds } },
        select: { id: true, contactName: true, contactPhone: true, qualificationSummary: true },
      })
    : [];
  const convById = new Map(convs.map((c) => [c.id, c]));
  // „Fehlt noch“: Stand der WhatsApp mit dem Link (Show-up-Paket)
  const waStand = new Map(await Promise.all(upcoming.filter((a) => a.attendance === "fehlt").map(async (a) => [a.id, await wartetStand(a)] as const)));

  return {
    upcoming: [
      ...laterFollowUps.filter(zeigen).map((f) => ({
        key: `f:${f.id}`,
        kind: "wiedervorlage" as const,
        leadId: f.id,
        name: f.name ?? "Lead",
        note: f.followUpNote,
        at: f.followUpAt!.toISOString(),
      })),
      ...laterAppts.map((a) => ({
        key: `a:${a.id}`,
        kind: "termin" as const,
        leadId: a.leadId,
        name: a.lead?.name ?? "Termin",
        note: terminArtLabel(a.mode),
        at: a.startsAt.toISOString(),
      })),
    ].sort((x, y) => x.at.localeCompare(y.at)),
    // Erneut eingetragen (lib/lead-erneut.ts): ganz oben unter den Wiedervorlagen, sonst nach Fälligkeit
    followUps: [...wiedervorlagen.filter((f) => isErneutNote(f.followUpNote)), ...wiedervorlagen.filter((f) => !isErneutNote(f.followUpNote))].map((f) => ({
      leadId: f.id,
      name: f.name ?? "Lead",
      source: f.source,
      phone: f.phone,
      status: f.status,
      note: f.followUpNote,
      dueAt: f.followUpAt!.toISOString(),
      overdue: f.followUpAt!.getTime() < todayStart.getTime(),
      conversationId: f.conversations[0]?.id ?? null,
      known: convById.get(f.conversations[0]?.id ?? "")?.qualificationSummary ?? null,
      erledigtOk: f.status === "Abschluss" || f.appointments.length > 0,
    })),
    appointments: upcoming.map((a) => {
      const conv = a.conversationId ? convById.get(a.conversationId) : undefined;
      return {
        id: a.id,
        startsAt: a.startsAt.toISOString(),
        isToday: a.startsAt.getTime() < todayStart.getTime() + DAY,
        mode: a.mode,
        meetUrl: a.meetUrl,
        leadId: a.leadId,
        conversationId: a.conversationId,
        name: a.lead?.name ?? conv?.contactName ?? "Lead",
        phone: a.lead?.phone ?? conv?.contactPhone ?? null,
        summary: conv?.qualificationSummary ?? null,
        endsAt: a.endsAt?.toISOString() ?? null,
        attendance: a.attendance,
        label: leadLabel(kontaktFromLead(a.lead, conv?.contactName ?? null)),
        wa: waStand.get(a.id) ?? null,
      };
    }),
    outcomes: past
      .filter((a) => !POST_STATUSES.includes(a.lead?.status ?? ""))
      .map((a) => ({
        id: a.id,
        startsAt: a.startsAt.toISOString(),
        mode: a.mode,
        leadId: a.leadId!,
        name: a.lead?.name ?? "Lead",
        source: a.lead?.source ?? null,
        attendance: a.attendance,
        label: leadLabel(kontaktFromLead(a.lead)),
      })),
    // Je Lead nur der neueste Termin
    angebote: angebote
      .filter((t, i) => angebote.findIndex((x) => x.leadId === t.leadId) === i)
      .map((t) => ({ id: t.id, startsAt: t.startsAt.toISOString(), mode: t.mode, leadId: t.leadId!, name: t.lead?.name ?? "Lead" })),
    openCalls: openCalls.map((l) => ({ leadId: l.id, name: l.name ?? "Lead", source: l.source, at: l.callStartedAt!.toISOString() })),
    chats: chats.map((c) => ({
      conversationId: c.id,
      name: c.contactName ?? `+${c.contactPhone}`,
      reason: c.attentionReason,
      at: c.attentionAt?.toISOString() ?? null,
    })),
    // „Kein WhatsApp“ (urgent) steht immer da, auch neben einer Wiedervorlage, und ganz oben (components/today-inbox.tsx)
    callbacks: callbacks.filter((c) => c.urgent || !followUpIds.has(c.id)).map((c) => ({
      leadId: c.id,
      name: c.name ?? "Unbekannt",
      source: c.source ?? null,
      phone: c.phone,
      reason: c.reason,
      createdAt: c.createdAt.toISOString(),
      conversationId: c.conversationId,
      urgent: !!c.urgent,
      empfehlung: c.empfehlung ?? null,
      known: c.conversationId ? (convById.get(c.conversationId)?.qualificationSummary ?? null) : null,
    })),
    bookingSlug: cal?.status === "connected" ? await getOrCreateBookingSlug(customerId) : null,
    noNextStep: { total: noStep.total, leads: noStep.leads.filter((l) => !outcomeLeadIds.has(l.leadId)) },
    beitragFehlt: await loadBeitragFehlt(ctx, now).catch(() => []),
    datenschutz: await loadDatenschutz(ctx, now).catch(() => []),
  };
}

/** Offene Datenschutz-Anfragen; Berater (Team) sehen nur die ihrer Leads. */
async function loadDatenschutz(ctx: TeamCtx, now: Date) {
  const { offeneDsgvoAnfragen } = await import("@/lib/dsgvo/server");
  const alle = await offeneDsgvoAnfragen(ctx.customerId, null, now);
  if (!isAdvisor(ctx) || !alle.length) return alle;
  const ids = alle.map((x) => x.leadId).filter((x): x is string => !!x);
  const eigene = new Set((await prisma.lead.findMany({ where: { ...leadScope(ctx), id: { in: ids } }, select: { id: true } })).map((l) => l.id));
  return alle.filter((x) => x.leadId && eigene.has(x.leadId));
}
