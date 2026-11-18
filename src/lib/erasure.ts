// DSGVO-Löschung (Art. 17): Personenbezogene Daten eines Leads entfernen.
// Die Lead-Zeile bleibt anonym erhalten (Produkt, Status, Datum, Umsatz), damit
// Abrechnung und Kennzahlen stimmen. Chats, Termine und Einwilligungen werden
// gelöscht. Der Airtable-Sync überspringt gelöschte Leads (erasedAt).

import { BESTAND_FROM_LEAD_NOTE } from "@/lib/vertraege-shared";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { audit, type AuditActor } from "@/lib/audit";
import { loescheAb } from "@/lib/policen/ablage";
import { protokolliereLoeschung } from "@/lib/loeschprotokoll";

export const ERASED_NAME = "Gelöscht (Datenschutz)";

export type EraseResult = { conversations: number; messages: number; appointments: number; consents: number; aufbewahrt?: number };

/**
 * Gesetzliche Aufbewahrung beim Löschen eines Leads (Paket M5, Ole 18.11.2026): Nur die Beratungsdokumentation, die
 * die App erzeugt hat (LeadFile.kind „beratungsdoku“, PDF mit Datum), bleibt bis LeadFile.aufbewahrenBis als Nachweis
 * (VVG §§ 61, 62; Begründung und Frist in lib/lead-files.ts BERATUNGSDOKU_AUFBEWAHRUNG_JAHRE). Der Lead selbst ist
 * danach anonym; der Vermittler sieht am gelöschten Kontakt nur noch dieses PDF. Bei Vertragsende (eraseCustomerData)
 * gilt die Ausnahme nicht: Der Vermittler bekommt vorher den Export, wir löschen alles.
 */
export const aufbewahrtFilter = (now: Date) => ({ kind: "beratungsdoku", aufbewahrenBis: { gt: now } });

/**
 * Einen Lead anonymisieren. Gibt null zurück, wenn es ihn nicht gibt. Steht danach im Löschprotokoll
 * (lib/loeschprotokoll.ts), damit die Löschung nach einer Wiederherstellung der Datenbank erneut greift.
 */
export async function eraseLead(leadId: string, actor?: AuditActor, opts: { ausLoeschprotokoll?: boolean } = {}): Promise<EraseResult | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, customerId: true, phone: true, externalId: true, airtableId: true, erasedAt: true },
  });
  if (!lead) return null;
  const result = await eraseLeads(lead.customerId, [lead], { aufbewahrung: true });
  await audit("lead.erase", {
    entity: "Lead",
    entityId: lead.id,
    customerId: lead.customerId,
    // Bewusst ohne Name/Telefon: das Protokoll soll die Daten nicht weiter vorhalten.
    details: { ...result, airtable: !!lead.airtableId, ...(opts.ausLoeschprotokoll ? { loeschprotokoll: true } : {}) },
    actor,
  });
  if (!opts.ausLoeschprotokoll) await protokolliereLoeschung([{ art: "lead", entityId: lead.id, customerId: lead.customerId, grund: "art17" }]);
  return result;
}

/**
 * Darf der Admin die Daten löschen? (Vertragsende, Anwalts-Memo 15.11.2026) Nur mit genau eingegebenem Kundennamen und
 * entweder archiviertem Kunden (kein Bezug mehr) oder ausdrücklich bestätigtem Vertragsende mit Grund. Rein, getestet.
 */
export function eraseBlocker(c: { name: string; archived: boolean }, input: { confirmName: string; contractEnded: boolean; reason: string }): string | null {
  if (input.confirmName.trim().toLowerCase() !== c.name.trim().toLowerCase()) return "Zur Bestätigung bitte den Kundennamen genau so eingeben.";
  if (!c.archived && !input.contractEnded) return "Der Kunde ist nicht archiviert. Bitte bestätigen, dass der Vertrag beendet ist.";
  if (input.reason.trim().length < 5) return "Bitte einen Grund angeben (z. B. „Vertragsende 31.12., Export am 2.1. übergeben“).";
  return null;
}

