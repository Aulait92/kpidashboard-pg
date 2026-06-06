/**
 * Swiss Life Select Berater Scraper (via Playwright, weil Cloudflare).
 *
 * Pipeline:
 *   1. sitemap-berater.xml via Playwright laden → ~4500 URL-Einträge
 *   2. Filter auf Profil-Root-URLs (/<vorname-nachname>.html)
 *   3. Pro Berater: Profil-Page + /kontaktuebersicht.html parsen
 *   4. Output CSV nach data/swisslife-advisors.csv, sortiert nach Senior-Titel
 *
 * Run:
 *   npm run scrape:swisslife
 *   npm run scrape:swisslife -- --max=50 --concurrency=4
 *   npm run scrape:swisslife -- --include=jan-olaf-groh
 */

import { writeFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";

const BASE = "https://www.swisslife-select.de";
const SITEMAP = `${BASE}/sitemap-berater.xml`;
const OUTPUT_PATH = "data/swisslife-advisors.csv";
const EMAIL_DOMAIN = "swisslife-select.de";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Senior-Titel-Hierarchie (häufige Swiss-Life-Rollen). Sort: top-first.
const ROLE_HIERARCHY = [
  "Direktor",
  "Regionaldirektor",
  "Bezirksdirektor",
  "Repräsentanzleiter",
  "Senior Finanzberater",
  "Senior Vermögensberater",
  "Senior Sales Consultant",
  "Senior Sales Manager",
  "Finanzberater",
  "Vermögensberater",
  "Sales Consultant",
  "Sales Manager",
  "Berater",
];

// Match a profile root URL: /vorname-nachname.html (no nested subpaths).
const PROFILE_URL_RE = /^https:\/\/www\.swisslife-select\.de\/[a-zäöüß0-9][a-zäöüß0-9-]*-[a-zäöüß0-9][a-zäöüß0-9-]*\.html$/i;

type Args = {
  max: number;
  concurrency: number;
  include: string | null;
  noContact: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { max: 0, concurrency: 4, include: null, noContact: false };
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
      case "--no-contact":
        args.noContact = true;
        break;
      default:
        console.warn(`Unknown arg: ${k}`);
    }
  }
  return args;
}

// Page-template strings that must NOT be treated as advisor name or role.
const PAGE_LABEL_BLACKLIST = [
  "kontaktübersicht", "kontakt", "impressum", "wissenswertes", "interview",
  "über mich", "über uns", "datenschutz", "agb", "karriere", "ratgeber",
  "swiss life select", "swisslife", "swiss life", "startseite", "finanzberatung",
  "kundenbewertungen",
];

function isPageLabel(s: string): boolean {
  const lower = s.toLowerCase().trim();
  return PAGE_LABEL_BLACKLIST.some((b) => lower === b || lower.startsWith(b + " "));
}

const TITLE_SEPARATOR_RE = /\s*(?:[|\/]|\p{Pd})\s*/u;
const NAME_PATTERN = /^[A-ZÄÖÜ][\wäöüÄÖÜß\-]+(?:\s+[A-ZÄÖÜ][\wäöüÄÖÜß\-]+){1,3}$/;

function pickNameFromCandidates(candidates: string[]): {
  name: string; firstName: string; lastName: string;
} | null {
  for (const raw of candidates) {
    const s = raw.trim();
    if (!s || isPageLabel(s)) continue;
    if (s.toLowerCase().includes("swiss life") || s.toLowerCase().includes("swisslife")) continue;
    if (NAME_PATTERN.test(s)) {
      const tokens = s.split(/\s+/);
      return { name: s, firstName: tokens.slice(0, -1).join(" "), lastName: tokens[tokens.length - 1] };
    }
  }
  return null;
}

