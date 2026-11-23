// Eigene Gewinner (Ole, 21.11.2026): Beim Bauen einer Kampagne orientiert sich das KI-Team an den bestlaufenden
// Anzeigen aus dem EIGENEN, angebundenen Meta-Werbekonto des Kunden (Customer.metaAdAccountId), mit Vorrang vor der
// Meta-Werbebibliothek (die liefert in Produktion meist nichts, fehlende App-Berechtigung).
//
// Ablauf: Insights der letzten 90 Tage auf Anzeigenebene (Ausgaben, Leads laut Meta, CTR), dazu echte Leads und
// Termine je Anzeige aus unserer Datenbank (Lead.adId). Bestperformer: mindestens 50 € Ausgaben oder 5 Leads,
// sortiert nach Kosten je Termin (wenn genug Termine da sind), sonst nach Kosten je Lead; passende Produkte zuerst,
// höchstens 5. Danach die Creative-Inhalte (Primärtext, Überschrift, Beschreibung, Button, Bild bzw. Video-Vorschau).
// Fehler (z. B. keine Berechtigung) → leer + Hinweis für den Admin; Tokens werden nie geloggt (redactTokens).

import { redactTokens } from "@/lib/meta-leads";
import { produktMuster } from "@/lib/kampagnen/ad-library";
import type { MetaApi } from "@/lib/kampagnen/builder";
import type { EigenerGewinner } from "@/lib/kampagnen/types";

export const GEWINNER_FENSTER_TAGE = 90;
export const MIN_AUSGABEN_EUR = 50;
export const MIN_LEADS = 5;
export const MAX_GEWINNER = 5;
/** Kosten je Termin nur, wenn mindestens zwei Anzeigen je mindestens zwei Termine haben (sonst Zufall). */
const MIN_TERMINE = 2;
const MAX_SEITEN = 5;

export type AdInsightAgg = {
  ad_id?: string;
  ad_name?: string;
  campaign_name?: string;
  adset_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  actions?: { action_type: string; value: string }[];
};

export type Kandidat = {
  adId: string;
  name: string;
  kampagne: string | null;
  anzeigengruppe: string | null;
  ausgaben: number;
  impressionen: number;
  ctr: number | null;
  metaLeads: number;
};

// Wie lib/anzeige-kosten.ts (dort mit Datenbank-Import, hier bewusst ohne): höchster Wert der Lead-Aktionen
const LEAD_ACTIONS = ["onsite_conversion.lead_grouped", "lead", "leadgen_grouped"];
const metaLeadsOf = (r: Pick<AdInsightAgg, "actions">) =>
  Math.max(0, ...(r.actions ?? []).filter((a) => LEAD_ACTIONS.includes(a.action_type)).map((a) => Math.round(Number(a.value) || 0)));

const num = (v: string | undefined) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const rund = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Eine Insights-Zeile (level=ad, ohne Tagesaufteilung) übersetzen; ohne Anzeigen-ID null. */
export function kandidatAusInsight(r: AdInsightAgg): Kandidat | null {
  if (!r.ad_id) return null;
  const impressionen = Math.round(num(r.impressions));
  const clicks = num(r.clicks);
  const ctr = r.ctr != null && r.ctr !== "" ? num(r.ctr) : impressionen > 0 ? (clicks / impressionen) * 100 : null;
  return {
    adId: r.ad_id,
    name: (r.ad_name ?? "").trim() || r.ad_id,
    kampagne: r.campaign_name?.trim() || null,
    anzeigengruppe: r.adset_name?.trim() || null,
    ausgaben: rund(num(r.spend)),
    impressionen,
    ctr: ctr == null ? null : rund(ctr),
    metaLeads: metaLeadsOf(r),
  };
}

export type LeadZahlen = { leads: number; termine: number };

export type Bewertet = Kandidat & {
  leads: number;
  leadsQuelle: "app" | "meta";
  termine: number | null;
  cpl: number;
  kostenJeTermin: number | null;
  passtZumProdukt: boolean;
};

