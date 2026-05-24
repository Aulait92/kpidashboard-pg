// Bild-Generation via OpenAI Images (gpt-image-1, "Images 2.0").
// Pattern im HTML:
//   src="{{COMIC:keywords}}"
//   background-image: url({{COMIC:keywords}})
//
// Server hängt einen Style-Modifier an die User-Keywords und generiert ein
// quadratisches Bild. gpt-image-1 liefert Base64 zurück → wir geben eine
// data-URL aus, die direkt im HTML/Playwright-Rendering funktioniert.
//
// Ohne OPENAI_API_KEY gracefuller Fallback auf neutrales Grau — kein Crash,
// das Creative wird nur ohne KI-Bild gerendert.
//
// Env:
//   OPENAI_API_KEY           — Pflicht für echte Generierung
//   OPENAI_IMAGE_MODEL       — Modell-ID (default "gpt-image-1"). Auf neuere
//                              Versionen umstellbar, ohne Code-Änderung.
//   OPENAI_IMAGE_QUALITY     — "low" | "medium" | "high" | "auto" (default "low")
//   OPENAI_IMAGE_TIMEOUT_MS  — Abbruch pro Bild in ms (default 90000). Verhindert,
//                              dass ein hängender Request die ganze Pipeline blockt.

const PLACEHOLDER_RE = /\{\{COMIC:([^}]+)\}\}/g;

const FALLBACK_DATA_URL =
  "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201%201%22%3E%3Crect%20width%3D%221%22%20height%3D%221%22%20fill%3D%22%23eee%22%2F%3E%3C%2Fsvg%3E";

// Bewusst KEIN Text im Bild — Text liegt im HTML-Overlay, das Bild bleibt
// textfrei (sonst doppelter/krummer Text).
const STYLE_SUFFIX =
  ", modern comic book illustration, flat colors, bold black outlines, clean vector art, professional editorial illustration, white background, completely without any text, no letters, no words, no speech bubbles, no signs, no labels, no writing, no captions, no logos, no numbers";

async function generateComicImage(keywords: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn(
      "[openai-image] OPENAI_API_KEY nicht gesetzt — Bild-Fallback (grau).",
    );
    return FALLBACK_DATA_URL;
  }
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const quality = process.env.OPENAI_IMAGE_QUALITY || "low";
  const timeoutMs = Number(process.env.OPENAI_IMAGE_TIMEOUT_MS) || 90000;
  const prompt = `${keywords}${STYLE_SUFFIX}`;
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
      body: JSON.stringify({
        model,
        prompt,
        size: "1024x1024",
        quality,
        n: 1,
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn(
        `[openai-image] Generation failte für "${keywords}": ${res.status} ${text.slice(0, 300)}`,
      );
      return FALLBACK_DATA_URL;
    }
    console.log(
      `[openai-image] "${keywords}" ok in ${Date.now() - startedAt}ms (q=${quality})`,
    );
    const json = JSON.parse(text) as {
      data?: { b64_json?: string; url?: string }[];
    };
    const first = json.data?.[0];
    // gpt-image-1 liefert standardmäßig b64_json (keine URL).
    if (first?.b64_json) {
      return `data:image/png;base64,${first.b64_json}`;
    }
    if (first?.url) {
      return first.url;
    }
    console.warn(
      `[openai-image] unerwartetes Output-Shape für "${keywords}":`,
      text.slice(0, 200),
    );
    return FALLBACK_DATA_URL;
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    console.warn(
      `[openai-image] Generation ${aborted ? `Timeout (${timeoutMs}ms)` : "failte"} für "${keywords}":`,
      err instanceof Error ? err.message : err,
    );
    return FALLBACK_DATA_URL;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveComicPlaceholders(html: string): Promise<string> {
  const queries = new Set<string>();
  let m: RegExpExecArray | null;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(html)) !== null) {
    queries.add(m[1].trim());
  }
  if (queries.size === 0) return html;

  const resolved = new Map<string, string>();
  await Promise.all(
    Array.from(queries).map(async (q) => {
      resolved.set(q, await generateComicImage(q));
    }),
  );

  return html.replace(PLACEHOLDER_RE, (_full, q: string) => {
    return resolved.get(q.trim()) ?? FALLBACK_DATA_URL;
  });
}
