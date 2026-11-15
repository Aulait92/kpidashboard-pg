// Tatsächliche Stornoquote aus gekündigten Verträgen (Ole, 14.11.2026): gekündigte Verträge der letzten
// 12 Monate / Bestand im Jahresmittel (lib/provision.realStornoQuote), erst ab 20 Verträgen. Je Kunde
// und je Sparte; für den Admin auch über alle Kunden zusammengefasst. Gezählt werden Verträge von Leads
// mit Abschluss; Altfälle (storniert ohne Grund, vor dem 14.11.2026) zählen wie in den Zahlen nicht.

import { prisma } from "@/lib/prisma";
import { CLOSED_STATUS } from "@/lib/products";
import { contractLabel, realStornoQuote, type RealStorno, type StornoContract } from "@/lib/provision";

export type StornoRow = { key: string; label: string; real: RealStorno };
export type StornoStats = { overall: RealStorno; bySparte: StornoRow[] };

type Row = StornoContract & { sparte: string; productName?: string | null; customerId: string };

/** Quote gesamt und je Sparte (Sparten nach Anzahl Verträge). */
export function stornoStatsOf(rows: Row[], now: Date): StornoStats {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const label = contractLabel(r);
    groups.set(label, [...(groups.get(label) ?? []), r]);
  }
  const bySparte = [...groups.entries()]
    .map(([label, list]) => ({ key: label, label, real: realStornoQuote(list, now) }))
    .sort((a, b) => b.real.contracts - a.real.contracts);
  return { overall: realStornoQuote(rows, now), bySparte };
}

async function loadRows(where: { customerId?: string; customer?: { isTest: boolean } }): Promise<Row[]> {
  const rows = await prisma.leadContract.findMany({
    where: { ...where, lead: { status: CLOSED_STATUS } },
    select: { customerId: true, sparte: true, productName: true, signedAt: true, status: true, cancelledAt: true, cancelReason: true },
  });
  return rows
    .filter((r) => !(r.status === "storniert" && !r.cancelReason))
    .map((r) => ({ customerId: r.customerId, sparte: r.sparte, productName: r.productName, signedAt: r.signedAt, cancelledAt: r.status === "storniert" ? (r.cancelledAt ?? r.signedAt) : null }));
}

/** Stornoquote eines Kunden (Kundenakte im Admin). */
export async function customerStornoStats(customerId: string, now = new Date()): Promise<StornoStats> {
  return stornoStatsOf(await loadRows({ customerId }), now);
}

/** Über alle Kunden: gesamt, je Sparte und je Kunde (nur Kunden mit Verträgen). */
export async function allStornoStats(now = new Date()): Promise<StornoStats & { byCustomer: StornoRow[] }> {
  // Testkunden zählen nicht (Ole, 15.11.2026)
  const rows = await loadRows({ customer: { isTest: false } });
  const stats = stornoStatsOf(rows, now);
  const byId = new Map<string, Row[]>();
  for (const r of rows) byId.set(r.customerId, [...(byId.get(r.customerId) ?? []), r]);
  const names = await prisma.customer.findMany({ where: { id: { in: [...byId.keys()] } }, select: { id: true, name: true } });
  const nameOf = new Map(names.map((c) => [c.id, c.name]));
  const byCustomer = [...byId.entries()]
    .map(([id, list]) => ({ key: id, label: nameOf.get(id) ?? id, real: realStornoQuote(list, now) }))
    .sort((a, b) => b.real.contracts - a.real.contracts);
  return { ...stats, byCustomer };
}
