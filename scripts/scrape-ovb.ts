/**
 * OVB Finanzberater Scraper.
 *
 * Pipeline:
 *   1. Sitemap-Index → "pages"-Sub-Sitemaps → filter /finanzberater/<slug>.html
 *   2. Pro Profil: native fetch + HTML-Parsing
 *      - Name aus Slug (Stadt-Prefix entfernen) + verifizieren via h1/Title
 *      - Lead-Email = die @ovb.de-Adresse die zum Namen passt
 *      - Weitere @ovb.de-Adressen auf der Seite = Team-Members
 *      - Phone/Mobile aus tel:-Links, klassifiziert per Vorwahl
 *      - Adresse aus Text (Street + ZIP + City)
 *      - Role aus Heading-Text (Regionaldirektor / Bezirksleiter / Finanzberater)
 *   3. CSV nach data/ovb-advisors.csv, sortiert nach Team-Größe + Senior-Titel
 *
 * Run:
 *   npm run scrape:ovb
 *   npm run scrape:ovb -- --include=berlin-detlef-lehmann
 */

import { writeFile, mkdir } from "node:fs/promises";

const BASE = "https://www.ovb.de";
const SITEMAP = `${BASE}/sitemap.xml`;
const OUTPUT_PATH = "data/ovb-advisors.csv";
const EMAIL_DOMAIN = "ovb.de";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Role hierarchy (most senior first). OVB nutzt vor allem:
// Direktor > Regionaldirektor > Direktionsleiter > Bezirksleiter > Berater
const ROLE_HIERARCHY = [
  "Hauptdirektor",
  "Direktor",
  "Regionaldirektor",
  "Direktionsleiter",
  "Direktion",
  "Bezirksdirektor",
  "Bezirksleiter",
  "Senior Sales Manager",
  "Sales Manager",
  "Senior Finanzberater",
  "Finanzberater",
  "Vermögensberater",
  "Berater",
];

// Generic OVB email accounts that are NOT individual advisors
const GENERIC_EMAIL_LOCAL_PARTS = new Set([
  "dsb", "info", "support", "kontakt", "datenschutz", "presse", "marketing",
  "hr", "karriere", "jobs", "ausbildung", "service", "webmaster", "admin",
  "noreply", "no-reply", "post", "office",
]);

type Args = {
  max: number;
  concurrency: number;
  include: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { max: 0, concurrency: 6, include: null };
  for (const raw of argv.slice(2)) {
    const [k, v] = raw.includes("=") ? raw.split("=", 2) : [raw, "true"];
    switch (k) {
      case "--max":
        args.max = parseInt(v, 10);
        break;
      case "--concurrency":
        args.concurrency = parseInt(v, 10);
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

async function fetchText(url: string, retries = 3): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "de-DE,de;q=0.9",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        if (res.status === 404 || res.status === 410) return null;
        if (res.status === 429 || res.status >= 500) {
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1) + Math.random() * 500));
            continue;
          }
        }
        return null;
      }
      return await res.text();
    } catch {
      if (attempt === retries) return null;
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1) + Math.random() * 300));
    }
  }
  return null;
}

function decodeHtml(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}

// Recursive sitemap walk: index → sub-sitemaps → URL sets → filter /finanzberater/.
async function collectAdvisorUrls(): Promise<string[]> {
  console.log(`[1/3] Sitemap-Walk...`);
  const xml = await fetchText(SITEMAP);
  if (!xml) throw new Error("Sitemap-Index nicht erreichbar");
  const seedUrls = [...xml.matchAll(/<loc>([^<]+sitemap=pages[^<]*)<\/loc>/g)].map((m) => decodeHtml(m[1]));

  const queue = [...seedUrls];
  const visited = new Set<string>();
  const profiles = new Set<string>();
  const PROFILE_RE = /\/finanzberater\/[a-z0-9][a-z0-9\-]+\.html$/i;

  while (queue.length > 0) {
    const u = queue.shift()!;
    if (visited.has(u)) continue;
    visited.add(u);
    const x = await fetchText(u);
    if (!x) continue;
    const isIndex = /<sitemapindex/.test(x);
    const locs = [...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeHtml(m[1]));
    if (isIndex) {
      locs.forEach((l) => queue.push(l));
    } else {
      for (const l of locs) {
        if (PROFILE_RE.test(l)) profiles.add(l);
      }
    }
  }
  console.log(`  ✓ ${profiles.size} Finanzberater-URLs`);
  return [...profiles];
}

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

