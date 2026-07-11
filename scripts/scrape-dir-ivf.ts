/**
 * Scraper: Deutsches IVF-Register (DIR) — Mitgliedszentren.
 *
 * Quelle: https://www.deutsches-ivf-register.de/mitgliedszentren.php?page=1..11
 * ~141 IVF/Kinderwunsch-Zentren mit vollständigen Kontaktdaten aus dem
 * offiziellen Fachverband-Verzeichnis.
 *
 * HTML nutzt hCard-Microformats: <div class="vcard"> mit Sub-Elementen
 * .org, .fn, .street-adress (sic!), .postal-code, .locality, .tel,
 * .note.fax, .email, .url.
 *
 * Output: data/kinderwunschzentren-dir.csv
 *
 * Run: npm run scrape:dir-ivf
 */

import { writeFile, mkdir } from "node:fs/promises";

const BASE = "https://www.deutsches-ivf-register.de/mitgliedszentren.php";
const OUTPUT = "data/kinderwunschzentren-dir.csv";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TOTAL_PAGES = 11;

type Center = {
  name: string;
  standortHinweis: string; // aus <small>
  aerzte: string;
  strasse: string;
  plz: string;
  ort: string;
  telefon: string;
  fax: string;
  email: string;
  website: string;
  sourcePage: string;
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&auml;/gi, "ä")
    .replace(/&ouml;/gi, "ö")
    .replace(/&uuml;/gi, "ü")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function firstMatch(html: string, re: RegExp): string {
  const m = html.match(re);
  return m ? stripTags(m[1]) : "";
}

async function fetchPage(page: number): Promise<string | null> {
  const url = `${BASE}?page=${page}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "de-DE,de;q=0.9" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      if (attempt === 2) return null;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return null;
}

function parsePage(html: string, page: number): Center[] {
  const centers: Center[] = [];
  // Split am vcard-Anfang; erster Chunk ist Pre-Content
  const chunks = html.split(/<div\s+class="vcard">/);
  chunks.shift();
  for (const raw of chunks) {
    // Wir nehmen nur den Chunk bis zum nächsten vcard/Ende (ist per split schon so)
    const chunk = raw;

    // Name aus <div class="org"><div>NAME</div><small>SMALL</small></div>
    const orgMatch = chunk.match(/<div\s+class="org">([\s\S]*?)<\/div>\s*<\/div>/);
    let name = "";
    let standort = "";
    if (orgMatch) {
      const inner = orgMatch[1];
      const nameMatch = inner.match(/<div>([\s\S]*?)<\/div>/);
      const smallMatch = inner.match(/<small>([\s\S]*?)<\/small>/);
      if (nameMatch) name = stripTags(nameMatch[1]);
      if (smallMatch) standort = stripTags(smallMatch[1]);
    }
    if (!name) continue;

    // Ärzte
    const aerzte = firstMatch(chunk, /<div\s+class="fn">([\s\S]*?)<\/div>/);

    // Adresse
    const strasse = firstMatch(chunk, /<div\s+class="street-adress">([\s\S]*?)<\/div>/);
    const plz = firstMatch(chunk, /<span\s+class="postal-code">([\s\S]*?)<\/span>/);
    const ort = firstMatch(chunk, /<span\s+class="locality">([\s\S]*?)<\/span>/);

    // Telefon + Fax
    const telefon = firstMatch(chunk, /<div\s+class="tel">([\s\S]*?)<\/div>/);
    const fax = firstMatch(chunk, /<div\s+class="note\s+fax">([\s\S]*?)<\/div>/);

    // Email + Website: über <a href=...>
    const emailMatch = chunk.match(/<div\s+class="email">\s*<a\s+href="mailto:([^"]+)"/);
    const email = emailMatch ? emailMatch[1].trim().toLowerCase() : "";
    const urlMatch = chunk.match(/<div\s+class="url">\s*<a\s+href="([^"]+)"/);
    const website = urlMatch ? urlMatch[1].trim() : "";

    centers.push({
      name,
      standortHinweis: standort,
      aerzte,
      strasse,
      plz,
      ort,
      telefon,
      fax,
      email,
      website,
      sourcePage: String(page),
    });
  }
  return centers;
}

function escapeCsv(v: string): string {
  if (v.includes('"') || v.includes(",") || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

async function writeCsv(path: string, rows: Center[]): Promise<void> {
  const headers: (keyof Center)[] = [
    "name",
    "standortHinweis",
    "aerzte",
    "strasse",
    "plz",
    "ort",
    "telefon",
    "fax",
    "email",
    "website",
    "sourcePage",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => escapeCsv(String(r[h] ?? ""))).join(","));
  }
  await mkdir("data", { recursive: true });
  await writeFile(path, lines.join("\n") + "\n", "utf8");
}

async function main() {
  console.log(`DIR-IVF-Scraper · ${TOTAL_PAGES} Seiten`);
  const all: Center[] = [];
  for (let p = 1; p <= TOTAL_PAGES; p++) {
    const html = await fetchPage(p);
    if (!html) {
      console.warn(`  ! Seite ${p}: unreachable`);
      continue;
    }
    const centers = parsePage(html, p);
    all.push(...centers);
    console.log(`  · Seite ${p}: +${centers.length} (Total ${all.length})`);
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 300));
  }

  // Dedupe by name (case-insensitive)
  const seen = new Set<string>();
  const dedup: Center[] = [];
  for (const c of all) {
    const key = c.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(c);
  }

  // Sortiere nach ort, dann name
  dedup.sort((a, b) => a.ort.localeCompare(b.ort, "de") || a.name.localeCompare(b.name, "de"));

  await writeCsv(OUTPUT, dedup);
  const withEmail = dedup.filter((c) => c.email).length;
  const withTel = dedup.filter((c) => c.telefon).length;
  const withWeb = dedup.filter((c) => c.website).length;
  console.log(`\nSummary: ${dedup.length} Zentren · ${withEmail} Email · ${withTel} Telefon · ${withWeb} Website`);
  console.log(`  → ${OUTPUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
