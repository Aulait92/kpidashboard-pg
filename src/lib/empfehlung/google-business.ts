// Bewertungs-Wächter: Google-Unternehmensprofil verbinden (OAuth, Scope
// business.manage), Standort wählen, neue Bewertungen abholen, KI-Antwortvorschlag,
// Antwort nur nach Klick veröffentlichen.
//
// Google-APIs:
//  - Account Management:   GET  mybusinessaccountmanagement.googleapis.com/v1/accounts
//  - Business Information: GET  mybusinessbusinessinformation.googleapis.com/v1/{account}/locations
//  - Reviews (v4):          GET  mybusiness.googleapis.com/v4/{account}/{location}/reviews
//                           PUT  mybusiness.googleapis.com/v4/{review}/reply
// Ohne freigeschalteten API-Zugang (Antrag bei Google, Kontingent 0) antworten die
// APIs mit 403/429 → Status „no_access“, gelber Hinweis, kein Absturz.

import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { decryptNullable, encryptNullable } from "@/lib/encryption";
import { reportError } from "@/lib/monitoring";
import { advisorDisplayName } from "@/lib/whatsapp/template-plan";
import { DAY_MS } from "@/lib/empfehlung/shared";

export const GBP_SCOPE = "https://www.googleapis.com/auth/business.manage";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ACCOUNTS_URL = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
const REVIEWS_BASE = "https://mybusiness.googleapis.com/v4";
/** Offizielle Google-Hilfe: unangemessene Rezensionen melden. */
export const REPORT_HELP_URL = "https://support.google.com/business/answer/4596773?hl=de";
/** Abgleich je Kunde höchstens so oft. */
export const SYNC_EVERY_MS = 45 * 60_000;
/** Bewertungen nach so vielen Tagen löschen (Löschfrist). */
export const REVIEW_RETENTION_DAYS = 730;
export const BAD_REVIEW_TASK = "Schlechte Google-Bewertung – bitte antworten";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

/** Google-API noch nicht freigeschaltet (Kontingent 0) oder Zugriff verweigert. */
export class GbpAccessError extends Error {}

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

// ─── OAuth ──────────────────────────────────────────────────────────────────

function oauthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const base = process.env.GOOGLE_BUSINESS_REDIRECT_URI ?? (process.env.GOOGLE_REDIRECT_URI ? `${new URL(process.env.GOOGLE_REDIRECT_URI).origin}/api/google/business/callback` : null);
  if (!clientId || !clientSecret || !base) throw new Error("Google-OAuth ist nicht eingerichtet (GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI).");
  return { clientId, clientSecret, redirectUri: base };
}

function stateSecret(): string {
  return process.env.AUTH_SECRET ?? "dev-secret";
}
/** Signierter state (Kunde + Ablauf), damit niemand fremde Konten verbindet. */
export function signState(customerId: string, now = Date.now()): string {
  const exp = String(now + 15 * 60_000);
  const mac = crypto.createHmac("sha256", stateSecret()).update(`${customerId}.${exp}`).digest("base64url");
  return `${customerId}.${exp}.${mac}`;
}
export function verifyState(state: string, now = Date.now()): string | null {
  const [customerId, exp, mac] = state.split(".");
  if (!customerId || !exp || !mac || Number(exp) < now) return null;
  const want = crypto.createHmac("sha256", stateSecret()).update(`${customerId}.${exp}`).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? customerId : null;
}

export function gbpAuthUrl(customerId: string): string {
  const { clientId, redirectUri } = oauthConfig();
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: GBP_SCOPE,
    state: signState(customerId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export async function gbpExchangeCode(code: string, customerId: string): Promise<void> {
  const { clientId, clientSecret, redirectUri } = oauthConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!res.ok || !json.access_token) throw new Error(`Google-Token-Tausch fehlgeschlagen (${res.status}).`);
  if (json.scope && !json.scope.split(/\s+/).includes(GBP_SCOPE)) throw new Error("Zugriff auf das Unternehmensprofil wurde nicht erlaubt.");
  const data = {
    accessTokenEnc: encryptNullable(json.access_token),
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000),
    status: "pending_location",
    lastError: null,
    ...(json.refresh_token ? { refreshTokenEnc: encryptNullable(json.refresh_token) } : {}),
  };
  await prisma.googleBusinessConnection.upsert({ where: { customerId }, create: { customerId, ...data }, update: data });
}

