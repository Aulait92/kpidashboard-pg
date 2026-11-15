// E-Mails an den Lead (Bestätigung, Verschiebung, Absage, Erinnerung) —
// über Resend statt über ein Outlook-Postfach, damit der Endkunde NUR den
// Berater sieht und pro Kunde nichts eingerichtet werden muss:
//   Von:        „{Berater-Name}" <BOOKING_EMAIL_FROM>   (neutrale Domain)
//   Antwort an: Berater-Adresse (AgentConfig.advisorEmail)
//   Anhang:     Kalenderdatei (ICS) + Buttons „Zum Kalender" / „Verschieben"
// Ohne BOOKING_EMAIL_FROM oder RESEND_API_KEY wird bewusst NICHT gesendet
// (kein Fallback auf die Agentur-Domain).

import { a, anredeZeile, asAnsprache, type Ansprache, type AnredeKontakt } from "@/lib/ansprache";
import { ansprechpartner } from "@/lib/lead-anrede";
import { mailClient } from "@/lib/mail-guard";
import {
  buildIcs,
  customerEventById,
  googleCalendarUrl,
  type CustomerEvent,
} from "@/lib/calendar/add-to-calendar";
import { prisma } from "@/lib/prisma";

export type LeadEmailKind = "booked" | "rescheduled" | "cancelled" | "reminder";

const TZ = "Europe/Berlin";
function when(d: Date): string {
  return `${new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  }).format(d)} Uhr`;
}

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function content(kind: LeadEmailKind, ev: CustomerEvent, kontakt: AnredeKontakt | string, an: Ansprache = "sie") {
  const w = when(ev.start);
  const art = ev.mode === "video" ? "Videoberatung" : "telefonische Beratung";
  // Anrede je Ansprache des Kunden (Ole, 14.11.2026): „Guten Tag Frau Schneider,“ (bzw. voller Name / „Guten Tag,“), Du „Hallo Julia,“
  const hi = anredeZeile(an, typeof kontakt === "string" ? { fullName: kontakt } : kontakt);
  const how =
    ev.mode === "video"
      ? ev.videoUrl
        ? `Hier der Link zum Videocall: ${ev.videoUrl}`
        : a(an, "Den Link zum Videocall bekommst du rechtzeitig vor dem Termin.", "Den Link zum Videocall bekommen Sie rechtzeitig vor dem Termin.")
      : a(an, `${ev.advisorName} ruft dich zur vereinbarten Zeit an.`, `${ev.advisorName} ruft Sie zur vereinbarten Zeit an.`);
  const dein = a(an, "Dein", "Ihr");
  switch (kind) {
    case "booked":
      return {
        subject: `${dein} Termin mit ${ev.advisorName}: ${w}`,
        lines: [hi, `vielen Dank! ${a(an, "Deine", "Ihre")} ${art} ist gebucht: ${w}.`, how],
        calendar: true,
      };
    case "rescheduled":
      return {
        subject: `Neuer Termin mit ${ev.advisorName}: ${w}`,
        lines: [hi, `${a(an, "dein", "Ihr")} Termin wurde verschoben. Neue Zeit: ${w}.`, how],
        calendar: true,
      };
    case "reminder":
      return {
        subject: `Erinnerung: ${dein} Termin mit ${ev.advisorName}, ${w}`,
        lines: [hi, `kurze Erinnerung an ${a(an, "deine", "Ihre")} ${art}: ${w}.`, how],
        calendar: true,
      };
    case "cancelled":
      return {
        subject: `Abgesagt: ${dein} Termin mit ${ev.advisorName} am ${w}`,
        lines: [
          hi,
          `${a(an, "dein", "Ihr")} Termin am ${w} wurde abgesagt.`,
          a(
            an,
            "Wenn du einen neuen Termin möchtest, antworte einfach auf diese E-Mail oder melde dich per WhatsApp.",
            "Wenn Sie einen neuen Termin möchten, antworten Sie einfach auf diese E-Mail oder melden Sie sich per WhatsApp.",
          ),
        ],
        calendar: false,
      };
  }
}

/** Mail an den Lead senden. Gibt zurück, ob gesendet wurde (und warum nicht). */
export async function sendLeadEmail(
  appointmentId: string,
  kind: LeadEmailKind,
): Promise<{ sent: boolean; reason?: string }> {
  const res = await sendLeadEmailInner(appointmentId, kind);
  // Nur Termin-ID + Ergebnis loggen — keine E-Mail-Adresse (DSGVO).
  console.log(
    `[lead email] ${kind} ${appointmentId}: ${res.sent ? "gesendet" : `nicht gesendet (${res.reason})`}`,
  );
  return res;
}

