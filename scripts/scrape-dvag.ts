/**
 * DVAG-Berater Scraper.
 *
 * Pipeline:
 *   1. Sitemap-Index laden → 27 Sub-Sitemaps (sitemap_vb_de_<a-z|9>.xml)
 *   2. Sub-Sitemaps parallel parsen → alle Berater-Profil-URLs
 *   3. Für jede Profilseite: "X-köpfiges Team" + Adresse + Telefon extrahieren
 *      E-Mail wird aus der URL (vorname.nachname → Vorname.Nachname@dvag.de) abgeleitet.
 *   4. Filter teamSize ≥ MIN_TEAM_SIZE (default 5)
 *   5. CSV nach data/dvag-team-leads.csv
 *
 * Run:
 *   npm run scrape:dvag
 *   npm run scrape:dvag -- --min-team-size=5 --max=2000 --concurrency=8
 */

import { writeFile, mkdir } from "node:fs/promises";

const SITEMAP_INDEX = "https://www.dvag.de/content/dvag-ug/tenants/dvag/sitemap-index.xml";
const OUTPUT_PATH = "data/dvag-team-leads.csv";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type Args = {
  minTeamSize: number;
  max: number;
  concurrency: number;
  sample: number; // 0 = no sampling, >0 = only crawl every Nth profile (e.g. 10 = 10%)
  letters: string | null; // e.g. "a,b,c" — only process these letter-sitemaps
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    minTeamSize: 5,
    max: 0,
    concurrency: 8,
    sample: 0,
    letters: null,
  };
  for (const raw of argv.slice(2)) {
    const [k, v] = raw.includes("=") ? raw.split("=", 2) : [raw, "true"];
    switch (k) {
      case "--min-team-size":
        args.minTeamSize = parseInt(v, 10);
        break;
      case "--max":
        args.max = parseInt(v, 10);
        break;
      case "--concurrency":
        args.concurrency = parseInt(v, 10);
        break;
      case "--sample":
        args.sample = parseInt(v, 10);
        break;
      case "--letters":
        args.letters = v.toLowerCase();
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
        if (res.status === 404) return null; // permanent
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.text();
    } catch (err) {
      if (attempt === retries) {
        return null;
      }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return null;
}

function extractUrlsFromXml(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1]);
  }
  return out;
}

async function collectAdvisorUrls(letters: string | null): Promise<string[]> {
  console.log(`[1/4] Lade Sitemap-Index...`);
  const indexXml = await fetchText(SITEMAP_INDEX);
  if (!indexXml) throw new Error("Sitemap-Index nicht erreichbar");
  let subSitemaps = extractUrlsFromXml(indexXml).filter((u) => u.includes("sitemap_vb_de_"));

  if (letters) {
    const set = new Set(letters.split(",").map((s) => s.trim().toLowerCase()));
    subSitemaps = subSitemaps.filter((u) => {
      const m = u.match(/sitemap_vb_de_([a-z0-9])\.xml/);
      return m ? set.has(m[1]) : false;
    });
  }

  console.log(`  → ${subSitemaps.length} Sub-Sitemaps`);

  const allUrls = new Set<string>();
  let loaded = 0;
  await Promise.all(
    subSitemaps.map(async (url) => {
      const xml = await fetchText(url);
      loaded++;
      if (!xml) {
        console.warn(`  ! ${url} unreachable`);
        return;
      }
      for (const u of extractUrlsFromXml(xml)) {
        // Profile URLs look like https://www.dvag.de/vorname.nachname/index.html
        // Exclude sub-pages like ueber-uns.html, kontakt.html etc. for now.
        if (/\/[a-zäöüß0-9-]+\.[a-zäöüß0-9-]+\/index\.html?$/i.test(u)) {
          allUrls.add(u);
        }
      }
      if (loaded % 5 === 0 || loaded === subSitemaps.length) {
        console.log(`  · ${loaded}/${subSitemaps.length} Sub-Sitemaps, kumuliert ${allUrls.size} URLs`);
      }
    }),
  );

  return [...allUrls];
}

type AdvisorProfile = {
  url: string;
  slug: string;
  firstName: string;
  lastName: string;
  email: string;
  name: string;
  teamSize: number | null;
  phone: string | null;
  mobile: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
};

// Examples to match: "5-köpfiges Team", "12 köpfiges Team", "5- köpfiges Team",
// "Team von 5 Personen", "5-köpfigen Team", various dash codepoints.
const TEAM_SIZE_PATTERNS = [
  /(\d{1,3})\s*[-‑–—]?\s*köpfige[mnrs]?\s+Team/i,
  /Team\s+(?:aus|von|mit)\s+(\d{1,3})\s+(?:Personen|Mitarbeiter|Mitarbeitenden|Köpfen|Köpfe|Berater)/i,
  /(\d{1,3})\s+(?:Mitarbeiter|Mitarbeitende|Berater|Kolleg)\s+(?:stark|im\s+Team|an\s+Bord)/i,
];

