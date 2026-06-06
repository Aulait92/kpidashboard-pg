/**
 * Ergo-Berater Scraper — über die offizielle agencysearch.ergo.com geodistance-API.
 *
 * Pipeline:
 *   1. Lat/Lng-Grid über DE (default 35km Spacing)
 *   2. Pro Stützpunkt geodistance?lat=...&lon=...&range=50km&limit=500
 *   3. Dedupe per `pnr`
 *   4. E-Mail aus firstName/lastName ableiten (vorname.nachname@ergo.de)
 *   5. Optional: Team-Größe via <subdomain>/de/Agentur crawlen (--team)
 *   6. CSV nach data/ergo-advisors.csv
 *
 * Run:
 *   npm run scrape:ergo
 *   npm run scrape:ergo -- --team       # mit Team-Crawl
 *   npm run scrape:ergo -- --spacing=25 # dichteres Grid
 */

import { writeFile, mkdir } from "node:fs/promises";

const API = "https://agencysearch.ergo.com/search/v1/geodistance";
const OUTPUT_PATH = "data/ergo-advisors.csv";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Bounding box Deutschland
const DE_LAT_MIN = 47.27;
const DE_LAT_MAX = 55.06;
const DE_LNG_MIN = 5.87;
const DE_LNG_MAX = 15.04;

type Args = {
  spacing: number;
  range: number; // km
  limit: number;
  concurrency: number;
  fetchTeam: boolean;
  max: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    spacing: 35,
    range: 50,
    limit: 500,
    concurrency: 4,
    fetchTeam: false,
    max: 0,
  };
  for (const raw of argv.slice(2)) {
    const [k, v] = raw.includes("=") ? raw.split("=", 2) : [raw, "true"];
    switch (k) {
      case "--spacing":
        args.spacing = parseInt(v, 10);
        break;
      case "--range":
        args.range = parseInt(v, 10);
        break;
      case "--limit":
        args.limit = parseInt(v, 10);
        break;
      case "--concurrency":
        args.concurrency = parseInt(v, 10);
        break;
      case "--team":
        args.fetchTeam = v !== "false";
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

async function fetchJson(url: string, retries = 3): Promise<unknown | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "*/*",
          "Accept-Language": "de-DE,de;q=0.9",
          Origin: "https://www.ergo.de",
          Referer: "https://www.ergo.de/",
        },
        signal: AbortSignal.timeout(25_000),
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
      return await res.json();
    } catch {
      if (attempt === retries) return null;
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1) + Math.random() * 300));
    }
  }
  return null;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "de-DE,de;q=0.9" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

type ApiAgent = {
  pnr: string;
  firstName?: string;
  lastName?: string;
  academicTitle?: string;
  office?: {
    address?: {
      city?: string;
      phone?: string;
      street?: string;
      postalCode?: string;
      mobile?: string;
      fax?: string | null;
      streetAddition?: string;
      geopoint?: { lat?: number; lon?: number };
    };
    supportedLanguages?: string[];
    distance?: number;
  };
  httpAddress?: string;
  onlinePresence?: {
    whatsappNo?: string;
  };
};

type ApiResponse = {
  available?: number;
  count?: number;
  results?: ApiAgent[];
};

function buildGrid(spacing: number): { lat: number; lon: number }[] {
  const latStep = spacing / 111;
  const points: { lat: number; lon: number }[] = [];
  for (let lat = DE_LAT_MIN; lat <= DE_LAT_MAX; lat += latStep) {
    const lngStep = spacing / (111 * Math.cos((lat * Math.PI) / 180));
    for (let lon = DE_LNG_MIN; lon <= DE_LNG_MAX; lon += lngStep) {
      points.push({ lat, lon });
    }
  }
  return points;
}

async function searchByGeo(lat: number, lon: number, range: number, limit: number): Promise<ApiAgent[]> {
  const url = `${API}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&range=${range}km&limit=${limit}`;
  const j = (await fetchJson(url)) as ApiResponse | null;
  return j?.results ?? [];
}

// Email construction: "Heiner-Ernst Niemann" → "heiner-ernst.niemann@ergo.de"
function deriveEmail(firstName: string, lastName: string): string {
  if (!firstName || !lastName) return "";
  const fn = firstName.toLowerCase().replace(/[^a-zäöüß\-]/g, "");
  const ln = lastName.toLowerCase().replace(/[^a-zäöüß\-]/g, "");
  return `${fn}.${ln}@ergo.de`;
}

type Advisor = {
  pnr: string;
  name: string;
  firstName: string;
  lastName: string;
  academicTitle: string;
  email: string;
  phone: string;
  mobile: string;
  whatsapp: string;
  street: string;
  zip: string;
  city: string;
  subdomain: string;
  url: string;
  languages: string;
  lat: string;
  lon: string;
  teamSize: number;
  teamMembers: string;
};

function toAdvisor(a: ApiAgent): Advisor {
  const fn = (a.firstName || "").trim();
  const ln = (a.lastName || "").trim();
  const title = (a.academicTitle || "").trim();
  const name = [title, fn, ln].filter(Boolean).join(" ");
  const addr = a.office?.address;
  const street = [addr?.street, addr?.streetAddition].filter(Boolean).join(" ").trim();
  const sub = (a.httpAddress || "").toLowerCase();
  return {
    pnr: a.pnr,
    name,
    firstName: fn,
    lastName: ln,
    academicTitle: title,
    email: deriveEmail(fn, ln),
    phone: addr?.phone || "",
    mobile: addr?.mobile || "",
    whatsapp: a.onlinePresence?.whatsappNo || "",
    street,
    zip: addr?.postalCode || "",
    city: addr?.city || "",
    subdomain: sub,
    url: sub ? `https://${sub}/de/Agentur` : "",
    languages: (a.office?.supportedLanguages ?? []).join("; "),
    lat: addr?.geopoint?.lat != null ? String(addr.geopoint.lat) : "",
    lon: addr?.geopoint?.lon != null ? String(addr.geopoint.lon) : "",
    teamSize: 0,
    teamMembers: "",
  };
}

