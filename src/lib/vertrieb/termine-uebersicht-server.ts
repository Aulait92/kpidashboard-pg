// Daten für die Termin-Übersicht (Verkaufen → Termine): nur lesend aus SalesMeeting, SalesContact, SalesTask,
// SalesActivity und Offer. Logik in termine-uebersicht.ts.
// Stufe 2: Termine nur als Aufgabe „Termin“, Kennzahlen oben und „Ergebnis fehlt“ für Mein Tag (ladeErgebnisFehlt).

import { prisma } from "@/lib/prisma";
import { TERMIN_REVIEW_PREFIX, istTerminAufgabe } from "@/lib/vertrieb/crm";
import {
  FILTER,
  HEUTE_TAGE,
  RUECKBLICK_TAGE,
  baueUebersicht,
  ergebnisFehltPunkte,
  terminKennzahlen,
  termineAusAufgaben,
  zeilenDerAnsicht,
  type Ansicht,
  type UTermin,
} from "@/lib/vertrieb/termine-uebersicht";

const TAG = 86_400_000;
/** „Alle“: höchstens so viele Termine (neueste zuerst) */
const ALLE_MAX = 300;

const TERMIN_SELECT = {
  id: true, contactId: true, title: true, startAt: true, endAt: true, status: true, cancelReason: true, reviewTaskId: true,
  joinUrl: true, location: true, manageToken: true, bookingTypeId: true, inviteeName: true, waConfirmStatus: true, taskId: true,
  bookingType: { select: { slug: true } },
} as const;

/** Kontakte mit eigener Termin-Aufgabe (Typ Termin, Titel „Termin …“) im Zeitraum. */
async function kontakteMitTerminAufgabe(where: { gte?: Date; lt?: Date; lte?: Date }, take?: number) {
  const rows = await prisma.salesTask.findMany({
    where: { type: "TERMIN", contactId: { not: null }, title: { startsWith: "Termin", mode: "insensitive" }, dueAt: where },
    orderBy: { dueAt: "desc" },
    ...(take ? { take } : {}),
    select: { contactId: true, title: true },
  });
  return rows.filter((t) => istTerminAufgabe(t.title)).map((t) => t.contactId!);
}

/** Termine (gebucht und als Aufgabe), Kontakte, Aufgaben, Verlauf und Angebote dieser Kontakte. */
async function ladeDaten(ids: string[], now: Date) {
  const [termineRoh, kontakte, aufgaben, angebote, terminAufgabenRoh] = await Promise.all([
    prisma.salesMeeting.findMany({ where: { contactId: { in: ids }, status: { not: "VERSCHOBEN" } }, select: TERMIN_SELECT }),
    prisma.salesContact.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, firstName: true, lastName: true, city: true, stage: true, customerId: true } }),
    // Offene Aufgaben und alle „Wie lief der Termin?“ (erledigt oder nicht)
    prisma.salesTask.findMany({
      where: { contactId: { in: ids }, OR: [{ doneAt: null }, { title: { startsWith: TERMIN_REVIEW_PREFIX } }] },
      select: { id: true, contactId: true, title: true, dueAt: true, doneAt: true, createdAt: true },
    }),
    prisma.offer.findMany({
      where: { salesContactId: { in: ids }, isTest: false, status: { not: "superseded" } },
      select: {
        id: true, salesContactId: true, number: true, company: true, contactName: true, status: true, sentAt: true, viewedAt: true, acceptedAt: true,
        validUntil: true, createdAt: true, setupFee: true, abschlussBonus: true, abschlussBonusBis: true, abschlussBonusGewaehrt: true, allowPayLater: true, paymentStatus: true,
      },
    }),
    // Eigene Termin-Aufgaben (erledigt oder nicht); die zu einer Buchung gehörenden fallen unten weg
    prisma.salesTask.findMany({
      where: { contactId: { in: ids }, type: "TERMIN", title: { startsWith: "Termin", mode: "insensitive" } },
      select: { id: true, contactId: true, title: true, dueAt: true },
    }),
  ]);
  const verknuepft = new Set(termineRoh.map((m) => m.taskId).filter(Boolean));
  const gebucht: UTermin[] = termineRoh.map(({ bookingType, ...m }) => ({ ...m, bookingSlug: bookingType?.slug ?? null }));
  const terminAufgaben = terminAufgabenRoh.filter((t) => !verknuepft.has(t.id)).map((t) => ({ ...t, contactId: t.contactId! }));
  const termine = [...gebucht, ...termineAusAufgaben(terminAufgaben, gebucht, aufgaben)];
  // Verlauf ab dem ältesten Termin bzw. Angebotsversand (nur von Hand mögliche Arten; Cold Mail, LinkedIn usw. nicht)
  const ab = [...termine.map((m) => m.startAt), ...angebote.map((o) => o.sentAt ?? o.createdAt)].reduce((a, b) => (b < a ? b : a), now);
  const aktivitaeten = await prisma.salesActivity.findMany({
    where: { contactId: { in: ids }, type: { in: ["ANRUF", "EMAIL", "NOTIZ", "TERMIN"] }, occurredAt: { gte: ab } },
    select: { contactId: true, type: true, outcome: true, note: true, occurredAt: true },
  });
  return { termine, kontakte, aufgaben, aktivitaeten, angebote };
}

