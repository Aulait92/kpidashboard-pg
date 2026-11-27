// Eigene Antwort in Instantly erkennen (Ole, 24.11.2026): „Nachdem ich bei Instantly den Leuten auf eine positive
// Rückmeldung geantwortet habe, muss sich die Aufgabe im CRM automatisch ändern in ein Nachfassen in 2 Tagen auf das Video.“
//
// Im 15-Minuten-Lauf (nach syncReplies) für jede positive Antwort der letzten 14 Tage den Instantly-Thread lesen. Steht
// dort eine von Hand gesendete Mail von uns (ue_type 3, Unibox) nach der Antwort des Kontakts:
// - Mail als OUT am Kontakt speichern (instantlyId, damit nichts doppelt passiert) und im Verlauf vermerken,
// - Antwort-Aufgaben („Auf Cold-Mail-Antwort reagieren“, „Interessent aus Cold Mail anrufen“) erledigen,
// - offene Nachfass-Aufgaben umstellen bzw. eine anlegen: „Nachfassen: Video angesehen?“ (enthält die Mail ein Video)
//   sonst „Nachfassen nach Antwort per Mail“, fällig 2 Werktage nach unserer Mail um 9 Uhr.
// Ist schon ein Termin geplant, gibt es kein Nachfassen, nur die Antwort-Aufgaben werden erledigt.

import { prisma } from "@/lib/prisma";
import { InstantlyRateLimitError, meldeInstantlyFehler } from "@/lib/vertrieb/instantly-drossel";
import { addWorkdays } from "@/lib/vertrieb/dates";
import { berlinAt } from "@/lib/calendar/lead-times";
import type { ApiEmail } from "@/lib/vertrieb/instantly";

export const ANTWORT_AUFGABEN = ["Auf Cold-Mail-Antwort reagieren", "Interessent aus Cold Mail anrufen"];
export const NACHFASSEN_VIDEO = "Nachfassen: Video angesehen?";
export const NACHFASSEN_MAIL = "Nachfassen nach Antwort per Mail";
export const EIGENE_ANTWORT_KAMPAGNE = "Instantly (eigene Antwort)";
const FENSTER_TAGE = 14;
/** Unibox: von Hand gesendete Mail (1 = Kampagne, 2 = empfangen, 3 = von Hand, 4 = geplant) */
const UE_VON_HAND = 3;

/** Enthält unsere Mail ein Video (Wort oder typische Video-Links)? */
export function mitVideo(text: string | null | undefined): boolean {
  return /videos?\b|loom\.com|youtu\.?be|vimeo\.com|\/praesentation/i.test(text ?? "");
}

const zeit = (e: Pick<ApiEmail, "timestamp_email" | "timestamp_created">) => new Date(e.timestamp_email || e.timestamp_created);

/** Unsere erste von Hand gesendete Mail im Thread nach der Antwort des Kontakts, sonst null. */
export function eigeneAntwortNach(thread: ApiEmail[], antwortAm: Date): ApiEmail | null {
  return (
    thread
      .filter((e) => e.ue_type === UE_VON_HAND && zeit(e).getTime() > antwortAm.getTime())
      .sort((a, b) => zeit(a).getTime() - zeit(b).getTime())[0] ?? null
  );
}

/** Fällig: 2 Werktage nach unserer Mail, 9 Uhr deutscher Zeit. */
export function nachfassenAm(gesendet: Date): Date {
  const tag = addWorkdays(gesendet, 2);
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(tag);
  return berlinAt(ymd, "09:00");
}

