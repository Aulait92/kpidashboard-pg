import { fetchStockUrl } from "@/lib/unsplash";

// Bild-Generation via OpenAI Images (gpt-image-1, "Images 2.0").
// Zwei Platzhalter-Typen im HTML:
//   {{COMIC:keywords}}    → KI-Illustration (Comic-Stil)
//   {{UNSPLASH:keywords}} → fotorealistisches Bild (früher Stock-Foto)
// als src="…" oder background-image: url(…)
//
// gpt-image-1 liefert Base64 → wir geben eine data-URL aus, die direkt im
// HTML/Playwright-Rendering funktioniert.
//
// Fallbacks:
//   - Comic ohne OPENAI_API_KEY / bei Fehler → neutrales Grau.
//   - Foto bei Fehler → echtes Stock-Foto (Unsplash/Pexels), erst dann Grau.
//
// Env:
//   OPENAI_API_KEY           — Pflicht für echte Generierung
//   OPENAI_IMAGE_MODEL       — Modell-ID (default "gpt-image-1")
//   OPENAI_IMAGE_QUALITY     — "low" | "medium" | "high" | "auto" (default "low")
//   OPENAI_IMAGE_TIMEOUT_MS  — Abbruch pro Bild in ms (default 90000)

const COMIC_RE = /\{\{COMIC:([^}]+)\}\}/g;
const PHOTO_RE = /\{\{UNSPLASH:([^}]+)\}\}/g;

const FALLBACK_DATA_URL =
  "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201%201%22%3E%3Crect%20width%3D%221%22%20height%3D%221%22%20fill%3D%22%23eee%22%2F%3E%3C%2Fsvg%3E";

// Kein Text im Bild — Text liegt im HTML-Overlay.
const NO_TEXT =
  "completely without any text, no letters, no words, no signs, no labels, no writing, no captions, no logos, no numbers, no watermark";

const COMIC_SUFFIX = `, modern comic book illustration, flat colors, bold black outlines, clean vector art, professional editorial illustration, white background, ${NO_TEXT}, no speech bubbles`;

const PHOTO_SUFFIX = `, realistic photograph, natural soft lighting, authentic candid moment, high quality, shallow depth of field, modern European setting, ${NO_TEXT}`;

// Generiert ein Bild und gibt eine data-URL zurück (oder FALLBACK_DATA_URL).
// Mit Timeout + Retries gegen transiente Netzwerkfehler ("fetch failed"),
// Timeouts und 429/5xx.
async function generateImage(
  keywords: string,
  styleSuffix: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("[openai-image] OPENAI_API_KEY nicht gesetzt — Fallback.");
    return FALLBACK_DATA_URL;
  }
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const quality = process.env.OPENAI_IMAGE_QUALITY || "low";
  const timeoutMs = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS) || 90000;
  const prompt = `${keywords}${styleSuffix}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, attempt * 2000));
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model, prompt, size: "1024x1024", quality, n: 1 }),
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        // 429/5xx transient → erneut versuchen; 4xx hart → Fallback.
        if (res.status === 429 || res.status >= 500) {
          console.warn(
            `[openai-image] Versuch ${attempt + 1}/3 für "${keywords}": ${res.status} ${text.slice(0, 200)}`,
          );
          continue;
        }
        console.warn(
          `[openai-image] Generation failte für "${keywords}": ${res.status} ${text.slice(0, 300)}`,
        );
        return FALLBACK_DATA_URL;
      }
      const json = JSON.parse(text) as {
        data?: { b64_json?: string; url?: string }[];
      };
      const first = json.data?.[0];
      console.log(
        `[openai-image] "${keywords}" ok in ${Date.now() - startedAt}ms (q=${quality})`,
      );
      if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
      if (first?.url) return first.url;
      console.warn(
        `[openai-image] unerwartetes Output-Shape für "${keywords}":`,
        text.slice(0, 200),
      );
      return FALLBACK_DATA_URL;
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      console.warn(
        `[openai-image] Versuch ${attempt + 1}/3 ${aborted ? `Timeout (${timeoutMs}ms)` : "failte"} für "${keywords}":`,
        err instanceof Error ? err.message : err,
      );
    } finally {
      clearTimeout(timer);
    }
  }
  return FALLBACK_DATA_URL;
}

// Ersetzt alle Platzhalter eines Typs parallel.
async function resolve(
  html: string,
  re: RegExp,
  produce: (keywords: string) => Promise<string>,
): Promise<string> {
  const queries = new Set<string>();
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(html)) !== null) queries.add(m[1].trim());
  if (queries.size === 0) return html;

  const resolved = new Map<string, string>();
  await Promise.all(
    Array.from(queries).map(async (q) => {
      resolved.set(q, await produce(q));
    }),
  );
  re.lastIndex = 0;
  return html.replace(re, (_full, q: string) => {
    return resolved.get(q.trim()) ?? FALLBACK_DATA_URL;
  });
}

// KI-Illustration ({{COMIC:…}}). Bei Fehler: Grau.
export async function resolveComicPlaceholders(html: string): Promise<string> {
  return resolve(html, COMIC_RE, (q) => generateImage(q, COMIC_SUFFIX));
}

// Generiert ein KOMPLETTES Creative-Bild direkt aus einem freien Prompt —
// Text im Bild ist hier ausdrücklich erlaubt (kein no-text-Suffix). Für den
// Direct-Image-Modus, in dem gpt-image-1 das ganze Creative selbst rendert.
// Gibt eine data-URL zurück oder null bei Fehler.
export async function generateFullCreativeImage(
  prompt: string,
): Promise<string | null> {
  const url = await generateImage(prompt, "");
  return url === FALLBACK_DATA_URL ? null : url;
}

// Fotorealistische Bilder ({{UNSPLASH:…}}) — via OpenAI, mit echtem Stock-Foto
// als Fallback (statt Grau), falls OpenAI fehlschlägt oder nicht verfügbar ist.
export async function resolvePhotoPlaceholders(html: string): Promise<string> {
  return resolve(html, PHOTO_RE, async (q) => {
    const ai = await generateImage(q, PHOTO_SUFFIX);
    if (ai !== FALLBACK_DATA_URL) return ai;
    // OpenAI nicht verfügbar/fehlgeschlagen → echtes Stock-Foto versuchen.
    return fetchStockUrl(q);
  });
}
