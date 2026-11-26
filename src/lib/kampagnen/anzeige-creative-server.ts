// Ops-Creatives (Server-Teil, Ole, 26.11.2026): Foto holen (Pexels/Unsplash mit Quelle, KI-Foto oder öffentliche Adresse),
// mit Vorlage aus anzeige-creative.ts rendern, im eigenen Bildspeicher (R2) ablegen, und auf eine pausierte Anzeige setzen.

import { randomBytes } from "node:crypto";
import { bildFuerAnzeige, graphApi, pageAccessToken, type MetaApi } from "@/lib/kampagnen/builder";
import { GESPERRTE_QUELLEN } from "@/lib/html-to-png";
import {
  bildUrlErlaubt,
  creativeHtml,
  neuesLinkData,
  pruefeAnzeige,
  STANDARD_FOTO,
  texteFuer,
  type AnzeigeInfo,
  type Layout,
} from "@/lib/kampagnen/anzeige-creative";

export type FotoQuelle = "pexels" | "unsplash" | "ki" | "url";
export type FotoHerkunft = { quelle: FotoQuelle; fotograf?: string; link?: string; lizenz: string; suche?: string; brief?: string };

const MAX_BYTES = 15 * 1024 * 1024;

async function alsDataUrl(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000), redirect: "follow" });
  if (!res.ok) throw new Error(`Foto nicht abrufbar (${res.status}).`);
  if (!bildUrlErlaubt(res.url || url, GESPERRTE_QUELLEN)) throw new Error("Foto-Adresse nicht erlaubt.");
  const typ = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!/^image\/(jpeg|png|webp)$/.test(typ)) throw new Error(`Kein Foto (${typ || "unbekannter Typ"}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error("Foto zu groß (max. 15 MB).");
  return `data:${typ};base64,${buf.toString("base64")}`;
}

/** Pexels-Suche: zufälliger Treffer aus den ersten 15 (quadratisch), mit Fotograf und Link. */
async function pexels(suche: string, schon: Set<string>): Promise<{ src: string; herkunft: FotoHerkunft } | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const u = new URL("https://api.pexels.com/v1/search");
  u.searchParams.set("query", suche);
  u.searchParams.set("per_page", "15");
  u.searchParams.set("orientation", "square");
  const res = await fetch(u, { headers: { Authorization: key }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) return null;
  const d = (await res.json()) as { photos?: { id: number; url: string; photographer: string; src: { large2x?: string; original?: string } }[] };
  const frei = (d.photos ?? []).filter((p) => !schon.has(`pexels:${p.id}`));
  if (!frei.length) return null;
  const p = frei[Math.floor(Math.random() * Math.min(frei.length, 8))];
  schon.add(`pexels:${p.id}`);
  const src = p.src.large2x ?? p.src.original;
  if (!src) return null;
  return { src: await alsDataUrl(src), herkunft: { quelle: "pexels", fotograf: p.photographer, link: p.url, lizenz: "Pexels-Lizenz (kommerziell frei, ohne Namensnennung)", suche } };
}

/** Unsplash-Suche mit Fotograf und Link; meldet den Download wie von Unsplash verlangt. */
async function unsplash(suche: string, schon: Set<string>): Promise<{ src: string; herkunft: FotoHerkunft } | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  const u = new URL("https://api.unsplash.com/search/photos");
  u.searchParams.set("query", suche);
  u.searchParams.set("per_page", "15");
  u.searchParams.set("orientation", "squarish");
  u.searchParams.set("content_filter", "high");
  const h = { Authorization: `Client-ID ${key}` };
  const res = await fetch(u, { headers: h, signal: AbortSignal.timeout(20000) });
  if (!res.ok) return null;
  type Foto = { id: string; urls: { raw: string }; links: { html: string; download_location: string }; user: { name: string } };
  const d = (await res.json()) as { results?: Foto[] };
  const frei = (d.results ?? []).filter((p) => !schon.has(`unsplash:${p.id}`));
  if (!frei.length) return null;
  const p = frei[Math.floor(Math.random() * Math.min(frei.length, 8))];
  schon.add(`unsplash:${p.id}`);
  await fetch(p.links.download_location, { headers: h, signal: AbortSignal.timeout(10000) }).catch(() => undefined);
  const src = `${p.urls.raw}&w=1600&h=1600&fit=crop&crop=faces,entropy&fm=jpg&q=85`;
  return { src: await alsDataUrl(src), herkunft: { quelle: "unsplash", fotograf: p.user.name, link: p.links.html, lizenz: "Unsplash-Lizenz (kommerziell frei, ohne Namensnennung)", suche } };
}

export type FotoWunsch = { quelle?: string; suche?: string; brief?: string; url?: string };

/** Foto für ein Layout holen. Standard: Pexels, dann Unsplash, dann KI-Foto. */
export async function fotoHolen(layout: Layout, w: FotoWunsch, schon = new Set<string>()): Promise<{ src: string; herkunft: FotoHerkunft }> {
  const quelle = (w.quelle ?? "").toLowerCase();
  if (quelle === "url" || (!quelle && w.url)) {
    if (!w.url || !bildUrlErlaubt(w.url, GESPERRTE_QUELLEN)) throw new Error("fotoUrl: öffentliche https-Adresse nötig (keine Meta-Bilder).");
    return { src: await alsDataUrl(w.url), herkunft: { quelle: "url", link: w.url, lizenz: "von Ole bereitgestellt" } };
  }
  const suche = w.suche || STANDARD_FOTO[layout].suche;
  const brief = w.brief || STANDARD_FOTO[layout].brief;
  const reihe: FotoQuelle[] = quelle === "ki" ? ["ki"] : quelle === "unsplash" ? ["unsplash", "pexels", "ki"] : ["pexels", "unsplash", "ki"];
  for (const q of reihe) {
    try {
      if (q === "pexels") {
        const r = await pexels(suche, schon);
        if (r) return r;
      } else if (q === "unsplash") {
        const r = await unsplash(suche, schon);
        if (r) return r;
      } else {
        const { generatePhoto } = await import("@/lib/openai-image");
        const src = await generatePhoto(brief);
        if (src) return { src, herkunft: { quelle: "ki", lizenz: "KI-Bild (OpenAI), eigene Erzeugung", brief } };
      }
    } catch (e) {
      console.warn(`[anzeige-creative] Foto ${q}: ${e instanceof Error ? e.message : e}`);
    }
  }
  throw new Error("Kein Foto gefunden (Pexels, Unsplash und KI ohne Ergebnis).");
}

export type CreativeWunsch = {
  layout: Layout;
  foto: FotoWunsch;
  texte?: Record<string, unknown>;
  marke?: string;
  farbe?: string;
  fotoPosition?: string;
};

/** Creative erzeugen und dauerhaft in R2 ablegen. Gibt die öffentliche Adresse und die Foto-Herkunft zurück. */
export async function creativeErzeugen(customerId: string, w: CreativeWunsch, schon = new Set<string>()): Promise<{ layout: Layout; url: string; foto: FotoHerkunft }> {
  const t = texteFuer(w.layout, w.texte ?? {});
  if (!t.ok) throw new Error(t.error);
  const foto = await fotoHolen(w.layout, w.foto, schon);
  const html = creativeHtml({ layout: w.layout, fotoSrc: foto.src, texte: t.texte, marke: w.marke, farbe: w.farbe, fotoPosition: w.fotoPosition });
  const { renderHtmlToImage } = await import("@/lib/html-to-png");
  const buffer = await renderHtmlToImage(html, { width: 1080, height: 1080, format: "jpeg", quality: 92 });
  const { uploadImageToR2 } = await import("@/lib/r2");
  const key = `creatives/ops/${customerId}/${new Date().toISOString().slice(0, 10)}-${w.layout}-${randomBytes(4).toString("hex")}.jpg`;
  const url = await uploadImageToR2({ buffer, key, contentType: "image/jpeg" });
  return { layout: w.layout, url, foto: foto.herkunft };
}

export type AnwendenEingabe = { act: string; adId: string; imageUrl?: string; message?: string; headline?: string; description?: string; formId?: string };

/**
 * Bild, Texte und/oder Formular auf eine pausierte Anzeige setzen: neues Creative mit dem alten link_data (Link, Knopf,
 * Formular bleiben, wenn nicht ausdrücklich geändert), Anzeige neu verknüpfen. Ändert nie den Status.
 */
export async function anzeigeCreativeSetzen(e: AnwendenEingabe, api: MetaApi = graphApi): Promise<{ adName: string; creativeId: string; geaendert: string[] }> {
  const ad = await api.get<AnzeigeInfo>(e.adId, { fields: "account_id,status,name,creative{id}" });
  const g = pruefeAnzeige(ad, e.act);
  if (!g.ok) throw new Error(g.error);
  const cr = await api.get<{ name?: string; image_hash?: string; object_story_spec?: { page_id: string; instagram_user_id?: string; link_data?: Record<string, unknown> } }>(g.creativeId, { fields: "name,image_hash,object_story_spec" });
  const spec = cr.object_story_spec;
  if (!spec?.link_data) throw new Error("Creative ohne link_data (nur Bildanzeigen werden unterstützt).");
  if (e.formId) {
    const token = await pageAccessToken(api, spec.page_id);
    const f = await api.get<{ id: string; status?: string; page?: { id: string } }>(e.formId, { fields: "id,status,page" }, token);
    if (f.page?.id && f.page.id !== spec.page_id) throw new Error("Formular gehört nicht zur Seite der Anzeige.");
    if (f.status && f.status !== "ACTIVE") throw new Error(`Formular ist nicht aktiv (${f.status}).`);
  }
  let bildRef: string | undefined;
  if (e.imageUrl) {
    if (!bildUrlErlaubt(e.imageUrl, GESPERRTE_QUELLEN)) throw new Error("imageUrl: öffentliche https-Adresse nötig (keine Meta-Bilder).");
    bildRef = await bildFuerAnzeige(api, e.act, e.imageUrl);
  }
  const link_data = neuesLinkData(spec.link_data, { bildRef, message: e.message, headline: e.headline, description: e.description, formId: e.formId }, cr.image_hash);
  const geaendert = [bildRef && "Bild", e.message && "Haupttext", e.headline && "Überschrift", e.description && "Beschreibung", e.formId && "Formular"].filter((x): x is string => !!x);
  const story: Record<string, unknown> = { page_id: spec.page_id, link_data };
  if (spec.instagram_user_id) story.instagram_user_id = spec.instagram_user_id;
  const neu = await api.post<{ id: string }>(`${e.act}/adcreatives`, { name: `${cr.name ?? ad.name} | Ops ${new Date().toISOString().slice(0, 10)}`.slice(0, 200), object_story_spec: story });
  await api.post(e.adId, { creative: { creative_id: neu.id } });
  return { adName: ad.name, creativeId: neu.id, geaendert };
}
