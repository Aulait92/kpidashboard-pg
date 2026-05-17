// Unsplash-API-Helper. Wird genutzt um Bild-Platzhalter in Claude's HTML
// gegen echte Foto-URLs auszutauschen. Pattern in HTML:
//   src="{{UNSPLASH:keywords here}}"
//   background-image: url({{UNSPLASH:keywords here}})
//
// Free-Tier-Konditionen (Demo App): 50 Requests/Stunde. Für unseren
// Workflow (paar Creatives/Tag) absolut ausreichend.

const PLACEHOLDER_RE = /\{\{UNSPLASH:([^}]+)\}\}/g;

// Fallback wenn kein API-Key gesetzt ist oder Unsplash failt — neutrales
// dunkles Grau, damit das Creative gerendert wird (statt Crash).
const FALLBACK_DATA_URL =
  "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201%201%22%3E%3Crect%20width%3D%221%22%20height%3D%221%22%20fill%3D%22%23222%22%2F%3E%3C%2Fsvg%3E";

async function fetchUnsplashUrl(query: string): Promise<string> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    console.warn(
      "[unsplash] UNSPLASH_ACCESS_KEY nicht gesetzt — nutze Fallback-Grau.",
    );
    return FALLBACK_DATA_URL;
  }
  const url = new URL("https://api.unsplash.com/photos/random");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "squarish");
  url.searchParams.set("content_filter", "high");
  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Client-ID ${key}` },
    });
    if (!res.ok) {
      console.warn(`[unsplash] ${res.status} für "${query}" — Fallback.`);
      return FALLBACK_DATA_URL;
    }
    const data = (await res.json()) as {
      urls?: { regular?: string; full?: string };
    };
    return data.urls?.regular ?? data.urls?.full ?? FALLBACK_DATA_URL;
  } catch (err) {
    console.warn(`[unsplash] fetch error "${query}":`, err);
    return FALLBACK_DATA_URL;
  }
}

// Ersetzt alle {{UNSPLASH:…}}-Platzhalter im HTML durch echte Foto-URLs.
// De-dupliziert Queries (gleicher Query -> gleiches Bild im selben Creative).
export async function resolveUnsplashPlaceholders(
  html: string,
): Promise<string> {
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
      resolved.set(q, await fetchUnsplashUrl(q));
    }),
  );

  return html.replace(PLACEHOLDER_RE, (_full, q: string) => {
    return resolved.get(q.trim()) ?? FALLBACK_DATA_URL;
  });
}
