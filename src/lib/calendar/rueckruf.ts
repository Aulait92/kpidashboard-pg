// Rückruf mit Uhrzeit im Kalender des Beraters (Ole, 17.11.2026: „wird wenn ein Rückruf vereinbart wird, der auch im
// Kalender des Vermittlers eingetragen?“). Gilt nur für Rückrufe, bei denen der Berater eine Uhrzeit gewählt hat
// („Später anrufen“ → Tag und Uhrzeit), nicht für die automatischen Anrufversuche. 15 Minuten, ohne Einladung an
// den Lead. Kalender: der des zuständigen Beraters, sonst der des Kontos (wie Buchungen, lib/calendar bookingKeys).
// Neuer Rückruf, verschoben oder erledigt: der alte Eintrag wird gelöscht. Wirft nie.

import { prisma } from "@/lib/prisma";
import { reportError } from "@/lib/monitoring";
import { formatPhone } from "@/lib/format";

const DAUER_MS = 15 * 60 * 1000;

/** Bisherigen Rückruf-Eintrag löschen (falls vorhanden). */
export async function rueckrufAusKalender(leadId: string): Promise<void> {
  try {
    const l = await prisma.lead.findUnique({ where: { id: leadId }, select: { rueckrufEventId: true, rueckrufEventKey: true } });
    if (!l?.rueckrufEventId || !l.rueckrufEventKey) return;
    await prisma.lead.update({ where: { id: leadId }, data: { rueckrufEventId: null, rueckrufEventKey: null } });
    const { adapterFor } = await import("@/lib/calendar");
    await (await adapterFor(l.rueckrufEventKey)).deleteEvent(l.rueckrufEventId).catch(() => {});
  } catch (err) {
    reportError(err, "rueckruf-kalender-loeschen", { lead: leadId });
  }
}

/** Rückruf eintragen (ersetzt einen früheren). Ergebnis: eingetragen oder warum nicht. */
export async function rueckrufInKalender(leadId: string, at: Date, opts: { appUrl?: string | null } = {}): Promise<"eingetragen" | "kein_kalender" | "fehler"> {
  await rueckrufAusKalender(leadId);
  try {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, customerId: true, name: true, phone: true, source: true, followUpNote: true } });
    if (!lead) return "fehler";
    const { bookingKeys, adapterFor } = await import("@/lib/calendar");
    const keys = await bookingKeys(lead.customerId, lead.id);
    // Nur ein verbundener Kalender: Konto bzw. Berater
    let key: string | null = null;
    for (const k of keys) {
      if (k === lead.customerId) {
        const c = await prisma.calendarConnection.findUnique({ where: { customerId: k }, select: { status: true } });
        if (c?.status === "connected") key = k;
      } else key = k;
      if (key) break;
    }
    if (!key) return "kein_kalender";
    const name = lead.name?.trim() || "Kontakt";
    const tel = lead.phone ? formatPhone(lead.phone) : null;
    const link = opts.appUrl ? `${opts.appUrl.replace(/\/$/, "")}/buyer/kontakte/${lead.id}` : null;
    const ev = await (await adapterFor(key)).createEvent({
      start: at,
      end: new Date(at.getTime() + DAUER_MS),
      summary: `Rückruf: ${name}`,
      description: [tel ? `Telefon: ${tel}` : null, lead.source ? `Interesse: ${lead.source}` : null, lead.followUpNote ? `Notiz: ${lead.followUpNote}` : null, link ? `Kontakt: ${link}` : null]
        .filter(Boolean)
        .join("\n"),
      attendeeEmails: [],
      video: false,
      location: tel,
    });
    await prisma.lead.update({ where: { id: lead.id }, data: { rueckrufEventId: ev.eventId, rueckrufEventKey: key } });
    return "eingetragen";
  } catch (err) {
    reportError(err, "rueckruf-kalender", { lead: leadId });
    return "fehler";
  }
}
