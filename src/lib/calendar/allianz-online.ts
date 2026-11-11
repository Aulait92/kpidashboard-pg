// Allianz-Online-Kalender: freie Zeiten aus dem öffentlichen Buchungsdienst
// der Vertreter-Seite (vertretung.allianz.de/<name> → „Termin vereinbaren").
//
// Dahinter steckt bookingtime. Wir lesen nur, was jeder Besucher der Seite
// sieht: die freien Termine einer Termin-Art. Ablauf wie im Browser:
//   1. Buchungsseite laden, daraus Client-ID und Stamm-Organisation lesen
//      (öffentliche Konstanten im Skript, werden bei jeder Änderung neu gelesen).
//   2. Maschinen-Token (client_credentials, leeres Secret) → Zugangs-Token je
//      Organisation (refresh_token + organization_id). Nur im Speicher.
//   3. VTNR → Organisation der Vertretung → Termin-Arten → freie Slots je Monat.
//
// Belegt = alles im angefragten Zeitraum, was NICHT in einem freien Slot
// liegt. Ein Slot ist frei von (Start − Vorlaufzeit) bis (Start + Dauer +
// Nachlaufzeit): genau diese Spanne hat bookingtime für den Slot geprüft.
// Tage vor dem frühesten Buchungstag (meist übermorgen) zeigt bookingtime nie;
// dort gelten die festen Lead-Zeiten (lib/calendar/lead-times.ts).
//
// Fällt der Abruf aus, wird geworfen (nie still „frei"). Abruf höchstens alle
// 10 Minuten je Vertretung und Monat, gleichzeitige Anfragen teilen sich einen
// Abruf, höchstens 2 Anfragen gleichzeitig an bookingtime.

import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { addDaysYmd, berlinMidnight, berlinYmd } from "@/lib/absence";
import { leadTimeWindows, loadLeadTimes } from "@/lib/calendar/lead-times";
import type { Busy } from "@/lib/calendar/tokens";

const BOOKING_APP = "https://booking.allianz-abv.eps.bookingtime.com/";
const AUTH_URL = "https://auth.bookingtime.com/oauth/token";
const API = "https://api.bookingtime.com/module/v3/de";
const PAGE_HOST = "vertretung.allianz.de";

const FETCH_TIMEOUT_MS = 15_000;
const SLOT_CACHE_MS = 10 * 60 * 1000;
const CONFIG_CACHE_MS = 12 * 60 * 60 * 1000;
const MAX_PARALLEL = 2;

export type AllianzTemplate = { id: string; name: string; durationMin: number };
export type AllianzResource = { id: string; name: string };

/** Gespeicherte Verbindung (verschlüsselt in AgentConfig.allianzCalendarEnc). */
export type AllianzCalendar = {
  vtnr: string;
  pageUrl: string | null;
  orgId: string;
  orgName: string;
  templateId: string;
  templateName: string;
  durationMin: number;
  leadTimeMin: number;
  followupMin: number;
  /** Frühester Buchungstag (0 = heute, 2 = übermorgen). */
  bookingDayEarliest: number;
  templates: AllianzTemplate[];
  resources: AllianzResource[];
  /** Nur Slots dieser Person (Agentur mit mehreren Beratern); null = alle. */
  resourceId: string | null;
};

export class AllianzCalendarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AllianzCalendarError";
  }
}

// ─── Eingabe ────────────────────────────────────────────────────────────

/**
 * Vertretungs-Link oder VTNR aus der Eingabe des Vertreters.
 * „vertretung.allianz.de/max.muster", „https://…/max.muster/" oder „101511203".
 */
export function parseVertretungInput(raw: string): { vtnr: string } | { pageUrl: string } | null {
  const s = raw.trim();
  const digits = s.replace(/[\s.]/g, "");
  if (/^\d{6,12}(-\d{1,4})?$/.test(digits)) return { vtnr: digits };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (url.hostname.toLowerCase() !== PAGE_HOST) return null;
  const name = url.pathname.split("/").filter(Boolean)[0] ?? "";
  if (!/^[a-z0-9][a-z0-9._-]{1,80}$/i.test(name)) return null;
  return { pageUrl: `https://${PAGE_HOST}/${name.toLowerCase()}/` };
}