function extractName(html: string, slug: string): { name: string; firstName: string; lastName: string } {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    const picked = pickNameFromCandidates(titleMatch[1].split(TITLE_SEPARATOR_RE));
    if (picked) return picked;
  }
  const og = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
  if (og) {
    const picked = pickNameFromCandidates(og[1].split(TITLE_SEPARATOR_RE));
    if (picked) return picked;
  }
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const text = stripHtml(h1[1]);
    const picked = pickNameFromCandidates([text, ...text.split(TITLE_SEPARATOR_RE)]);
    if (picked) return picked;
  }
  // Fallback: derive from slug
  const lastDash = slug.lastIndexOf("-");
  const firstRaw = slug.slice(0, lastDash);
  const lastRaw = slug.slice(lastDash + 1);
  const cap = (s: string) => s.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("-");
  return {
    name: `${cap(firstRaw)} ${cap(lastRaw)}`.replace(/-/g, " ").trim(),
    firstName: cap(firstRaw).replace(/-/g, " "),
    lastName: cap(lastRaw),
  };
}

const ROLE_KEYWORD_RE = /(?:Manager|Consultant|Direktor|Berater|Spezialist|Spezialistin|Fachmann|Fachfrau|Experte|Expertin|Leiter|Leiterin|Coach|Analyst|Repräsentant)/i;

function buildRoleRegex(role: string): RegExp {
  return new RegExp(`\\b${role.replace(/\s+/g, "\\s+")}(?:in)?\\b`, "i");
}

function extractRole(html: string, text: string, name: string): string {
  const firstName = name.split(/\s+/)[0]?.toLowerCase() ?? "";
  const lastName = name.split(/\s+/).slice(-1)[0]?.toLowerCase() ?? "";

  const tryPart = (cleaned: string): string | null => {
    if (!cleaned || isPageLabel(cleaned)) return null;
    const lower = cleaned.toLowerCase();
    if (lower.includes("swiss life") || lower.includes("swisslife")) return null;
    if (firstName && lower.includes(firstName)) return null;
    if (lastName && lower.includes(lastName)) return null;
    if (/\b(?:in|für|aus)\s+[A-ZÄÖÜ]/.test(cleaned)) return null;
    if (/\bFinanzberatung\b/i.test(cleaned)) return null;
    if (cleaned.length < 4 || cleaned.length > 60) return null;
    if (!/^[A-ZÄÖÜ]/.test(cleaned)) return null;
    if (!ROLE_KEYWORD_RE.test(cleaned)) return null;
    return cleaned;
  };

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    for (const p of titleMatch[1].split(TITLE_SEPARATOR_RE)) {
      const r = tryPart(p.trim());
      if (r) return r;
    }
  }
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const h1Text = stripHtml(h1Match[1]);
    for (const p of h1Text.split(TITLE_SEPARATOR_RE)) {
      const r = tryPart(p.trim());
      if (r) return r;
    }
  }
  for (const role of ROLE_HIERARCHY) {
    const m = text.match(buildRoleRegex(role));
    if (m) return m[0];
  }
  return "";
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

// Email pattern: slug "jan-olaf-groh" → "jan-olaf.groh@swisslife-select.de"
function deriveEmail(slug: string): string {
  const lastDash = slug.lastIndexOf("-");
  if (lastDash < 0) return `${slug}@${EMAIL_DOMAIN}`;
  return `${slug.slice(0, lastDash)}.${slug.slice(lastDash + 1)}@${EMAIL_DOMAIN}`;
}

function extractMailto(html: string): string {
  const re = new RegExp(`href=["']mailto:([^"'?]+@${EMAIL_DOMAIN.replace(/\./g, "\\.")})`, "i");
  const m = html.match(re);
  if (m) return m[1].trim().toLowerCase();
  const re2 = new RegExp(`\\b([a-zäöüß0-9.\\-_]+@${EMAIL_DOMAIN.replace(/\./g, "\\.")})\\b`, "i");
  const m2 = html.match(re2);
  return m2 ? m2[1].trim().toLowerCase() : "";
}

