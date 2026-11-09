import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { classifyLegacy } from "@/lib/vertrieb/legacy";
import type { Prisma } from "@/generated/prisma/client";

function parseGermanDate(s: string | undefined): Date | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return new Date(Date.UTC(y, +m[2] - 1, +m[1], 9));
  }
  const iso = new Date(s);
  return isNaN(iso.getTime()) ? null : iso;
}

function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? null : n;
}

export type ImportStats = { rows: number; created: number; updated: number; withStatus: number; tasks: number; skipped: number };

/**
 * Importiert die Agenturliste (CSV-Export aus Numbers/Excel).
 * Spalten werden über die Kopfzeile erkannt. Die Status-Spalte ist die
 * Spalte "status" – oder, wie in der Original-Liste, die erste Spalte ohne
 * Überschrift nach "description"; die zweite ohne Überschrift ist das Datum.
 * Bestehende Kontakte (gleiche E-Mail) werden aktualisiert, ihre Pipeline
 * aber nicht überschrieben.
 */
export async function importContactsCsv(text: string): Promise<ImportStats> {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: true });
  const [header, ...rows] = parsed.data;
  if (!header) throw new Error("Leere Datei");
  const h = header.map((x) => x.trim().toLowerCase());
  const idx = (n: string) => h.indexOf(n.toLowerCase());
  if (idx("email") < 0) throw new Error("Spalte 'email' nicht gefunden");

  let statusIdx = idx("status");
  let dateIdx = idx("datum");
  if (statusIdx < 0) {
    const blanks = h.map((x, i) => (x === "" ? i : -1)).filter((i) => i > idx("description"));
    statusIdx = blanks[0] ?? -1;
    if (dateIdx < 0) dateIdx = blanks[1] ?? -1;
  }

  const existing = new Map(
    (await prisma.salesContact.findMany({ select: { id: true, email: true, legacyStatus: true } })).map((c) => [c.email, c]),
  );
  const stats: ImportStats = { rows: rows.length, created: 0, updated: 0, withStatus: 0, tasks: 0, skipped: 0 };
  const now = new Date();
  const seen = new Set<string>();

  type Pending = { data: Prisma.SalesContactCreateInput; legacy?: { text: string; date: Date | null } };
  const toCreate: Pending[] = [];
  const toUpdate: { id: string; data: Prisma.SalesContactUpdateInput; legacy?: { text: string; date: Date | null } }[] = [];

  for (const r of rows) {
    const get = (f: string) => {
      const i = idx(f);
      const v = i >= 0 ? r[i]?.trim() : "";
      return v ? v : undefined;
    };
    const email = get("email")?.toLowerCase();
    if (!email || seen.has(email)) {
      stats.skipped++;
      continue;
    }
    seen.add(email);
    // Nur Spalten übernehmen, die in der Datei vorkommen – sonst würden
    // vorhandene Werte beim Import einer anderen Liste geleert.
    const base: Record<string, string | number | null> = {};
    const set = (col: string, value: string | number | null) => {
      if (idx(col) >= 0) base[col] = value;
    };
    const int = (v: string | undefined) => {
      const n = num(v);
      return n == null ? null : Math.round(n);
    };
    base.name = get("name") ?? email;
    set("phone", get("phone") ?? null);
    set("fax", get("fax") ?? null);
    set("street", get("street") ?? null);
    set("zip", get("zip")?.replace(/\.0$/, "").padStart(5, "0") ?? null);
    set("city", get("city") ?? null);
    set("ratingValue", num(get("ratingValue")));
    set("ratingCount", int(get("ratingCount")));
    set("openingHours", get("openingHours") ?? null);
    set("url", get("url") ?? null);
    set("description", get("description") ?? null);
    set("salutation", get("salutation") ?? null);
    set("firstName", get("firstName") ?? null);
    set("lastName", get("lastName") ?? null);
    if (idx("leaderNames") >= 0) {
      const names = [...new Set((get("leaderNames") ?? "").split(";").map((x) => x.trim()).filter(Boolean))];
      base.leaderNames = names.length ? names.join(", ") : null;
    }
    set("agencyType", get("agencyType") ?? null);
    set("teamSize", int(get("teamSize")));
    set("potentialScore", int(get("potentialScore")));
    set("facebookUrl", get("facebookUrl") ?? null);
    set("instagramUrl", get("instagramUrl") ?? null);
    set("xingUrl", get("xingUrl") ?? null);
    set("linkedinUrl", get("linkedinUrl") ?? null);
    const statusText = statusIdx >= 0 ? r[statusIdx]?.trim() : "";
    const legacy = statusText ? { text: statusText, date: parseGermanDate(dateIdx >= 0 ? r[dateIdx] : undefined) } : undefined;
    const ex = existing.get(email);
    if (ex) {
      // Legacy-Status nur übernehmen, wenn er neu ist
      toUpdate.push({ id: ex.id, data: base as Prisma.SalesContactUpdateInput, legacy: legacy && ex.legacyStatus !== legacy.text ? legacy : undefined });
    } else {
      toCreate.push({ data: { ...(base as unknown as Omit<Prisma.SalesContactCreateInput, "email">), email }, legacy });
    }
  }

  // Neue Kontakte in Blöcken anlegen
  for (let i = 0; i < toCreate.length; i += 500) {
    const chunk = toCreate.slice(i, i + 500);
    await prisma.salesContact.createMany({ data: chunk.map((c) => c.data as Prisma.SalesContactCreateManyInput), skipDuplicates: true });
    stats.created += chunk.length;
  }
  for (let i = 0; i < toUpdate.length; i += 200) {
    await prisma.$transaction(toUpdate.slice(i, i + 200).map((u) => prisma.salesContact.update({ where: { id: u.id }, data: u.data })));
    stats.updated += Math.min(200, toUpdate.length - i);
  }

  // Legacy-Status → Stufe, Aktivität, Aufgabe
  const withLegacy = [
    ...toCreate.filter((c) => c.legacy).map((c) => ({ email: c.data.email, legacy: c.legacy! })),
    ...toUpdate.filter((u) => u.legacy).map((u) => ({ email: [...existing.values()].find((e) => e.id === u.id)!.email, legacy: u.legacy! })),
  ];
  const ids = new Map(
    (await prisma.salesContact.findMany({ where: { email: { in: withLegacy.map((w) => w.email) } }, select: { id: true, email: true } })).map((c) => [c.email, c.id]),
  );
  for (let i = 0; i < withLegacy.length; i += 100) {
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const w of withLegacy.slice(i, i + 100)) {
      const id = ids.get(w.email);
      if (!id) continue;
      const res = classifyLegacy(w.legacy.text, now);
      stats.withStatus++;
      ops.push(
        prisma.salesContact.update({
          where: { id },
          data: {
            legacyStatus: w.legacy.text,
            stage: res?.stage ?? undefined,
            customerStage: res?.stage === "GEWONNEN" ? "VERTRAG" : undefined,
            lossReason: res?.lossReason ?? null,
            competitor: res?.competitor ?? undefined,
            callAttempts: { increment: 1 },
            lastContactAt: w.legacy.date ?? undefined,
          },
        }),
        prisma.salesActivity.create({
          data: { contactId: id, type: "IMPORT", note: w.legacy.text, occurredAt: w.legacy.date ?? now },
        }),
      );
      if (res?.task) {
        stats.tasks++;
        ops.push(
          prisma.salesTask.create({
            data: { contactId: id, title: res.task.title, type: res.task.type, dueAt: res.task.dueAt, note: w.legacy.text },
          }),
        );
      }
    }
    await prisma.$transaction(ops);
  }
  return stats;
}
