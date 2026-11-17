// Anzeige am Lead (Ole, 17.11.2026, Datenbasis Baustein 2): aus welcher Plattform, welchem Formular, welcher Kampagne,
// Anzeigengruppe und Anzeige ein Lead kam. Reine Funktionen ohne Datenbank: Übersetzung aus dem Meta-Lead-Abruf,
// aus Zapier (flache Felder) und aus Funnel-Payloads (UTM/Metadaten, nie Personendaten), dazu Zusammenführen und
// „nur leere Felder füllen“ für die Rückfüllung (lib/anzeige-rueckfuellung.ts).

/** Spalten an Lead und LeadReentry (gleiche Namen), alle optional. */
export type LeadAd = {
  adPlatform: string | null;
  adFormId: string | null;
  adCampaignId: string | null;
  adCampaignName: string | null;
  adSetId: string | null;
  adSetName: string | null;
  adId: string | null;
  adName: string | null;
};

export const AD_FIELDS = ["adPlatform", "adFormId", "adCampaignId", "adCampaignName", "adSetId", "adSetName", "adId", "adName"] as const satisfies readonly (keyof LeadAd)[];
const ID_FIELDS = new Set<keyof LeadAd>(["adFormId", "adCampaignId", "adSetId", "adId"]);

export const emptyAd = (): LeadAd => ({ adPlatform: null, adFormId: null, adCampaignId: null, adCampaignName: null, adSetId: null, adSetName: null, adId: null, adName: null });

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string => {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(", ");
  if (isObj(v)) return text(v.value ?? v.label ?? "");
  return String(v).trim();
};

/** Plattform vereinheitlichen: facebook → fb, instagram → ig, sonst klein geschrieben wie geliefert. */
export function normPlatform(raw: unknown): string | null {
  const s = text(raw).toLowerCase();
  if (!s) return null;
  if (s === "fb" || s.startsWith("facebook")) return "fb";
  if (s === "ig" || s.startsWith("instagram")) return "ig";
  if (s === "an" || s.includes("audience")) return "an";
  if (s === "msg" || s.startsWith("messenger")) return "msg";
  return s.slice(0, 40);
}

/** Werte säubern: leer → null, IDs ohne Leerzeichen und höchstens 64 Zeichen, Namen höchstens 300 Zeichen. */
export function cleanAd(input: Partial<Record<keyof LeadAd, unknown>> | null | undefined): LeadAd {
  const out = emptyAd();
  if (!input) return out;
  for (const k of AD_FIELDS) {
    const raw = input[k];
    if (k === "adPlatform") {
      out.adPlatform = normPlatform(raw);
      continue;
    }
    const s = text(raw);
    if (!s) continue;
    if (ID_FIELDS.has(k)) {
      // Platzhalter aus nicht ersetzten URL-Parametern ({{ad.id}}) sind keine IDs
      if (/[{}\s]/.test(s)) continue;
      out[k] = s.slice(0, 64);
    } else {
      if (/^\{\{.*\}\}$/.test(s)) continue;
      out[k] = s.slice(0, 300);
    }
  }
  return out;
}

export const hasAd = (a: Partial<LeadAd> | null | undefined) => !!a && AD_FIELDS.some((k) => !!a[k]);

/** Erster belegter Wert je Feld gewinnt (links vor rechts). */
export function mergeAd(...parts: (Partial<LeadAd> | null | undefined)[]): LeadAd {
  const out = emptyAd();
  for (const p of parts) {
    if (!p) continue;
    for (const k of AD_FIELDS) if (!out[k] && p[k]) out[k] = p[k] as string;
  }
  return out;
}

/**
 * Nur die Felder, die am Ziel leer sind und in `info` belegt (Rückfüllung, nie überschreiben).
 * Ergebnis leer = nichts zu tun.
 */
export function fillEmptyAd(current: Partial<LeadAd>, info: Partial<LeadAd>): Partial<LeadAd> {
  const out: Partial<LeadAd> = {};
  for (const k of AD_FIELDS) if (!current[k] && info[k]) out[k] = info[k];
  return out;
}

/** Nur belegte Felder (für create/update). */
export function adData(a: Partial<LeadAd> | null | undefined): Partial<LeadAd> {
  const out: Partial<LeadAd> = {};
  if (!a) return out;
  for (const k of AD_FIELDS) if (a[k]) out[k] = a[k];
  return out;
}

