// App-Kalender (Ole, 20.11.2026): Buchen ohne Google/Microsoft. Für Vermittler, deren Firmenkalender gesperrt ist
// (Allianz: Microsoft 365 und Kalenderfreigabe gesperrt), die aber freie Zeiten aus dem Allianz-Online-Kalender
// oder einem Kalender-Link (ICS) liefern. Die App führt die Termine selbst (Appointment-Zeilen = belegt) und schickt
// dem Vermittler zu jedem Termin eine Kalendereinladung (iCalendar, METHOD:REQUEST) per Mail, z. B. an die
// Allianz-Adresse; Outlook übernimmt sie mit einem Klick. Absagen und Verschieben gehen als Absage bzw.
// Aktualisierung derselben UID hinterher.
// Technisch eine CalendarConnection mit provider „app“ und status „connected“: Damit gelten alle Stellen, die
// einen verbundenen Kalender voraussetzen (Assistent, Buchungsseite, Einrichtung), ohne Sonderwege.

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { userIdOfKey, type Busy, type CreatedEvent, type NewEvent } from "@/lib/calendar/tokens";

export const APP_PROVIDER = "app";
const ID_PREFIX = "app:";

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsEscape = (v: string) => v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, "utf8") > 75) {
      out.push(cur);
      cur = ` ${ch}`;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n");
}

/** Absenderadresse als Organisator der Einladung (Outlook zeigt „Annehmen“ nur mit Organisator). */
export function organizerEmail(env: Record<string, string | undefined> = process.env): string {
  const raw = env.BOOKING_EMAIL_FROM ?? env.OFFER_EMAIL_FROM ?? "";
  const m = raw.match(/<([^>]+)>/) ?? raw.match(/([^\s<>]+@[^\s<>]+)/);
  return (m?.[1] ?? "termin@performancegrowth.de").trim();
}

export type EinladungIcs = {
  uid: string;
  method: "REQUEST" | "CANCEL";
  sequence: number;
  start: Date;
  end: Date;
  summary: string;
  description: string;
  location: string | null;
  organizer: string;
  attendees: string[];
};

