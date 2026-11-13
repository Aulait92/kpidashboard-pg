// Kampagnen-Agenten – „Bauer“ (kein KI): legt Kampagne, Anzeigengruppen,
// Sofortformular, Bilder, Creatives und Anzeigen über die Marketing API an.
// ALLES mit status PAUSED – veröffentlicht wird von Hand im Werbeanzeigenmanager.
// Idempotent: Jede angelegte ID wird sofort gespeichert (onProgress), ein
// erneuter Lauf überspringt Vorhandenes und macht an der Fehlerstelle weiter.

import { cleanToken, redactTokens } from "@/lib/meta-leads";
import type { AdCopy, BuiltState, CampaignContext, CampaignPlan, CreativeImage, LeadFormDraft } from "@/lib/kampagnen/types";

const GRAPH = "https://graph.facebook.com/v22.0";

export interface MetaApi {
  get<T>(path: string, params?: Record<string, string>, token?: string): Promise<T>;
  post<T>(path: string, body: Record<string, unknown>, token?: string): Promise<T>;
  del(path: string, token?: string): Promise<void>;
}

function systemToken(): string {
  const t = cleanToken(process.env.META_ACCESS_TOKEN);
  if (!t) throw new Error("META_ACCESS_TOKEN nicht gesetzt.");
  return t;
}

