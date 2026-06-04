// Meta Marketing API Wrapper. Lädt Bilder hoch, baut Ad-Creatives,
// erstellt Ads in einer Kampagne und aktiviert sie.
//
// Voraussetzungen (Env):
//   META_ACCESS_TOKEN      — System-User-Token mit ads_management
//   META_AD_ACCOUNT_IDS    — Format "act_1234567890" (oder kommagetrennt mehrere,
//                            erste wird genutzt). Alias: META_AD_ACCOUNT_ID.
//   META_DEFAULT_PAGE_ID   — Facebook-Page der Werbeanzeigen
//   META_DEFAULT_LINK_URL  — Landing-Page-URL (z.B. https://start.pkv-tarife.com/pkv-angebote)
//
// Optional:
//   META_DEFAULT_PIXEL_ID  — Conversion-Pixel für Tracking

const GRAPH_VERSION = "v22.0";

function getToken(): string {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error("META_ACCESS_TOKEN nicht gesetzt.");
  return t;
}

function getAdAccount(): string {
  // Akzeptiert META_AD_ACCOUNT_IDS (Plural, kommagetrennt erlaubt) oder
  // den Legacy-Namen META_AD_ACCOUNT_ID. Bei mehreren IDs wird die erste
  // benutzt — Multi-Account-Support ist noch nicht implementiert.
  const raw = process.env.META_AD_ACCOUNT_IDS ?? process.env.META_AD_ACCOUNT_ID;
  if (!raw) throw new Error("META_AD_ACCOUNT_IDS nicht gesetzt.");
  const first = raw.split(",")[0].trim();
  if (!first) throw new Error("META_AD_ACCOUNT_IDS ist leer.");
  // "act_"-Prefix ist Meta-Pflicht — wenn vergessen, automatisch ergänzen.
  return first.startsWith("act_") ? first : `act_${first}`;
}

async function metaGet(
  path: string,
  params: Record<string, string> = {},
): Promise<unknown> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
  url.searchParams.set("access_token", getToken());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Meta GET ${path} ${res.status}: ${text}`);
  }
  return JSON.parse(text) as unknown;
}

async function metaPost(
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;
  const formData = new URLSearchParams();
  formData.set("access_token", getToken());
  for (const [k, v] of Object.entries(body)) {
    formData.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Meta POST ${path} ${res.status}: ${text}`);
  }
  return JSON.parse(text) as unknown;
}

// ─── Campaign-Discovery ──────────────────────────────────────────────

export type MetaCampaign = {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  // daily_budget in Konto-Minor-Units (Cent). Nur gesetzt bei CBO-Kampagnen
  // (Campaign Budget Optimization) — sonst liegt das Budget im AdSet.
  daily_budget?: string;
};

export async function listCampaigns(): Promise<MetaCampaign[]> {
  const data = (await metaGet(`${getAdAccount()}/campaigns`, {
    fields: "id,name,status,effective_status,daily_budget",
    limit: "100",
    // Nur Kampagnen die nicht gelöscht sind.
    effective_status: JSON.stringify([
      "ACTIVE",
      "PAUSED",
      "PENDING_REVIEW",
      "PREAPPROVED",
    ]),
  })) as { data: MetaCampaign[] };
  return data.data;
}

// Alle Kampagnen, deren Name das Keyword enthält (case-insensitive). Für die
// Kunden-Zuordnung über Namens-Konvention.
export function findCampaignsByKeyword(
  campaigns: MetaCampaign[],
  keyword: string,
): MetaCampaign[] {
  const k = keyword.toLowerCase().trim();
  if (!k) return [];
  return campaigns.filter((c) => c.name.toLowerCase().includes(k));
}

// Klassifiziert eine Kampagne grob nach Produkt-Keyword im Namen.
export function findCampaignByKeyword(
  campaigns: MetaCampaign[],
  keyword: string,
): MetaCampaign | null {
  const k = keyword.toLowerCase();
  // Erst exakter Begriff-Match, dann Substring.
  const exact = campaigns.find((c) =>
    c.name.toLowerCase().split(/\W+/).includes(k),
  );
  if (exact) return exact;
  const fuzzy = campaigns.find((c) => c.name.toLowerCase().includes(k));
  return fuzzy ?? null;
}

// ─── Budget-Steuerung (Media Buyer) ──────────────────────────────────

export type MetaAdSet = {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  daily_budget?: string; // Cent, nur bei ABO (Budget liegt im AdSet)
};

