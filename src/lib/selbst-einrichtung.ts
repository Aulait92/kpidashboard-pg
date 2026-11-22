// Selbst-Einrichtung neuer Kunden (Kundenbereich → Einrichtung): Meta-Zugriff selbst prüfen bzw.
// von uns anfragen lassen, Fortschritt über alle Schritte, Erinnerungen an Tag 1/3/7 und
// „hängt seit 7 Tagen“ für Admin „Heute“. Siehe docs/selbst-einrichtung.md.
//
// Meta (Business-to-Business-Funktionen, developers.facebook.com → Business Management APIs →
// Business-to-Business Functions): Eine Agentur kann Zugriff auf Werbekonto bzw. Seite eines
// anderen Business anfragen:
//   POST /{BUSINESS_ID}/client_ad_accounts  adaccount_id=act_…, permitted_tasks=[…]
//   POST /{BUSINESS_ID}/client_pages        page_id=…,          permitted_tasks=[…]
// Die Admins des Kunden bekommen eine Benachrichtigung und bestätigen. Seit 2021 ist der Zugang
// zu diesen Endpunkten eingeschränkt – schlägt die Anfrage fehl, bleibt die Klick-Anleitung.

import { leadFormConsentText } from "@/lib/einwilligung-leadformular";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { checkAdAccountAccess } from "@/lib/meta";
import { cleanToken, redactTokens } from "@/lib/meta-leads";
import { sendToAdmins, sendToBuyersOfCustomer } from "@/lib/push";
import { getAppUrl, sendCustomerMail, type CustomerMailOpts } from "@/lib/email";
import { reportError } from "@/lib/monitoring";
import { customerGreeting, logOfferActivity } from "@/lib/offer-links";
import { loadOnboarding, onboardingChecklist, sendWelcome, vonUnsAbgehakt, type ChecklistItem, type OnboardingFull } from "@/lib/onboarding";
import { loadCustomerProvision } from "@/lib/provision-server";

const GRAPH = "https://graph.facebook.com/v22.0";
const DAY = 24 * 60 * 60 * 1000;
/** Bisherige Standard-ID (Einrichtungsseite) – überschreibbar per Env oder Admin-Einstellung. */
const DEFAULT_BUSINESS_ID = "3089330734489612";
/** Erinnerungen an den Kunden: Tag 1, 3 und 7 nach dem Start der Einrichtung. */
export const REMINDER_DAYS = [1, 3, 7] as const;
/** Ab diesem Tag erscheint ein hängender Fall in Admin „Heute“. */
export const STUCK_AFTER_DAYS = 7;

// ─── Einstellungen (Business-ID, Videos) ─────────────────────────────────

/** Schritte der Einrichtung (Reihenfolge = Anzeige im Kundenbereich). */
export const SETUP_STEPS = [
  { key: "login", label: "Login" },
  { key: "questionnaire", label: "Ihre Angaben" },
  { key: "app", label: "App aufs Handy und Mitteilungen" },
  { key: "calendar", label: "Kalender" },
  { key: "mailbox", label: "E-Mail-Postfach" },
  { key: "provision", label: "Provisionen" },
  { key: "erstinfo", label: "Erstinformation" },
  { key: "assistent", label: "So arbeitet Ihr Assistent" },
  { key: "einwaende", label: "Einwände im Termin" },
  { key: "serviceMails", label: "Service-Mails in Ihrem Namen" },
  { key: "policenGesundheit", label: "Kranken, BU und Leben freischalten" },
  { key: "metaAccess", label: "Meta freigeben" },
  { key: "whatsapp", label: "WhatsApp verbinden" },
  { key: "bestandImport", label: "Kundenliste hochladen" },
  { key: "reviewLink", label: "Google-Bewertungslink" },
  { key: "team", label: "Team einladen" },
  { key: "consent", label: "Einwilligung im Leadformular" },
  { key: "testLead", label: "Testlead" },
] as const;
export type SetupStepKey = (typeof SETUP_STEPS)[number]["key"];
/** Schritte mit Video-Platzhalter in den Einstellungen. */
export const VIDEO_STEPS: SetupStepKey[] = ["metaAccess", "whatsapp", "calendar", "app", "consent", "provision"];

export type SetupSettingsView = { businessId: string; businessIdSource: "einstellung" | "env" | "standard"; videos: Partial<Record<SetupStepKey, string>> };

export async function loadSetupSettings(): Promise<SetupSettingsView> {
  const row = await prisma.setupSettings.findUnique({ where: { id: "default" } }).catch(() => null);
  const env = (process.env.META_BUSINESS_ID ?? process.env.PG_META_BUSINESS_ID ?? "").trim();
  const own = row?.businessId?.trim();
  const videos = (row?.videos && typeof row.videos === "object" ? row.videos : {}) as Partial<Record<SetupStepKey, string>>;
  return {
    businessId: own || env || DEFAULT_BUSINESS_ID,
    businessIdSource: own ? "einstellung" : env ? "env" : "standard",
    videos,
  };
}

export async function saveSetupSettings(input: { businessId: string; videos: Partial<Record<string, string>> }): Promise<{ ok: true } | { ok: false; error: string }> {
  const businessId = input.businessId.trim();
  if (businessId && !/^\d{6,20}$/.test(businessId)) return { ok: false, error: "Die Business-ID besteht nur aus Ziffern (Business Manager → Einstellungen → Unternehmensinfo)." };
  const videos: Record<string, string> = {};
  for (const k of VIDEO_STEPS) {
    const v = (input.videos[k] ?? "").trim();
    if (!v) continue;
    if (!/^https:\/\//i.test(v)) return { ok: false, error: `Video „${k}“: bitte einen https-Link (Loom oder YouTube) eintragen.` };
    videos[k] = v.slice(0, 500);
  }
  await prisma.setupSettings.upsert({
    where: { id: "default" },
    create: { id: "default", businessId: businessId || null, videos },
    update: { businessId: businessId || null, videos },
  });
  return { ok: true };
}

/** Loom/YouTube-Link → einbettbare Adresse (null = nur als Link anzeigen). */
export function videoEmbedUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "");
  if (host === "loom.com") {
    const id = u.pathname.match(/\/(?:share|embed)\/([a-zA-Z0-9]+)/)?.[1];
    return id ? `https://www.loom.com/embed/${id}` : null;
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    const id = u.searchParams.get("v") ?? u.pathname.match(/\/(?:embed|shorts)\/([\w-]+)/)?.[1];
    return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  return null;
}

