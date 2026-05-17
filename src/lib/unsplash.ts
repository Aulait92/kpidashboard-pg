// Stock-Photo-Resolver für {{UNSPLASH:keywords}}-Platzhalter (Name aus
// Legacy-Gründen, intern werden je nach verfügbaren API-Keys mehrere
// Quellen genutzt).
//
// Quellen:
//   - Unsplash (Pflicht-Key, default-Quelle)
//   - Pexels (optional via PEXELS_API_KEY — wird 50/50 mit Unsplash gemischt)
//
// Strategie zur Bild-Vielfalt:
//   - Pro Query random Source aus den verfügbaren Quellen
//   - Pro Source random Page (1-3) statt immer Top-Treffer
//   - Pro Page bis zu 15 Treffer, daraus random pick
//   - Query-Simplification-Chain wenn keine Treffer: 'volle Query → 3 Wörter → 1 Wort → "person"'

const PLACEHOLDER_RE = /\{\{UNSPLASH:([^}]+)\}\}/g;

const FALLBACK_DATA_URL =
  "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201%201%22%3E%3Crect%20width%3D%221%22%20height%3D%221%22%20fill%3D%22%23222%22%2F%3E%3C%2Fsvg%3E";

const ULTIMATE_FALLBACK_QUERY = "person";

const PER_PAGE = 15;
const MAX_PAGE = 3;

type Source = "unsplash" | "pexels";

function getAvailableSources(): Source[] {
  const sources: Source[] = [];
  if (process.env.UNSPLASH_ACCESS_KEY) sources.push("unsplash");
  if (process.env.PEXELS_API_KEY) sources.push("pexels");
  return sources;
}

async function searchUnsplash(query: string, page: number): Promise<string | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(PER_PAGE));
  url.searchParams.set("page", String(page));
  url.searchParams.set("orientation", "squarish");
  url.searchParams.set("content_filter", "high");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${key}` },
  });
  if (!res.ok) {
    console.warn(`[unsplash] search ${res.status} für "${query}" page ${page}`);
    return null;
  }
  const data = (await res.json()) as {
    results?: { urls?: { regular?: string; full?: string } }[];
  };
  const results = data.results ?? [];
  if (results.length === 0) return null;
  const pick = results[Math.floor(Math.random() * results.length)];
  return pick.urls?.regular ?? pick.urls?.full ?? null;
}

async function searchPexels(query: string, page: number): Promise<string | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(PER_PAGE));
  url.searchParams.set("page", String(page));
  url.searchParams.set("orientation", "square");
  url.searchParams.set("size", "medium");
  const res = await fetch(url.toString(), {
    headers: { Authorization: key },
  });
  if (!res.ok) {
    console.warn(`[pexels] search ${res.status} für "${query}" page ${page}`);
    return null;
  }
  const data = (await res.json()) as {
    photos?: { src?: { large?: string; original?: string; medium?: string } }[];
  };
  const results = data.photos ?? [];
  if (results.length === 0) return null;
  const pick = results[Math.floor(Math.random() * results.length)];
  return pick.src?.large ?? pick.src?.original ?? pick.src?.medium ?? null;
}

async function searchSource(
  source: Source,
  query: string,
  page: number,
): Promise<string | null> {
  return source === "unsplash"
    ? await searchUnsplash(query, page)
    : await searchPexels(query, page);
}

function querySimplificationChain(query: string): string[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const chain: string[] = [query];
  if (words.length > 3) chain.push(words.slice(0, 3).join(" "));
  if (words.length > 1) chain.push(words[0]);
  chain.push(ULTIMATE_FALLBACK_QUERY);
  return Array.from(new Set(chain));
}

async function fetchStockUrl(query: string): Promise<string> {
  const sources = getAvailableSources();
  if (sources.length === 0) {
    console.warn(
      "[stock-photo] weder UNSPLASH_ACCESS_KEY noch PEXELS_API_KEY gesetzt — Fallback-Grau.",
    );
    return FALLBACK_DATA_URL;
  }

  // Shuffle Sources damit nicht immer Unsplash zuerst probiert wird.
  const order = [...sources].sort(() => Math.random() - 0.5);

  for (const attempt of querySimplificationChain(query)) {
    for (const source of order) {
      const page = 1 + Math.floor(Math.random() * MAX_PAGE);
      try {
        const url = await searchSource(source, attempt, page);
        if (url) {
          if (attempt !== query) {
            console.log(
              `[stock-photo] "${query}" leer, Fallback auf "${attempt}" via ${source} p${page} → Treffer.`,
            );
          } else {
            console.log(`[stock-photo] "${query}" via ${source} p${page}.`);
          }
          return url;
        }
      } catch (err) {
        console.warn(
          `[stock-photo] ${source} error "${attempt}":`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
  return FALLBACK_DATA_URL;
}

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
      resolved.set(q, await fetchStockUrl(q));
    }),
  );

  return html.replace(PLACEHOLDER_RE, (_full, q: string) => {
    return resolved.get(q.trim()) ?? FALLBACK_DATA_URL;
  });
}
