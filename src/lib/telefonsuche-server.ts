// Telefonsuche mit Datenbank (Ole, 16.11.2026): Admin-Suche über alle Nummernfelder und Nummern aus
// E-Mail-Signaturen (SalesEmailPhone). Regeln und Schlüssel: lib/telefonsuche.ts.
// - Vertriebskontakt: Haupt- und weitere Nummern, Buchungen (SalesMeeting.inviteePhone), Support-Chats,
//   Signaturen eingehender Mails (ohne Abwesenheitsnotizen, ohne zitierten Verlauf).
// - Kunde: Stammdaten (Vertriebskontakt des Kunden, Erstinformation, WhatsApp-Nummer, Impressum).
// - Lead-Telefon und WhatsApp-Chats der Kunden.
// Steht die Nummer nur in einer Mail oder Buchung, bietet der Treffer „Als weitere Nummer übernehmen“ an
// (adoptFoundPhone → addContactPhone aus der Kontaktdaten-Übernahme).

import { testKennung } from "@/lib/customer-package";
import { formatPhone } from "@/lib/format";
import { htmlToText } from "@/lib/impressum";
import { reportError } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";
import { phoneE164, phoneKey } from "@/lib/vertrieb/dubletten";
import { extractMailPhones, ownPhones, sourceLabel } from "@/lib/vertrieb/kontaktdaten";
import { addContactPhone, detectedDataOf, type AddResult } from "@/lib/vertrieb/kontaktdaten-server";
import { phoneDigitsKey, phoneDigitsWhere, type PhoneQuery } from "@/lib/telefonsuche";

export type AdminSearchHit = {
  kind: "kunde" | "kontakt" | "lead" | "login" | "chat";
  id: string;
  title: string;
  subtitle: string;
  href: string;
  /** Gefundene Nummer und Quelle, z. B. „+49 152 58142143 · in E-Mail-Signatur vom 12.11.“ */
  match?: string;
  /** Zusatzknopf im Treffer (POST an url mit body) */
  action?: { label: string; url: string; body: Record<string, string> };
  /** Kennzeichen neben dem Titel, z. B. „Intern“ oder „Test“ (interne Konten, Testkunden) */
  badge?: string;
};

const reverse = (s: string) => [...s].reverse().join("");
const dayMonth = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(d);
/** Anzeige einer Nummer in beliebiger Schreibweise („+49 152 58142143“). */
export const showPhone = (raw: string | null | undefined) => {
  const e = phoneE164(raw);
  return e ? formatPhone(e) : (raw ?? "").trim();
};
const short = (n: string) => n.replace(/^Allianz\s+/i, "");

// ─── Nummern aus Mail-Signaturen (Index) ───────────────────────────────

/**
 * Nummern aus dem eigenen Teil bzw. der Signatur einer eingehenden Mail eintragen (idempotent, ersetzt den
 * bisherigen Stand dieser Mail). Ausgehende Mails tragen unsere Signatur: nichts. Abwesenheitsnotizen werden
 * eingetragen, aber in der Suche nicht gezeigt (die Einordnung kann sich von Hand ändern).
 */
export async function indexMailPhones(emailId: string): Promise<number> {
  const m = await prisma.salesEmail.findUnique({ where: { id: emailId }, select: { direction: true, text: true, html: true } });
  if (!m) return 0;
  const phones = m.direction === "IN" ? extractMailPhones(m.text || (m.html ? htmlToText(m.html) : null), ownPhones()).phones : [];
  const rows = phones.flatMap((p) => {
    const k = phoneDigitsKey(p.e164);
    return k ? [{ emailId, phone: p.e164, kind: p.kind, phoneDigits: k, phoneDigitsRev: reverse(k) }] : [];
  });
  await prisma.$transaction([
    prisma.salesEmailPhone.deleteMany({ where: { emailId } }),
    ...(rows.length ? [prisma.salesEmailPhone.createMany({ data: rows, skipDuplicates: true })] : []),
    prisma.salesEmail.update({ where: { id: emailId }, data: { phonesIndexedAt: new Date() } }),
  ]);
  return rows.length;
}

/** Noch nicht eingetragene eingehende Mails nachholen (Cron, kleine Schritte; ein zweiter Lauf findet nichts mehr). */
export async function indexPendingMailPhones(limit = 300): Promise<{ mails: number; phones: number }> {
  const pending = await prisma.salesEmail.findMany({ where: { direction: "IN", phonesIndexedAt: null }, select: { id: true }, orderBy: { sentAt: "desc" }, take: limit });
  let phones = 0;
  for (const p of pending) {
    try {
      phones += await indexMailPhones(p.id);
    } catch (err) {
      reportError(err, "telefonsuche-index");
    }
  }
  return { mails: pending.length, phones };
}

