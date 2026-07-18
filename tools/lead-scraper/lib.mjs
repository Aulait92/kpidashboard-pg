// Hilfsfunktionen: HTTP, HTML-Entities, Cloudflare-Mail-Decode, Portal-Parser,
// Website-Auflösung (DuckDuckGo), Impressum-/Kontakt-Extraktion, CSV.
// Bewusst ohne externe Abhängigkeiten (nur Node 18+ mit globalem fetch).

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch mit Timeout + realistischem User-Agent. Gibt {ok, status, text} zurück, wirft nie.
export async function fetchText(url, { timeout = 15000, method = "GET", body, headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method,
      body,
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "de-DE,de;q=0.9", Accept: "text/html,*/*", ...headers },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, finalUrl: res.url };
  } catch (e) {
    return { ok: false, status: 0, text: "", error: String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}

// HTML-Entities dekodieren (benannte Basics + numerisch dezimal/hex).
export function decodeEntities(s = "") {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", szlig: "ß", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü" };
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => (n in named ? named[n] : m))
    .trim();
}

// Cloudflare-"email-protection" dekodieren: data-cfemail="<hex>" -> Klartext.
export function cfDecode(hex) {
  try {
    const key = parseInt(hex.substr(0, 2), 16);
    let out = "";
    for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.substr(i, 2), 16) ^ key);
    return out;
  } catch {
    return "";
  }
}

// ---- Portal-Adapter: pflegehilfe.org (JSON-LD LocalBusiness) ----
// Liefert [{firma, ort, adresse, quelle}] für eine Stadtseite.
export function parsePflegehilfe(html, ort, quelle) {
  const out = [];
  const blocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  for (const b of blocks) {
    const json = b.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
    if (!json.includes("LocalBusiness")) continue;
    let obj;
    try { obj = JSON.parse(json); } catch { continue; }
    const firma = decodeEntities(obj?.name || "").replace(/\s*\(überregionaler Anbieter\)\s*/i, "").trim();
    if (!firma) continue;
    out.push({ firma, ort, adresse: decodeEntities(obj?.address || ""), quelle });
  }
  return out;
}

// ---- Website-Auflösung via DuckDuckGo (HTML- und Lite-Endpoint) ----
// Nur die echten Treffer-URLs (uddg=<encoded>) auswerten — die rohen href-Links sind
// DDG-Navigation und würden fälschlich duckduckgo.com liefern.
let _gateNext = 0; // globale Zeitsperre über ALLE Worker hinweg entzerren
async function gate(minGapMs) {
  const now = Date.now();
  const wait = Math.max(0, _gateNext - now);
  _gateNext = Math.max(now, _gateNext) + minGapMs + Math.floor(Math.random() * 400);
  if (wait) await sleep(wait);
}

function pickHost(urls, skip) {
  for (const u of urls) {
    try {
      const host = new URL(u).hostname.replace(/^www\./, "");
      if (!host.includes(".")) continue;
      if (skip.some((d) => host === d || host.endsWith("." + d))) continue;
      if (/\.(pdf|jpg|png|gif)(\?|$)/i.test(u)) continue;
      return `https://${host}`;
    } catch {}
  }
  return "";
}

// Brave Search API (zuverlässig; kostenloser Key: https://brave.com/search/api/).
// Aktiv, sobald BRAVE_API_KEY gesetzt ist.
async function braveResolve(firma, ort, skip) {
  await gate(1100); // free tier: ~1 req/s
  const q = encodeURIComponent(`${firma} ${ort} impressum`);
  const { ok, text } = await fetchText(`https://api.search.brave.com/res/v1/web/search?q=${q}&country=DE&count=8`, {
    headers: { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_API_KEY },
  });
  if (!ok || !text) return "";
  try {
    const urls = (JSON.parse(text)?.web?.results || []).map((r) => r.url).filter(Boolean);
    return pickHost(urls, skip);
  } catch { return ""; }
}

