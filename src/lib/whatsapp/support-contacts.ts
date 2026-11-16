// Support-Nummer (Ole, 15.11.2026): Wer schreibt uns? Jeder Chat auf der Support-Nummer wird über die
// Telefonnummer einem Vertriebskontakt bzw. Kunden zugeordnet und als „Kunde“, „Interessent“ oder
// „Unbekannt“ markiert (Admin → WhatsApp, Filter). Von Hand gesetzte Zuordnungen bleiben stehen.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";

export type SupportKind = "kunde" | "interessent" | "unbekannt";
export const SUPPORT_KINDS: { key: SupportKind; label: string }[] = [
  { key: "kunde", label: "Kunden" },
  { key: "interessent", label: "Interessenten" },
  { key: "unbekannt", label: "Unbekannt" },
];

type ContactInfo = { id: string; name: string; stage: string; customerStage: string | null; customerId: string | null };
type CustomerInfo = { id: string; name: string };

export type SupportBadge = { kind: SupportKind; label: string; detail: string | null; href: string | null };

const STAGE_LABEL: Record<string, string> = {
  NEU: "neu",
  NICHT_ERREICHT: "nicht erreicht",
  WIEDERVORLAGE: "Wiedervorlage",
  INTERESSE: "Interesse",
  TERMIN: "Termin",
  SPAETER: "später",
  VERLOREN: "verloren",
  UNGUELTIG: "ungültig",
};

/** Ist der Vertriebskontakt schon Kunde? (verknüpftes Kundenkonto, gewonnen oder in der Kunden-Pipeline) */
export function contactIsCustomer(c: Pick<ContactInfo, "stage" | "customerStage" | "customerId">): boolean {
  return !!c.customerId || c.stage === "GEWONNEN" || !!c.customerStage;
}

/** Abzeichen für einen Support-Chat. */
export function supportBadge(conv: { salesContact: ContactInfo | null; linkedCustomer: CustomerInfo | null }): SupportBadge {
  const sc = conv.salesContact;
  const cust = conv.linkedCustomer;
  if (cust || (sc && contactIsCustomer(sc))) {
    const gekuendigt = sc?.customerStage === "GEKUENDIGT";
    return {
      kind: "kunde",
      label: gekuendigt ? "Kunde (gekündigt)" : "Kunde",
      detail: cust?.name ?? sc?.name ?? null,
      href: cust ? `/admin/kunden/${cust.id}` : sc?.customerId ? `/admin/kunden/${sc.customerId}` : sc ? `/admin/vertrieb/kontakte/${sc.id}` : null,
    };
  }
  if (sc) {
    return { kind: "interessent", label: "Interessent", detail: [sc.name, STAGE_LABEL[sc.stage]].filter(Boolean).join(" · "), href: `/admin/vertrieb/kontakte/${sc.id}` };
  }
  return { kind: "unbekannt", label: "Unbekannt", detail: null, href: null };
}

const CONTACT_IS_CUSTOMER: Prisma.SalesContactWhereInput = { OR: [{ customerId: { not: null } }, { stage: "GEWONNEN" }, { customerStage: { not: null } }] };

/** Filter für die Chatliste (nur Chats der Support-Nummer). */
export function supportKindWhere(kind: SupportKind | "support" | "leads"): Prisma.ConversationWhereInput {
  // Chats der Leads unserer Kunden (alles außer der Support-Nummer), Ole 16.11.2026: „alle gemischt, aber filterbar“
  if (kind === "leads") return { customerId: { not: SUPPORT_CUSTOMER_ID } };
  const base: Prisma.ConversationWhereInput = { customerId: SUPPORT_CUSTOMER_ID };
  if (kind === "support") return base;
  if (kind === "kunde") return { ...base, OR: [{ linkedCustomerId: { not: null } }, { salesContact: { is: CONTACT_IS_CUSTOMER } }] };
  if (kind === "interessent") return { ...base, linkedCustomerId: null, salesContactId: { not: null }, salesContact: { is: { NOT: CONTACT_IS_CUSTOMER } } };
  return { ...base, linkedCustomerId: null, salesContactId: null };
}

export const SUPPORT_BADGE_SELECT = {
  salesContact: { select: { id: true, name: true, stage: true, customerStage: true, customerId: true } },
  linkedCustomer: { select: { id: true, name: true } },
} satisfies Prisma.ConversationSelect;

// ─── Zuordnung über die Telefonnummer ───────────────────────────────────

type PhoneIndex = Map<string, { id: string; customerId: string | null; customer: boolean }>;

/** Alle Vertriebskontakte mit Telefonnummer, normalisiert (bei Dubletten gewinnt der Kunde). */
async function loadPhoneIndex(): Promise<PhoneIndex> {
  const rows = await prisma.salesContact.findMany({
    where: { phone: { not: null } },
    select: { id: true, phone: true, customerId: true, stage: true, customerStage: true },
  });
  const idx: PhoneIndex = new Map();
  for (const r of rows) {
    const p = r.phone ? normalizePhone(r.phone) : null;
    if (!p) continue;
    const customer = contactIsCustomer(r);
    const prev = idx.get(p);
    if (!prev || (customer && !prev.customer)) idx.set(p, { id: r.id, customerId: r.customerId, customer });
  }
  return idx;
}

