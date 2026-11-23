// A/B-Tests der Vertriebs-Nachrichten (lib/vertrieb/ab-tests.ts): Fassung lesen, Zuteilung nach dem Versand merken und
// Ziele aus der Datenbank nachtragen (einmal je Stunde im WhatsApp-Cron, vor der Entscheidung in lib/experimente.ts).
//
// Nachtragen statt an jeder Stelle einzeln melden: Zahlung (Stripe-Webhook, Überweisung, von Hand), Ergebnis eines
// Termins (Nachfrage, Kontaktakte, Notiz) und Antworten (Instantly, erfasste Mails) kommen auf vielen Wegen. Der Cron
// liest den Stand einmal und schreibt die Ereignisse (je Einheit und Ziel höchstens einmal, skipDuplicates).
// Einheit ist immer die ID von Angebot, Termin bzw. Follow-up, nie Name oder Adresse.

import { prisma } from "@/lib/prisma";
import { ereignis, variante, type Variante } from "@/lib/experimente";
import { zahlungEingerichtet } from "@/lib/angebot-zahlungserinnerung";
import {
  AB_ANGEBOT,
  AB_FOLLOWUP,
  AB_TERMIN,
  FOLLOWUP_REIF_TAGE,
  ZIEL_ANGENOMMEN,
  ZIEL_ANTWORT,
  ZIEL_ERSCHIENEN,
  ZIEL_FOLLOWUP_REIF,
  ZIEL_TERMIN,
  ZIEL_TERMIN_AUSGEWERTET,
  ZIEL_ZAHLUNG,
  type VertriebAbTest,
} from "@/lib/vertrieb/ab-tests";

const DAY = 86_400_000;
/** Zuteilungen, die älter sind, werden nicht mehr nachgeprüft */
const RUECKBLICK_TAGE = 120;

/**
 * Fassung, die diese Einheit bekommt, ohne Zuteilung anzulegen (Vorschau und Aufbau der Mail vor dem Versand). Die
 * Zuteilung ist fest je Einheit (Hash), darum gleich der Fassung, die zuteilungMerken später speichert.
 */
export function fassung(test: VertriebAbTest, einheit: string | null | undefined): Promise<Variante> {
  return variante(test, einheit, { merken: false });
}

/** Nach erfolgreichem Versand: Zuteilung speichern (einmal je Einheit). Fehler lassen den Versand nie scheitern. */
export async function zuteilungMerken(test: VertriebAbTest, einheit: string | null | undefined): Promise<void> {
  await variante(test, einheit);
}

async function offeneZuteilungen(test: VertriebAbTest, ohneZiel: string, now: Date, take = 500): Promise<string[]> {
  const rows = await prisma.experimentZuteilung.findMany({
    where: { experiment: test, createdAt: { gt: new Date(now.getTime() - RUECKBLICK_TAGE * DAY) } },
    select: { einheit: true },
    take: 2000,
  });
  if (!rows.length) return [];
  const fertig = await prisma.experimentEreignis.findMany({ where: { experiment: test, ziel: ohneZiel, einheit: { in: rows.map((r) => r.einheit) } }, select: { einheit: true } });
  const done = new Set(fertig.map((f) => f.einheit));
  return rows.map((r) => r.einheit).filter((e) => !done.has(e)).slice(0, take);
}

export type VertriebZieleErgebnis = { angenommen: number; zahlung: number; ausgewertet: number; erschienen: number; reif: number; antwort: number; termin: number };

