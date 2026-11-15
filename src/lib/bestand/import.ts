// Bestandskunden-Import (Excel/CSV aus dem Versicherer-System).
// Spalten werden erkannt und vom Vertreter bestätigt. Übernommen werden nur
// bekannte Felder – alle anderen Spalten (auch Gesundheitsangaben) verfallen.
// Felder, Parser und Gruppierung: lib/bestand/rows.ts (auch für die Vorschau im Browser).

import { refreshBestandSummary } from "@/lib/vertraege";
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
  /** Auf Kunden der Sperrliste übertragene Abmeldungen (Abmeldung gilt auch nach erneutem Import) */
  suppressed: number;
  /** Kunden mit E-Mail und Nachweis zum Widerspruchshinweis nach diesem Import (Datei oder Bestätigung) */
  hinweis: number;
  /** Kunden mit E-Mail ohne Nachweis und ohne Einwilligung: per E-Mail nur nach einer Einwilligung */
  ohneNachweis: number;
};

/**
 * Einwilligungen beim Import: Werte aus der Datei (Spalten E-Mail- bzw. WhatsApp-Einwilligung) gelten immer.
 * Ohne Wert bleibt der bisherige Stand, außer der Vermittler bestätigt ausdrücklich „alle Kunden dieser Liste
 * haben eingewilligt“ (je Kanal, z. B. laut Versicherer). Ein „nein“ wird dadurch nie überschrieben.
 */
export type BulkConsent = { email?: boolean; whatsapp?: boolean };

/**
 * Pauschale Bestätigung je Import (§ 7 Abs. 3 UWG): Alle Kunden dieser Liste wurden bei der Erhebung ihrer E-Mail-
 * Adresse auf ihr Widerspruchsrecht hingewiesen. text = Wortlaut bzw. Quelle des Hinweises (Pflicht), at = seit wann
 * (optional). Angaben aus der Datei gehen vor, ein „nein“ wird nie überschrieben.
 */
export type BulkHinweis = { text: string; at: Date | null };

/** Wortlaut der pauschalen Bestätigung (wird so protokolliert). */
export function hinweisStatement(h: BulkHinweis, count: number): string {
  const since = h.at ? ` (Hinweis gegeben seit ${h.at.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })})` : "";
  return `Vermittler bestätigt beim Import: Alle Kunden dieser Liste wurden bei der Erhebung ihrer E-Mail-Adresse klar darauf hingewiesen, dass sie der Verwendung für Werbung jederzeit widersprechen können${since}. Wortlaut bzw. Quelle: „${h.text}“. Übernommen für ${count} Kunden ohne eigene Angabe.`;
}

/**
 * Zeilen übernehmen. Eine Zeile je Kunde oder je Vertrag – Kunden werden zusammengeführt.
 * importId: Import-Lauf (ExistingCustomerImport), wird nur bei neu angelegten Kunden gesetzt.
 */
