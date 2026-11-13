// LinkedIn-Statistik aus dem Export (Ole, 14.11.2026): Solange LinkedIn den Statistik-Zugang
// nicht freischaltet, lädt Ole den Export hoch (LinkedIn → Beiträge → Statistiken → Exportieren).
// Die Datei hat je nach Sprache englische oder deutsche Spalten; erkannt wird tolerant:
// je Spalte „Post URL/Beitrags-URL“ die nächste Kennzahl-Spalte rechts daneben
// (Impressions/Impressionen, Engagements/Interaktionen, …).

import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { dayKey } from "@/lib/vertrieb/dates";

type Cell = string | number | Date | boolean | null | undefined;
export type ExportRow = {
  url: string;
  urn: string | null;
  date: Date | null;
  impressions?: number;
  engagements?: number;
  reactions?: number;
  comments?: number;
  reposts?: number;
  membersReached?: number;
  icpShare?: number;
};

const norm = (v: Cell) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const isUrlHeader = (h: string) => /(post|beitrags?)[ -]?url|^url$|^link$/.test(h);
type MetricKey = "impressions" | "engagements" | "reactions" | "comments" | "reposts" | "membersReached";
const metricOf = (h: string): MetricKey | null =>
  /erreichte|members reached|reichweite/.test(h) ? "membersReached" : /impression/.test(h) ? "impressions" : /engagement|interaktion/.test(h) ? "engagements" : /reaktion|reaction/.test(h) ? "reactions" : /kommentar|comment/.test(h) ? "comments" : /repost|reshare|weiterg/.test(h) ? "reposts" : null;

export function urnFromUrl(url: string): string | null {
  const m = /urn:li:(activity|share|ugcPost):\d+/.exec(decodeURIComponent(url));
  if (m) return m[0];
  // https://www.linkedin.com/posts/name_slug-activity-7300000000000000000-AbCd
  const a = /activity-(\d{10,})/.exec(url);
  return a ? `urn:li:activity:${a[1]}` : null;
}

function toNumber(v: Cell): number | undefined {
  if (typeof v === "number") return Math.round(v);
  const s = String(v ?? "").replace(/[.\s ]/g, "").replace(",", ".");
  const n = Number(s);
  return s && Number.isFinite(n) ? Math.round(n) : undefined;
}

function toDate(v: Cell): Date | null {
  if (v instanceof Date) return v;
  const s = String(v ?? "").trim();
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 12));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return new Date(Date.UTC(+m[3], +m[1] - 1, +m[2], 12));
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  return null;
}

/** Tabellen (Blätter) → Posts mit Kennzahlen; gleiche URL aus mehreren Tabellen wird zusammengeführt. */
export function parseExportTables(tables: Cell[][][]): ExportRow[] {
  const byUrl = new Map<string, ExportRow>();
  for (const rows of tables) {
    const hi = rows.findIndex((r) => r.some((c) => isUrlHeader(norm(c))));
    if (hi < 0) continue;
    const header = rows[hi].map(norm);
    const groups: { url: number; date: number | null; metrics: [number, MetricKey][] }[] = [];
    header.forEach((h, i) => {
      if (isUrlHeader(h)) groups.push({ url: i, date: null, metrics: [] });
      else if (groups.length) {
        const g = groups[groups.length - 1];
        const m = metricOf(h);
        if (m) g.metrics.push([i, m]);
        else if (/datum|date/.test(h) && g.date == null) g.date = i;
      }
    });
    for (const r of rows.slice(hi + 1)) {
      for (const g of groups) {
        const url = String(r[g.url] ?? "").trim();
        if (!/linkedin\.com/.test(url)) continue;
        const row = byUrl.get(url) ?? { url, urn: urnFromUrl(url), date: null };
        if (g.date != null) row.date ??= toDate(r[g.date]);
        for (const [i, key] of g.metrics) {
          const n = toNumber(r[i]);
          if (n != null) row[key] = n;
        }
        byUrl.set(url, row);
      }
    }
  }
  return [...byUrl.values()].filter((r) => r.impressions != null || r.engagements != null);
}