/** VTNR (agencyKey) aus dem HTML einer Vertreter-Seite. */
export function vtnrFromPageHtml(html: string): string | null {
  const text = html.replace(/&#34;|&quot;/g, '"');
  const m = text.match(/"agencyKey"\s*:\s*"(\d{6,12})"/);
  return m?.[1] ?? null;
}

/** Bevorzugte Termin-Art: Online-Beratung, sonst Telefon/Rückruf, sonst die erste. */
export function pickTemplate<T extends { name: string }>(list: T[]): T | null {
  return (
    list.find((t) => /online|video/i.test(t.name)) ??
    list.find((t) => /telefon|rückruf|rueckruf/i.test(t.name)) ??
    list[0] ??
    null
  );
}

// ─── Belegt aus freien Slots (rein, ohne Netz) ──────────────────────────

/** Überlappende/angrenzende Zeiträume zusammenfassen (sortiert). */
export function mergeIntervals(list: Busy[]): Busy[] {
  const sorted = [...list].filter((x) => x.end > x.start).sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Busy[] = [];
  for (const x of sorted) {
    const last = out[out.length - 1];
    if (last && x.start.getTime() <= last.end.getTime()) {
      if (x.end > last.end) last.end = new Date(x.end);
    } else out.push({ start: new Date(x.start), end: new Date(x.end) });
  }
  return out;
}

/** Ergänzung freier Zeiten im Fenster [min, max) = belegte Zeiten. */
export function complementOf(free: Busy[], min: Date, max: Date): Busy[] {
  const busy: Busy[] = [];
  let cursor = min;
  for (const f of mergeIntervals(free)) {
    if (f.end <= min || f.start >= max) continue;
    if (f.start > cursor) busy.push({ start: cursor, end: f.start });
    if (f.end > cursor) cursor = f.end;
  }
  if (cursor < max) busy.push({ start: cursor, end: max });
  return busy;
}

/**
 * Belegte Zeiten aus den freien Slots. `knownFrom` = Beginn des frühesten
 * Buchungstags; davor gelten die Lead-Zeit-Fenster `fallbackFree`.
 */
export function busyFromSlots(opts: {
  slots: string[];
  durationMin: number;
  leadTimeMin: number;
  followupMin: number;
  min: Date;
  max: Date;
  knownFrom: Date;
  fallbackFree: Busy[];
}): Busy[] {
  const free: Busy[] = [];
  for (const ts of opts.slots) {
    const t = Date.parse(ts);
    if (!Number.isFinite(t)) continue;
    free.push({
      start: new Date(t - opts.leadTimeMin * 60000),
      end: new Date(t + (opts.durationMin + opts.followupMin) * 60000),
    });
  }
  for (const w of opts.fallbackFree) {
    if (w.start >= opts.knownFrom) continue;
    free.push({ start: w.start, end: w.end < opts.knownFrom ? w.end : opts.knownFrom });
  }
  return complementOf(free, opts.min, opts.max);
}

/** Monate (YYYY, MM) in Berliner Zeit, die das Fenster [min, max) berührt. */
export function monthsBetween(min: Date, max: Date): Array<{ y: number; m: number }> {
  const [y0, m0] = berlinYmd(min).split("-").map(Number);
  const [y1, m1] = berlinYmd(new Date(max.getTime() - 1)).split("-").map(Number);
  const out: Array<{ y: number; m: number }> = [];
  for (let y = y0, m = m0; (y < y1 || (y === y1 && m <= m1)) && out.length < 24; ) {
    out.push({ y, m });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

// ─── Netz ───────────────────────────────────────────────────────────────

let active = 0;
const waiting: Array<() => void> = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PARALLEL) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

async function http(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await limited(() => fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" }));
  } catch (err) {
    throw new AllianzCalendarError(`Allianz-Online-Kalender nicht erreichbar (${err instanceof Error ? err.name : "Netzwerk"}).`);
  } finally {
    clearTimeout(timer);
  }
}

type ModuleConfig = { clientId: string; rootOrgId: string };
let moduleCache: { at: number; value: ModuleConfig } | null = null;

/** Client-ID und Stamm-Organisation aus dem öffentlichen Skript der Buchungsseite. */
export function moduleConfigFromScript(js: string): ModuleConfig | null {
  const clientId =
    js.match(/clientId:"([A-Za-z0-9]{16,128})"[^}]{0,300}?domain:"https:\/\/auth\.bookingtime\.com"/)?.[1] ??
    js.match(/domain:"https:\/\/auth\.bookingtime\.com"[^}]{0,300}?clientId:"([A-Za-z0-9]{16,128})"/)?.[1];
  const rootOrgId = js.match(/this\.organizationId="([A-Za-z0-9]{16,64})"/)?.[1];
  return clientId && rootOrgId ? { clientId, rootOrgId } : null;
}

