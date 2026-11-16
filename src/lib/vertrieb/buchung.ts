// Eigene Buchungsseite für Vertriebstermine (Ole, 16.11.2026): ersetzt später Calendly, läuft parallel.
//
// Architektur: Der interne Mandant „performancegrowth Vertrieb“ (VERTRIEB_CUSTOMER_ID, Plan internal)
// hält nur den Kalender: CalendarConnection (dieselbe Google/Outlook-Anbindung wie bei Kunden),
// Zeiten je Wochentag (CalendarLeadTimes) und Abwesenheiten. Freie Zeiten und der Doppelbuchungs-Check
// kommen aus der Kalender-Engine (suggestSlots, findFreeCalendar). Gebucht wird aber nicht als
// Appointment/Lead (Endkunden-Logik der Vermittler), sondern wie bei Calendly als SalesMeeting am
// Vertriebskontakt: Zuordnung über findOrCreateContact (E-Mail, Telefon, Vor- und Nachname),
// Aufgabe „Termin“, Verlauf, Stufe „Termin“, WhatsApp-Bestätigung (termin-whatsapp.ts),
// „Wie lief der Termin?“ (termin-review.ts).
//
// Später: weitere Termintypen (SalesBookingType, ?art=<slug>) und weitere Admins (calendarKeys mit
// mehreren Kalendern, findFreeCalendar nimmt den ersten freien = Round-Robin nach Reihenfolge).

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { adapterFor, findFreeCalendar, SlotBusyError, suggestSlots, type Slot } from "@/lib/calendar";
import { berlinAt, loadLeadTimes, timesForDay } from "@/lib/calendar/lead-times";
import { berlinYmd, weekdayOfYmd } from "@/lib/absence";
import { getAppUrl, sendCustomerMail } from "@/lib/email";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import { EMAIL_RE, normalizePhone } from "@/lib/whatsapp/phone";
import { findOrCreateContact, type Invitee } from "@/lib/vertrieb/calendly";
import { Matcher } from "@/lib/vertrieb/linkedin";
import { fmtDateTime } from "@/lib/vertrieb/dates";
import type { SalesBookingType } from "@/generated/prisma/client";

/** Interner Mandant, an dem der Vertriebskalender hängt (Migration 20261118705300). */
export const VERTRIEB_CUSTOMER_ID = "cust_pg_vertrieb";
export const DEFAULT_BOOKING_TYPE = "meta-leads-call";
export const DECISION_BOOKING_TYPE = "entscheidung";

/** Vorbereitungsvideo auf der Danke-Seite (zum Tauschen: Datei oder Adresse hier ändern). */
export const PREPARATION_VIDEO_URL = process.env.SALES_PREPARATION_VIDEO_URL?.trim() || "/praesentation/vertrieb/assistent.mp4";
/** „Demo ansehen“ auf der Danke-Seite: jetzt die Präsentations-Demo, später die Software-Demo. */
export const DEMO_URL = process.env.SALES_DEMO_URL?.trim() || "/demo";

/** Sichtbare Adresse der Buchungsseite (Lovable-Webseite bettet /termin ein). */
export function publicSalesBookingUrl(): string {
  return (process.env.PUBLIC_SALES_BOOKING_URL ?? "").trim() || "https://performancegrowth.de/termin";
}

/** App-Adresse für Links mit Token (Termin verwalten). Lokal ohne APP_URL: Produktionsadresse. */
export function salesAppUrl(path: string): string {
  let base = "https://app.performancegrowth.de";
  try {
    base = getAppUrl();
  } catch {
    /* Rückfall */
  }
  return `${base.replace(/\/$/, "")}${path}`;
}

export const manageLink = (token: string) => salesAppUrl(`/termin/verwalten/${token}`);
export const thanksLink = (token: string) => salesAppUrl(`/termin/danke/${token}`);

/** Pfad der Buchungsseite eines Termintyps in der App (Standardtyp: /termin). */
export const bookingPath = (slug: string) => (slug === DEFAULT_BOOKING_TYPE ? "/termin" : `/termin/${slug}`);

// ─── Persönlicher Link für bekannte Kontakte (signiert, ohne Daten in der URL) ───
const secret = () => process.env.AUTH_SECRET ?? "dev-secret";
const contactSig = (v: string) => createHmac("sha256", secret()).update(`termin-kontakt:${v}`).digest("base64url").slice(0, 22);
const LINK_DAYS = 90;