type SlugParsed = {
  city: string;
  isDirektion: boolean;
  firstName: string;
  lastName: string;
};

function parseSlug(slug: string): SlugParsed {
  // berlin-detlef-lehmann → city=berlin, fn=detlef, ln=lehmann
  // wuppertal-direktion-stefan-niesen → city=wuppertal, direktion, fn=stefan, ln=niesen
  // bad-segeberg-martin-bickert → city=bad-segeberg, fn=martin, ln=bickert
  const parts = slug.split("-");
  // City = alle Parts bis zum ersten Vornamen-Kandidaten. Schwierig — wir nehmen
  // an: die LETZTEN 2 Parts = Vorname und Nachname (außer "direktion" als Marker)
  let isDirektion = false;
  let working = [...parts];
  const direktionIdx = working.indexOf("direktion");
  if (direktionIdx >= 0) {
    isDirektion = true;
    working.splice(direktionIdx, 1);
  }
  if (working.length < 2) return { city: "", isDirektion, firstName: "", lastName: working[0] || "" };
  const lastName = working[working.length - 1];
  const firstName = working[working.length - 2];
  const city = working.slice(0, -2).join("-");
  return {
    city: city.replace(/-/g, " "),
    isDirektion,
    firstName,
    lastName,
  };
}

function cap(s: string): string {
  return s.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("-");
}

function isPlausibleAdvisorEmail(email: string): boolean {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (!local) return false;
  if (GENERIC_EMAIL_LOCAL_PARTS.has(local)) return false;
  // Pattern check: should contain a dot or be at least 4+ chars
  return local.length >= 3;
}

function emailMatchesPerson(email: string, fn: string, ln: string): boolean {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  const lnLow = ln.toLowerCase();
  const fnLow = fn.toLowerCase();
  // Patterns: "vorname.nachname", "v.nachname", "vornachname", "nachname.vorname"
  if (lnLow && local.includes(lnLow)) return true;
  if (fnLow && local.includes(fnLow)) return true;
  // Initial pattern: "d.lehmann" matches "detlef lehmann"
  if (lnLow && fnLow && local.startsWith(fnLow[0] + ".") && local.endsWith(lnLow)) return true;
  return false;
}

function classifyPhone(num: string): "mobile" | "phone" {
  const digits = num.replace(/[^0-9]/g, "").replace(/^49/, "0");
  return /^01[5-7]\d/.test(digits) ? "mobile" : "phone";
}