/** Einwilligungstext für eigene Leadformulare (Formulare aus dem Agenten-Team enthalten ihn schon). */
export function consentText(agency: string): string {
  // Fester Wortlaut mit KI-Hinweis und Widerruf (lib/einwilligung-leadformular.ts); fehlende Angaben als Platzhalter
  return leadFormConsentText({ vermittler: agency.trim() || null, anschrift: null, email: null, datenschutzUrl: null });
}

// ─── Eingaben ───────────────────────────────────────────────────────────

/**
 * Werbekonto-ID aus „act_123“, „123“, einem Werbeanzeigenmanager-Link (…?act=123) oder kopiertem Text
 * (Ole, 15.11.2026: „act_…“ wurde nicht erkannt). Unsichtbare Zeichen und Leerzeichen aus dem Kopieren werden
 * ignoriert, „act_“ in jeder Schreibweise (ACT_, act-, act ) erkannt; sonst zählt eine einzelne Ziffernfolge.
 */
export function parseAdAccountId(raw: string | null | undefined): string | null {
  // Unsichtbare Zeichen (Zero-Width, Richtungsmarken, BOM) entfernen
  const s = String(raw ?? "").replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g, "").trim();
  if (!s) return null;
  const fromUrl = s.match(/[?&]act=(\d{6,20})/)?.[1];
  if (fromUrl) return fromUrl;
  const act = s.match(/act[\s_\-:]*(\d{6,20})(?!\d)/i)?.[1];
  if (act) return act;
  const groups = s.match(/\d{6,20}/g) ?? [];
  const plain = s.replace(/\s+/g, "");
  if (/^\d{6,20}$/.test(plain)) return plain;
  return groups.length === 1 && !/\d{21,}/.test(s) ? groups[0] : null;
}

/** Facebook-Seite: Ziffern-ID, profile.php?id=…, …-123456789 am Ende oder Seitenname aus der URL. */
export function parsePageInput(raw: string | null | undefined): { id: string } | { slug: string } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{6,25}$/.test(s)) return { id: s };
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (!/(^|\.)facebook\.com$|(^|\.)fb\.com$/i.test(u.hostname)) return null;
  const qid = u.searchParams.get("id");
  if (qid && /^\d{6,25}$/.test(qid)) return { id: qid };
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0] === "pages" && parts.length >= 3 && /^\d{6,25}$/.test(parts[2])) return { id: parts[2] };
  const first = parts[0];
  if (!first || ["profile.php", "pages", "groups", "people", "share"].includes(first)) return null;
  const tail = first.match(/-(\d{6,25})$/)?.[1];
  if (tail) return { id: tail };
  return /^[\w.\-]{3,100}$/.test(first) ? { slug: first } : null;
}

// ─── Meta-Prüfung ───────────────────────────────────────────────────────

/**
 * Datensatz (Dataset/Pixel) für die Rückmeldung an Meta (lib/capi): ok = für uns freigegeben,
 * found_not_shared = im Werbekonto vorhanden, aber unser Token darf ihn nicht lesen, none = kein Datensatz im
 * Werbekonto, error = nicht prüfbar (z. B. Werbekonto noch nicht freigegeben). Nicht blockierend für den Schritt.
 */
export type MetaDatasetState = "ok" | "found_not_shared" | "none" | "error";
export type MetaDatasetCheck = { state: MetaDatasetState; id?: string; name?: string; error?: string };

export type MetaCheck = {
  at: string;
  /** geteilt = Kunde hat unserem Business freigegeben, uns fehlt nur noch die Zuweisung an den Systemnutzer (20.11.2026). */
  adAccount: { id: string | null; ok: boolean; name?: string; error?: string; geteilt?: boolean };
  page: { id: string | null; ok: boolean; name?: string; error?: string; geteilt?: boolean };
  leads: { ok: boolean; error?: string };
  /** Seit 15.11.2026; ältere gespeicherte Prüfungen haben das Feld nicht. */
  dataset?: MetaDatasetCheck;
  ok: boolean;
};

type GraphResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Höchstens so viele Datensätze eines Werbekontos auf Zugriff prüfen. */
const MAX_DATASETS = 5;

