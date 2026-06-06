/**
 * AXA-Betreuer Scraper.
 *
 * Pipeline:
 *   1. Discovery: für jede Stadt /<city> die advisor-Slugs aus den href-Links extrahieren
 *   2. Dedupe → eindeutige Berater-Slugs
 *   3. Pro Slug: /<slug>/ (Lead-Daten: Name, Email, Phone, Adresse, Role)
 *              + /<slug>/ueber-uns/filialen-und-team (Team-Größe via multiContactBox)
 *   4. CSV nach data/axa-advisors.csv, sortiert nach team_size desc
 *
 * Run:
 *   npm run scrape:axa
 *   npm run scrape:axa -- --cities=berlin,hamburg --concurrency=4
 *   npm run scrape:axa -- --include=stefan_bille
 */

import { writeFile, mkdir } from "node:fs/promises";

const BASE = "https://www.axa-betreuer.de";
const OUTPUT_PATH = "data/axa-advisors.csv";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// DE city endpoints für URL Discovery. AXA hat nur für die Top-30
// größten Städte eine /<city>-Sammelseite — alles andere gibt 410 Gone.
// Bestätigt funktionierende Endpoints (Stand 2026):
const DEFAULT_CITIES = [
  "berlin", "hamburg", "muenchen", "koeln", "frankfurt", "stuttgart",
  "duesseldorf", "leipzig", "dortmund", "essen", "bremen", "hannover",
  "dresden", "nuernberg", "duisburg", "bochum", "wuppertal", "bielefeld",
  "bonn", "muenster", "karlsruhe", "mannheim", "augsburg", "wiesbaden",
  "gelsenkirchen", "moenchengladbach", "braunschweig", "chemnitz", "kiel",
  "aachen", "kassel",
];

type Args = {
  cities: string[];
  concurrency: number;
  include: string | null;
  max: number;
  source: "cities" | "ddg" | "both";
  ddgQueries: string[] | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    cities: DEFAULT_CITIES,
    concurrency: 3,
    include: null,
    max: 0,
    source: "both",
    ddgQueries: null,
  };
  for (const raw of argv.slice(2)) {
    const [k, v] = raw.includes("=") ? raw.split("=", 2) : [raw, "true"];
    switch (k) {
      case "--cities":
        args.cities = v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        break;
      case "--concurrency":
        args.concurrency = parseInt(v, 10);
        break;
      case "--include":
        args.include = v.toLowerCase();
        break;
      case "--max":
        args.max = parseInt(v, 10);
        break;
      case "--source":
        if (v === "cities" || v === "ddg" || v === "both") args.source = v;
        else console.warn(`Unknown --source=${v}, using both`);
        break;
      case "--ddg-queries":
        args.ddgQueries = v.split(";").map((s) => s.trim()).filter(Boolean);
        break;
      default:
        console.warn(`Unknown arg: ${k}`);
    }
  }
  return args;
}

async function fetchText(url: string, retries = 3): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "de-DE,de;q=0.9" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        if (res.status === 404 || res.status === 410) return null; // permanent
        if (res.status === 429 || res.status >= 500) {
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1) + Math.random() * 500));
            continue;
          }
        }
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.text();
    } catch {
      if (attempt === retries) return null;
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1) + Math.random() * 300));
    }
  }
  return null;
}

