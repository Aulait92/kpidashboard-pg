// Einladung mit Kalendereintrag an den Lead (Ole, 17.11.2026 spät):
//   - Bei Buchung im WhatsApp-Assistenten ist die Zeit im Kalender des Vermittlers sofort fest, der Videolink steht in
//     der kurzen Bestätigung; die Einladung an den Lead ist zunächst ausstehend (Appointment.einladungAusstehend).
//   - Sie geht genau EINMAL raus, mit der endgültigen Dauer, sobald (a) die Adresse bestätigt oder korrigiert ist und
//     (b) feststeht, ob Komplettcheck (längerer Termin) oder nicht (einladungWennFertig).
//   - Antwortet der Lead nicht mehr: mit dem aktuellen Stand an die bekannte Adresse, 15 Min. nach der letzten
//     Nachricht bzw. der Buchung, bei Terminbeginn in unter 3 Std. nach 5 Min., spätestens 60 Min. vor Beginn
//     (runEinladungNachholen, WhatsApp-Cron alle 5 Min.; idempotent über einladungAt).
//   - Änderung danach (Dauer, Zeit, Adresse): EINE Aktualisierung derselben Einladung (gleiche UID, SEQUENCE + 1), bei
//     neuer Adresse nur an die neue (einladungAktualisieren).
// Buchungsseite und Vermittler: Bestätigung wie bisher sofort (bookAppointment), einladungAt wird dort gesetzt.

import { prisma } from "@/lib/prisma";

const MIN = 60 * 1000;
/** Warten ohne Antwort, bevor die Einladung mit dem aktuellen Stand rausgeht. */
export const EINLADUNG_WARTEN_MIN = 15;
/** Kurzfristig (Terminbeginn in weniger als 3 Std.): kürzer warten. */
export const EINLADUNG_WARTEN_KURZ_MIN = 5;
export const KURZFRISTIG_MS = 3 * 60 * MIN;
/** Spätestens so viele Minuten vor Terminbeginn geht die Einladung in jedem Fall raus. */
export const EINLADUNG_SPAETESTENS_VOR_MIN = 60;

/** Ist die ausstehende Einladung ohne Antwort jetzt fällig? (rein) */
export function einladungFaellig(o: { startsAt: Date; gebuchtAt: Date; letzteAntwort: Date | null; now: Date }): boolean {
  const now = o.now.getTime();
  if (now >= o.startsAt.getTime() - EINLADUNG_SPAETESTENS_VOR_MIN * MIN) return true;
  const warten = (o.startsAt.getTime() - now < KURZFRISTIG_MS ? EINLADUNG_WARTEN_KURZ_MIN : EINLADUNG_WARTEN_MIN) * MIN;
  const basis = Math.max(o.gebuchtAt.getTime(), o.letzteAntwort?.getTime() ?? 0);
  return now - basis >= warten;
}

export type EinladungErgebnis = "gesendet" | "schon" | "keine_adresse" | "fehler";

/** Einladung genau einmal senden (atomar über einladungAt). */
export async function einladungSenden(appointmentId: string, now = new Date()): Promise<EinladungErgebnis> {
  const claim = await prisma.appointment.updateMany({ where: { id: appointmentId, einladungAt: null, status: "booked" }, data: { einladungAt: now } });
  if (!claim.count) return "schon";
  const { sendLeadEmail } = await import("@/lib/calendar/lead-email");
  const r: { sent: boolean; reason?: string; to?: string } = await sendLeadEmail(appointmentId, "booked", { now }).catch(() => ({ sent: false, reason: "fehler" }));
  if (r.sent) {
    await prisma.appointment.update({ where: { id: appointmentId }, data: { einladungAusstehend: null, ...(r.to ? { einladungAn: r.to } : {}) } });
    return "gesendet";
  }
  // Ohne Adresse bleibt sie ausstehend (kommt später eine, geht sie dann raus); andere Fehler nicht endlos wiederholen
  if (r.reason === "no_email") {
    await prisma.appointment.update({ where: { id: appointmentId }, data: { einladungAt: null } });
    return "keine_adresse";
  }
  await prisma.appointment.update({ where: { id: appointmentId }, data: { einladungAusstehend: null } });
  return "fehler";
}

