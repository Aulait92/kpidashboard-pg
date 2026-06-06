/**
 * HUK-COBURG (HUK Vor Ort) Berater Scraper.
 *
 * Pipeline:
 *   1. sitemapcontent.xml → Profile-URLs (~2500)
 *   2. Pro Profil: HTML laden, JSON-LD InsuranceAgency-Schema parsen
 *      → Name, Adresse, Tel, Geo. Email aus mailto/regex (hukvm.de).
 *   3. CSV nach data/huk-advisors.csv
 *
 * Run:
 *   npm run scrape:huk
 */

import { writeFile, mkdir } from "node:fs/promises";

const BASE = "https://www.huk-vor-ort.de";
const SITEMAP = `${BASE}/sitemapcontent.xml`;
const OUTPUT_PATH = "data/huk-advisors.csv";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const PROFILE_URL_RE = /^https:\/\/www\.huk-vor-ort\.de\/[a-z][a-z\-]+\.[a-z][a-z\-]+$/i;

type Args = {
  concurrency: number;
  max: number;
  include: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { concurrency: 8, max: 0, include: null };
  for (const raw of argv.slice(2)) {
    const [k, v] = raw.includes("=") ? raw.split("=", 2) : [raw, "true"];
    switch (k) {
      case "--concurrency":
        args.concurrency = parseInt(v, 10);
        break;
      case "--max":
        args.max = parseInt(v, 10);
        break;
      case "--include":
        args.include = v.toLowerCase();
        break;
      default:
        console.warn(`Unknown arg: ${k}`);
    }
  }
  return args;
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

type JsonLd = {
  "@type"?: string | string[];
  name?: string;
  telephone?: string;
  description?: string;
  email?: string;
  address?: {
    streetAddress?: string;
    postalCode?: string;
    addressLocality?: string;
  };
  geo?: {
    latitude?: number;
    longitude?: number;
  };
};

function extractInsuranceAgencyLd(html: string): JsonLd | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const obj = item as JsonLd;
      const type = obj["@type"];
      const typeStr = Array.isArray(type) ? type.join(",") : String(type ?? "");
      if (/InsuranceAgency|LocalBusiness|Organization/i.test(typeStr)) {
        return obj;
      }
    }
  }
  return null;
}

type Advisor = {
  url: string;
  slug: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street: string;
  zip: string;
  city: string;
  lat: string;
  lon: string;
};

async function fetchProfile(url: string): Promise<Advisor | null> {
  const html = await fetchText(url);
  if (!html) return null;
  const m = url.match(/\/([a-zäöüß][a-zäöüß\-]*\.[a-zäöüß][a-zäöüß\-]*)$/i);
  if (!m) return null;
  const slug = m[1].toLowerCase();

  const ld = extractInsuranceAgencyLd(html);
  if (!ld) return null;

  const name = (ld.name || "").trim();
  const tokens = name.split(/\s+/).filter(Boolean);
  const firstName = tokens.slice(0, -1).join(" ");
  const lastName = tokens[tokens.length - 1] || "";

  // Email aus mailto-Link oder Plaintext (Domain hukvm.de)
  let email = "";
  const mailto = html.match(/href=["']mailto:([^"'?]+@[a-z0-9.\-]+\.[a-z]{2,})/i);
  if (mailto) email = mailto[1].toLowerCase();
  else if (ld.email) email = ld.email.toLowerCase();
  else {
    const em = html.match(/\b([a-zäöüß0-9.\-_]+@hukvm\.de)/i);
    if (em) email = em[1].toLowerCase();
  }

  return {
    url,
    slug,
    name,
    firstName,
    lastName,
    email,
    phone: (ld.telephone || "").trim(),
    street: ld.address?.streetAddress || "",
    zip: ld.address?.postalCode || "",
    city: ld.address?.addressLocality || "",
    lat: ld.geo?.latitude != null ? String(ld.geo.latitude) : "",
    lon: ld.geo?.longitude != null ? String(ld.geo.longitude) : "",
  };
}

async function collectAdvisorUrls(): Promise<string[]> {
  console.log(`[1/3] Lade Sitemap...`);
  const xml = await fetchText(SITEMAP);
  if (!xml) throw new Error("Sitemap nicht erreichbar");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  const profiles = locs.filter((u) => PROFILE_URL_RE.test(u));
  console.log(`  ✓ ${locs.length} URLs · ${profiles.length} Profile`);
  return [...new Set(profiles)];
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
    "name", "firstName", "lastName", "email", "phone",
    "street", "zip", "city", "lat", "lon", "slug", "url",
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
  console.log(`HUK-Scraper · concurrency=${args.concurrency}` + (args.max ? ` · max=${args.max}` : ""));

  let urls: string[];
  if (args.include) {
    urls = [`${BASE}/${args.include}`];
    console.log(`  Skip Sitemap — direkt: ${urls.join(", ")}`);
  } else {
    urls = await collectAdvisorUrls();
  }

  if (args.max > 0 && urls.length > args.max) {
    urls = urls.slice(0, args.max);
    console.log(`  Nach --max: ${urls.length}`);
  }

  console.log(`\n[2/3] Lade ${urls.length} Profile (concurrency=${args.concurrency})...`);
  const startedAt = Date.now();
  const advisors = await inBatches(urls, args.concurrency, fetchProfile, (done, total) => {
    if (done % 100 === 0 || done === total) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = done / Math.max(elapsed, 0.1);
      const eta = (total - done) / Math.max(rate, 0.1);
      console.log(`  · ${done}/${total} (${rate.toFixed(1)}/s · ETA ${Math.round(eta)}s)`);
    }
  });

  const valid = advisors.filter((a): a is Advisor => a !== null);
  valid.sort((a, b) => a.city.localeCompare(b.city) || a.lastName.localeCompare(b.lastName, "de"));

  console.log(`\n[3/3] Schreibe ${OUTPUT_PATH}...`);
  await writeCsv(OUTPUT_PATH, valid);
  console.log(`  ✓ ${valid.length} Zeilen`);

  const withEmail = valid.filter((a) => a.email).length;
  const withPhone = valid.filter((a) => a.phone).length;
  const withAddr = valid.filter((a) => a.zip).length;
  console.log(`\nSummary: ${valid.length} Berater · ${withEmail} mit Email · ${withPhone} mit Phone · ${withAddr} mit Adresse`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
