// Öffentliche Webseiten vom Server laden (Impressum, Logo, Allianz-Vertreter-Seite).
//
// Ole, 18.11.2026: vertretung.allianz.de liegt hinter Cloudflare. Vom Server
// (Rechenzentrum) kam statt der Seite nur eine kleine Sperrseite zurück, die
// Oberfläche meldete dann „Vertreter-Seite nicht gefunden" bzw. „Die Webseite
// ließ sich nicht laden". Deshalb ein gemeinsamer Abruf mit Browser-Kopfzeilen,
// Weiterleitungen, großzügiger Wartezeit und klarer Unterscheidung
// „gesperrt" / „nicht gefunden" / „nicht erreichbar". Protokolliert werden nur
// Status und Ziel-Adresse, nie Inhalte.

export const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type PageFetch =
  | { ok: true; status: number; finalUrl: string; contentType: string; body: string }
  | { ok: false; reason: "blocked" | "notFound" | "http" | "network"; status: number | null; finalUrl: string | null };

/**
 * Sieht die Antwort nach einer Bot-Sperre aus (Cloudflare & Co.) statt nach der echten Seite?
 * Achtung: echte Seiten hinter Cloudflare enthalten oft auch „challenge-platform" (Skript im Fuß),
 * deshalb zählt bei Status 200 nur eine kleine Seite mit Sperr-Titel.
 */
export function looksBlocked(status: number, headers: Headers, body: string): boolean {
  if (headers.get("cf-mitigated")) return true;
  if (status === 401 || status === 403 || status === 429 || status === 503) return true;
  if (status >= 200 && status < 300 && body.length > 60_000) return false;
  return /<title>\s*(Just a moment|Attention Required|Access denied|Zugriff verweigert|Einen Moment)/i.test(body.slice(0, 20_000));
}

/**
 * Seite laden. `fetchImpl` nur für Tests. Wirft nie; `ok:false` mit Grund.
 * Bei `ok:true` ist der Inhalt auf `maxBytes` gekürzt.
 */
export async function fetchPage(
  url: string,
  opts: { timeoutMs?: number; accept?: string; maxBytes?: number; log?: string } = {},
): Promise<PageFetch> {
  const { timeoutMs = 20_000, accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", maxBytes = 1_500_000, log = "web-fetch" } = opts;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "user-agent": BROWSER_UA, accept, "accept-language": "de-DE,de;q=0.9,en;q=0.5" },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    console.warn(`[${log}] Abruf fehlgeschlagen`, { url, error: err instanceof Error ? err.name : "unbekannt" });
    return { ok: false, reason: "network", status: null, finalUrl: null };
  }
  const finalUrl = res.url || url;
  const contentType = res.headers.get("content-type") ?? "";
  let body = "";
  try {
    body = (await res.text()).slice(0, maxBytes);
  } catch {
    body = "";
  }
  const blocked = looksBlocked(res.status, res.headers, body);
  if (!res.ok || blocked) {
    const reason = blocked ? "blocked" : res.status === 404 || res.status === 410 ? "notFound" : "http";
    console.warn(`[${log}] Seite nicht geladen`, { status: res.status, finalUrl, reason });
    return { ok: false, reason, status: res.status, finalUrl };
  }
  console.info(`[${log}] Seite geladen`, { status: res.status, finalUrl });
  return { ok: true, status: res.status, finalUrl, contentType, body };
}
