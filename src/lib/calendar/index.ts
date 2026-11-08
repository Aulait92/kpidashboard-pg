// Anbieter-neutraler Kalender-Kern: freie Slots (Berliner Zeit), Buchung mit
// Doppelbuchungs-Schutz, Buchungs-Slug. Die eigentliche API spricht je
// Verbindung der passende Adapter (Google oder Microsoft/Outlook).

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  googleCreateEvent,
  googleDeleteEvent,
  googleGetBusy,
  googleHasRequiredScopes,
} from "@/lib/calendar/google";
import { fetchIcsBusy } from "@/lib/calendar/ics";
import {
  microsoftCreateEvent,
  microsoftDeleteEvent,
  microsoftGetBusy,
} from "@/lib/calendar/microsoft";
import { decryptSecret } from "@/lib/encryption";
import { loadConnection, type Busy, type CreatedEvent, type NewEvent } from "@/lib/calendar/tokens";

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

async function adapterFor(customerId: string) {
  const conn = await loadConnection(customerId);
  const agent = await prisma.agentConfig.findUnique({
    where: { customerId },
    select: { availabilityIcsUrlEnc: true },
  });
  const icsUrl = agent?.availabilityIcsUrlEnc ? decryptSecret(agent.availabilityIcsUrlEnc) : null;

  const native =
    conn.provider === "microsoft"
      ? {
          getBusy: (min: Date, max: Date) => microsoftGetBusy(customerId, min, max),
          createEvent: (ev: NewEvent) => microsoftCreateEvent(customerId, ev),
        }
      : {
          getBusy: (min: Date, max: Date) => googleGetBusy(customerId, min, max),
          createEvent: (ev: NewEvent) => googleCreateEvent(customerId, ev),
        };

  return {
    // Belegt = Buchungskalender UND (falls hinterlegt) veröffentlichter
    // Firmenkalender. Fällt eine Quelle aus, wird geworfen — nie still „frei".
    getBusy: async (min: Date, max: Date): Promise<Busy[]> => {
      const [own, external] = await Promise.all([
        native.getBusy(min, max),
        icsUrl ? fetchIcsBusy(icsUrl, min, max) : Promise.resolve([] as Busy[]),
      ]);
      return [...own, ...external];
    },
    createEvent: (ev: NewEvent): Promise<CreatedEvent> => native.createEvent(ev),
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

/** UTC-Zeitpunkt für eine Berliner Wanduhrzeit (berücksichtigt Sommer-/Winterzeit). */
function berlinTime(y: number, m: number, day: number, hour: number): Date {
  const guess = Date.UTC(y, m - 1, day, hour);
  const wall = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(new Date(guess));
  const g = (t: string) => Number(wall.find((x) => x.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  return new Date(guess - (asUtc - guess));
}

const overlaps = (busy: Busy[], start: Date, end: Date) =>
  busy.some((b) => b.start < end && b.end > start);

/** Freie Slots der nächsten Werktage (Standard 10/14/16 Uhr Berliner Zeit). */
export async function suggestSlots(
  customerId: string,
  durationMin = 30,
  count = 3,
  hours: number[] = [10, 14, 16],
  days = 10,
): Promise<Slot[]> {
  const adapter = await adapterFor(customerId);
  const now = new Date();
  const timeMin = new Date(now.getTime() + 60 * 60 * 1000);
  const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const busy = await adapter.getBusy(timeMin, timeMax);

  const slots: Slot[] = [];
  for (let d = 0; d < days && slots.length < count; d++) {
    const { y, m, day, dow } = berlinParts(new Date(now.getTime() + d * 24 * 60 * 60 * 1000));
    if (dow === 0 || dow === 6) continue;
    for (const h of hours) {
      if (slots.length >= count) break;
      const start = berlinTime(y, m, day, h);
      if (start.getTime() < timeMin.getTime()) continue;
      const end = new Date(start.getTime() + durationMin * 60000);
      if (!overlaps(busy, start, end)) {
        slots.push({ start: start.toISOString(), end: end.toISOString() });
      }
    }
  }
  return slots;
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
}): Promise<{ appointmentId: string; meetUrl: string | null; start: string }> {
  const adapter = await adapterFor(opts.customerId);
  const start = new Date(opts.start);
  const end = new Date(start.getTime() + (opts.durationMin ?? 30) * 60000);
  if (start.getTime() < Date.now()) throw new Error("Startzeit liegt in der Vergangenheit.");
  // Unmittelbar vor dem Anlegen erneut prüfen — der Slot kann seit dem
  // Vorschlag belegt worden sein (oder der Bot nennt eine eigene Zeit).
  if (overlaps(await adapter.getBusy(start, end), start, end)) throw new SlotBusyError();

  // Fester Video-Link des Kunden (z. B. Webex-Raum) hat Vorrang vor
  // Meet/Teams — viele Firmen (Allianz: Webex) nutzen eigene Tools.
  const agent = await prisma.agentConfig.findUnique({
    where: { customerId: opts.customerId },
    select: { videoRoomUrl: true, advisorEmail: true },
  });
  const room = opts.mode === "video" ? agent?.videoRoomUrl?.trim() || null : null;

  const created = await adapter.createEvent({
    start,
    end,
    summary: opts.summary,
    description: room
      ? `${opts.description ?? ""}\n\nVideocall: ${room}`.trim()
      : (opts.description ?? ""),
    // Lead + Berater (z. B. Allianz-Adresse → Termin landet in seinem Outlook).
    attendeeEmails: [
      ...new Set(
        [opts.attendeeEmail, agent?.advisorEmail]
          .map((e) => e?.trim().toLowerCase())
          .filter((e): e is string => !!e),
      ),
    ],
    video: opts.mode === "video" && !room,
    location: room,
  });
  if (room) created.videoUrl = room;

  const appt = await prisma.appointment.create({
    data: {
      customerId: opts.customerId,
      leadId: opts.leadId ?? null,
      conversationId: opts.conversationId ?? null,
      mode: opts.mode,
      startsAt: start,
      endsAt: end,
      calendarEventId: created.eventId,
      meetUrl: created.videoUrl,
      status: "booked",
    },
  });
  return { appointmentId: appt.id, meetUrl: created.videoUrl, start: start.toISOString() };
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
): Promise<{ calendarDeleted: boolean; note?: string }> {
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, customerId },
    select: { id: true, calendarEventId: true, status: true },
  });
  if (!appt) throw new Error("Termin nicht gefunden.");
  let calendarDeleted = false;
  let note: string | undefined;
  if (appt.calendarEventId) {
    try {
      const conn = await loadConnection(customerId);
      if (conn.provider === "microsoft") {
        await microsoftDeleteEvent(customerId, appt.calendarEventId);
      } else {
        await googleDeleteEvent(customerId, appt.calendarEventId);
      }
      calendarDeleted = true;
    } catch (err) {
      note = err instanceof Error ? err.message : String(err);
    }
  }
  await prisma.appointment.update({
    where: { id: appt.id },
    data: { status: "cancelled" },
  });
  return { calendarDeleted, note };
}