/** Token „<Kontakt-ID>.<Ablauf in Tagen seit 1970, base36>.<Signatur>“, 90 Tage gültig. */
export function signContactToken(contactId: string, now = new Date()): string {
  const exp = (Math.floor(now.getTime() / 86_400_000) + LINK_DAYS).toString(36);
  return `${contactId}.${exp}.${contactSig(`${contactId}.${exp}`)}`;
}

/** Kontakt-ID aus einem gültigen, nicht abgelaufenen Token, sonst null. */
export function verifyContactToken(token: string | null | undefined, now = new Date()): string | null {
  const m = /^([A-Za-z0-9_-]{1,64})\.([0-9a-z]{1,8})\.([A-Za-z0-9_-]{22})$/.exec(String(token ?? ""));
  if (!m) return null;
  const expected = Buffer.from(contactSig(`${m[1]}.${m[2]}`));
  const given = Buffer.from(m[3]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (parseInt(m[2], 36) < Math.floor(now.getTime() / 86_400_000)) return null;
  return m[1];
}

/** Persönlicher Buchungslink (z. B. Entscheidungs-Call aus Angebot und Vertriebskontakt). */
export const personalBookingLink = (slug: string, contactId: string) => salesAppUrl(`${bookingPath(slug)}?k=${signContactToken(contactId)}`);

/** iframe-Code für die Lovable-Seite performancegrowth.de/termin (Höhe per postMessage). */
export function embedSnippet(): string {
  const src = salesAppUrl("/termin?einbetten=1");
  const origin = new URL(src).origin;
  return `<iframe id="pg-termin" src="${src}" title="Termin buchen" style="width:100%;border:0;min-height:640px" loading="lazy"></iframe>
<script>
  window.addEventListener("message", function (e) {
    if (e.origin !== "${origin}" || !e.data) return;
    var f = document.getElementById("pg-termin");
    if (e.data.type === "pg-termin-hoehe") f.style.height = e.data.hoehe + "px";
    if (e.data.type === "pg-termin-gebucht") f.scrollIntoView({ behavior: "smooth", block: "start" });
  });
</script>`;
}

export const TERMIN_CONSENT_TEXT =
  "Ich bin einverstanden, dass performancegrowth meine Angaben speichert, um den Termin mit mir durchzuführen und mich dazu per E-Mail, Telefon oder WhatsApp zu kontaktieren. Die Einwilligung kann ich jederzeit widerrufen.";

export const ROLLEN = [
  { key: "vertreter", label: "Vertreter" },
  { key: "makler", label: "Makler" },
] as const;
export type Rolle = (typeof ROLLEN)[number]["key"];

/** Wählbare Puffer und Vorläufe in der Einstellung (Minuten). */
export const BUFFER_CHOICES = [0, 10, 15, 30] as const;
export const NOTICE_CHOICES = [60, 120, 240, 720, 1440, 2880] as const;
export const DURATION_CHOICES = [30, 45, 60] as const;

const TZ = "Europe/Berlin";
const MIN = 60_000;

export async function loadBookingType(slug?: string | null): Promise<SalesBookingType | null> {
  const s = slug?.trim() || DEFAULT_BOOKING_TYPE;
  return prisma.salesBookingType.findUnique({ where: { slug: s } });
}

/** Kalender des Termintyps (ohne Eintrag: Vertriebskalender). */
export const typeKeys = (t: Pick<SalesBookingType, "calendarKeys">): string[] => (t.calendarKeys.length ? t.calendarKeys : [VERTRIEB_CUSTOMER_ID]);

/** Ist mindestens ein Kalender des Termintyps verbunden? */
export async function bookingReady(t: SalesBookingType): Promise<boolean> {
  if (!t.active) return false;
  const conn = await prisma.calendarConnection.findUnique({ where: { customerId: typeKeys(t)[0] }, select: { status: true } });
  return conn?.status === "connected";
}

/** Gebuchte eigene Termine im Zeitraum (mit Puffer) als belegt, falls der Kalender sie noch nicht zeigt. */
async function ownBusy(keys: string[], from: Date, to: Date, excludeId?: string) {
  return prisma.salesMeeting.findMany({
    where: { status: "GEPLANT", calendarKey: { in: keys }, startAt: { lt: to }, endAt: { gt: from }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { startAt: true, endAt: true },
  });
}

/** Freie Zeiten des Termintyps (Berliner Zeit, Puffer und Vorlauf berücksichtigt). */
export async function availableSlots(t: SalesBookingType): Promise<Slot[]> {
  const keys = typeKeys(t);
  const slots = await suggestSlots(VERTRIEB_CUSTOMER_ID, t.durationMin, 400, "lead", t.horizonDays, null, null, {
    keys,
    bufferMin: t.bufferMin,
    noticeMin: t.noticeMin,
  });
  if (!slots.length) return slots;
  const buf = t.bufferMin * MIN;
  const own = await ownBusy(keys, new Date(slots[0].start), new Date(new Date(slots[slots.length - 1].end).getTime() + buf));
  return slots.filter((s) => {
    const a = new Date(s.start).getTime() - buf;
    const b = new Date(s.end).getTime() + buf;
    return !own.some((m) => m.startAt.getTime() < b && (m.endAt?.getTime() ?? m.startAt.getTime()) > a);
  });
}

/** Passt der Startzeitpunkt zu den Zeiten je Wochentag, zum Vorlauf und zum Buchungszeitraum? */
export async function isBookableStart(t: SalesBookingType, start: Date, now = new Date()): Promise<boolean> {
  if (Number.isNaN(start.getTime())) return false;
  if (start.getTime() < now.getTime() + Math.max(60, t.noticeMin) * MIN) return false;
  if (start.getTime() > now.getTime() + (t.horizonDays + 1) * 24 * 60 * MIN) return false;
  const ymd = berlinYmd(start);
  const hhmm = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(start);
  if (berlinAt(ymd, hhmm).getTime() !== start.getTime()) return false;
  const lt = await loadLeadTimes(typeKeys(t)[0]);
  return timesForDay({ ...lt, durationMin: t.durationMin }, weekdayOfYmd(ymd)).includes(hhmm);
}

// ─── Eingaben ───────────────────────────────────────────────────────────

export type BookingInput = {
  name: string;
  email: string;
  /** Ziffern international ohne „+“ (normalizePhone) */
  phone: string;
  company: string;
  role: Rolle;
  interest: string;
  message: string | null;
};

export type InputError = "name" | "email" | "phone" | "company" | "role" | "interest" | "consent";

export function parseBookingInput(fd: FormData): { ok: true; input: BookingInput } | { ok: false; error: InputError } {
  const str = (k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max);
  const name = str("name", 80);
  const email = str("email", 120).toLowerCase();
  const phone = normalizePhone(str("phone", 40));
  const company = str("company", 120);
  const role = str("role", 20);
  const interest = str("interest", 80);
  const message = str("message", 1000) || null;
  if (name.length < 2) return { ok: false, error: "name" };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "email" };
  if (!phone) return { ok: false, error: "phone" };
  if (!company) return { ok: false, error: "company" };
  if (!ROLLEN.some((r) => r.key === role)) return { ok: false, error: "role" };
  if (!interest) return { ok: false, error: "interest" };
  if (fd.get("consent") !== "on") return { ok: false, error: "consent" };
  return { ok: true, input: { name, email, phone, company, role: role as Rolle, interest, message } };
}

const roleLabel = (r: Rolle) => ROLLEN.find((x) => x.key === r)?.label ?? r;

function answersOf(i: BookingInput): string {
  return [
    `Agentur/Firma: ${i.company}`,
    `Telefon: +${i.phone}`,
    `Vertreter oder Makler: ${roleLabel(i.role)}`,
    `Interesse: ${i.interest}`,
    i.message ? `Nachricht: ${i.message}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Buchen ─────────────────────────────────────────────────────────────

export type BookResult =
  | { ok: true; meetingId: string; manageToken: string; startAt: Date; joinUrl: string | null; duplicate?: boolean }
  | { ok: false; error: "unavailable" | "slot" | "taken" | "error" };

type Created = { meetingId: string; manageToken: string; joinUrl: string | null; calendarKey: string };

/**
 * Slot sperren (DB-Lock je Kalender, eigene Termine prüfen), Kalendertermin anlegen, SalesMeeting speichern.
 * Zwei gleichzeitige Buchungen derselben Zeit: die zweite bekommt „taken“.
 */
async function reserveAndCreate(opts: {
  type: SalesBookingType;
  contactId: string;
  start: Date;
  input: BookingInput;
  consentAt: Date | null;
  rescheduledFromId?: string | null;
}): Promise<Created> {
  const { type: t, start } = opts;
  const end = new Date(start.getTime() + t.durationMin * MIN);
  const keys = typeKeys(t);
  // 1) Kalender: erster freier (mit Puffer), wirft SlotBusyError
  const { key, adapter } = await findFreeCalendar(VERTRIEB_CUSTOMER_ID, keys, start, end, { bufferMin: t.bufferMin });
  const buf = t.bufferMin * MIN;
  const manageToken = randomBytes(18).toString("base64url");
  // 2) Eigene Termine unter Sperre prüfen und den Termin sofort belegen
  const meetingId = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sales-booking:${key}`}))`;
    const clash = await tx.salesMeeting.findFirst({
      where: {
        status: "GEPLANT",
        calendarKey: key,
        startAt: { lt: new Date(end.getTime() + buf) },
        endAt: { gt: new Date(start.getTime() - buf) },
        ...(opts.rescheduledFromId ? { id: { not: opts.rescheduledFromId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new SlotBusyError();
    const m = await tx.salesMeeting.create({
      data: {
        contactId: opts.contactId,
        title: t.title,
        startAt: start,
        endAt: end,
        location: t.mode === "video" ? "Videocall" : "Telefon",
        status: "GEPLANT",
        answers: answersOf(opts.input),
        utmSource: "buchungsseite",
        inviteeName: opts.input.name,
        inviteeEmail: opts.input.email,
        inviteePhone: `+${opts.input.phone}`,
        bookingTypeId: t.id,
        manageToken,
        calendarKey: key,
        consentAt: opts.consentAt,
        consentText: opts.consentAt ? TERMIN_CONSENT_TEXT : null,
        rescheduledFromId: opts.rescheduledFromId ?? null,
      },
      select: { id: true },
    });
    return m.id;
  });
  // 3) Kalendertermin mit Einladung an den Interessenten (Meet/Teams-Link entsteht dort)
  try {
    const event = await adapter.createEvent({
      start,
      end,
      summary: `${t.title}: ${opts.input.name} (${opts.input.company})`,
      description: [
        `${t.title} über die Buchungsseite`,
        answersOf(opts.input),
        `E-Mail: ${opts.input.email}`,
        `Kontakt im CRM: ${salesAppUrl(`/admin/vertrieb/kontakte/${opts.contactId}`)}`,
        `Verschieben oder absagen: ${manageLink(manageToken)}`,
        t.mode === "video" && t.videoUrl ? `Videocall: ${t.videoUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      attendeeEmails: [opts.input.email],
      video: t.mode === "video",
      location: t.mode === "phone" ? `Telefon: +${opts.input.phone}` : null,
    });
    const joinUrl = t.mode === "video" ? event.videoUrl ?? t.videoUrl ?? null : null;
    await prisma.salesMeeting.update({ where: { id: meetingId }, data: { calendarEventId: event.eventId, joinUrl } });
    return { meetingId, manageToken, joinUrl, calendarKey: key };
  } catch (err) {
    await prisma.salesMeeting.delete({ where: { id: meetingId } }).catch(() => {});
    throw err;
  }
}