/** Abgleich im Cron. Gibt die Zahl der verarbeiteten eigenen Antworten zurück. Wirft nicht. */
export async function eigeneAntwortenAbgleichen(now = new Date()): Promise<number> {
  const { threadEmails } = await import("@/lib/vertrieb/instantly");
  const antworten = await prisma.salesEmail.findMany({
    where: { direction: "IN", isAutoReply: false, sentiment: "POSITIV", threadId: { not: null }, sentAt: { gte: new Date(now.getTime() - FENSTER_TAGE * 86_400_000) } },
    orderBy: { sentAt: "desc" },
    select: { contactId: true, threadId: true, sentAt: true },
  });
  // Je Kontakt nur die jüngste positive Antwort
  const jeKontakt = new Map<string, (typeof antworten)[number]>();
  for (const a of antworten) if (!jeKontakt.has(a.contactId)) jeKontakt.set(a.contactId, a);
  let n = 0;
  for (const a of jeKontakt.values()) {
    try {
      // Schon erledigt: unsere Antwort nach dieser Antwort ist gespeichert
      const schon = await prisma.salesEmail.findFirst({ where: { contactId: a.contactId, direction: "OUT", sentAt: { gt: a.sentAt } }, select: { id: true } });
      if (schon) continue;
      const mail = eigeneAntwortNach(await threadEmails(a.threadId!), a.sentAt);
      if (!mail) continue;
      if (await verarbeite(a.contactId, mail, now)) n++;
    } catch (err) {
      // 429 höchstens einmal je Lauf; gedrosselt: Rest im nächsten Lauf
      meldeInstantlyFehler(err, "instantly-eigene-antwort", { contact: a.contactId });
      if (err instanceof InstantlyRateLimitError) break;
    }
  }
  return n;
}

async function verarbeite(contactId: string, mail: ApiEmail, now: Date): Promise<boolean> {
  if (await prisma.salesEmail.findUnique({ where: { instantlyId: mail.id }, select: { id: true } })) return false;
  const gesendet = zeit(mail);
  // Voller Text statt der gekürzten Vorschau (Ole, 27.11.2026)
  const { volleMail, mailTextAus } = await import("@/lib/vertrieb/instantly");
  mail = await volleMail(mail);
  const text = mailTextAus(mail);
  await prisma.salesEmail.create({
    data: {
      contactId,
      campaign: EIGENE_ANTWORT_KAMPAGNE,
      direction: "OUT",
      subject: mail.subject,
      text,
      html: mail.body?.html ?? null,
      fromEmail: mail.eaccount ?? mail.from_address_email ?? null,
      eaccount: mail.eaccount ?? null,
      threadId: mail.thread_id,
      instantlyId: mail.id,
      sentAt: gesendet,
    },
  });
  await prisma.salesActivity.create({
    data: { contactId, type: "EMAIL", outcome: "Antwort gesendet (Instantly)", note: mail.subject ?? null, occurredAt: gesendet },
  });
  // Antwort-Aufgaben sind erledigt
  await prisma.salesTask.updateMany({ where: { contactId, doneAt: null, title: { in: ANTWORT_AUFGABEN } }, data: { doneAt: now } });
  // Termin schon geplant: kein Nachfassen nötig
  const termin = await prisma.salesMeeting.findFirst({ where: { contactId, status: "GEPLANT", startAt: { gt: now } }, select: { id: true } });
  if (termin) return true;
  const title = mitVideo(text) ? NACHFASSEN_VIDEO : NACHFASSEN_MAIL;
  const dueAt = nachfassenAm(gesendet);
  const note = `Antwort per Instantly am ${gesendet.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}${mail.subject ? `: ${mail.subject}` : ""}`;
  const offen = await prisma.salesTask.findMany({ where: { contactId, doneAt: null, type: "NACHFASSEN" }, select: { id: true } });
  if (offen.length) {
    await prisma.salesTask.update({ where: { id: offen[0].id }, data: { title, dueAt, note } });
    if (offen.length > 1) await prisma.salesTask.updateMany({ where: { id: { in: offen.slice(1).map((t) => t.id) } }, data: { doneAt: now } });
  } else {
    await prisma.salesTask.create({ data: { contactId, title, type: "NACHFASSEN", dueAt, note } });
  }
  return true;
}