// Team extraction from <subdomain>/de/Agentur.
// Looks for additional mailto:<...@ergo.de> links + photos.
function extractTeam(html: string, leadEmail: string): { size: number; members: string[] } {
  const memberEmails = new Set<string>();
  for (const m of html.matchAll(/mailto:([a-zäöüß0-9.\-_]+@ergo\.de)/gi)) {
    memberEmails.add(m[1].toLowerCase());
  }
  // Add lead if not in (so size >= 1)
  if (leadEmail) memberEmails.add(leadEmail.toLowerCase());
  return { size: memberEmails.size, members: [...memberEmails] };
}

async function inBatches<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<void>,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  let next = 0;
  let done = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i], i);
      done++;
      onProgress?.(done, items.length);
    }
  });
  await Promise.all(workers);
}

function escapeCsv(v: string): string {
  if (v.includes('"') || v.includes(",") || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

async function writeCsv(path: string, rows: Advisor[]): Promise<void> {
  const headers: (keyof Advisor)[] = [
    "name", "firstName", "lastName", "academicTitle",
    "email", "phone", "mobile", "whatsapp",
    "street", "zip", "city",
    "subdomain", "url", "languages", "lat", "lon",
    "teamSize", "teamMembers", "pnr",
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
    `Ergo-Scraper · spacing=${args.spacing}km · range=${args.range}km · limit=${args.limit} · concurrency=${args.concurrency}` +
      (args.fetchTeam ? " · team" : ""),
  );

  const points = buildGrid(args.spacing);
  console.log(`\n[1/3] Grid: ${points.length} Stützpunkte`);

  console.log(`\n[2/3] API-Discovery (concurrency=${args.concurrency})...`);
  const byPnr = new Map<string, ApiAgent>();
  const startedAt = Date.now();
  await inBatches(points, args.concurrency, async (p) => {
    const agents = await searchByGeo(p.lat, p.lon, args.range, args.limit);
    for (const a of agents) {
      if (a.pnr && !byPnr.has(a.pnr)) byPnr.set(a.pnr, a);
    }
  }, (done, total) => {
    if (done % 20 === 0 || done === total) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = done / Math.max(elapsed, 0.1);
      const eta = (total - done) / Math.max(rate, 0.1);
      console.log(`  · ${done}/${total} (${rate.toFixed(1)}/s · ETA ${Math.round(eta)}s · unique: ${byPnr.size})`);
    }
  });

  console.log(`  ✓ ${byPnr.size} unique Berater aus ${points.length} API-Calls`);

  let advisors = [...byPnr.values()].map(toAdvisor);
  if (args.max > 0 && advisors.length > args.max) {
    advisors = advisors.slice(0, args.max);
    console.log(`  Nach --max: ${advisors.length}`);
  }

  // Optional: Team-Crawl je Subdomain
  if (args.fetchTeam) {
    console.log(`\n[3/3] Team-Größe für ${advisors.length} Berater (concurrency=${args.concurrency})...`);
    const teamStart = Date.now();
    await inBatches(advisors, args.concurrency, async (adv) => {
      if (!adv.subdomain) return;
      const html = await fetchText(`https://${adv.subdomain}/de/Agentur`);
      if (!html) return;
      const team = extractTeam(html, adv.email);
      adv.teamSize = team.size;
      adv.teamMembers = team.members.join("; ");
    }, (done, total) => {
      if (done % 50 === 0 || done === total) {
        const elapsed = (Date.now() - teamStart) / 1000;
        const rate = done / Math.max(elapsed, 0.1);
        const eta = (total - done) / Math.max(rate, 0.1);
        console.log(`  · ${done}/${total} (${rate.toFixed(1)}/s · ETA ${Math.round(eta)}s)`);
      }
    });
  } else {
    console.log("\n[3/3] Team-Crawl übersprungen (--team aktiviert es)");
  }

  // Sort: by team desc, then name
  advisors.sort(
    (a, b) =>
      b.teamSize - a.teamSize || a.lastName.localeCompare(b.lastName, "de"),
  );

  await writeCsv(OUTPUT_PATH, advisors);
  console.log(`\n  ✓ ${advisors.length} Zeilen → ${OUTPUT_PATH}`);

  // Stats
  const withPhone = advisors.filter((a) => a.phone || a.mobile).length;
  const withSubdomain = advisors.filter((a) => a.subdomain).length;
  console.log(`\nSummary: ${advisors.length} · ${withPhone} mit Telefon · ${withSubdomain} mit Subdomain`);
  if (args.fetchTeam) {
    const tBuckets = new Map<string, number>();
    for (const a of advisors) {
      const k = a.teamSize === 0 ? "0" : a.teamSize <= 2 ? "1-2" : a.teamSize <= 5 ? "3-5" : a.teamSize <= 10 ? "6-10" : "11+";
      tBuckets.set(k, (tBuckets.get(k) ?? 0) + 1);
    }
    console.log(`Team-Größen: ${[...tBuckets.entries()].sort().map(([k, n]) => `${k}=${n}`).join(" · ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
