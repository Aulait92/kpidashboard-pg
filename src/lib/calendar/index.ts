// Anbieter-neutraler Kalender-Kern: freie Slots (Berliner Zeit), Buchung mit
// Doppelbuchungs-Schutz, Buchungs-Slug. Die eigentliche API spricht je
// Verbindung der passende Adapter (Google oder Microsoft/Outlook).

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  googleCreateEvent,
  googleDeleteEvent,
  googleGetResponses,
  googleGetBusy,
  googleHasRequiredScopes,
} from "@/lib/calendar/google";
import { fetchIcsBusy } from "@/lib/calendar/ics";
import { allianzBusy, decodeAllianzCalendar } from "@/lib/calendar/allianz-online";
import { berlinAt, calendarBlocksBusy, DEFAULT_DURATION_MIN, durationForKey, loadLeadTimes, type LeadTimes } from "@/lib/calendar/lead-times";
import {
  microsoftCreateEvent,
  microsoftDeleteEvent,
  microsoftGetResponses,
  microsoftGetBusy,
} from "@/lib/calendar/microsoft";
import { decryptSecret } from "@/lib/encryption";
import {
  appUrl,
  buildEventDescription,
  eventSummary,
} from "@/lib/whatsapp/event-text";
import { sendLeadEmail } from "@/lib/calendar/lead-email";
import { recordLeadProgress } from "@/lib/lead-progress";
import { sendToBuyersOfCustomer, sendToUser } from "@/lib/push";
import { notifyLeadPush } from "@/lib/team";
import { absenceBusyForKeys, availableAgainYmd, extraSearchDays } from "@/lib/absence";
import { loadConnection, userCalendarKey, userIdOfKey, type Busy, type CreatedEvent, type NewEvent } from "@/lib/calendar/tokens";

export type { CalendarProvider } from "@/lib/calendar/tokens";

export type Slot = { start: string; end: string };

/** Termine sind deutsche Ortszeit — unabhängig von der Server-Zeitzone (UTC). */
const TZ = "Europe/Berlin";

export const PROVIDER_LABELS: Record<string, string> = {
  google: "Google-Kalender",
  microsoft: "Outlook-Kalender",
};

/** Hat die Verbindung alle aktuell nötigen Berechtigungen? */
export function hasRequiredScopes(conn: { provider: string; scope: string | null }): boolean {
  if (conn.provider === "microsoft") return /calendars\.readwrite/i.test(conn.scope ?? "");
  return googleHasRequiredScopes(conn.scope);
}

/** Adapter für einen Kalender-Schlüssel (customerId oder user:<id>). */
export async function adapterFor(customerId: string) {
  const conn = await loadConnection(customerId);
  // Veröffentlichter Firmenkalender (ICS) und Allianz-Online-Kalender gelten
  // nur für den Agentur-Kalender.
  const agent = userIdOfKey(customerId)
    ? null
    : await prisma.agentConfig.findUnique({
        where: { customerId },
        select: { availabilityIcsUrlEnc: true, allianzCalendarEnc: true, allianzConsentAt: true },
      });
  const icsUrl = agent?.availabilityIcsUrlEnc ? decryptSecret(agent.availabilityIcsUrlEnc) : null;
  const allianz = agent?.allianzConsentAt ? decodeAllianzCalendar(agent.allianzCalendarEnc) : null;

  const native =
    conn.provider === "microsoft"
      ? {
          getBusy: (min: Date, max: Date) => microsoftGetBusy(customerId, min, max),
          createEvent: (ev: NewEvent) => microsoftCreateEvent(customerId, ev),
          deleteEvent: (id: string) => microsoftDeleteEvent(customerId, id),
        }
      : {
          getBusy: (min: Date, max: Date) => googleGetBusy(customerId, min, max),
          createEvent: (ev: NewEvent) => googleCreateEvent(customerId, ev),
          deleteEvent: (id: string) => googleDeleteEvent(customerId, id),
        };

  return {
    // Belegt = Buchungskalender UND (falls hinterlegt) veröffentlichter
    // Firmenkalender UND Allianz-Online-Kalender UND „Zeit blockieren".
    // Fällt eine Quelle aus, wird geworfen — nie still „frei".
    getBusy: async (min: Date, max: Date): Promise<Busy[]> => {
      const lists = await Promise.all([
        native.getBusy(min, max),
        icsUrl ? fetchIcsBusy(icsUrl, min, max) : Promise.resolve([] as Busy[]),
        allianz ? allianzBusy(customerId, allianz, min, max) : Promise.resolve([] as Busy[]),
        calendarBlocksBusy(customerId, min, max),
      ]);
      return lists.flat();
    },
    // Termine entstehen immer im Buchungskalender (Google/Microsoft); die
    // Einladung an die Berater-Adresse (z. B. Allianz-Mail) setzt bookAppointment.
    createEvent: (ev: NewEvent): Promise<CreatedEvent> => native.createEvent(ev),
    deleteEvent: (id: string): Promise<void> => native.deleteEvent(id),
  };
}