/** Meta-Lead (Graph API /{leadgen_id}). */
export function adFromMetaLead(l: {
  form_id?: string;
  platform?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
}): LeadAd {
  return cleanAd({
    adPlatform: l.platform,
    adFormId: l.form_id,
    adCampaignId: l.campaign_id,
    adCampaignName: l.campaign_name,
    adSetId: l.adset_id,
    adSetName: l.adset_name,
    adId: l.ad_id,
    adName: l.ad_name,
  });
}

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Schlüssel (normalisiert) je Feld; erster Treffer gewinnt. */
const FLAT_KEYS: Record<keyof LeadAd, string[]> = {
  adPlatform: ["platform", "sitesourcename"],
  adFormId: ["formid", "leadgenformid"],
  adCampaignId: ["campaignid", "fbcampaignid", "utmcampaignid"],
  adCampaignName: ["campaignname", "fbcampaignname"],
  adSetId: ["adsetid", "adgroupid", "fbadsetid", "utmadsetid"],
  adSetName: ["adsetname", "adgroupname", "fbadsetname"],
  adId: ["adid", "fbadid", "utmadid"],
  adName: ["adname", "fbadname"],
};

function pickFrom(sources: Obj[], keys: string[]): string {
  const want = new Set(keys);
  for (const src of sources) {
    for (const [k, v] of Object.entries(src)) {
      if (!want.has(norm(k))) continue;
      const s = text(v);
      if (s) return s;
    }
  }
  return "";
}

/** Zapier „Facebook Lead Ads“ und andere flache Payloads (ad_id, adset_id, campaign_id, form_id, platform …). */
export function adFromFlat(body: Obj): LeadAd {
  const out: Partial<Record<keyof LeadAd, unknown>> = {};
  for (const k of AD_FIELDS) out[k] = pickFrom([body], FLAT_KEYS[k]);
  return cleanAd(out);
}

/** Behälter, in denen Funnels (Perspective u. a.) Tracking-Angaben ablegen. Personendaten werden nie gelesen. */
const TRACKING_CONTAINERS = ["utm", "utms", "utmparams", "utmparameters", "tracking", "trackingparams", "metadata", "meta", "query", "queryparams", "urlparams", "params", "attribution", "hiddenfields", "values"];

/**
 * Funnel-Payload (Perspective, eigene Webhooks): ausdrückliche Felder (campaign_id, ad_id …) oder UTM-Parameter in
 * der von Meta vorgeschlagenen Belegung: utm_campaign = Kampagne, utm_term = Anzeigengruppe, utm_content = Anzeige,
 * utm_source = Plattform (facebook → fb). Reine Ziffern in einem UTM-Feld gelten als ID. Liest nur diese Schlüssel.
 */
export function adFromTracking(body: Obj): LeadAd {
  const sources: Obj[] = [body];
  for (const [k, v] of Object.entries(body)) {
    if (!isObj(v) || !TRACKING_CONTAINERS.includes(norm(k))) continue;
    sources.push(v);
    // eine Ebene tiefer (z. B. metadata.utm)
    for (const [k2, v2] of Object.entries(v)) if (isObj(v2) && TRACKING_CONTAINERS.includes(norm(k2))) sources.push(v2);
  }
  const explicit: Partial<Record<keyof LeadAd, unknown>> = {};
  for (const k of AD_FIELDS) explicit[k] = pickFrom(sources, FLAT_KEYS[k]);
  const utm = (key: string) => pickFrom(sources, [key]);
  const digits = (s: string) => /^\d{6,}$/.test(s);
  const fromUtm = (s: string) => (digits(s) ? { id: s, name: "" } : { id: "", name: s });
  const camp = fromUtm(utm("utmcampaign"));
  const set = fromUtm(utm("utmterm"));
  const ad = fromUtm(utm("utmcontent"));
  const source = utm("utmsource");
  return mergeAd(
    cleanAd(explicit),
    cleanAd({
      adPlatform: source,
      adCampaignId: camp.id,
      adCampaignName: camp.name,
      adSetId: set.id,
      adSetName: set.name,
      adId: ad.id,
      adName: ad.name,
      adFormId: pickFrom(sources, ["funnelid"]),
    }),
  );
}
