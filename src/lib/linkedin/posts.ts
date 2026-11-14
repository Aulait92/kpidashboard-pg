// LinkedIn-Posts: Einstellungen, Uhrzeiten, Freigabe, Veröffentlichen, Statistik (Ole, 14.11.2026).
// Ablauf: Cron schreibt abends die Entwürfe für den nächsten Tag (drafts.ts) → Push →
// Ole gibt per Klick frei → Cron postet zur Uhrzeit → Zahlen kommen per API oder Export.

import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { dayKey, fromDayKey, addDays } from "@/lib/vertrieb/dates";
import { fetchPostMetrics, postUrl, publishTextPost, type PostImage } from "@/lib/linkedin/api";
import type { LinkedInPost, LinkedInSettings } from "@/generated/prisma/client";
import { postText } from "@/lib/linkedin/text";

/** Bildwahl beim Freigeben: "keins", "grafik" oder eine Foto-ID (eigenes Foto oder KI-Bild). */
export type ImageChoice = string;

export const MAX_POSTS_PER_DAY = 5;
const DAY = 86_400_000;

export async function getSettings(): Promise<LinkedInSettings> {
  return prisma.linkedInSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
}

/** „07:30, 9:30,12:00“ → ["07:30","09:30","12:00"] (gültig, sortiert, ohne Doppelte). */
export function parseSlots(raw: string): string[] {
  const out = new Set<string>();
  for (const part of raw.split(/[,;\s]+/)) {
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(part.trim());
    if (!m) continue;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) continue;
    out.add(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return [...out].sort();
}

const isWeekend = (key: string) => {
  const wd = new Date(`${key}T12:00:00Z`).getUTCDay();
  return wd === 0 || wd === 6;
};

/** Uhrzeiten eines Tages als Zeitpunkte (leer am Wochenende, wenn nur werktags gepostet wird). */
export function slotTimes(settings: Pick<LinkedInSettings, "slots" | "postsPerDay" | "weekdays">, key: string): Date[] {
  if (settings.weekdays && isWeekend(key)) return [];
  const n = Math.max(0, Math.min(MAX_POSTS_PER_DAY, settings.postsPerDay));
  return parseSlots(settings.slots)
    .slice(0, n)
    .map((t) => fromDayKey(key, t));
}

/** Nächster Posting-Tag nach `now` (morgen, am Wochenende ggf. Montag). */
export function nextPostingDay(settings: Pick<LinkedInSettings, "weekdays">, now: Date): string {
  let d = addDays(now, 1);
  for (let i = 0; i < 7 && settings.weekdays && isWeekend(dayKey(d)); i++) d = addDays(d, 1);
  return dayKey(d);
}

/** Die nächsten `n` Posting-Tage ab morgen (am Wochenende übersprungen, wenn nur werktags). */
export function postingDays(settings: Pick<LinkedInSettings, "weekdays">, now: Date, n: number): string[] {
  const out: string[] = [];
  let d = addDays(now, 1);
  for (let i = 0; out.length < n && i < n * 3 + 7; i++, d = addDays(d, 1)) {
    const key = dayKey(d);
    if (!(settings.weekdays && isWeekend(key))) out.push(key);
  }
  return out;
}

const TAKEN = ["freigegeben", "sendet", "veroeffentlicht"];

/** Nächste freie Uhrzeit ab `from` (mind. 2 Minuten in der Zukunft), sonst null (innerhalb 14 Tagen). */
export async function nextFreeSlot(from: Date, excludeId?: string): Promise<Date | null> {
  const settings = await getSettings();
  const taken = await prisma.linkedInPost.findMany({
    where: { status: { in: TAKEN }, scheduledAt: { gte: addDays(from, -1) }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { scheduledAt: true },
  });
  const takenMs = new Set(taken.map((t) => t.scheduledAt?.getTime()));
  const earliest = from.getTime() + 2 * 60_000;
  for (let i = 0; i < 14; i++) {
    for (const t of slotTimes(settings, dayKey(addDays(from, i)))) {
      if (t.getTime() >= earliest && !takenMs.has(t.getTime())) return t;
    }
  }
  return null;
}

// ─── Verbindung ─────────────────────────────────────────────────────────
export async function saveConnection(userId: string, input: { personUrn: string; name: string | null; accessToken: string; expiresAt: Date; scopes: string }) {
  const data = {
    personUrn: input.personUrn,
    name: input.name,
    accessTokenEnc: encryptSecret(input.accessToken),
    expiresAt: input.expiresAt,
    scopes: input.scopes,
    status: "ok",
    lastError: null,
    remindedAt: null,
  };
  // Nur ein LinkedIn-Profil: ältere Verbindungen anderer Admins entfernen
  await prisma.linkedInConnection.deleteMany({ where: { userId: { not: userId } } });
  await prisma.linkedInConnection.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

export async function activeConnection(now = new Date()) {
  const c = await prisma.linkedInConnection.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!c || c.expiresAt <= now) return null;
  return { ...c, accessToken: decryptSecret(c.accessTokenEnc) };
}

export const hasAnalyticsScope = (scopes: string) => scopes.split(/[\s,]+/).includes("r_member_postAnalytics");

// ─── Freigabe ───────────────────────────────────────────────────────────
/** Bildwahl in Felder übersetzen (unbekannte Foto-ID → ohne Bild). */
export async function imageFields(choice: ImageChoice | undefined, graphic: string | null): Promise<{ photoId?: string | null; useGraphic?: boolean }> {
  if (choice === undefined) return {};
  if (choice === "keins") return { photoId: null, useGraphic: false };
  if (choice === "grafik") return { photoId: null, useGraphic: !!graphic };
  const exists = await prisma.linkedInPhoto.count({ where: { id: choice } });
  return exists ? { photoId: choice, useGraphic: false } : { photoId: null, useGraphic: false };
}

export async function approvePost(id: string, text: string, now = new Date(), choice?: ImageChoice): Promise<{ ok: true; scheduledAt: Date } | { ok: false; error: string }> {
  const post = await prisma.linkedInPost.findUnique({ where: { id } });
  if (!post || !["entwurf", "fehler"].includes(post.status)) return { ok: false, error: "Entwurf nicht gefunden oder schon freigegeben." };
  // Immer ohne Gedankenstriche und Hashtags (Ole, 14.11.2026)
  const clean = postText(text);
  if (clean.length < 20) return { ok: false, error: "Der Text ist zu kurz." };
  if (clean.length > 3000) return { ok: false, error: "LinkedIn erlaubt höchstens 3.000 Zeichen." };
  // Geplante Uhrzeit behalten, wenn sie noch frei und in der Zukunft ist – sonst nächste freie
  let at = post.scheduledAt;
  if (at && at.getTime() > now.getTime() + 2 * 60_000) {
    const clash = await prisma.linkedInPost.count({ where: { id: { not: id }, status: { in: TAKEN }, scheduledAt: at } });
    if (clash) at = null;
  } else at = null;
  at ??= await nextFreeSlot(now, id);
  if (!at) return { ok: false, error: "Keine freie Uhrzeit in den nächsten 14 Tagen. Bitte Uhrzeiten in den Einstellungen ergänzen." };
  const image = await imageFields(choice, post.graphic);
  await prisma.linkedInPost.update({ where: { id }, data: { status: "freigegeben", text: clean, scheduledAt: at, lastError: null, ...image } });
  return { ok: true, scheduledAt: at };
}

/** Sofort posten (statt zur geplanten Uhrzeit). */
export async function approveNow(id: string, text: string, now = new Date(), choice?: ImageChoice) {
  const res = await approvePost(id, text, now, choice);
  if (!res.ok) return res;
  await prisma.linkedInPost.update({ where: { id }, data: { scheduledAt: now } });
  await publishDue(now);
  const after = await prisma.linkedInPost.findUnique({ where: { id }, select: { status: true, lastError: true } });
  return after?.status === "veroeffentlicht" ? { ok: true as const, scheduledAt: now } : { ok: false as const, error: after?.lastError ?? "Nicht veröffentlicht." };
}

// ─── Veröffentlichen (Cron) ─────────────────────────────────────────────
export type Publisher = (accessToken: string, personUrn: string, text: string, image?: PostImage | null) => Promise<string>;

export async function publishDue(now = new Date(), publish: Publisher = publishTextPost): Promise<{ published: number; failed: number }> {
  const due = await prisma.linkedInPost.findMany({
    where: { status: "freigegeben", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
    take: 5,
  });
  if (!due.length) return { published: 0, failed: 0 };
  const conn = await activeConnection(now);
  let published = 0;
  let failed = 0;
  for (const p of due) {
    // Doppeltes Posten verhindern (zwei Cron-Läufe gleichzeitig)
    const lock = await prisma.linkedInPost.updateMany({ where: { id: p.id, status: "freigegeben" }, data: { status: "sendet" } });
    if (!lock.count) continue;
    if (!conn) {
      await prisma.linkedInPost.update({ where: { id: p.id }, data: { status: "fehler", lastError: "LinkedIn ist nicht verbunden oder der Zugang ist abgelaufen." } });
      failed++;
      continue;
    }
    try {
      const photo = p.photoId ? await prisma.linkedInPhoto.findUnique({ where: { id: p.photoId }, select: { data: true, contentType: true, description: true, generated: true } }) : null;
      let image: PostImage | null = photo ? { data: Buffer.from(photo.data), contentType: photo.contentType, alt: photo.generated ? "" : photo.description } : null;
      if (!image && p.useGraphic && p.graphic) {
        const { renderGraphic } = await import("@/lib/linkedin/graphic");
        image = { data: await renderGraphic(p.graphic), contentType: "image/png", alt: p.graphic };
      }
      const urn = await publish(conn.accessToken, conn.personUrn, p.text, image);
      await prisma.linkedInPost.update({ where: { id: p.id }, data: { status: "veroeffentlicht", publishedAt: now, postUrn: urn, url: postUrl(urn), lastError: null } });
      published++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const status = (e as { status?: number }).status;
      await prisma.linkedInPost.update({ where: { id: p.id }, data: { status: "fehler", lastError: msg.slice(0, 500) } });
      if (status === 401) await prisma.linkedInConnection.update({ where: { id: conn.id }, data: { status: "error", lastError: "Zugang abgelaufen – bitte neu verbinden." } });
      failed++;
    }
  }
  return { published, failed };
}

// ─── Statistik per API (nur mit r_member_postAnalytics) ─────────────────
/** Zahlen nach 1, 3, 7 und 14 Tagen holen (danach ändern sie sich kaum noch). */
export function metricsDue(p: Pick<LinkedInPost, "publishedAt" | "metricsAt">, now: Date): boolean {
  if (!p.publishedAt) return false;
  const age = now.getTime() - p.publishedAt.getTime();
  if (age < DAY / 2 || age > 15 * DAY) return false;
  const last = p.metricsAt ? p.metricsAt.getTime() - p.publishedAt.getTime() : -1;
  return [1, 3, 7, 14].some((d) => age >= d * DAY && last < d * DAY) || (last < 0 && age >= DAY / 2);
}

export async function refreshMetrics(now = new Date(), fetcher = fetchPostMetrics): Promise<number> {
  const conn = await activeConnection(now);
  if (!conn || !hasAnalyticsScope(conn.scopes)) return 0;
  const posts = await prisma.linkedInPost.findMany({
    where: { status: "veroeffentlicht", postUrn: { not: null }, publishedAt: { gte: new Date(now.getTime() - 15 * DAY) } },
  });
  let n = 0;
  for (const p of posts.filter((x) => metricsDue(x, now)).slice(0, 10)) {
    try {
      const m = await fetcher(conn.accessToken, p.postUrn!);
      await prisma.linkedInPost.update({
        where: { id: p.id },
        data: { ...m, engagements: (m.reactions ?? 0) + (m.comments ?? 0) + (m.reposts ?? 0), metricsAt: now, metricsSource: "api" },
      });
      n++;
    } catch (e) {
      // 403: Statistik-Zugang (noch) nicht freigeschaltet → nicht weiter versuchen
      if ((e as { status?: number }).status === 403) break;
    }
  }
  return n;
}

// ─── Auswertung ─────────────────────────────────────────────────────────
// Ziel ist Reichweite in der Zielgruppe (Versicherungsvermittler), nicht Reichweite insgesamt:
// Wert eines Posts = Impressionen × Anteil der Zielgruppe (je Post aus dem Post-Export,
// sonst der Anteil über das ganze Profil). Ohne Zielgruppen-Daten zählen die Impressionen.
export type Scored = Pick<LinkedInPost, "id" | "impressions" | "publishedAt"> & { icpShare?: number | null };

/** Zielgruppen-Reichweite eines Posts (null = noch keine Zahlen). */
export function scoreOf(p: Scored, accountShare: number | null = null): number | null {
  if (p.impressions == null) return null;
  const share = p.icpShare ?? accountShare;
  return share == null ? p.impressions : Math.round(p.impressions * share);
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Vergleichswert eines Posts: Median der Zielgruppen-Reichweite der 30 Posts davor. */
export function baselineFor(post: Scored, all: Scored[], accountShare: number | null = null): number | null {
  const before = all
    .filter((p) => p.id !== post.id && p.impressions != null && p.publishedAt && post.publishedAt && p.publishedAt < post.publishedAt)
    .sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime())
    .slice(0, 30)
    .map((p) => scoreOf(p, accountShare)!);
  return before.length >= 3 ? median(before) : null;
}

/** Verhältnis zum Vergleichswert (1.4 = 40 % mehr Zielgruppen-Reichweite als üblich). */
export function liftOf(post: Scored, all: Scored[], accountShare: number | null = null): number | null {
  const base = baselineFor(post, all, accountShare);
  const score = scoreOf(post, accountShare);
  return base && score != null ? score / base : null;
}

export function liftLabel(lift: number | null): string {
  if (lift == null) return "noch kein Vergleich";
  const pct = Math.round((lift - 1) * 100);
  return pct === 0 ? "wie üblich" : pct > 0 ? `+${pct} % Zielgruppen-Reichweite` : `${pct} % Zielgruppen-Reichweite`;
}

/** Zielgruppen-Begriffe aus den Einstellungen (klein, ohne Leere). */
export function icpTerms(raw: string): string[] {
  return raw
    .split(/[,;\n]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 3);
}