const DATASET_PERMISSION = /permission|does not exist|unsupported get request|cannot be loaded|not authorized|\(#10\)|\(#200\)/;
const DATASET_NONE = "Kein Datensatz vorhanden (empfohlen: anlegen und freigeben).";
const DATASET_WAIT = "Wird geprüft, sobald das Werbekonto freigegeben ist.";

/** Datensätze aus der Antwort von act_<id>/adspixels (nur Ziffern-IDs, Reihenfolge wie Meta, höchstens 5). */
export function datasetCandidates(
  list: GraphResult<{ data?: { id?: unknown; name?: unknown }[] }>,
): { ok: true; items: { id: string; name?: string }[] } | { ok: false; error: string } {
  if (!list.ok) return { ok: false, error: list.error };
  const items = (Array.isArray(list.data.data) ? list.data.data : [])
    .filter((p) => /^\d{5,20}$/.test(String(p?.id ?? "")))
    .map((p) => ({ id: String(p.id), ...(typeof p.name === "string" && p.name.trim() ? { name: p.name.trim() } : {}) }))
    .slice(0, MAX_DATASETS);
  return { ok: true, items };
}

/** Antwort von GET /{dataset}?fields=id,name einordnen: lesbar = freigegeben, Berechtigungsfehler = nicht freigegeben. */
export function classifyDatasetAccess(ds: { id: string; name?: string }, access: GraphResult<{ id?: unknown; name?: unknown }>): MetaDatasetCheck {
  if (access.ok && String(access.data.id ?? "") === ds.id) {
    const name = typeof access.data.name === "string" && access.data.name.trim() ? access.data.name.trim() : ds.name;
    return { state: "ok", id: ds.id, ...(name ? { name } : {}) };
  }
  const raw = access.ok ? "permission" : access.error;
  const base = { id: ds.id, ...(ds.name ? { name: ds.name } : {}) };
  if (DATASET_PERMISSION.test(raw.toLowerCase())) return { state: "found_not_shared", ...base, error: explainMetaError("dataset", raw) };
  return { state: "error", ...base, error: explainMetaError("dataset", raw) };
}

/** Ergebnisse mehrerer Datensätze zusammenfassen: erster freigegebener, sonst erster nicht freigegebener, sonst Fehler. */
export function summarizeDatasets(results: MetaDatasetCheck[]): MetaDatasetCheck {
  return (
    results.find((r) => r.state === "ok") ??
    results.find((r) => r.state === "found_not_shared") ??
    results.find((r) => r.state === "error") ?? { state: "none", error: DATASET_NONE }
  );
}

function token(): string | null {
  return cleanToken(process.env.META_ACCESS_TOKEN) || null;
}

async function graph<T>(path: string, params: Record<string, string>, accessToken: string, method: "GET" | "POST" = "GET"): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const url = new URL(`${GRAPH}/${path}`);
    const body = new URLSearchParams({ ...params, access_token: accessToken });
    const res =
      method === "GET"
        ? await fetch(`${url}?${body}`, { cache: "no-store", signal: AbortSignal.timeout(15000) })
        : await fetch(url, { method: "POST", body, cache: "no-store", signal: AbortSignal.timeout(15000) });
    const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok || json.error) return { ok: false, error: redactTokens(String(json.error?.message ?? `HTTP ${res.status}`)) };
    return { ok: true, data: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Freigabe angekommen, Systemnutzer fehlt (Ole, 20.11.2026) ──────────
// Gibt der Kunde Werbekonto bzw. Seite unserem Business als Partner frei, sieht unser Token (Systemnutzer) das Asset
// erst, wenn es ihm in unserem Business Manager zugewiesen ist (Business-Einstellungen → Systemnutzer → Assets).
// Bis dahin meldet Meta „keine Berechtigung“, obwohl der Kunde alles richtig gemacht hat. Wir prüfen deshalb, ob das
// Asset bei uns angekommen ist, weisen es selbst zu und prüfen erneut. Klappt die Zuweisung nicht, sieht der Kunde
// „Freigabe angekommen“ und die Admins bekommen einen Hinweis.

export const FREIGABE_ANGEKOMMEN = {
  adAccount: "Ihre Freigabe ist bei uns angekommen. Wir schalten das Werbekonto noch intern frei, Sie müssen nichts mehr tun.",
  page: "Ihre Freigabe ist bei uns angekommen. Wir schalten die Seite noch intern frei, Sie müssen nichts mehr tun.",
} as const;
export const SYSTEMNUTZER_AUFGABEN = {
  adAccount: ["MANAGE", "ADVERTISE", "ANALYZE"],
  page: ["MANAGE", "CREATE_CONTENT", "MODERATE", "ADVERTISE", "ANALYZE"],
} as const;

type Asset = "adAccount" | "page";
const ID_PERMISSION = /does not exist|unsupported get request|cannot be loaded due to missing permissions|not grant|permission|ads_management|ads_read|access token/;
/** Ist der Fehler ein Berechtigungsfehler (dann lohnt sich das Nachziehen)? */
export const istBerechtigungsfehler = (raw: string) => ID_PERMISSION.test(raw.toLowerCase());

/** Kommt das Asset in der Liste der Kunden-Assets unseres Business vor (client_ad_accounts / client_pages)? */
export function assetInListe(kind: Asset, id: string, items: { id?: unknown; account_id?: unknown }[]): boolean {
  return items.some((i) => (kind === "adAccount" ? String(i.id ?? "") === `act_${id}` || String(i.account_id ?? "") === id : String(i.id ?? "") === id));
}

async function beiUnsFreigegeben(kind: Asset, id: string, businessId: string, t: string): Promise<boolean | null> {
  let after: string | undefined;
  for (let seite = 0; seite < 10; seite++) {
    const r = await graph<{ data?: { id?: unknown; account_id?: unknown }[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      `${businessId}/${kind === "adAccount" ? "client_ad_accounts" : "client_pages"}`,
      { fields: kind === "adAccount" ? "id,account_id" : "id", limit: "100", ...(after ? { after } : {}) },
      t,
    );
    if (!r.ok) return null;
    if (assetInListe(kind, id, r.data.data ?? [])) return true;
    after = r.data.paging?.next ? r.data.paging.cursors?.after : undefined;
    if (!after) return false;
  }
  return false;
}

/** Freigegebenes Asset unserem Systemnutzer (Inhaber des Tokens) zuweisen. */
async function demSystemnutzerZuweisen(kind: Asset, id: string, businessId: string, t: string): Promise<boolean> {
  const me = await graph<{ id?: string }>("me", { fields: "id" }, t);
  if (!me.ok || !me.data.id) return false;
  const r = await graph(
    kind === "adAccount" ? `act_${id}/assigned_users` : `${id}/assigned_users`,
    { user: me.data.id, tasks: JSON.stringify(SYSTEMNUTZER_AUFGABEN[kind]), business: businessId },
    t,
    "POST",
  );
  if (!r.ok) reportError(new Error(`Meta-Zuweisung ${kind} ${id}: ${r.error}`), "setup-meta-zuweisung");
  return r.ok;
}

/** Nach einem Berechtigungsfehler: angekommen? Dann zuweisen. geteilt = Freigabe liegt bei uns, zugewiesen = Zuweisung geklappt. */
async function freigabeNachziehen(kind: Asset, id: string, t: string): Promise<{ geteilt: boolean; zugewiesen: boolean }> {
  const { businessId } = await loadSetupSettings();
  const geteilt = await beiUnsFreigegeben(kind, id, businessId, t);
  if (!geteilt) return { geteilt: false, zugewiesen: false };
  return { geteilt: true, zugewiesen: await demSystemnutzerZuweisen(kind, id, businessId, t) };
}

/** Diagnose (nur ja/nein und Fehlertexte): liefert Meta für die Seite Name, Seiten-Token und Leadformulare? */
export async function checkPageForDiagnose(pageId: string): Promise<{ gefunden: boolean; name: string | null; seitenToken: boolean; fehler: string | null; leadformulare: boolean | null; leadFehler: string | null }> {
  const t = token();
  if (!t) return { gefunden: false, name: null, seitenToken: false, fehler: "META_ACCESS_TOKEN fehlt", leadformulare: null, leadFehler: null };
  const r = await graph<{ id?: string; name?: string; access_token?: string }>(pageId, { fields: "id,name,access_token" }, t);
  if (!r.ok) return { gefunden: false, name: null, seitenToken: false, fehler: r.error, leadformulare: null, leadFehler: null };
  if (!r.data.access_token) return { gefunden: !!r.data.id, name: r.data.name ?? null, seitenToken: false, fehler: null, leadformulare: null, leadFehler: null };
  const forms = await graph<{ data?: unknown[] }>(`${pageId}/leadgen_forms`, { fields: "id", limit: "1" }, r.data.access_token);
  return { gefunden: true, name: r.data.name ?? null, seitenToken: true, fehler: null, leadformulare: forms.ok, leadFehler: forms.ok ? null : forms.error };
}

/** Verständliche Erklärung zu einer Meta-Fehlermeldung (Kundensicht). */
export function explainMetaError(kind: "adAccount" | "page" | "leads" | "dataset", raw: string): string {
  const r = raw.toLowerCase();
  if (kind === "dataset") {
    if (DATASET_PERMISSION.test(r))
      return "Der Datensatz ist noch nicht für uns freigegeben. Bitte im Business Manager unter Partner unserem Business auch den Datensatz (Pixel) mit voller Kontrolle („Verwalten“) freigeben.";
    return `Der Datensatz konnte nicht geprüft werden (${raw.slice(0, 120)}).`;
  }
  if (kind === "adAccount") {
    if (/does not exist|unsupported get request|cannot be loaded due to missing permissions|not grant|permission|ads_management|ads_read/.test(r))
      return "Wir haben noch keinen Zugriff auf das Werbekonto. Bitte im Business Manager unter Partner unserem Business das Werbekonto mit „Kampagnen verwalten“ freigeben (oder unsere Anfrage bestätigen).";
    return `Das Werbekonto konnte nicht geprüft werden (${raw.slice(0, 120)}).`;
  }
  if (kind === "page") {
    if (/does not exist|unsupported get request|permission|access token/.test(r))
      return "Wir haben noch keinen Zugriff auf die Facebook-Seite. Bitte die Seite im Business Manager unter Partner unserem Business mit „Volle Kontrolle“ freigeben.";
    return `Die Facebook-Seite konnte nicht geprüft werden (${raw.slice(0, 120)}).`;
  }
  return "Zugriff auf die Leads der Seite fehlt noch. Bitte bei der Seite auch „Leads“ bzw. volle Kontrolle für unser Business freigeben (Business Manager → Integrationen → Leadzugriff).";
}

/**
 * Zugriff prüfen und speichern: Werbekonto lesbar, Seite mit Seiten-Token, Leadformulare lesbar.
 * Grün → Schritt „Meta freigeben“ erledigt, Werte in die Kundenakte, Push an Admins.
 */
export async function checkMetaAccess(
  customerId: string,
  input: { adAccount?: string | null; page?: string | null } = {},
  opts: { source?: "kunde" | "cron" | "admin" } = {},
): Promise<{ ok: true; check: MetaCheck } | { ok: false; error: string; check?: MetaCheck }> {
  const ob = await prisma.onboarding.findUnique({
    where: { customerId },
    include: { customer: { select: { name: true, metaAdAccountId: true, metaPageId: true, metaDatasetId: true, metaDatasetSource: true, metaDatasetError: true } } },
  });
  if (!ob) return { ok: false, error: "Kein Onboarding gefunden." };
  const adInput = input.adAccount ?? ob.customer.metaAdAccountId;
  const accountId = parseAdAccountId(adInput);
  if (input.adAccount && !accountId) return { ok: false, error: "Die Werbekonto-ID sieht nicht richtig aus. Sie besteht aus Ziffern, z. B. act_123456789012345." };
  const pageParsed = input.page ? parsePageInput(input.page) : ob.customer.metaPageId ? { id: ob.customer.metaPageId } : null;
  if (input.page && !pageParsed) return { ok: false, error: "Bitte die Adresse Ihrer Facebook-Seite (facebook.com/…) oder die Seiten-ID eintragen." };
  if (!accountId && !pageParsed) return { ok: false, error: "Bitte Werbekonto-ID und Facebook-Seite eintragen." };
  const t = token();
  if (!t) return { ok: false, error: "Die Prüfung ist gerade nicht möglich. Wir prüfen von Hand und melden uns." };

  const check: MetaCheck = {
    at: new Date().toISOString(),
    adAccount: { id: accountId, ok: false },
    page: { id: null, ok: false },
    leads: { ok: false },
    ok: false,
  };

  if (accountId) {
    let r = await checkAdAccountAccess(accountId);
    let geteilt = false;
    if (!r.ok && istBerechtigungsfehler(r.error)) {
      const n = await freigabeNachziehen("adAccount", accountId, t);
      geteilt = n.geteilt;
      if (n.zugewiesen) r = await checkAdAccountAccess(accountId);
    }
    if (r.ok) check.adAccount = { id: accountId, ok: true, name: r.name };
    else if (geteilt) check.adAccount = { id: accountId, ok: false, geteilt: true, error: FREIGABE_ANGEKOMMEN.adAccount };
    else check.adAccount = { id: accountId, ok: false, error: explainMetaError("adAccount", r.error) };
  } else {
    check.adAccount = { id: null, ok: false, error: "Werbekonto-ID fehlt." };
  }

  let pageId: string | null = pageParsed && "id" in pageParsed ? pageParsed.id : null;
  if (pageParsed && "slug" in pageParsed) {
    const r = await graph<{ id?: string; name?: string }>(pageParsed.slug, { fields: "id,name" }, t);
    if (r.ok && r.data.id) pageId = r.data.id;
    else check.page = { id: null, ok: false, error: "Die Facebook-Seite wurde nicht gefunden. Bitte die Seiten-ID eintragen (Seite → Info → Seitentransparenz)." };
  }
  if (pageId) {
    const seite = () => graph<{ id?: string; name?: string; access_token?: string }>(pageId!, { fields: "id,name,access_token" }, t);
    let r = await seite();
    let seiteGeteilt = false;
    if (!(r.ok && r.data.access_token) && (r.ok || istBerechtigungsfehler(r.error))) {
      const n = await freigabeNachziehen("page", pageId, t);
      seiteGeteilt = n.geteilt;
      if (n.zugewiesen) r = await seite();
    }
    if (!(r.ok && r.data.access_token) && seiteGeteilt) {
      check.page = { id: pageId, ok: false, geteilt: true, name: r.ok ? r.data.name : undefined, error: FREIGABE_ANGEKOMMEN.page };
      check.leads = { ok: false, error: "Wird geprüft, sobald die Seite freigeschaltet ist." };
    } else if (r.ok && r.data.access_token) {
      check.page = { id: pageId, ok: true, name: r.data.name };
      const forms = await graph<{ data?: unknown[] }>(`${pageId}/leadgen_forms`, { fields: "id", limit: "1" }, r.data.access_token);
      check.leads = forms.ok ? { ok: true } : { ok: false, error: explainMetaError("leads", forms.error) };
    } else {
      check.page = { id: pageId, ok: false, name: r.ok ? r.data.name : undefined, error: explainMetaError("page", r.ok ? "permission" : r.error) };
      check.leads = { ok: false, error: "Wird geprüft, sobald die Seite freigegeben ist." };
    }
  } else if (!check.page.error) {
    check.page = { id: null, ok: false, error: "Facebook-Seite fehlt." };
  }
  // Datensatz für die Rückmeldung an Meta: blockiert den Schritt nicht (Ole, 15.11.2026)
  check.dataset = await checkDataset(ob.customer, accountId, check.adAccount.ok, t);
  check.ok = check.adAccount.ok && check.page.ok && check.leads.ok;

  const customerData: Prisma.CustomerUpdateInput = {};
  if (accountId && accountId !== ob.customer.metaAdAccountId) customerData.metaAdAccountId = accountId;
  if (pageId && pageId !== ob.customer.metaPageId) customerData.metaPageId = pageId;
  // Freigegebener Datensatz → für die Rückmeldung merken (nie über eine Eingabe des Admins hinweg)
  const ds = check.dataset;
  if (ds.state === "ok" && ds.id && ob.customer.metaDatasetSource !== "admin" && (ds.id !== ob.customer.metaDatasetId || ob.customer.metaDatasetError)) {
    Object.assign(customerData, { metaDatasetId: ds.id, metaDatasetSource: "auto", metaDatasetCheckedAt: new Date(), metaDatasetError: null });
  }
  if (Object.keys(customerData).length) await prisma.customer.update({ where: { id: customerId }, data: customerData });

  // Freigabe angekommen, aber Zuweisung an den Systemnutzer klappt nicht: einmal je Stand die Admins informieren
  const vorher = (ob.metaCheck ?? null) as MetaCheck | null;
  const offen = [check.adAccount.geteilt && "Werbekonto", check.page.geteilt && "Seite"].filter(Boolean) as string[];
  const vorherOffen = [vorher?.adAccount?.geteilt && "Werbekonto", vorher?.page?.geteilt && "Seite"].filter(Boolean).join();
  if (offen.length && offen.join() !== vorherOffen) {
    await sendToAdmins({
      title: `Meta-Freigabe von ${ob.customer.name} ist angekommen`,
      body: `${offen.join(" und ")} im Business Manager unserem Systemnutzer zuweisen (Business-Einstellungen → Systemnutzer → Assets hinzufügen).`,
      url: `/admin/neu/kunden/${customerId}`,
      tag: `meta-zuweisen:${customerId}`,
    }).catch((err) => reportError(err, "setup-meta-push"));
  }

  const becameOk = check.ok && !ob.metaAccessAt;
  await prisma.onboarding.update({
    where: { id: ob.id },
    data: { metaCheck: check as unknown as Prisma.InputJsonValue, metaCheckedAt: new Date(), ...(becameOk ? { metaAccessAt: new Date() } : {}) },
  });
  if (becameOk && accountId) {
    // Werbekosten sofort holen, nicht erst beim Lauf um 5 Uhr (Ole, 21.11.2026: Lohmanns Kosten fehlten am ersten Tag)
    void import("@/lib/anzeige-kosten")
      .then((m) => m.syncAnzeigeKosten({ voll: true, nurKonto: accountId }))
      .then(() => import("@/lib/meta").then((m) => m.syncCustomerAdSpend()))
      .catch((err) => reportError(err, "setup-meta-kosten"));
  }
  if (becameOk) {
    await logOfferActivity({ dealId: null, salesContactId: ob.salesContactId }, `Onboarding: Meta-Zugriff geprüft und vorhanden (${opts.source ?? "kunde"})`).catch(() => {});
    await sendToAdmins({
      title: `✅ Meta-Zugriff bei ${ob.customer.name} ist da`,
      body: [check.adAccount.name, check.page.name].filter(Boolean).join(" · ") || "Werbekonto, Seite und Leads freigegeben",
      url: `/admin/neu/kunden/${customerId}`,
      tag: `meta-access:${customerId}`,
    }).catch((err) => reportError(err, "setup-meta-push"));
  }
  return { ok: true, check };
}

/**
 * Datensatz prüfen: vom Admin gesetzter Datensatz direkt, sonst die Datensätze des Werbekontos
 * (act_<id>/adspixels, der bereits gemerkte zuerst) und je Datensatz GET /{id}?fields=id,name mit unserem Token.
 * Lesbar = freigegeben. Erster freigegebener gewinnt.
 */
async function checkDataset(
  c: { metaDatasetId: string | null; metaDatasetSource: string | null },
  accountId: string | null,
  accountOk: boolean,
  t: string,
): Promise<MetaDatasetCheck> {
  let items: { id: string; name?: string }[];
  if (c.metaDatasetId && c.metaDatasetSource === "admin") {
    items = [{ id: c.metaDatasetId }];
  } else {
    if (!accountId || !accountOk) return { state: "error", error: DATASET_WAIT };
    const list = datasetCandidates(await graph<{ data?: { id?: unknown; name?: unknown }[] }>(`act_${accountId}/adspixels`, { fields: "id,name", limit: "25" }, t));
    if (!list.ok) return { state: "error", error: `Die Datensätze des Werbekontos konnten nicht gelesen werden (${list.error.slice(0, 120)}).` };
    items = c.metaDatasetId ? [...list.items.filter((i) => i.id === c.metaDatasetId), ...list.items.filter((i) => i.id !== c.metaDatasetId)] : list.items;
  }
  const results: MetaDatasetCheck[] = [];
  for (const ds of items) {
    const r = classifyDatasetAccess(ds, await graph<{ id?: unknown; name?: unknown }>(ds.id, { fields: "id,name" }, t));
    results.push(r);
    if (r.state === "ok") break;
  }
  return summarizeDatasets(results);
}

/** Partnerzugriff von uns aus anfragen – der Kunde bestätigt nur noch in Meta. */
export async function requestMetaAccess(
  customerId: string,
  input: { adAccount?: string | null; page?: string | null },
): Promise<{ ok: true; sent: string[]; failed: string[] } | { ok: false; error: string }> {
  const ob = await prisma.onboarding.findUnique({ where: { customerId }, include: { customer: { select: { name: true, metaAdAccountId: true, metaPageId: true } } } });
  if (!ob) return { ok: false, error: "Kein Onboarding gefunden." };
  const accountId = parseAdAccountId(input.adAccount ?? ob.customer.metaAdAccountId);
  const page = input.page ? parsePageInput(input.page) : ob.customer.metaPageId ? { id: ob.customer.metaPageId } : null;
  if (!accountId && !page) return { ok: false, error: "Bitte Werbekonto-ID und Facebook-Seite eintragen." };
  const t = token();
  if (!t) return { ok: false, error: "Die Anfrage ist gerade nicht möglich. Bitte die Anleitung nutzen." };
  const { businessId } = await loadSetupSettings();
  const sent: string[] = [];
  const failed: string[] = [];
  if (accountId) {
    const r = await graph(`${businessId}/client_ad_accounts`, { adaccount_id: `act_${accountId}`, permitted_tasks: JSON.stringify(["ADVERTISE", "ANALYZE"]) }, t, "POST");
    (r.ok ? sent : failed).push("Werbekonto");
    if (!r.ok) reportError(new Error(r.error), "setup-meta-request-ad", { customer: customerId });
  }
  let pageId: string | null = page && "id" in page ? page.id : null;
  if (page && "slug" in page) {
    const r = await graph<{ id?: string }>(page.slug, { fields: "id" }, t);
    pageId = r.ok ? (r.data.id ?? null) : null;
  }
  if (pageId) {
    const r = await graph(`${businessId}/client_pages`, { page_id: pageId, permitted_tasks: JSON.stringify(["MANAGE", "CREATE_CONTENT", "MODERATE", "ADVERTISE", "ANALYZE"]) }, t, "POST");
    (r.ok ? sent : failed).push("Facebook-Seite");
    if (!r.ok) reportError(new Error(r.error), "setup-meta-request-page", { customer: customerId });
  } else if (page) {
    failed.push("Facebook-Seite");
  }
  const customerData: Prisma.CustomerUpdateInput = {};
  if (accountId) customerData.metaAdAccountId = accountId;
  if (pageId) customerData.metaPageId = pageId;
  if (Object.keys(customerData).length) await prisma.customer.update({ where: { id: customerId }, data: customerData });
  if (sent.length) await prisma.onboarding.update({ where: { id: ob.id }, data: { metaRequestedAt: new Date() } });
  return { ok: true, sent, failed };
}

/** Täglich: offene Meta-Fälle mit eingetragenen IDs und noch nicht freigegebene Datensätze automatisch nachprüfen. */
export async function recheckOpenMetaAccess(now = new Date()): Promise<{ checked: number; ok: number; datasetChecked: number; datasetOk: number }> {
  const due = await prisma.onboarding.findMany({
    where: {
      status: "running",
      metaAccessAt: null,
      OR: [{ metaCheckedAt: null }, { metaCheckedAt: { lt: new Date(now.getTime() - 20 * 60 * 60 * 1000) } }],
      customer: { OR: [{ metaAdAccountId: { not: null } }, { metaPageId: { not: null } }] },
    },
    select: { customerId: true },
    take: 50,
  });
  let ok = 0;
  for (const d of due) {
    const r = await checkMetaAccess(d.customerId, {}, { source: "cron" }).catch(() => null);
    if (r?.ok && r.check.ok) ok++;
  }
  // Meta-Zugriff schon da, Datensatz noch nicht freigegeben (oder ältere Prüfung ohne Datensatz):
  // in den ersten 60 Tagen danach ebenfalls täglich nachprüfen, damit die Rückmeldung an Meta von selbst startet.
  const since = new Date(now.getTime() - 20 * 60 * 60 * 1000);
  const datasetDue = (
    await prisma.onboarding.findMany({
      where: {
        status: { in: ["running", "live"] },
        metaAccessAt: { gte: new Date(now.getTime() - 60 * DAY) },
        OR: [{ metaCheckedAt: null }, { metaCheckedAt: { lt: since } }],
        customer: { metaAdAccountId: { not: null }, capiEnabled: true, isTest: false, archived: false },
      },
      select: { customerId: true, metaCheck: true },
    })
  )
    .filter((d) => (d.metaCheck as MetaCheck | null)?.dataset?.state !== "ok")
    .slice(0, 50);
  let datasetOk = 0;
  for (const d of datasetDue) {
    const r = await checkMetaAccess(d.customerId, {}, { source: "cron" }).catch(() => null);
    if (r?.ok && r.check.dataset?.state === "ok") datasetOk++;
  }
  return { checked: due.length, ok, datasetChecked: datasetDue.length, datasetOk };
}

// ─── Schritte und Fortschritt ───────────────────────────────────────────

export type SetupStep = { key: SetupStepKey; label: string; done: boolean; owner: "kunde" | "wir"; href: string };

/**
 * Alle Schritte der Einrichtung für Kunde und Admin. Nutzt die vorhandene Checkliste
 * (Login, Fragebogen, Meta, Kalender, WhatsApp, Einwilligung, Testlead) plus App und Provisionen.
 */
export function setupSteps(
  ob: { package: string },
  items: ChecklistItem[],
  extra: { appDone: boolean; provisionDone: boolean },
): SetupStep[] {
  const software = ob.package !== "service";
  // Pay-per-Lead + Software: kein Testlead über eine eigene Kampagne (Meta und Einwilligung fehlen in der Checkliste)
  const kampagnen = ob.package !== "ppl_software";
  const item = (k: string) => items.find((i) => i.key === k);
  const steps: SetupStep[] = [];
  for (const s of SETUP_STEPS) {
    if (!kampagnen && s.key === "testLead") continue;
    if (!software && (s.key === "calendar" || s.key === "mailbox" || s.key === "whatsapp" || s.key === "consent" || s.key === "erstinfo" || s.key === "assistent" || s.key === "serviceMails")) continue;
    const href = `/buyer/einrichtung?schritt=${s.key}#${s.key}`;
    if (s.key === "app") steps.push({ key: s.key, label: s.label, done: extra.appDone, owner: "kunde", href });
    else if (s.key === "provision") steps.push({ key: s.key, label: s.label, done: extra.provisionDone, owner: "kunde", href: "/buyer/provisionen" });
    else if (s.key === "testLead") steps.push({ key: s.key, label: s.label, done: !!item("testLead")?.done, owner: "wir", href });
    else {
      const it = item(s.key);
      if (!it) continue; // z. B. WhatsApp ohne Selbst-Verbinden: macht performancegrowth
      steps.push({ key: s.key, label: s.label, done: it.done, owner: it.owner === "kunde" ? "kunde" : "wir", href });
    }
  }
  return steps;
}

export function setupProgress(steps: SetupStep[]) {
  const done = steps.filter((s) => s.done).length;
  return { done, total: steps.length, percent: steps.length ? Math.round((done / steps.length) * 100) : 100, open: steps.filter((s) => !s.done) };
}

/** App installiert und Mitteilungen erlaubt = mindestens eine Push-Anmeldung eines Logins des Kunden. */
export async function appInstalled(customerId: string): Promise<boolean> {
  const ob = await prisma.onboarding.findUnique({ where: { customerId }, select: { appSkippedAt: true } });
  if (ob?.appSkippedAt) return true;
  const users = await prisma.user.findMany({ where: { customerId, role: "BUYER" }, select: { id: true } });
  if (!users.length) return false;
  const ids = users.map((u) => u.id);
  // Web-Push oder App-Store-App (native Geräte, lib/native-push.ts): beides zählt als „Mitteilungen an“
  const [web, nativ] = await Promise.all([prisma.pushSubscription.count({ where: { userId: { in: ids } } }), prisma.deviceToken.count({ where: { userId: { in: ids } } })]);
  return web + nativ > 0;
}

export async function loadSetupOverview(customerId: string) {
  const ob = await loadOnboarding({ customerId });
  if (!ob) return null;
  const offer = ob.offerId ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { paymentStatus: true, paidAt: true, isTest: true } }) : null;
  const items = onboardingChecklist(ob, offer);
  const [appDone, provisionDone] = await Promise.all([
    appInstalled(customerId),
    loadCustomerProvision(customerId).then((p) => p.confirmed || vonUnsAbgehakt(ob.stepSkips, "provision")),
  ]);
  const steps = setupSteps(ob, items, { appDone, provisionDone });
  const days = Math.floor((Date.now() - setupBase(ob).getTime()) / DAY);
  return { ob, items, steps, progress: setupProgress(steps), days };
}