/** Termin-Aufgabe, Verlauf, Stufe „Termin“ (wie recordBooking in calendly.ts). */
async function recordCrm(contactId: string, meetingId: string, t: SalesBookingType, startAt: Date, joinUrl: string | null, note: string, outcome: string) {
  const task = await prisma.salesTask.create({
    data: { contactId, title: `Termin: ${t.title}`, type: "TERMIN", dueAt: startAt, note: [joinUrl ? `Link: ${joinUrl}` : null, note].filter(Boolean).join("\n") || null },
  });
  await prisma.salesMeeting.update({ where: { id: meetingId }, data: { taskId: task.id } });
  await prisma.salesActivity.create({ data: { contactId, type: "TERMIN", outcome, note } });
  const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: contactId }, select: { stage: true } });
  if (c.stage !== "GEWONNEN" && c.stage !== "TERMIN") {
    await prisma.salesContact.update({ where: { id: contactId }, data: { stage: "TERMIN", lossReason: null } });
  }
  await import("@/lib/vertrieb/followup").then((m) => m.stopFollowup(contactId, "Termin gebucht")).catch(() => {});
}

const when = (d: Date) =>
  `${new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d)} Uhr`;
const timeOf = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
const whenShort = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);

async function pushOle(title: string, body: string, contactId: string, tag: string) {
  await sendToAdmins({ title, body, url: `/admin/vertrieb/kontakte/${contactId}`, tag }).catch((e) => reportError(e, "vertrieb-buchung-push"));
}