/**
 * Änderung nach dem Versand: EINE Aktualisierung derselben Einladung (gleiche UID, SEQUENCE + 1).
 *   dauer: Komplettcheck, jetzt 45 Min. („updated“), zeit: andere Zeit („rescheduled“), adresse: an die neue Adresse
 *   (volle Einladung, die alte Adresse bekommt nichts mehr).
 * „ausstehend“ = noch nicht versendet: die spätere Einladung trägt den neuen Stand, nichts doppelt.
 */
export async function einladungAktualisieren(appointmentId: string, art: "dauer" | "zeit" | "adresse", now = new Date()): Promise<"gesendet" | "ausstehend" | "fehler"> {
  const t = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { status: true, einladungAt: true } });
  if (!t || t.status !== "booked") return "fehler";
  if (!t.einladungAt) return "ausstehend";
  await prisma.appointment.update({ where: { id: appointmentId }, data: { einladungSeq: { increment: 1 } } });
  const { sendLeadEmail } = await import("@/lib/calendar/lead-email");
  const kind = art === "dauer" ? "updated" : art === "zeit" ? "rescheduled" : "booked";
  const r: { sent: boolean; to?: string } = await sendLeadEmail(appointmentId, kind, { now }).catch(() => ({ sent: false }));
  if (r.sent && r.to) await prisma.appointment.update({ where: { id: appointmentId }, data: { einladungAn: r.to } });
  return r.sent ? "gesendet" : "fehler";
}

/**
 * Einladen, sobald Adresse und Komplettcheck feststehen (nur ausstehende Einladungen aus dem WhatsApp-Assistenten).
 * Ein Komplettcheck mit offenem Angebot längerer Zeiten (verlaengerung „angebot“) gilt als noch nicht fest.
 */
export async function einladungWennFertig(appointmentId: string, o: { adresseFest: boolean; komplettFest: boolean }, now = new Date()): Promise<EinladungErgebnis | "warten" | "nichts"> {
  const t = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { status: true, einladungAt: true, einladungAusstehend: true, verlaengerung: true } });
  if (!t || t.status !== "booked" || t.einladungAt || !t.einladungAusstehend) return "nichts";
  if (!o.adresseFest || !o.komplettFest || t.verlaengerung === "angebot") return "warten";
  return einladungSenden(appointmentId, now);
}

/**
 * Rückfall ohne Antwort (WhatsApp-Cron): ausstehende Einladungen mit dem aktuellen Stand an die bekannte Adresse. Nicht,
 * solange der Lead „Andere Adresse“ gewählt und noch keine neue genannt hat (die alte gilt dann als falsch).
 */
export async function runEinladungNachholen(now = new Date()): Promise<{ gesendet: number }> {
  const rows = await prisma.appointment.findMany({
    where: { status: "booked", einladungAt: null, einladungAusstehend: { not: null }, startsAt: { gt: now } },
    select: { id: true, startsAt: true, einladungAusstehend: true, conversationId: true },
    orderBy: { startsAt: "asc" },
    take: 100,
  });
  let gesendet = 0;
  for (const t of rows) {
    try {
      if (!t.conversationId) continue;
      const conv = await prisma.conversation.findUnique({ where: { id: t.conversationId }, select: { contactEmail: true } });
      if (!conv?.contactEmail) continue;
      const merker = await prisma.message.findFirst({
        where: { conversationId: t.conversationId, direction: "internal", kind: { in: ["email_frage", "email_ok"] }, body: { contains: t.id } },
        orderBy: { createdAt: "desc" },
        select: { kind: true, body: true },
      });
      if (merker?.kind === "email_frage" && merker.body?.includes('"andere":true')) continue;
      const letzte = await prisma.message.findFirst({ where: { conversationId: t.conversationId, direction: "inbound" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      if (!einladungFaellig({ startsAt: t.startsAt, gebuchtAt: t.einladungAusstehend!, letzteAntwort: letzte?.createdAt ?? null, now })) continue;
      if ((await einladungSenden(t.id, now)) === "gesendet") gesendet++;
    } catch (err) {
      console.error("[einladung nachholen]", err instanceof Error ? err.message.slice(0, 160) : err);
    }
  }
  return { gesendet };
}