// ─── Erinnerungen ───────────────────────────────────────────────────────

/** Beginn der Einrichtung (für Tag 1/3/7). */
export const setupBase = (ob: { welcomeSentAt: Date | null; createdAt: Date }) => ob.welcomeSentAt ?? ob.createdAt;

/**
 * Welche Erinnerung ist fällig? Höchste Stufe (1/3/7) ≤ vergangene Tage, die noch nicht verschickt
 * wurde. Verpasste kleinere Stufen werden nicht nachgeholt (nur eine Mail pro Lauf).
 */
export function dueReminder(base: Date, now: Date, sent: Record<string, unknown> | null | undefined): number | null {
  const days = (now.getTime() - base.getTime()) / DAY;
  const reached = REMINDER_DAYS.filter((d) => days >= d);
  if (!reached.length) return null;
  const top = reached[reached.length - 1];
  return sent && sent[String(top)] ? null : top;
}

/** Offene Schritte, an die der Kunde erinnert wird (ohne Zahlung). */
export function openCustomerSteps(items: ChecklistItem[]): ChecklistItem[] {
  return items.filter((i) => !i.done && i.owner === "kunde" && i.key !== "payment");
}

const STEP_HINT: Record<string, string> = {
  login: "Passwort festlegen und einloggen",
  questionnaire: "Ihre Angaben eintragen",
  metaAccess: "Meta-Werbekonto und Facebook-Seite für uns freigeben",
  calendar: "Kalender verbinden",
  whatsapp: "WhatsApp-Nummer verbinden",
  consent: "Einwilligung im Leadformular bestätigen",
  erstinfo: "Erstinformation prüfen und bestätigen (Pflichtangaben oder eigenes PDF)",
  assistent: "Ansehen, wie Ihr Assistent arbeitet und wann Sie gefragt sind (2 Minuten)",
  serviceMails: "Service-Mails in Ihrem Namen bestätigen",
};