/** Berlin-Kalenderdatum (Y/M/D + Wochentag) zu einem Zeitpunkt. */
function berlinParts(d: Date): { y: number; m: number; day: number; dow: number } {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    day: Number(get("day")),
    dow: dows.indexOf(get("weekday")),
  };
}

const overlaps = (busy: Busy[], start: Date, end: Date) =>
  busy.some((b) => b.start < end && b.end > start);

/**
 * Uhrzeiten für Vorschläge: feste Stunden (nur Mo–Fr) oder die Lead-Zeiten
 * des jeweiligen Kalenders („lead"); `prefer` = zusätzlich zuerst diese
 * Uhrzeiten an Lead-Tagen (z. B. alte Uhrzeit beim Verschieben).
 */
export type SlotHours = number[] | "lead" | { lead: true; prefer: string[] };

/** Kandidaten-Uhrzeiten ("HH:MM") eines Kalendertags, in Vorschlags-Reihenfolge. */
export function candidateTimes(spec: SlotHours, lt: LeadTimes, dow: number): string[] {
  if (Array.isArray(spec)) return dow === 0 || dow === 6 ? [] : spec.map((h) => `${String(h).padStart(2, "0")}:00`);
  if (!lt.weekdays.includes(dow)) return [];
  const prefer = spec === "lead" ? [] : spec.prefer;
  return [...new Set([...prefer, ...lt.times])];
}

/** Freie Slots der nächsten Tage (Standard: Lead-Zeiten, ohne Einstellung Mo–Fr 10/14/16 Uhr). */
export async function suggestSlots(
  customerId: string,
  durationMin = 30,
  count = 3,
  hours: SlotHours = "lead",
  days = 10,
  /** Lead, für den gebucht wird (Team: Kalender des zuständigen Beraters). */
  leadId?: string | null,
  /** Frühester Suchbeginn (z. B. Tag nach einer Abwesenheit). */
  from?: Date | null,
): Promise<Slot[]> {
  const keys = await bookingKeys(customerId, leadId);
  const now = new Date();
  const base = from && from.getTime() > now.getTime() ? from : now;
  const timeMin = new Date(Math.max(now.getTime() + 60 * 60 * 1000, base.getTime()));
  // Abwesenheit (Urlaub, Krank …): diese Zeit ist belegt, und die Suche läuft
  // entsprechend länger, damit danach noch Termine gefunden werden.
  const horizon = new Date(base.getTime() + (days + 60) * 24 * 60 * 60 * 1000);
  const absent = await absenceBusyForKeys(customerId, keys, leadId, timeMin, horizon);
  days += extraSearchDays(absent, base, days);
  const timeMax = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  // Team: frei, sobald EIN infrage kommender Kalender frei ist. Ein einzelner
  // ausgefallener Berater-Kalender blockiert nicht alle; fällt alles aus → Fehler.
  const results = await Promise.allSettled(keys.map(async (k) => (await adapterFor(k)).getBusy(timeMin, timeMax)));
  const cals = await Promise.all(
    results.map(async (r, i) =>
      r.status === "fulfilled"
        ? { busy: [...r.value, ...absent[i]], lt: Array.isArray(hours) ? null : await loadLeadTimes(keys[i]) }
        : null,
    ),
  );
  const usable = cals.filter((c): c is { busy: Busy[]; lt: LeadTimes | null } => !!c);
  if (usable.length === 0) {
    const first = results[0];
    throw first?.status === "rejected" ? first.reason : new Error("Kein Kalender verfügbar.");
  }

  const slots: Slot[] = [];
  for (let d = 0; d < days && slots.length < count; d++) {
    const { y, m, day, dow } = berlinParts(new Date(base.getTime() + d * 24 * 60 * 60 * 1000));
    const ymd = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    // Je Kalender eigene Lead-Zeiten; Reihenfolge: wie angegeben, dann chronologisch.
    const perCal = usable.map((c) => new Set(candidateTimes(hours, c.lt ?? { weekdays: [], times: [] }, dow)));
    const union = new Set(perCal.flatMap((x) => [...x]));
    const prefer = Array.isArray(hours) || hours === "lead" ? [] : hours.prefer.filter((t) => union.has(t));
    const ordered = Array.isArray(hours) ? [...union] : [...new Set([...prefer, ...[...union].sort()])];
    for (const t of ordered) {
      if (slots.length >= count) break;
      const start = berlinAt(ymd, t);
      if (start.getTime() < timeMin.getTime()) continue;
      const end = new Date(start.getTime() + durationMin * 60000);
      if (usable.some((c, i) => perCal[i].has(t) && !overlaps(c.busy, start, end))) {
        slots.push({ start: start.toISOString(), end: end.toISOString() });
      }
    }
  }
  return slots;
}