/** Öffentliche Buchung: Kontakt zuordnen bzw. anlegen, Termin anlegen, CRM, Push, E-Mail, WhatsApp. */
export async function bookSalesMeeting(opts: {
  type: SalesBookingType;
  start: Date;
  input: BookingInput;
  /** Bekannter Kontakt aus einem geprüften persönlichen Link (verifyContactToken): keine Zuordnung, keine Dublette */
  knownContactId?: string | null;
  now?: Date;
}): Promise<BookResult> {
  const { type: t, input } = opts;
  const now = opts.now ?? new Date();
  if (!(await bookingReady(t))) return { ok: false, error: "unavailable" };
  if (!(await isBookableStart(t, opts.start, now))) return { ok: false, error: "slot" };

  const invitee: Invitee = {
    uri: `buchungsseite:${randomBytes(6).toString("hex")}`,
    email: input.email,
    name: input.name,
    text_reminder_number: `+${input.phone}`,
    questions_and_answers: [
      { question: "Agentur/Firma", answer: input.company },
      { question: "Telefon", answer: `+${input.phone}` },
    ],
  };
  const known = opts.knownContactId
    ? await prisma.salesContact.findUnique({ where: { id: opts.knownContactId }, select: { id: true } })
    : null;
  const { id: contactId, created } = known ? { id: known.id, created: false } : await findOrCreateContact(invitee, await Matcher.load());

  // Pro Kontakt ein offener Termin dieses Typs: bestehenden zeigen statt doppelt buchen
  const open = await prisma.salesMeeting.findFirst({
    where: { contactId, bookingTypeId: t.id, status: "GEPLANT", startAt: { gt: now }, manageToken: { not: null } },
    select: { id: true, manageToken: true, startAt: true, joinUrl: true },
  });
  if (open) return { ok: true, meetingId: open.id, manageToken: open.manageToken!, startAt: open.startAt, joinUrl: open.joinUrl, duplicate: true };

  let res: Created;
  try {
    res = await reserveAndCreate({ type: t, contactId, start: opts.start, input, consentAt: now });
  } catch (err) {
    if (err instanceof SlotBusyError) return { ok: false, error: "taken" };
    reportError(err, "vertrieb-buchung");
    return { ok: false, error: "error" };
  }

  // Kontakt ergänzen (nichts überschreiben)
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { phone: true, insurer: true, firstName: true, lastName: true } });
  const [first, ...rest] = input.name.split(/\s+/);
  await prisma.salesContact
    .update({
      where: { id: contactId },
      data: {
        ...(!c?.phone ? { phone: `+${input.phone}` } : {}),
        ...(!c?.insurer && input.role === "makler" ? { insurer: "Makler" } : {}),
        ...(!c?.firstName && first ? { firstName: first } : {}),
        ...(!c?.lastName && rest.length ? { lastName: rest.join(" ") } : {}),
        ...(created ? { description: "Über die eigene Buchungsseite (/termin) angelegt", customerSource: "INBOUND" } : {}),
      },
    })
    .catch(() => {});

  const note = [created ? "Neuer Kontakt aus der Buchungsseite" : null, `Gebucht von ${input.name} (${input.email})`, answersOf(input)].filter(Boolean).join("\n");
  await recordCrm(contactId, res.meetingId, t, opts.start, res.joinUrl, note, `Termin über die Buchungsseite gebucht: ${t.title} am ${fmtDateTime(opts.start)}`).catch((e) =>
    reportError(e, "vertrieb-buchung-crm"),
  );
  await pushOle(`📅 Neue ${t.title}: ${input.name}`, `${whenShort(opts.start)} Uhr · ${input.company}`, contactId, `sales-booking:${res.meetingId}`);
  await sendInviteeMail(res.meetingId, "booked");
  const { sendTerminConfirmation } = await import("@/lib/vertrieb/termin-whatsapp");
  await sendTerminConfirmation(
    res.meetingId,
    { text_reminder_number: `+${input.phone}`, name: input.name, reschedule_url: manageLink(res.manageToken) },
    res.joinUrl ? { type: "video", join_url: res.joinUrl } : { type: t.mode === "video" ? "video" : "outbound_call" },
  );
  return { ok: true, meetingId: res.meetingId, manageToken: res.manageToken, startAt: opts.start, joinUrl: res.joinUrl };
}

