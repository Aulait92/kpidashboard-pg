/**
 * MLP Berater Scraper.
 *
 * Pipeline:
 *   1. Stadt-Liste: alle md_location-Werte aus mlp.de/suche/mlp_select (via Playwright,
 *      weil Hauptdomain Cloudflare-protected). ~50-100 MLP-Standorte.
 *   2. Pro Stadt: mlp-<location>.de/sitemap.xml laden (native fetch, kein Cloudflare),
 *      Profile-URLs (/team/profile/<slug>/) extrahieren.
 *   3. Pro Profil: HTML laden, Name/Email/Phone/Mobile/Adresse parsen.
 *   4. CSV nach data/mlp-advisors.csv, sortiert alphabetisch.
 *
 * Run:
 *   npm run scrape:mlp
 *   npm run scrape:mlp -- --cities=aachen,berlin --concurrency=4
 */

import { writeFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const OUTPUT_PATH = "data/mlp-advisors.csv";
const EMAIL_DOMAIN = "mlp.de";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type Args = {
  cities: string[] | null; // override discovery
  concurrency: number;
  max: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { cities: null, concurrency: 5, max: 0 };
  for (const raw of argv.slice(2)) {
    const [k, v] = raw.includes("=") ? raw.split("=", 2) : [raw, "true"];
    switch (k) {
      case "--cities":
        args.cities = v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        break;
      case "--concurrency":
        args.concurrency = parseInt(v, 10);
        break;
      case "--max":
        args.max = parseInt(v, 10);
        break;
      default:
        console.warn(`Unknown arg: ${k}`);
    }
  }
  return args;
}

// 1) City-Discovery via Playwright (intercept Solr response on Beratersuche)
async function discoverCities(): Promise<string[]> {
  console.log(`[1/4] Discover Cities via Playwright (Solr-Interception)...`);
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ userAgent: USER_AGENT, locale: "de-DE" });
    const page = await ctx.newPage();
    let captured: { response?: { docs?: { md_location?: string }[] } } | null = null;
    page.on("response", async (resp) => {
      if (resp.url().includes("mlp_select") && resp.url().includes("rows=2147483647")) {
        try {
          captured = await resp.json();
        } catch {}
      }
    });
    await page.goto("https://mlp.de/kontakt-service/kontakt/beratersuche/?q=", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(7_000);
    if (!captured?.response?.docs) {
      throw new Error("Solr-Response nicht abgefangen");
    }
    const locs = new Set<string>();
    for (const d of captured.response.docs) {
      if (d.md_location) locs.add(d.md_location.toLowerCase());
    }
    console.log(`  ✓ ${captured.response.docs.length} Berater · ${locs.size} unique Locations`);
    return [...locs].sort();
  } finally {
    await browser.close();
  }
}

async function fetchText(url: string, retries = 2): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "de-DE,de;q=0.9" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        if (res.status === 404 || res.status === 410) return null;
        if (res.status === 429 || res.status >= 500) {
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
        }
        return null;
      }
      return await res.text();
    } catch {
      if (attempt === retries) return null;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return null;
}

// 2) Per Stadt-Subdomain die Profile-URLs aus sitemap.xml ziehen
async function collectProfilesFromCity(city: string): Promise<string[]> {
  const subdomain = `mlp-${city}.de`;
  const xml = await fetchText(`https://${subdomain}/sitemap.xml`);
  if (!xml) return [];
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  return locs.filter((u) => /team\/profile\/[^\/]+\/?$/.test(u));
}

type Advisor = {
  city: string;
  slug: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  mobile: string;
  street: string;
  zip: string;
  addressCity: string;
  role: string;
  url: string;
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&auml;/gi, "ä")
    .replace(/&ouml;/gi, "ö")
    .replace(/&uuml;/gi, "ü")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyPhone(num: string): "mobile" | "phone" {
  const digits = num.replace(/[^0-9]/g, "").replace(/^49/, "0");
  return /^01[5-7]\d/.test(digits) ? "mobile" : "phone";
}

const STREET_SUFFIX = "(?:str\\.?|straße|strasse|weg|platz|allee|ring|gasse|damm|chaussee|ufer|markt|hof|park|berg|tal|feld|brücke|stiege|stieg|zeile|reihe)";
const STREET_REGEX = new RegExp(
  `([A-ZÄÖÜ][\\wäöüÄÖÜß.\\-]*${STREET_SUFFIX}\\s+\\d+[a-zA-Z]?)\\s*[,·\\/]?\\s+(\\d{5})\\s+([A-ZÄÖÜ][a-zäöüÄÖÜß.\\-]{1,40})(?=\\s|$|<)`,
  "i",
);
const STREET_FALLBACK = /\b([A-ZÄÖÜ][\wäöüÄÖÜß.\-]+\s+\d+[a-zA-Z]?)\s*[,·\/]?\s+(\d{5})\s+([A-ZÄÖÜ][a-zäöüÄÖÜß.\-]{1,40})\b/;

function extractAddress(text: string): { street: string; zip: string; city: string } {
  let m = text.match(STREET_REGEX);
  if (!m) m = text.match(STREET_FALLBACK);
  if (!m) return { street: "", zip: "", city: "" };
  return { street: m[1].trim(), zip: m[2], city: m[3].trim() };
}

// Role keywords typical for MLP berater
const ROLE_HIERARCHY = [
  "Geschäftsstellenleiter",
  "Geschäftsstellenleiterin",
  "Senior Berater",
  "Senior Beraterin",
  "Hochschulberater",
  "Hochschulberaterin",
  "Berater",
  "Beraterin",
];

function buildRoleRegex(role: string): RegExp {
  return new RegExp(`\\b${role.replace(/\s+/g, "\\s+")}\\b`, "i");
}