export async function ladeTerminUebersicht(opts: { ansicht: Ansicht; filter?: string }, now = new Date()) {
  const seit = new Date(now.getTime() - RUECKBLICK_TAGE * TAG);
  // Kontakte: mit Termin (gebucht oder als Aufgabe) im Rückblick oder danach (bei „Alle“ die letzten 300) und mit offenem Angebot
  const [basis, aeltere, aufgabenBasis, aufgabenAeltere, offene] = await Promise.all([
    prisma.salesMeeting.findMany({ where: { status: { not: "VERSCHOBEN" }, startAt: { gte: seit } }, select: { contactId: true }, distinct: ["contactId"] }),
    opts.ansicht === "alle"
      ? prisma.salesMeeting.findMany({ where: { status: { not: "VERSCHOBEN" }, startAt: { lt: seit } }, orderBy: { startAt: "desc" }, take: ALLE_MAX, select: { contactId: true } })
      : Promise.resolve([]),
    kontakteMitTerminAufgabe({ gte: seit }),
    opts.ansicht === "alle" ? kontakteMitTerminAufgabe({ lt: seit }, ALLE_MAX) : Promise.resolve([]),
    prisma.offer.findMany({
      where: {
        isTest: false,
        salesContactId: { not: null },
        OR: [{ status: "sent", acceptedAt: null, validUntil: { gte: now } }, { status: "accepted", abschlussBonus: { not: null }, abschlussBonusGewaehrt: null, paymentStatus: { not: "paid" } }],
      },
      select: { salesContactId: true },
    }),
  ]);
  const ids = [...new Set([...basis, ...aeltere].map((m) => m.contactId).concat(aufgabenBasis, aufgabenAeltere, offene.map((o) => o.salesContactId!)))];

  const daten = await ladeDaten(ids, now);
  const { zeilen, aufmerksamkeit } = baueUebersicht(daten, now);
  const sichtbar = zeilenDerAnsicht(zeilen, opts.ansicht, now).slice(0, ALLE_MAX);
  const filter = FILTER.find((f) => f.key === opts.filter);
  const anzahl = Object.fromEntries(FILTER.map((f) => [f.key, sichtbar.filter(f.match).length]));
  return { zeilen: filter ? sichtbar.filter(filter.match) : sichtbar, anzahl, aufmerksamkeit, kennzahlen: terminKennzahlen(zeilen, daten.angebote, now) };
}

/** Mein Tag bzw. Admin „Heute“: Termine der letzten 14 Tage, die ab dem Morgen danach noch kein Ergebnis haben. */
export async function ladeErgebnisFehlt(now = new Date()) {
  const seit = new Date(now.getTime() - HEUTE_TAGE * TAG);
  const [gebucht, aufgaben] = await Promise.all([
    prisma.salesMeeting.findMany({ where: { status: "GEPLANT", startAt: { gte: seit, lte: now } }, select: { contactId: true }, distinct: ["contactId"] }),
    kontakteMitTerminAufgabe({ gte: seit, lte: now }),
  ]);
  const ids = [...new Set([...gebucht.map((m) => m.contactId), ...aufgaben])];
  if (!ids.length) return [];
  const { zeilen } = baueUebersicht(await ladeDaten(ids, now), now);
  return ergebnisFehltPunkte(zeilen, now);
}
