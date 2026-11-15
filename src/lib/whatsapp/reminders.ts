// Termin-Nachrichten per WhatsApp: Erinnerung ~24 h vorher und Bestätigung
// direkt nach einer Buchung über die Buchungsseite. Beide laufen über
// sendWhatsAppNotice (Freitext im 24h-Fenster, sonst freigegebene Vorlage).

import { sendLeadEmail } from "@/lib/calendar/lead-email";
import { prisma } from "@/lib/prisma";
import { firstNameOf, NoTemplateError, sendWhatsAppNotice } from "@/lib/whatsapp/templates";
import { a, anredeZeile, asAnsprache, type Ansprache } from "@/lib/ansprache";
import { ansprechpartner } from "@/lib/lead-anrede";

/** Ansprache des Kunden (Sie/Du) für Texte an Leads. */
export async function anspracheOf(customerId: string): Promise<Ansprache> {
  // Ohne Datenbank (z. B. Unit-Tests) bzw. bei Fehlern: Standard „Sie“
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { leadAddress: true } }).catch(() => null);
  return asAnsprache(c?.leadAddress);
}

const LEAD_MS = 24 * 60 * 60 * 1000;
const TZ = "Europe/Berlin";

export function formatWhenDE(d: Date): string {
  return `${new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(d)} Uhr`;
}

function modeLabel(mode: string): string {
  return mode === "video" ? "Videocall" : "Telefonat";
}

/** „Ihr Telefonat“ / „Ihren Videocall“ (akk = Akkusativ). */
function terminWort(mode: string, an: Ansprache, akk = false): string {
  return mode === "video" ? `${a(an, akk ? "deinen" : "dein", akk ? "Ihren" : "Ihr")} Videocall` : `${a(an, "dein", "Ihr")} Telefonat`;
}

/** Verschieben per Chat (statt Link zur Verwaltungsseite). */
function chatHint(an: Ansprache): string {
  return a(an, "Falls etwas dazwischenkommt, antworte einfach hier, dann finden wir eine neue Zeit.", "Falls etwas dazwischenkommt, antworten Sie einfach hier, dann finden wir eine neue Zeit.");
}

function linkOrHint(mode: string, meetUrl: string | null, an: Ansprache = "du"): string {
  return mode === "video" && meetUrl ? meetUrl : a(an, "Wir rufen dich an.", "Wir rufen Sie an.");
}

/** Kurzer Vorbereitungshinweis in der Bestätigung (wie in der Vorlage v4). */
function prepHint(an: Ansprache): string {
  return a(an, "Zur Vorbereitung: Leg dir gern deine bisherigen Unterlagen zum Thema bereit, falls vorhanden.", "Zur Vorbereitung: Legen Sie sich gern Ihre bisherigen Unterlagen zum Thema bereit, falls vorhanden.");
}

/** Bestätigung nach Buchung (z. B. über die Buchungsseite). */
export async function sendBookingConfirmation(opts: {
  customerId: string;
  to: string;
  name: string | null;
  leadId?: string | null;
  startsAt: Date;
  mode: string;
  meetUrl: string | null;
  /** Link zum Absagen/Verschieben: nur noch für E-Mail/Kalender; per WhatsApp wird im Chat verschoben. */
  manageUrl?: string | null;
}): Promise<void> {
  const an = await anspracheOf(opts.customerId);
  const who = await ansprechpartner({ customerId: opts.customerId, leadId: opts.leadId, phone: opts.to, name: opts.name });
  // Verschieben per Knopf „Termin verschieben“ (v4) bzw. per Chat (ältere Vorlagen: Satz im Parameter)
  const params = [firstNameOf(opts.name), formatWhenDE(opts.startsAt), modeLabel(opts.mode), linkOrHint(opts.mode, opts.meetUrl, an)];
  const legacyParams = [...params.slice(0, 3), `${params[3]} ${chatHint(an)}`];
  // „Guten Tag Frau Schneider, Ihr Videocall mit Susanne Meier ist bestätigt: …“
  const text =
    `${anredeZeile(an, who.kontakt)} ${terminWort(opts.mode, an)} mit ${who.advisor} ist bestätigt: ${params[1]}. ` +
    (opts.mode === "video" && opts.meetUrl
      ? `Hier der Link zum Videocall: ${opts.meetUrl}`
      : a(an, `${who.advisor} ruft dich zur vereinbarten Zeit an.`, `${who.advisor} ruft Sie zur vereinbarten Zeit an.`)) +
    `\n\n${prepHint(an)} Bis dann! 🙂`;
  await sendWhatsAppNotice({
    customerId: opts.customerId,
    to: opts.to,
    purpose: "booking_confirmation",
    params,
    legacyParams,
    text,
    leadId: opts.leadId ?? null,
    contactName: opts.name,
    anrede: who.kontakt,
  });
}

