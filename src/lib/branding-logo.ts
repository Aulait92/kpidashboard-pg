// Logo für Präsentationen (Ole, 15.11.2026): von der Agentur- bzw. Makler-Webseite holen (bei Allianz-, AXA- oder
// Signal-Iduna-Vertretern das Logo, das die Gesellschaft auf der Agenturseite zeigt) oder hochladen. Der Kunde
// bestätigt, dass er es für seine Beratung verwenden darf; erst dann erscheint es auf den Folien.

import { fetchHtmlDetail, normalizeUrl, resolvesPrivate } from "@/lib/impressum";
import { istAllianzVertreterSeite } from "@/lib/vertreter-seite";
import { BROWSER_UA } from "@/lib/web-fetch";

export { istAllianzVertreterSeite };
export const ALLIANZ_LOGO_HINWEIS = "Die Allianz lässt den automatischen Abruf Ihrer Vertreter-Seite nicht zu. Bitte laden Sie Ihr Logo selbst hoch.";

export const LOGO_MAX_BYTES = 1_000_000;
const TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"] as const;

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(2).find((x) => x != null) ?? null;

/** Kandidat: Adresse zum Laden oder direkt eingebettetes Bild (data:-URI, z. B. Inline-SVG bei Allianz-Agenturseiten). */
export type LogoKandidat = { url: string; score: number };

/**
 * Logo-Kandidaten aus dem HTML, beste zuerst: Bilder mit „logo“ in src/alt/class/id (im Kopfbereich bevorzugt,
 * auch als data:-URI), dann apple-touch-icon bzw. große Icons. og:image (meist ein Foto) nur, wenn sonst nichts da ist.
 * Ole, 15.11.2026: Allianz-Agenturseiten haben die Wortmarke als data:image/svg+xml im Kopf; Desktop-Variante vor Mobil.
 */
export function logoKandidaten(html: string, base: string): string[] {
  const abs = (u: string | null) => {
    if (!u) return null;
    const t = u.trim();
    if (t.startsWith("data:")) return /^data:image\/(svg\+xml|png|jpeg|webp)[;,]/i.test(t) ? t : null;
    try {
      return new URL(t.split(/\s+/)[0], base).toString();
    } catch {
      return null;
    }
  };
  const scored: LogoKandidat[] = [];
  const headerEnd = (() => {
    const m = html.search(/<\/header>/i);
    return m > 0 ? m : Math.min(html.length, 15000);
  })();
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = abs(attr(tag, "src") ?? attr(tag, "data-src") ?? attr(tag, "srcset"));
    if (!src) continue;
    const meta = `${attr(tag, "alt") ?? ""} ${attr(tag, "class") ?? ""} ${attr(tag, "id") ?? ""}`.toLowerCase();
    const hay = `${src.startsWith("data:") ? "" : src.toLowerCase()} ${meta}`;
    if (!/logo|marke|brand/.test(hay)) continue;
    let score = 50;
    if ((m.index ?? 0) < headerEnd) score += 30;
    if (/allianz|axa|signal|iduna/.test(hay)) score += 10;
    if (/\.svg(\?|$)/i.test(src) || src.startsWith("data:image/svg")) score += 5;
    if (/mobile|mobil|small|klein/.test(meta)) score -= 15;
    if (/sprite|icon-|social|facebook|instagram|linkedin|xing|whatsapp|google|award|siegel|badge|focus|test/.test(hay)) score -= 40;
    scored.push({ url: src, score });
  }
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    if (!/icon/.test(rel)) continue;
    const href = abs(attr(tag, "href"));
    if (!href) continue;
    const size = Number((attr(tag, "sizes") ?? "").split("x")[0]) || 0;
    if (/apple-touch-icon/.test(rel) || size >= 128) scored.push({ url: href, score: 20 + Math.min(size, 512) / 50 });
  }
  // og:image ist meist ein Foto (Bühne, Team): nur als allerletzter Rückfall, wenn es sonst gar keinen Kandidaten gibt
  if (!scored.length) {
    const og = html.match(/<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*>/i)?.[0];
    const ogUrl = og ? abs(attr(og, "content")) : null;
    if (ogUrl) scored.push({ url: ogUrl, score: 5 });
  }
  const seen = new Set<string>();
  return scored
    .sort((x, y) => y.score - x.score)
    .map((s) => s.url)
    .filter((u) => (seen.has(u) ? false : (seen.add(u), true)))
    .slice(0, 6);
}