async function accessToken(customerId: string): Promise<string> {
  const c = await prisma.googleBusinessConnection.findUnique({ where: { customerId } });
  if (!c) throw new Error("Nicht verbunden.");
  const current = decryptNullable(c.accessTokenEnc);
  if (current && c.expiresAt && c.expiresAt.getTime() > Date.now() + 60_000) return current;
  const refresh = decryptNullable(c.refreshTokenEnc);
  if (!refresh) throw new Error("Bitte das Unternehmensprofil neu verbinden.");
  const { clientId, clientSecret } = oauthConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refresh, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) throw new Error(`Google-Token erneuern fehlgeschlagen (${res.status}).`);
  await prisma.googleBusinessConnection.update({
    where: { customerId },
    data: { accessTokenEnc: encryptNullable(json.access_token), expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000) },
  });
  return json.access_token;
}

async function gbpFetch<T>(customerId: string, url: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken(customerId);
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  if (res.status === 429 || res.status === 403) {
    const body = await res.text().catch(() => "");
    throw new GbpAccessError(`Google-API ${res.status}: ${body.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`Google-API ${res.status}`);
  return (await res.json()) as T;
}

async function markNoAccess(customerId: string, err: unknown) {
  await prisma.googleBusinessConnection.update({
    where: { customerId },
    data: { status: "no_access", lastError: err instanceof Error ? err.message.slice(0, 300) : "Kein Zugriff" },
  }).catch(() => {});
}

// ─── Standort wählen ───────────────────────────────────────────────────────

export type GbpLocation = { accountName: string; locationName: string; title: string };

export async function listLocations(customerId: string): Promise<{ ok: true; locations: GbpLocation[] } | { ok: false; noAccess: boolean; error: string }> {
  try {
    const accounts = await gbpFetch<{ accounts?: { name: string }[] }>(customerId, ACCOUNTS_URL);
    const out: GbpLocation[] = [];
    for (const a of accounts.accounts ?? []) {
      const locs = await gbpFetch<{ locations?: { name: string; title?: string }[] }>(customerId, `${INFO_BASE}/${a.name}/locations?readMask=name,title&pageSize=100`);
      for (const l of locs.locations ?? []) out.push({ accountName: a.name, locationName: l.name, title: l.title ?? l.name });
    }
    return { ok: true, locations: out };
  } catch (err) {
    if (err instanceof GbpAccessError) {
      await markNoAccess(customerId, err);
      return { ok: false, noAccess: true, error: "Der Bewertungs-Wächter wird gerade freigeschaltet." };
    }
    reportError(err, "gbp-locations", { customer: customerId });
    return { ok: false, noAccess: false, error: "Die Standorte konnten nicht geladen werden." };
  }
}

export async function chooseLocation(customerId: string, loc: GbpLocation): Promise<void> {
  if (!/^accounts\/[\w-]+$/.test(loc.accountName) || !/^locations\/[\w-]+$/.test(loc.locationName)) throw new Error("Ungültiger Standort.");
  await prisma.googleBusinessConnection.update({
    where: { customerId },
    data: { accountName: loc.accountName, locationName: loc.locationName, locationTitle: loc.title.slice(0, 200), status: "connected", lastSyncAt: null, lastError: null },
  });
}

export async function disconnect(customerId: string): Promise<void> {
  await prisma.$transaction([
    prisma.googleBusinessConnection.deleteMany({ where: { customerId } }),
    prisma.googleReview.deleteMany({ where: { customerId } }),
  ]);
}

// ─── Abgleich ───────────────────────────────────────────────────────────────

type ApiReview = {
  name: string;
  reviewer?: { displayName?: string };
  starRating?: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment?: string; updateTime?: string };
};

/** Bewertung einem Kontakt mit Abschluss zuordnen (gleicher Name, eindeutig). */
export async function matchLead(customerId: string, reviewerName: string | null | undefined): Promise<string | null> {
  const name = (reviewerName ?? "").trim();
  if (name.split(/\s+/).length < 2) return null;
  const leads = await prisma.lead.findMany({
    where: { customerId, status: "Abschluss", erasedAt: null, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
    take: 2,
  });
  return leads.length === 1 ? leads[0].id : null;
}

export type SyncResult = { status: "ok" | "no_access" | "error" | "skipped"; fetched: number; fresh: number };

/** Neue Bewertungen eines Kunden abholen; Push + Aufgabe genau einmal je Bewertung. */
export async function syncReviews(customerId: string, now = new Date()): Promise<SyncResult> {
  const c = await prisma.googleBusinessConnection.findUnique({ where: { customerId } });
  if (!c || !c.accountName || !c.locationName || (c.status !== "connected" && c.status !== "no_access")) return { status: "skipped", fetched: 0, fresh: 0 };
  let data: { reviews?: ApiReview[]; averageRating?: number; totalReviewCount?: number };
  try {
    data = await gbpFetch(customerId, `${REVIEWS_BASE}/${c.accountName}/${c.locationName}/reviews?pageSize=50&orderBy=${encodeURIComponent("updateTime desc")}`);
  } catch (err) {
    if (err instanceof GbpAccessError) {
      await markNoAccess(customerId, err);
      await prisma.googleBusinessConnection.update({ where: { customerId }, data: { lastSyncAt: now } }).catch(() => {});
      return { status: "no_access", fetched: 0, fresh: 0 };
    }
    reportError(err, "gbp-sync", { customer: customerId });
    await prisma.googleBusinessConnection.update({ where: { customerId }, data: { lastSyncAt: now, lastError: err instanceof Error ? err.message.slice(0, 300) : "Fehler" } }).catch(() => {});
    return { status: "error", fetched: 0, fresh: 0 };
  }
  const reviews = data.reviews ?? [];
  let fresh = 0;
  for (const r of reviews) {
    const stars = STARS[r.starRating ?? ""] ?? 0;
    if (!stars || !r.name) continue;
    const reviewedAt = new Date(r.createTime ?? r.updateTime ?? now);
    if (now.getTime() - reviewedAt.getTime() > REVIEW_RETENTION_DAYS * DAY_MS) continue;
    const fields = {
      stars,
      text: r.comment?.slice(0, 4000) ?? null,
      reviewerName: r.reviewer?.displayName?.slice(0, 120) ?? null,
      reviewedAt,
      replyText: r.reviewReply?.comment ?? null,
      repliedAt: r.reviewReply?.updateTime ? new Date(r.reviewReply.updateTime) : null,
    };
    const existing = await prisma.googleReview.findUnique({ where: { googleName: r.name }, select: { id: true } });
    if (existing) {
      await prisma.googleReview.update({ where: { id: existing.id }, data: fields });
      continue;
    }
    const leadId = await matchLead(customerId, fields.reviewerName);
    await prisma.googleReview.create({ data: { customerId, googleName: r.name, leadId, ...fields } }).catch(() => null);
    fresh++;
  }
  // Startwert für „Entwicklung seit Modulstart“
  await prisma.googleBusinessConnection.update({
    where: { customerId },
    data: {
      lastSyncAt: now,
      status: "connected",
      lastError: null,
      ...(c.startCount == null ? { startCount: data.totalReviewCount ?? reviews.length, startAverage: data.averageRating ?? null } : {}),
    },
  });
  // Erster Abgleich: alte Bewertungen nicht als „neu“ melden
  if (c.startCount == null) {
    await prisma.googleReview.updateMany({ where: { customerId, notifiedAt: null }, data: { notifiedAt: now } });
    return { status: "ok", fetched: reviews.length, fresh: 0 };
  }
  await notifyNewReviews(customerId, now);
  return { status: "ok", fetched: reviews.length, fresh };
}

/** Push (1–3 Sterne dringend + Aufgabe, 4–5 freundlicher Hinweis) – genau einmal je Bewertung. */
export async function notifyNewReviews(customerId: string, now = new Date()): Promise<number> {
  const pending = await prisma.googleReview.findMany({ where: { customerId, notifiedAt: null }, orderBy: { reviewedAt: "asc" } });
  const { sendToBuyersOfCustomer } = await import("@/lib/push");
  let n = 0;
  for (const r of pending) {
    const claimed = await prisma.googleReview.updateMany({ where: { id: r.id, notifiedAt: null }, data: { notifiedAt: now } });
    if (claimed.count === 0) continue;
    const bad = r.stars <= 3;
    const quote = r.text ? `„${r.text.length > 100 ? `${r.text.slice(0, 97)}…` : r.text}“` : "ohne Text";
    await sendToBuyersOfCustomer(customerId, {
      title: bad ? `⚠️ ${r.stars} ${r.stars === 1 ? "Stern" : "Sterne"} auf Google – bitte antworten` : `⭐ Neue Google-Bewertung: ${r.stars} Sterne`,
      body: `${r.reviewerName ?? "Jemand"}: ${quote}`,
      url: "/buyer/empfehlungen#bewertungen",
      tag: `gbp-review:${r.id}`,
    }).catch(() => {});
    if (bad && r.leadId) {
      // Aufgabe in „Heute“ am zugeordneten Kontakt; ohne Zuordnung erscheint sie als Karte in „Heute“
      await prisma.lead.update({ where: { id: r.leadId }, data: { followUpAt: now, followUpNote: `${BAD_REVIEW_TASK}: ${quote}` } }).catch(() => {});
    }
    if (!r.suggestedReply) {
      const suggestion = await suggestReply(customerId, r).catch(() => null);
      if (suggestion) await prisma.googleReview.update({ where: { id: r.id }, data: { suggestedReply: suggestion } });
    }
    n++;
  }
  return n;
}

/** Cron: alle verbundenen Kunden mit aktivem Modul, je Kunde höchstens alle 45 Minuten. */
export async function runWaechter(now = new Date()): Promise<{ synced: number; noAccess: number; pruned: number }> {
  const due = await prisma.googleBusinessConnection.findMany({
    where: {
      status: { in: ["connected", "no_access"] },
      locationName: { not: null },
      customer: { empfehlungEnabled: true },
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(now.getTime() - SYNC_EVERY_MS) } }],
    },
    select: { customerId: true },
    take: 20,
  });
  let synced = 0;
  let noAccess = 0;
  for (const c of due) {
    const r = await syncReviews(c.customerId, now);
    if (r.status === "ok") synced++;
    if (r.status === "no_access") noAccess++;
  }
  const pruned = (await prisma.googleReview.deleteMany({ where: { reviewedAt: { lt: new Date(now.getTime() - REVIEW_RETENTION_DAYS * DAY_MS) } } })).count;
  return { synced, noAccess, pruned };
}

// ─── Antworten ──────────────────────────────────────────────────────────────

/** Rückfall ohne KI: neutrale, datenschutzkonforme Antwort. */
export function fallbackReply(stars: number, vertreter: string): string {
  if (stars >= 4) return `Vielen Dank für Ihre Bewertung und Ihr Vertrauen! Es freut mich sehr, dass Sie zufrieden sind. Herzliche Grüße, ${vertreter}`;
  return `Vielen Dank für Ihre offene Rückmeldung. Es tut mir leid, dass Sie nicht zufrieden waren. Ich würde das gern persönlich mit Ihnen klären, bitte melden Sie sich direkt bei mir. Herzliche Grüße, ${vertreter}`;
}

/** KI-Vorschlag: professionell, ohne Vertrags- oder Personendaten; bei Kritik Gespräch offline anbieten. */
export async function suggestReply(customerId: string, r: { stars: number; text: string | null }): Promise<string> {
  const cust = await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } });
  const vertreter = advisorDisplayName(cust?.name ?? "");
  if (!process.env.ANTHROPIC_API_KEY) return fallbackReply(r.stars, vertreter);
  try {
    const client = new Anthropic();
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system:
        "Du schreibst einen Antwortvorschlag auf eine öffentliche Google-Bewertung für einen Versicherungsvertreter in Deutschland (Sie-Form, 2–4 Sätze). Regeln: professionell, sachlich, freundlich. Nenne KEINE Namen, keine Versicherungs-, Vertrags-, Tarif- oder Schadendetails und keine sonstigen personenbezogenen Daten – auch nicht, ob die Person Kunde ist (Datenschutz). Bei Kritik: Bedauern ausdrücken, nichts zugeben oder bestreiten, das Gespräch offline anbieten („melden Sie sich gern direkt bei mir“). Bei Lob: kurz danken. Keine Werbung, keine Rabatte. Unterschreibe mit dem Namen des Vertreters. Gib nur den Antworttext aus.",
      messages: [{ role: "user", content: `Vertreter: ${vertreter}\nSterne: ${r.stars}\nBewertungstext: ${(r.text ?? "(ohne Text)").slice(0, 2000)}` }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return text ? text.slice(0, 1500) : fallbackReply(r.stars, vertreter);
  } catch (err) {
    reportError(err, "gbp-suggest");
    return fallbackReply(r.stars, vertreter);
  }
}

/** Antwort veröffentlichen – nur nach Klick des Vertreters. */
export async function publishReply(customerId: string, reviewId: string, comment: string, now = new Date()): Promise<{ ok: true } | { ok: false; error: string; noAccess?: boolean }> {
  const text = comment.trim();
  if (text.length < 5) return { ok: false, error: "Bitte eine Antwort eingeben." };
  if (text.length > 4000) return { ok: false, error: "Die Antwort ist zu lang." };
  const r = await prisma.googleReview.findFirst({ where: { id: reviewId, customerId } });
  if (!r) return { ok: false, error: "Bewertung nicht gefunden." };
  try {
    await gbpFetch(customerId, `${REVIEWS_BASE}/${r.googleName}/reply`, { method: "PUT", body: JSON.stringify({ comment: text }) });
  } catch (err) {
    if (err instanceof GbpAccessError) {
      await markNoAccess(customerId, err);
      return { ok: false, noAccess: true, error: "Der Bewertungs-Wächter wird gerade freigeschaltet – bitte vorerst direkt in Google antworten." };
    }
    reportError(err, "gbp-reply", { customer: customerId });
    return { ok: false, error: "Die Antwort konnte nicht veröffentlicht werden." };
  }
  await prisma.googleReview.update({ where: { id: r.id }, data: { replyText: text, repliedAt: now } });
  // Aufgabe am Kontakt erledigt
  if (r.leadId) {
    await prisma.lead.updateMany({ where: { id: r.leadId, followUpNote: { startsWith: BAD_REVIEW_TASK } }, data: { followUpAt: null, followUpNote: null } });
  }
  return { ok: true };
}

// ─── Auswertung ─────────────────────────────────────────────────────────────

export async function waechterStats(customerId: string, now = new Date()) {
  const [c, reviews] = await Promise.all([
    prisma.googleBusinessConnection.findUnique({ where: { customerId } }),
    prisma.googleReview.findMany({ where: { customerId }, select: { stars: true, reviewedAt: true, repliedAt: true }, orderBy: { reviewedAt: "desc" } }),
  ]);
  const avg = reviews.length ? Math.round((reviews.reduce((s, r) => s + r.stars, 0) / reviews.length) * 10) / 10 : null;
  const months: { month: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = d.toISOString().slice(0, 7);
    months.push({ month: key, count: reviews.filter((r) => r.reviewedAt.toISOString().slice(0, 7) === key).length });
  }
  const sinceStart = c?.createdAt ? reviews.filter((r) => r.reviewedAt >= c.createdAt) : [];
  return {
    average: avg,
    count: reviews.length,
    replyRate: reviews.length ? Math.round((reviews.filter((r) => r.repliedAt).length / reviews.length) * 100) : null,
    months,
    start: c?.startCount != null ? { count: c.startCount, average: c.startAverage } : null,
    newSinceStart: sinceStart.length,
    unansweredBad: reviews.filter((r) => r.stars <= 3 && !r.repliedAt).length,
  };
}