/**
 * Termin wurde vom Berater-Team verschoben (z. B. wegen Abwesenheit): neue
 * Zeit + Link, um selbst eine andere Zeit zu wählen. Ohne Grund.
 */
export async function sendRescheduleNotice(opts: {
  customerId: string;
  to: string;
  name: string | null;
  leadId?: string | null;
  startsAt: Date;
  mode: string;
  meetUrl: string | null;
  manageUrl: string | null;
}): Promise<void> {
  const an = await anspracheOf(opts.customerId);
  const who = await ansprechpartner({ customerId: opts.customerId, leadId: opts.leadId, phone: opts.to, name: opts.name });
  const change = a(an, "Passt dir die Zeit nicht? Antworte einfach hier, dann finden wir eine andere.", "Passt Ihnen die Zeit nicht? Antworten Sie einfach hier, dann finden wir eine andere.");
  // v4: Frage „Passt die neue Zeit?“ mit Knöpfen „Ja, passt“/„Bitte verschieben“; ältere Vorlagen mit Satz im Parameter
  const params = [firstNameOf(opts.name), formatWhenDE(opts.startsAt), modeLabel(opts.mode), linkOrHint(opts.mode, opts.meetUrl, an)];
  const legacyParams = [...params.slice(0, 3), `${params[3]} ${change}`];
  const text =
    `${anredeZeile(an, who.kontakt)} wir mussten ${a(an, "deinen", "Ihren")} Termin mit ${who.advisor} leider verschieben. Neue Zeit: ${params[1]} (${params[2]}).` +
    `\n\n${a(an, "Danke für dein Verständnis! Passt dir die neue Zeit?", "Danke für Ihr Verständnis! Passt Ihnen die neue Zeit?")}`;
  const send = (purpose: "reschedule" | "booking_confirmation") =>
    sendWhatsAppNotice({
      customerId: opts.customerId,
      to: opts.to,
      purpose,
      params,
      legacyParams,
      text,
      // Rückfall Bestätigungs-Vorlage: Knopf „Termin verschieben“ passt auch zum Freitext
      textButtons: purpose === "reschedule" ? undefined : [],
      leadId: opts.leadId ?? null,
      contactName: opts.name,
      anrede: who.kontakt,
    });
  // Außerhalb des 24h-Fensters: Vorlage „Termin verschoben“. Solange sie bei Meta
  // noch nicht freigegeben ist, die Bestätigungs-Vorlage mit der neuen Zeit.
  try {
    await send("reschedule");
  } catch (err) {
    if (!(err instanceof NoTemplateError)) throw err;
    await send("booking_confirmation");
  }
}

export type ReminderResult ={ candidates: number; sent: number; errors: string[] };

/** „Gleich ist es so weit“: etwa so lange vor dem Termin (Ole, 15.11.2026: kurz vorher nachfragen, ob alles passt). */
export const SOON_MS = 60 * 60 * 1000;

/**
 * Kurz vor dem Termin fragen, ob alles passt (lieber verschieben als nicht erscheinen). Nur WhatsApp, einmal je Termin.
 * Nicht, wenn erst kurz vorher gebucht (unter 3 Std.) oder die Erinnerung gerade erst rausging (2-Std.-Fall).
 */
