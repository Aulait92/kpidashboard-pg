// Hilfsfunktionen: HTTP, HTML-Entities, Cloudflare-Mail-Decode, Portal-Parser,
// Website-Auflösung (DuckDuckGo), Impressum-/Kontakt-Extraktion, CSV.
// Bewusst ohne externe Abhängigkeiten (nur Node 18+ mit globalem fetch).

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch mit Timeout + realistischem User-Agent. Gibt {ok, status, text} zurück, wirft nie.
export async function fetchText(url, { timeout = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "de-DE,de;q=0.9", Accept: "text/html,*/*" },
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
let _ddgNext = 0; // globale Zeitsperre: DDG-Aufrufe über ALLE Worker hinweg entzerren
async function ddgGate(minGapMs = 1300) {
  const now = Date.now();
  const wait = Math.max(0, _ddgNext - now);
  _ddgNext = Math.max(now, _ddgNext) + minGapMs + Math.floor(Math.random() * 400);
  if (wait) await sleep(wait);
}

export async function resolveWebsite(firma, ort, blockDomains) {
  const skip = [...blockDomains, "duckduckgo.com", "duck.com"];
  const q = encodeURIComponent(`${firma} ${ort} impressum`);
  const endpoints = [`https://html.duckduckgo.com/html/?q=${q}`, `https://lite.duckduckgo.com/lite/?q=${q}`];
  for (const url of endpoints) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await ddgGate();
      if (attempt) await sleep(attempt * 1500); // Backoff nach Challenge
      const { ok, text } = await fetchText(url);
      if (!ok || !text) continue;
      const encoded = [...text.matchAll(/uddg=([^&"']+)/g)].map((m) => safeDecode(m[1]));
      if (!encoded.length) continue; // Challenge-Seite -> Retry / nächster Endpoint
      for (const u of encoded) {
        try {
          const host = new URL(u).hostname.replace(/^www\./, "");
          if (!host.includes(".")) continue;
          if (skip.some((d) => host === d || host.endsWith("." + d))) continue;
          if (/\.(pdf|jpg|png|gif)(\?|$)/i.test(u)) continue;
          return `https://${host}`;
        } catch {}
      }
      break; // Treffer da, aber alle geblockt -> nächster Endpoint
    }
  }
  return "";
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