// ─── Verwalten: verschieben, absagen ────────────────────────────────────

export async function meetingByToken(token: string) {
  if (!token || token.length < 16) return null;
  return prisma.salesMeeting.findUnique({
    where: { manageToken: token },
    include: { bookingType: true, contact: { select: { id: true, name: true } } },
  });
}

export const isOpenMeeting = (m: { status: string; startAt: Date }, now = new Date()) => m.status === "GEPLANT" && m.startAt.getTime() > now.getTime();

async function deleteCalendarEvent(m: { calendarKey: string | null; calendarEventId: string | null }) {
  if (!m.calendarKey || !m.calendarEventId) return;
  try {
    await (await adapterFor(m.calendarKey)).deleteEvent(m.calendarEventId);
  } catch (err) {
    reportError(err, "vertrieb-buchung-kalender-loeschen");
  }
}

export type ChangeResult = { ok: true; token: string } | { ok: false; error: "not_found" | "closed" | "slot" | "taken" | "error" };

/** Absagen per Link (oder vom Team). Termin im Kalender löschen, CRM nachziehen, Mail und Push. */
export async function cancelSalesMeeting(token: string, opts: { reason?: string | null; by?: "invitee" | "team" } = {}): Promise<ChangeResult> {
  const m = await meetingByToken(token);
  if (!m) return { ok: false, error: "not_found" };
  if (!isOpenMeeting(m)) return { ok: false, error: "closed" };
  const reason = opts.reason?.trim().slice(0, 500) || null;
  const n = await prisma.salesMeeting.updateMany({
    where: { id: m.id, status: "GEPLANT" },
    data: { status: "ABGESAGT", cancelReason: reason, canceledBy: opts.by ?? "invitee" },
  });
  if (!n.count) return { ok: false, error: "closed" };
  await deleteCalendarEvent(m);
  if (m.taskId) await prisma.salesTask.deleteMany({ where: { id: m.taskId, doneAt: null } });
  await prisma.salesActivity.create({
    data: { contactId: m.contactId, type: "TERMIN", outcome: `Termin abgesagt: ${m.title} am ${fmtDateTime(m.startAt)}`, note: reason ? `Grund: ${reason}` : null },
  });
  await prisma.salesTask.create({
    data: { contactId: m.contactId, title: "Neuen Termin vereinbaren (Absage über die Buchungsseite)", type: "ANRUF", dueAt: new Date(), note: reason ? `Grund der Absage: ${reason}` : null },
  });
  await pushOle(`❌ ${m.title} abgesagt: ${m.inviteeName ?? m.contact.name}`, `${whenShort(m.startAt)} Uhr${reason ? ` · ${reason.slice(0, 80)}` : ""}`, m.contactId, `sales-booking-cancel:${m.id}`);
  await sendInviteeMail(m.id, "cancelled");
  return { ok: true, token };
}

