// Verlustgründe laden (Regeln in lib/verlustgruende.ts). Zeitraum nach dem Tag, an dem der Lead verloren ging
// (Lead.lostAt, bei alten Leads ohne Datum die letzte Statusänderung). Testleads zählen nicht.
// Vergleichswerte anderer Kunden nur als anonymer Schnitt (90 Tage, ab 5 Kunden), nie einzeln.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { LOST_STATUSES } from "@/lib/lead-lost";
import { previousRange } from "@/lib/date-ranges";
import { displayProduct } from "@/lib/products";
import {
  kampagnenHinweis,
  schnittAllerKunden,
  verlustTipps,
  verlustVergleich,
  verlustVerteilung,
  type VerlustKey,
  type VerlustTipp,
  type VerlustVergleichZeile,
  type VerlustVerteilung,
  type VerlustZeile,
} from "@/lib/verlustgruende";

const DAY = 24 * 60 * 60 * 1000;

export function verlorenImZeitraum(from: Date, to: Date): Prisma.LeadWhereInput {
  return {
    status: { in: [...LOST_STATUSES] },
    isTest: false,
    OR: [{ lostAt: { gte: from, lte: to } }, { lostAt: null, statusChangedAt: { gte: from, lte: to } }],
  };
}

const SELECT = { status: true, lostReason: true, disqualifyReason: true, reached: true, callAttempts: true, lostEarly: true, source: true, assignedUserId: true, customerId: true } as const;

type Row = VerlustZeile & { source: string | null; assignedUserId: string | null; customerId: string };

export type VerlustFilter = { produkt?: string | null; berater?: string | null };

async function zeilen(where: Prisma.LeadWhereInput): Promise<Row[]> {
  return prisma.lead.findMany({ where, select: SELECT });
}

const filtern = (rows: Row[], f: VerlustFilter) =>
  rows.filter((r) => (!f.produkt || r.source === f.produkt) && (!f.berater || (f.berater === "ohne" ? !r.assignedUserId : r.assignedUserId === f.berater)));

let avgCache: { at: number; value: Partial<Record<VerlustKey, number>> | null } | null = null;

/** Anonymer Schnitt aller Kunden (90 Tage), eine Stunde zwischengespeichert. */
export async function schnittVerluste(now = new Date()): Promise<Partial<Record<VerlustKey, number>> | null> {
  if (avgCache && now.getTime() - avgCache.at < 60 * 60 * 1000) return avgCache.value;
  const rows = await zeilen({ ...verlorenImZeitraum(new Date(now.getTime() - 90 * DAY), now), customer: { isTest: false } }).catch(() => null);
  if (!rows) return null;
  const by = new Map<string, Row[]>();
  for (const r of rows) by.set(r.customerId, [...(by.get(r.customerId) ?? []), r]);
  const value = schnittAllerKunden(by);
  avgCache = { at: now.getTime(), value };
  return value;
}

export type VerlustKarteDaten = {
  verteilung: VerlustVerteilung;
  vergleich: VerlustVergleichZeile[];
  prevTotal: number;
  tipps: VerlustTipp[];
  /** Filter-Auswahl (nur, wenn es mehr als eine Möglichkeit gibt). */
  produkte: { value: string; label: string }[];
  berater: { value: string; label: string }[];
};

/** Daten der Karte „Warum Leads verloren gehen“ für einen Kunden und Zeitraum. */
export async function verlustKarte(customerId: string, range: { from: Date; to: Date }, filter: VerlustFilter = {}, now = new Date()): Promise<VerlustKarteDaten> {
  const prev = previousRange(range);
  const [rowsAll, prevAll, avg, users] = await Promise.all([
    zeilen({ customerId, ...verlorenImZeitraum(range.from, range.to) }),
    zeilen({ customerId, ...verlorenImZeitraum(prev.from, prev.to) }),
    schnittVerluste(now),
    prisma.user.findMany({ where: { customerId, role: "BUYER" }, select: { id: true, displayName: true, email: true } }),
  ]);
  const rows = filtern(rowsAll, filter);
  const verteilung = verlustVerteilung(rows);
  const prevV = verlustVerteilung(filtern(prevAll, filter));
  const vergleich = verlustVergleich(verteilung, prevV.total ? prevV : null, avg);
  const quellen = [...new Set(rowsAll.map((r) => r.source).filter((s): s is string => !!s))];
  const beraterIds = [...new Set(rowsAll.map((r) => r.assignedUserId ?? "ohne"))];
  return {
    verteilung,
    vergleich,
    prevTotal: prevV.total,
    tipps: verlustTipps(vergleich, verteilung),
    produkte: quellen.length > 1 || filter.produkt ? quellen.map((s) => ({ value: s, label: displayProduct(s) })) : [],
    berater:
      beraterIds.length > 1 || filter.berater
        ? beraterIds.map((id) => {
            const u = users.find((x) => x.id === id);
            return { value: id, label: id === "ohne" ? "Nicht zugeteilt" : (u?.displayName ?? u?.email ?? "Unbekannt") };
          })
        : [],
  };
}

/** Die zwei häufigsten Gründe eines Zeitraums (Monatsbericht), ohne „Ohne Grund“. */
export async function haeufigsteVerluste(customerId: string, range: { from: Date; to: Date }, n = 2): Promise<{ total: number; gruende: VerlustVerteilung["gruende"] }> {
  const v = verlustVerteilung(await zeilen({ customerId, ...verlorenImZeitraum(range.from, range.to) }));
  return { total: v.total, gruende: v.gruende.filter((g) => g.key !== "ohne").slice(0, n) };
}

export type VerlustAdminZeile = { customerId: string; name: string; verteilung: VerlustVerteilung; kampagne: ReturnType<typeof kampagnenHinweis> };

/** Admin: Auswertung je Kunde und über alle Kunden (Zeitraum, Standard 90 Tage). */
export async function verlustAdmin(range: { from: Date; to: Date }, customerId?: string): Promise<{ gesamt: VerlustVerteilung; kunden: VerlustAdminZeile[] }> {
  const rows = await zeilen({ ...(customerId ? { customerId } : { customer: { isTest: false } }), ...verlorenImZeitraum(range.from, range.to) });
  const by = new Map<string, Row[]>();
  for (const r of rows) by.set(r.customerId, [...(by.get(r.customerId) ?? []), r]);
  const names = await prisma.customer.findMany({ where: { id: { in: [...by.keys()] } }, select: { id: true, name: true } });
  const kunden = [...by.entries()]
    .map(([id, rs]) => {
      const v = verlustVerteilung(rs);
      return { customerId: id, name: names.find((c) => c.id === id)?.name ?? id, verteilung: v, kampagne: kampagnenHinweis(v) };
    })
    .sort((a, b) => b.verteilung.total - a.verteilung.total);
  return { gesamt: verlustVerteilung(rows), kunden };
}