export async function importRows(
  customerId: string,
  rows: Row[],
  m: Mapping,
  now = new Date(),
  opts: { importId?: string; consent?: BulkConsent; hinweis?: BulkHinweis | null; actorUserId?: string | null; fileName?: string | null } = {},
): Promise<ImportResult> {
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
    suppressed: 0,
    hinweis: 0,
    ohneNachweis: 0,
  };
  const bulk = opts.consent ?? {};
  const consentNote = `Einwilligung laut Versicherer (Import ${now.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })})`;
  const savedIds: string[] = [];
  const bulkCount = { email: 0, whatsapp: 0 };
  const hinweisCount = { file: 0, fileNein: 0, bulk: 0 };
  const bulkHinweis = opts.hinweis?.text.trim() ? { text: opts.hinweis.text.trim().slice(0, 500), at: opts.hinweis.at } : null;
  for (const a of g.groups.values()) {
    // Stornierte und ruhende Verträge zählen nicht für Sparten (Lücken), Ablauf und Beitragsvolumen
    const active = a.contracts.filter((c) => isActiveContract(c.status));
    const lines = [...new Set(active.map((c) => c.line))].sort();
    const upcoming = active.map((c) => c.renewalDate).filter((d): d is Date => !!d && d > now).sort((x, y) => +x - +y)[0] ?? null;
    const premiums = active.map((c) => c.annualPremium).filter((p): p is number => p != null);
    const premiumTotal = premiums.length ? Math.round(premiums.reduce((s, p) => s + p, 0) * 100) / 100 : null;
    const byContact = () =>
      a.phone || a.email
        ? prisma.existingCustomer.findFirst({
            where: { customerId, ...(a.externalNo ? { externalNo: null } : {}), OR: [...(a.phone ? [{ phone: a.phone }] : []), ...(a.email ? [{ email: a.email }] : [])] },
            select: { id: true },
          })
        : null;
    // Mit Kundennummer: sonst gleicher Kunde ohne Nummer (z. B. aus einem Abschluss in der App übernommen), keine Doppelung
    const existing = a.externalNo
      ? ((await prisma.existingCustomer.findUnique({ where: { customerId_externalNo: { customerId, externalNo: a.externalNo } }, select: { id: true } })) ?? (await byContact()))
      : await byContact();
    const before = existing
      ? await prisma.existingCustomer.findUnique({ where: { id: existing.id }, select: { emailConsent: true, whatsappConsent: true, widerspruchHinweis: true } })
      : null;
    const consentData: Prisma.ExistingCustomerUpdateInput = {};
    for (const ch of ["email", "whatsapp"] as const) {
      const fileValue = ch === "email" ? a.emailConsent : a.whatsappConsent;
      const fileAt = ch === "email" ? a.emailConsentAt : a.whatsappConsentAt;
      const current = ch === "email" ? before?.emailConsent : before?.whatsappConsent;
      const set = (value: "ja" | "nein", at: Date | null, source: string) =>
        Object.assign(consentData, ch === "email" ? { emailConsent: value, emailConsentAt: at, emailConsentSource: source } : { whatsappConsent: value, whatsappConsentAt: at, whatsappConsentSource: source });
      if (fileValue) set(fileValue, fileValue === "ja" ? (fileAt ?? now) : now, "import");
      else if (bulk[ch] && current !== "nein" && current !== "ja") {
        set("ja", now, "versicherer_pauschal");
        bulkCount[ch]++;
      }
    }
    // Nachweis zum Widerspruchshinweis: Datei vor pauschaler Bestätigung, „nein“ wird nie überschrieben
    const hinweisData: Prisma.ExistingCustomerUpdateInput = {};
    if (a.widerspruchHinweis) {
      Object.assign(hinweisData, {
        widerspruchHinweis: a.widerspruchHinweis,
        widerspruchHinweisAt: a.widerspruchHinweis === "ja" ? (a.widerspruchHinweisAt ?? now) : now,
        widerspruchHinweisSource: "import",
        widerspruchHinweisText: `Spalte „${m.widerspruchHinweis ?? ""}“${opts.fileName ? ` der Datei „${opts.fileName}“` : " der Importdatei"}`.slice(0, 500),
      });
      if (a.widerspruchHinweis === "ja") hinweisCount.file++;
      else hinweisCount.fileNein++;
    } else if (bulkHinweis && a.email && before?.widerspruchHinweis !== "nein" && before?.widerspruchHinweis !== "ja") {
      Object.assign(hinweisData, { widerspruchHinweis: "ja", widerspruchHinweisAt: bulkHinweis.at ?? now, widerspruchHinweisSource: "import_pauschal", widerspruchHinweisText: bulkHinweis.text });
      hinweisCount.bulk++;
    }
    const data = {
      externalNo: a.externalNo, salutation: a.salutation, firstName: a.firstName, lastName: a.lastName, company: a.company, phone: a.phone, email: a.email,
      birthday: a.birthday, street: a.street, zip: a.zip, city: a.city, lines, nextRenewal: upcoming, premiumTotal,
      // Altangabe consentAt nur noch bei ausdrücklicher Bestätigung (maßgeblich sind die Felder je Kanal)
      ...(bulk.email || bulk.whatsapp ? { consentAt: now, consentNote } : {}),
      ...consentData,
      ...hinweisData,
    };
    const saved = existing
      ? await prisma.existingCustomer.update({ where: { id: existing.id }, data })
      : await prisma.existingCustomer.create({ data: { ...(data as Prisma.ExistingCustomerUncheckedCreateInput), customerId, importId: opts.importId ?? null } });
    savedIds.push(saved.id);
    if (existing) res.updated++;
    else res.created++;
    if (a.phone) res.withPhone++;
    if (a.contracts.length) {
      // Verträge eines Kunden werden bei jedem Import ersetzt (Vertragsnummer wird mitgespeichert). Verträge aus der
      // App (Abschlüsse, leadContractId) bleiben, außer der Import liefert denselben Vertrag (gleiche Vertragsnummer).
      const importedNos = a.contracts.map((c) => c.contractNo).filter((x): x is string => !!x);
      await prisma.$transaction([
        prisma.existingContract.deleteMany({ where: { existingCustomerId: saved.id, OR: [{ leadContractId: null }, ...(importedNos.length ? [{ contractNo: { in: importedNos } }] : [])] } }),
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
      if (await prisma.existingContract.count({ where: { existingCustomerId: saved.id, leadContractId: { not: null } } })) await refreshBestandSummary(saved.id);
    }
  }
  // Abmeldungen gelten dauerhaft: Sperrliste auf alle übernommenen Kunden anwenden (auch neu angelegte Doppel)
  const { applySuppression, logConsent } = await import("@/lib/bestand/einwilligung-server");
  res.suppressed = await applySuppression(customerId, savedIds, now);
  // Nachweis zum Widerspruchshinweis protokollieren (Datei bzw. pauschale Bestätigung mit Wortlaut)
  if (hinweisCount.file || hinweisCount.fileNein) {
    await logConsent({
      customerId,
      existingCustomerId: null,
      channel: "email",
      action: "gesetzt",
      source: "widerspruchshinweis",
      text: `Nachweis zum Widerspruchshinweis aus der Importdatei (Spalte „${m.widerspruchHinweis ?? ""}“): ${hinweisCount.file} ja, ${hinweisCount.fileNein} nein.`,
      actorUserId: opts.actorUserId ?? null,
      at: now,
    });
  }
  if (bulkHinweis) {
    await logConsent({
      customerId,
      existingCustomerId: null,
      channel: "email",
      action: "gesetzt",
      source: "widerspruchshinweis",
      text: hinweisStatement(bulkHinweis, hinweisCount.bulk),
      actorUserId: opts.actorUserId ?? null,
      at: now,
    });
  }
  if (savedIds.length) {
    const [withProof, withoutProof] = await Promise.all([
      prisma.existingCustomer.count({ where: { id: { in: savedIds }, email: { not: null }, widerspruchHinweis: "ja" } }),
      prisma.existingCustomer.count({
        where: { id: { in: savedIds }, email: { not: null }, emailConsent: null, optOutAt: null, emailOptOutAt: null, OR: [{ widerspruchHinweis: null }, { widerspruchHinweis: "nein" }] },
      }),
    ]);
    res.hinweis = withProof;
    res.ohneNachweis = withoutProof;
  }
  // Pauschale Bestätigung einmal je Kanal protokollieren (Zeitpunkt, Text, Anzahl)
  for (const ch of ["email", "whatsapp"] as const) {
    if (!bulk[ch]) continue;
    await logConsent({
      customerId,
      existingCustomerId: null,
      channel: ch,
      action: "gesetzt",
      source: "import",
      text: `Vermittler bestätigt beim Import: Für alle Kunden dieser Liste liegt eine Einwilligung in Werbung per ${ch === "email" ? "E-Mail" : "WhatsApp"} vor (laut Versicherer). Übernommen für ${bulkCount[ch]} Kunden ohne eigene Angabe.`,
      actorUserId: opts.actorUserId ?? null,
      at: now,
    });
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
