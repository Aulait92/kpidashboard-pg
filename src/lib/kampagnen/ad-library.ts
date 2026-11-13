// Gewinner aus der Meta-Werbebibliothek (Ole, 13.11.2026): Bevor das KI-Team Anzeigen schreibt,
// suchen wir zum Produkt Anzeigen anderer Werbetreibender, die in Deutschland schon lange laufen.
// Wer eine Anzeige über Wochen laufen lässt, verdient damit meist Geld – das ist unser „Gewinner“-Signal.
// Das Team nutzt sie als Vorlage für Hook, Aufbau und Winkel und formuliert eigenständig um.
// Offizielle Schnittstelle: Graph API /ads_archive (Token mit Zugriff auf die Werbebibliothek).

const GRAPH = "https://graph.facebook.com/v22.0";
const MIN_TAGE = 30;

export type LibraryAd = { page: string; body: string; title: string | null; days: number };

const SUCHBEGRIFFE: [RegExp, string[]][] = [
  [/katze|tkv(?!.*hund)|tierkranken/i, ["Katzenversicherung", "Katzenkrankenversicherung", "OP-Versicherung Katze"]],
  [/hund/i, ["Hundekrankenversicherung", "OP-Versicherung Hund"]],
  [/pferd/i, ["Pferdeversicherung", "Pferde OP-Versicherung"]],
  [/privatschutz|haftpflicht|hausrat|rechtsschutz/i, ["Privathaftpflicht", "Hausratversicherung", "Rechtsschutzversicherung"]],
  [/sterbegeld/i, ["Sterbegeldversicherung"]],
  [/pkv|kranken/i, ["private Krankenversicherung", "PKV Beitrag senken"]],
  [/kinder|sparplan/i, ["Kindersparplan"]],
];

export function suchbegriffe(product: string): string[] {
  return SUCHBEGRIFFE.find(([re]) => re.test(product))?.[1] ?? [product];
}

function token(): string | null {
  const t = (process.env.META_AD_LIBRARY_TOKEN || process.env.META_ACCESS_TOKEN || "").trim();
  return t || null;
}

type ArchiveAd = {
  page_name?: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
  ad_delivery_start_time?: string;
  ad_delivery_stop_time?: string;
};

/** Lange laufende, aktive Anzeigen zum Produkt (höchstens `max`), längste zuerst. Ohne Token oder bei Fehlern: []. */
export async function libraryWinners(
  product: string,
  opts: { max?: number; now?: Date; fetchFn?: typeof fetch; excludePages?: string[] } = {},
): Promise<LibraryAd[]> {
  const t = token();
  if (!t) return [];
  const f = opts.fetchFn ?? fetch;
  const now = (opts.now ?? new Date()).getTime();
  const exclude = new Set((opts.excludePages ?? []).map((p) => p.toLowerCase()));
  const seen = new Set<string>();
  const out: LibraryAd[] = [];
  for (const term of suchbegriffe(product)) {
    const q = new URLSearchParams({
      search_terms: term,
      ad_reached_countries: '["DE"]',
      ad_active_status: "ACTIVE",
      ad_type: "ALL",
      languages: '["de"]',
      fields: "page_name,ad_creative_bodies,ad_creative_link_titles,ad_delivery_start_time,ad_delivery_stop_time",
      limit: "100",
      access_token: t,
    });
    try {
      const res = await f(`${GRAPH}/ads_archive?${q}`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) {
        console.error("[ad-library]", res.status, (await res.text()).slice(0, 200));
        continue;
      }
      const json = (await res.json()) as { data?: ArchiveAd[] };
      for (const a of json.data ?? []) {
        const body = a.ad_creative_bodies?.[0]?.trim();
        const start = a.ad_delivery_start_time ? Date.parse(a.ad_delivery_start_time) : NaN;
        if (!body || !Number.isFinite(start) || a.ad_delivery_stop_time) continue;
        const days = Math.floor((now - start) / 86_400_000);
        if (days < MIN_TAGE) continue;
        const page = (a.page_name ?? "").trim();
        if (exclude.has(page.toLowerCase())) continue;
        const key = body.toLowerCase().replace(/\s+/g, " ").slice(0, 120);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ page, body: body.slice(0, 600), title: a.ad_creative_link_titles?.[0]?.trim() || null, days });
      }
    } catch (err) {
      console.error("[ad-library]", err instanceof Error ? err.message : err);
    }
  }
  return out.sort((a, b) => b.days - a.days).slice(0, opts.max ?? 6);
}

/** Block für die Agenten-Anweisungen (null ohne Treffer). */
export function winnersBlock(ads: LibraryAd[]): string | null {
  if (!ads.length) return null;
  return ads
    .map((a, i) => `${i + 1}. ${a.page || "Unbekannt"} – läuft seit ${a.days} Tagen${a.title ? ` – Überschrift: „${a.title}“` : ""}\n   „${a.body.replace(/\s+/g, " ")}“`)
    .join("\n");
}