// tel:-Links können Leerzeichen in der Nummer haben (z.B. "tel:+49 30 92372012")
function extractTelLinks(html: string): string[] {
  const nums = new Set<string>();
  for (const m of html.matchAll(/href=["']tel:([^"']+)/gi)) {
    const cleaned = m[1].replace(/[^\d+]/g, "");
    if (cleaned.length >= 8) nums.add(cleaned);
  }
  return [...nums];
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

function buildRoleRegex(role: string): RegExp {
  return new RegExp(`\\b${role.replace(/\s+/g, "\\s+")}(?:in)?\\b`, "i");
}

function extractRole(text: string, html: string): string {
  // First try direct hierarchy matches
  for (const role of ROLE_HIERARCHY) {
    const m = text.match(buildRoleRegex(role));
    if (m) return m[0];
  }
  // Fallback: scan headings
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const t = stripHtml(h1[1]);
    for (const role of ROLE_HIERARCHY) {
      const m = t.match(buildRoleRegex(role));
      if (m) return m[0];
    }
  }
  return "";
}

type Advisor = {
  url: string;
  slug: string;
  name: string;
  firstName: string;
  lastName: string;
  city: string;
  role: string;
  email: string;
  phone: string;
  mobile: string;
  street: string;
  zip: string;
  addressCity: string;
  teamSize: number;
  teamMembers: string;
};

async function fetchProfile(url: string): Promise<Advisor | null> {
  const html = await fetchText(url);
  if (!html) return null;
  const m = url.match(/\/finanzberater\/([a-z0-9][a-z0-9\-]+)\.html$/i);
  if (!m) return null;
  const slug = m[1].toLowerCase();
  const { city, isDirektion, firstName: fnRaw, lastName: lnRaw } = parseSlug(slug);
  const firstName = cap(fnRaw);
  const lastName = cap(lnRaw);
  const name = `${firstName} ${lastName}`.trim();

  // All @ovb.de emails on page
  const allEmails = new Set<string>();
  for (const em of html.matchAll(/\b([a-zäöüß0-9.\-_]+@ovb\.de)/gi)) {
    allEmails.add(em[1].toLowerCase());
  }
  const realEmails = [...allEmails].filter(isPlausibleAdvisorEmail);
  // Lead-email: matches firstName/lastName
  const leadEmail =
    realEmails.find((e) => emailMatchesPerson(e, fnRaw, lnRaw)) ?? realEmails[0] ?? "";

  // Phones: tel-links, klassifiziert
  let phone = "";
  let mobile = "";
  const tels = extractTelLinks(html);
  for (const t of tels) {
    if (classifyPhone(t) === "mobile") {
      if (!mobile) mobile = t;
    } else if (!phone) phone = t;
    if (phone && mobile) break;
  }

  const text = stripHtml(html);
  const addr = extractAddress(text);
  let role = extractRole(text, html);
  if (!role && isDirektion) role = "Direktion";

  return {
    url,
    slug,
    name,
    firstName,
    lastName,
    city,
    role,
    email: leadEmail,
    phone,
    mobile,
    street: addr.street,
    zip: addr.zip,
    addressCity: addr.city,
    teamSize: realEmails.length,
    teamMembers: realEmails.join("; "),
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

function roleRank(role: string): number {
  for (let i = 0; i < ROLE_HIERARCHY.length; i++) {
    if (role.toLowerCase().includes(ROLE_HIERARCHY[i].toLowerCase())) return i;
  }
  return 999;
}

async function writeCsv(path: string, rows: Advisor[]): Promise<void> {
  const headers: (keyof Advisor)[] = [
    "name", "firstName", "lastName", "role", "email", "phone", "mobile",
    "street", "zip", "addressCity", "city",
    "teamSize", "teamMembers",
    "slug", "url",
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
    `OVB-Scraper · concurrency=${args.concurrency}` +
      (args.max ? ` · max=${args.max}` : "") +
      (args.include ? ` · include="${args.include}"` : ""),
  );

  let urls: string[] = [];
  if (args.include) {
    urls = [`${BASE}/finanzberater/${args.include}.html`];
    console.log(`  Skip Sitemap — direkt: ${urls.join(", ")}`);
  } else {
    urls = await collectAdvisorUrls();
  }

  if (args.max > 0 && urls.length > args.max) {
    urls = urls.slice(0, args.max);
    console.log(`  Nach --max: ${urls.length}`);
  }

  console.log(`\n[2/3] Lade ${urls.length} Profilseiten (concurrency=${args.concurrency})...`);
  const startedAt = Date.now();
  const advisors = await inBatches(urls, args.concurrency, fetchProfile, (done, total) => {
    if (done % 25 === 0 || done === total) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = done / Math.max(elapsed, 0.1);
      const eta = (total - done) / Math.max(rate, 0.1);
      console.log(`  · ${done}/${total} (${rate.toFixed(1)}/s · ETA ${Math.round(eta)}s)`);
    }
  });

  const valid = advisors.filter((a): a is Advisor => a !== null);

  // Sort: team desc, then role rank, then name
  valid.sort((a, b) =>
    b.teamSize - a.teamSize ||
    roleRank(a.role) - roleRank(b.role) ||
    a.lastName.localeCompare(b.lastName, "de"),
  );

  console.log(`\n[3/3] Schreibe ${OUTPUT_PATH}...`);
  await writeCsv(OUTPUT_PATH, valid);
  console.log(`  ✓ ${valid.length} Zeilen`);

  // Stats
  const withEmail = valid.filter((a) => a.email).length;
  const withPhone = valid.filter((a) => a.phone || a.mobile).length;
  const withAddr = valid.filter((a) => a.zip).length;
  const teamBuckets = new Map<string, number>();
  for (const a of valid) {
    const k = a.teamSize === 0 ? "0" : a.teamSize === 1 ? "1" : a.teamSize === 2 ? "2" : a.teamSize <= 5 ? "3-5" : a.teamSize <= 10 ? "6-10" : "11+";
    teamBuckets.set(k, (teamBuckets.get(k) ?? 0) + 1);
  }
  const byRole = new Map<string, number>();
  for (const a of valid) {
    const k = a.role || "unbekannt";
    byRole.set(k, (byRole.get(k) ?? 0) + 1);
  }
  console.log(`\nSummary: ${valid.length} · ${withEmail} mit Email · ${withPhone} mit Phone · ${withAddr} mit Adresse`);
  console.log(`Team-Größen: ${[...teamBuckets.entries()].sort().map(([k, n]) => `${k}=${n}`).join(" · ")}`);
  console.log(`Rollen: ${[...byRole.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}=${n}`).join(" · ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