async function moduleConfig(): Promise<ModuleConfig> {
  if (moduleCache && Date.now() - moduleCache.at < CONFIG_CACHE_MS) return moduleCache.value;
  const html = await (await http(BOOKING_APP)).text();
  const src = html.match(/src="(\/assets\/index-[A-Za-z0-9_-]+\.js)"/)?.[1];
  if (!src) throw new AllianzCalendarError("Allianz-Buchungsseite hat sich geändert (Skript nicht gefunden).");
  const js = await (await http(new URL(src, BOOKING_APP).toString())).text();
  const value = moduleConfigFromScript(js);
  if (!value) throw new AllianzCalendarError("Allianz-Buchungsseite hat sich geändert (Zugangsdaten nicht gefunden).");
  moduleCache = { at: Date.now(), value };
  return value;
}

type Tok = { token: string; exp: number };
let machine: Tok | null = null;
const accessTokens = new Map<string, Tok>();

async function tokenRequest(body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await http(AUTH_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) throw new AllianzCalendarError(`Allianz-Online-Kalender: Anmeldung abgelehnt (${res.status}).`);
  return (await res.json()) as Record<string, unknown>;
}

async function accessToken(orgId: string): Promise<string> {
  const now = Date.now();
  const cached = accessTokens.get(orgId);
  if (cached && cached.exp > now) return cached.token;
  const { clientId } = await moduleConfig();
  if (!machine || machine.exp <= now) {
    const m = await tokenRequest({ grant_type: "client_credentials", client_id: clientId, client_secret: "" });
    if (typeof m.refresh_token !== "string") throw new AllianzCalendarError("Allianz-Online-Kalender: keine Anmeldung möglich.");
    machine = { token: m.refresh_token, exp: now + Math.max(60, Number(m.expires_in) || 3600) * 1000 - 60_000 };
  }
  const a = await tokenRequest({ grant_type: "refresh_token", client_id: clientId, refresh_token: machine.token, organization_id: orgId });
  if (typeof a.access_token !== "string") throw new AllianzCalendarError("Allianz-Online-Kalender: kein Zugang zur Vertretung.");
  const tok = { token: a.access_token, exp: now + Math.max(30, (Number(a.expires_in) || 300) - 60) * 1000 };
  accessTokens.set(orgId, tok);
  return tok.token;
}

/** GET gegen die bookingtime-API mit Zugangs-Token der Organisation (ein Neuversuch bei 401/403). */
async function apiGet(path: string, tokenOrgId: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await http(API + path, { headers: { authorization: `Bearer ${await accessToken(tokenOrgId)}`, accept: "application/json" } });
    if ((res.status === 401 || res.status === 403) && attempt === 0) {
      accessTokens.delete(tokenOrgId);
      machine = null;
      continue;
    }
    if (res.status === 404) throw new AllianzCalendarError("Vertretung oder Termin-Art beim Allianz-Online-Kalender nicht gefunden.");
    if (!res.ok) throw new AllianzCalendarError(`Allianz-Online-Kalender antwortet nicht (${res.status}).`);
    return (await res.json()) as Record<string, unknown>;
  }
  throw new AllianzCalendarError("Allianz-Online-Kalender: Zugriff verweigert.");
}

type RawTemplate = {
  id: string;
  name: string;
  duration?: number;
  leadTime?: number;
  followupTime?: number;
  bookingDayEarliest?: number;
  bookingStepList?: Array<{ bookingResourceList?: Array<{ id?: string; name?: string; firstName?: string; lastName?: string }> }>;
};

