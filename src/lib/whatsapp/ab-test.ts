// A/B-Tests der WhatsApp-Vorlagen (Ole, 15.11.2026): je Vorlage bis zu zwei Fassungen (TEMPLATE_BODY_B).
//   - Zuteilung: zufällig, aber fest je Lead (Hash aus Zweck und Lead bzw. Nummer), damit ein Lead nie beide sieht.
//   - Messung: Antwortquote je Fassung. Gezählt werden nur Vorlagen-Sendungen (Message.purpose/variant), die
//     mindestens ANTWORT_STUNDEN alt sind; Antwort = eingehende Nachricht im selben Chat innerhalb dieser Zeit,
//     ohne Abmeldung und ohne Absage („Kein Bedarf“, „Nein, danke“). Zusätzlich (nur Anzeige): Terminquote.
//   - Entscheidung: ab MIN_JE_FASSUNG Sendungen je Fassung und p < ALPHA im zweiseitigen Zwei-Stichproben-z-Test
//     wird die bessere Fassung automatisch Standard (TemplateAbTest.winner) und im Audit-Log vermerkt.
// Rein: zTest, decideAbWinner, variantForKey (Unit-Tests). Datenbank: abVariantFor, loadAbStats, promoteAbWinners.

import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { TEMPLATE_BODY_B, variantsFor, type NoticePurpose, type TemplateVariant } from "@/lib/whatsapp/templates";

export const MIN_JE_FASSUNG = 50;
export const ALPHA = 0.05;
export const ANTWORT_STUNDEN = 72;
const TERMIN_TAGE = 14;

export type VariantStats = { sent: number; replied: number; booked?: number };
export type AbStats = { a: VariantStats; b: VariantStats };

/** Fehlerfunktion (Abramowitz/Stegun 7.1.26, Fehler < 1,5e-7). */
function erf(x: number): number {
  const s = Math.sign(x);
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}

/** Verteilungsfunktion der Standardnormalverteilung. */
export function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * Zweiseitiger Zwei-Stichproben-z-Test für Anteile (gepoolte Varianz). z > 0: b besser als a.
 * Ohne Streuung (beide 0 % oder beide 100 %) bzw. ohne Daten: z = 0, p = 1.
 */
export function zTest(a: VariantStats, b: VariantStats): { z: number; p: number; rateA: number; rateB: number } {
  const rateA = a.sent ? a.replied / a.sent : 0;
  const rateB = b.sent ? b.replied / b.sent : 0;
  if (!a.sent || !b.sent) return { z: 0, p: 1, rateA, rateB };
  const pool = (a.replied + b.replied) / (a.sent + b.sent);
  const se = Math.sqrt(pool * (1 - pool) * (1 / a.sent + 1 / b.sent));
  if (!se) return { z: 0, p: 1, rateA, rateB };
  const z = (rateB - rateA) / se;
  return { z, p: 2 * (1 - normalCdf(Math.abs(z))), rateA, rateB };
}

export type AbDecision = { winner: TemplateVariant | null; p: number; z: number; reason: "zu_wenig" | "kein_unterschied" | "entschieden" };

/** Gewinner bestimmen: erst ab genug Sendungen je Fassung und bei signifikantem Unterschied. */
export function decideAbWinner(s: AbStats, opts: { min?: number; alpha?: number } = {}): AbDecision {
  const min = opts.min ?? MIN_JE_FASSUNG;
  const alpha = opts.alpha ?? ALPHA;
  const t = zTest(s.a, s.b);
  if (s.a.sent < min || s.b.sent < min) return { winner: null, p: t.p, z: t.z, reason: "zu_wenig" };
  if (!(t.p < alpha)) return { winner: null, p: t.p, z: t.z, reason: "kein_unterschied" };
  return { winner: t.z > 0 ? "b" : "a", p: t.p, z: t.z, reason: "entschieden" };
}

/**
 * Feste, gleichverteilte Zuteilung je Zweck und Schlüssel (SHA-256, wie lib/experimente.ts zuteilen).
 * Korrektur 19.11.2026 (Ole: „ja korrigieren“): vorher FNV-1a mit „% 2“. Das unterste Bit hängt dabei nur an der
 * Parität der Zeichen (XOR und Multiplikation mit einer ungeraden Zahl), der Zweck kippt es höchstens; alle Vorlagen-
 * Tests eines Leads waren so vollständig gekoppelt.
 * Auswertung bleibt richtig: loadAbStats zählt die bei jeder Sendung gespeicherte Fassung (Message.variant) und
 * rechnet nichts neu aus. Alte Sendungen behalten ihre Fassung, neu verteilt werden nur künftige Sendungen; beide
 * Zuteilungen sind je Fassung zufällig gegenüber Antwortverhalten, daher keine Verzerrung durch die Umstellung.
 */
export function variantForKey(purpose: string, key: string): TemplateVariant {
  return createHash("sha256").update(`ab:${purpose}:${key}`).digest()[0] % 2 === 0 ? "a" : "b";
}

/** Zwecke mit laufendem bzw. entschiedenem A/B-Test. */
export const AB_PURPOSES = Object.keys(TEMPLATE_BODY_B) as NoticePurpose[];

let cache: { at: number; winners: Map<string, string> } | null = null;
const CACHE_MS = 5 * 60 * 1000;

