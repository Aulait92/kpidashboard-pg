// Meta Marketing API Wrapper. Lädt Bilder hoch, baut Ad-Creatives,
// erstellt Ads in einer Kampagne und aktiviert sie.
//
// Voraussetzungen (Env):
//   META_ACCESS_TOKEN      — System-User-Token mit ads_management
//   META_AD_ACCOUNT_ID     — Format "act_1234567890"
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
  const id = process.env.META_AD_ACCOUNT_ID;
  if (!id) throw new Error("META_AD_ACCOUNT_ID nicht gesetzt.");
  if (!id.startsWith("act_")) {
    throw new Error(`META_AD_ACCOUNT_ID muss mit "act_" anfangen: ${id}`);
  }
  return id;
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
};

export async function listCampaigns(): Promise<MetaCampaign[]> {
  const data = (await metaGet(`${getAdAccount()}/campaigns`, {
    fields: "id,name,status,effective_status",
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
  headline: string;
  body: string; // visuelle Sub-Headline IM Creative (90 Zeichen)
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
      // name = Headline unter dem Bild.
      name: opts.headline,
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
  campaignKey: string; // Keyword für Campaign-Match ("Wechsel", "Neugeschäft")
  headline: string;
  body: string;
  adText: string; // Facebook Primary-Text (long-form möglich)
  cta: string;
  imageUrl: string; // public URL (R2)
  activate: boolean;
}): Promise<{ campaignId: string; adId: string; imageHash: string }> {
  // 1. Kampagne finden
  const campaigns = await listCampaigns();
  const campaign = findCampaignByKeyword(campaigns, opts.campaignKey);
  if (!campaign) {
    throw new Error(
      `Keine Kampagne mit Keyword "${opts.campaignKey}" gefunden. Verfügbar: ${campaigns
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
  const creativeName = `Bot-${opts.campaignKey}-${timestamp}`;
  const { id: creativeId } = await createAdCreative({
    name: creativeName,
    imageHash: hash,
    headline: opts.headline,
    body: opts.body,
    adText: opts.adText,
    cta: opts.cta,
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
