// Bestandskunden-Import (Excel/CSV aus dem Versicherer-System).
// Spalten werden erkannt und vom Vertreter bestätigt. Übernommen werden nur
// bekannte Felder – alle anderen Spalten (auch Gesundheitsangaben) verfallen.
// Felder, Parser und Gruppierung: lib/bestand/rows.ts (auch für die Vorschau im Browser).

import Papa from "papaparse";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { groupRows, isActiveContract, mappingBlocker, type Mapping, type Row } from "@/lib/bestand/rows";

export {
  FIELDS,
  FIELD_GROUPS,
  detectMapping,
  displayName,
  groupRows,
  importWarning,
  isActiveContract,
  isBlockedColumn,
  mappingBlocker,
  mappingIssues,
  normalizeLine,
  normalizeSalutation,
  normalizeStatus,
  parseDate,
  parseMoney,
  type FieldKey,
  type Mapping,
  type Row,
} from "@/lib/bestand/rows";

/** Datei lesen: CSV (Komma/Semikolon) oder Excel (.xlsx). */
export async function parseFile(buf: Buffer, fileName: string): Promise<{ headers: string[]; rows: Row[] }> {
  if (/\.xlsx?$/i.test(fileName)) {
    const { default: readXlsx } = await import("read-excel-file/node");
    const sheet = (await readXlsx(buf)) as unknown[][];
    const headerIdx = sheet.findIndex((r) => r.filter((c) => c != null && String(c).trim()).length >= 2);
    if (headerIdx < 0) return { headers: [], rows: [] };
    const headers = sheet[headerIdx].map((h, i) => String(h ?? "").trim() || `Spalte ${i + 1}`);
    const rows = sheet.slice(headerIdx + 1).map((r) => Object.fromEntries(headers.map((h, i) => [h, cell(r[i])])));
    return { headers, rows: rows.filter((r) => Object.values(r).some(Boolean)) };
  }
  const text = buf.toString("utf8").replace(/^﻿/, "");
  const parsed = Papa.parse<Row>(text, { header: true, skipEmptyLines: true, delimitersToGuess: [";", ",", "\t"] });
  const headers = (parsed.meta.fields ?? []).map((h) => h.trim());
  return { headers, rows: parsed.data.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim(), String(v ?? "").trim()]))) };
}