async function winners(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.winners;
  const rows = await prisma.templateAbTest.findMany({ where: { winner: { not: null } }, select: { purpose: true, winner: true } }).catch(() => []);
  cache = { at: Date.now(), winners: new Map(rows.map((r) => [r.purpose, r.winner!])) };
  return cache.winners;
}

/** Fassung für diesen Lead (bzw. diese Nummer): nach Entscheidung immer der Gewinner, sonst fest zugeteilt. */
export async function abVariantFor(purpose: NoticePurpose, key: string | null | undefined): Promise<TemplateVariant> {
  if (variantsFor(purpose).length < 2) return "a";
  const w = (await winners()).get(purpose);
  if (w === "a" || w === "b") return w;
  return key ? variantForKey(purpose, key) : "a";
}

// Antworten, die keine Zustimmung sind (Abmeldung, Absage per Knopf), zählen nicht als Antwort
const KEINE_ANTWORT = ["keine nachrichten mehr", "kein bedarf", "kein bedarf mehr", "nein, danke", "nein danke"];

/** Kennzahlen je Fassung (nur Vorlagen-Sendungen, die alt genug sind, um eine Antwort zu sehen). */
export async function loadAbStats(purpose: NoticePurpose, now = new Date()): Promise<AbStats> {
  const until = new Date(now.getTime() - ANTWORT_STUNDEN * 3600_000);
  const rows = await prisma.$queryRaw<{ variant: string; sent: bigint; replied: bigint; booked: bigint }[]>(Prisma.sql`
    SELECT m."variant" AS variant,
           COUNT(*) AS sent,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "Message" r
             WHERE r."conversationId" = m."conversationId" AND r."direction" = 'inbound'
               AND r."createdAt" > m."createdAt" AND r."createdAt" <= m."createdAt" + make_interval(hours => ${ANTWORT_STUNDEN})
               AND lower(trim(coalesce(r."body", ''))) NOT IN (${Prisma.join(KEINE_ANTWORT)})
               AND lower(coalesce(r."body", '')) NOT LIKE 'stop%'
           )) AS replied,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM "Appointment" ap
             WHERE ap."conversationId" = m."conversationId"
               AND ap."createdAt" > m."createdAt" AND ap."createdAt" <= m."createdAt" + make_interval(days => ${TERMIN_TAGE})
           )) AS booked
    FROM "Message" m
    WHERE m."purpose" = ${purpose} AND m."direction" = 'outbound' AND m."variant" IN ('a', 'b') AND m."createdAt" <= ${until}
    GROUP BY m."variant"
  `);
  const of = (v: string): VariantStats => {
    const r = rows.find((x) => x.variant === v);
    return { sent: Number(r?.sent ?? 0), replied: Number(r?.replied ?? 0), booked: Number(r?.booked ?? 0) };
  };
  return { a: of("a"), b: of("b") };
}

export type AbOverview = { purpose: NoticePurpose; stats: AbStats; decision: AbDecision; winner: TemplateVariant | null; decidedAt: Date | null };

/** Übersicht aller Tests (Admin). */
export async function abOverview(now = new Date()): Promise<AbOverview[]> {
  const saved = await prisma.templateAbTest.findMany({ where: { purpose: { in: AB_PURPOSES } } });
  return Promise.all(
    AB_PURPOSES.map(async (purpose) => {
      const stats = await loadAbStats(purpose, now);
      const row = saved.find((s) => s.purpose === purpose);
      const winner = row?.winner === "a" || row?.winner === "b" ? row.winner : null;
      return { purpose, stats, decision: decideAbWinner(stats), winner, decidedAt: row?.decidedAt ?? null };
    }),
  );
}

/**
 * Im WhatsApp-Cron (einmal je Stunde genügt): offene Tests prüfen und den Gewinner als Standard setzen.
 * Bedingtes Anlegen bzw. Aktualisieren, damit parallel laufende Crons nicht doppelt entscheiden.
 */
export async function promoteAbWinners(now = new Date()): Promise<{ purpose: NoticePurpose; winner: TemplateVariant }[]> {
  const out: { purpose: NoticePurpose; winner: TemplateVariant }[] = [];
  for (const purpose of AB_PURPOSES) {
    const row = await prisma.templateAbTest.findUnique({ where: { purpose } });
    if (row?.winner) continue;
    const stats = await loadAbStats(purpose, now);
    const d = decideAbWinner(stats);
    if (!d.winner) continue;
    const data = { winner: d.winner, decidedAt: now, stats: { ...stats, p: d.p, z: d.z } as unknown as Prisma.InputJsonValue };
    const claimed = row
      ? (await prisma.templateAbTest.updateMany({ where: { purpose, winner: null }, data })).count > 0
      : await prisma.templateAbTest
          .create({ data: { purpose, ...data } })
          .then(() => true)
          .catch(() => false);
    if (!claimed) continue;
    cache = null;
    const { audit } = await import("@/lib/audit");
    await audit("whatsapp.ab_promote", {
      entity: "TemplateAbTest",
      entityId: purpose,
      details: { purpose, winner: d.winner, p: Number(d.p.toFixed(4)), a: stats.a, b: stats.b },
      actor: { role: "system" },
    });
    out.push({ purpose, winner: d.winner });
  }
  return out;
}