/**
 * Bestperformer wählen (reine Funktion): mindestens 50 € Ausgaben oder 5 Leads (und mindestens 1 Lead),
 * Leads aus unserer Datenbank bevorzugt, Rangfolge nach Kosten je Termin (wenn genug Termine da sind), sonst nach
 * Kosten je Lead; zum Produkt passende Anzeigen zuerst, aufgefüllt mit den übrigen, höchstens `max`.
 */
export function waehleBestperformer(
  kandidaten: Kandidat[],
  opts: { leadZahlen?: Map<string, LeadZahlen>; passtZumProdukt?: (k: Kandidat) => boolean; max?: number } = {},
): Bewertet[] {
  const bewertet: Bewertet[] = [];
  for (const k of kandidaten) {
    const app = opts.leadZahlen?.get(k.adId);
    const ausApp = !!app && app.leads > 0;
    const leads = ausApp ? app.leads : k.metaLeads;
    if (leads < 1 || (k.ausgaben < MIN_AUSGABEN_EUR && leads < MIN_LEADS) || k.ausgaben <= 0) continue;
    const termine = ausApp ? app.termine : null;
    bewertet.push({
      ...k,
      leads,
      leadsQuelle: ausApp ? "app" : "meta",
      termine,
      cpl: rund(k.ausgaben / leads),
      kostenJeTermin: termine && termine > 0 ? rund(k.ausgaben / termine) : null,
      passtZumProdukt: opts.passtZumProdukt?.(k) ?? false,
    });
  }
  const nachTerminen = bewertet.filter((b) => (b.termine ?? 0) >= MIN_TERMINE).length >= 2;
  const wert = (b: Bewertet) => (nachTerminen ? (b.termine && b.termine > 0 ? b.ausgaben / b.termine : Infinity) : b.cpl);
  bewertet.sort((a, b) => wert(a) - wert(b) || a.cpl - b.cpl || b.leads - a.leads);
  const passend = bewertet.filter((b) => b.passtZumProdukt);
  const rest = bewertet.filter((b) => !b.passtZumProdukt);
  return [...passend, ...rest].slice(0, opts.max ?? MAX_GEWINNER);
}

/** Erkennt, ob eine Anzeige zum Produkt der neuen Kampagne gehört (Produktfamilie bzw. Produkt-Matcher). */
export function produktPruefer(product: string, matcher?: (name: string) => string | null): (k: Kandidat) => boolean {
  const muster = produktMuster(product);
  const ziel = matcher?.(product) ?? null;
  return (k) => {
    const text = [k.kampagne, k.anzeigengruppe, k.name].filter(Boolean).join(" ");
    if (muster?.test(text)) return true;
    if (ziel && matcher) return [k.kampagne, k.name].some((n) => !!n && matcher(n) === ziel);
    return false;
  };
}

// ─── Creative-Inhalte ──────────────────────────────────────────────────

type TextAsset = { text?: string };
export type AdCreativeJson = {
  name?: string;
  creative?: {
    body?: string;
    title?: string;
    image_url?: string;
    thumbnail_url?: string;
    call_to_action_type?: string;
    video_id?: string;
    object_type?: string;
    object_story_spec?: {
      link_data?: { message?: string; name?: string; description?: string; picture?: string; call_to_action?: { type?: string } };
      video_data?: { message?: string; title?: string; link_description?: string; image_url?: string; video_id?: string; call_to_action?: { type?: string } };
    };
    asset_feed_spec?: {
      bodies?: TextAsset[];
      titles?: TextAsset[];
      descriptions?: TextAsset[];
      images?: { url?: string }[];
      videos?: { video_id?: string; thumbnail_url?: string }[];
      call_to_action_types?: string[];
    };
  };
};

export type CreativeInhalt = Pick<EigenerGewinner, "primaryText" | "headline" | "description" | "cta" | "bildUrl" | "video">;

