/**
 * tecis-Berater Scraper.
 *
 * Pipeline:
 *   1. sitemap-berater.xml laden → alle Berater-Profil-URLs (/vorname-nachname.html)
 *   2. Für jede Profilseite: Name, Titel/Rolle, E-Mail (aus mailto:), Telefon,
 *      Mobil, Adresse extrahieren.
 *   3. CSV nach data/tecis-advisors.csv
 *      Sortierung: bekannte Senior-Titel zuerst (Repräsentanzleiter →
 *      Senior Sales Consultant → Sales Manager → unbekannt)
 *
 * Run:
 *   npm run scrape:tecis
 *   npm run scrape:tecis -- --max=100 --concurrency=4
 *   npm run scrape:tecis -- --include=meyer
 */

import { writeFile, mkdir } from "node:fs/promises";

const SITEMAP_URL = "https://www.tecis.de/sitemap-berater.xml";
const OUTPUT_PATH = "data/tecis-advisors.csv";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Profile root URLs only — exclude /<slug>/sub/page.html
const PROFILE_URL_REGEX = /^https:\/\/www\.tecis\.de\/[a-zäöüß0-9][a-zäöüß0-9-]*-[a-zäöüß0-9][a-zäöüß0-9-]*\.html$/i;

// Known role hierarchy (most senior first). Used for sort order; unknowns sink.
const ROLE_HIERARCHY = [
  "Divisional Manager",
  "Branch Manager",
  "Direktor",
  "Repräsentanzleiter",
  "Senior Sales Manager",
  "Senior Sales Consultant",
  "Sales Manager",
  "Sales Consultant",
  "Junior Sales Consultant",
  "Berater",
];

type Args = {
  max: number;
  concurrency: number;
  include: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    max: 0,
    concurrency: 4,
    include: null,
  };
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
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "de-DE,de;q=0.9" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        if (res.status === 404) return null;
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

function extractUrlsFromXml(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<]+?)\s*<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1]);
  }
  return out;
}

async function collectAdvisorUrls(): Promise<string[]> {
  console.log(`[1/3] Lade Sitemap...`);
  const xml = await fetchText(SITEMAP_URL);
  if (!xml) throw new Error("Sitemap nicht erreichbar");
  const all = extractUrlsFromXml(xml);
  const profileUrls = all.filter((u) => PROFILE_URL_REGEX.test(u));
  console.log(`  → ${all.length} Sitemap-URLs, davon ${profileUrls.length} Profile`);
  return [...new Set(profileUrls)];
}

