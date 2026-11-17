// „Zum Kalender hinzufügen" für den Lead — ohne E-Mail-Einladung von unserem
// Postfach (der Lead soll nur den Berater sehen). Liefert eine ICS-Datei
// (iPhone/Outlook/Mac) und einen Google-Kalender-Link (Android/Gmail) mit
// kundenfreundlichem Text: Berater-Name, Rückrufnummer bzw. Video-Link,
// Link zum Verschieben/Absagen — keine internen Daten.

import { advisorPerson } from "@/lib/advisor-name";
import { anredeZeile, asAnsprache } from "@/lib/ansprache";
import { kontaktFromLead } from "@/lib/lead-anrede";
import { prisma } from "@/lib/prisma";
import { manageUrlFor } from "@/lib/public-url";
import {
  customerEventDescription,
  customerEventSummary,
} from "@/lib/whatsapp/event-text";

export type CustomerEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description: string;
  location: string;
  manageUrl: string;
  /** Verwaltungs-Token (für ICS-Link). */
  token: string;
  advisorName: string;
  mode: "phone" | "video";
  videoUrl: string | null;
};

/** Kundenansicht eines Termins über den geheimen Verwaltungs-Token. */
export async function customerEventByToken(token: string): Promise<CustomerEvent | null> {
  return loadCustomerEvent({ manageToken: token }, false);
}

/** Kundenansicht per Termin-ID (auch abgesagte — für die Absage-Mail). */
export async function customerEventById(appointmentId: string): Promise<CustomerEvent | null> {
  return loadCustomerEvent({ id: appointmentId }, true);
}

async function loadCustomerEvent(
  where: { manageToken: string } | { id: string },
  allowCancelled: boolean,
): Promise<CustomerEvent | null> {
  const appt = await prisma.appointment.findUnique({
    where,
    select: {
      manageToken: true,
      id: true,
      status: true,
      startsAt: true,
      endsAt: true,
      mode: true,
      meetUrl: true,
      conversationId: true,
      customer: { select: { name: true, leadAddress: true } },
      lead: { select: { name: true, formData: true, contactOverrides: true, assignedUser: { select: { displayName: true } } } },
    },
  });
  if (!appt || (!allowCancelled && appt.status !== "booked")) return null;
  const token = appt.manageToken ?? "";
  const conv = appt.conversationId
    ? await prisma.conversation.findUnique({
        where: { id: appt.conversationId },
        select: { contactName: true, contactPhone: true },
      })
    : null;
  // Person (Ole, 14.11.2026): Anzeigename des zuständigen Beraters, sonst „Agentur Susanne Meier“ → „Susanne Meier“
  const advisor = advisorPerson(appt.customer.name, appt.lead?.assignedUser?.displayName) || appt.customer.name;
  const mode = appt.mode === "video" ? "video" : "phone";
  const manageUrl = manageUrlFor(token);
  const an = asAnsprache(appt.customer.leadAddress);
  const hi = anredeZeile(an, kontaktFromLead(appt.lead, conv?.contactName ?? null));
  return {
    uid: `${appt.id}@termin`,
    start: appt.startsAt,
    end: appt.endsAt ?? new Date(appt.startsAt.getTime() + 30 * 60000),
    summary: customerEventSummary(mode, advisor),
    description: customerEventDescription({
      hi,
      an,
      mode,
      phone: conv?.contactPhone ?? null,
      videoUrl: appt.meetUrl,
      manageUrl,
      advisorName: advisor,
    }),
    location:
      mode === "video"
        ? (appt.meetUrl ?? "Videocall")
        : `Telefon: ${advisor} ruft ${an === "du" ? "dich" : "Sie"} an`,
    manageUrl,
    token,
    advisorName: advisor,
    mode,
    videoUrl: appt.meetUrl,
  };
}

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function icsEscape(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Zeilen > 75 Oktette nach RFC 5545 falten. */
function fold(line: string): string {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, "utf8") > 75) {
      out.push(cur);
      cur = ` ${ch}`;
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.join("\r\n");
}

export function buildIcs(ev: CustomerEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Terminbuchung//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(ev.start)}`,
    `DTEND:${icsDate(ev.end)}`,
    `SUMMARY:${icsEscape(ev.summary)}`,
    `DESCRIPTION:${icsEscape(ev.description)}`,
    `LOCATION:${icsEscape(ev.location)}`,
    `URL:${ev.manageUrl}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Erinnerung an den Termin",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function googleCalendarUrl(ev: CustomerEvent): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.summary,
    dates: `${icsDate(ev.start)}/${icsDate(ev.end)}`,
    details: ev.description,
    location: ev.location,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