const PHONE_REGEX = /(?:Telefon|Tel\.?|Festnetz)[^0-9+]{0,30}((?:\+49|0)[\d\s\-/()]{6,25})/i;
const MOBILE_REGEX = /(?:Mobil|Handy)[^0-9+]{0,30}((?:\+49|0)[\d\s\-/()]{6,25})/i;
const ANY_PHONE_REGEX = /(?:\+49|0)[\s\-/()]*\d[\d\s\-/()]{6,22}\d/g;

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

function extractCity(html: string, fallback: string): string {
  const m = html.match(/\bin\s+([A-ZÄÖÜ][a-zäöüÄÖÜß\-\s]{2,30}?)\s+und\s+Umgebung/);
  return m ? m[1].trim() : fallback;
}

type Advisor = {
  url: string;
  slug: string;
  name: string;
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  phone: string;
  mobile: string;
  street: string;
  zip: string;
  city: string;
};

async function loadPage(page: Page, url: string, timeout = 20000): Promise<string | null> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout });
    await page.waitForTimeout(300);
    return await page.content();
  } catch {
    return null;
  }
}

// Extract `tel:` links from HTML. Returns up to 2 distinct numbers classified
// as phone (Festnetz) and mobile (015x/016x/017x prefixes).
function extractTelLinks(html: string): { phone: string; mobile: string } {
  let phone = "";
  let mobile = "";
  const seen = new Set<string>();
  for (const m of html.matchAll(/href=["']tel:([^"'?\s]+)/gi)) {
    const num = m[1].replace(/[^\d+]/g, "");
    if (!num || seen.has(num)) continue;
    seen.add(num);
    if (classifyPhone(num) === "mobile") {
      if (!mobile) mobile = num;
    } else if (!phone) {
      phone = num;
    }
    if (phone && mobile) break;
  }
  return { phone, mobile };
}

async function fetchProfile(page: Page, url: string, fetchContact: boolean): Promise<Advisor | null> {
  const html = await loadPage(page, url);
  if (!html) return null;
  const m = url.match(/\/([a-zäöüß0-9][a-zäöüß0-9-]+)\.html$/i);
  if (!m) return null;
  const slug = m[1].toLowerCase();
  const derived = deriveEmail(slug);

  const { name, firstName, lastName } = extractName(html, slug);
  const emailMain = extractMailto(html) || derived;

  const text = stripHtml(html);
  let role = extractRole(html, text, name);
  // 1) Erst tel:-Links (verlässlichste Quelle bei swisslife)
  let { phone, mobile } = extractTelLinks(html);
  // 2) Fallback: Label-Regex
  if (!phone) {
    const m = text.match(PHONE_REGEX);
    if (m) phone = m[1].replace(/\s+/g, " ").trim();
  }
  if (!mobile) {
    const m = text.match(MOBILE_REGEX);
    if (m) mobile = m[1].replace(/\s+/g, " ").trim();
  }
  let address = extractAddress(text);
  let city = address.city || extractCity(html, "");

  if (fetchContact) {
    const contactUrl = url.replace(/\.html$/, "/kontaktuebersicht.html");
    const contactHtml = await loadPage(page, contactUrl);
    if (contactHtml) {
      const ctext = stripHtml(contactHtml);
      const ctel = extractTelLinks(contactHtml);
      if (!phone) phone = ctel.phone;
      if (!mobile) mobile = ctel.mobile;
      if (!phone) {
        const mm = ctext.match(PHONE_REGEX);
        if (mm) phone = mm[1].replace(/\s+/g, " ").trim();
      }
      if (!mobile) {
        const mm = ctext.match(MOBILE_REGEX);
        if (mm) mobile = mm[1].replace(/\s+/g, " ").trim();
      }
      if (!address.zip) {
        address = extractAddress(ctext);
        if (address.city) city = address.city;
      }
      if (!role) role = extractRole(contactHtml, ctext, name);
    }
  }

  return {
    url, slug,
    name, firstName, lastName,
    email: emailMain,
    role,
    phone, mobile,
    street: address.street, zip: address.zip, city,
  };
}

async function withWorkers<T, R>(
  ctx: BrowserContext,
  n: number,
  items: T[],
  fn: (page: Page, item: T, idx: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const pages = await Promise.all(
    Array.from({ length: n }, async () => {
      const p = await ctx.newPage();
      // Speed: block images/fonts/css/media
      await p.route("**/*", (route) => {
        const t = route.request().resourceType();
        if (["image", "font", "media", "stylesheet"].includes(t)) return route.abort();
        return route.continue();
      });
      return p;
    }),
  );
  const results: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    pages.map(async (page) => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(page, items[i], i);
        done++;
        onProgress?.(done, items.length);
      }
    }),
  );
  await Promise.all(pages.map((p) => p.close()));
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
    "street", "zip", "city", "slug", "url",
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
    `SwissLife-Scraper · concurrency=${args.concurrency}` +
      (args.max ? ` · max=${args.max}` : "") +
      (args.include ? ` · include="${args.include}"` : "") +
      (args.noContact ? " · no-contact" : ""),
  );

  console.log(`\n[1/2] Lade Sitemap...`);
  const browser: Browser = await chromium.launch({ headless: true });
  const ctx: BrowserContext = await browser.newContext({ userAgent: USER_AGENT, locale: "de-DE" });

  let urls: string[] = [];
  if (args.include) {
    urls = [`${BASE}/${args.include}.html`];
    console.log(`  Skip Sitemap — direkt: ${urls.join(", ")}`);
  } else {
    const sitemapPage = await ctx.newPage();
    await sitemapPage.goto(SITEMAP, { waitUntil: "domcontentloaded", timeout: 30000 });
    const xml = await sitemapPage.content();
    await sitemapPage.close();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
    urls = [...new Set(locs.filter((u) => PROFILE_URL_RE.test(u)))];
    console.log(`  ${locs.length} Sitemap-URLs, davon ${urls.length} Profile`);
  }

  if (args.max > 0 && urls.length > args.max) {
    urls = urls.slice(0, args.max);
    console.log(`  Nach --max: ${urls.length}`);
  }

  console.log(`\n[2/2] Lade ${urls.length} Profilseiten (concurrency=${args.concurrency})...`);
  const startedAt = Date.now();
  const advisors = await withWorkers(
    ctx,
    args.concurrency,
    urls,
    (page, url) => fetchProfile(page, url, !args.noContact),
    (done, total) => {
      if (done % 25 === 0 || done === total) {
        const elapsed = (Date.now() - startedAt) / 1000;
        const rate = done / Math.max(elapsed, 0.1);
        const eta = (total - done) / Math.max(rate, 0.1);
        console.log(`  · ${done}/${total} (${rate.toFixed(1)}/s · ETA ${Math.round(eta)}s)`);
      }
    },
  );

  await browser.close();

  const valid = advisors.filter((a): a is Advisor => a !== null);
  valid.sort((a, b) => {
    const r = roleRank(a.role) - roleRank(b.role);
    if (r !== 0) return r;
    return a.lastName.localeCompare(b.lastName, "de");
  });
  await writeCsv(OUTPUT_PATH, valid);
  console.log(`\n  ✓ ${valid.length} Zeilen → ${OUTPUT_PATH}`);

  const withEmail = valid.filter((p) => p.email).length;
  const withPhone = valid.filter((p) => p.phone || p.mobile).length;
  const withAddr = valid.filter((p) => p.zip).length;
  const byRole = new Map<string, number>();
  for (const p of valid) {
    const k = p.role || "unbekannt";
    byRole.set(k, (byRole.get(k) ?? 0) + 1);
  }
  console.log(`\nSummary: ${valid.length} Berater · ${withEmail} Email · ${withPhone} Phone · ${withAddr} Adresse`);
  console.log(
    `Rollen: ${[...byRole.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => `${k}=${n}`).join(" · ")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