export async function runSoonReminders(now = new Date()): Promise<ReminderResult> {
  const due = await prisma.appointment.findMany({
    where: {
      status: "booked",
      soonReminderSentAt: null,
      customer: { dormantSince: null },
      conversationId: { not: null },
      startsAt: { gt: new Date(now.getTime() + 10 * 60 * 1000), lte: new Date(now.getTime() + SOON_MS) },
    },
    select: { id: true, customerId: true, conversationId: true, leadId: true, mode: true, startsAt: true, createdAt: true, meetUrl: true, manageToken: true, reminderSentAt: true },
    orderBy: { startsAt: "asc" },
    take: 200,
  });
  const result: ReminderResult = { candidates: due.length, sent: 0, errors: [] };
  for (const appt of due) {
    const tooFresh = appt.startsAt.getTime() - appt.createdAt.getTime() < 3 * 60 * 60 * 1000;
    const justReminded = !!appt.reminderSentAt && now.getTime() - appt.reminderSentAt.getTime() < 90 * 60 * 1000;
    if (tooFresh || justReminded) {
      await prisma.appointment.update({ where: { id: appt.id }, data: { soonReminderSentAt: now } });
      continue;
    }
    const conv = await prisma.conversation.findUnique({ where: { id: appt.conversationId! }, select: { contactPhone: true, contactName: true, optedOutAt: true } });
    if (!conv?.contactPhone || conv.optedOutAt) continue;
    const an = await anspracheOf(appt.customerId);
    const who = await ansprechpartner({ customerId: appt.customerId, leadId: appt.leadId, phone: conv.contactPhone, name: conv.contactName });
    const uhr = `${new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(appt.startsAt)} Uhr`;
    const params = [firstNameOf(conv.contactName), uhr, modeLabel(appt.mode), linkOrHint(appt.mode, appt.meetUrl, an)];
    const text =
      `${anredeZeile(an, who.kontakt)} gleich ist es so weit: ${terminWort(appt.mode, an)} mit ${who.advisor} ist um ${uhr}.` +
      (appt.mode === "video" && appt.meetUrl ? ` Hier der Link: ${appt.meetUrl}` : ` ${a(an, `${who.advisor} ruft dich an.`, `${who.advisor} ruft Sie an.`)}`) +
      ` ${a(an, "Passt bei dir alles?", "Passt bei Ihnen alles?")}`;
    // Knöpfe „Ja, passt“/„Bitte verschieben“ (v4); ältere Erinnerungs-Vorlage mit Satz im Parameter
    const remParams = [params[0], formatWhenDE(appt.startsAt), params[2], params[3]];
    const send = (purpose: "reminder_soon" | "reminder") =>
      sendWhatsAppNotice({
        customerId: appt.customerId,
        to: conv.contactPhone,
        purpose,
        params: purpose === "reminder" ? remParams : params,
        ...(purpose === "reminder" ? { legacyParams: [...remParams.slice(0, 3), `${remParams[3]} ${chatHint(an)}`] } : {}),
        text,
        leadId: appt.leadId,
        contactName: conv.contactName,
        anrede: who.kontakt,
      });
    try {
      // Solange „Kurz vor dem Termin“ bei Meta nicht freigegeben ist: die normale Erinnerungs-Vorlage
      try {
        await send("reminder_soon");
      } catch (err) {
        if (!(err instanceof NoTemplateError)) throw err;
        await send("reminder");
      }
      await prisma.appointment.update({ where: { id: appt.id }, data: { soonReminderSentAt: new Date() } });
      result.sent++;
    } catch (err) {
      result.errors.push(`${appt.id} (kurz vorher): ${err instanceof Error ? err.message : String(err)}`);
      // nicht endlos erneut versuchen
      await prisma.appointment.update({ where: { id: appt.id }, data: { soonReminderSentAt: new Date() } });
    }
  }
  return result;
}

/** Kurzfristig gebuchte Termine: Erinnerung erst so kurz vorher. */
const SHORT_LEAD_MS = 2 * 60 * 60 * 1000;

/**
 * Wann ist die Erinnerung fällig? Die Bestätigung kam ja gerade erst —
 * direkt danach noch eine Erinnerung wirkt wie Spam.
 * - Mehr als 26 h im Voraus gebucht → 24 h vorher.
 * - Mehr als 3 h im Voraus gebucht  → 2 h vorher.
 * - Noch kurzfristiger              → keine Erinnerung.
 */
