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
  "Direktor",
  "Repräsentanzleiter",
  "Senior Sales Consultant",
  "Sales Consultant",
  "Senior Sales Manager",
  "Sales Manager",
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

// Address: tecis lists addresses like "Musterstr. 12, 12345 Musterstadt"
const STREET_REGEX =
  /([A-ZÄÖÜ][\wäöüÄÖÜß.\- ]{1,60}?(?:str\.?|straße|strasse|weg|platz|allee|ring|gasse|damm|chaussee|ufer|markt|hof|park)\s+\d+[a-zA-Z]?)\s*[,·\/]?\s*(\d{5})\s+([A-ZÄÖÜ][a-zäöüÄÖÜß.\- ]{1,40}?)(?=\s+(?:Telefon|Tel\.|Mobil|Handy|E-Mail|Email|Fax|Routenplaner|Anfahrt|Öffnungszeiten|vCard|·|$|<))/i;
const STREET_FALLBACK =
  /([A-ZÄÖÜ][\wäöüÄÖÜß.\- ]{2,60}?\s+\d+[a-zA-Z]?)\s*[,·\/]\s*(\d{5})\s+([A-ZÄÖÜ][a-zäöüÄÖÜß.\- ]{2,30})/;

function extractAddress(text: string): { street: string; zip: string; city: string } {
  let m = text.match(STREET_REGEX);
  if (!m) m = text.match(STREET_FALLBACK);
  if (!m) return { street: "", zip: "", city: "" };
  let street = m[1].trim();
  const zip = m[2];
  let city = m[3].trim();
  city = city.split(/\s+(?:Telefon|Tel\.|Mobil|Handy|E-Mail|Email|Fax|Routenplaner|Anfahrt|Öffnungszeiten|vCard)/i)[0].trim();
  return { street, zip, city };
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
function extractRole(html: string, text: string, name: string): string {
  const firstName = name.split(/\s+/)[0]?.toLowerCase() ?? "";

  // 1) <title> pipe-segments
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    const parts = titleMatch[1].split(/\s*\|\s*/);
    for (const p of parts) {
      const cleaned = p.trim();
      if (!cleaned) continue;
      const lower = cleaned.toLowerCase();
      if (lower.includes("tecis")) continue;
      if (firstName && lower.includes(firstName)) continue;
      // Plausible role: capitalized start, reasonable length
      if (/^[A-ZÄÖÜ]/.test(cleaned) && cleaned.length >= 4 && cleaned.length <= 80) {
        return cleaned;
      }
    }
  }
  // 2) og:description / meta description sometimes contains the role
  const desc = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i);
  if (desc) {
    for (const role of ROLE_HIERARCHY) {
      const re = new RegExp(`\\b${role.replace(/\s+/g, "\\s+")}\\b`, "i");
      const m = desc[1].match(re);
      if (m) return m[0];
    }
  }
  // 3) Keyword scan over visible text — known hierarchy first
  for (const role of ROLE_HIERARCHY) {
    const re = new RegExp(`\\b${role.replace(/\s+/g, "\\s+")}\\b`, "i");
    const m = text.match(re);
    if (m) return m[0];
  }
  return "";
}

function extractName(html: string, slug: string): { name: string; firstName: string; lastName: string } {
  // <title> usually has "Vorname Nachname | Role | tecis"
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    const first = titleMatch[1].split(/\s*\|\s*/)[0].trim();
    // Should be "Vorname Nachname"
    if (/^[A-ZÄÖÜ][\wäöüß-]+(?:\s+[A-ZÄÖÜ][\wäöüß-]+){0,3}$/.test(first)) {
      const parts = first.split(/\s+/);
      return {
        name: first,
        firstName: parts.slice(0, parts.length - 1).join(" "),
        lastName: parts[parts.length - 1],
      };
    }
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
