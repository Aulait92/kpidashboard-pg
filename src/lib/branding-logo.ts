// Logo für Präsentationen (Ole, 15.11.2026): von der Agentur- bzw. Makler-Webseite holen (bei Allianz-, AXA- oder
// Signal-Iduna-Vertretern das Logo, das die Gesellschaft auf der Agenturseite zeigt) oder hochladen. Der Kunde
// bestätigt, dass er es für seine Beratung verwenden darf; erst dann erscheint es auf den Folien.

import { fetchHtml, normalizeUrl, resolvesPrivate } from "@/lib/impressum";

export const LOGO_MAX_BYTES = 1_000_000;
const TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"] as const;
const UA = "Mozilla/5.0 (compatible; performancegrowth-branding/1.0)";

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(2).find((x) => x != null) ?? null;

/**
 * Logo-Kandidaten aus dem HTML, beste zuerst: Bilder mit „logo“ in src/alt/class/id (im Kopfbereich bevorzugt),
 * dann apple-touch-icon bzw. große Icons, zuletzt og:image.
 */
export function logoKandidaten(html: string, base: string): string[] {
  const abs = (u: string | null) => {
    if (!u || u.startsWith("data:")) return null;
    try {
      return new URL(u.trim().split(/\s+/)[0], base).toString();
    } catch {
      return null;
    }
  };
  const scored: { url: string; score: number }[] = [];
  const headerEnd = (() => {
    const m = html.search(/<\/header>/i);
    return m > 0 ? m : Math.min(html.length, 15000);
  })();
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = abs(attr(tag, "src") ?? attr(tag, "data-src") ?? attr(tag, "srcset"));
    if (!src) continue;
    const hay = `${src} ${attr(tag, "alt") ?? ""} ${attr(tag, "class") ?? ""} ${attr(tag, "id") ?? ""}`.toLowerCase();
    if (!/logo|marke|brand/.test(hay)) continue;
    let score = 50;
    if ((m.index ?? 0) < headerEnd) score += 30;
    if (/allianz|axa|signal|iduna/.test(hay)) score += 10;
    if (/\.svg(\?|$)/i.test(src)) score += 5;
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
  const og = html.match(/<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*>/i)?.[0];
  const ogUrl = og ? abs(attr(og, "content")) : null;
  if (ogUrl) scored.push({ url: ogUrl, score: 5 });
  const seen = new Set<string>();
  return scored
    .sort((x, y) => y.score - x.score)
    .map((s) => s.url)
    .filter((u) => (seen.has(u) ? false : (seen.add(u), true)))
    .slice(0, 6);
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
    const res = await fetch(u.toString(), { headers: { "user-agent": UA, accept: "image/*" }, redirect: "follow", signal: AbortSignal.timeout(8000) });
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
export async function logoVonWebseite(website: string): Promise<{ data: Uint8Array; type: string; source: string } | { error: string }> {
  const base = normalizeUrl(website);
  if (!base) return { error: "Bitte eine gültige Webseite angeben, z. B. agentur-lohmann.de." };
  const html = await fetchHtml(base.toString());
  if (!html) return { error: "Die Webseite ließ sich nicht laden. Bitte prüfen Sie die Adresse oder laden Sie das Logo hoch." };
  for (const url of logoKandidaten(html, base.toString())) {
    const img = await bildLaden(url);
    if (img) return { ...img, source: url };
  }
  return { error: "Auf der Webseite wurde kein Logo gefunden. Bitte laden Sie es hoch." };
}

export const logoDataUri = (data: Uint8Array, type: string) => `data:${type};base64,${Buffer.from(data).toString("base64")}`;