// ─── Admin-Suche ───────────────────────────────────────────────────────

type ContactMatch = { prio: number; match: string; action?: AdminSearchHit["action"] };

const TAKE = 10;

/** Alle Nummernfelder nach einer Telefonnummer durchsuchen (Admin, alle Kunden). */
export async function searchPhonesAdmin(q: PhoneQuery): Promise<AdminSearchHit[]> {
  const w = phoneDigitsWhere(q);
  const [mains, extras, meetings, mails, leads, chats, erstinfos, waAccounts, onboardings] = await Promise.all([
    prisma.salesContact.findMany({ where: w, take: TAKE, orderBy: { updatedAt: "desc" }, select: { id: true, phone: true } }),
    prisma.salesContactPhone.findMany({ where: w, take: TAKE, select: { contactId: true, phone: true, source: true, detectedAt: true } }),
    prisma.salesMeeting.findMany({ where: w, take: TAKE, orderBy: { createdAt: "desc" }, select: { id: true, contactId: true, inviteePhone: true, createdAt: true } }),
    prisma.salesEmailPhone.findMany({
      where: { ...w, email: { direction: "IN", isAutoReply: false } },
      take: TAKE,
      orderBy: { email: { sentAt: "desc" } },
      select: { id: true, phone: true, email: { select: { contactId: true, sentAt: true } } },
    }),
    prisma.lead.findMany({ where: w, take: 6, orderBy: { createdAt: "desc" }, select: { id: true, name: true, phone: true, source: true, customer: { select: { id: true, name: true } } } }),
    prisma.conversation.findMany({
      where: w,
      take: 6,
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
      select: { id: true, contactName: true, contactPhone: true, status: true, leadId: true, salesContactId: true, customer: { select: { name: true } } },
    }),
    prisma.erstinformation.findMany({ where: w, take: 5, select: { telefon: true, customerId: true } }),
    prisma.whatsAppAccount.findMany({ where: w, take: 5, select: { phoneNumber: true, customerId: true } }),
    prisma.onboarding.findMany({ where: w, take: 5, select: { websiteInfo: true, customerId: true } }),
  ]);

  // Vertriebskontakte samt bekannter Nummern (für „schon am Kontakt?“)
  const contactIds = [
    ...new Set([
      ...mains.map((c) => c.id),
      ...extras.map((p) => p.contactId),
      ...meetings.map((m) => m.contactId),
      ...mails.map((m) => m.email.contactId),
      ...chats.flatMap((c) => (c.salesContactId ? [c.salesContactId] : [])),
    ]),
  ];
  const contacts = contactIds.length
    ? await prisma.salesContact.findMany({
        where: { id: { in: contactIds } },
        select: {
          id: true,
          name: true,
          city: true,
          phone: true,
          detectedData: true,
          customer: { select: { id: true, name: true, plan: true, archived: true } },
          phones: { select: { phone: true } },
        },
      })
    : [];
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const known = (contactId: string, raw: string | null) => {
    const c = byId.get(contactId);
    const k = phoneKey(raw);
    if (!c || !k) return true;
    if (phoneKey(c.phone) === k || c.phones.some((p) => phoneKey(p.phone) === k)) return true;
    return (detectedDataOf(c.detectedData).removed ?? []).some((r) => phoneKey(r) === k);
  };
  const adopt = (body: Record<string, string>) => ({ label: "Als weitere Nummer übernehmen", url: "/api/admin/search/nummer", body });

  const best = new Map<string, ContactMatch>();
  const offer = (contactId: string, m: ContactMatch) => {
    const cur = best.get(contactId);
    if (!cur || m.prio < cur.prio) best.set(contactId, m);
  };
  for (const c of mains) offer(c.id, { prio: 0, match: `${showPhone(c.phone)} · Hauptnummer` });
  for (const p of extras) offer(p.contactId, { prio: 1, match: `${showPhone(p.phone)} · weitere Nummer, ${sourceLabel("phone", p.source, p.detectedAt)}` });
  for (const c of chats) if (c.salesContactId) offer(c.salesContactId, { prio: 2, match: `${showPhone(c.contactPhone)} · im WhatsApp-Chat` });
  for (const m of meetings) {
    const isKnown = known(m.contactId, m.inviteePhone);
    offer(m.contactId, { prio: 3, match: `${showPhone(m.inviteePhone)} · in Buchung vom ${dayMonth(m.createdAt)}`, ...(isKnown ? {} : { action: adopt({ quelle: "buchung", id: m.id }) }) });
  }
  for (const m of mails) {
    const isKnown = known(m.email.contactId, m.phone);
    offer(m.email.contactId, { prio: 4, match: `${showPhone(m.phone)} · in E-Mail-Signatur vom ${dayMonth(m.email.sentAt)}`, ...(isKnown ? {} : { action: adopt({ quelle: "mail", id: m.id }) }) });
  }

  const hits: AdminSearchHit[] = [];
  const customerMatch = new Map<string, string>();
  for (const [contactId, m] of [...best.entries()].sort((a, b) => a[1].prio - b[1].prio)) {
    const c = byId.get(contactId);
    if (!c) continue;
    if (c.customer) {
      // Vertriebskontakt eines Kunden = Kunden-Stammdaten
      if (!customerMatch.has(c.customer.id)) customerMatch.set(c.customer.id, m.match);
      continue;
    }
    hits.push({
      kind: "kontakt",
      id: c.id,
      title: short(c.name),
      subtitle: `Vertriebskontakt${c.city ? ` · ${c.city}` : ""}`,
      href: `/admin/neu/vertrieb/kontakte/${c.id}`,
      match: m.match,
      ...(m.action ? { action: m.action } : {}),
    });
  }
  for (const e of erstinfos) if (!customerMatch.has(e.customerId)) customerMatch.set(e.customerId, `${showPhone(e.telefon)} · Erstinformation`);
  for (const a of waAccounts) if (!customerMatch.has(a.customerId)) customerMatch.set(a.customerId, `${showPhone(a.phoneNumber)} · WhatsApp-Nummer`);
  for (const o of onboardings) {
    const phone = (o.websiteInfo as { phone?: string | null } | null)?.phone ?? null;
    if (!customerMatch.has(o.customerId)) customerMatch.set(o.customerId, `${showPhone(phone)} · Impressum`);
  }
  if (customerMatch.size) {
    const customers = await prisma.customer.findMany({
      where: { id: { in: [...customerMatch.keys()] } },
      select: { id: true, name: true, archived: true, plan: true, isTest: true },
    });
    const order = [...customerMatch.keys()];
    customers.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    hits.unshift(
      ...customers.map((c) => ({
        kind: "kunde" as const,
        id: c.id,
        title: short(c.name),
        subtitle: `Kunde${c.archived ? " (archiviert)" : ""}`,
        href: `/admin/neu/kunden/${c.id}`,
        match: customerMatch.get(c.id),
        // Interne Konten und Testkunden werden mitgefunden, aber gekennzeichnet (Ole, 17.11.2026)
        ...(testKennung(c) ? { badge: testKennung(c)! } : {}),
      })),
    );
  }

  const leadIds = new Set(leads.map((l) => l.id));
  for (const l of leads) {
    hits.push({
      kind: "lead",
      id: l.id,
      title: l.name ?? "Lead ohne Name",
      subtitle: `Lead · ${short(l.customer.name)}${l.source ? ` · ${l.source}` : ""}`,
      href: `/admin/neu/leads/alle?kunde=${l.customer.id}&q=${encodeURIComponent(l.name ?? l.phone ?? "")}`,
      match: `${showPhone(l.phone)} · Lead-Telefon`,
    });
  }
  for (const c of chats) {
    if (c.salesContactId || (c.leadId && leadIds.has(c.leadId))) continue;
    hits.push({
      kind: "chat",
      id: c.id,
      title: c.contactName?.trim() || showPhone(c.contactPhone),
      subtitle: `WhatsApp-Chat · ${short(c.customer.name)}`,
      href: `/admin/neu/leads/chats?c=${c.id}&tab=${encodeURIComponent(c.status)}`,
      match: `${showPhone(c.contactPhone)} · WhatsApp`,
    });
  }
  return hits;
}

// ─── „Als weitere Nummer übernehmen“ ───────────────────────────────────

/** Nummer aus einer Mail-Signatur bzw. Buchung an den Kontakt übernehmen (bestehende Kontaktdaten-Übernahme). */
export async function adoptFoundPhone(quelle: string, id: string): Promise<AddResult | "notfound"> {
  if (quelle === "mail") {
    const p = await prisma.salesEmailPhone.findUnique({ where: { id }, select: { phone: true, kind: true, email: { select: { contactId: true, sentAt: true } } } });
    if (!p) return "notfound";
    return addContactPhone(p.email.contactId, p.phone, { source: "MAIL", at: p.email.sentAt, kind: p.kind === "MOBIL" ? "MOBIL" : "FESTNETZ" });
  }
  if (quelle === "buchung") {
    const m = await prisma.salesMeeting.findUnique({ where: { id }, select: { contactId: true, inviteePhone: true, createdAt: true, bookingTypeId: true, manageToken: true } });
    if (!m?.inviteePhone) return "notfound";
    return addContactPhone(m.contactId, m.inviteePhone, { source: m.bookingTypeId || m.manageToken ? "BUCHUNG" : "CALENDLY", at: m.createdAt });
  }
  return "notfound";
}
