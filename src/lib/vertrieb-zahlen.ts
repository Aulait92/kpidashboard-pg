// Tab „Vertrieb“ auf der Zahlen-Seite: Trichter für einen wählbaren Zeitraum
// plus „Woraus besteht das?“ (wer steckt hinter jeder Stufe).
//
// Stufen (jeweils im Zeitraum):
//   Angeschrieben/angerufen: Kontakte mit ausgehender Mail oder Anruf/Mail/LinkedIn-Aktivität
//   Geantwortet:             Kontakte mit eingehender Mail (ohne Abwesenheitsnotizen)
//   Termin:                  Termine (Calendly) mit Beginn im Zeitraum, ohne abgesagte
//   Angebot:                 versendete Angebote (ohne ersetzte Versionen)
//   Gewonnen:                angenommene Angebote (Annahme im Zeitraum)

import { prisma } from "@/lib/prisma";
import { produktRange } from "@/lib/produkte";
import type { ProduktRange } from "@/lib/produkte-shared";

export type VertriebRow = { id: string; name: string; href: string | null; date: string; detail: string | null; status: string | null; muted?: boolean };
export type VertriebStep = { key: "contacted" | "replied" | "meetings" | "offers" | "won"; name: string; v: number; rows: VertriebRow[]; more: number; note?: string };
export type VertriebZahlen = {
  range: ProduktRange;
  from: string;
  to: string;
  steps: VertriebStep[];
  /** Anteil der im Zeitraum versendeten Angebote, die (bis heute) angenommen wurden. */
  winRate: number | null;
  offersSentInRange: number;
  acceptedOfSent: number;
};

const LIST_LIMIT = 200;

const ACTIVITY_LABEL: Record<string, string> = { ANRUF: "Anruf", EMAIL: "E-Mail", COLD_MAIL: "Cold-Mail", LINKEDIN: "LinkedIn" };
const MEETING_STATUS: Record<string, string> = { GEPLANT: "geplant", ABGESAGT: "abgesagt", VERSCHOBEN: "verschoben" };
const OFFER_STATUS: Record<string, string> = { sent: "offen", accepted: "angenommen", declined: "abgelehnt", draft: "Entwurf" };

const contactHref = (id: string) => `/admin/vertrieb/kontakte/${id}`;
const eur = (v: unknown) => `${Number(v ?? 0).toLocaleString("de-DE", { maximumFractionDigits: 0 })} €`;

function offerStatus(o: { status: string; validUntil: Date }, now: Date): string {
  if (o.status === "sent" && o.validUntil < now) return "abgelaufen";
  return OFFER_STATUS[o.status] ?? o.status;
}