type Advisor = {
  url: string;
  slug: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  emailDerived: string; // for sanity check
  role: string;
  city: string;
  phone: string;
  mobile: string;
  street: string;
  zip: string;
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

// slug "aaron-haendel" → email local "aaron.haendel"
// slug "david-christof-franz" → email local "david-christof.franz" (last hyphen → dot)
function deriveEmailFromSlug(slug: string): { firstName: string; lastName: string; email: string } {
  const lastDash = slug.lastIndexOf("-");
  if (lastDash < 0) return { firstName: slug, lastName: "", email: `${slug}@tecis.de` };
  const firstPart = slug.slice(0, lastDash);
  const lastPart = slug.slice(lastDash + 1);
  const cap = (s: string) =>
    s
      .split("-")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("-");
  return {
    firstName: cap(firstPart),
    lastName: cap(lastPart),
    email: `${firstPart}.${lastPart}@tecis.de`,
  };
}

const PHONE_REGEX = /(?:Telefon|Tel\.?|Festnetz)[^0-9+]{0,30}((?:\+49|0)[\d\s\-/()]{6,25})/i;
const MOBILE_REGEX = /(?:Mobil|Handy)[^0-9+]{0,30}((?:\+49|0)[\d\s\-/()]{6,25})/i;

// Catch any DE phone in the text. Used as fallback when neither label appears.
const ANY_PHONE_REGEX = /(?:\+49|0)[\s\-/()]*\d[\d\s\-/()]{6,22}\d/g;

function classifyPhone(num: string): "mobile" | "phone" {
  const digits = num.replace(/[^0-9]/g, "").replace(/^49/, "0");
  // German mobile prefixes
  if (/^01[5-7]\d/.test(digits)) return "mobile";
  return "phone";
}

// Address: street is a SINGLE token (no spaces) ending in a street-type
// suffix, followed by Hausnummer, then ZIP + city.
// Matches "Ostring 6", "Marie-Curie-Str. 5", "Hauptstraße 12" — but NOT
// "Aaron Händel Ostring 6" (space inside disallowed).
const STREET_SUFFIX = "(?:str\\.?|straße|strasse|weg|platz|allee|ring|gasse|damm|chaussee|ufer|markt|hof|park|berg|tal|feld|brücke|stiege|stieg|zeile|reihe)";
const STREET_REGEX = new RegExp(
  `([A-ZÄÖÜ][\\wäöüÄÖÜß.\\-]*${STREET_SUFFIX}\\s+\\d+[a-zA-Z]?)\\s*[,·\\/]?\\s+(\\d{5})\\s+([A-ZÄÖÜ][a-zäöüÄÖÜß.\\-]{1,40})(?=\\s|$|<)`,
  "i",
);
// Fallback for short street names without a recognized suffix (e.g. "Anger 61",
// "Markt 12"). Single capitalized word + house number, followed by ZIP + city.
// \b ensures we anchor on word boundary, so longer prefixes like
// "Aaron Händel Anger 61" still extract only "Anger 61".
const STREET_FALLBACK = /\b([A-ZÄÖÜ][\wäöüÄÖÜß.\-]+\s+\d+[a-zA-Z]?)\s*[,·\/]?\s+(\d{5})\s+([A-ZÄÖÜ][a-zäöüÄÖÜß.\-]{1,40})\b/;

// Page-template strings that must NOT be treated as advisor name or role.
const PAGE_LABEL_BLACKLIST = [
  "kontaktübersicht",
  "kontakt",
  "impressum",
  "wissenswertes",
  "interview",
  "über mich",
  "über tecis",
  "datenschutz",
  "agb",
  "karriere",
  "ratgeber",
  "podcast",
  "startseite",
  "finanzberatung",
];

function isPageLabel(s: string): boolean {
  const lower = s.toLowerCase().trim();
  return PAGE_LABEL_BLACKLIST.some((b) => lower === b || lower.startsWith(b + " "));
}

function extractAddress(text: string): { street: string; zip: string; city: string } {
  let m = text.match(STREET_REGEX);
  if (!m) m = text.match(STREET_FALLBACK);
  if (!m) return { street: "", zip: "", city: "" };
  return { street: m[1].trim(), zip: m[2], city: m[3].trim() };
}

function extractMailto(html: string, expectDomain: string): string {
  const re = /href="mailto:([^"]+@[^"]+)"/gi;
  let bestForDomain = "";
  let firstAny = "";
  for (const m of html.matchAll(re)) {
    const email = m[1].split("?")[0].trim().toLowerCase();
    if (!firstAny) firstAny = email;
    if (email.endsWith("@" + expectDomain) && !bestForDomain) bestForDomain = email;
  }
  return bestForDomain || firstAny;
}

// Title/role extraction. tecis uses the pattern "<name> | <role>" in <title>
// and prominent heading. Any non-name, non-"tecis" pipe-segment is the role.
// Examples seen: "Repräsentanzleiter", "Senior Sales Consultant", "Sales
// Manager", "Spezialist für betriebliche Altersversorgung".
// Allow feminine "-in" suffix on roles ending in -er / -ater / -ant / -ist
function buildRoleRegex(role: string): RegExp {
  const pattern = role.replace(/\s+/g, "\\s+") + "(?:in)?";
  return new RegExp(`\\b${pattern}\\b`, "i");
}

// A segment is only accepted as a role if it contains at least one of these
// job-title keywords. Catches Senior/Sales/General etc. via substrings on the
// stems, and rejects single first/last names.
const ROLE_KEYWORD_RE = /(?:Manager|Consultant|Direktor|Berater|Spezialist|Spezialistin|Fachmann|Fachfrau|Experte|Expertin|Leiter|Leiterin|Coach|Analyst|Repräsentant)/i;

function extractRole(html: string, text: string, name: string): string {
  const firstName = name.split(/\s+/)[0]?.toLowerCase() ?? "";
  const lastName = name.split(/\s+/).slice(-1)[0]?.toLowerCase() ?? "";

  const tryPart = (cleaned: string): string | null => {
    if (!cleaned) return null;
    if (isPageLabel(cleaned)) return null;
    const lower = cleaned.toLowerCase();
    if (lower.includes("tecis")) return null;
    if (firstName && lower.includes(firstName)) return null;
    if (lastName && lower.includes(lastName)) return null;
    if (/\b(?:in|für|aus)\s+[A-ZÄÖÜ]/.test(cleaned)) return null;
    if (/\bFinanzberatung\b/i.test(cleaned)) return null;
    if (cleaned.length < 4 || cleaned.length > 60) return null;
    if (!/^[A-ZÄÖÜ]/.test(cleaned)) return null;
    if (!ROLE_KEYWORD_RE.test(cleaned)) return null;
    return cleaned;
  };

  // 1) <title> pipe/dash-segments
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    for (const p of titleMatch[1].split(TITLE_SEPARATOR_RE)) {
      const r = tryPart(p.trim());
      if (r) return r;
    }
  }
  // 2) <h1>
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const h1Text = stripHtml(h1Match[1]);
    for (const p of h1Text.split(TITLE_SEPARATOR_RE)) {
      const r = tryPart(p.trim());
      if (r) return r;
    }
  }
  // 3) meta description / og:description
  const desc = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i);
  if (desc) {
    for (const role of ROLE_HIERARCHY) {
      const m = desc[1].match(buildRoleRegex(role));
      if (m) return m[0];
    }
  }
  // 4) Keyword scan over visible text
  for (const role of ROLE_HIERARCHY) {
    const m = text.match(buildRoleRegex(role));
    if (m) return m[0];
  }
  return "";
}