/** Graph API mit dem System-User-Token (bzw. Seiten-Token für Formulare). */
export const graphApi: MetaApi = {
  async get<T>(path: string, params: Record<string, string> = {}, token?: string) {
    const url = new URL(`${GRAPH}/${path}`);
    url.searchParams.set("access_token", token ?? systemToken());
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    if (!res.ok) throw new Error(redactTokens(`Meta GET ${path.split("?")[0]} ${res.status}: ${text.slice(0, 400)}`));
    return JSON.parse(text) as T;
  },
  async post<T>(path: string, body: Record<string, unknown>, token?: string) {
    const form = new URLSearchParams();
    form.set("access_token", token ?? systemToken());
    for (const [k, v] of Object.entries(body)) form.set(k, typeof v === "string" ? v : JSON.stringify(v));
    const res = await fetch(`${GRAPH}/${path}`, { method: "POST", body: form, signal: AbortSignal.timeout(60000) });
    const text = await res.text();
    if (!res.ok) throw new Error(redactTokens(`Meta POST ${path} ${res.status}: ${text.slice(0, 400)}`));
    return JSON.parse(text) as T;
  },
  async del(path: string, token?: string) {
    const url = new URL(`${GRAPH}/${path}`);
    url.searchParams.set("access_token", token ?? systemToken());
    const res = await fetch(url, { method: "DELETE", signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(redactTokens(`Meta DELETE ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`));
  },
};

/**
 * Sicherheitsnetz: Dieser Bauer darf NIE etwas aktiv schalten. Jeder Status, der
 * nicht PAUSED (bzw. ARCHIVED beim Aufräumen) ist, bricht mit Fehler ab.
 */
export function assertNotActive(body: Record<string, unknown>): void {
  for (const key of ["status", "configured_status"]) {
    const v = body[key];
    if (v != null && v !== "PAUSED" && v !== "ARCHIVED") throw new Error(`Sicherheitsstopp: ${key}=${String(v)} ist nicht erlaubt (nur PAUSED).`);
  }
}

const safePost = <T>(api: MetaApi, path: string, body: Record<string, unknown>, token?: string) => {
  assertNotActive(body);
  return api.post<T>(path, body, token);
};

/** Verständliche Meldung für typische Zugriffsfehler. */
export function explainMetaError(msg: string, ctx: Pick<CampaignContext, "adAccountId" | "pageId">): string {
  if (/ads_management|ads_read|has NOT grant/i.test(msg)) {
    return `Kein Zugriff zum Verwalten des Werbekontos act_${ctx.adAccountId}: Der Kunde muss unserem Business Manager Partnerzugriff auf das Werbekonto mit der Berechtigung „Kampagnen verwalten“ geben, und das Konto muss unserem Systemnutzer zugewiesen sein. (${msg.slice(0, 200)})`;
  }
  if (/Seiten-Token|access_token|pages_manage|leads_retrieval|Page/i.test(msg) && /permission|Berechtigung|Token|#10|#200|#190/i.test(msg)) {
    return `Kein Zugriff auf die Facebook-Seite ${ctx.pageId}: Der Kunde muss uns Partnerzugriff auf die Seite geben (inkl. Leads), und die Seite muss unserem Systemnutzer zugewiesen sein. (${msg.slice(0, 200)})`;
  }
  return msg;
}

export async function pageAccessToken(api: MetaApi, pageId: string): Promise<string> {
  const res = await api.get<{ access_token?: string }>(pageId, { fields: "access_token" });
  if (!res.access_token) throw new Error("Kein Seiten-Token (fehlt der Zugriff auf die Seite?)");
  return res.access_token;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "antwort";

/** Payload für POST /{page_id}/leadgen_forms (Felder laut Graph-Referenz „Page leadgen_forms“). */
export function leadFormPayload(form: LeadFormDraft, ctx: Pick<CampaignContext, "privacyUrl" | "website" | "advisorName" | "bookingUrl">): Record<string, unknown> {
  if (!ctx.privacyUrl) throw new Error("Datenschutz-URL fehlt.");
  return {
    name: form.formName,
    locale: "DE_DE",
    block_display_for_non_targeted_viewer: true,
    questions: [
      ...form.questions.map((q) => ({
        type: "CUSTOM",
        key: q.key,
        label: q.label,
        ...(q.options.length ? { options: q.options.map((o) => ({ key: slug(o), value: o })) } : {}),
      })),
      { type: "FULL_NAME", key: "full_name" },
      { type: "PHONE", key: "phone_number" },
      { type: "EMAIL", key: "email" },
    ],
    privacy_policy: { url: ctx.privacyUrl, link_text: "Datenschutzerklärung" },
    context_card: { title: form.introTitle, style: "PARAGRAPH_STYLE", content: form.introParagraphs, button_text: "Weiter" },
    custom_disclaimer: {
      title: "Einwilligung",
      body: { text: form.consentText },
      checkboxes: [{ key: "einwilligung_kontakt", text: "Ich bin einverstanden.", is_required: true, is_checked_by_default: false }],
    },
    // Dankeseite: immer zum Buchungskalender des Kunden (Ole, 13.11.2026), sonst Website
    thank_you_page: ctx.bookingUrl
      ? { title: form.thankYouTitle, body: form.thankYouBody, button_type: "VIEW_WEBSITE", button_text: "Jetzt Termin buchen", website_url: ctx.bookingUrl }
      : ctx.website
        ? { title: form.thankYouTitle, body: form.thankYouBody, button_type: "VIEW_WEBSITE", button_text: "Zur Website", website_url: ctx.website }
        : { title: form.thankYouTitle, body: form.thankYouBody, button_type: "NONE" },
    ...(ctx.bookingUrl ? { follow_up_action_url: ctx.bookingUrl } : ctx.website ? { follow_up_action_url: ctx.website } : {}),
  };
}

/** Targeting einer Anzeigengruppe (Felder laut „Basic Targeting“). */
export function adSetTargeting(adSet: CampaignPlan["adSets"][number], geoKey: string | null): Record<string, unknown> {
  const geo = geoKey
    ? { cities: [{ key: geoKey, radius: Math.min(80, Math.max(17, adSet.radiusKm)), distance_unit: "kilometer" }] }
    : { countries: ["DE"] };
  // Mit Advantage+ Zielgruppe gelten Alter als Vorschlag; Meta erlaubt dann nur
  // eine weite Altersgrenze – deshalb age_max 65 und age_min höchstens 25.
  const ageMin = adSet.advantageAudience ? Math.min(adSet.ageMin, 25) : adSet.ageMin;
  const ageMax = adSet.advantageAudience ? 65 : adSet.ageMax;
  return {
    geo_locations: { ...geo, location_types: ["home", "recent"] },
    age_min: ageMin,
    age_max: ageMax,
    targeting_automation: { advantage_audience: adSet.advantageAudience ? 1 : 0 },
  };
}

export type BuildInput = {
  ctx: CampaignContext;
  plan: CampaignPlan;
  copies: AdCopy[];
  images: CreativeImage[];
  form: LeadFormDraft;
  built: BuiltState;
  onProgress: (built: BuiltState) => Promise<void>;
};

/** Alles pausiert anlegen. Gibt den neuen Stand zurück; wirft bei Fehlern (Stand ist dann schon gespeichert). */
export async function buildCampaign(api: MetaApi, input: BuildInput): Promise<BuiltState> {
  const { ctx, plan, copies, images, form } = input;
  const built: BuiltState = { ...input.built, adSetIds: [...input.built.adSetIds], imageHashes: [...input.built.imageHashes], creativeIds: [...input.built.creativeIds], adIds: [...input.built.adIds] };
  const save = () => input.onProgress(built);
  if (!ctx.adAccountId) throw new Error("Kein Werbekonto hinterlegt.");
  if (!ctx.pageId) throw new Error("Keine Facebook-Seite hinterlegt.");
  const act = `act_${ctx.adAccountId}`;

  // 1. Kampagne (Kampagnenbudget, Ziel Leads)
  if (!built.campaignId) {
    const r = await safePost<{ id: string }>(api, `${act}/campaigns`, {
      name: plan.campaignName,
      objective: "OUTCOME_LEADS",
      status: "PAUSED",
      special_ad_categories: plan.specialAdCategories,
      buying_type: "AUCTION",
      daily_budget: Math.round(plan.dailyBudgetEur * 100),
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    });
    built.campaignId = r.id;
    await save();
  }

  // 2. Ort → Meta-Standortschlüssel (Stadt), sonst Deutschland
  if (built.geoKey === undefined) {
    let key: string | null = null;
    const q = ctx.city ?? ctx.region;
    if (q) {
      const r = await api.get<{ data: { key: string; name: string; country_code?: string }[] }>("search", {
        type: "adgeolocation",
        location_types: JSON.stringify(["city"]),
        q,
        country_code: "DE",
        limit: "5",
      });
      key = r.data.find((d) => !d.country_code || d.country_code === "DE")?.key ?? null;
    }
    built.geoKey = key;
    await save();
  }

  // 3. Anzeigengruppen
  for (let i = 0; i < plan.adSets.length; i++) {
    if (built.adSetIds[i]) continue;
    const a = plan.adSets[i];
    const r = await safePost<{ id: string }>(api, `${act}/adsets`, {
      name: `${plan.campaignName} | ${a.name}`.slice(0, 200),
      campaign_id: built.campaignId,
      optimization_goal: "LEAD_GENERATION",
      billing_event: "IMPRESSIONS",
      destination_type: "ON_AD",
      promoted_object: { page_id: ctx.pageId },
      targeting: adSetTargeting(a, built.geoKey ?? null),
      status: "PAUSED",
    });
    built.adSetIds[i] = r.id;
    await save();
  }

  // 4. Sofortformular (mit dem Seiten-Token)
  const pageToken = await pageAccessToken(api, ctx.pageId);
  if (!built.formId) {
    const r = await safePost<{ id: string }>(api, `${ctx.pageId}/leadgen_forms`, leadFormPayload(form, ctx), pageToken);
    built.formId = r.id;
    await save();
  }

  // 5. Bilder, Creatives, Anzeigen (nur Anzeigen mit Bild)
  const pairs = copies.map((c, i) => ({ copy: c, image: images.find((im) => im.angleKey === c.angleKey) ?? images[i] ?? null })).filter((p) => p.image);
  for (let i = 0; i < pairs.length; i++) {
    const { copy, image } = pairs[i];
    if (!built.imageHashes[i]) {
      const r = await api.post<{ images?: Record<string, { hash: string }> }>(`${act}/adimages`, { url: image!.imageUrl });
      const hash = r.images ? Object.values(r.images)[0]?.hash : undefined;
      if (!hash) throw new Error("Meta /adimages lieferte keinen Hash.");
      built.imageHashes[i] = hash;
      await save();
    }
    if (!built.creativeIds[i]) {
      const r = await safePost<{ id: string }>(api, `${act}/adcreatives`, {
        name: `${plan.campaignName} | ${copy.angleKey}`.slice(0, 200),
        object_story_spec: {
          page_id: ctx.pageId,
          link_data: {
            image_hash: built.imageHashes[i],
            link: "http://fb.me/",
            message: copy.primaryText,
            name: copy.headline,
            description: copy.description,
            call_to_action: { type: copy.cta, value: { lead_gen_form_id: built.formId } },
          },
        },
      });
      built.creativeIds[i] = r.id;
      await save();
    }
  }
  // Je Anzeigengruppe alle Creatives als Anzeige (Index = adSet * n + creative)
  for (let s = 0; s < built.adSetIds.length; s++) {
    for (let i = 0; i < built.creativeIds.length; i++) {
      const idx = s * built.creativeIds.length + i;
      if (built.adIds[idx]) continue;
      const r = await safePost<{ id: string }>(api, `${act}/ads`, {
        name: `${plan.campaignName} | ${pairs[i]?.copy.angleKey ?? i + 1}`.slice(0, 200),
        adset_id: built.adSetIds[s],
        creative: { creative_id: built.creativeIds[i] },
        status: "PAUSED",
      });
      built.adIds[idx] = r.id;
      await save();
    }
  }
  return built;
}

export type RefreshBuildInput = {
  ctx: CampaignContext;
  namePrefix: string;
  adSetId: string;
  formId: string;
  copies: AdCopy[];
  images: CreativeImage[];
  built: BuiltState;
  onProgress: (built: BuiltState) => Promise<void>;
};

/**
 * Creative-Auffrischung: neue Bilder, Creatives und Anzeigen in einer BESTEHENDEN
 * Anzeigengruppe – alles PAUSED, bestehende Anzeigen werden nicht angefasst.
 */
export async function buildRefreshAds(api: MetaApi, input: RefreshBuildInput): Promise<BuiltState> {
  const { ctx, copies, images } = input;
  const built: BuiltState = { ...input.built, adSetIds: [input.adSetId], formId: input.formId, imageHashes: [...input.built.imageHashes], creativeIds: [...input.built.creativeIds], adIds: [...input.built.adIds] };
  const save = () => input.onProgress(built);
  if (!ctx.adAccountId) throw new Error("Kein Werbekonto hinterlegt.");
  if (!ctx.pageId) throw new Error("Keine Facebook-Seite hinterlegt.");
  const act = `act_${ctx.adAccountId}`;
  const pairs = copies.map((c, i) => ({ copy: c, image: images.find((im) => im.angleKey === c.angleKey) ?? images[i] ?? null })).filter((p) => p.image);
  for (let i = 0; i < pairs.length; i++) {
    const { copy, image } = pairs[i];
    if (!built.imageHashes[i]) {
      const r = await api.post<{ images?: Record<string, { hash: string }> }>(`${act}/adimages`, { url: image!.imageUrl });
      const hash = r.images ? Object.values(r.images)[0]?.hash : undefined;
      if (!hash) throw new Error("Meta /adimages lieferte keinen Hash.");
      built.imageHashes[i] = hash;
      await save();
    }
    if (!built.creativeIds[i]) {
      const r = await safePost<{ id: string }>(api, `${act}/adcreatives`, {
        name: `${input.namePrefix} | ${copy.angleKey}`.slice(0, 200),
        object_story_spec: {
          page_id: ctx.pageId,
          link_data: {
            image_hash: built.imageHashes[i],
            link: "http://fb.me/",
            message: copy.primaryText,
            name: copy.headline,
            description: copy.description,
            call_to_action: { type: copy.cta, value: { lead_gen_form_id: input.formId } },
          },
        },
      });
      built.creativeIds[i] = r.id;
      await save();
    }
    if (!built.adIds[i]) {
      const r = await safePost<{ id: string }>(api, `${act}/ads`, {
        name: `${input.namePrefix} | ${copy.angleKey}`.slice(0, 200),
        adset_id: input.adSetId,
        creative: { creative_id: built.creativeIds[i] },
        status: "PAUSED",
      });
      built.adIds[i] = r.id;
      await save();
    }
  }
  return built;
}

/** Aufräumen nach Abbruch: Kampagne löschen (mit Gruppen/Anzeigen), Formular archivieren. */
export async function cleanupCampaign(api: MetaApi, ctx: Pick<CampaignContext, "pageId">, built: BuiltState): Promise<string[]> {
  const done: string[] = [];
  if (built.campaignId) {
    await api.del(built.campaignId);
    done.push("Kampagne gelöscht (inkl. Anzeigengruppen und Anzeigen)");
  }
  if (built.formId && ctx.pageId) {
    const token = await pageAccessToken(api, ctx.pageId);
    await safePost(api, built.formId, { status: "ARCHIVED" }, token);
    done.push("Formular archiviert");
  }
  return done;
}

export const adsManagerUrl = (adAccountId: string, campaignId: string) =>
  `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${adAccountId}&selected_campaign_ids=${campaignId}`;
export const formUrl = (pageId: string, formId: string) => `https://business.facebook.com/latest/instant_forms/forms?asset_id=${pageId}&form_id=${formId}`;