/**
 * Export eines einzelnen Posts (LinkedIn → Post → Statistik → Exportieren): Kennzahlen stehen
 * als Zeilen „Bezeichnung | Wert“ (z. B. „Post URL | https://…“, „Impressions | 1234“).
 */
export function parseSinglePost(tables: Cell[][][]): ExportRow | null {
  let row: ExportRow | null = null;
  const pending: [MetricKey, number][] = [];
  let date: Date | null = null;
  for (const rows of tables) {
    for (const r of rows) {
      const label = norm(r[0]);
      const value = r[1];
      if (!label) continue;
      if (isUrlHeader(label) && /linkedin\.com/.test(String(value ?? ""))) {
        const url = String(value).trim();
        row = { url, urn: urnFromUrl(url), date: null };
      } else if (/datum|date/.test(label) && !date) date = toDate(value);
      else {
        const m = metricOf(label);
        const n = toNumber(value);
        if (m && n != null) pending.push([m, n]);
      }
    }
  }
  if (!row) return null;
  for (const [k, n] of pending) row[k] ??= n;
  row.date = date;
  return row;
}

function toShare(v: Cell): number | null {
  if (typeof v === "number") return v > 1 ? v / 100 : v;
  const s = String(v ?? "").trim();
  if (!s || /^</.test(s)) return null;
  const n = Number(s.replace("%", "").replace(",", ".").trim());
  if (!Number.isFinite(n)) return null;
  return s.includes("%") || n > 1 ? n / 100 : n;
}

/**
 * Anteil der Zielgruppe aus den Zuschauerdaten („Top-Demografie“: Kategorie | Wert | Prozent).
 * Je Kategorie Branche und Beruf werden die Anteile passender Werte addiert; zählt der größere.
 * Untergrenze: LinkedIn zeigt nur die häufigsten Werte je Kategorie.
 */
export function parseIcpShare(tables: Cell[][][], terms: string[]): number | null {
  const sums = new Map<string, number>();
  let found = false;
  for (const rows of tables) {
    const hi = rows.findIndex((r) => r.some((c) => /prozent|percentage|anteil/.test(norm(c))) && r.some((c) => /kategorie|category|demogra(f|ph)/.test(norm(c))));
    if (hi < 0) continue;
    const header = rows[hi].map(norm);
    const ci = header.findIndex((h) => /kategorie|category|demogra(f|ph)/.test(h));
    const pi = header.findIndex((h) => /prozent|percentage|anteil/.test(h));
    const vi = header.findIndex((h, i) => i !== ci && i !== pi && h !== "");
    if (ci < 0 || pi < 0 || vi < 0) continue;
    for (const r of rows.slice(hi + 1)) {
      const cat = norm(r[ci]);
      const isIndustry = /branche|industr/.test(cat);
      const isJob = /beruf|job|titel|title|position|funktion|function/.test(cat);
      if (!isIndustry && !isJob) continue;
      found = true;
      const val = norm(r[vi]);
      const share = toShare(r[pi]);
      if (share == null || !terms.some((t) => val.includes(t))) continue;
      const key = isIndustry ? "industry" : "job";
      sums.set(key, (sums.get(key) ?? 0) + share);
    }
  }
  if (!found) return null;
  return Math.min(1, Math.max(sums.get("industry") ?? 0, sums.get("job") ?? 0));
}

export async function readExportFile(name: string, data: Buffer): Promise<Cell[][][]> {
  if (/\.csv$/i.test(name)) {
    const parsed = Papa.parse<string[]>(data.toString("utf8").replace(/^﻿/, ""), { skipEmptyLines: true });
    return [parsed.data];
  }
  const { readSheetNames, default: readXlsx } = await import("read-excel-file/node");
  const names = await readSheetNames(data);
  const out: Cell[][][] = [];
  for (const sheet of names) out.push((await readXlsx(data, { sheet })) as Cell[][]);
  return out;
}