// Slug pattern accepts both separators:
//   underscore: "Stefan_Bille" (camel-case on city pages)
//   hyphen: "oliver-haifl", "franziska-lena-gruendmayer"
// At least one separator between name parts. URL can be relative or absolute,
// with/without trailing slash. Lowercased for dedupe + fetch.
const SLUG_LINK_RE =
  /(?:https?:\/\/www\.axa-betreuer\.de|href=")\/?([A-Za-z][A-Za-z0-9äöüÄÖÜ]{0,40}[_-][A-Za-z][A-Za-z0-9äöüÄÖÜ_-]{1,60})(?=[\/"?#\s]|$)/g;

// Slugs to ignore (static pages, not advisor profiles)
const SLUG_BLACKLIST = new Set([
  "ao-portal", "ao-portale", "ao-webservices", "site", "static",
  "downloads", "kontakt", "impressum", "datenschutz", "presse", "agb",
  "wir_betreuer_axa", "axa_betreuer", "ueber_uns", "team_axa",
]);

function isValidSlug(slug: string): boolean {
  if (SLUG_BLACKLIST.has(slug)) return false;
  if (slug.length < 4 || slug.length > 80) return false;
  // Require at least one letter followed by underscore + letter
  if (!/[a-z]_[a-z]/.test(slug)) return false;
  return true;
}

// Default DDG queries — cover Rolle × Buchstabe-Modifier to maximize coverage.
// Each query returns up to 10 results; with multiple queries we get hundreds.
const DEFAULT_DDG_QUERIES = [
  "site:axa-betreuer.de Hauptvertretung",
  "site:axa-betreuer.de Generalvertretung",
  "site:axa-betreuer.de Geschäftsstelle",
  "site:axa-betreuer.de Versicherungsbüro",
  ...Array.from("abcdefghijklmnopqrstuvwxyz").map(
    (l) => `site:axa-betreuer.de inurl:${l}`,
  ),
];

async function discoverViaDuckDuckGo(queries: string[]): Promise<string[]> {
  console.log(`[1b] DDG-Discovery mit ${queries.length} Queries...`);
  const slugs = new Set<string>();
  let done = 0;
  for (const q of queries) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    const html = await fetchText(url);
    done++;
    if (!html) {
      console.warn(`  ! query "${q}": unreachable`);
    } else {
      let hits = 0;
      for (const m of html.matchAll(SLUG_LINK_RE)) {
        const slug = m[1].toLowerCase();
        if (isValidSlug(slug) && !slugs.has(slug)) {
          slugs.add(slug);
          hits++;
        }
      }
      if (done % 5 === 0 || done === queries.length) {
        console.log(`  · ${done}/${queries.length} (+${hits}, gesamt ${slugs.size})`);
      }
    }
    // Politeness — DDG is tolerant but not unlimited
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 600));
  }
  return [...slugs];
}

async function discoverSlugs(cities: string[]): Promise<string[]> {
  console.log(`[1/3] URL-Discovery aus ${cities.length} Stadt-Seiten...`);
  const slugs = new Set<string>();
  const failed: string[] = [];
  let done = 0;
  for (const city of cities) {
    const html = await fetchText(`${BASE}/${city}`);
    done++;
    if (!html) {
      failed.push(city);
      console.warn(`  ! ${city}: unreachable`);
    } else {
      let cityHits = 0;
      for (const m of html.matchAll(SLUG_LINK_RE)) {
        const slug = m[1].toLowerCase();
        if (isValidSlug(slug) && !slugs.has(slug)) {
          slugs.add(slug);
          cityHits++;
        }
      }
      if (done % 10 === 0 || done === cities.length) {
        console.log(`  · ${done}/${cities.length} (${city}: +${cityHits}, gesamt ${slugs.size})`);
      }
    }
    // Politeness jitter — verhindert das Rate-Limit-Cliff am Ende der Liste
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
  }
  // Retry failed cities once with longer backoff
  if (failed.length > 0) {
    console.log(`  · Retry ${failed.length} fehlgeschlagene Städte...`);
    for (const city of failed) {
      await new Promise((r) => setTimeout(r, 2000 + Math.random() * 1000));
      const html = await fetchText(`${BASE}/${city}`);
      if (!html) {
        console.warn(`  ! ${city}: weiterhin unreachable`);
        continue;
      }
      let cityHits = 0;
      for (const m of html.matchAll(SLUG_LINK_RE)) {
        const slug = m[1].toLowerCase();
        if (isValidSlug(slug) && !slugs.has(slug)) {
          slugs.add(slug);
          cityHits++;
        }
      }
      console.log(`  · retry ${city}: +${cityHits} (gesamt ${slugs.size})`);
    }
  }
  return [...slugs];
}

type Advisor = {
  slug: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  street: string;
  zip: string;
  city: string;
  teamSize: number;
  teamMembers: string;
  url: string;
};

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractJsonLd(html: string): Record<string, unknown> | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    try {
      const parsed = JSON.parse(m[1]);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const c of candidates) {
        if (!c || typeof c !== "object") continue;
        const obj = c as Record<string, unknown>;
        const type = String(obj["@type"] ?? "");
        if (/InsuranceAgency|LocalBusiness|Organization/i.test(type)) {
          return obj;
        }
      }
    } catch {
      // skip invalid
    }
  }
  return null;
}