function extractRole(text: string): string {
  for (const role of ROLE_HIERARCHY) {
    const m = text.match(buildRoleRegex(role));
    if (m) return m[0];
  }
  return "";
}

async function fetchProfile(url: string, city: string): Promise<Advisor | null> {
  const html = await fetchText(url);
  if (!html) return null;
  const m = url.match(/\/team\/profile\/([a-zäöüß0-9-]+)\/?$/i);
  if (!m) return null;
  const slug = m[1].toLowerCase();

  // Name aus h1
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const name = h1 ? stripHtml(h1[1]) : "";
  const tokens = name.split(/\s+/).filter(Boolean);
  const firstName = tokens.slice(0, -1).join(" ");
  const lastName = tokens[tokens.length - 1] || "";

  // Email aus mailto-Link (oder regex)
  let email = "";
  const mailto = html.match(/href=["']mailto:([^"'?]+@mlp\.de)/i);
  if (mailto) email = mailto[1].toLowerCase();
  else {
    const em = html.match(/\b([a-zäöüß0-9.\-_]+@mlp\.de)/i);
    if (em) email = em[1].toLowerCase();
  }

  // Phone aus tel:-Links
  let phone = "";
  let mobile = "";
  const tels = new Set<string>();
  for (const t of html.matchAll(/href=["']tel:([^"']+)/gi)) {
    const cleaned = t[1].replace(/[^\d+]/g, "");
    if (cleaned.length >= 8) tels.add(cleaned);
  }
  for (const t of tels) {
    if (classifyPhone(t) === "mobile") {
      if (!mobile) mobile = t;
    } else if (!phone) phone = t;
    if (phone && mobile) break;
  }

  const text = stripHtml(html);
  const addr = extractAddress(text);
  const role = extractRole(text);

  return {
    city,
    slug,
    name,
    firstName,
    lastName,
    email,
    phone,
    mobile,
    street: addr.street,
    zip: addr.zip,
    addressCity: addr.city,
    role,
    url,
  };
}

async function inBatches<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
      done++;
      onProgress?.(done, items.length);
    }
  });
  await Promise.all(workers);
  return results;
}

function escapeCsv(v: string): string {
  if (v.includes('"') || v.includes(",") || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

async function writeCsv(path: string, rows: Advisor[]): Promise<void> {
  const headers: (keyof Advisor)[] = [
    "name", "firstName", "lastName", "role", "email", "phone", "mobile",
    "street", "zip", "addressCity", "city", "slug", "url",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => escapeCsv(String(r[h] ?? ""))).join(","));
  }
  await mkdir("data", { recursive: true });
  await writeFile(path, lines.join("\n") + "\n", "utf8");
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`MLP-Scraper · concurrency=${args.concurrency}` + (args.max ? ` · max=${args.max}` : ""));

  const cities = args.cities ?? (await discoverCities());
  if (cities.length === 0) throw new Error("Keine Cities gefunden");
  if (args.cities) console.log(`  Cities (override): ${cities.join(", ")}`);

  console.log(`\n[2/4] Lade Sub-Sitemaps für ${cities.length} Städte...`);
  const allUrls: { city: string; url: string }[] = [];
  let cityDone = 0;
  await inBatches(cities, args.concurrency, async (city) => {
    const profiles = await collectProfilesFromCity(city);
    for (const u of profiles) allUrls.push({ city, url: u });
  }, (done, total) => {
    cityDone = done;
    if (done % 10 === 0 || done === total) {
      console.log(`  · ${done}/${total} (kumuliert ${allUrls.length} Profile)`);
    }
  });
  // Dedupe by URL
  const unique = new Map<string, { city: string; url: string }>();
  for (const e of allUrls) if (!unique.has(e.url)) unique.set(e.url, e);
  let entries = [...unique.values()];
  console.log(`  ✓ ${entries.length} unique Profile-URLs`);

  if (args.max > 0 && entries.length > args.max) {
    entries = entries.slice(0, args.max);
    console.log(`  Nach --max: ${entries.length}`);
  }

  console.log(`\n[3/4] Lade Profile (concurrency=${args.concurrency})...`);
  const startedAt = Date.now();
  const advisors = await inBatches(entries, args.concurrency, ({ city, url }) => fetchProfile(url, city), (done, total) => {
    if (done % 50 === 0 || done === total) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = done / Math.max(elapsed, 0.1);
      const eta = (total - done) / Math.max(rate, 0.1);
      console.log(`  · ${done}/${total} (${rate.toFixed(1)}/s · ETA ${Math.round(eta)}s)`);
    }
  });
  const valid = advisors.filter((a): a is Advisor => a !== null);

  // Sort: by city, then last name
  valid.sort((a, b) => a.city.localeCompare(b.city) || a.lastName.localeCompare(b.lastName, "de"));

  console.log(`\n[4/4] Schreibe ${OUTPUT_PATH}...`);
  await writeCsv(OUTPUT_PATH, valid);
  console.log(`  ✓ ${valid.length} Zeilen`);

  // Stats
  const withEmail = valid.filter((a) => a.email).length;
  const withPhone = valid.filter((a) => a.phone || a.mobile).length;
  const withAddr = valid.filter((a) => a.zip).length;
  const byRole = new Map<string, number>();
  for (const a of valid) {
    const k = a.role || "unbekannt";
    byRole.set(k, (byRole.get(k) ?? 0) + 1);
  }
  console.log(`\nSummary: ${valid.length} Berater · ${withEmail} mit Email · ${withPhone} mit Phone · ${withAddr} mit Adresse`);
  console.log(`Rollen: ${[...byRole.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${k}=${n}`).join(" · ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
