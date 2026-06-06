/**
 * AXA-Betreuer Scraper — primär über die offizielle agencySearch.json-API.
 *
 * Pipeline (default --source=api):
 *   1. Lat/Lng-Grid über Deutschland legen (~220 Stützpunkte, 25km Spacing)
 *   2. Pro Punkt agencySearch.json?lat=...&lng=...&range=30&minresults=100 → bis zu 100 Berater
 *   3. Dedupe per `id`
 *   4. Optional: pro Slug die /ueber-uns/filialen-und-team-Seite holen für Team-Größe
 *   5. CSV nach data/axa-advisors.csv, sortiert nach team_size desc
 *
 * Run:
 *   npm run scrape:axa
 *   npm run scrape:axa -- --no-team    # ohne Team-Page-Crawl, schneller
 *   npm run scrape:axa -- --spacing=40 # gröberes Grid, schneller, evtl. Lücken
 */

import { writeFile, mkdir } from "node:fs/promises";

const BASE = "https://www.axa-betreuer.de";
const API = `${BASE}/webservices/agencySearch.json`;
const OUTPUT_PATH = "data/axa-advisors.csv";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Bounding box Deutschland
const DE_LAT_MIN = 47.27;
const DE_LAT_MAX = 55.06;
const DE_LNG_MIN = 5.87;
const DE_LNG_MAX = 15.04;

