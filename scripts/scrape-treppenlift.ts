/**
 * Treppenlift-Anbieter Scraper.
 *
 * Pipeline:
 *   1. Gelbe-Seiten-Suche "Treppenlift" in DE-Großstädten (40 Städte)
 *   2. Seed-Liste bekannter Lead-Käufer (Marktführer + Ketten) aus
 *      data/seed-treppenlift.json
 *   3. Dedupe per Domain / Name+Stadt
 *   4. Pro Anbieter mit Website: Impressum / Kontakt crawlen → E-Mails
 *   5. Multi-Standort-Signal berechnen (Firmen mit mehreren Adressen
 *      = wahrscheinlichere Lead-Käufer)
 *   6. CSV nach data/treppenlift-anbieter.csv
 *
 * Run:
 *   npm run scrape:treppenlift
 *   npm run scrape:treppenlift -- --cities=Berlin,Hamburg --max=200
 *   npm run scrape:treppenlift -- --source=seed
 */

import { chromium } from "playwright";
import { scrapeGelbeseiten } from "./scrape-brokers/sources/gelbeseiten.ts";
import { loadSeedList } from "./scrape-brokers/sources/seed-list.ts";
import { dedupeListings } from "./scrape-brokers/util/dedupe.ts";
import { enrichFromWebsite } from "./scrape-brokers/enrich/website.ts";
import { writeCsv } from "./scrape-brokers/util/csv.ts";
import type { CsvRow, EnrichedBroker, RawListing } from "./scrape-brokers/types.ts";

// 40 Städte DE-weit — von Groß- bis Mittelstadt. Deckt >90% der lokalen
// Treppenlift-Fachhändler ab.
const DEFAULT_CITIES = [
  "Berlin", "Hamburg", "München", "Köln", "Frankfurt am Main", "Stuttgart",
  "Düsseldorf", "Leipzig", "Dortmund", "Essen", "Bremen", "Hannover",
  "Dresden", "Nürnberg", "Duisburg", "Bochum", "Wuppertal", "Bielefeld",
  "Bonn", "Münster", "Karlsruhe", "Mannheim", "Augsburg", "Wiesbaden",
  "Mönchengladbach", "Braunschweig", "Chemnitz", "Kiel", "Aachen",
  "Halle", "Magdeburg", "Freiburg", "Krefeld", "Lübeck", "Oberhausen",
  "Erfurt", "Mainz", "Rostock", "Kassel", "Saarbrücken",
];

const OUTPUT_PATH = "data/treppenlift-anbieter.csv";
const DEFAULT_QUERY = "Treppenlift";
const DEFAULT_SEED = "data/seed-treppenlift.json";

type Args = {
  cities: string[];
  max: number;
  query: string;
  maxPagesPerCity: number;
  concurrency: number;
  debug: boolean;
  headful: boolean;
  source: "gelbeseiten" | "seed" | "both";
  seedPath: string;
  skipEnrich: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    cities: DEFAULT_CITIES,
    max: 800,
    query: DEFAULT_QUERY,
    maxPagesPerCity: 3,
    concurrency: 4,
    debug: false,
    headful: false,
    source: "both",
    seedPath: DEFAULT_SEED,
    skipEnrich: false,
  };
  for (const raw of argv.slice(2)) {
    const [k, v] = raw.includes("=") ? raw.split("=", 2) : [raw, "true"];
    switch (k) {
      case "--cities":
        args.cities = v.split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "--max":
        args.max = parseInt(v, 10);
        break;
      case "--query":
        args.query = v;
        break;
      case "--pages":
        args.maxPagesPerCity = parseInt(v, 10);
        break;
      case "--concurrency":
        args.concurrency = parseInt(v, 10);
        break;
      case "--debug":
        args.debug = v !== "false";
        break;
      case "--headful":
        args.headful = v !== "false";
        break;
      case "--source":
        if (v === "gelbeseiten" || v === "seed" || v === "both") args.source = v;
        else console.warn(`Unknown --source=${v}`);
        break;
      case "--seed-path":
        args.seedPath = v;
        break;
      case "--skip-enrich":
        args.skipEnrich = v !== "false";
        break;
      default:
        console.warn(`Unknown arg: ${k}`);
    }
  }
  return args;
}

async function enrichInBatches<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

