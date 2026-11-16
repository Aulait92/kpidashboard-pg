import { kontaktSucheWhere } from "@/lib/vertrieb/suche";
import { prisma } from "@/lib/prisma";
import { STAGES } from "@/lib/vertrieb/crm";
import { LI_STATUSES } from "@/lib/vertrieb/linkedin";
import type { Prisma } from "@/generated/prisma/client";
import type { SalesStage as Stage } from "@/generated/prisma/enums";

// Kontaktliste des Vertriebs (Suche, Filter, Seiten): gemeinsam für /admin/vertrieb/kontakte und
// /admin/neu/vertrieb/kontakte, damit beide Oberflächen dieselben Treffer zeigen.

export const KONTAKTE_PRO_SEITE = 50;

export const MAIL_FILTERS: Record<string, { label: string; where: Prisma.SalesContactWhereInput }> = {
  sent: { label: "Cold Mail erhalten", where: { campaigns: { some: { sentAt: { not: null } } } } },
  none: { label: "Keine Cold Mail", where: { campaigns: { none: { sentAt: { not: null } } } } },
  opened: { label: "Geöffnet", where: { campaigns: { some: { openCount: { gt: 0 } } } } },
  replied: { label: "Geantwortet", where: { campaigns: { some: { replyCount: { gt: 0 } } } } },
  bounced: { label: "Bounced", where: { campaigns: { some: { bounced: true } } } },
};

export type KontakteFilter = { q?: string; stage?: Stage; mail?: string; plz?: string; li?: string; page: number };

/** Filter aus den Suchparametern (ungültige Werte fallen weg). Seite: `page` (alt) oder `seite` (neu). */
export function kontakteFilter(sp: Record<string, string | undefined>): KontakteFilter {
  return {
    q: sp.q?.trim() || undefined,
    stage: STAGES.some((s) => s.id === sp.stage) ? (sp.stage as Stage) : undefined,
    mail: sp.mail && MAIL_FILTERS[sp.mail] ? sp.mail : undefined,
    plz: sp.plz?.trim() || undefined,
    li: sp.li === "none" || LI_STATUSES.some((x) => x.id === sp.li) ? sp.li : undefined,
    page: Math.max(1, Number(sp.page ?? sp.seite) || 1),
  };
}

export function kontakteWhere({ q, stage, mail, plz, li }: KontakteFilter): Prisma.SalesContactWhereInput {
  return {
    AND: [
      // Umlaut-tolerant (Dröge = Droege), auch E-Mail, weitere Adressen, Firma, Ort, Telefon (lib/vertrieb/suche.ts)
      q ? kontaktSucheWhere(q) : {},
      stage ? { stage } : {},
      mail ? MAIL_FILTERS[mail].where : {},
      plz ? { zip: { startsWith: plz } } : {},
      li ? { linkedinStatus: li === "none" ? null : li } : {},
    ],
  };
}

/** Eine Seite der Kontaktliste mit Gesamtzahl. */
export async function ladeKontakte(f: KontakteFilter) {
  const where = kontakteWhere(f);
  const [total, contacts] = await Promise.all([
    prisma.salesContact.count({ where }),
    prisma.salesContact.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      skip: (f.page - 1) * KONTAKTE_PRO_SEITE,
      take: KONTAKTE_PRO_SEITE,
      select: {
        id: true, name: true, leaderNames: true, city: true, linkedinStatus: true, zip: true, phone: true, stage: true, ratingValue: true, ratingCount: true, lastContactAt: true,
        campaigns: { select: { sentAt: true, openCount: true, replyCount: true, bounced: true } },
        tasks: { where: { doneAt: null }, orderBy: { dueAt: "asc" }, take: 1, select: { dueAt: true, title: true } },
      },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / KONTAKTE_PRO_SEITE));
  const filtered = !!(f.q || f.stage || f.mail || f.plz || f.li);
  return { total, contacts, pages, filtered };
}

/** Cold-Mail-Stand eines Kontakts aus seinen Kampagnen (Liste, Pipeline). */
export function coldMailStand(campaigns: { sentAt: Date | null; openCount?: number; replyCount: number; bounced?: boolean }[]) {
  return {
    sent: campaigns.filter((x) => x.sentAt).length,
    replied: campaigns.some((x) => x.replyCount > 0),
    opened: campaigns.some((x) => (x.openCount ?? 0) > 0),
    bounced: campaigns.some((x) => !!x.bounced),
  };
}