/** iCalendar-Einladung (rein, getestet). */
export function einladungIcs(e: EinladungIcs): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Terminbuchung//DE",
    "CALSCALE:GREGORIAN",
    `METHOD:${e.method}`,
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `SEQUENCE:${e.sequence}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(e.start)}`,
    `DTEND:${icsDate(e.end)}`,
    `SUMMARY:${icsEscape(e.summary)}`,
    `DESCRIPTION:${icsEscape(e.description)}`,
    ...(e.location ? [`LOCATION:${icsEscape(e.location)}`] : []),
    `ORGANIZER;CN=Terminbuchung:mailto:${e.organizer}`,
    ...e.attendees.map((a) => `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${a}`),
    `STATUS:${e.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    ...(e.method === "REQUEST" ? ["BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", "DESCRIPTION:Termin", "END:VALARM"] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Steigende SEQUENCE ohne gespeicherten Zähler (Sekunden seit 2026). */
const seqNow = () => Math.max(1, Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 1000));

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);

/**
 * Einladungsadresse eines Beraters mit eigenem App-Kalender (Schlüssel user:<id>, 21.11.2026): die hinterlegte Adresse
 * (AdvisorCalendar.accountEmail, z. B. Allianz-Mail), sonst seine Login-Adresse.
 */
export async function beraterEinladungsAdresse(userId: string): Promise<string | null> {
  const [cal, user] = await Promise.all([
    prisma.advisorCalendar.findUnique({ where: { userId }, select: { accountEmail: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
  ]);
  return (cal?.accountEmail?.trim() || user?.email?.trim() || "").toLowerCase() || null;
}

/**
 * Adressen für die Einladung: Berater-Kalender (user:<id>) immer an dessen Adresse; Agentur-Kalender an die übergebene
 * (Berater-Adresse der Agentur), sonst an die Logins des Kunden.
 */
async function empfaenger(key: string, attendees: string[]): Promise<string[]> {
  const userId = userIdOfKey(key);
  if (userId) {
    const a = await beraterEinladungsAdresse(userId);
    return a ? [a] : [];
  }
  const customerId = key;
  const own = attendees.map((a) => a.trim().toLowerCase()).filter(Boolean);
  if (own.length) return [...new Set(own)];
  const users = await prisma.user.findMany({ where: { customerId, role: "BUYER" }, select: { email: true }, orderBy: { createdAt: "asc" }, take: 3 });
  return [...new Set(users.map((u) => u.email?.trim().toLowerCase()).filter((e): e is string => !!e))].slice(0, 1);
}

async function sendeEinladung(customerId: string, e: Omit<EinladungIcs, "organizer" | "attendees">, attendees: string[]): Promise<void> {
  const to = await empfaenger(customerId, attendees);
  if (!to.length) {
    console.warn(`[app-kalender] ${customerId}: keine Adresse für die Einladung`);
    return;
  }
  const ics = einladungIcs({ ...e, organizer: organizerEmail(), attendees: to });
  const absage = e.method === "CANCEL";
  const { sendCustomerMail } = await import("@/lib/email");
  const res = await sendCustomerMail({
    to,
    subject: `${absage ? "Abgesagt" : "Termin"}: ${e.summary}, ${fmt(e.start)} Uhr`,
    greeting: "Guten Tag,",
    paragraphs: absage
      ? [`dieser Termin ist abgesagt: ${fmt(e.start)} Uhr. Mit „Aus Kalender entfernen“ ist er aus Ihrem Kalender raus.`]
      : [`neuer Termin am ${fmt(e.start)} Uhr. Mit „Annehmen“ steht er in Ihrem Kalender.`, ...(e.description ? [e.description] : [])],
    attachments: [{ filename: "termin.ics", content: Buffer.from(ics, "utf8"), contentType: `text/calendar; charset=utf-8; method=${e.method}` }],
    replyTo: null,
  });
  if (!res.ok) console.warn(`[app-kalender] Einladung nicht gesendet (${customerId}): ${res.error}`);
}

/**
 * Welche Termine belegen diesen App-Kalender? (rein, getestet)
 * - Agentur (customerId): nur Termine im Agentur-Kalender (calendarKey leer). Termine in eigenen Kalendern der Berater
 *   (calendarKey user:<id>) belegen die Agentur nicht; früher zählten sie mit (Ole, 21.11.2026).
 * - Berater (user:<id>): seine Termine (calendarKey = Schlüssel) und Termine im Agentur-Kalender für seine Leads
 *   (z. B. gebucht, bevor er seinen Kalender eingerichtet hatte, oder von Hand eingetragen). Lieber einmal zu viel belegt
 *   als doppelt gebucht.
 */
export function appBusyFilter(key: string): Prisma.AppointmentWhereInput {
  const userId = userIdOfKey(key);
  if (userId) return { OR: [{ calendarKey: key }, { calendarKey: null, lead: { assignedUserId: userId } }] };
  return { customerId: key, calendarKey: null };
}

/** Belegt = gebuchte Termine der App (ohne abgesagte) für diesen Kalender-Schlüssel. */
export async function appBusy(key: string, min: Date, max: Date): Promise<Busy[]> {
  const rows = await prisma.appointment.findMany({
    // Ende kann fehlen (Altfälle): dann 30 Min.; Termine bis 4 Std. vor min reichen hinein
    where: { ...appBusyFilter(key), status: { not: "cancelled" }, startsAt: { lt: max, gt: new Date(min.getTime() - 4 * 3600_000) } },
    select: { startsAt: true, endsAt: true },
  });
  return rows
    .map((r) => ({ start: r.startsAt, end: r.endsAt ?? new Date(r.startsAt.getTime() + 30 * 60_000) }))
    .filter((b) => b.end > min);
}

export async function appCreateEvent(customerId: string, ev: NewEvent): Promise<CreatedEvent> {
  const uid = `${randomBytes(12).toString("hex")}@terminbuchung`;
  await sendeEinladung(
    customerId,
    { uid, method: "REQUEST", sequence: 0, start: ev.start, end: ev.end, summary: ev.summary, description: ev.description, location: ev.location ?? null },
    ev.attendeeEmails,
  ).catch((err) => console.warn("[app-kalender]", err instanceof Error ? err.message : err));
  // Kein eigener Video-Link: Videotermine nutzen den festen Raum (agentConfig.videoRoomUrl)
  return { eventId: `${ID_PREFIX}${uid}`, videoUrl: null };
}

async function terminZu(eventId: string) {
  return prisma.appointment.findFirst({
    where: { OR: [{ calendarEventId: eventId }, { advisorEventId: eventId }] },
    select: { customerId: true, calendarKey: true, startsAt: true, endsAt: true, meetUrl: true, mode: true, ort: true, leadId: true, conversationId: true, bookedVia: true },
  });
}

type TerminZeile = NonNullable<Awaited<ReturnType<typeof terminZu>>>;

/**
 * Titel und Beschreibung wie bei der Buchung (lib/whatsapp/event-text.ts). Eine Aktualisierung (gleiche UID) ersetzt
 * den Eintrag in Outlook ganz; ohne das stand nach Verschieben oder neuer Dauer nur noch „Beratungstermin“ ohne Namen
 * (Ole, 21.11.2026, Allianz-Kalender).
 */
export async function eintragText(t: Omit<TerminZeile, "calendarKey"> | null): Promise<{ summary: string; description: string }> {
  if (!t) return { summary: "Beratungstermin", description: "" };
  const [lead, conv] = await Promise.all([
    t.leadId ? prisma.lead.findUnique({ where: { id: t.leadId }, select: { name: true, phone: true, email: true, source: true } }) : null,
    t.conversationId
      ? prisma.conversation.findUnique({ where: { id: t.conversationId }, select: { contactName: true, contactPhone: true, contactEmail: true, qualificationSummary: true } })
      : null,
  ]);
  const name = lead?.name?.trim() || conv?.contactName?.trim() || "";
  if (!name) return { summary: "Beratungstermin", description: "" };
  const mode = t.mode === "video" || t.mode === "onsite" ? t.mode : "phone";
  const phone = lead?.phone ?? conv?.contactPhone ?? "";
  const bookedVia = t.bookedVia === "bot" || t.bookedVia === "advisor" || t.bookedVia === "mail_strecke" ? t.bookedVia : "booking_page";
  const { eventSummary, buildEventDescription } = await import("@/lib/whatsapp/event-text");
  return {
    summary: eventSummary(mode, name, lead?.source ?? null),
    description: buildEventDescription({
      name,
      phone,
      email: conv?.contactEmail ?? lead?.email ?? null,
      product: lead?.source ?? null,
      mode,
      summary: conv?.qualificationSummary ?? null,
      conversationId: t.conversationId,
      bookedVia,
    }),
  };
}

async function beraterAdresse(customerId: string): Promise<string[]> {
  // Berater-Kalender: empfaenger() nimmt dessen eigene Adresse
  if (userIdOfKey(customerId)) return [];
  const a = await prisma.agentConfig.findUnique({ where: { customerId }, select: { advisorEmail: true } });
  return a?.advisorEmail?.trim() ? [a.advisorEmail.trim()] : [];
}

const uidOf = (eventId: string) => eventId.slice(ID_PREFIX.length);

async function aktualisieren(customerId: string, eventId: string, method: "REQUEST" | "CANCEL", start?: Date, end?: Date): Promise<void> {
  if (!eventId.startsWith(ID_PREFIX)) return;
  const t = await terminZu(eventId);
  const s = start ?? t?.startsAt;
  const e = end ?? t?.endsAt ?? (s ? new Date(s.getTime() + 30 * 60_000) : undefined);
  if (!s || !e) return;
  const location = t?.mode === "video" ? t.meetUrl : t?.mode === "onsite" ? t.ort : null;
  const text = await eintragText(t);
  // Kalender des Termins: eigener Kalender eines Beraters (calendarKey) bzw. Agentur
  const key = t?.calendarKey ?? t?.customerId ?? customerId;
  await sendeEinladung(
    key,
    { uid: uidOf(eventId), method, sequence: seqNow(), start: s, end: e, ...text, location: location ?? null },
    await beraterAdresse(key),
  ).catch((err) => console.warn("[app-kalender]", err instanceof Error ? err.message : err));
}

export const appDeleteEvent = (customerId: string, eventId: string) => aktualisieren(customerId, eventId, "CANCEL");
export const appUpdateEventTime = (customerId: string, eventId: string, start: Date, end: Date) => aktualisieren(customerId, eventId, "REQUEST", start, end);
export const appUpdateEventEnd = async (customerId: string, eventId: string, end: Date) => {
  const t = await terminZu(eventId);
  if (t) await aktualisieren(customerId, eventId, "REQUEST", t.startsAt, end);
};

/**
 * App-Kalender einschalten, wenn noch kein Buchungskalender verbunden ist (nach Allianz-Online-Kalender bzw. ICS).
 * Ein verbundener Google-/Microsoft-Kalender bleibt unangetastet; der Buchungslink (Slug) bleibt erhalten.
 */
export async function appKalenderEinschalten(customerId: string): Promise<boolean> {
  const conn = await prisma.calendarConnection.findUnique({ where: { customerId }, select: { status: true } });
  if (conn?.status === "connected") return false;
  const data = { provider: APP_PROVIDER, status: "connected", accessTokenEnc: null, refreshTokenEnc: null, tokenExpiresAt: null, accountEmail: null, scope: null, calendarId: "primary" };
  await prisma.calendarConnection.upsert({ where: { customerId }, create: { customerId, ...data }, update: data });
  return true;
}

/** Ohne Quelle für belegte Zeiten (Allianz/ICS getrennt) den App-Kalender wieder ausschalten. */
export async function appKalenderPruefen(customerId: string): Promise<void> {
  const [conn, agent] = await Promise.all([
    prisma.calendarConnection.findUnique({ where: { customerId }, select: { provider: true, status: true } }),
    prisma.agentConfig.findUnique({ where: { customerId }, select: { availabilityIcsUrlEnc: true, allianzCalendarEnc: true } }),
  ]);
  if (conn?.provider !== APP_PROVIDER || conn.status !== "connected") return;
  if (agent?.availabilityIcsUrlEnc || agent?.allianzCalendarEnc) return;
  await prisma.calendarConnection.update({ where: { customerId }, data: { status: "pending" } });
}