function parseTeamSize(html: string): number | null {
  for (const re of TEAM_SIZE_PATTERNS) {
    const m = html.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 2 && n < 500) return n;
    }
  }
  return null;
}

const PHONE_REGEX = /(?:Telefon|Tel\.?|Festnetz|Geschäftlich)[^0-9+]{0,30}((?:\+49|0)[\d\s\-/()]{6,25})/i;
const MOBILE_REGEX = /(?:Mobil|Handy)[^0-9+]{0,30}((?:\+49|0)[\d\s\-/()]{6,25})/i;

// Street: a token that ends with "str." / "straße" / "weg" / "platz" / "allee" / "ring" + Hausnummer.
// City: terminated by a sensible delimiter, NOT just any whitespace (otherwise we swallow trailing
// page chrome like "Telefon Mobil E-Mail").
const STREET_REGEX =
  /([A-ZÄÖÜ][\wäöüÄÖÜß.\- ]{1,60}?(?:str\.?|straße|strasse|weg|platz|allee|ring|gasse|damm|chaussee|ufer|markt|hof)\s+\d+[a-zA-Z]?)\s*[,·\/]?\s*(\d{5})\s+([A-ZÄÖÜ][a-zäöüÄÖÜß.\- ]{1,40}?)(?=\s+(?:Telefon|Tel\.|Mobil|Handy|E-Mail|Email|Fax|Routenplaner|Anfahrt|Öffnungszeiten|·|$|<))/i;
// Fallback: simpler pattern, less strict
const STREET_FALLBACK =
  /([A-ZÄÖÜ][\wäöüÄÖÜß.\- ]{2,60}?\s+\d+[a-zA-Z]?)\s*[,·\/]\s*(\d{5})\s+([A-ZÄÖÜ][a-zäöüÄÖÜß.\- ]{2,30})/;

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

function deriveEmailFromSlug(slug: string): { firstName: string; lastName: string; email: string; name: string } {
  // slug is e.g. "andrea.brunke" or "hans-peter.mueller-schmidt"
  const [firstRaw, lastRaw] = slug.split(".");
  const cap = (s: string) =>
    s
      .split(/[-]/)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("-");
  const firstName = cap(firstRaw ?? "");
  const lastName = cap(lastRaw ?? "");
  return {
    firstName,
    lastName,
    email: `${firstName}.${lastName}@dvag.de`,
    name: `${firstName} ${lastName}`.trim(),
  };
}

// Extract the displayed advisor name from the HTML. Tries <title>, then <h1>,
// then meta og:title. Strips "Deutsche Vermögensberatung" / DVAG suffixes.
function extractDisplayName(html: string, derivedName: string): string {
  const candidates: string[] = [];
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (title) candidates.push(title[1]);
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) candidates.push(stripHtml(h1[1]));
  const og = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
  if (og) candidates.push(og[1]);

  for (const raw of candidates) {
    let s = raw
      .replace(/&[a-z]+;/gi, " ")
      .replace(/[|–—-]+\s*(Deutsche\s+Vermögensberatung|DVAG)[^|–—-]*$/i, "")
      .replace(/^(Deutsche\s+Vermögensberatung|DVAG)\s*[|–—-]\s*/i, "")
      .replace(/\s*\|\s*Ihr Finanzcoach.*$/i, "")
      .replace(/\s*\|\s*Vermögensberater.*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    // Want pattern "Vorname Nachname" (1-3 capitalized words)
    if (/^[A-ZÄÖÜ][\wäöüß.\-]+(?:\s+[A-ZÄÖÜ][\wäöüß.\-]+){0,3}$/.test(s)) {
      return s;
    }
    // Maybe wrapped like "Andrea Brunke - Ihre Finanzcoach"
    const m = s.match(/^([A-ZÄÖÜ][\wäöüß.\-]+(?:\s+[A-ZÄÖÜ][\wäöüß.\-]+){0,3})\b/);
    if (m) return m[1];
  }
  return derivedName;
}

function extractAddress(text: string): { street: string | null; zip: string | null; city: string | null } {
  // Drop the "Deutsche Vermögensberatung" prefix that DVAG places before the street
  const cleaned = text.replace(/Deutsche\s+Vermögensberatung\s+/gi, " ");

  let m = cleaned.match(STREET_REGEX);
  if (!m) m = cleaned.match(STREET_FALLBACK);
  if (!m) return { street: null, zip: null, city: null };

  let street = m[1].trim();
  const zip = m[2];
  let city = m[3].trim();

  // Belt-and-suspenders: chop city at the first occurrence of any chrome word
  city = city.split(/\s+(?:Telefon|Tel\.|Mobil|Handy|E-Mail|Email|Fax|Routenplaner|Anfahrt|Öffnungszeiten)/i)[0].trim();

  return { street, zip, city };
}