/** Eingebettetes Bild (data:-URI) dekodieren, gleiche Prüfungen wie beim Laden. */
export function bildAusDataUri(uri: string): { data: Uint8Array; type: string } | null {
  const m = /^data:(image\/(?:svg\+xml|png|jpeg|webp))(;base64)?,([\s\S]*)$/i.exec(uri.trim());
  if (!m) return null;
  let data: Uint8Array;
  try {
    data = m[2] ? new Uint8Array(Buffer.from(m[3], "base64")) : new TextEncoder().encode(decodeURIComponent(m[3]));
  } catch {
    return null;
  }
  if (data.length > LOGO_MAX_BYTES || data.length < 64) return null;
  const type = bildTyp(m[1], data);
  if (!type) return null;
  if (type === "image/svg+xml") data = new TextEncoder().encode(svgBereinigen(new TextDecoder().decode(data)));
  return { data, type };
}

export function bildTyp(contentType: string, data: Uint8Array): (typeof TYPES)[number] | null {
  const ct = contentType.split(";")[0].trim().toLowerCase();
  if (TYPES.includes(ct as (typeof TYPES)[number])) return ct as (typeof TYPES)[number];
  const head = new TextDecoder().decode(data.slice(0, 200)).trimStart();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  if (data[0] === 0x89 && data[1] === 0x50) return "image/png";
  if (data[0] === 0xff && data[1] === 0xd8) return "image/jpeg";
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** SVG ohne Skripte und Event-Handler (wird nur als <img> eingebunden, trotzdem bereinigt). */
export function svgBereinigen(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|xlink:href)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, "");
}

/** Bild laden (nur öffentliche Adressen, höchstens 1 MB, PNG/JPEG/SVG/WebP). */
export async function bildLaden(url: string): Promise<{ data: Uint8Array; type: string } | null> {
  const u = normalizeUrl(url);
  if (!u || (await resolvesPrivate(u.hostname))) return null;
  try {
    const res = await fetch(u.toString(), { headers: { "user-agent": BROWSER_UA, accept: "image/*" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    if (res.url && res.url !== u.toString()) {
      const fin = normalizeUrl(res.url);
      if (!fin || (await resolvesPrivate(fin.hostname))) return null;
    }
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > LOGO_MAX_BYTES) return null;
    let data = new Uint8Array(await res.arrayBuffer());
    if (data.length > LOGO_MAX_BYTES || data.length < 64) return null;
    const type = bildTyp(res.headers.get("content-type") ?? "", data);
    if (!type) return null;
    if (type === "image/svg+xml") data = new TextEncoder().encode(svgBereinigen(new TextDecoder().decode(data)));
    return { data, type };
  } catch {
    return null;
  }
}

/** Logo von einer Webseite holen: erster Kandidat, der sich laden lässt. */
export async function logoVonWebseite(website: string): Promise<{ data: Uint8Array; type: string; source: string } | { error: string; hochladen?: true }> {
  const base = normalizeUrl(website);
  if (!base) return { error: "Bitte eine gültige Webseite angeben, z. B. agentur-lohmann.de." };
  // Ole, 18.11.2026: Die Allianz sperrt den Abruf ihrer Vertreter-Seiten vom Server (Cloudflare). Gar nicht erst versuchen.
  if (istAllianzVertreterSeite(base.toString())) return { error: ALLIANZ_LOGO_HINWEIS, hochladen: true };
  const page = await fetchHtmlDetail(base.toString(), 20_000);
  if ("error" in page) {
    return page.error === "blocked"
      ? { error: "Diese Webseite lässt den automatischen Abruf nicht zu. Bitte laden Sie Ihr Logo selbst hoch.", hochladen: true }
      : { error: "Die Webseite ließ sich nicht laden. Bitte prüfen Sie die Adresse oder laden Sie das Logo hoch." };
  }
  const html = page.html;
  for (const url of logoKandidaten(html, base.toString())) {
    const img = url.startsWith("data:") ? bildAusDataUri(url) : await bildLaden(url);
    if (img) return { ...img, source: url.startsWith("data:") ? `${base.toString()} (eingebettetes Logo)` : url };
  }
  return { error: "Auf der Webseite wurde kein Logo gefunden. Bitte laden Sie es hoch." };
}

export const logoDataUri = (data: Uint8Array, type: string) => `data:${type};base64,${Buffer.from(data).toString("base64")}`;