/** Verschieben per Link: zuerst neuen Termin anlegen (Slot-Prüfung), dann den alten absagen. */
export async function rescheduleSalesMeeting(token: string, start: Date, now = new Date()): Promise<ChangeResult> {
  const m = await meetingByToken(token);
  if (!m) return { ok: false, error: "not_found" };
  if (!isOpenMeeting(m, now)) return { ok: false, error: "closed" };
  const t = m.bookingType ?? (await loadBookingType(null));
  if (!t || !(await bookingReady(t))) return { ok: false, error: "error" };
  if (!(await isBookableStart(t, start, now))) return { ok: false, error: "slot" };
  const input = inputFromMeeting(m);
  let res: Created;
  try {
    res = await reserveAndCreate({ type: t, contactId: m.contactId, start, input, consentAt: m.consentAt, rescheduledFromId: m.id });
  } catch (err) {
    if (err instanceof SlotBusyError) return { ok: false, error: "taken" };
    reportError(err, "vertrieb-buchung-verschieben");
    return { ok: false, error: "error" };
  }
  await prisma.salesMeeting.update({ where: { id: m.id }, data: { status: "VERSCHOBEN", canceledBy: "invitee" } });
  await deleteCalendarEvent(m);
  if (m.taskId) await prisma.salesTask.deleteMany({ where: { id: m.taskId, doneAt: null } });
  await recordCrm(m.contactId, res.meetingId, t, start, res.joinUrl, m.answers ?? "", `Termin verschoben: ${t.title} auf ${fmtDateTime(start)} (war ${fmtDateTime(m.startAt)})`).catch((e) =>
    reportError(e, "vertrieb-buchung-crm"),
  );
  await pushOle(`🔁 ${t.title} verschoben: ${input.name}`, `Neu: ${whenShort(start)} Uhr (war ${whenShort(m.startAt)})`, m.contactId, `sales-booking:${res.meetingId}`);
  await sendInviteeMail(res.meetingId, "rescheduled");
  return { ok: true, token: res.manageToken };
}

