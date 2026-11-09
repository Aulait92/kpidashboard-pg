// E-Mails an den Lead (Bestätigung, Verschiebung, Absage, Erinnerung) —
// über Resend statt über ein Outlook-Postfach, damit der Endkunde NUR den
// Berater sieht und pro Kunde nichts eingerichtet werden muss:
//   Von:        „{Berater-Name}" <BOOKING_EMAIL_FROM>   (neutrale Domain)
//   Antwort an: Berater-Adresse (AgentConfig.advisorEmail)
//   Anhang:     Kalenderdatei (ICS) + Buttons „Zum Kalender" / „Verschieben"
// Ohne BOOKING_EMAIL_FROM oder RESEND_API_KEY wird bewusst NICHT gesendet
// (kein Fallback auf die Agentur-Domain).

import { Resend } from "resend";
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

function content(kind: LeadEmailKind, ev: CustomerEvent, firstName: string) {
  const w = when(ev.start);
  const art = ev.mode === "video" ? "Videoberatung" : "telefonische Beratung";
  const hi = firstName ? `Hallo ${firstName},` : "Hallo,";
  const how =
    ev.mode === "video"
      ? ev.videoUrl
        ? `Hier der Link zum Videocall: ${ev.videoUrl}`
        : "Den Link zum Videocall bekommst du rechtzeitig vor dem Termin."
      : `${ev.advisorName} ruft dich zur vereinbarten Zeit an.`;
  switch (kind) {
    case "booked":
      return {
        subject: `Dein Termin mit ${ev.advisorName}: ${w}`,
        lines: [hi, `vielen Dank! Deine ${art} ist gebucht: ${w}.`, how],
        calendar: true,
      };
    case "rescheduled":
      return {
        subject: `Neuer Termin mit ${ev.advisorName}: ${w}`,
        lines: [hi, `dein Termin wurde verschoben. Neue Zeit: ${w}.`, how],
        calendar: true,
      };
    case "reminder":
      return {
        subject: `Erinnerung: Dein Termin mit ${ev.advisorName}, ${w}`,
        lines: [hi, `kurze Erinnerung an deine ${art}: ${w}.`, how],
        calendar: true,
      };
    case "cancelled":
      return {
        subject: `Abgesagt: Dein Termin mit ${ev.advisorName} am ${w}`,
        lines: [
          hi,
          `dein Termin am ${w} wurde abgesagt.`,
          "Wenn du einen neuen Termin möchtest, antworte einfach auf diese E-Mail oder melde dich per WhatsApp.",
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
      customer: { select: { agentConfig: { select: { advisorEmail: true } } } },
    },
  });
  if (!appt?.conversationId) return { sent: false, reason: "no_conversation" };
  const conv = await prisma.conversation.findUnique({
    where: { id: appt.conversationId },
    select: { contactEmail: true, contactName: true },
  });
  const to = conv?.contactEmail?.trim();
  if (!to) return { sent: false, reason: "no_email" };
  const ev = await customerEventById(appointmentId);
  if (!ev) return { sent: false, reason: "not_found" };

  const firstName = (conv?.contactName ?? "").trim().split(/\s+/)[0] ?? "";
  const c = content(kind, ev, firstName);
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

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: `"${displayName}" <${fromAddress}>`,
    to,
    replyTo: appt.customer.agentConfig?.advisorEmail ?? undefined,
    subject: c.subject,
    html,
    text,
    ...(c.calendar
      ? {
          attachments: [
            {
              filename: "termin.ics",
              content: Buffer.from(buildIcs(ev), "utf8"),
              contentType: "text/calendar; charset=utf-8",
            },
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