const erster = (...werte: (string | undefined | null)[]) => werte.map((w) => (w ?? "").trim()).find(Boolean) || null;

/** Creative einer Anzeige in Texte und Bild übersetzen (klassische Anzeige, Video oder dynamisches Creative). */
export function creativeInhalt(ad: AdCreativeJson | undefined): CreativeInhalt {
  const c = ad?.creative ?? {};
  const link = c.object_story_spec?.link_data;
  const vid = c.object_story_spec?.video_data;
  const feed = c.asset_feed_spec;
  const video = !!(c.video_id || vid?.video_id || vid || feed?.videos?.length || /video/i.test(c.object_type ?? ""));
  return {
    primaryText: erster(c.body, link?.message, vid?.message, feed?.bodies?.[0]?.text)?.slice(0, 1200) ?? null,
    headline: erster(c.title, link?.name, vid?.title, feed?.titles?.[0]?.text)?.slice(0, 200) ?? null,
    description: erster(link?.description, vid?.link_description, feed?.descriptions?.[0]?.text)?.slice(0, 300) ?? null,
    cta: erster(c.call_to_action_type, link?.call_to_action?.type, vid?.call_to_action?.type, feed?.call_to_action_types?.[0]),
    bildUrl: erster(c.image_url, link?.picture, vid?.image_url, feed?.images?.[0]?.url, feed?.videos?.[0]?.thumbnail_url, c.thumbnail_url),
    video,
  };
}

// ─── Laden ─────────────────────────────────────────────────────────────

export type GewinnerDeps = {
  meta: MetaApi;
  /** Echte Leads und Termine je Anzeige aus unserer Datenbank (seit `since`). */
  leadZahlen: (customerId: string, adIds: string[], since: Date) => Promise<Map<string, LeadZahlen>>;
  matcher?: (name: string) => string | null;
  now?: Date;
};

export type EigeneGewinnerErgebnis = { gewinner: EigenerGewinner[]; hinweis: string | null };

const ymd = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);

/** Verständlicher Hinweis zu einem Meta-Fehler (ohne Token). */
export function gewinnerFehlerHinweis(err: unknown, adAccountId: string): string {
  const msg = redactTokens(err instanceof Error ? err.message : String(err));
  if (/permission|berechtigung|ads_read|ads_management|#10\b|#200|code":\s*(10|200|190)\b|\(#(10|200|190)\)/i.test(msg)) {
    return `Eigene Gewinner nicht genutzt: kein Lesezugriff auf die Statistik des Werbekontos act_${adAccountId} (Berechtigung ads_read bzw. Partnerzugriff fehlt).`;
  }
  return `Eigene Gewinner nicht genutzt: Werbekonto act_${adAccountId} nicht lesbar (${msg.slice(0, 160)}).`;
}