export type ImportResult = { rows: number; matched: number; created: number; unmatched: number; icpShare: number | null; kind: "post" | "profil" | "leer" };

/**
 * Zahlen übernehmen. Zuordnung zu Posts aus der App: gleiche URN, sonst gleicher Tag,
 * wenn an dem Tag genau ein App-Post ohne Zuordnung steht. Andere Zeilen werden als
 * „importiert“ angelegt (ältere Posts; Text kann man auf der Seite ergänzen).
 */
export async function importExport(rows: ExportRow[], now = new Date()): Promise<Omit<ImportResult, "icpShare" | "kind">> {
  let matched = 0;
  let created = 0;
  let unmatched = 0;
  const appPosts = await prisma.linkedInPost.findMany({ where: { status: "veroeffentlicht" }, select: { id: true, postUrn: true, url: true, publishedAt: true } });
  for (const r of rows) {
    const metrics = {
      impressions: r.impressions ?? undefined,
      engagements: r.engagements ?? undefined,
      reactions: r.reactions ?? undefined,
      comments: r.comments ?? undefined,
      reposts: r.reposts ?? undefined,
      membersReached: r.membersReached ?? undefined,
      icpShare: r.icpShare ?? undefined,
      metricsAt: now,
      metricsSource: "export",
    };
    const known = await prisma.linkedInPost.findFirst({ where: { OR: [{ url: r.url }, ...(r.urn ? [{ postUrn: r.urn }] : [])] }, select: { id: true, metricsSource: true } });
    if (known) {
      // API-Zahlen haben Vorrang (genauer je Post); der Zielgruppen-Anteil kommt nur aus dem Export
      await prisma.linkedInPost.update({ where: { id: known.id }, data: known.metricsSource === "api" ? { icpShare: metrics.icpShare } : metrics });
      matched++;
      continue;
    }
    // Gleicher Tag, genau ein App-Post ohne Export-Zuordnung
    if (r.date) {
      const day = dayKey(r.date);
      const sameDay = appPosts.filter((p) => p.publishedAt && dayKey(p.publishedAt) === day && !p.url?.includes("activity"));
      if (sameDay.length === 1) {
        await prisma.linkedInPost.update({ where: { id: sameDay[0].id }, data: { ...metrics, url: r.url } });
        sameDay[0].url = r.url;
        matched++;
        continue;
      }
      if (sameDay.length > 1) unmatched++;
    }
    await prisma.linkedInPost.create({
      data: { status: "importiert", text: "", url: r.url, postUrn: r.urn, publishedAt: r.date, ...metrics },
    });
    created++;
  }
  return { rows: rows.length, matched, created, unmatched };
}

/** Datei verarbeiten: Post-Export (ein Post, mit Zielgruppen-Anteil) oder Profil-Export (alle Posts). */
export async function importFile(name: string, data: Buffer, terms: string[], now = new Date()): Promise<ImportResult> {
  const tables = await readExportFile(name, data);
  const share = parseIcpShare(tables, terms);
  const single = parseSinglePost(tables);
  if (single) {
    if (share != null) single.icpShare = share;
    const res = await importExport([single], now);
    await prisma.linkedInSettings.upsert({ where: { id: "default" }, create: { id: "default", lastImportAt: now }, update: { lastImportAt: now } });
    return { ...res, icpShare: share, kind: "post" };
  }
  const rows = parseExportTables(tables);
  const res = await importExport(rows, now);
  // Profil-Export: Zielgruppen-Anteil gilt für alle Posts ohne eigenen Anteil
  await prisma.linkedInSettings.upsert({
    where: { id: "default" },
    create: { id: "default", lastImportAt: now, accountIcpShare: share },
    update: { lastImportAt: now, ...(share != null ? { accountIcpShare: share } : {}) },
  });
  return { ...res, icpShare: share, kind: rows.length || share != null ? "profil" : "leer" };
}
