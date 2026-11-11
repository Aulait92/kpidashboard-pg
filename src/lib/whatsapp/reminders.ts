// Termin-Nachrichten per WhatsApp: Erinnerung ~24 h vorher und Bestätigung
// direkt nach einer Buchung über die Buchungsseite. Beide laufen über
// sendWhatsAppNotice (Freitext im 24h-Fenster, sonst freigegebene Vorlage).

import { sendLeadEmail } from "@/lib/calendar/lead-email";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/whatsapp/event-text";
import { firstNameOf, sendWhatsAppNotice } from "@/lib/whatsapp/templates";

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

function linkOrHint(mode: string, meetUrl: string | null): string {
  return mode === "video" && meetUrl ? meetUrl : "Wir rufen dich an.";
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
  /** Link zum Absagen/Verschieben (Self-Service). */
  manageUrl?: string | null;
}): Promise<void> {
  const manage = opts.manageUrl ? ` Absagen oder verschieben: ${opts.manageUrl}` : "";
  const params = [
    firstNameOf(opts.name),
    formatWhenDE(opts.startsAt),
    modeLabel(opts.mode),
    `${linkOrHint(opts.mode, opts.meetUrl)}${manage}`,
  ];
  const text =
    `Hallo ${params[0]}, dein Termin ist bestätigt: ${params[1]} (${params[2]}). ` +
    (opts.mode === "video" && opts.meetUrl
      ? `Hier der Link zum Videocall: ${opts.meetUrl}`
      : "Wir rufen dich zur vereinbarten Zeit an.") +
    (opts.manageUrl ? `\n\nFalls etwas dazwischenkommt: ${opts.manageUrl}` : "") +
    " Bis dann! 🙂";
  await sendWhatsAppNotice({
    customerId: opts.customerId,
    to: opts.to,
    purpose: "booking_confirmation",
    params,
    text,
    leadId: opts.leadId ?? null,
    contactName: opts.name,
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
  const change = opts.manageUrl ? `Passt dir die Zeit nicht? Hier wählst du eine andere: ${opts.manageUrl}` : "";
  const params = [
    firstNameOf(opts.name),
    formatWhenDE(opts.startsAt),
    modeLabel(opts.mode),
    [linkOrHint(opts.mode, opts.meetUrl), change].filter(Boolean).join(" "),
  ];
  const text =
    `Hallo ${params[0]}, wir mussten deinen Termin leider verschieben. Neue Zeit: ${params[1]} (${params[2]}).` +
    (opts.manageUrl ? `\n\nPasst dir die Zeit nicht? Hier wählst du ganz einfach eine andere: ${opts.manageUrl}` : "") +
    "\n\nDanke für dein Verständnis! 🙂";
  await sendWhatsAppNotice({
    customerId: opts.customerId,
    to: opts.to,
    // Außerhalb des 24h-Fensters: freigegebene Bestätigungs-Vorlage mit neuer Zeit.
    purpose: "booking_confirmation",
    params,
    text,
    leadId: opts.leadId ?? null,
    contactName: opts.name,
  });
}

export type ReminderResult ={ candidates: number; sent: number; errors: string[] };

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

    const manageUrl = appt.manageToken ? `${appUrl() ?? ""}/book/manage/${appt.manageToken}` : null;
    const params = [
      firstNameOf(conv.contactName),
      formatWhenDE(appt.startsAt),
      modeLabel(appt.mode),
      `${linkOrHint(appt.mode, appt.meetUrl)}${manageUrl ? ` Absagen oder verschieben: ${manageUrl}` : ""}`,
    ];
    const text =
      `Kurze Erinnerung an unseren ${params[2]} am ${params[1]}.` +
      (appt.mode === "video" && appt.meetUrl
        ? ` Hier der Link: ${appt.meetUrl}`
        : " Wir rufen dich an.") +
      (manageUrl ? `\n\nPasst es doch nicht? ${manageUrl}` : "") +
      " Bis dann! 🙂";
    // WhatsApp + E-Mail; als erledigt gilt die Erinnerung, sobald EIN Kanal
    // zugestellt hat (sonst nächster Cron-Lauf erneut — ohne Doppel-Mails).
    let delivered = false;
    try {
      await sendWhatsAppNotice({
        customerId: appt.customerId,
        to: conv.contactPhone,
        purpose: "reminder",
        params,
        text,
        leadId: appt.leadId,
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