async function sendLeadEmailInner(
  appointmentId: string,
  kind: LeadEmailKind,
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.BOOKING_EMAIL_FROM?.trim();
  if (!apiKey || !fromAddress) return { sent: false, reason: "not_configured" };

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      customerId: true,
      conversationId: true,
      leadId: true,
      customer: { select: { leadAddress: true, agentConfig: { select: { advisorEmail: true } } } },
    },
  });
  if (!appt?.conversationId) return { sent: false, reason: "no_conversation" };
  const conv = await prisma.conversation.findUnique({
    where: { id: appt.conversationId },
    select: { contactEmail: true, contactName: true, contactPhone: true },
  });
  const to = conv?.contactEmail?.trim();
  if (!to) return { sent: false, reason: "no_email" };
  const ev = await customerEventById(appointmentId);
  if (!ev) return { sent: false, reason: "not_found" };

  const who = await ansprechpartner({ customerId: appt.customerId, leadId: appt.leadId, phone: conv?.contactPhone, name: conv?.contactName });
  const an = asAnsprache(appt.customer?.leadAddress);
  const c = content(kind, ev, who.kontakt, an);
  // Erstinformation als PDF-Anhang an der Terminbestätigung (§ 16 VersVermV: dauerhafter Datenträger; bucht der
  // Lead selbst, ist das oft der erste Kontakt). Nur vollständige Erstinformationen (lib/erstinformation.ts).
  const erstinfo = kind === "booked" ? await erstinfoAnhang(appt.customerId) : null;
  if (erstinfo) c.lines.push(erstinfoMailZeile(an, ev.advisorName));
  const displayName = ev.advisorName.replace(/["<>]/g, "");
  const icsUrl = `${new URL(ev.manageUrl).origin}/book/manage/${ev.token}/ics`;

  const btn = (href: string, label: string, primary = false) =>
    `<a href="${esc(href)}" style="display:inline-block;margin:4px 6px 4px 0;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;${
      primary ? "background:#2563eb;color:#ffffff" : "border:1px solid #d6dde8;color:#0b1220"
    }">${esc(label)}</a>`;
  const html = `
<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0b1220;font-size:15px;line-height:1.5">
  ${c.lines.map((l) => `<p style="margin:0 0 14px">${esc(l)}</p>`).join("")}
  ${
    c.calendar
      ? `<p style="margin:18px 0 6px;font-size:13px;color:#6b7a96">Zum Kalender hinzufügen</p>
  ${btn(icsUrl, "iPhone / Outlook", true)}${btn(googleCalendarUrl(ev), "Google Kalender")}
  <p style="margin:18px 0 6px;font-size:13px;color:#6b7a96">Passt es doch nicht?</p>
  ${btn(ev.manageUrl, "Termin verschieben oder absagen")}`
      : ""
  }
  <p style="margin:24px 0 0">Viele Grüße<br>${esc(ev.advisorName)}</p>
</div>`;
  const text = [
    ...c.lines,
    ...(c.calendar
      ? ["", `Zum Kalender hinzufügen: ${icsUrl}`, `Verschieben oder absagen: ${ev.manageUrl}`]
      : []),
    "",
    "Viele Grüße",
    ev.advisorName,
  ].join("\n");

  const resend = mailClient(apiKey);
  const { error } = await resend.emails.send({
    from: `"${displayName}" <${fromAddress}>`,
    to,
    replyTo: appt.customer.agentConfig?.advisorEmail || (await ownerEmail(appt.customerId)),
    subject: c.subject,
    html,
    text,
    ...(c.calendar || erstinfo
      ? {
          attachments: [
            ...(c.calendar
              ? [
                  {
                    filename: "termin.ics",
                    content: Buffer.from(buildIcs(ev), "utf8"),
                    contentType: "text/calendar; charset=utf-8",
                  },
                ]
              : []),
            ...(erstinfo ? [{ filename: erstinfo.fileName, content: Buffer.from(erstinfo.bytes), contentType: "application/pdf" }] : []),
          ],
        }
      : {}),
  });
  if (error) {
    console.error("[lead email]", kind, error);
    return { sent: false, reason: error.message ?? "send_failed" };
  }
  return { sent: true };
}

/** Satz zum Anhang mit der Erstinformation (beide Fassungen, ohne Gedankenstriche). */
export function erstinfoMailZeile(an: Ansprache, advisor: string): string {
  return a(
    an,
    `Im Anhang findest du die Erstinformation zu ${advisor} als Versicherungsvermittler (PDF). Auf Wunsch bekommst du sie auch kostenlos auf Papier.`,
    `Im Anhang finden Sie die Erstinformation zu ${advisor} als Versicherungsvermittler (PDF). Auf Wunsch erhalten Sie sie auch kostenlos auf Papier.`,
  );
}

async function erstinfoAnhang(customerId: string): Promise<{ bytes: Uint8Array; fileName: string } | null> {
  try {
    const { erstinfoBereit, erstinfoDokument } = await import("@/lib/erstinformation");
    if (!(await erstinfoBereit(customerId))) return null;
    return await erstinfoDokument({ customerId });
  } catch (err) {
    console.error("[lead email] Erstinformation", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Antworten des Leads gehen an den Kunden: hinterlegte Berater-Adresse, sonst die Login-Adresse des Inhabers. */
async function ownerEmail(customerId: string): Promise<string | undefined> {
  const u = await prisma.user
    .findFirst({ where: { customerId, role: "BUYER" }, orderBy: { createdAt: "asc" }, select: { email: true } })
    .catch(() => null);
  return u?.email || undefined;
}