// DuckDuckGo per POST (browsernah, robuster als GET). Mit Circuit-Breaker:
// nach mehreren Fehlschlägen (IP geflaggt) wird DDG für den Rest des Laufs abgeschaltet,
// damit nicht jede Firma ~30s in sinnlose Retries läuft.
let _ddgConsecFails = 0, _ddgDisabled = false;
async function ddgResolve(firma, ort, skip) {
  if (_ddgDisabled) return "";
  const body = `q=${encodeURIComponent(`${firma} ${ort} impressum`)}&kl=de-de`;
  const endpoints = ["https://html.duckduckgo.com/html/", "https://lite.duckduckgo.com/lite/"];
  for (const url of endpoints) {
    for (let attempt = 0; attempt < 2; attempt++) {
      await gate(2500);
      if (attempt) await sleep(3000);
      const { ok, text } = await fetchText(url, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "https://duckduckgo.com", Referer: "https://duckduckgo.com/" },
      });
      if (!ok || !text) continue;
      const urls = [...text.matchAll(/uddg=([^&"']+)/g)].map((m) => safeDecode(m[1]));
      if (!urls.length) continue; // Challenge -> Retry / nächster Endpoint
      _ddgConsecFails = 0;
      const host = pickHost(urls, skip);
      if (host) return host;
      break;
    }
  }
  if (++_ddgConsecFails >= 5 && !_ddgDisabled) {
    _ddgDisabled = true;
    console.warn("  ⚠  DuckDuckGo blockt (IP geflaggt) — Suchmaschinen-Fallback für diesen Lauf deaktiviert. Für hohe Trefferquote BRAVE_API_KEY setzen.");
  }
  return "";
}

// OpenStreetMap / Nominatim (keyless, wird nicht geflaggt). Liefert für gemappte
// Betriebe oft Website UND Telefon/E-Mail direkt aus den OSM-Tags.
export async function osmLookup(firma, ort, skip = []) {
  await gate(1200); // Nominatim-Policy: max 1 req/s
  const q = encodeURIComponent(`${firma}, ${ort}, Deutschland`);
  const { ok, text } = await fetchText(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&extratags=1&addressdetails=1&q=${q}`,
    { headers: { "User-Agent": "lead-scraper/1.0 (Kontaktrecherche; +https://github.com)" } }
  );
  if (!ok || !text) return {};
  let arr;
  try { arr = JSON.parse(text); } catch { return {}; }
  const e = arr?.[0]?.extratags || {};
  let website = e.website || e["contact:website"] || e.url || "";
  try { if (website) { const h = new URL(website.startsWith("http") ? website : "https://" + website).hostname.replace(/^www\./, ""); website = skip.some((d) => h === d || h.endsWith("." + d)) ? "" : "https://" + h; } } catch { website = ""; }
  return {
    website,
    telefon: (e.phone || e["contact:phone"] || "").split(";")[0].trim(),
    email: (e.email || e["contact:email"] || "").split(";")[0].trim().toLowerCase(),
  };
}

// Website-Auflösung: Brave (falls Key) -> DuckDuckGo (Notnagel).
export async function resolveWebsite(firma, ort, blockDomains) {
  const skip = [...blockDomains, "duckduckgo.com", "duck.com"];
  if (process.env.BRAVE_API_KEY) {
    const r = await braveResolve(firma, ort, skip);
    if (r) return r;
  }
  return ddgResolve(firma, ort, skip);
}

function safeDecode(s) { try { return decodeURIComponent(s); } catch { return s; } }

// ---- Kontakt-Extraktion von einer Firmenseite (Startseite + /impressum + /kontakt) ----
const JUNK_MAIL = /(sentry|example|wix|godaddy|cloudflare|\.png|\.jpg|domain\.|muster|test@)/i;

function extractFromHtml(html, host) {
  const emails = new Set();
  const phones = new Set();
  // Cloudflare-geschützte Mails
  for (const m of html.matchAll(/data-cfemail="([0-9a-f]+)"/gi)) {
    const dec = cfDecode(m[1]);
    if (dec.includes("@")) emails.add(dec.toLowerCase());
  }
  for (const m of html.matchAll(/mailto:([^"'?]+)/gi)) emails.add(decodeEntities(m[1]).toLowerCase());
  for (const m of html.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) emails.add(m[0].toLowerCase());
  for (const m of html.matchAll(/tel:(\+?[0-9()\/.\- ]{6,})/gi)) phones.add(m[1].trim());
  // Telefon im Klartext (deutsche Muster) als Fallback
  for (const m of html.matchAll(/(?:Tel|Telefon|Fon|Phone)[.:\s]*?(\+?(?:49|0)[0-9()\/.\- ]{6,}[0-9])/gi)) phones.add(m[1].trim());

  const cleanMails = [...emails].filter((e) => !JUNK_MAIL.test(e) && e.length < 60);
  // gleiche Domain bevorzugen, dann info@/kontakt@
  const domain = host.replace(/^www\./, "");
  cleanMails.sort((a, b) => {
    const sa = (a.endsWith("@" + domain) ? -2 : 0) + (/^(info|kontakt|mail|office)@/.test(a) ? -1 : 0);
    const sb = (b.endsWith("@" + domain) ? -2 : 0) + (/^(info|kontakt|mail|office)@/.test(b) ? -1 : 0);
    return sa - sb;
  });
  const cleanPhones = [...phones].map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p.replace(/\D/g, "").length >= 6);
  return { email: cleanMails[0] || "", telefon: cleanPhones[0] || "" };
}

function detectReichweite(html) {
  const t = html.toLowerCase();
  if (/(bundesweit|deutschlandweit|in ganz deutschland|deutschlandweite montage)/.test(t)) return "bundesweit";
  if (/(überregional|ueberregional|mehrere bundesländer|deutschlandweit tätig)/.test(t)) return "ueberregional";
  return "regional";
}

export async function enrichFromWebsite(website) {
  if (!website) return { email: "", telefon: "", reichweite: "regional" };
  let host;
  try { host = new URL(website).hostname; } catch { return { email: "", telefon: "", reichweite: "regional" }; }
  const pages = [website, website + "/impressum", website + "/kontakt", website + "/impressum/", website + "/impressum.html"];
  let email = "", telefon = "", htmlAll = "";
  for (const p of pages) {
    const { ok, text } = await fetchText(p);
    if (!ok || !text) continue;
    htmlAll += " " + text.toLowerCase().slice(0, 40000);
    const got = extractFromHtml(text, host);
    if (!email && got.email) email = got.email;
    if (!telefon && got.telefon) telefon = got.telefon;
    if (email && telefon) break;
    await sleep(300);
  }
  return { email, telefon, reichweite: detectReichweite(htmlAll) };
}

// ---- CSV ----
export const CSV_HEADER = ["Firma", "Nische", "Reichweite", "Ort", "Website", "Telefon", "E-Mail", "Lead-Kauf-Signal", "Quelle"];
const cell = (v = "") => String(v).replace(/;/g, ",").replace(/[\r\n]+/g, " ").trim();
export const toCsvRow = (r) => CSV_HEADER.map((h) => cell(r[h])).join(";");

// einfacher Concurrency-Pool
export async function pool(items, limit, worker) {
  const results = [];
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

export const normKey = (name) =>
  name.toLowerCase()
    .replace(/gmbh & co\.? kg|gmbh|& co\.? kg|mbh| ug| e\.?k\.?| ohg| gbr| kg| ag/g, " ")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9äöüß]/g, "");