/**
 * Alle Leads eines Kunden anonymisieren (Vertragsende), Kalender und Postfach trennen und den Bestand löschen
 * (Bestandskunden mit Verträgen, Kampagnen, Importe, Einwilligungsprotokoll). Die Sperrliste der Abmeldungen
 * (nur Hashes) bleibt, damit Abgemeldete auch nach einem erneuten Import nicht angeschrieben werden.
 */
export async function eraseCustomerData(customerId: string, actor?: AuditActor, opts: { reason?: string | null } = {}) {
  const leads = await prisma.lead.findMany({
    where: { customerId },
    select: { id: true, customerId: true, phone: true, externalId: true, airtableId: true, erasedAt: true },
  });
  const result = await eraseLeads(customerId, leads);
  // Policen im privaten Bucket (lib/policen/ablage.ts) vor den Einträgen löschen
  await loescheAb((await prisma.leadDocument.findMany({ where: { customerId }, select: { storageKey: true } })).map((d) => d.storageKey)).catch(() => null);
  // Restliche Chats/Termine/Einwilligungen ohne Lead-Bezug (z. B. Leute, die
  // von sich aus geschrieben haben).
  const [conv, appt, consent] = await prisma.$transaction([
    prisma.conversation.deleteMany({ where: { customerId } }),
    prisma.appointment.deleteMany({ where: { customerId } }),
    prisma.consentOptIn.deleteMany({ where: { customerId } }),
    prisma.calendarConnection.deleteMany({ where: { customerId } }),
    prisma.leadDocument.deleteMany({ where: { customerId } }),
    // Nachweise zu Policen (nur anhängen, Löschen nur so, migration 20261118725000)
    prisma.$executeRaw`SELECT set_config('app.policen_nachweis_loeschen', 'ja', true)`,
    prisma.policenNachweis.deleteMany({ where: { customerId } }),
    prisma.advisorCalendar.deleteMany({ where: { user: { customerId } } }),
    // Abwesenheiten (Beschäftigtendaten des Kunden) gehen mit
    prisma.userAbsence.deleteMany({ where: { customerId } }),
    prisma.reviewRequest.deleteMany({ where: { customerId } }),
    prisma.referralLink.deleteMany({ where: { customerId } }),
    prisma.googleReview.deleteMany({ where: { customerId } }),
    prisma.googleBusinessConnection.deleteMany({ where: { customerId } }),
    // Eingänge an die Antwortadresse ohne Kontakt (Paket M2)
    prisma.mailEingang.deleteMany({ where: { customerId } }),
  ]);
  // Bestand: Kampagnen (mit Empfängern), Bestandskunden (mit Verträgen), Importe, Einwilligungsprotokoll, Postfach
  const [, existing, , consentLogs] = await prisma.$transaction([
    prisma.customerCampaign.deleteMany({ where: { customerId } }),
    prisma.existingCustomer.deleteMany({ where: { customerId } }),
    prisma.existingCustomerImport.deleteMany({ where: { customerId } }),
    prisma.bestandConsentLog.deleteMany({ where: { customerId } }),
    prisma.mailConnection.deleteMany({ where: { customerId } }),
  ]);
  const total = {
    leads: leads.length,
    conversations: result.conversations + conv.count,
    messages: result.messages,
    appointments: result.appointments + appt.count,
    consents: result.consents + consent.count,
    bestand: existing.count,
    consentLogs: consentLogs.count,
  };
  await audit("customer.erase", { entity: "Customer", entityId: customerId, customerId, details: { ...total, reason: opts.reason ?? null }, actor });
  return total;
}

type LeadRef = { id: string; customerId: string; phone: string | null; externalId: string | null };

