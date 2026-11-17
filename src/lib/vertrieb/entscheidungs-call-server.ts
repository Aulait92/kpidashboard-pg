// Stand des Entscheidungs-Calls eines Vertriebskontakts, geprüft zum Zeitpunkt des Versands bzw. Aufrufs
// (Angebotsmail, Angebotsseite, Zahlungserinnerung, Hinweis im Admin). Texte: lib/vertrieb/entscheidungs-call.ts.
//
// Als gebucht zählt ein geplanter, zukünftiger SalesMeeting am Kontakt, der ein Entscheidungs-Call ist:
// eigene Buchungsseite bzw. vom Team im Kalender eingetragen (Termintyp „entscheidung“) oder Calendly
// (Titel mit „Entscheid…“), wie terminThema in lib/vertrieb/termin-whatsapp.ts. Abgesagte und verschobene
// Termine (Status ABGESAGT bzw. VERSCHOBEN) zählen nicht, beim Verschieben zählt der neue Termin.

import { prisma } from "@/lib/prisma";
import { DECISION_BOOKING_TYPE, decisionBookingLink, manageLink } from "@/lib/vertrieb/buchung";
import type { EntscheidungsCall } from "@/lib/vertrieb/entscheidungs-call";

/** Ort „Telefon“ (eigene Buchungsseite), Telefonart bzw. Nummer (Calendly „wir rufen an“), ohne Videolink. */
function istTelefon(m: { joinUrl: string | null; location: string | null }): boolean {
  if (m.joinUrl) return false;
  const l = (m.location ?? "").trim();
  return /^telefon|^(outbound|inbound)_call$/i.test(l) || /^\+?[\d\s()/.-]{6,}$/.test(l);
}

/** Nächster gebuchter Entscheidungs-Call des Kontakts (nach now), sonst null. */
export async function gebuchterEntscheidungsCall(contactId: string, now = new Date()) {
  return prisma.salesMeeting.findFirst({
    where: {
      contactId,
      status: "GEPLANT",
      startAt: { gt: now },
      OR: [{ bookingType: { slug: DECISION_BOOKING_TYPE } }, { title: { contains: "entscheid", mode: "insensitive" } }],
    },
    orderBy: { startAt: "asc" },
    select: { id: true, startAt: true, location: true, joinUrl: true, manageToken: true, rescheduleUrl: true },
  });
}

/**
 * Gebucht (Termin und Link zum Verschieben), sonst persönlicher Buchungslink (nur wenn online buchbar), sonst keiner.
 * Ohne Vertriebskontakt (z. B. Angebot an einem Deal): keiner.
 */
export async function entscheidungsCallStand(contactId: string | null | undefined, now = new Date()): Promise<EntscheidungsCall> {
  if (!contactId) return { art: "keiner" };
  const m = await gebuchterEntscheidungsCall(contactId, now);
  if (m) {
    return { art: "gebucht", startAt: m.startAt, telefon: istTelefon(m), verschiebenUrl: m.manageToken ? manageLink(m.manageToken) : m.rescheduleUrl };
  }
  const url = await decisionBookingLink(contactId).catch(() => null);
  return url ? { art: "link", url } : { art: "keiner" };
}