/**
 * Ist gerade jeder infrage kommende Kalender wegen einer Abwesenheit gesperrt?
 * Dann der erste Werktag, ab dem wieder Termine möglich sind (YYYY-MM-DD).
 */
export async function bookingPausedUntil(customerId: string, leadId?: string | null): Promise<string | null> {
  const keys = await bookingKeys(customerId, leadId);
  const now = new Date();
  const absent = await absenceBusyForKeys(customerId, keys, leadId, now, new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000));
  return availableAgainYmd(absent, now);
}

/**
 * Infrage kommende Kalender für eine Buchung, in Reihenfolge der Bevorzugung.
 * - Lead hat einen Zuständigen mit eigenem Kalender → nur dieser.
 * - Lead hat einen Zuständigen ohne eigenen Kalender → Agentur-Kalender.
 * - sonst (Buchungsseite, neuer Kontakt): alle Team-Mitglieder, die Leads
 *   bekommen und ihren Kalender verbunden haben, wer am längsten keinen Lead
 *   bekam zuerst; dazu der Agentur-Kalender. Ohne Team: nur Agentur-Kalender.
 */
export async function bookingKeys(customerId: string, leadId?: string | null): Promise<string[]> {
  if (leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { assignedUser: { select: { id: true, advisorCalendar: { select: { status: true } } } } },
    });
    if (lead?.assignedUser) {
      return lead.assignedUser.advisorCalendar?.status === "connected" ? [userCalendarKey(lead.assignedUser.id)] : [customerId];
    }
  }
  const advisors = await prisma.user.findMany({
    where: { customerId, role: "BUYER", receivesLeads: true, advisorCalendar: { status: "connected" } },
    select: { id: true, lastLeadAssignedAt: true },
    orderBy: [{ lastLeadAssignedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
  });
  const main = await prisma.calendarConnection.findUnique({ where: { customerId }, select: { status: true } });
  const keys = advisors.map((a) => userCalendarKey(a.id));
  if (main?.status === "connected" || keys.length === 0) keys.push(customerId);
  return keys;
}

/**
 * Termindauer für Buchungen dieses Kunden/Leads: Dauer des ersten infrage
 * kommenden Kalenders (Berater mit eigener Einstellung), sonst die des
 * Agentur-Kalenders, sonst 30 Minuten.
 */
export async function durationForKeys(customerId: string, keys: string[]): Promise<number> {
  const first = keys[0] && keys[0] !== customerId ? await durationForKey(keys[0]) : null;
  return first ?? (await durationForKey(customerId)) ?? DEFAULT_DURATION_MIN;
}

export async function bookingDurationMin(customerId: string, leadId?: string | null): Promise<number> {
  return durationForKeys(customerId, await bookingKeys(customerId, leadId));
}

/** Fehler, wenn der gewünschte Slot inzwischen belegt ist. */
export class SlotBusyError extends Error {
  constructor() {
    super("SLOT_BUSY");
  }
}

/** Termin anlegen: Kalender-Event (Video-Link bei Video) + Appointment-Zeile. */
export async function bookAppointment(opts: {
  customerId: string;
  leadId?: string | null;
  conversationId?: string | null;
  start: string;
  durationMin?: number;
  mode: "phone" | "video";
  summary: string;
  description?: string;
  /** Lead als Teilnehmer → der Kalender verschickt die Einladung per Mail. */
  attendeeEmail?: string | null;
  /** Für die kundenfreundliche Einladung (Anrede, Rückrufnummer). */
  leadName?: string | null;
  leadPhone?: string | null;
  /** E-Mail an den Lead: Bestätigung (Standard), „verschoben" oder keine. */
  notifyLead?: "booked" | "rescheduled" | false;
}): Promise<{
  appointmentId: string;
  meetUrl: string | null;
  start: string;
  manageUrl: string;
}> {
  // Team: Kalender des zuständigen Beraters bzw. der erste freie im Team.
  const keys = await bookingKeys(opts.customerId, opts.leadId);
  // Geheimer Verwaltungs-Link für den Lead (absagen/verschieben), 144 Bit.
  const manageToken = randomBytes(18).toString("base64url");
  const manageUrl = `${appUrl() ?? ""}/book/manage/${manageToken}`;
  const start = new Date(opts.start);
  // Dauer: wie übergeben (z. B. beim Verschieben die alte), sonst die eingestellte Termindauer
  const durationMin = opts.durationMin ?? (await durationForKeys(opts.customerId, keys));
  const end = new Date(start.getTime() + durationMin * 60000);
  if (start.getTime() < Date.now()) throw new Error("Startzeit liegt in der Vergangenheit.");
  // Unmittelbar vor dem Anlegen erneut prüfen — der Slot kann seit dem
  // Vorschlag belegt worden sein (oder der Bot nennt eine eigene Zeit).
  let calendarKey: string | null = null;
  let adapter: Awaited<ReturnType<typeof adapterFor>> | null = null;
  let lastErr: unknown = null;
  // Abwesende Person: in ihrem Kalender wird nichts gebucht.
  const absent = await absenceBusyForKeys(opts.customerId, keys, opts.leadId, start, end);
  for (const [i, key] of keys.entries()) {
    if (overlaps(absent[i], start, end)) continue;
    try {
      const a = await adapterFor(key);
      if (!overlaps(await a.getBusy(start, end), start, end)) {
        calendarKey = key;
        adapter = a;
        break;
      }
    } catch (err) {
      lastErr = err;
    }
  }
  if (!adapter || !calendarKey) {
    if (lastErr && keys.length === 1) throw lastErr;
    throw new SlotBusyError();
  }
  const advisorUserId = userIdOfKey(calendarKey);

  // Fester Video-Link des Kunden (z. B. Webex-Raum) hat Vorrang vor
  // Meet/Teams — viele Firmen (Allianz: Webex) nutzen eigene Tools.
  const agent = await prisma.agentConfig.findUnique({
    where: { customerId: opts.customerId },
    select: { videoRoomUrl: true, advisorEmail: true },
  });
  const room = opts.mode === "video" ? agent?.videoRoomUrl?.trim() || null : null;
  // Im eigenen Kalender des Beraters braucht es keine zusätzliche Einladung.
  const advisorEmail = advisorUserId ? null : agent?.advisorEmail?.trim().toLowerCase() || null;

  // EINE Einladung: nur an den Berater (interne Infos: Qualifizierung,
  // CRM-Link). Der Lead bekommt bewusst KEINE E-Mail-Einladung von unserem
  // Postfach — er soll nur den Berater sehen. Er erhält die Bestätigung per
  // WhatsApp (Berater-Nummer) + „Zum Kalender hinzufügen" (ICS/Google-Link
  // über den Verwaltungs-Link). Das Event hält zugleich den Slot frei.
  const event = await adapter.createEvent({
    start,
    end,
    summary: opts.summary,
    description: [opts.description ?? "", room ? `Videocall: ${room}` : ""]
      .filter(Boolean)
      .join("\n\n"),
    attendeeEmails: advisorEmail ? [advisorEmail] : [],
    video: opts.mode === "video" && !room,
    location:
      room ?? (opts.mode === "phone" && opts.leadPhone ? `Telefon: Lead anrufen unter +${opts.leadPhone}` : null),
  });
  const videoUrl = room ?? event.videoUrl;

  const appt = await prisma.appointment.create({
    data: {
      customerId: opts.customerId,
      leadId: opts.leadId ?? null,
      conversationId: opts.conversationId ?? null,
      mode: opts.mode,
      startsAt: start,
      endsAt: end,
      calendarEventId: event.eventId,
      calendarKey: advisorUserId ? calendarKey : null,
      meetUrl: videoUrl,
      status: "booked",
      manageToken,
    },
  });
  // Team: Lead ohne Zuständigen gehört jetzt dem Berater, bei dem gebucht wurde.
  if (advisorUserId && opts.leadId) {
    const n = await prisma.lead.updateMany({ where: { id: opts.leadId, assignedUserId: null }, data: { assignedUserId: advisorUserId } });
    if (n.count) await prisma.user.update({ where: { id: advisorUserId }, data: { lastLeadAssignedAt: new Date() } });
  }
  // Push an den Kunden: neuer Termin (nicht bei Verschiebung).
  if (opts.notifyLead !== "rescheduled") {
    const payload = {
      title: `📅 Neuer Termin: ${opts.leadName ?? "Lead"}`,
      body: `${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(start)} Uhr · ${opts.mode === "video" ? "Videocall" : "Telefonat"}`,
      tag: `appt:${appt.id}`,
      url: "/buyer",
    };
    // Team: nur an den zuständigen Berater.
    if (opts.leadId) await notifyLeadPush(opts.leadId, payload);
    else if (advisorUserId) await sendToUser(advisorUserId, payload).catch((e) => console.error("[appt push]", e));
    else await sendToBuyersOfCustomer(opts.customerId, payload).catch((e) => console.error("[appt push]", e));
  }
  // CRM mitführen: Termin ⇒ In Beratung, Erstkontakt setzen (DB + Airtable).
  if (opts.notifyLead !== "rescheduled") {
    await recordLeadProgress(opts.leadId, "booked");
  }
  // Lead-Mail (Bestätigung/Verschiebung) — darf die Buchung nie scheitern lassen.
  const notify = opts.notifyLead === undefined ? "booked" : opts.notifyLead;
  if (notify) {
    await sendLeadEmail(appt.id, notify).catch((e) => console.error("[lead email]", e));
  }
  return {
    appointmentId: appt.id,
    meetUrl: videoUrl,
    start: start.toISOString(),
    manageUrl,
  };
}

/** "Allianz Anid Schwarzkopf" → "allianz-anid-schwarzkopf" (URL-tauglich). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Buchungs-Slug des Kunden holen bzw. einmalig erzeugen. Bewusst lesbar und
 * aus dem Kundennamen abgeleitet: Der Link steht fest in Meta-Leadformularen
 * (dort nach Veröffentlichung nicht mehr änderbar) und muss deshalb über
 * Umgebungen/Datenbanken hinweg gleich bleiben.
 */
export async function getOrCreateBookingSlug(customerId: string): Promise<string> {
  const conn = await prisma.calendarConnection.findUnique({
    where: { customerId },
    select: { bookingSlug: true, customer: { select: { name: true } } },
  });
  if (conn?.bookingSlug) return conn.bookingSlug;
  const base = slugify(conn?.customer.name ?? "") || randomBytes(6).toString("base64url");
  let slug = base;
  for (let i = 2; ; i++) {
    const taken = await prisma.calendarConnection.findUnique({
      where: { bookingSlug: slug },
      select: { id: true },
    });
    if (!taken) break;
    slug = `${base}-${i}`;
  }
  await prisma.calendarConnection.update({
    where: { customerId },
    data: { bookingSlug: slug },
  });
  return slug;
}

/**
 * Termin absagen: im verbundenen Kalender löschen (Teilnehmer erhalten eine
 * Absage) und als „cancelled" markieren. Lässt sich das Kalender-Event nicht
 * löschen (z. B. Termin stammt noch von einem früher verbundenen Anbieter),
 * wird trotzdem abgesagt und der Hinweis zurückgegeben.
 */
export async function cancelAppointment(
  appointmentId: string,
  customerId: string,
  by: "lead" | "advisor" | "team" | "system" = "team",
  notifyLead = true,
): Promise<{ calendarDeleted: boolean; note?: string }> {
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, customerId },
    select: { id: true, calendarEventId: true, advisorEventId: true, status: true, leadId: true, calendarKey: true },
  });
  if (!appt) throw new Error("Termin nicht gefunden.");
  const key = appt.calendarKey ?? customerId;
  let calendarDeleted = false;
  let note: string | undefined;
  // Beide Einladungen löschen (Lead + Berater) → beide erhalten eine Absage.
  const eventIds = [appt.calendarEventId, appt.advisorEventId].filter(
    (id): id is string => !!id,
  );
  if (eventIds.length) {
    try {
      const conn = await loadConnection(key);
      for (const id of eventIds) {
        if (conn.provider === "microsoft") await microsoftDeleteEvent(key, id);
        else await googleDeleteEvent(key, id);
      }
      calendarDeleted = true;
    } catch (err) {
      note = err instanceof Error ? err.message : String(err);
    }
  }
  await prisma.appointment.update({
    where: { id: appt.id },
    data: { status: "cancelled", cancelledAt: new Date(), cancelledBy: by },
  });
  // CRM: Lead zählt nicht mehr als Termin (außer es ist noch einer gebucht).
  await recordLeadProgress(appt.leadId, "cancelled");
  if (by === "lead") {
    const payload = {
      title: "❌ Termin abgesagt",
      body: "Ein Lead hat seinen Termin abgesagt und steht jetzt in deiner Rückrufliste.",
      tag: `appt-cancel:${appt.id}`,
      url: "/buyer/leads",
    };
    if (appt.leadId) await notifyLeadPush(appt.leadId, payload);
    else await sendToBuyersOfCustomer(customerId, payload).catch((e) => console.error("[appt push]", e));
  }
  if (notifyLead) {
    await sendLeadEmail(appt.id, "cancelled").catch((e) => console.error("[lead email]", e));
  }
  return { calendarDeleted, note };
}

