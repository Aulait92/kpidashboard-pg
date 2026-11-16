// Schnellsuche im Kundenbereich (Strg+K / Cmd+K, „Kontakt suchen“):
// Kontakte (Leads), Bestandskunden (nur mit Modul, nur Inhaber) und WhatsApp-Chats.
// Rechte: ausschließlich über leadScope/conversationScope (lib/team.ts), Berater
// finden also nur ihre eigenen Kontakte und Chats.

import { prisma } from "@/lib/prisma";
import { formatPhone } from "@/lib/format";
import { statusLabel } from "@/lib/products";
import { conversationScope, leadScope, type TeamCtx } from "@/lib/team";
import { phoneDigitsWhere, phoneQuery } from "@/lib/telefonsuche";
import { hasWhatsAppInbox } from "@/lib/whatsapp/access";

export type BuyerSearchHit = {
  kind: "kontakt" | "bestand" | "chat";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export const SEARCH_MIN_CHARS = 2;

/**
 * Ziffernkern einer eingegebenen Telefonnummer für die Suche. Gespeichert wird
 * normalisiert ohne „+“ (4915112345678, lib/whatsapp/phone.ts), eingegeben wird
 * „0151 123…“, „+49 151 …“ oder „0049151…“: Ländervorwahl 49 bzw. führende Null
 * fallen weg, damit alle Schreibweisen dieselben Treffer liefern.
 * null = keine Telefonsuche (Buchstaben drin oder zu wenige Ziffern).
 * Seit 16.11.2026 sucht die Telefonsuche über lib/telefonsuche.ts (Spalten phoneDigits/phoneDigitsRev);
 * hier nur noch: Sieht die Eingabe nach einer Nummer aus (Bestandskunden-Nummer externalNo)?
 */
export function phoneSearchCore(q: string): string | null {
  const t = q.trim();
  if (/[\p{L}@]/u.test(t)) return null;
  let d = t.replace(/\D/g, "");
  if (d.length < 4) return null;
  if (t.startsWith("+")) {
    if (d.startsWith("49")) d = d.slice(2);
  } else if (d.startsWith("0049")) d = d.slice(4);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  else if (d.startsWith("49") && d.length >= 11) d = d.slice(2);
  return d.length >= 3 ? d : null;
}

const fullName = (first: string | null, last: string | null) => [first, last].filter(Boolean).join(" ").trim();

/**
 * Sucht für einen Login. `newUi` steuert nur das Linkziel (Kontakt-Seite statt Lead-Fenster).
 */
export async function searchBuyer(ctx: TeamCtx, rawQ: string, opts: { newUi: boolean }): Promise<BuyerSearchHit[]> {
  const q = rawQ.trim().slice(0, 80);
  if (q.length < SEARCH_MIN_CHARS) return [];
  const text = { contains: q, mode: "insensitive" as const };
  // Telefonnummer in jeder Schreibweise, auch nur die Endziffern (lib/telefonsuche.ts, Spalten mit Index)
  const pq = phoneQuery(q);
  const phoneOr = pq ? [phoneDigitsWhere(pq)] : [];

  const owner = ctx.teamRole === "owner";
  const [customer, chatsOn] = await Promise.all([
    owner ? prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { existingCustomersEnabled: true } }) : null,
    hasWhatsAppInbox(ctx.customerId),
  ]);
  const bestandOn = owner && !!customer?.existingCustomersEnabled;

  const [leads, existing, chats] = await Promise.all([
    prisma.lead.findMany({
      where: { ...leadScope(ctx), erasedAt: null, OR: [{ name: text }, { email: text }, ...phoneOr] },
      take: 8,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, phone: true, email: true, status: true },
    }),
    bestandOn
      ? prisma.existingCustomer.findMany({
          where: {
            customerId: ctx.customerId,
            OR: [{ lastName: text }, { firstName: text }, { company: text }, { email: text }, ...phoneOr, ...(phoneSearchCore(q) ? [{ externalNo: { contains: q } }] : [])],
          },
          take: 5,
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          select: { id: true, firstName: true, lastName: true, company: true, phone: true, email: true, city: true },
        })
      : [],
    chatsOn
      ? prisma.conversation.findMany({
          where: { ...conversationScope(ctx), OR: [{ contactName: text }, ...phoneOr] },
          take: 4,
          orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
          select: { id: true, contactName: true, contactPhone: true },
        })
      : [],
  ]);

  const detail = opts.newUi ? "/buyer/kontakte/" : "/buyer/leads/";
  return [
    ...leads.map((l) => ({
      kind: "kontakt" as const,
      id: l.id,
      title: l.name?.trim() || formatPhone(l.phone) || l.email || "Kontakt ohne Name",
      subtitle: [statusLabel(l.status), formatPhone(l.phone), l.email].filter(Boolean).join(" · ") || "Kontakt",
      href: `${detail}${l.id}`,
    })),
    ...existing.map((e) => {
      const name = fullName(e.firstName, e.lastName) || e.company || e.email || "Bestandskunde";
      // Die Bestandsliste sucht nach Nachname, Vorname oder E-Mail.
      const listQ = e.lastName || e.firstName || e.email || e.company || "";
      return {
        kind: "bestand" as const,
        id: e.id,
        title: name,
        subtitle: ["Bestandskunde", formatPhone(e.phone), e.city].filter(Boolean).join(" · "),
        href: `/buyer/bestand?q=${encodeURIComponent(listQ)}`,
      };
    }),
    ...chats.map((c) => ({
      kind: "chat" as const,
      id: c.id,
      title: c.contactName?.trim() || formatPhone(c.contactPhone),
      subtitle: ["WhatsApp-Chat", c.contactName ? formatPhone(c.contactPhone) : null].filter(Boolean).join(" · "),
      href: `/buyer/chats?c=${c.id}`,
    })),
  ];
}