async function ladeInsights(meta: MetaApi, adAccountId: string, since: string, until: string): Promise<AdInsightAgg[]> {
  const rows: AdInsightAgg[] = [];
  let after: string | undefined;
  for (let seite = 0; seite < MAX_SEITEN; seite++) {
    const res = await meta.get<{ data?: AdInsightAgg[]; paging?: { next?: string; cursors?: { after?: string } } }>(`act_${adAccountId}/insights`, {
      level: "ad",
      fields: "ad_id,ad_name,campaign_name,adset_name,spend,impressions,clicks,ctr,actions",
      time_range: JSON.stringify({ since, until }),
      limit: "500",
      ...(after ? { after } : {}),
    });
    rows.push(...(res.data ?? []));
    after = res.paging?.next ? res.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return rows;
}

const CREATIVE_FIELDS =
  "name,creative{body,title,image_url,thumbnail_url,call_to_action_type,video_id,object_type,object_story_spec,asset_feed_spec}";

/** Bestlaufende Anzeigen des eigenen Werbekontos. Ohne Konto: leer ohne Hinweis; bei Fehlern: leer mit Hinweis. */
export async function ladeEigeneGewinner(
  input: { customerId: string; adAccountId: string | null | undefined; product: string },
  deps: GewinnerDeps,
): Promise<EigeneGewinnerErgebnis> {
  const konto = (input.adAccountId ?? "").trim().replace(/^act_/, "");
  if (!/^\d+$/.test(konto)) return { gewinner: [], hinweis: null };
  const now = deps.now ?? new Date();
  const sinceDate = new Date(now.getTime() - (GEWINNER_FENSTER_TAGE - 1) * 86_400_000);
  let kandidaten: Kandidat[];
  try {
    kandidaten = (await ladeInsights(deps.meta, konto, ymd(sinceDate), ymd(now))).map(kandidatAusInsight).filter((k): k is Kandidat => !!k);
  } catch (err) {
    const hinweis = gewinnerFehlerHinweis(err, konto);
    console.error("[eigene-gewinner]", hinweis);
    return { gewinner: [], hinweis };
  }
  const relevant = kandidaten.filter((k) => k.ausgaben > 0);
  const leadZahlen = relevant.length
    ? await deps.leadZahlen(input.customerId, relevant.map((k) => k.adId), sinceDate).catch(() => new Map<string, LeadZahlen>())
    : new Map<string, LeadZahlen>();
  const beste = waehleBestperformer(relevant, { leadZahlen, passtZumProdukt: produktPruefer(input.product, deps.matcher) });
  if (!beste.length) {
    return {
      gewinner: [],
      hinweis: `Eigene Gewinner: Im Werbekonto act_${konto} gibt es in den letzten ${GEWINNER_FENSTER_TAGE} Tagen keine Anzeige mit mindestens ${MIN_AUSGABEN_EUR} € Ausgaben oder ${MIN_LEADS} Leads.`,
    };
  }
  let creatives: Record<string, AdCreativeJson> = {};
  let hinweis: string | null = null;
  try {
    creatives = await deps.meta.get<Record<string, AdCreativeJson>>("", { ids: beste.map((b) => b.adId).join(","), fields: CREATIVE_FIELDS });
  } catch (err) {
    hinweis = `Eigene Gewinner ohne Anzeigentexte: Creatives nicht lesbar (${redactTokens(err instanceof Error ? err.message : String(err)).slice(0, 160)}).`;
    console.error("[eigene-gewinner]", hinweis);
  }
  const gewinner: EigenerGewinner[] = beste.map((b) => ({
    adId: b.adId,
    name: b.name.slice(0, 200),
    kampagne: b.kampagne?.slice(0, 200) ?? null,
    ausgaben: b.ausgaben,
    leads: b.leads,
    leadsQuelle: b.leadsQuelle,
    termine: b.termine,
    cpl: b.cpl,
    kostenJeTermin: b.kostenJeTermin,
    ctr: b.ctr,
    passtZumProdukt: b.passtZumProdukt,
    ...creativeInhalt(creatives[b.adId]),
  }));
  return { gewinner, hinweis };
}

/** Standard-Abhängigkeiten: System-Token (graphApi), Leads/Termine aus der Datenbank, Produkt-Matcher. */
export async function ladeEigeneGewinnerStandard(input: { customerId: string; adAccountId: string | null | undefined; product: string }): Promise<EigeneGewinnerErgebnis> {
  if (!input.adAccountId) return { gewinner: [], hinweis: null };
  if (!process.env.META_ACCESS_TOKEN) return { gewinner: [], hinweis: "Eigene Gewinner nicht genutzt: META_ACCESS_TOKEN fehlt." };
  const [{ graphApi }, { prisma }, { loadProductMatcher }] = await Promise.all([
    import("@/lib/kampagnen/builder"),
    import("@/lib/prisma"),
    import("@/lib/product-catalog"),
  ]);
  const matcher = await loadProductMatcher().catch(() => undefined);
  return ladeEigeneGewinner(input, {
    meta: graphApi,
    matcher,
    leadZahlen: async (customerId, adIds, since) => {
      const where = { customerId, adId: { in: adIds }, isTest: false, createdAt: { gte: since } };
      const [leads, mitTermin] = await Promise.all([
        prisma.lead.groupBy({ by: ["adId"], where, _count: { _all: true } }),
        prisma.lead.groupBy({ by: ["adId"], where: { ...where, appointments: { some: { status: { not: "cancelled" } } } }, _count: { _all: true } }),
      ]);
      const out = new Map<string, LeadZahlen>();
      for (const l of leads) if (l.adId) out.set(l.adId, { leads: l._count._all, termine: 0 });
      for (const t of mitTermin) if (t.adId && out.has(t.adId)) out.get(t.adId)!.termine = t._count._all;
      return out;
    },
  });
}

// ─── Block für die Agenten ─────────────────────────────────────────────

const eur = (n: number) => `${n.toLocaleString("de-DE", { minimumFractionDigits: n < 100 ? 2 : 0, maximumFractionDigits: n < 100 ? 2 : 0 })} €`;

/** Abschnitt für die Agenten-Anweisungen (null ohne Gewinner). Nummern „Eigener Gewinner N“ zum Verweisen. */
export function eigeneGewinnerBlock(g: EigenerGewinner[] | null | undefined): string | null {
  if (!g?.length) return null;
  return g
    .map((w, i) => {
      const zahlen = [
        `${eur(w.cpl)} je Lead`,
        `${w.leads} Leads${w.leadsQuelle === "meta" ? " laut Meta" : ""}`,
        w.termine != null ? `${w.termine} Termine${w.kostenJeTermin != null ? ` (${eur(w.kostenJeTermin)} je Termin)` : ""}` : null,
        w.ctr != null ? `Klickrate ${w.ctr.toLocaleString("de-DE")} %` : null,
        `${eur(w.ausgaben)} Ausgaben`,
      ].filter(Boolean);
      const zeilen = [
        `Eigener Gewinner ${i + 1}: „${w.name}“${w.passtZumProdukt ? " (gleiches Produkt)" : " (anderes Produkt, Stil und Aufbau übertragen)"}; ${zahlen.join(", ")}${w.video ? "; Video-Anzeige (Bild = Vorschaubild)" : ""}`,
        w.primaryText ? `   Primärtext: „${w.primaryText.replace(/\s+/g, " ").slice(0, 700)}“` : null,
        w.headline || w.description || w.cta
          ? `   ${[w.headline ? `Überschrift: „${w.headline}“` : null, w.description ? `Beschreibung: „${w.description}“` : null, w.cta ? `Button: ${w.cta}` : null].filter(Boolean).join("; ")}`
          : null,
      ];
      return zeilen.filter(Boolean).join("\n");
    })
    .join("\n");
}

/** Gewinner, auf den sich ein Winkel bezieht („Eigener Gewinner 2“ im insight), sonst der beste mit Bild. */
export function gewinnerFuerWinkel(g: EigenerGewinner[] | null | undefined, angleText: string): EigenerGewinner | null {
  if (!g?.length) return null;
  const m = /eigene[rnm]?\s+gewinner\s*(?:nr\.?\s*)?(\d)/i.exec(angleText);
  const genannt = m ? g[Number(m[1]) - 1] : undefined;
  if (genannt) return genannt;
  return g.find((w) => w.bildUrl && w.passtZumProdukt) ?? g.find((w) => w.bildUrl) ?? null;
}

/** Anzahl Winkel, die sich ausdrücklich auf einen eigenen Gewinner beziehen. */
export function winkelMitEigenemGewinner(angles: { insight: string; hook?: string; title?: string }[]): number {
  return angles.filter((a) => /eigene[rnm]?\s+gewinner/i.test(`${a.title ?? ""} ${a.hook ?? ""} ${a.insight}`)).length;
}