/**
 * Termin verschieben: zuerst den neuen Termin buchen (Slot-Recheck), erst
 * danach den alten absagen — so entsteht nie eine Lücke ohne Termin.
 * Übernimmt Lead, Konversation, Art und Teilnehmer des alten Termins.
 */
export async function rescheduleAppointment(opts: {
  appointmentId: string;
  customerId: string;
  start: string;
  mode?: "phone" | "video";
  by: "lead" | "team";
  /** Keine Mail an den Lead (z. B. Übergabe an die Vertretung zur selben Zeit). */
  silent?: boolean;
}): Promise<{ appointmentId: string; meetUrl: string | null; start: string; manageUrl: string }> {
  const old = await prisma.appointment.findFirst({
    where: { id: opts.appointmentId, customerId: opts.customerId, status: "booked" },
    select: { id: true, leadId: true, conversationId: true, mode: true, startsAt: true, endsAt: true },
  });
  if (!old) throw new Error("Termin nicht gefunden oder bereits abgesagt.");
  // Beim Verschieben bleibt die Dauer des Termins erhalten.
  const oldDuration = old.endsAt ? Math.max(15, Math.round((old.endsAt.getTime() - old.startsAt.getTime()) / 60000)) : undefined;
  const conv = old.conversationId
    ? await prisma.conversation.findUnique({
        where: { id: old.conversationId },
        select: { contactName: true, contactPhone: true, contactEmail: true, qualificationSummary: true },
      })
    : null;
  const lead = old.leadId
    ? await prisma.lead.findUnique({ where: { id: old.leadId }, select: { source: true } })
    : null;
  const mode = opts.mode ?? (old.mode === "video" ? "video" : "phone");
  const name = conv?.contactName ?? conv?.contactPhone ?? "Lead";
  const booked = await bookAppointment({
    customerId: opts.customerId,
    leadId: old.leadId,
    conversationId: old.conversationId,
    start: opts.start,
    durationMin: oldDuration,
    mode,
    summary: eventSummary(mode, name, lead?.source ?? null),
    description: buildEventDescription({
      name,
      phone: conv?.contactPhone ?? "",
      email: conv?.contactEmail ?? null,
      product: lead?.source ?? null,
      mode,
      summary: conv?.qualificationSummary ?? null,
      conversationId: old.conversationId ?? "",
      bookedVia: opts.by === "lead" ? "booking_page" : "bot",
    }),
    attendeeEmail: conv?.contactEmail ?? null,
    leadName: conv?.contactName ?? null,
    leadPhone: conv?.contactPhone ?? null,
    notifyLead: opts.silent ? false : "rescheduled",
  });
  // Alte Zeit still absagen — der Lead bekommt nur die „verschoben"-Mail.
  await cancelAppointment(old.id, opts.customerId, opts.by, false);
  return booked;
}