function normalizeDomain(url: string | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(
    `Treppenlift-Scraper · query="${args.query}" · ${args.cities.length} Städte · max=${args.max} · source=${args.source}`,
  );

  const browser = await chromium.launch({ headless: !args.headful });

  try {
    // 1) Collect
    console.log(`\n[1/4] Sammeln (source=${args.source})...`);
    const collected: RawListing[] = [];
    if (args.source === "gelbeseiten" || args.source === "both") {
      const gs = await scrapeGelbeseiten(
        browser,
        args.cities,
        args.query,
        args.maxPagesPerCity,
        args.debug,
      );
      console.log(`  Gelbeseiten: ${gs.length}`);
      collected.push(...gs);
    }
    if (args.source === "seed" || args.source === "both") {
      const seed = await loadSeedList(args.seedPath);
      console.log(`  Seed-Liste (${args.seedPath}): ${seed.length}`);
      collected.push(...seed);
    }
    console.log(`  Total raw: ${collected.length}`);

    // 2) Dedupe + cap
    let unique = dedupeListings(collected);
    console.log(`  Nach Dedupe: ${unique.length}`);
    if (args.max > 0 && unique.length > args.max) {
      unique = unique.slice(0, args.max);
      console.log(`  Nach Cap: ${unique.length}`);
    }

    // 3) Enrich (Websites → Impressum → Emails)
    let enriched: EnrichedBroker[];
    if (args.skipEnrich) {
      console.log(`\n[2/4] Enrichment übersprungen (--skip-enrich)`);
      enriched = unique.map((l) => ({
        ...l,
        emails: [],
        phonesExtra: [],
        employeesEstimate: null,
        employeesMethod: null,
      }));
    } else {
      console.log(`\n[2/4] Enrichment ${unique.length} Websites (concurrency=${args.concurrency})...`);
      let done = 0;
      enriched = await enrichInBatches(unique, args.concurrency, async (l) => {
        const base: EnrichedBroker = {
          ...l,
          emails: [],
          phonesExtra: [],
          employeesEstimate: null,
          employeesMethod: null,
        };
        if (!l.website) {
          done++;
          if (done % 10 === 0) console.log(`  · ${done}/${unique.length}`);
          return base;
        }
        const enrichment = await enrichFromWebsite(browser, l.website);
        done++;
        if (done % 10 === 0 || done === unique.length) {
          console.log(
            `  · ${done}/${unique.length} (${l.name.slice(0, 40)} → ${enrichment.emails.length} emails)`,
          );
        }
        return {
          ...base,
          emails: enrichment.emails,
          phonesExtra: enrichment.phones,
          employeesEstimate: enrichment.employeesEstimate,
          employeesMethod: enrichment.employeesMethod,
          employeesSourceUrl: enrichment.employeesSourceUrl,
          crawlError: enrichment.error,
        };
      });
    }

    // 4) Multi-Standort-Signal: Firmen die unter derselben Domain
    //    in mehreren Städten auftauchen = wahrscheinlicher Lead-Käufer
    console.log(`\n[3/4] Berechne Multi-Standort-Signal...`);
    const byDomain = new Map<string, number>();
    for (const e of enriched) {
      const d = normalizeDomain(e.website);
      if (!d) continue;
      byDomain.set(d, (byDomain.get(d) ?? 0) + 1);
    }
    const multiSite = new Set(
      [...byDomain.entries()].filter(([, n]) => n >= 2).map(([d]) => d),
    );
    console.log(`  ${multiSite.size} Firmen mit ≥2 Standorten (Signal Lead-Käufer)`);

    // 5) Write CSV
    console.log(`\n[4/4] Schreibe ${OUTPUT_PATH}...`);
    const rows = enriched.map((e) => {
      const domain = normalizeDomain(e.website);
      const standorte = domain ? byDomain.get(domain) ?? 1 : 1;
      const leadKaeuferSignal = multiSite.has(domain) ? "ja" : "";
      return {
        name: e.name,
        street: e.street ?? "",
        zip: e.zip ?? "",
        city: e.city,
        phone: e.phone ?? e.phonesExtra[0] ?? "",
        email: e.emails[0] ?? "",
        emailsExtra: e.emails.slice(1).join("; "),
        website: e.website ?? "",
        standorte: String(standorte),
        leadKaeuferSignal,
        source: e.source,
        sourceUrl: e.sourceUrl ?? "",
      };
    });

    // Sortiere: Lead-Käufer zuerst, dann nach Standorten desc, dann Name
    rows.sort((a, b) => {
      if (a.leadKaeuferSignal !== b.leadKaeuferSignal) {
        return a.leadKaeuferSignal ? -1 : 1;
      }
      const s = parseInt(b.standorte, 10) - parseInt(a.standorte, 10);
      if (s !== 0) return s;
      return a.name.localeCompare(b.name, "de");
    });

    await writeExtCsv(OUTPUT_PATH, rows);
    console.log(`  ✓ ${rows.length} Zeilen`);

    // Summary
    const withEmail = rows.filter((r) => r.email).length;
    const withPhone = rows.filter((r) => r.phone).length;
    const withWebsite = rows.filter((r) => r.website).length;
    const leadKaeufer = rows.filter((r) => r.leadKaeuferSignal).length;
    console.log(
      `\nSummary: ${rows.length} Anbieter · ${withEmail} mit Email · ${withPhone} mit Telefon · ${withWebsite} mit Website`,
    );
    console.log(`Lead-Käufer-Signal (≥2 Standorte): ${leadKaeufer}`);
  } finally {
    await browser.close();
  }
}

// Own writeCsv (bestehender writeCsv hat andere Spalten)
async function writeExtCsv(
  path: string,
  rows: Array<Record<string, string>>,
): Promise<void> {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const headers = [
    "name",
    "street",
    "zip",
    "city",
    "phone",
    "email",
    "emailsExtra",
    "website",
    "standorte",
    "leadKaeuferSignal",
    "source",
    "sourceUrl",
  ];
  const escape = (v: string) => {
    if (v.includes('"') || v.includes(",") || v.includes("\n")) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => escape(String(r[h] ?? ""))).join(","));
  }
  await mkdir("data", { recursive: true });
  await writeFile(path, lines.join("\n") + "\n", "utf8");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