function inputFromMeeting(m: { inviteeName: string | null; inviteeEmail: string | null; inviteePhone: string | null; answers: string | null; contact: { name: string } }): BookingInput {
  const get = (label: string) => m.answers?.split("\n").find((l) => l.startsWith(`${label}: `))?.slice(label.length + 2) ?? "";
  const role = get("Vertreter oder Makler").toLowerCase() === "makler" ? "makler" : "vertreter";
  return {
    name: m.inviteeName ?? m.contact.name,
    email: m.inviteeEmail ?? "",
    phone: (m.inviteePhone ?? "").replace(/^\+/, ""),
    company: get("Agentur/Firma") || m.contact.name,
    role,
    interest: get("Interesse"),
    message: get("Nachricht") || null,
  };
}

// ─── E-Mails an den Interessenten ───────────────────────────────────────

export type InviteeMailKind = "booked" | "rescheduled" | "cancelled" | "reminder" | "soon";

type MailMeeting = {
  title: string;
  startAt: Date;
  joinUrl: string | null;
  inviteeName: string | null;
  manageToken: string;
  confirmText?: string | null;
  thanksPage?: boolean;
};

/** Inhalt der Mail (rein, für Tests). Sie-Form, keine Gedankenstriche. */
export function inviteeMailContent(kind: InviteeMailKind, m: MailMeeting) {
  const w = when(m.startAt);
  const greeting = m.inviteeName ? `Guten Tag ${m.inviteeName},` : "Guten Tag,";
  const how = m.joinUrl ? `Den Videocall starten Sie über diesen Link: ${m.joinUrl}` : "Die Einladung mit allen Details finden Sie in Ihrem Kalender.";
  const manage = { label: "Termin verschieben oder absagen", url: manageLink(m.manageToken) };
  switch (kind) {
    case "booked":
      return {
        subject: `Ihr Termin mit performancegrowth: ${w}`,
        greeting,
        paragraphs: [`vielen Dank für Ihre Buchung. Ihr ${m.title} ist bestätigt: ${w}.`, how, m.confirmText ?? "Wir freuen uns auf das Gespräch."],
        button: m.thanksPage ? { label: "Vorbereitungsvideo ansehen", url: thanksLink(m.manageToken) } : manage,
        extra: m.thanksPage ? manage : null,
      };
    case "rescheduled":
      return { subject: `Neuer Termin mit performancegrowth: ${w}`, greeting, paragraphs: [`Ihr Termin wurde verschoben. Neue Zeit: ${w}.`, how], button: manage, extra: null };
    case "reminder":
      return { subject: `Erinnerung: Ihr ${m.title} am ${w}`, greeting, paragraphs: [`kurze Erinnerung an Ihren ${m.title}: ${w}.`, how], button: manage, extra: null };
    case "soon":
      return {
        subject: `Gleich geht es los: Ihr Termin um ${timeOf(m.startAt)} Uhr`,
        greeting,
        paragraphs: [`in einer Stunde beginnt Ihr ${m.title}: ${w}.`, how, "Falls etwas dazwischenkommt, verschieben Sie den Termin bitte über den Link unten."],
        button: manage,
        extra: null,
      };
    case "cancelled":
      return {
        subject: `Abgesagt: Ihr Termin am ${w}`,
        greeting,
        paragraphs: [`Ihr ${m.title} am ${w} ist abgesagt.`, "Wenn Sie einen neuen Termin möchten, wählen Sie einfach eine neue Zeit."],
        button: { label: "Neuen Termin wählen", url: publicSalesBookingUrl() },
        extra: null,
      };
  }
}

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Mail senden; Fehler werden gemeldet, nie geworfen. */
export async function sendInviteeMail(meetingId: string, kind: InviteeMailKind): Promise<boolean> {
  try {
    const m = await prisma.salesMeeting.findUnique({
      where: { id: meetingId },
      select: { title: true, startAt: true, joinUrl: true, inviteeName: true, inviteeEmail: true, manageToken: true, bookingType: { select: { confirmText: true, thanksPage: true } } },
    });
    if (!m?.inviteeEmail || !m.manageToken) return false;
    const c = inviteeMailContent(kind, { ...m, manageToken: m.manageToken, confirmText: m.bookingType?.confirmText, thanksPage: m.bookingType?.thanksPage });
    const res = await sendCustomerMail({
      to: m.inviteeEmail,
      subject: c.subject,
      greeting: c.greeting,
      paragraphs: c.paragraphs,
      button: c.button,
      ...(c.extra
        ? {
            html: `<p style="margin:0 0 16px;font-size:15px;line-height:1.6"><a href="${c.extra.url}" style="color:#2563eb">${escapeHtml(c.extra.label)}</a></p>`,
            textBlocks: [`${c.extra.label}: ${c.extra.url}`],
          }
        : {}),
      signature: "Ole Kannapinn\nperformancegrowth",
    });
    if (!res.ok) console.warn(`[vertrieb-buchung mail] ${kind} ${meetingId}: ${res.error}`);
    return res.ok;
  } catch (err) {
    reportError(err, "vertrieb-buchung-mail", { meeting: meetingId, kind });
    return false;
  }
}

