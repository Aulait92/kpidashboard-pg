// Einladung mit Kalendereintrag an den Lead (Ole, 17.11.2026 spät):
//   - Bei Buchung im WhatsApp-Assistenten ist die Zeit im Kalender des Vermittlers sofort fest, der Videolink steht in
//     der kurzen Bestätigung; die Einladung an den Lead ist zunächst ausstehend (Appointment.einladungAusstehend).
//   - Sie geht genau EINMAL raus, mit der endgültigen Dauer, sobald (a) die Adresse bestätigt oder korrigiert ist und
//     (b) feststeht, ob Komplettcheck (längerer Termin) oder nicht (einladungWennFertig).
//   - Antwortet der Lead nicht mehr: mit dem aktuellen Stand an die bekannte Adresse, 30 Min. nach der letzten
//     Nachricht im Chat bzw. der Buchung, bei Terminbeginn in unter 3 Std. nach 5 Min., spätestens 60 Min. vor Beginn;
//     ohne Adresse ein Link zum Eintragen per WhatsApp (runEinladungNachholen → lib/whatsapp/einladung-rueckfall.ts,
//     WhatsApp-Cron alle 5 Min.; idempotent über einladungAt und das Merkfeld einladungAdressen je Termin und Adresse).
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

/** Adresse, an die eine Einladung ginge (wie lib/calendar/lead-email.ts: Chat, ohne Chat der Lead), klein geschrieben. */
export async function einladungsAdresse(appointmentId: string): Promise<string | null> {
  const t = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { conversationId: true, leadId: true } });
  if (!t) return null;
  const roh = t.conversationId
    ? (await prisma.conversation.findUnique({ where: { id: t.conversationId }, select: { contactEmail: true } }))?.contactEmail
    : t.leadId
      ? (await prisma.lead.findUnique({ where: { id: t.leadId }, select: { email: true } }))?.email
      : null;
  return roh?.trim().toLowerCase() || null;
}

/**
 * Merkfeld je Termin und Adresse (Ole, 19.11.2026): Adresse atomar vormerken, bevor die Einladung an sie geht.
 * false = an diese Adresse ging die Einladung zu diesem Termin schon (nie zweimal dieselbe Einladung).
 */
export async function adresseVormerken(appointmentId: string, adresse: string): Promise<boolean> {
  const a = adresse.trim().toLowerCase();
  const r = await prisma.appointment.updateMany({ where: { id: appointmentId, NOT: { einladungAdressen: { has: a } } }, data: { einladungAdressen: { push: a } } });
  return r.count > 0;
}

/** Vormerkung zurücknehmen (Versand fehlgeschlagen). */
export async function adresseFreigeben(appointmentId: string, adresse: string): Promise<void> {
  const a = adresse.trim().toLowerCase();
  const t = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { einladungAdressen: true } });
  if (t?.einladungAdressen.includes(a)) await prisma.appointment.update({ where: { id: appointmentId }, data: { einladungAdressen: t.einladungAdressen.filter((x) => x !== a) } });
}

/** Einladung genau einmal senden (atomar über einladungAt und das Merkfeld je Adresse). */
export async function einladungSenden(appointmentId: string, now = new Date()): Promise<EinladungErgebnis> {
  const claim = await prisma.appointment.updateMany({ where: { id: appointmentId, einladungAt: null, status: "booked" }, data: { einladungAt: now } });
  if (!claim.count) return "schon";
  const adresse = await einladungsAdresse(appointmentId);
  if (adresse && !(await adresseVormerken(appointmentId, adresse))) {
    // An diese Adresse ging dieselbe Einladung schon (z. B. vor einem Fehler bzw. auf anderem Weg): nicht noch einmal
    await prisma.appointment.update({ where: { id: appointmentId }, data: { einladungAusstehend: null } });
    return "schon";
  }
  const { sendLeadEmail } = await import("@/lib/calendar/lead-email");
  const r: { sent: boolean; reason?: string; to?: string } = await sendLeadEmail(appointmentId, "booked", { now }).catch(() => ({ sent: false, reason: "fehler" }));
  if (!r.sent && adresse) await adresseFreigeben(appointmentId, adresse);
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
export async function einladungAktualisieren(appointmentId: string, art: "dauer" | "zeit" | "adresse", now = new Date()): Promise<"gesendet" | "ausstehend" | "schon" | "fehler"> {
  const t = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { status: true, einladungAt: true } });
  if (!t || t.status !== "booked") return "fehler";
  if (!t.einladungAt) return "ausstehend";
  // Neue Adresse: nur, wenn diese Einladung noch nie an sie ging (Merkfeld je Termin und Adresse). Dauer bzw. Zeit
  // geändert: das ist eine neue Fassung, sie geht an die aktuelle Adresse (Merkfeld nur ergänzt).
  const adresse = await einladungsAdresse(appointmentId);
  const neu = adresse ? await adresseVormerken(appointmentId, adresse) : false;
  if (art === "adresse" && !neu) return "schon";
  await prisma.appointment.update({ where: { id: appointmentId }, data: { einladungSeq: { increment: 1 } } });
  const { sendLeadEmail } = await import("@/lib/calendar/lead-email");
  const kind = art === "dauer" ? "updated" : art === "zeit" ? "rescheduled" : "booked";
  const r: { sent: boolean; to?: string } = await sendLeadEmail(appointmentId, kind, { now }).catch(() => ({ sent: false }));
  if (r.sent && r.to) await prisma.appointment.update({ where: { id: appointmentId }, data: { einladungAn: r.to } });
  if (!r.sent && neu && adresse) await adresseFreigeben(appointmentId, adresse);
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
 * Rückfall ohne Antwort (WhatsApp-Cron, Ole 19.11.2026): ausstehende Einladungen mit dem aktuellen Stand an die bekannte
 * Adresse, ohne Adresse ein Link zum Eintragen per WhatsApp (lib/whatsapp/einladung-rueckfall.ts).
 */
export async function runEinladungNachholen(now = new Date()): Promise<{ gesendet: number; links: number }> {
  const { runEinladungRueckfall } = await import("@/lib/whatsapp/einladung-rueckfall");
  return runEinladungRueckfall(now);
}