export async function loadVertriebZahlen(rangeKey?: string, now = new Date()): Promise<VertriebZahlen> {
  const { key, from, to } = produktRange(rangeKey, now);
  const inRange = { gte: from, lt: to };

  const [outMails, activities, inMails, meetings, offers, won] = await Promise.all([
    prisma.salesEmail.findMany({
      where: { direction: "OUT", sentAt: inRange },
      orderBy: { sentAt: "desc" },
      select: { contactId: true, sentAt: true, campaign: true, contact: { select: { name: true } } },
    }),
    prisma.salesActivity.findMany({
      where: { occurredAt: inRange, type: { in: ["ANRUF", "EMAIL", "COLD_MAIL", "LINKEDIN"] } },
      orderBy: { occurredAt: "desc" },
      select: { contactId: true, occurredAt: true, type: true, contact: { select: { name: true } } },
    }),
    prisma.salesEmail.findMany({
      where: { direction: "IN", sentAt: inRange, isAutoReply: false },
      orderBy: { sentAt: "desc" },
      select: { contactId: true, sentAt: true, subject: true, sentiment: true, contact: { select: { name: true } } },
    }),
    prisma.salesMeeting.findMany({
      where: { startAt: inRange },
      orderBy: { startAt: "desc" },
      select: { id: true, contactId: true, startAt: true, status: true, title: true, inviteeName: true, contact: { select: { name: true } } },
    }),
    prisma.offer.findMany({
      where: { sentAt: inRange, status: { not: "superseded" } },
      orderBy: { sentAt: "desc" },
      select: { id: true, number: true, status: true, sentAt: true, acceptedAt: true, validUntil: true, monthlyFee: true, company: true, contactName: true, salesContactId: true },
    }),
    prisma.offer.findMany({
      where: { acceptedAt: inRange },
      orderBy: { acceptedAt: "desc" },
      select: { id: true, number: true, acceptedAt: true, monthlyFee: true, setupFee: true, company: true, contactName: true, salesContactId: true },
    }),
  ]);

  // Angeschrieben/angerufen: je Kontakt der letzte Kontaktversuch im Zeitraum + Kanäle
  const contacted = new Map<string, { name: string; last: Date; channels: Set<string>; n: number }>();
  const touch = (id: string, name: string, at: Date, channel: string) => {
    const c = contacted.get(id) ?? { name, last: at, channels: new Set<string>(), n: 0 };
    if (at > c.last) c.last = at;
    c.channels.add(channel);
    c.n++;
    contacted.set(id, c);
  };
  for (const m of outMails) touch(m.contactId, m.contact.name, m.sentAt, m.campaign ? "Cold-Mail" : "E-Mail");
  for (const a of activities) touch(a.contactId, a.contact.name, a.occurredAt, ACTIVITY_LABEL[a.type] ?? a.type);
  const contactedRows = [...contacted.entries()]
    .sort((a, b) => b[1].last.getTime() - a[1].last.getTime())
    .map(([id, c]) => ({ id, name: c.name, href: contactHref(id), date: c.last.toISOString(), detail: `${[...c.channels].join(", ")} · ${c.n}×`, status: null }));

  // Geantwortet: je Kontakt die letzte Antwort
  const replied = new Map<string, VertriebRow>();
  for (const m of inMails) {
    if (replied.has(m.contactId)) continue;
    replied.set(m.contactId, {
      id: m.contactId,
      name: m.contact.name,
      href: contactHref(m.contactId),
      date: m.sentAt.toISOString(),
      detail: m.subject,
      status: m.sentiment === "POSITIV" ? "positiv" : m.sentiment === "NEGATIV" ? "negativ" : null,
    });
  }

  const meetingRows: VertriebRow[] = meetings.map((m) => ({
    id: m.id,
    name: m.contact.name,
    href: contactHref(m.contactId),
    date: m.startAt.toISOString(),
    detail: m.inviteeName && m.inviteeName !== m.contact.name ? `${m.title} · ${m.inviteeName}` : m.title,
    status: m.startAt > now && m.status !== "ABGESAGT" ? "anstehend" : (MEETING_STATUS[m.status] ?? m.status),
    muted: m.status === "ABGESAGT",
  }));
  const meetingsHeld = meetings.filter((m) => m.status !== "ABGESAGT").length;
  const cancelled = meetings.length - meetingsHeld;

  const offerName = (o: { company: string | null; contactName: string }) => (o.company ? `${o.company} (${o.contactName})` : o.contactName);
  const offerRows: VertriebRow[] = offers.map((o) => ({
    id: o.id,
    name: offerName(o),
    href: o.salesContactId ? contactHref(o.salesContactId) : null,
    date: o.sentAt!.toISOString(),
    detail: `${o.number} · ${eur(o.monthlyFee)}/Monat`,
    status: offerStatus(o, now),
  }));
  const wonRows: VertriebRow[] = won.map((o) => ({
    id: o.id,
    name: offerName(o),
    href: o.salesContactId ? contactHref(o.salesContactId) : null,
    date: o.acceptedAt!.toISOString(),
    detail: `${o.number} · ${eur(o.monthlyFee)}/Monat${Number(o.setupFee) > 0 ? ` · Setup ${eur(o.setupFee)}` : ""}`,
    status: "angenommen",
  }));

  const cap = (rows: VertriebRow[]) => ({ rows: rows.slice(0, LIST_LIMIT), more: Math.max(0, rows.length - LIST_LIMIT) });
  const acceptedOfSent = offers.filter((o) => o.status === "accepted").length;

  return {
    range: key,
    from: from.toISOString(),
    to: to.toISOString(),
    steps: [
      { key: "contacted", name: "Angeschrieben/angerufen", v: contactedRows.length, ...cap(contactedRows) },
      { key: "replied", name: "Geantwortet", v: replied.size, ...cap([...replied.values()]), note: "ohne Abwesenheitsnotizen" },
      { key: "meetings", name: "Termin", v: meetingsHeld, ...cap(meetingRows), note: cancelled ? `ohne ${cancelled} abgesagte (in der Liste ausgegraut)` : undefined },
      { key: "offers", name: "Angebot", v: offers.length, ...cap(offerRows) },
      { key: "won", name: "Gewonnen", v: won.length, ...cap(wonRows) },
    ],
    winRate: offers.length ? acceptedOfSent / offers.length : null,
    offersSentInRange: offers.length,
    acceptedOfSent,
  };
}