function extractMailto(html: string): string {
  const m = html.match(/href=["']mailto:([^"'?]+)/i);
  return m ? m[1].trim().toLowerCase() : "";
}

function extractTel(html: string): string {
  const m = html.match(/href=["']tel:([^"']+)/i);
  if (!m) return "";
  return m[1].replace(/[^\d+]/g, "");
}

// Extract advisor role/title. Patterns:
//   "AXA Hauptvertretung", "AXA Generalvertretung", "AXA Versicherungsbüro"
//   Or from page title / h1.
const ROLE_KEYWORDS = [
  "Hauptvertretung",
  "Generalvertretung",
  "Geschäftsstelle",
  "Versicherungsbüro",
  "Versicherungsbevollmächtigter",
  "Bevollmächtigter",
];

function extractRole(html: string, text: string): string {
  for (const k of ROLE_KEYWORDS) {
    if (text.includes(k)) return `AXA ${k}`;
  }
  return "";
}

// Extract address from JSON-LD or HTML address tags
function extractAddress(jsonLd: Record<string, unknown> | null, text: string): {
  street: string; zip: string; city: string;
} {
  if (jsonLd) {
    const addr = jsonLd["address"] as Record<string, unknown> | undefined;
    if (addr) {
      return {
        street: String(addr.streetAddress ?? "").trim(),
        zip: String(addr.postalCode ?? "").trim(),
        city: String(addr.addressLocality ?? "").trim(),
      };
    }
  }
  // Fallback: regex on text
  const m = text.match(/([A-ZÄÖÜ][\wäöüß.\- ]{2,40}\s+\d+[a-zA-Z]?)\s*,?\s*(\d{5})\s+([A-ZÄÖÜ][a-zäöüß.\- ]{1,30})/);
  if (m) return { street: m[1].trim(), zip: m[2], city: m[3].trim() };
  return { street: "", zip: "", city: "" };
}

function extractLeadName(html: string, jsonLd: Record<string, unknown> | null, slug: string): string {
  // 1) JSON-LD name (often "AXA <Name>")
  if (jsonLd && typeof jsonLd.name === "string") {
    const n = jsonLd.name.replace(/^AXA\s+/i, "").trim();
    if (n.length >= 2 && n.length <= 80) return n;
  }
  // 2) <title>
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (t) {
    // e.g. "AXA in Berlin | Team Stefan Bille Friedrichshagen und Mitte"
    const m = t[1].match(/Team\s+([A-ZÄÖÜ][\wäöüß-]+(?:\s+[A-ZÄÖÜ][\wäöüß-]+){1,3})/);
    if (m) return m[1].trim();
  }
  // 3) Fallback: derive from slug
  return slug
    .split("_")
    .map((p) =>
      p
        .split("-")
        .map((q) => q.charAt(0).toUpperCase() + q.slice(1))
        .join("-"),
    )
    .join(" ");
}

function deriveEmail(slug: string): string {
  // Slug "stefan_bille" → "stefan.bille@axa.de"
  return `${slug.replace(/_/g, ".")}@axa.de`;
}

// Count team members on the "Filialen und Team" page.
// Strategy: find each <div class="multiContactBox..."> and grab the inner
// <img alt="..."> as the member's name. Dedupe by name across Filialen.
function extractTeam(teamHtml: string): { size: number; members: string[] } {
  const names = new Set<string>();
  const re = /<div[^>]+class="[^"]*multiContactBox[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]+class="[^"]*multiContactBox|<\/section|<\/main|$)/gi;
  for (const m of teamHtml.matchAll(re)) {
    const cardHtml = m[1];
    const altMatch = cardHtml.match(/<img[^>]*\salt="([^"]+)"/i);
    if (altMatch) {
      const name = altMatch[1].trim();
      // Must look like a person name (caps + space + caps)
      if (/^[A-ZÄÖÜ][\wäöüß\-']+(?:\s+[A-ZÄÖÜ][\wäöüß\-']+){1,3}$/.test(name)) {
        names.add(name);
      }
    }
  }
  return { size: names.size, members: [...names] };
}