export async function listAdSets(campaignId: string): Promise<MetaAdSet[]> {
  const data = (await metaGet(`${campaignId}/adsets`, {
    fields: "id,name,status,effective_status,daily_budget",
    limit: "50",
  })) as { data: MetaAdSet[] };
  return data.data ?? [];
}

// Wo das steuerbare Tagesbudget einer Kampagne sitzt:
//   - "campaign": CBO, Budget am Campaign-Objekt
//   - "adset":    ABO, Budget verteilt auf ein oder mehrere AdSets
//   - "none":     kein Tagesbudget gefunden (z.B. Lifetime-Budget) → nicht steuerbar
export type CampaignBudgetState = {
  campaignId: string;
  campaignName: string;
  level: "campaign" | "adset" | "none";
  status: string;
  effective_status: string;
  // Summe des Tagesbudgets in EUR über alle steuerbaren Einheiten.
  dailyBudgetEur: number;
  // Bei ABO: die AdSets, auf die sich das Budget verteilt (für Schreibzugriff).
  adSetIds: string[];
};

function centToEur(cent: string | undefined): number {
  if (!cent) return 0;
  const n = Number.parseInt(cent, 10);
  return Number.isFinite(n) ? n / 100 : 0;
}

function eurToCentString(eur: number): string {
  return String(Math.round(eur * 100));
}

// Liest den Budget-Zustand einer Kampagne zusammen (CBO vs. ABO).
export async function getCampaignBudgetState(
  campaign: MetaCampaign,
): Promise<CampaignBudgetState> {
  // CBO: Budget direkt am Campaign-Objekt.
  if (campaign.daily_budget) {
    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      level: "campaign",
      status: campaign.status,
      effective_status: campaign.effective_status,
      dailyBudgetEur: centToEur(campaign.daily_budget),
      adSetIds: [],
    };
  }

  // ABO: Budget in den AdSets. Wir steuern die AdSets, die ein Tagesbudget
  // haben (Lifetime-Budget-AdSets werden ignoriert).
  const adSets = await listAdSets(campaign.id);
  const budgeted = adSets.filter((a) => a.daily_budget);
  if (budgeted.length === 0) {
    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      level: "none",
      status: campaign.status,
      effective_status: campaign.effective_status,
      dailyBudgetEur: 0,
      adSetIds: [],
    };
  }
  const total = budgeted.reduce((s, a) => s + centToEur(a.daily_budget), 0);
  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    level: "adset",
    status: campaign.status,
    effective_status: campaign.effective_status,
    dailyBudgetEur: total,
    adSetIds: budgeted.map((a) => a.id),
  };
}

// Setzt das Tagesbudget einer Kampagne auf den gewünschten EUR-Gesamtwert.
// Bei ABO wird der Betrag gleichmäßig auf die budgetierten AdSets verteilt.
export async function setCampaignDailyBudget(
  state: CampaignBudgetState,
  newTotalEur: number,
): Promise<void> {
  if (state.level === "campaign") {
    await metaPost(state.campaignId, {
      daily_budget: eurToCentString(newTotalEur),
    });
    return;
  }
  if (state.level === "adset") {
    const per = newTotalEur / state.adSetIds.length;
    for (const adSetId of state.adSetIds) {
      await metaPost(adSetId, { daily_budget: eurToCentString(per) });
    }
    return;
  }
  throw new Error(
    `Kampagne ${state.campaignName} hat kein steuerbares Tagesbudget.`,
  );
}

export async function setCampaignStatus(
  campaignId: string,
  status: "ACTIVE" | "PAUSED",
): Promise<void> {
  await metaPost(campaignId, { status });
}