/** Inhalt der Erinnerungsmail (rein, auch für die Vorlagen-Übersicht mit Beispieldaten). */
export function setupReminderInhalt(o: { greeting: string; open: Pick<ChecklistItem, "key" | "label">[]; day?: number | null }): Omit<CustomerMailOpts, "to"> {
  return {
    subject: o.day === 7 ? "Ihre Einrichtung: nur noch wenige Minuten" : "Kurze Erinnerung: Ihre Einrichtung bei performancegrowth",
    greeting: o.greeting,
    paragraphs: ["damit Ihre Kampagne pünktlich starten kann, fehlen noch ein paar Minuten Einrichtung von Ihrer Seite:"],
    list: o.open.map((i) => STEP_HINT[i.key] ?? i.label),
    button: { label: "Zur Einrichtung", url: `${getAppUrl()}/buyer/einrichtung` },
    html: `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#5b5e68">Jeder Schritt hat eine kurze Anleitung mit Video. Klappt etwas nicht? Antworten Sie einfach auf diese Mail oder buchen Sie in der Einrichtung einen 15-Minuten-Hilfetermin.</p>`,
  };
}

/**
 * Erinnerungsmail zur Einrichtung (gemeinsam für Versand und Vorschau). Ist der Kunde noch nicht eingeloggt, geht
 * stattdessen die Willkommens-Mail raus (sendSetupReminder); dann null.
 */