function cell(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

export type ImportResult = {
  customers: number;
  created: number;
  updated: number;
  contracts: number;
  inactiveContracts: number;
  premiumTotal: number;
  skipped: number;
  withPhone: number;
};

/**
 * Zeilen übernehmen. Eine Zeile je Kunde oder je Vertrag – Kunden werden zusammengeführt.
 * importId: Import-Lauf (ExistingCustomerImport), wird nur bei neu angelegten Kunden gesetzt.
 */
export async function importRows(customerId: string, rows: Row[], m: Mapping, now = new Date(), opts: { importId?: string } = {}): Promise<ImportResult> {
  // Offensichtlich falsche Zuordnung (z. B. E-Mail-Spalte als Telefon) nie übernehmen
  const blocker = mappingBlocker(rows, m);
  if (blocker) throw new Error(blocker);
  const g = groupRows(rows, m);
  // Nie still 0 Kunden übernehmen (Ole, 14.11.2026: Vertriebsliste statt Kundenliste hochgeladen)
  if (rows.length && g.groups.size === 0) throw new Error("Mit dieser Zuordnung würde kein Kunde übernommen. Bitte Telefon, E-Mail oder Kundennummer zuordnen.");
  const res: ImportResult = {
    customers: g.groups.size,
    created: 0,
    updated: 0,
    contracts: 0,
    inactiveContracts: g.inactiveContracts,
    premiumTotal: g.premiumTotal,
    skipped: g.skipped,
    withPhone: 0,
  };
  const consentNote = `Einwilligung laut Versicherer (Import ${now.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })})`;
  for (const a of g.groups.values()) {
    // Stornierte und ruhende Verträge zählen nicht für Sparten (Lücken), Ablauf und Beitragsvolumen
    const active = a.contracts.filter((c) => isActiveContract(c.status));
    const lines = [...new Set(active.map((c) => c.line))].sort();
    const upcoming = active.map((c) => c.renewalDate).filter((d): d is Date => !!d && d > now).sort((x, y) => +x - +y)[0] ?? null;
    const premiums = active.map((c) => c.annualPremium).filter((p): p is number => p != null);
    const premiumTotal = premiums.length ? Math.round(premiums.reduce((s, p) => s + p, 0) * 100) / 100 : null;
    const existing = a.externalNo
      ? await prisma.existingCustomer.findUnique({ where: { customerId_externalNo: { customerId, externalNo: a.externalNo } }, select: { id: true } })
      : await prisma.existingCustomer.findFirst({
          where: { customerId, OR: [...(a.phone ? [{ phone: a.phone }] : []), ...(a.email ? [{ email: a.email }] : [])] },
          select: { id: true },
        });
    const data = {
      externalNo: a.externalNo, salutation: a.salutation, firstName: a.firstName, lastName: a.lastName, company: a.company, phone: a.phone, email: a.email,
      birthday: a.birthday, street: a.street, zip: a.zip, city: a.city, lines, nextRenewal: upcoming, premiumTotal, consentAt: now, consentNote,
    };
    const saved = existing
      ? await prisma.existingCustomer.update({ where: { id: existing.id }, data })
      : await prisma.existingCustomer.create({ data: { ...data, customerId, importId: opts.importId ?? null } });
    if (existing) res.updated++;
    else res.created++;
    if (a.phone) res.withPhone++;
    if (a.contracts.length) {
      // Verträge eines Kunden werden bei jedem Import ersetzt (Vertragsnummer wird mitgespeichert)
      await prisma.$transaction([
        prisma.existingContract.deleteMany({ where: { existingCustomerId: saved.id } }),
        prisma.existingContract.createMany({
          data: a.contracts.map((c) => ({
            existingCustomerId: saved.id,
            line: c.line,
            product: c.product.slice(0, 120) || null,
            startDate: c.startDate,
            renewalDate: c.renewalDate,
            annualPremium: c.annualPremium,
            contractNo: c.contractNo,
            insurer: c.insurer,
            status: c.status,
          })),
        }),
      ]);
      res.contracts += a.contracts.length;
    }
  }
  return res;
}

// ─── Import-Läufe und „Letzten Import rückgängig machen“ ──────────────────

/** Letzter Import-Lauf, der sich noch rückgängig machen lässt (null = keiner). */
export async function lastUndoableImport(customerId: string) {
  const run = await prisma.existingCustomerImport.findFirst({ where: { customerId, undoneAt: null }, orderBy: { createdAt: "desc" } });
  if (!run) return null;
  const removable = await prisma.existingCustomer.count({ where: undoWhere(customerId, run.id) });
  return { ...run, removable };
}

/** Löschbar sind nur Kunden dieses Laufs, die noch nicht angeschrieben und nicht gesperrt sind. */
function undoWhere(customerId: string, importId: string): Prisma.ExistingCustomerWhereInput {
  return {
    customerId,
    importId,
    optOutAt: null,
    lastCampaignAt: null,
    recipients: { none: { sentAt: { not: null } } },
    OR: [{ referralLink: null }, { referralLink: { lastSentAt: null } }],
  };
}

export type UndoResult = { ok: true; removed: number; kept: number; at: Date } | { ok: false; error: string };

/**
 * Letzten Import rückgängig machen: löscht die Bestandskunden, die dieser Lauf angelegt hat (mit ihren Verträgen).
 * Bereits angeschriebene oder gesperrte bleiben (Sperre „Stopp“ darf nicht verloren gehen). Aktualisierte Kunden
 * behalten den neuen Stand, weil der alte nicht gespeichert ist.
 */
export async function undoLastImport(customerId: string, userId: string | null, now = new Date()): Promise<UndoResult> {
  const run = await prisma.existingCustomerImport.findFirst({ where: { customerId, undoneAt: null }, orderBy: { createdAt: "desc" } });
  if (!run) return { ok: false, error: "Es gibt keinen Import, der sich rückgängig machen lässt." };
  const claimed = await prisma.existingCustomerImport.updateMany({ where: { id: run.id, undoneAt: null }, data: { undoneAt: now, undoneById: userId } });
  if (!claimed.count) return { ok: false, error: "Der Import wurde schon rückgängig gemacht." };
  const del = await prisma.existingCustomer.deleteMany({ where: undoWhere(customerId, run.id) });
  const kept = await prisma.existingCustomer.count({ where: { customerId, importId: run.id } });
  await prisma.existingCustomerImport.update({ where: { id: run.id }, data: { removed: del.count, kept } });
  return { ok: true, removed: del.count, kept, at: run.createdAt };
}