// Split title/heading on any pipe, slash, or dash-like character (Unicode Pd class).
const TITLE_SEPARATOR_RE = /\s*(?:[|\/]|\p{Pd})\s*/u;
const NAME_PATTERN = /^[A-ZÄÖÜ][\wäöüÄÖÜß\-]+(?:\s+[A-ZÄÖÜ][\wäöüÄÖÜß\-]+){1,3}$/;

function pickNameFromCandidates(candidates: string[]): {
  name: string;
  firstName: string;
  lastName: string;
} | null {
  for (const raw of candidates) {
    const s = raw.trim();
    if (!s) continue;
    if (isPageLabel(s)) continue;
    if (s.toLowerCase().includes("tecis")) continue;
    if (NAME_PATTERN.test(s)) {
      const tokens = s.split(/\s+/);
      return {
        name: s,
        firstName: tokens.slice(0, tokens.length - 1).join(" "),
        lastName: tokens[tokens.length - 1],
      };
    }
  }
  return null;
}

function extractName(html: string, slug: string): { name: string; firstName: string; lastName: string } {
  // Source 1: <title> — split on any separator (pipe, hyphen, en-dash, em-dash, slash)
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    const parts = titleMatch[1].split(TITLE_SEPARATOR_RE);
    const picked = pickNameFromCandidates(parts);
    if (picked) return picked;
  }

  // Source 2: og:title meta tag
  const og = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
  if (og) {
    const parts = og[1].split(TITLE_SEPARATOR_RE);
    const picked = pickNameFromCandidates(parts);
    if (picked) return picked;
  }

  // Source 3: first <h1>
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const text = stripHtml(h1[1]);
    const picked = pickNameFromCandidates([text, ...text.split(TITLE_SEPARATOR_RE)]);
    if (picked) return picked;
  }

  // Fallback: derive from slug
  const d = deriveEmailFromSlug(slug);
  return {
    name: `${d.firstName.replace(/-/g, " ")} ${d.lastName}`.trim(),
    firstName: d.firstName.replace(/-/g, " "),
    lastName: d.lastName,
  };
}