export async function setupReminderOpts(
  ob: Pick<OnboardingFull, "offerId" | "salesContactId"> & { customer: { users: { email: string }[] } },
  open: ChecklistItem[],
  day?: number | null,
): Promise<CustomerMailOpts | null> {
  const to = ob.customer.users.map((u) => u.email);
  if (!to.length || !open.length || open.some((i) => i.key === "login")) return null;
  const offer = ob.offerId ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { contactName: true } }) : null;
  const greeting = await customerGreeting({ salesContactId: ob.salesContactId, contactName: offer?.contactName ?? null });
  return { to, ...setupReminderInhalt({ greeting, open, day }) };
}

/** Erinnerung (Mail + Push) an den Kunden senden. `force` = sofort, unabhängig von Tag 1/3/7 (Admin-Knopf). */
export async function sendSetupReminder(
  ob: OnboardingFull,
  open: ChecklistItem[],
  opts: { day?: number | null; force?: boolean } = {},
): Promise<boolean> {
  if (!open.length) return false;
  const notLoggedIn = open.some((i) => i.key === "login");
  if (notLoggedIn) {
    await sendWelcome(ob.id);
  } else {
    const mail = await setupReminderOpts(ob, open, opts.day);
    if (!mail) return false;
    const res = await sendCustomerMail(mail);
    if (!res.ok) {
      reportError(new Error(res.error), "setup-reminder", { onboarding: ob.id });
      return false;
    }
  }
  await sendToBuyersOfCustomer(ob.customerId, {
    title: "Ihre Einrichtung",
    body: open.length === 1 ? `Noch ein Schritt: ${STEP_HINT[open[0].key] ?? open[0].label}` : `Noch ${open.length} Schritte, ca. 5 Minuten`,
    url: "/buyer/einrichtung",
    tag: `setup-reminder:${ob.id}`,
  }).catch(() => {});
  return true;
}

