// Unsplash-API-Helper. Wird genutzt um Bild-Platzhalter in Claude's HTML
// gegen echte Foto-URLs auszutauschen. Pattern in HTML:
//   src="{{UNSPLASH:keywords here}}"
//   background-image: url({{UNSPLASH:keywords here}})
//
// Strategie: /search/photos statt /photos/random — returnt nie 404,
// nur leere Ergebnisliste. Bei keinem Treffer wird die Query
// schrittweise vereinfacht (volle Query → erste 3 Wörter → erstes Wort
// → generisches "person") bis was kommt.

const PLACEHOLDER_RE = /\{\{UNSPLASH:([^}]+)\}\}/g;

// Fallback wenn alle Query-Stufen leer bleiben oder kein API-Key da ist.
const FALLBACK_DATA_URL =
  "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201%201%22%3E%3Crect%20width%3D%221%22%20height%3D%221%22%20fill%3D%22%23222%22%2F%3E%3C%2Fsvg%3E";

// Stabiler letzter Anker — wenn auch "person" leer ist, ist Unsplash kaputt.
const ULTIMATE_FALLBACK_QUERY = "person";

async function searchUnsplash(query: string, key: string): Promise<string | null> {
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", "10");
  url.searchParams.set("orientation", "squarish");
  url.searchParams.set("content_filter", "high");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${key}` },
  });
  if (!res.ok) {
    console.warn(`[unsplash] search ${res.status} für "${query}"`);
    return null;
  }
  const data = (await res.json()) as {
    results?: { urls?: { regular?: string; full?: string } }[];
  };
  const results = data.results ?? [];
  if (results.length === 0) return null;
  // Random pick aus den ersten 10 Treffern — sonst kriegen alle Creatives
  // mit gleichem Query identische Bilder.
  const pick = results[Math.floor(Math.random() * results.length)];
  return pick.urls?.regular ?? pick.urls?.full ?? null;
}

// Vereinfacht eine Query schrittweise: volle Query → ersten 3 Wörter → ersten Wort.
function querySimplificationChain(query: string): string[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const chain: string[] = [query];
  if (words.length > 3) chain.push(words.slice(0, 3).join(" "));
  if (words.length > 1) chain.push(words[0]);
  chain.push(ULTIMATE_FALLBACK_QUERY);
  // De-dupe für den Fall dass query schon kurz war.
  return Array.from(new Set(chain));
}

async function fetchUnsplashUrl(query: string): Promise<string> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    console.warn(
      "[unsplash] UNSPLASH_ACCESS_KEY nicht gesetzt — nutze Fallback-Grau.",
    );
    return FALLBACK_DATA_URL;
  }
  for (const attempt of querySimplificationChain(query)) {
    try {
      const url = await searchUnsplash(attempt, key);
      if (url) {
        if (attempt !== query) {
          console.log(
            `[unsplash] "${query}" leer, Fallback auf "${attempt}" → Treffer.`,
          );
        }
        return url;
      }
      console.warn(`[unsplash] keine Treffer für "${attempt}"`);
    } catch (err) {
      console.warn(`[unsplash] fetch error "${attempt}":`, err);
    }
  }
  return FALLBACK_DATA_URL;
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