function extractCity(html: string, fallback: string): string {
  // Pattern: "in Mannheim und Umgebung" / "in <City> und Umgebung"
  const m = html.match(/\bin\s+([A-ZÄÖÜ][a-zäöüÄÖÜß\-\s]{2,30}?)\s+und\s+Umgebung/);
  if (m) return m[1].trim();
  return fallback;
}

async function fetchProfile(url: string): Promise<Advisor | null> {
  const html = await fetchText(url);
  if (!html) return null;
  const m = url.match(/\/([a-zäöüß0-9][a-zäöüß0-9-]+)\.html$/i);
  if (!m) return null;
  const slug = m[1].toLowerCase();
  const derived = deriveEmailFromSlug(slug);

  const { name, firstName, lastName } = extractName(html, slug);
  const emailMain = extractMailto(html, "tecis.de");

  const text = stripHtml(html);
  let role = extractRole(html, text, name);
  let phoneMatch = text.match(PHONE_REGEX);
  let mobileMatch = text.match(MOBILE_REGEX);
  let address = extractAddress(text);
  let city = address.city || extractCity(html, "");

  // Kontaktübersicht has the real address + phone + sometimes a Fachgebiet role
  const contactUrl = url.replace(/\.html$/, "/kontaktuebersicht.html");
  const contactHtml = await fetchText(contactUrl);
  let emailFromContact = "";
  let contactName: { name: string; firstName: string; lastName: string } | null = null;
  if (contactHtml) {
    emailFromContact = extractMailto(contactHtml, "tecis.de");
    const ctext = stripHtml(contactHtml);
    if (!phoneMatch) phoneMatch = ctext.match(PHONE_REGEX);
    if (!mobileMatch) mobileMatch = ctext.match(MOBILE_REGEX);
    if (!address.zip) {
      address = extractAddress(ctext);
      if (address.city) city = address.city;
    }
    if (!role) role = extractRole(contactHtml, ctext, name);
    // Use contact-page name if it has umlauts that slug couldn't preserve
    contactName = extractName(contactHtml, slug);
  }

  const email = emailMain || emailFromContact || derived.email;
  // Prefer name from contact page if it contains umlauts and main name didn't
  const finalName =
    contactName && /[äöüÄÖÜß]/.test(contactName.name) && !/[äöüÄÖÜß]/.test(name)
      ? contactName
      : { name, firstName, lastName };

  let phone = phoneMatch ? phoneMatch[1].replace(/\s+/g, " ").trim() : "";
  let mobile = mobileMatch ? mobileMatch[1].replace(/\s+/g, " ").trim() : "";

  // Last-resort fallback: any DE number in the contact page text. Classify by prefix.
  if ((!phone && !mobile) && contactHtml) {
    const ctext = stripHtml(contactHtml);
    const seen = new Set<string>();
    for (const m of ctext.matchAll(ANY_PHONE_REGEX)) {
      const num = m[0].trim();
      if (seen.has(num)) continue;
      seen.add(num);
      if (classifyPhone(num) === "mobile") {
        if (!mobile) mobile = num;
      } else if (!phone) {
        phone = num;
      }
      if (phone && mobile) break;
    }
  }

  return {
    url,
    slug,
    name: finalName.name,
    firstName: finalName.firstName,
    lastName: finalName.lastName,
    email,
    emailDerived: derived.email,
    role,
    city,
    phone,
    mobile,
    street: address.street,
    zip: address.zip,
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

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function roleRank(role: string): number {
  for (let i = 0; i < ROLE_HIERARCHY.length; i++) {
    if (role.toLowerCase().includes(ROLE_HIERARCHY[i].toLowerCase())) return i;
  }
  return 999;
}

async function writeCsv(path: string, advisors: Advisor[]): Promise<void> {
  const headers: (keyof Advisor)[] = [
    "name",
    "firstName",
    "lastName",
    "role",
    "email",
    "emailDerived",
    "phone",
    "mobile",
    "street",
    "zip",
    "city",
    "url",
  ];
  const lines = [headers.join(",")];
  for (const a of advisors) {
    lines.push(headers.map((h) => escapeCsv(String(a[h] ?? ""))).join(","));
  }
  await mkdir("data", { recursive: true });
  await writeFile(path, lines.join("\n") + "\n", "utf8");
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(
    `tecis-Scraper · concurrency=${args.concurrency}` +
      (args.max ? ` · max=${args.max}` : "") +
      (args.include ? ` · include="${args.include}"` : ""),
  );

  let urls = await collectAdvisorUrls();
  console.log(`  Total advisor URLs: ${urls.length}`);

  if (args.include) {
    const needle = args.include;
    urls = urls.filter((u) => u.toLowerCase().includes(needle));
    console.log(`  Nach --include: ${urls.length}`);
  }
  if (args.max > 0 && urls.length > args.max) {
    urls = urls.slice(0, args.max);
    console.log(`  Nach --max: ${urls.length}`);
  }

  console.log(`\n[2/3] Lade ${urls.length} Profilseiten (concurrency=${args.concurrency})...`);
  const startedAt = Date.now();
  const profiles = await inBatches(
    urls,
    args.concurrency,
    fetchProfile,
    (done, total) => {
      if (done % 50 === 0 || done === total) {
        const elapsed = (Date.now() - startedAt) / 1000;
        const rate = done / Math.max(elapsed, 0.1);
        const eta = (total - done) / Math.max(rate, 0.1);
        console.log(`  · ${done}/${total} (${rate.toFixed(1)}/s · ETA ${Math.round(eta)}s)`);
      }
    },
  );

  const valid = profiles.filter((p): p is Advisor => p !== null);
  console.log(`  ✓ Geladen: ${valid.length}`);

  // Sort by role hierarchy (senior first), then by name
  valid.sort((a, b) => {
    const r = roleRank(a.role) - roleRank(b.role);
    if (r !== 0) return r;
    return a.lastName.localeCompare(b.lastName, "de");
  });

  console.log(`\n[3/3] Schreibe ${OUTPUT_PATH}...`);
  await writeCsv(OUTPUT_PATH, valid);
  console.log(`  ✓ ${valid.length} Zeilen geschrieben`);

  // Stats
  const withEmail = valid.filter((p) => p.email).length;
  const withPhone = valid.filter((p) => p.phone || p.mobile).length;
  const withAddress = valid.filter((p) => p.zip).length;
  const emailMatchDerived = valid.filter((p) => p.email === p.emailDerived).length;
  const byRole = new Map<string, number>();
  for (const p of valid) {
    const k = p.role || "unbekannt";
    byRole.set(k, (byRole.get(k) ?? 0) + 1);
  }
  console.log(
    `\nSummary: ${valid.length} Berater · ${withEmail} mit Email · ${withPhone} mit Telefon · ${withAddress} mit Adresse`,
  );
  console.log(`E-Mail aus HTML stimmt mit Slug-Ableitung: ${emailMatchDerived}/${valid.length}`);
  console.log(
    `Rollen-Verteilung: ${[...byRole.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(" · ")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