async function fetchProfile(url: string): Promise<AdvisorProfile | null> {
  const html = await fetchText(url);
  if (!html) return null;
  const m = url.match(/\/([a-zäöüß0-9-]+\.[a-zäöüß0-9-]+)\/index\.html?$/i);
  if (!m) return null;
  const slug = m[1].toLowerCase();
  const derived = deriveEmailFromSlug(slug);
  const displayName = extractDisplayName(html, derived.name);

  const text = stripHtml(html);
  // Parse on stripped text so HTML wrappers between digit and dash don't break the regex.
  const teamSize = parseTeamSize(text);
  const phoneMatch = text.match(PHONE_REGEX);
  const mobileMatch = text.match(MOBILE_REGEX);
  const address = extractAddress(text);

  return {
    url,
    slug,
    firstName: derived.firstName,
    lastName: derived.lastName,
    name: displayName,
    email: derived.email,
    teamSize,
    phone: phoneMatch ? phoneMatch[1].replace(/\s+/g, " ").trim() : null,
    mobile: mobileMatch ? mobileMatch[1].replace(/\s+/g, " ").trim() : null,
    street: address.street,
    zip: address.zip,
    city: address.city,
  };
}

async function inBatches<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
      done++;
      onProgress?.(done, items.length);
    }
  });
  await Promise.all(workers);
  return results;
}

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function writeCsv(path: string, profiles: AdvisorProfile[]): Promise<void> {
  const headers = [
    "name",
    "firstName",
    "lastName",
    "email",
    "phone",
    "mobile",
    "street",
    "zip",
    "city",
    "teamSize",
    "url",
  ];
  const lines = [headers.join(",")];
  for (const p of profiles) {
    lines.push(
      headers
        .map((h) => {
          const v = (p as unknown as Record<string, unknown>)[h];
          return escapeCsv(v == null ? "" : String(v));
        })
        .join(","),
    );
  }
  await mkdir("data", { recursive: true });
  await writeFile(path, lines.join("\n") + "\n", "utf8");
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(
    `DVAG-Scraper · min-team-size=${args.minTeamSize} · concurrency=${args.concurrency}` +
      (args.max ? ` · max=${args.max}` : "") +
      (args.sample ? ` · sample=1/${args.sample}` : "") +
      (args.letters ? ` · letters=${args.letters}` : ""),
  );

  let urls = await collectAdvisorUrls(args.letters);
  console.log(`  Total advisor URLs: ${urls.length}`);

  if (args.sample > 1) {
    urls = urls.filter((_, i) => i % args.sample === 0);
    console.log(`  Nach Sampling (jeder ${args.sample}.): ${urls.length}`);
  }
  if (args.max > 0 && urls.length > args.max) {
    urls = urls.slice(0, args.max);
    console.log(`  Nach Cap (--max=${args.max}): ${urls.length}`);
  }

  console.log(`\n[2/4] Lade ${urls.length} Profilseiten (concurrency=${args.concurrency})...`);
  const startedAt = Date.now();
  const profiles = await inBatches(
    urls,
    args.concurrency,
    async (url) => fetchProfile(url),
    (done, total) => {
      if (done % 50 === 0 || done === total) {
        const elapsed = (Date.now() - startedAt) / 1000;
        const rate = done / Math.max(elapsed, 0.1);
        const eta = (total - done) / Math.max(rate, 0.1);
        console.log(
          `  · ${done}/${total} (${rate.toFixed(1)}/s · ETA ${Math.round(eta)}s)`,
        );
      }
    },
  );

  const valid = profiles.filter((p): p is AdvisorProfile => p !== null);
  const withTeam = valid.filter((p) => p.teamSize !== null);
  console.log(
    `  ✓ Geladen: ${valid.length} · mit Team-Erwähnung: ${withTeam.length}`,
  );

  console.log(`\n[3/4] Filtere teamSize ≥ ${args.minTeamSize}...`);
  const filtered = valid.filter((p) => p.teamSize !== null && p.teamSize >= args.minTeamSize);
  console.log(`  Passed: ${filtered.length}`);

  console.log(`\n[4/4] Schreibe ${OUTPUT_PATH}...`);
  // Sort by team size desc for convenience
  filtered.sort((a, b) => (b.teamSize ?? 0) - (a.teamSize ?? 0));
  await writeCsv(OUTPUT_PATH, filtered);
  console.log(`  ✓ ${filtered.length} Zeilen geschrieben`);

  // Summary
  const withPhone = filtered.filter((p) => p.phone || p.mobile).length;
  const withAddress = filtered.filter((p) => p.zip).length;
  const sizeBuckets = new Map<string, number>();
  for (const p of filtered) {
    const s = p.teamSize!;
    const bucket = s <= 5 ? "5" : s <= 10 ? "6-10" : s <= 20 ? "11-20" : s <= 50 ? "21-50" : "51+";
    sizeBuckets.set(bucket, (sizeBuckets.get(bucket) ?? 0) + 1);
  }
  console.log(`\nSummary: ${filtered.length} Berater · ${withPhone} mit Telefon · ${withAddress} mit Adresse`);
  console.log(`Team-Größen: ${[...sizeBuckets.entries()].map(([k, n]) => `${k}=${n}`).join(" · ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