async function eraseLeads(customerId: string, leads: LeadRef[], opts: { aufbewahrung?: boolean; now?: Date } = {}): Promise<EraseResult> {
  const res: EraseResult = { conversations: 0, messages: 0, appointments: 0, consents: 0 };
  if (leads.length === 0) return res;
  const now = opts.now ?? new Date();
  const ids = leads.map((l) => l.id);
  const phones = leads.map((l) => l.phone).filter((p): p is string => !!p);
  const externalIds = leads.map((l) => l.externalId).filter((p): p is string => !!p);

  const convs = await prisma.conversation.findMany({
    where: { customerId, OR: [{ leadId: { in: ids } }, ...(phones.length ? [{ contactPhone: { in: phones } }] : [])] },
    select: { id: true },
  });
  const convIds = convs.map((c) => c.id);
  // Policen im privaten Bucket (lib/policen/ablage.ts) vor den Einträgen löschen
  await loescheAb((await prisma.leadDocument.findMany({ where: { leadId: { in: ids } }, select: { storageKey: true } })).map((d) => d.storageKey)).catch(() => null);

  const [messages, appointments, conversations, consents] = await prisma.$transaction([
    prisma.message.deleteMany({ where: { conversationId: { in: convIds } } }),
    prisma.appointment.deleteMany({
      where: { customerId, OR: [{ leadId: { in: ids } }, ...(convIds.length ? [{ conversationId: { in: convIds } }] : [])] },
    }),
    prisma.conversation.deleteMany({ where: { id: { in: convIds } } }),
    prisma.consentOptIn.deleteMany({ where: { customerId, contactPhone: { in: phones } } }),
    prisma.unassignedLead.deleteMany({ where: { externalId: { in: externalIds } } }),
    prisma.leadSequence.deleteMany({ where: { leadId: { in: ids } } }),
    prisma.leadHistory.deleteMany({ where: { leadId: { in: ids } } }),
    // Eingänge an die Antwortadresse (Paket M2, lib/mail/eingang.ts): Ablauf und Anhangliste
    prisma.mailEingang.deleteMany({ where: { leadId: { in: ids } } }),
    // E-Mails (Betreff, Text, Empfänger bzw. Absender) im Kontaktverlauf, ausgehend und eingegangen
    prisma.contactMail.deleteMany({ where: { leadId: { in: ids } } }),
    // Reservierungen der Vorlagen-Mails (lib/mail/vorlagen-mail.ts)
    prisma.leadMailVersand.deleteMany({ where: { leadId: { in: ids } } }),
    // Dokumente am Lead; die Beratungsdokumentation bleibt bei der Löschung eines Leads als Nachweis (aufbewahrtFilter)
    prisma.leadFile.deleteMany({ where: { leadId: { in: ids }, ...(opts.aufbewahrung ? { NOT: aufbewahrtFilter(now) } : {}) } }),
    // Unterlagen per WhatsApp (Policen, lib/policen) und deren Einwilligungen
    prisma.leadDocument.deleteMany({ where: { leadId: { in: ids } } }),
    prisma.bestandConsentLog.deleteMany({ where: { customerId, source: "policen_gesundheit", OR: [{ address: { in: phones } }, { leadId: { in: ids } }] } }),
    // Nachweise zu Policen (nur anhängen; Löschen nur bei Art. 17 bzw. Vertragsende, migration 20261118725000)
    prisma.$executeRaw`SELECT set_config('app.policen_nachweis_loeschen', 'ja', true)`,
    prisma.policenNachweis.deleteMany({ where: { customerId, OR: [{ phone: { in: phones } }, { leadId: { in: ids } }] } }),
    // Empfehlungen & Bewertungen: Antworttext, Link und Verweis auf den Empfehlenden
    prisma.reviewRequest.deleteMany({ where: { leadId: { in: ids } } }),
    prisma.referralLink.deleteMany({ where: { leadId: { in: ids } } }),
    prisma.googleReview.updateMany({ where: { leadId: { in: ids } }, data: { leadId: null } }),
    // Verträge (Cross-Selling): Zahlen bleiben, Vertragsnummer/Versicherer gehen; Spiegel im Bestand
    // (aus der App angelegt) wird gelöscht, ein vom Import übernommener Kunde nur entkoppelt.
    prisma.existingContract.deleteMany({ where: { leadContract: { leadId: { in: ids } } } }),
    prisma.existingCustomer.deleteMany({ where: { leadId: { in: ids }, consentNote: BESTAND_FROM_LEAD_NOTE } }),
    prisma.existingCustomer.updateMany({ where: { leadId: { in: ids } }, data: { leadId: null } }),
    prisma.leadContract.updateMany({ where: { leadId: { in: ids } }, data: { contractNo: null, insurer: null } }),
    // Rückmeldung an Meta (lib/capi): nichts mehr senden
    prisma.capiEvent.updateMany({ where: { leadId: { in: ids }, status: { in: ["queued", "failed"] } }, data: { status: "skipped", error: "Lead gelöscht", nextAttemptAt: null } }),
    prisma.lead.updateMany({
      where: { id: { in: ids } },
      data: {
        name: ERASED_NAME,
        phone: null,
        email: null,
        weitereEmails: [],
        formData: Prisma.DbNull,
        notes: null,
        followUpAt: null,
        followUpNote: null,
        callbackSnoozedUntil: null,
        referralLinkId: null,
        // Antwortadresse: spätere Mails an den Code werden keinem Kontakt mehr zugeordnet
        antwortCode: null,
        erasedAt: new Date(),
      },
    }),
  ]);
  res.messages = messages.count;
  res.appointments = appointments.count;
  res.conversations = conversations.count;
  res.consents = consents.count;
  if (opts.aufbewahrung) res.aufbewahrt = await prisma.leadFile.count({ where: { leadId: { in: ids }, ...aufbewahrtFilter(now) } });
  return res;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Löschfristen für Hilfsdaten (täglich im Cron): nicht zugeordnete Leads
 * (Rohdaten aus Meta) nach 30 Tagen, wenn erledigt, sonst nach 90 Tagen;
 * Passwort-Links 7 Tage nach Ablauf; Abwesenheiten („Ich bin abwesend“, z. B. „krank“)
 * 1 Jahr nach ihrem Ende (bzw. vorzeitigen Ende); Nachfragen nach dem Abschluss
 * (Antworttext, Klicks) 2 Jahre nach dem Anlegen; aufbewahrte Beratungsdokumentation gelöschter Leads nach Ablauf
 * von LeadFile.aufbewahrenBis.
 */
export async function pruneTransient(now = new Date()) {
  const absenceCutoff = new Date(now.getTime() - 365 * DAY_MS);
  const [unassigned, resetTokens, absences, reviewRequests] = await prisma.$transaction([
    prisma.unassignedLead.deleteMany({
      where: {
        OR: [
          { resolvedAt: { lt: new Date(now.getTime() - 30 * DAY_MS) } },
          { createdAt: { lt: new Date(now.getTime() - 90 * DAY_MS) } },
        ],
      },
    }),
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 7 * DAY_MS) } } }),
    prisma.userAbsence.deleteMany({ where: { OR: [{ endsAt: { lt: absenceCutoff } }, { endedAt: { lt: absenceCutoff } }] } }),
    prisma.reviewRequest.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 730 * DAY_MS) } } }),
    // Besucher der Empfehlungsseiten (nur Hash): 12 Monate
    prisma.referralVisit.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 365 * DAY_MS) } } }),
    // Eingänge an die Antwortadresse ohne Kontakt (nur Ablauf, kein Inhalt): 90 Tage (Paket M2)
    prisma.mailEingang.deleteMany({ where: { leadId: null, createdAt: { lt: new Date(now.getTime() - 90 * DAY_MS) } } }),
    // Aufbewahrte Beratungsdokumentation gelöschter Leads nach Ablauf der Frist (Paket M5, lib/lead-files.ts)
    prisma.leadFile.deleteMany({ where: { kind: "beratungsdoku", aufbewahrenBis: { lte: now }, lead: { erasedAt: { not: null } } } }),
  ]);
  return { unassigned: unassigned.count, resetTokens: resetTokens.count, absences: absences.count, reviewRequests: reviewRequests.count };
}
