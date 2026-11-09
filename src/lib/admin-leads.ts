// Lead-Übersicht im Admin (ersetzt die Airtable-Ansicht „Leads“): Filter,
// Summen und CSV-Export, z. B. für die manuelle Abrechnung pro Kunde/Monat.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type LeadFilter = {
  q?: string;
  kunde?: string;
  produkt?: string;
  status?: string; // offen | storno | abschluss
  von?: string; // YYYY-MM-DD
  bis?: string; // YYYY-MM-DD
  monat?: string; // YYYY-MM
};

const TZ = "Europe/Berlin";

function berlinMidnight(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const off = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" })
      .formatToParts(new Date(guess))
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") || 0,
  );
  return new Date(guess - off * 3600 * 1000);
}

export function filterRange(f: LeadFilter): { from: Date | null; to: Date | null } {
  if (f.monat && /^\d{4}-\d{2}$/.test(f.monat)) {
    const [y, m] = f.monat.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    return { from: berlinMidnight(`${f.monat}-01`), to: berlinMidnight(next) };
  }
  const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  return {
    from: ok(f.von) ? berlinMidnight(f.von!) : null,
    to: ok(f.bis) ? new Date(berlinMidnight(f.bis!).getTime() + 24 * 3600 * 1000) : null,
  };
}

export function leadWhere(f: LeadFilter): Prisma.LeadWhereInput {
  const { from, to } = filterRange(f);
  const q = f.q?.trim();
  const digits = q?.replace(/\D/g, "") ?? "";
  return {
    ...(f.kunde ? { customerId: f.kunde } : {}),
    ...(f.produkt ? { source: f.produkt } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
    ...(f.status === "storno"
      ? { status: { startsWith: "Storno", mode: "insensitive" as const } }
      : f.status === "abschluss"
        ? { closedAt: { not: null } }
        : f.status === "offen"
          ? { closedAt: null, NOT: { status: { startsWith: "Storno", mode: "insensitive" as const } } }
          : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            ...(digits.length >= 4 ? [{ phone: { contains: digits.replace(/^0/, "") } }] : []),
          ],
        }
      : {}),
  };
}

export const leadSelect = {
  id: true,
  createdAt: true,
  name: true,
  phone: true,
  email: true,
  source: true,
  status: true,
  adChannel: true,
  formData: true,
  outreachStatus: true,
  contactAttempts: true,
  closedAt: true,
  closeValue: true,
  airtableId: true,
  externalId: true,
  customer: { select: { id: true, name: true } },
  revenues: { select: { amount: true, cancelled: true } },
  appointments: { where: { status: "booked" }, select: { startsAt: true }, take: 1, orderBy: { startsAt: "desc" as const } },
} satisfies Prisma.LeadSelect;

export type AdminLead = Prisma.LeadGetPayload<{ select: typeof leadSelect }>;

export const isStorno = (s: string | null) => !!s && s.toLowerCase().startsWith("storno");
export const priceOf = (l: AdminLead) => l.revenues.reduce((a, r) => a + Number(r.amount), 0);