/** VTNR einer Vertreter-Seite lesen (nur vertretung.allianz.de). */
async function vtnrFromPage(pageUrl: string): Promise<string> {
  const res = await http(pageUrl, { headers: { accept: "text/html" } });
  const finalHost = (() => {
    try {
      return new URL(res.url || pageUrl).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (!res.ok || finalHost !== PAGE_HOST) throw new AllianzCalendarError("Vertreter-Seite nicht gefunden. Bitte den Link prüfen.");
  const vtnr = vtnrFromPageHtml(await res.text());
  if (!vtnr) throw new AllianzCalendarError("Auf der Vertreter-Seite ist keine Online-Terminbuchung zu finden.");
  return vtnr;
}

/**
 * Vertretungs-Link bzw. VTNR → Organisation, Termin-Arten, bevorzugte Termin-Art.
 * Wirft mit verständlicher Meldung, wenn etwas nicht passt.
 */
export async function resolveAllianzCalendar(raw: string): Promise<AllianzCalendar> {
  const parsed = parseVertretungInput(raw);
  if (!parsed) throw new AllianzCalendarError("Bitte den Link Ihrer Vertreter-Seite (vertretung.allianz.de/…) oder Ihre Vertreternummer eingeben.");
  const pageUrl = "pageUrl" in parsed ? parsed.pageUrl : null;
  const vtnr = "vtnr" in parsed ? parsed.vtnr : await vtnrFromPage(parsed.pageUrl);
  const { rootOrgId } = await moduleConfig();
  const org = (await apiGet(`/organization/${rootOrgId}/organization/${encodeURIComponent(vtnr)}/identify`, rootOrgId)).content as
    | { id?: string; name?: string }
    | undefined;
  if (!org?.id) throw new AllianzCalendarError("Zu dieser Vertretung gibt es keinen Allianz-Online-Kalender.");
  return withTemplates({ vtnr, pageUrl, orgId: org.id, orgName: org.name ?? "" });
}

async function withTemplates(base: { vtnr: string; pageUrl: string | null; orgId: string; orgName: string }, preferTemplateId?: string | null, resourceId?: string | null): Promise<AllianzCalendar> {
  const body = await apiGet(`/organization/${base.orgId}/bookingTemplate/list`, base.orgId);
  const content = body.content as { recordList?: RawTemplate[] } | RawTemplate[] | undefined;
  const list = (Array.isArray(content) ? content : (content?.recordList ?? [])).filter((t) => t?.id && t?.name);
  const chosen = (preferTemplateId ? list.find((t) => t.id === preferTemplateId) : null) ?? pickTemplate(list);
  if (!chosen) throw new AllianzCalendarError("Im Allianz-Online-Kalender ist keine Termin-Art freigeschaltet.");
  const resources: AllianzResource[] = (chosen.bookingStepList ?? [])
    .flatMap((s) => s.bookingResourceList ?? [])
    .filter((r): r is { id: string; name?: string; firstName?: string; lastName?: string } => !!r?.id)
    .map((r) => ({ id: r.id, name: (r.name || [r.firstName, r.lastName].filter(Boolean).join(" ") || "Berater").slice(0, 80) }));
  return {
    ...base,
    templateId: chosen.id,
    templateName: chosen.name,
    durationMin: Math.max(5, Number(chosen.duration) || 30),
    leadTimeMin: Math.max(0, Number(chosen.leadTime) || 0),
    followupMin: Math.max(0, Number(chosen.followupTime) || 0),
    bookingDayEarliest: Math.max(0, Math.min(60, Number(chosen.bookingDayEarliest) || 0)),
    templates: list.map((t) => ({ id: t.id, name: t.name, durationMin: Number(t.duration) || 0 })),
    resources,
    resourceId: resourceId && resources.some((r) => r.id === resourceId) ? resourceId : resources.length === 1 ? resources[0].id : null,
  };
}

/** Andere Termin-Art bzw. Person wählen (Admin in der Kundenakte). */
export async function changeAllianzTemplate(cal: AllianzCalendar, templateId: string, resourceId?: string | null): Promise<AllianzCalendar> {
  return withTemplates({ vtnr: cal.vtnr, pageUrl: cal.pageUrl, orgId: cal.orgId, orgName: cal.orgName }, templateId, resourceId === undefined ? cal.resourceId : resourceId);
}

type SlotRow = { timestamp: string; bookingResourceIdList?: string[] };
const slotCache = new Map<string, { at: number; promise: Promise<SlotRow[]> }>();

function monthSlots(cal: AllianzCalendar, y: number, m: number): Promise<SlotRow[]> {
  const key = `${cal.orgId}:${cal.templateId}:${y}-${m}`;
  const hit = slotCache.get(key);
  if (hit && Date.now() - hit.at < SLOT_CACHE_MS) return hit.promise;
  const promise = apiGet(
    `/organization/${cal.orgId}/bookingTemplate/${cal.templateId}/bookingSlot/year/${y}/month/${String(m).padStart(2, "0")}/listMonth`,
    cal.orgId,
  ).then((body) => {
    const content = body.content as { list?: SlotRow[] } | undefined;
    if (!content || !Array.isArray(content.list)) throw new AllianzCalendarError("Allianz-Online-Kalender liefert keine Termine.");
    return content.list;
  });
  slotCache.set(key, { at: Date.now(), promise });
  // Fehler nicht zwischenspeichern.
  promise.catch(() => {
    if (slotCache.get(key)?.promise === promise) slotCache.delete(key);
  });
  return promise;
}

/** Freie Slot-Zeitpunkte (ISO mit Offset) im Fenster [min, max). */
export async function fetchFreeSlots(cal: AllianzCalendar, min: Date, max: Date): Promise<string[]> {
  const months = await Promise.all(monthsBetween(min, max).map(({ y, m }) => monthSlots(cal, y, m)));
  const lower = min.getTime() - (cal.durationMin + cal.followupMin) * 60000;
  const upper = max.getTime() + cal.leadTimeMin * 60000;
  return months
    .flat()
    .filter((s) => !cal.resourceId || !s.bookingResourceIdList || s.bookingResourceIdList.includes(cal.resourceId))
    .map((s) => s.timestamp)
    .filter((ts) => {
      const t = Date.parse(ts);
      return t >= lower && t < upper;
    });
}

/** Nur für Tests: Zwischenspeicher leeren. */
export function __resetAllianzCache() {
  moduleCache = null;
  machine = null;
  accessTokens.clear();
  slotCache.clear();
}

// ─── Speicher + Belegt für den Kalender ─────────────────────────────────

export function encodeAllianzCalendar(cal: AllianzCalendar): string {
  return encryptSecret(JSON.stringify(cal));
}

export function decodeAllianzCalendar(enc: string | null | undefined): AllianzCalendar | null {
  if (!enc) return null;
  try {
    const v = JSON.parse(decryptSecret(enc)) as AllianzCalendar;
    return v?.orgId && v?.templateId ? v : null;
  } catch {
    return null;
  }
}

/** Belegte Zeiten aus dem Allianz-Online-Kalender eines Kunden (Agentur-Kalender). */
export async function allianzBusy(customerId: string, cal: AllianzCalendar, min: Date, max: Date): Promise<Busy[]> {
  const knownFrom = berlinMidnight(addDaysYmd(berlinYmd(new Date()), cal.bookingDayEarliest));
  const fallbackFree = min < knownFrom ? leadTimeWindows(await loadLeadTimes(customerId), min, knownFrom, Math.max(cal.durationMin, 60)) : [];
  try {
    const slots = max > knownFrom ? await fetchFreeSlots(cal, min > knownFrom ? min : knownFrom, max) : [];
    const busy = busyFromSlots({ slots, durationMin: cal.durationMin, leadTimeMin: cal.leadTimeMin, followupMin: cal.followupMin, min, max, knownFrom, fallbackFree });
    await prisma.agentConfig.updateMany({ where: { customerId }, data: { allianzLastOkAt: new Date(), allianzLastError: null } }).catch(() => {});
    return busy;
  } catch (err) {
    await reportAllianzFailure(customerId, err).catch(() => {});
    throw err instanceof AllianzCalendarError ? err : new AllianzCalendarError("Allianz-Online-Kalender nicht abrufbar.");
  }
}

const ALERT_EVERY_MS = 24 * 60 * 60 * 1000;

/** Fehler merken und höchstens einmal am Tag eine Admin-Aufgabe anlegen. */
async function reportAllianzFailure(customerId: string, err: unknown): Promise<void> {
  const message = (err instanceof AllianzCalendarError ? err.message : "Unbekannter Fehler").slice(0, 300);
  const cutoff = new Date(Date.now() - ALERT_EVERY_MS);
  // Atomar: nur die erste Anfrage im Zeitfenster legt die Aufgabe an.
  const claimed = await prisma.agentConfig.updateMany({
    where: { customerId, OR: [{ allianzAlertAt: null }, { allianzAlertAt: { lt: cutoff } }] },
    data: { allianzAlertAt: new Date(), allianzLastError: message },
  });
  if (claimed.count === 0) {
    await prisma.agentConfig.updateMany({ where: { customerId }, data: { allianzLastError: message } });
    return;
  }
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true, salesContact: { select: { id: true } }, onboarding: { select: { salesContactId: true } } },
  });
  const contactId = customer?.salesContact?.id ?? customer?.onboarding?.salesContactId ?? null;
  await prisma.salesTask.create({
    data: {
      contactId,
      type: "SONSTIGES",
      title: `Allianz-Kalender-Abgleich fehlgeschlagen: ${customer?.name ?? customerId}`,
      note: `${message} Solange das so ist, schlägt der Assistent keine Termine vor. Kundenakte → WhatsApp-Assistent → Verfügbarkeit prüfen.`,
      dueAt: new Date(),
    },
  });
  const { sendToAdmins } = await import("@/lib/push");
  await sendToAdmins({ title: `⚠️ Allianz-Kalender: ${customer?.name ?? "Kunde"}`, body: "Abgleich fehlgeschlagen, bitte prüfen.", url: `/admin/kunden/${customerId}/whatsapp` }).catch(() => {});
}