/** Cron (werktags 9–18 Uhr): Erinnerungen an Tag 1, 3 und 7, jeweils einmal. */
export async function runSetupReminders(now = new Date()): Promise<{ reminded: number; stale: number }> {
  const running = await prisma.onboarding.findMany({
    where: { status: "running", liveAt: null, createdAt: { gt: new Date(now.getTime() - 21 * DAY) } },
    select: { customerId: true },
  });
  let reminded = 0;
  let stale = 0;
  for (const { customerId } of running) {
    const ob = await loadOnboarding({ customerId });
    if (!ob) continue;
    const offer = ob.offerId ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { paymentStatus: true, paidAt: true, isTest: true } }) : null;
    const open = openCustomerSteps(onboardingChecklist(ob, offer));
    if (!open.length) continue;
    const sent = (ob.setupReminders && typeof ob.setupReminders === "object" ? ob.setupReminders : {}) as Record<string, string>;
    const day = dueReminder(setupBase(ob), now, sent);
    if (day == null) continue;
    const ok = await sendSetupReminder(ob, open, { day });
    if (!ok) continue;
    const marks = { ...sent };
    for (const d of REMINDER_DAYS) if (d <= day && !marks[String(d)]) marks[String(d)] = now.toISOString();
    await prisma.onboarding.update({ where: { id: ob.id }, data: { setupReminders: marks, lastReminderAt: now } });
    reminded++;
    // Tag 7: einmal Push an Admins; der Fall steht ab jetzt in „Heute“.
    if (day === 7 && !ob.staleNotifiedAt) {
      await sendToAdmins({
        title: `⏳ Einrichtung hängt: ${ob.customer.name}`,
        body: `Seit 7 Tagen offen: ${open.map((i) => i.label).join(", ")}`,
        url: `/admin/neu/kunden/${customerId}`,
        tag: `onboarding-stale:${ob.id}`,
      }).catch((err) => reportError(err, "setup-stale-push"));
      await prisma.onboarding.update({ where: { id: ob.id }, data: { staleNotifiedAt: now } });
      stale++;
    }
  }
  return { reminded, stale };
}

