// Daten für die Termin-Übersicht (Verkaufen → Termine): nur lesend aus SalesMeeting, SalesContact, SalesTask,
// SalesActivity und Offer. Logik in termine-uebersicht.ts.

import { prisma } from "@/lib/prisma";
import { TERMIN_REVIEW_PREFIX } from "@/lib/vertrieb/crm";
import { FILTER, RUECKBLICK_TAGE, baueUebersicht, zeilenDerAnsicht, type Ansicht, type UTermin } from "@/lib/vertrieb/termine-uebersicht";

const TAG = 86_400_000;
/** „Alle“: höchstens so viele Termine (neueste zuerst) */
const ALLE_MAX = 300;

const TERMIN_SELECT = {
  id: true, contactId: true, title: true, startAt: true, endAt: true, status: true, cancelReason: true, reviewTaskId: true,
  joinUrl: true, location: true, manageToken: true, bookingTypeId: true, inviteeName: true, waConfirmStatus: true,
  bookingType: { select: { slug: true } },
} as const;

export async function ladeTerminUebersicht(opts: { ansicht: Ansicht; filter?: string }, now = new Date()) {
  const seit = new Date(now.getTime() - RUECKBLICK_TAGE * TAG);
  // Kontakte: mit Termin im Rückblick oder danach (bei „Alle“ die letzten 300 Termine) und mit offenem Angebot
  const [basis, aeltere, offene] = await Promise.all([
    prisma.salesMeeting.findMany({ where: { status: { not: "VERSCHOBEN" }, startAt: { gte: seit } }, select: { contactId: true }, distinct: ["contactId"] }),
    opts.ansicht === "alle"
      ? prisma.salesMeeting.findMany({ where: { status: { not: "VERSCHOBEN" }, startAt: { lt: seit } }, orderBy: { startAt: "desc" }, take: ALLE_MAX, select: { contactId: true } })
      : Promise.resolve([]),
    prisma.offer.findMany({
      where: {
        isTest: false,
        salesContactId: { not: null },
        OR: [{ status: "sent", acceptedAt: null, validUntil: { gte: now } }, { status: "accepted", abschlussBonus: { not: null }, abschlussBonusGewaehrt: null, paymentStatus: { not: "paid" } }],
      },
      select: { salesContactId: true },
    }),
  ]);
  const ids = [...new Set([...basis, ...aeltere].map((m) => m.contactId).concat(offene.map((o) => o.salesContactId!)))];

  const [termineRoh, kontakte, aufgaben, angebote] = await Promise.all([
    prisma.salesMeeting.findMany({ where: { contactId: { in: ids }, status: { not: "VERSCHOBEN" } }, select: TERMIN_SELECT }),
    prisma.salesContact.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, firstName: true, lastName: true, city: true, stage: true, customerId: true } }),
    // Offene Aufgaben und alle „Wie lief der Termin?“ (erledigt oder nicht)
    prisma.salesTask.findMany({
      where: { contactId: { in: ids }, OR: [{ doneAt: null }, { title: { startsWith: TERMIN_REVIEW_PREFIX } }] },
      select: { id: true, contactId: true, title: true, dueAt: true, doneAt: true },
    }),
    prisma.offer.findMany({
      where: { salesContactId: { in: ids }, isTest: false, status: { not: "superseded" } },
      select: {
        id: true, salesContactId: true, number: true, company: true, contactName: true, status: true, sentAt: true, viewedAt: true, acceptedAt: true,
        validUntil: true, createdAt: true, setupFee: true, abschlussBonus: true, abschlussBonusBis: true, abschlussBonusGewaehrt: true, allowPayLater: true, paymentStatus: true,
      },
    }),
  ]);
  const termine: UTermin[] = termineRoh.map(({ bookingType, ...m }) => ({ ...m, bookingSlug: bookingType?.slug ?? null }));
  // Verlauf ab dem ältesten Termin bzw. Angebotsversand (nur von Hand mögliche Arten; Cold Mail, LinkedIn usw. nicht)
  const ab = [...termine.map((m) => m.startAt), ...angebote.map((o) => o.sentAt ?? o.createdAt)].reduce((a, b) => (b < a ? b : a), now);
  const aktivitaeten = await prisma.salesActivity.findMany({
    where: { contactId: { in: ids }, type: { in: ["ANRUF", "EMAIL", "NOTIZ", "TERMIN"] }, occurredAt: { gte: ab } },
    select: { contactId: true, type: true, outcome: true, note: true, occurredAt: true },
  });

  const { zeilen, aufmerksamkeit } = baueUebersicht({ termine, kontakte, aufgaben, aktivitaeten, angebote }, now);
  const sichtbar = zeilenDerAnsicht(zeilen, opts.ansicht, now).slice(0, ALLE_MAX);
  const filter = FILTER.find((f) => f.key === opts.filter);
  const anzahl = Object.fromEntries(FILTER.map((f) => [f.key, sichtbar.filter(f.match).length]));
  return { zeilen: filter ? sichtbar.filter(filter.match) : sichtbar, anzahl, aufmerksamkeit };
}