type Args = {
  spacing: number; // grid spacing in km (default 25)
  range: number; // API range in km (default 30, max ~50)
  concurrency: number;
  fetchTeam: boolean;
  max: number;
  plzList: string | null;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    spacing: 25,
    range: 30,
    concurrency: 4,
    fetchTeam: true,
    max: 0,
    plzList: null,
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
      case "--concurrency":
        args.concurrency = parseInt(v, 10);
        break;
      case "--no-team":
        args.fetchTeam = false;
        break;
      case "--max":
        args.max = parseInt(v, 10);
        break;
      case "--plz":
        args.plzList = v;
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
          "Accept-Language": "de-DE,de;q=0.9",
          Referer: `${BASE}/betreuersuche`,
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

type ApiAgency = {
  id: string;
  vname?: string;
  nname?: string;
  ma_vname?: string;
  ma_nname?: string;
  anrede?: string;
  strasse?: string;
  hnr?: string;
  plz?: string;
  ort?: string;
  telvorwahl?: string;
  telnummer?: string;
  mobilvorwahl?: string;
  mobilnummer?: string;
  email?: string;
  url?: string;
  urlzusatz?: string;
  vv?: string;
  filialname?: string;
  lat?: number;
  lng?: number;
  hpid?: string;
  languages?: string;
  ekomi_rating_average?: number;
  ekomi_rating_count?: number;
};

type ApiResponse = {
  agencyDataList?: ApiAgency[];
};

function buildGrid(spacing: number): { lat: number; lng: number }[] {
  // Convert km spacing → degrees. 1° lat ≈ 111 km, 1° lng ≈ 111 * cos(lat) km.
  const latStep = spacing / 111;
  const points: { lat: number; lng: number }[] = [];
  for (let lat = DE_LAT_MIN; lat <= DE_LAT_MAX; lat += latStep) {
    const lngStep = spacing / (111 * Math.cos((lat * Math.PI) / 180));
    for (let lng = DE_LNG_MIN; lng <= DE_LNG_MAX; lng += lngStep) {
      points.push({ lat, lng });
    }
  }
  return points;
}

// PLZ → Lat/Lng mit AXA's eigenem geocode-Endpoint
async function geocodePlz(plz: string): Promise<{ lat: number; lng: number } | null> {
  const url = `${BASE}/webservices/geocodeSearchMaps.json?plz=${plz}&channel=AXADE.Betreuer.Suche`;
  const txt = await fetchText(url);
  if (!txt) return null;
  try {
    const j = JSON.parse(txt);
    if (typeof j.lat === "number" && typeof j.lng === "number") {
      return { lat: j.lat, lng: j.lng };
    }
    if (Array.isArray(j) && j[0]?.lat) return { lat: j[0].lat, lng: j[0].lng };
  } catch {
    // fallthrough
  }
  return null;
}

async function searchAgencies(lat: number, lng: number, range: number): Promise<ApiAgency[]> {
  const params = new URLSearchParams({
    lat: lat.toFixed(4),
    lng: lng.toFixed(4),
    range: String(range),
    minresults: "100",
    axaonly: "AXA",
    channel: "AXADE.Betreuer.Suche",
  });
  const txt = await fetchText(`${API}?${params}`);
  if (!txt) return [];
  try {
    const j: ApiResponse = JSON.parse(txt);
    return j.agencyDataList ?? [];
  } catch {
    return [];
  }
}

type Advisor = {
  id: string;
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
  filialname: string;
  teamSize: number;
  teamMembers: string;
  rating: string;
  ratingCount: string;
  url: string;
};

function toAdvisor(a: ApiAgency): Advisor {
  const slug = (a.urlzusatz ?? "").toLowerCase();
  const firstName = (a.vname || a.ma_vname || "").trim();
  const lastName = (a.nname || a.ma_nname || "").trim();
  const name = [firstName, lastName].filter(Boolean).join(" ").trim() || lastName;
  const street = [a.strasse, a.hnr].filter(Boolean).join(" ").trim();
  const phone = a.telnummer ? `${a.telvorwahl || ""} ${a.telnummer}`.trim() : "";
  const mobile = a.mobilnummer ? `${a.mobilvorwahl || ""} ${a.mobilnummer}`.trim() : "";
  return {
    id: a.id,
    slug,
    name,
    firstName,
    lastName,
    role: a.vv ? `AXA ${a.vv}` : "",
    email: (a.email || "").toLowerCase(),
    phone,
    mobile,
    street,
    zip: a.plz || "",
    city: a.ort || "",
    filialname: a.filialname || "",
    teamSize: 0,
    teamMembers: "",
    rating: a.ekomi_rating_average != null ? String(a.ekomi_rating_average) : "",
    ratingCount: a.ekomi_rating_count != null ? String(a.ekomi_rating_count) : "",
    url: slug ? `${BASE}/${slug}/` : "",
  };
}

// Extract team count from /ueber-uns/filialen-und-team. Optional, costs +1 fetch per advisor.
function extractTeam(html: string): { size: number; members: string[] } {
  const names = new Set<string>();
  const re = /<div[^>]+class="[^"]*multiContactBox[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]+class="[^"]*multiContactBox|<\/section|<\/main|$)/gi;
  for (const m of html.matchAll(re)) {
    const cardHtml = m[1];
    const altMatch = cardHtml.match(/<img[^>]*\salt="([^"]+)"/i);
    if (altMatch) {
      const name = altMatch[1].trim();
      if (/^[A-ZÄÖÜ][\wäöüß\-']+(?:\s+[A-ZÄÖÜ][\wäöüß\-']+){1,3}$/.test(name)) {
        names.add(name);
      }
    }
  }
  return { size: names.size, members: [...names] };
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
    "name", "firstName", "lastName", "role", "email", "phone", "mobile",
    "street", "zip", "city", "filialname",
    "teamSize", "teamMembers",
    "rating", "ratingCount", "slug", "url", "id",
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
    `AXA-API-Scraper · spacing=${args.spacing}km · range=${args.range}km · concurrency=${args.concurrency}` +
      (args.fetchTeam ? "" : " · no-team") +
      (args.plzList ? ` · plz=${args.plzList}` : ""),
  );

  // 1) Stützpunkte bauen
  let points: { lat: number; lng: number }[];
  if (args.plzList) {
    const plzArr = args.plzList.split(",").map((s) => s.trim()).filter(Boolean);
    console.log(`\n[1/3] Geocoding ${plzArr.length} PLZ...`);
    points = [];
    for (const plz of plzArr) {
      const p = await geocodePlz(plz);
      if (p) {
        points.push(p);
        console.log(`  · ${plz} → ${p.lat.toFixed(4)},${p.lng.toFixed(4)}`);
      } else {
        console.warn(`  ! ${plz}: kein Geocode`);
      }
    }
  } else {
    points = buildGrid(args.spacing);
    console.log(`\n[1/3] Grid: ${points.length} Stützpunkte über DE (Spacing ${args.spacing}km)`);
  }

  // 2) Pro Stützpunkt API abfragen
  console.log(`\n[2/3] API-Discovery (concurrency=${args.concurrency})...`);
  const byId = new Map<string, ApiAgency>();
  let apiDone = 0;
  const startedAt = Date.now();
  await inBatches(points, args.concurrency, async (p) => {
    const agencies = await searchAgencies(p.lat, p.lng, args.range);
    for (const a of agencies) {
      if (!byId.has(a.id)) byId.set(a.id, a);
    }
  }, (done, total) => {
    apiDone = done;
    if (done % 20 === 0 || done === total) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = done / Math.max(elapsed, 0.1);
      const eta = (total - done) / Math.max(rate, 0.1);
      console.log(`  · ${done}/${total} (${rate.toFixed(1)}/s · ETA ${Math.round(eta)}s · unique: ${byId.size})`);
    }
  });

  console.log(`  ✓ ${byId.size} unique Berater aus ${points.length} API-Calls`);

  let advisors = [...byId.values()].map(toAdvisor);
  if (args.max > 0 && advisors.length > args.max) {
    advisors = advisors.slice(0, args.max);
    console.log(`  Nach --max: ${advisors.length}`);
  }

  // 3) Team-Größen per HTML-Crawl (optional)
  if (args.fetchTeam) {
    console.log(`\n[3/3] Team-Größe für ${advisors.length} Berater (concurrency=${args.concurrency})...`);
    const teamStart = Date.now();
    await inBatches(advisors, args.concurrency, async (adv) => {
      if (!adv.slug) return;
      const html = await fetchText(`${BASE}/${adv.slug}/ueber-uns/filialen-und-team`);
      if (!html) return;
      const team = extractTeam(html);
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
    console.log("\n[3/3] Team-Crawl übersprungen (--no-team)");
  }

  // Sort: by team desc, then rating desc
  advisors.sort(
    (a, b) =>
      b.teamSize - a.teamSize ||
      parseFloat(b.rating || "0") - parseFloat(a.rating || "0") ||
      a.name.localeCompare(b.name, "de"),
  );

  await writeCsv(OUTPUT_PATH, advisors);
  console.log(`\n  ✓ ${advisors.length} Zeilen → ${OUTPUT_PATH}`);

  // Summary
  const withEmail = advisors.filter((a) => a.email).length;
  const withPhone = advisors.filter((a) => a.phone || a.mobile).length;
  const teamBuckets = new Map<string, number>();
  for (const a of advisors) {
    const k =
      a.teamSize === 0 ? "0" : a.teamSize <= 2 ? "1-2" : a.teamSize <= 5 ? "3-5" :
      a.teamSize <= 10 ? "6-10" : "11+";
    teamBuckets.set(k, (teamBuckets.get(k) ?? 0) + 1);
  }
  const byRole = new Map<string, number>();
  for (const a of advisors) {
    const k = a.role || "unbekannt";
    byRole.set(k, (byRole.get(k) ?? 0) + 1);
  }
  console.log(`\nSummary: ${advisors.length} Berater · ${withEmail} mit Email · ${withPhone} mit Telefon`);
  if (args.fetchTeam) {
    console.log(`Team-Größen: ${[...teamBuckets.entries()].sort().map(([k, n]) => `${k}=${n}`).join(" · ")}`);
  }
  console.log(`Rollen: ${[...byRole.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}=${n}`).join(" · ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