// Spend in einem beliebigen Zeitfenster je Kampagne (EUR). Wird vom Buyer
// in zwei Varianten genutzt:
//   • MTD (since=Monatsanfang) — fürs Display im Pool-Detail.
//   • Lookback (since=heute−N Tage) — für die CPL-Decision, damit der Buyer
//     auf jüngste Performance reagiert und nicht durch alte Monats-Daten
//     verzerrt wird.
export async function getSpendByCampaign(params: {
  since: Date;
  until: Date;
}): Promise<Map<string, number>> {
  const since = params.since.toISOString().slice(0, 10);
  const until = params.until.toISOString().slice(0, 10);
  const map = new Map<string, number>();
  const url = new URL(
    `https://graph.facebook.com/${GRAPH_VERSION}/${getAdAccount()}/insights`,
  );
  url.searchParams.set("access_token", getToken());
  url.searchParams.set("level", "campaign");
  url.searchParams.set("fields", "campaign_id,spend");
  url.searchParams.set("time_range", JSON.stringify({ since, until }));
  url.searchParams.set("limit", "500");

  let next: string | null = url.toString();
  while (next) {
    const res = await fetch(next, { cache: "no-store" });
    const text = await res.text();
    if (!res.ok) throw new Error(`Meta insights ${res.status}: ${text}`);
    const json = JSON.parse(text) as {
      data?: { campaign_id?: string; spend?: string }[];
      paging?: { next?: string };
    };
    for (const row of json.data ?? []) {
      if (!row.campaign_id) continue;
      const spend = Number.parseFloat(row.spend ?? "0");
      if (Number.isFinite(spend)) {
        map.set(row.campaign_id, (map.get(row.campaign_id) ?? 0) + spend);
      }
    }
    next = json.paging?.next ?? null;
  }
  return map;
}

// Bestehender Helper für MTD-Spend — behält Backwards-Kompat fürs Admin-UI.
export async function getMonthlySpendByCampaign(
  now: Date = new Date(),
): Promise<Map<string, number>> {
  return getSpendByCampaign({
    since: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    until: now,
  });
}

// Holt das erste aktive AdSet einer Kampagne (Ad muss in einem AdSet liegen).
export async function getFirstAdSetForCampaign(
  campaignId: string,
): Promise<{ id: string; name: string } | null> {
  const data = (await metaGet(`${campaignId}/adsets`, {
    fields: "id,name,status,effective_status",
    limit: "10",
  })) as { data: { id: string; name: string; effective_status: string }[] };
  const active = data.data.find(
    (a) =>
      a.effective_status === "ACTIVE" || a.effective_status === "PAUSED",
  );
  return active ? { id: active.id, name: active.name } : null;
}

// ─── Image Upload zu Ad Account ──────────────────────────────────────

export async function uploadAdImageFromUrl(
  imageUrl: string,
): Promise<{ hash: string }> {
  // Meta /adimages akzeptiert ein public URL via "url"-Parameter.
  const resp = (await metaPost(`${getAdAccount()}/adimages`, {
    url: imageUrl,
  })) as { images?: Record<string, { hash: string }> };
  const first = resp.images ? Object.values(resp.images)[0] : null;
  if (!first?.hash) {
    throw new Error(
      `Meta /adimages keine Hash zurückgegeben: ${JSON.stringify(resp).slice(0, 200)}`,
    );
  }
  return { hash: first.hash };
}

// ─── AdCreative anlegen ──────────────────────────────────────────────

export async function createAdCreative(opts: {
  name: string;
  imageHash: string;
  headline: string; // visuelle Hero-Headline (Kontext für Logging — landet nicht in Meta-Feldern)
  fbHeadline: string; // Facebook Headline unter dem Bild (name-Feld, max ~40 Zeichen)
  body: string; // visuelle Sub-Headline IM Creative — bei Meta description-Feld
  adText: string; // Facebook Primary-Text ÜBER dem Bild im Feed (kann long-form)
  cta: string; // freier Text, wird in Meta nur als CTA-Button-Type übersetzt
  linkUrl?: string;
  pageId?: string;
}): Promise<{ id: string }> {
  const pageId = opts.pageId ?? process.env.META_DEFAULT_PAGE_ID;
  const linkUrl = opts.linkUrl ?? process.env.META_DEFAULT_LINK_URL;
  if (!pageId) throw new Error("META_DEFAULT_PAGE_ID nicht gesetzt.");
  if (!linkUrl) throw new Error("META_DEFAULT_LINK_URL nicht gesetzt.");

  // Meta-CTA-Type-Enum (Auswahl). Wir mappen freien CTA-Text auf den
  // semantisch nächsten Enum-Wert.
  const ctaType = guessCtaType(opts.cta);

  const objectStorySpec = {
    page_id: pageId,
    link_data: {
      image_hash: opts.imageHash,
      link: linkUrl,
      // message = Primary-Text über dem Bild im Facebook-Feed.
      // Fallback auf body, falls adText leer (alte Daten ohne adText).
      message: opts.adText || opts.body,
      // name = Facebook Headline unter dem Bild. Fallback auf visuelle
      // Hero-Headline falls fbHeadline leer (alte Daten ohne fbHeadline).
      name: opts.fbHeadline || opts.headline,
      // description = optionaler kleiner Untertitel unter der Headline.
      description: opts.body,
      call_to_action: {
        type: ctaType,
        value: { link: linkUrl },
      },
    },
  };

  const resp = (await metaPost(`${getAdAccount()}/adcreatives`, {
    name: opts.name,
    object_story_spec: objectStorySpec,
    degrees_of_freedom_spec: JSON.stringify({
      creative_features_spec: { standard_enhancements: { enroll_status: "OPT_OUT" } },
    }),
  })) as { id: string };
  return resp;
}