function reminderDue(appt: { startsAt: Date; createdAt: Date }, now: Date): boolean {
  const leadTime = appt.startsAt.getTime() - appt.createdAt.getTime();
  const untilStart = appt.startsAt.getTime() - now.getTime();
  if (leadTime > LEAD_MS + 2 * 60 * 60 * 1000) return untilStart <= LEAD_MS;
  if (leadTime > 3 * 60 * 60 * 1000) return untilStart <= SHORT_LEAD_MS;
  return false;
}

/** Erinnerung für gebuchte Termine, die in den nächsten 24 h starten. */
export async function runReminders(): Promise<ReminderResult> {
  const now = new Date();
  const due = await prisma.appointment.findMany({
    where: {
      status: "booked",
      reminderSentAt: null,
      startsAt: { gt: now, lte: new Date(now.getTime() + LEAD_MS) },
      customer: { dormantSince: null },
    },
    select: {
      id: true,
      customerId: true,
      conversationId: true,
      leadId: true,
      mode: true,
      startsAt: true,
      createdAt: true,
      meetUrl: true,
      manageToken: true,
    },
    orderBy: { startsAt: "asc" },
    take: 200,
  }).then((rows) => rows.filter((a) => reminderDue(a, now)));

  const result: ReminderResult = { candidates: due.length, sent: 0, errors: [] };
  for (const appt of due) {
    if (!appt.conversationId) continue;
    const conv = await prisma.conversation.findUnique({
      where: { id: appt.conversationId },
      select: { contactPhone: true, contactName: true },
    });
    if (!conv?.contactPhone) continue;

    const an = await anspracheOf(appt.customerId);
    const who = await ansprechpartner({ customerId: appt.customerId, leadId: appt.leadId, phone: conv.contactPhone, name: conv.contactName });
    // v4: „Passt der Termin für Sie?“ mit Knöpfen „Ja, passt“/„Bitte verschieben“ (Bestätigung: lib/whatsapp/knopf.ts)
    const params = [firstNameOf(conv.contactName), formatWhenDE(appt.startsAt), modeLabel(appt.mode), linkOrHint(appt.mode, appt.meetUrl, an)];
    const legacyParams = [...params.slice(0, 3), `${params[3]} ${chatHint(an)}`];
    // „Guten Tag Frau Schneider, kurze Erinnerung an Ihren Videocall mit Susanne Meier am …“
    const text =
      `${anredeZeile(an, who.kontakt)} kurze Erinnerung an ${terminWort(appt.mode, an, true)} mit ${who.advisor} am ${params[1]}.` +
      (appt.mode === "video" && appt.meetUrl
        ? ` Hier der Link: ${appt.meetUrl}`
        : ` ${a(an, `${who.advisor} ruft dich an.`, `${who.advisor} ruft Sie an.`)}`) +
      `\n\n${a(an, "Passt der Termin für dich?", "Passt der Termin für Sie?")}`;
    // WhatsApp + E-Mail; als erledigt gilt die Erinnerung, sobald EIN Kanal
    // zugestellt hat (sonst nächster Cron-Lauf erneut — ohne Doppel-Mails).
    let delivered = false;
    try {
      await sendWhatsAppNotice({
        customerId: appt.customerId,
        to: conv.contactPhone,
        purpose: "reminder",
        params,
        legacyParams,
        text,
        leadId: appt.leadId,
        contactName: conv.contactName,
        anrede: who.kontakt,
      });
      delivered = true;
    } catch (err) {
      result.errors.push(`${appt.id} (WhatsApp): ${err instanceof Error ? err.message : String(err)}`);
    }
    const mail = await sendLeadEmail(appt.id, "reminder").catch(() => ({ sent: false }));
    if (mail.sent) delivered = true;
    if (delivered) {
      await prisma.appointment.update({
        where: { id: appt.id },
        data: { reminderSentAt: new Date() },
      });
      result.sent++;
    }
  }
  return result;
}