export type ResponseCheckResult = {
  checked: number;
  cancelledByLead: number;
  cancelledByAdvisor: number;
  gone: number;
  errors: string[];
};

/**
 * Antworten auf Kalendereinladungen auswerten (Cron): Lehnt der Lead oder
 * der Berater ab bzw. wurde der Termin im Kalender gelöscht, wird er im CRM
 * abgesagt (Rest-Teilnehmer erhalten eine Absage) und der Lead landet in der
 * Rückrufliste.
 */
export async function checkAppointmentResponses(): Promise<ResponseCheckResult> {
  const result: ResponseCheckResult = {
    checked: 0,
    cancelledByLead: 0,
    cancelledByAdvisor: 0,
    gone: 0,
    errors: [],
  };
  const now = Date.now();
  const appts = await prisma.appointment.findMany({
    where: {
      status: "booked",
      calendarEventId: { not: null },
      startsAt: { gt: new Date(now), lt: new Date(now + 60 * 24 * 60 * 60 * 1000) },
    },
    select: {
      id: true,
      customerId: true,
      conversationId: true,
      calendarEventId: true,
      advisorEventId: true,
      calendarKey: true,
    },
    orderBy: { startsAt: "asc" },
    take: 150,
  });

  for (const a of appts) {
    try {
      const key = a.calendarKey ?? a.customerId;
      const conn = await loadConnection(key).catch(() => null);
      if (!conn) continue;
      const fetchResponses = (eventId: string) =>
        conn.provider === "microsoft"
          ? microsoftGetResponses(key, eventId)
          : googleGetResponses(key, eventId);
      // Lead-Einladung; Berater-Antwort aus seiner eigenen Einladung (Altfälle:
      // gemeinsame Einladung).
      const r = await fetchResponses(a.calendarEventId!);
      const adv = a.advisorEventId ? await fetchResponses(a.advisorEventId) : r;
      result.checked++;

      const log = async (payload: unknown) => {
        if (!a.conversationId) return;
        await prisma.message.create({
          data: {
            conversationId: a.conversationId,
            direction: "internal",
            kind: "appointment_declined",
            body: JSON.stringify(payload),
            sentBy: "system",
          },
        });
      };

      if (r.gone) {
        // Im Kalender gelöscht (z. B. von Hand) → im CRM nachziehen.
        await prisma.appointment.update({
          where: { id: a.id },
          data: { status: "cancelled", cancelledAt: new Date(), cancelledBy: "team" },
        });
        await log({ by: "calendar", info: "Termin im Kalender gelöscht" });
        result.gone++;
        continue;
      }

      const conv = a.conversationId
        ? await prisma.conversation.findUnique({
            where: { id: a.conversationId },
            select: { contactEmail: true },
          })
        : null;
      const agent = await prisma.agentConfig.findUnique({
        where: { customerId: a.customerId },
        select: { advisorEmail: true },
      });
      const leadEmail = conv?.contactEmail?.toLowerCase();
      // Termin im eigenen Kalender eines Beraters: keine Berater-Einladung.
      const advisorEmail = a.calendarKey ? undefined : agent?.advisorEmail?.toLowerCase();

      if (leadEmail && r.responses.get(leadEmail) === "declined") {
        await cancelAppointment(a.id, a.customerId, "lead");
        await log({ by: "lead", info: "Lead hat die Einladung abgelehnt" });
        result.cancelledByLead++;
      } else if (
        advisorEmail &&
        (adv.responses.get(advisorEmail) === "declined" || (a.advisorEventId && adv.gone))
      ) {
        await cancelAppointment(a.id, a.customerId, "advisor");
        await log({ by: "advisor", info: "Berater hat die Einladung abgelehnt" });
        result.cancelledByAdvisor++;
      }
    } catch (err) {
      result.errors.push(`${a.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}