/** Ziele der drei Vertriebs-Tests nachtragen (WhatsApp-Cron, einmal je Stunde vor promoteExperimentWinners). */
export async function vertriebZieleNachtragen(now = new Date()): Promise<VertriebZieleErgebnis> {
  const out: VertriebZieleErgebnis = { angenommen: 0, zahlung: 0, ausgewertet: 0, erschienen: 0, reif: 0, antwort: 0, termin: 0 };

  // 1) Angebots-Strecke: angenommen und Zahlung eingerichtet
  const angebotIds = await offeneZuteilungen(AB_ANGEBOT, ZIEL_ZAHLUNG, now);
  if (angebotIds.length) {
    const offers = await prisma.offer.findMany({
      where: { id: { in: angebotIds } },
      select: { id: true, acceptedAt: true, paymentStatus: true, stripeSubscriptionId: true, stripeScheduleId: true, zahlweise: true },
    });
    for (const o of offers) {
      if (o.acceptedAt) {
        await ereignis(AB_ANGEBOT, o.id, ZIEL_ANGENOMMEN);
        out.angenommen++;
      }
      if (zahlungEingerichtet(o)) {
        await ereignis(AB_ANGEBOT, o.id, ZIEL_ZAHLUNG);
        out.zahlung++;
      }
    }
  }

  // 2) Terminerinnerung: Ergebnis eingetragen (erschienen oder nicht) bzw. abgesagt; verschobene Termine zählen nicht
  const terminIds = await offeneZuteilungen(AB_TERMIN, ZIEL_TERMIN_AUSGEWERTET, now);
  if (terminIds.length) {
    const { terminErgebnis } = await import("@/lib/vertrieb/termine-uebersicht");
    const meetings = await prisma.salesMeeting.findMany({
      where: { id: { in: terminIds }, status: { in: ["GEPLANT", "ABGESAGT"] } },
      select: {
        id: true, contactId: true, title: true, startAt: true, endAt: true, status: true, cancelReason: true, reviewTaskId: true,
        joinUrl: true, location: true, manageToken: true, bookingTypeId: true, inviteeName: true, waConfirmStatus: true,
      },
    });
    for (const m of meetings) {
      if (m.status === "GEPLANT" && m.startAt > now) continue;
      const [aktivitaeten, naechster, review] = await Promise.all([
        prisma.salesActivity.findMany({ where: { contactId: m.contactId, occurredAt: { gte: m.startAt } }, select: { contactId: true, type: true, outcome: true, note: true, occurredAt: true } }),
        prisma.salesMeeting.findFirst({ where: { contactId: m.contactId, status: "GEPLANT", startAt: { gt: m.startAt } }, orderBy: { startAt: "asc" }, select: { startAt: true } }),
        m.reviewTaskId ? prisma.salesTask.findUnique({ where: { id: m.reviewTaskId }, select: { doneAt: true } }) : null,
      ]);
      const e = terminErgebnis({ ...m, bookingSlug: null }, aktivitaeten, naechster?.startAt ?? null, review, now);
      if (e.art !== "abgesagt" && e.art !== "eingetragen" && e.art !== "erledigt") continue;
      await ereignis(AB_TERMIN, m.id, ZIEL_TERMIN_AUSGEWERTET);
      out.ausgewertet++;
      if (e.art === "erledigt" || (e.art === "eingetragen" && e.id !== "nicht_erschienen")) {
        await ereignis(AB_TERMIN, m.id, ZIEL_ERSCHIENEN);
        out.erschienen++;
      }
    }
  }

  // 3) Später-Follow-up: Antwort bzw. Termin binnen 14 Tagen nach Mail 1, gezählt erst 14 Tage nach Mail 1
  const followupIds = await offeneZuteilungen(AB_FOLLOWUP, ZIEL_FOLLOWUP_REIF, now);
  if (followupIds.length) {
    const fs = await prisma.salesFollowup.findMany({ where: { id: { in: followupIds }, mail1SentAt: { not: null } }, select: { id: true, contactId: true, mail1SentAt: true } });
    for (const f of fs) {
      const von = f.mail1SentAt!;
      const bis = new Date(von.getTime() + FOLLOWUP_REIF_TAGE * DAY);
      const [antwort, termin] = await Promise.all([
        prisma.salesEmail.findFirst({ where: { contactId: f.contactId, direction: "IN", isAutoReply: false, sentAt: { gt: von, lte: bis } }, select: { id: true } }),
        prisma.salesMeeting.findFirst({ where: { contactId: f.contactId, createdAt: { gt: von, lte: bis } }, select: { id: true } }),
      ]);
      if (antwort) {
        await ereignis(AB_FOLLOWUP, f.id, ZIEL_ANTWORT);
        out.antwort++;
      }
      if (termin) {
        await ereignis(AB_FOLLOWUP, f.id, ZIEL_TERMIN);
        out.termin++;
      }
      if (bis <= now) {
        await ereignis(AB_FOLLOWUP, f.id, ZIEL_FOLLOWUP_REIF);
        out.reif++;
      }
    }
  }
  return out;
}
