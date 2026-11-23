// Start des Nachfassens nach einer Absage durch den Lead (Ole, 23.11.2026; Regeln und Texte: lib/absage-nachfassen.ts).
// Aufgerufen aus lib/calendar cancelAppointment, nie störend: Fehler werden gefangen, die Absage selbst gilt immer.

import { prisma } from "@/lib/prisma";
import { ohneAutoNachrichten } from "@/lib/lead-kontakt-sperre";
import { istNurPayPerLead } from "@/lib/customer-package";
import { ABSAGE_EXPERIMENT, ABSAGE_VERZOEGERUNG_MIN, absageNachfassenAusschluss, type AbsageLage } from "@/lib/absage-nachfassen";

export type AbsageStart = { gestartet: true; sequenceId: string; variante: "a" | "b"; nextAt: Date } | { gestartet: false; grund: string };

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);

/** Abgemeldet: „Stopp“ im Chat, Sperrliste des Kunden (alle Kanäle) bzw. Sperre nach Betroffenenrechten. */
async function abgemeldet(customerId: string, leadId: string, phone: string, email: string | null): Promise<boolean> {
  const stopp = await prisma.conversation.count({ where: { customerId, optedOutAt: { not: null }, OR: [{ leadId }, { contactPhone: phone }] } });
  if (stopp > 0) return true;
  const { optOutHash } = await import("@/lib/bestand/links");
  if ((await prisma.bestandOptOut.count({ where: { customerId, kind: "phone", hash: optOutHash("phone", phone), scope: "all" } })) > 0) return true;
  const { sperreFuer } = await import("@/lib/dsgvo/server");
  return !!(await sperreFuer(customerId, { email, phone }));
}

/**
 * Nach der Absage eines Termins durch den Lead die Abfolge „Termin abgesagt“ planen (Fassung je Splittest). Liefert den
 * Grund, falls nicht nachgefasst wird. Höchstens ein Nachfassen je Absage (eine Abfolge mit einem Schritt; läuft schon
 * eine, bleibt sie).
 */
export async function startAbsageNachfassen(appointmentId: string, opts: { now?: Date; verzoegerungMin?: number } = {}): Promise<AbsageStart> {
  const now = opts.now ?? new Date();
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { id: true, leadId: true, customerId: true, status: true, cancelledBy: true } });
  if (!appt?.leadId) return { gestartet: false, grund: "Termin ohne Lead" };
  const leadId = appt.leadId;
  const [lead, customer, account, weitere] = await Promise.all([
    prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, customerId: true, erasedAt: true, status: true, stornoState: true, abschlussGemeldetAt: true, source: true, phone: true, email: true, waUnavailableAt: true, waConsent: true },
    }),
    prisma.customer.findUnique({
      where: { id: appt.customerId },
      select: { dormantSince: true, dataDeletedAt: true, plan: true, retainerMonthly: true, onboarding: { select: { id: true } }, agentConfig: { select: { active: true, outreachEnabled: true, followUpSequencesEnabled: true } } },
    }),
    prisma.whatsAppAccount.findUnique({ where: { customerId: appt.customerId }, select: { status: true } }),
    prisma.appointment.count({ where: { leadId, status: "booked", startsAt: { gt: now }, id: { not: appt.id } } }),
  ]);
  // WhatsApp-Nummer: aus der Online-Buchung übernommen (lib/whatsapp/buchungsnummer.ts), sonst Lead.phone
  const phone = lead ? await import("@/lib/whatsapp/buchungsnummer").then((m) => m.waNummerFuerLead({ id: lead.id, customerId: lead.customerId, phone: lead.phone })) : null;
  const lage: AbsageLage = {
    vomLead: appt.status === "cancelled" && appt.cancelledBy === "lead",
    lead:
      lead && lead.customerId === appt.customerId
        ? {
            erased: !!lead.erasedAt,
            status: lead.status,
            storniert: !!lead.stornoState,
            abschlussGemeldet: !!lead.abschlussGemeldetAt,
            ohneAutoNachrichten: ohneAutoNachrichten(lead.source),
            waUnavailable: !!lead.waUnavailableAt,
            waConsentNein: lead.waConsent === "nein",
            phone,
          }
        : null,
    weitererTermin: weitere > 0,
    kunde: {
      ruhend: !!customer?.dormantSince || !!customer?.dataDeletedAt,
      nurPayPerLead: !!customer && istNurPayPerLead(customer),
      assistentAktiv: !!customer?.agentConfig?.active,
      outreachAn: !!customer?.agentConfig?.outreachEnabled,
      nachfassenAn: !!customer?.agentConfig?.followUpSequencesEnabled,
      whatsappVerbunden: account?.status === "connected",
    },
    abgemeldet: false,
  };
  let grund = absageNachfassenAusschluss(lage);
  if (!grund && phone && (await abgemeldet(appt.customerId, leadId, phone, lead?.email ?? null))) grund = absageNachfassenAusschluss({ ...lage, abgemeldet: true });
  if (grund) return { gestartet: false, grund };

  const { variante } = await import("@/lib/experimente");
  const v = await variante(ABSAGE_EXPERIMENT, leadId);
  const { startSequence } = await import("@/lib/lead-sequences");
  const seq = await startSequence(leadId, v === "b" ? "absage_b" : "absage", now);
  if (!seq) return { gestartet: false, grund: "Automatisches Nachfassen aus" };
  // Läuft schon ein Nachfassen nach einer Absage (zweite Absage kurz hintereinander): bleibt, kein zweites
  if (seq.startedAt.getTime() !== now.getTime()) return { gestartet: false, grund: "Nachfassen nach Absage läuft schon" };
  // Abstand: 20 Minuten (im Chat abgesagt: 2 Stunden)
  const min = opts.verzoegerungMin ?? ABSAGE_VERZOEGERUNG_MIN;
  const nextAt = new Date(now.getTime() + min * 60 * 1000);
  if (min !== ABSAGE_VERZOEGERUNG_MIN) await prisma.leadSequence.update({ where: { id: seq.id }, data: { nextAt } });
  const { logLeadHistory } = await import("@/lib/lead-history");
  await logLeadHistory(
    leadId,
    "wiedervorlage",
    `Termin vom Kontakt abgesagt: Der Assistent fragt ${fmt(nextAt)} Uhr per WhatsApp nach einem neuen Termin (frühestens zur Versandzeit, Mo bis Sa 9 bis 19 Uhr). Sie können die Nachricht unter „Nächste Nachrichten“ überspringen.`,
    { customerId: appt.customerId, userId: null },
  ).catch(() => null);
  return { gestartet: true, sequenceId: seq.id, variante: v, nextAt };
}