/** Zuordnung für eine Nummer (WhatsApp-Format, z. B. 4915112345678). */
export async function matchSupportPhone(phone: string, idx?: PhoneIndex): Promise<{ salesContactId: string | null; linkedCustomerId: string | null }> {
  const p = normalizePhone(phone.startsWith("+") ? phone : `+${phone}`);
  const hit = p ? (idx ?? (await loadPhoneIndex())).get(p) : undefined;
  return { salesContactId: hit?.id ?? null, linkedCustomerId: hit?.customerId ?? null };
}

/** Einen Support-Chat (neu) zuordnen, außer er wurde von Hand zugeordnet. */
export async function linkSupportConversation(conversationId: string, now = new Date(), idx?: PhoneIndex): Promise<void> {
  const c = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { customerId: true, contactPhone: true, contactLinkManual: true } });
  if (!c || c.customerId !== SUPPORT_CUSTOMER_ID || c.contactLinkManual) return;
  const m = await matchSupportPhone(c.contactPhone, idx);
  await prisma.conversation.update({ where: { id: conversationId }, data: { ...m, contactMatchedAt: now } });
}

/** Support-Chats ohne frische Zuordnung nachziehen (beim Öffnen des Postfachs, höchstens `limit`). */
export async function refreshSupportLinks(now = new Date(), limit = 100): Promise<number> {
  const stale = await prisma.conversation.findMany({
    where: {
      customerId: SUPPORT_CUSTOMER_ID,
      contactLinkManual: false,
      OR: [{ contactMatchedAt: null }, { contactMatchedAt: { lt: new Date(now.getTime() - 6 * 60 * 60 * 1000) } }],
    },
    orderBy: { lastMessageAt: "desc" },
    take: limit,
    select: { id: true },
  });
  if (!stale.length) return 0;
  const idx = await loadPhoneIndex();
  for (const s of stale) await linkSupportConversation(s.id, now, idx);
  return stale.length;
}

// ─── Von Hand zuordnen ──────────────────────────────────────────────────

export type AssignCandidate = { type: "contact" | "customer"; id: string; label: string };

/** Kandidaten für die Suche (E-Mail, Name, Firma bzw. Kundenname). */
export async function findAssignCandidates(query: string): Promise<AssignCandidate[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const [contacts, customers] = await Promise.all([
    prisma.salesContact.findMany({
      where: { OR: [{ email: { equals: q.toLowerCase() } }, { name: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }] },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, name: true, email: true, stage: true, customerStage: true, customerId: true },
    }),
    prisma.customer.findMany({
      where: { name: { contains: q, mode: "insensitive" }, id: { not: SUPPORT_CUSTOMER_ID }, isTest: false },
      take: 4,
      select: { id: true, name: true },
    }),
  ]);
  const linked = new Set(contacts.map((c) => c.customerId).filter(Boolean));
  return [
    ...customers.filter((c) => !linked.has(c.id)).map((c) => ({ type: "customer" as const, id: c.id, label: `${c.name} (Kunde)` })),
    ...contacts.map((c) => ({ type: "contact" as const, id: c.id, label: `${c.name}, ${c.email} (${contactIsCustomer(c) ? "Kunde" : "Interessent"})` })),
  ];
}

/** Zuordnung setzen (Vertriebskontakt oder Kunde) bzw. mit null lösen (dann wieder automatisch). */
export async function assignSupportConversation(conversationId: string, target: { type: "contact" | "customer"; id: string } | null, now = new Date()): Promise<boolean> {
  const c = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { customerId: true } });
  if (!c || c.customerId !== SUPPORT_CUSTOMER_ID) return false;
  if (!target) {
    await prisma.conversation.update({ where: { id: conversationId }, data: { contactLinkManual: false, contactMatchedAt: null, salesContactId: null, linkedCustomerId: null } });
    await linkSupportConversation(conversationId, now);
    return true;
  }
  if (target.type === "contact") {
    const sc = await prisma.salesContact.findUnique({ where: { id: target.id }, select: { id: true, customerId: true } });
    if (!sc) return false;
    await prisma.conversation.update({ where: { id: conversationId }, data: { salesContactId: sc.id, linkedCustomerId: sc.customerId, contactLinkManual: true, contactMatchedAt: now } });
    return true;
  }
  const cust = await prisma.customer.findUnique({ where: { id: target.id }, select: { id: true, salesContact: { select: { id: true } } } });
  if (!cust) return false;
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { linkedCustomerId: cust.id, salesContactId: cust.salesContact?.id ?? null, contactLinkManual: true, contactMatchedAt: now },
  });
  return true;
}
