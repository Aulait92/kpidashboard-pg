// Meta Lead Ads direkt (ohne Zapier/Airtable): Webhook „leadgen“ der Seite →
// Lead per Graph API abrufen. Braucht eine Meta-App mit Webhooks-Produkt und
// einen System-User-Token mit leads_retrieval + pages_manage_metadata
// (+ pages_show_list, pages_read_engagement) für die Seiten der Kunden.
//
//   META_ACCESS_TOKEN          System-User-Token (wie für die Werbekonten)
//   META_APP_SECRET            App-Geheimschlüssel → Signatur der Webhooks prüfen
//   META_WEBHOOK_VERIFY_TOKEN  frei gewählt, in der Meta-App beim Webhook eingetragen

import crypto from "node:crypto";

const GRAPH = "https://graph.facebook.com/v22.0";

function token(): string {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error("META_ACCESS_TOKEN nicht gesetzt.");
  return t;
}

async function graphGet<T>(path: string, params: Record<string, string> = {}, accessToken = token()): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  url.searchParams.set("access_token", accessToken);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Meta GET ${path} ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

/** Signatur X-Hub-Signature-256 des Webhooks prüfen. */
export function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const given = header.slice("sha256=".length);
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export type MetaLead = {
  id: string;
  created_time: string;
  form_id?: string;
  ad_id?: string;
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  platform?: string;
  is_organic?: boolean;
  field_data: { name: string; values: string[] }[];
};

export async function fetchMetaLead(leadgenId: string): Promise<MetaLead> {
  return graphGet<MetaLead>(leadgenId, {
    fields: "id,created_time,form_id,ad_id,ad_name,adset_name,campaign_name,platform,is_organic,field_data",
  });
}

export type MetaForm = { id: string; name: string; status?: string; questions?: { key: string; label?: string; type?: string }[] };

export async function fetchFormInfo(formId: string): Promise<MetaForm> {
  return graphGet<MetaForm>(formId, { fields: "id,name,status,questions{key,label,type}" });
}

export type MetaPage = { id: string; name: string; tasks?: string[] };

/** Seiten, auf die der System-User Zugriff hat. */
export async function listPages(): Promise<MetaPage[]> {
  const res = await graphGet<{ data: MetaPage[] }>("me/accounts", { fields: "id,name,tasks", limit: "100" });
  return res.data;
}

async function pageToken(pageId: string): Promise<string> {
  const res = await graphGet<{ access_token?: string }>(pageId, { fields: "access_token" });
  if (!res.access_token) throw new Error("Kein Seiten-Token (fehlt der Zugriff auf die Seite?)");
  return res.access_token;
}

export async function listPageForms(pageId: string): Promise<MetaForm[]> {
  const res = await graphGet<{ data: MetaForm[] }>(`${pageId}/leadgen_forms`, { fields: "id,name,status", limit: "100" }, await pageToken(pageId));
  return res.data;
}

/** Seite für den leadgen-Webhook unserer App abonnieren. */
export async function subscribePage(pageId: string): Promise<void> {
  const pt = await pageToken(pageId);
  const url = new URL(`${GRAPH}/${pageId}/subscribed_apps`);
  const body = new URLSearchParams({ subscribed_fields: "leadgen", access_token: pt });
  const res = await fetch(url, { method: "POST", body, signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`Seite abonnieren fehlgeschlagen ${res.status}: ${text.slice(0, 300)}`);
}

export type MetaDiagnostics = {
  tokenSet: boolean;
  appSecretSet: boolean;
  verifyTokenSet: boolean;
  appId: string | null;
  appName: string | null;
  scopes: string[];
  missing: string[];
  pages: MetaPage[];
  error?: string;
};

const NEEDED = ["leads_retrieval", "pages_manage_metadata", "pages_show_list", "pages_read_engagement", "ads_management"];

export async function metaDiagnostics(): Promise<MetaDiagnostics> {
  const d: MetaDiagnostics = {
    tokenSet: !!process.env.META_ACCESS_TOKEN,
    appSecretSet: !!process.env.META_APP_SECRET,
    verifyTokenSet: !!process.env.META_WEBHOOK_VERIFY_TOKEN,
    appId: null,
    appName: null,
    scopes: [],
    missing: [],
    pages: [],
  };
  if (!d.tokenSet) return { ...d, missing: NEEDED, error: "META_ACCESS_TOKEN fehlt." };
  try {
    const dbg = await graphGet<{ data: { app_id?: string; application?: string; scopes?: string[]; is_valid?: boolean } }>("debug_token", {
      input_token: token(),
    });
    d.appId = dbg.data.app_id ?? null;
    d.appName = dbg.data.application ?? null;
    d.scopes = dbg.data.scopes ?? [];
    d.missing = NEEDED.filter((s) => !d.scopes.includes(s));
    if (dbg.data.is_valid === false) d.error = "Token ist ungültig oder abgelaufen.";
  } catch (err) {
    d.error = err instanceof Error ? err.message : String(err);
  }
  try {
    d.pages = await listPages();
  } catch (err) {
    d.error = d.error ?? (err instanceof Error ? err.message : String(err));
  }
  return d;
}