function guessCtaType(_: string): string {
  // Für PKV-Lead-Funnel ist GET_QUOTE oder LEARN_MORE typisch.
  // Bewusst defensiv: wir verwenden LEARN_MORE als sicheren Default —
  // funktioniert für alle Sales-Objectives.
  return "LEARN_MORE";
}

// ─── Ad in einem AdSet erstellen ─────────────────────────────────────

export async function createAd(opts: {
  name: string;
  adSetId: string;
  creativeId: string;
  active: boolean;
}): Promise<{ id: string }> {
  const resp = (await metaPost(`${getAdAccount()}/ads`, {
    name: opts.name,
    adset_id: opts.adSetId,
    creative: JSON.stringify({ creative_id: opts.creativeId }),
    status: opts.active ? "ACTIVE" : "PAUSED",
  })) as { id: string };
  return resp;
}

// ─── End-to-End: Variante komplett in Kampagne einbauen ─────────────

export async function publishVariantToCampaign(opts: {
  campaignKey: string; // Keyword für Campaign-Match ("Wechsel", "Neugeschäft", "Kinderwunsch")
  region?: string | null; // bei Kinderwunsch: Region für die Regions-Kampagne
  linkUrl?: string; // Landingpage; default META_DEFAULT_LINK_URL
  headline: string;
  fbHeadline: string;
  body: string;
  adText: string; // Facebook Primary-Text (long-form möglich)
  cta: string;
  imageUrl: string; // public URL (R2)
  activate: boolean;
}): Promise<{ campaignId: string; adId: string; imageHash: string }> {
  // 1. Kampagne finden. Mit Region (z. B. Kinderwunsch) muss der Name BEIDE
  // Begriffe enthalten — sonst würde "Kinderwunsch" irgendeine Regions-
  // Kampagne treffen.
  const campaigns = await listCampaigns();
  const region = opts.region?.trim();
  let campaign: MetaCampaign | null;
  if (region) {
    const k = opts.campaignKey.toLowerCase();
    const r = region.toLowerCase();
    campaign =
      campaigns.find(
        (c) =>
          c.name.toLowerCase().includes(k) && c.name.toLowerCase().includes(r),
      ) ?? null;
  } else {
    campaign = findCampaignByKeyword(campaigns, opts.campaignKey);
  }
  if (!campaign) {
    const gesucht = region ? `"${opts.campaignKey}" + "${region}"` : `"${opts.campaignKey}"`;
    throw new Error(
      `Keine Kampagne mit Keyword ${gesucht} gefunden. Verfügbar: ${campaigns
        .map((c) => c.name)
        .join(", ")}`,
    );
  }

  // 2. AdSet (Ad muss in ein AdSet)
  const adSet = await getFirstAdSetForCampaign(campaign.id);
  if (!adSet) {
    throw new Error(
      `Kampagne "${campaign.name}" hat kein aktives AdSet — bitte zuerst eines anlegen.`,
    );
  }

  // 3. Bild zu Meta hochladen (Hash bekommen)
  const { hash } = await uploadAdImageFromUrl(opts.imageUrl);

  // 4. Creative anlegen
  const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const creativeName = `Bot-${opts.campaignKey}${region ? `-${region}` : ""}-${timestamp}`;
  const { id: creativeId } = await createAdCreative({
    name: creativeName,
    imageHash: hash,
    headline: opts.headline,
    fbHeadline: opts.fbHeadline,
    body: opts.body,
    adText: opts.adText,
    cta: opts.cta,
    linkUrl: opts.linkUrl,
  });

  // 5. Ad anlegen
  const { id: adId } = await createAd({
    name: creativeName,
    adSetId: adSet.id,
    creativeId,
    active: opts.activate,
  });

  return { campaignId: campaign.id, adId, imageHash: hash };
}