// ─── Danke-Seite: Vorbereitung vermerken (nur mit Buchungs-Token) ───────

/** „Video angesehen“ (ab 50 %) bzw. „Demo geöffnet“ einmal je Termin im Verlauf des Kontakts vermerken. */
export async function recordPreparation(token: string, what: "video" | "demo", now = new Date()): Promise<boolean> {
  const m = await meetingByToken(token);
  if (!m) return false;
  const field = what === "video" ? "videoWatchedAt" : "demoOpenedAt";
  const n = await prisma.salesMeeting.updateMany({ where: { id: m.id, [field]: null }, data: { [field]: now } });
  if (!n.count) return false;
  await prisma.salesActivity.create({
    data: {
      contactId: m.contactId,
      type: "NOTIZ",
      outcome: what === "video" ? "Vorbereitungsvideo angesehen" : "Demo geöffnet",
      note: `Vor dem ${m.title} am ${fmtDateTime(m.startAt)} (Danke-Seite der Buchung)`,
    },
  });
  return true;
}

// ─── Erinnerungen (WhatsApp-Cron) ───────────────────────────────────────

const HOUR = 60 * MIN;

/**
 * Erinnerung per E-Mail 24 Stunden und 1 Stunde vor Terminen der eigenen Buchungsseite
 * (Calendly-Termine erinnert Calendly selbst). Kurzfristig Gebuchtes bekommt keine Erinnerung,
 * die direkt auf die Bestätigung folgen würde.
 */
export async function runSalesBookingReminders(now = new Date()): Promise<{ day: number; soon: number }> {
  let day = 0;
  let soon = 0;
  const base = { status: "GEPLANT", manageToken: { not: null }, bookingTypeId: { not: null } } as const;
  const dayDue = await prisma.salesMeeting.findMany({
    where: { ...base, reminderSentAt: null, startAt: { gt: new Date(now.getTime() + 2 * HOUR), lte: new Date(now.getTime() + 24 * HOUR) } },
    select: { id: true, startAt: true, createdAt: true },
    take: 100,
  });
  for (const m of dayDue) {
    const claimed = await prisma.salesMeeting.updateMany({ where: { id: m.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (!claimed.count) continue;
    // Erst vor kurzem (innerhalb von 26 Stunden vor Beginn) gebucht: Bestätigung reicht
    if (m.startAt.getTime() - m.createdAt.getTime() <= 26 * HOUR) continue;
    if (await sendInviteeMail(m.id, "reminder")) day++;
  }
  const soonDue = await prisma.salesMeeting.findMany({
    where: { ...base, soonReminderSentAt: null, startAt: { gt: new Date(now.getTime() + 10 * MIN), lte: new Date(now.getTime() + HOUR) } },
    select: { id: true, startAt: true, createdAt: true },
    take: 100,
  });
  for (const m of soonDue) {
    const claimed = await prisma.salesMeeting.updateMany({ where: { id: m.id, soonReminderSentAt: null }, data: { soonReminderSentAt: now } });
    if (!claimed.count) continue;
    if (m.startAt.getTime() - m.createdAt.getTime() < 3 * HOUR) continue;
    if (await sendInviteeMail(m.id, "soon")) soon++;
  }
  return { day, soon };
}