/** Für Admin „Heute“: Einrichtungen, bei denen Kundenschritte seit mindestens 7 Tagen offen sind. */
export async function stuckSetups(now = new Date()): Promise<{ customerId: string; name: string; days: number; open: string[] }[]> {
  const rows = await prisma.onboarding.findMany({
    where: { status: "running", liveAt: null, createdAt: { lte: new Date(now.getTime() - STUCK_AFTER_DAYS * DAY) } },
    select: { customerId: true },
  });
  const out: { customerId: string; name: string; days: number; open: string[] }[] = [];
  for (const { customerId } of rows) {
    const ob = await loadOnboarding({ customerId });
    if (!ob) continue;
    const days = Math.floor((now.getTime() - setupBase(ob).getTime()) / DAY);
    if (days < STUCK_AFTER_DAYS) continue;
    const offer = ob.offerId ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { paymentStatus: true, paidAt: true, isTest: true } }) : null;
    const open = openCustomerSteps(onboardingChecklist(ob, offer));
    if (open.length) out.push({ customerId, name: ob.customer.name, days, open: open.map((i) => i.label) });
  }
  return out;
}

/** Admin-Knopf „Erinnerung jetzt senden“. */
export async function sendSetupReminderNow(customerId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ob = await loadOnboarding({ customerId });
  if (!ob) return { ok: false, error: "Kein Onboarding gefunden." };
  const offer = ob.offerId ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { paymentStatus: true, paidAt: true, isTest: true } }) : null;
  const open = openCustomerSteps(onboardingChecklist(ob, offer));
  if (!open.length) return { ok: false, error: "Beim Kunden ist nichts mehr offen." };
  const ok = await sendSetupReminder(ob, open, { force: true });
  if (!ok) return { ok: false, error: "Erinnerung konnte nicht gesendet werden (keine E-Mail-Adresse?)." };
  await prisma.onboarding.update({ where: { id: ob.id }, data: { lastReminderAt: new Date() } });
  return { ok: true };
}