async function fetchAdvisor(slug: string): Promise<Advisor | null> {
  const mainUrl = `${BASE}/${slug}/`;
  const mainHtml = await fetchText(mainUrl);
  if (!mainHtml) return null;

  const text = stripHtml(mainHtml);
  const jsonLd = extractJsonLd(mainHtml);
  const name = extractLeadName(mainHtml, jsonLd, slug);
  const email = extractMailto(mainHtml) || deriveEmail(slug);
  const phone = extractTel(mainHtml);
  const role = extractRole(mainHtml, text);
  const address = extractAddress(jsonLd, text);

  const teamUrl = `${BASE}/${slug}/ueber-uns/filialen-und-team`;
  const teamHtml = await fetchText(teamUrl);
  let team = { size: 0, members: [] as string[] };
  if (teamHtml) team = extractTeam(teamHtml);

  return {
    slug,
    name,
    email,
    phone,
    role,
    street: address.street,
    zip: address.zip,
    city: address.city,
    teamSize: team.size,
    teamMembers: team.members.join("; "),
    url: mainUrl,
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
    "name", "role", "email", "phone", "street", "zip", "city",
    "teamSize", "teamMembers", "slug", "url",
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
  console.log(
    `AXA-Scraper · concurrency=${args.concurrency} · cities=${args.cities.length}` +
      (args.max ? ` · max=${args.max}` : "") +
      (args.include ? ` · include="${args.include}"` : ""),
  );

  let slugs: string[];
  if (args.include) {
    slugs = [args.include];
    console.log(`  Skip discovery — direkt: ${slugs.join(", ")}`);
  } else {
    const all = new Set<string>();
    if (args.source === "cities" || args.source === "both") {
      const fromCities = await discoverSlugs(args.cities);
      fromCities.forEach((s) => all.add(s));
      console.log(`  · Aus Städten: ${fromCities.length} (Total ${all.size})`);
    }
    if (args.source === "ddg" || args.source === "both") {
      const fromDdg = await discoverViaDuckDuckGo(args.ddgQueries ?? DEFAULT_DDG_QUERIES);
      const beforeMerge = all.size;
      fromDdg.forEach((s) => all.add(s));
      console.log(`  · Aus DDG: ${fromDdg.length} (davon neu: ${all.size - beforeMerge}, Total ${all.size})`);
    }
    slugs = [...all];
    console.log(`  ✓ ${slugs.length} eindeutige Berater-Slugs`);
  }

  if (args.max > 0 && slugs.length > args.max) {
    slugs = slugs.slice(0, args.max);
    console.log(`  Nach --max: ${slugs.length}`);
  }

  console.log(`\n[2/3] Lade ${slugs.length} Berater (concurrency=${args.concurrency})...`);
  const startedAt = Date.now();
  const advisors = await inBatches(
    slugs,
    args.concurrency,
    fetchAdvisor,
    (done, total) => {
      if (done % 25 === 0 || done === total) {
        const elapsed = (Date.now() - startedAt) / 1000;
        const rate = done / Math.max(elapsed, 0.1);
        const eta = (total - done) / Math.max(rate, 0.1);
        console.log(`  · ${done}/${total} (${rate.toFixed(1)}/s · ETA ${Math.round(eta)}s)`);
      }
    },
  );

  const valid = advisors.filter((a): a is Advisor => a !== null);
  console.log(`  ✓ Geladen: ${valid.length}`);

  // Sort by team size desc, then name
  valid.sort((a, b) => (b.teamSize - a.teamSize) || a.name.localeCompare(b.name, "de"));

  console.log(`\n[3/3] Schreibe ${OUTPUT_PATH}...`);
  await writeCsv(OUTPUT_PATH, valid);
  console.log(`  ✓ ${valid.length} Zeilen`);

  // Stats
  const withEmail = valid.filter((a) => a.email).length;
  const withPhone = valid.filter((a) => a.phone).length;
  const withAddr = valid.filter((a) => a.zip).length;
  const withTeam = valid.filter((a) => a.teamSize > 0).length;
  const teamBuckets = new Map<string, number>();
  for (const a of valid) {
    const k = a.teamSize === 0 ? "0" : a.teamSize <= 2 ? "1-2" : a.teamSize <= 5 ? "3-5" : a.teamSize <= 10 ? "6-10" : "11+";
    teamBuckets.set(k, (teamBuckets.get(k) ?? 0) + 1);
  }
  const byRole = new Map<string, number>();
  for (const a of valid) {
    const k = a.role || "unbekannt";
    byRole.set(k, (byRole.get(k) ?? 0) + 1);
  }
  console.log(`\nSummary: ${valid.length} Berater · ${withEmail} Email · ${withPhone} Phone · ${withAddr} Adresse · ${withTeam} mit Team`);
  console.log(`Team-Größen: ${[...teamBuckets.entries()].sort().map(([k, n]) => `${k}=${n}`).join(" · ")}`);
  console.log(`Rollen: ${[...byRole.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(" · ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
