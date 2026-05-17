import Replicate from "replicate";

// Comic-Style-Bild-Generation via Replicate (Flux Schnell).
// Pattern im HTML:
//   src="{{COMIC:keywords}}"
//   background-image: url({{COMIC:keywords}})
//
// Server appended Style-Modifier ("comic book illustration, flat colors,
// bold outlines, …") an die User-Keywords und generiert ein quadratisches
// Bild. Flux-Schnell ist die billige Variante (~$0.003/Bild, ~3s).
//
// Ohne REPLICATE_API_TOKEN gracefuller Fallback auf neutrales Grau —
// kein Crash, das Creative wird nur ohne Comic gerendert.

const PLACEHOLDER_RE = /\{\{COMIC:([^}]+)\}\}/g;

const FALLBACK_DATA_URL =
  "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201%201%22%3E%3Crect%20width%3D%221%22%20height%3D%221%22%20fill%3D%22%23eee%22%2F%3E%3C%2Fsvg%3E";

const STYLE_SUFFIX =
  ", modern comic book illustration, flat colors, bold black outlines, clean vector art, professional editorial illustration, white background, no text, no speech bubbles";

async function generateComicImage(keywords: string): Promise<string> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    console.warn(
      "[replicate] REPLICATE_API_TOKEN nicht gesetzt — Comic-Fallback (grau).",
    );
    return FALLBACK_DATA_URL;
  }
  const replicate = new Replicate({ auth: token });
  const prompt = `${keywords}${STYLE_SUFFIX}`;
  try {
    const output = await replicate.run("black-forest-labs/flux-schnell", {
      input: {
        prompt,
        aspect_ratio: "1:1",
        output_format: "jpg",
        output_quality: 90,
        num_outputs: 1,
        go_fast: true,
      },
    });
    // Flux-Schnell-Output ist je nach Version: string | string[] | File[]
    // Wir normalisieren auf die erste URL.
    const url =
      typeof output === "string"
        ? output
        : Array.isArray(output) && typeof output[0] === "string"
          ? output[0]
          : null;
    if (!url) {
      console.warn(
        `[replicate] unerwartetes Output-Shape für "${keywords}":`,
        JSON.stringify(output).slice(0, 200),
      );
      return FALLBACK_DATA_URL;
    }
    return url;
  } catch (err) {
    console.warn(
      `[replicate] Generation failte für "${keywords}":`,
      err instanceof Error ? err.message : err,
    );
    return FALLBACK_DATA_URL;
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
