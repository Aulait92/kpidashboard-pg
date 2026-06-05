/**
 * Scraper: Versicherungsmakler (§34d) in Deutschland mit min..max Mitarbeitern.
 *
 * Pipeline:
 *   1. Sammle Listings via Gelbe Seiten je Stadt (Name, Adresse, Tel, Webseite)
 *   2. Dedupliziere (per Domain bzw. Name+Stadt)
 *   3. Für jede Firma mit Webseite: Crawle Home + Impressum + Kontakt + Team-Seite
 *      → E-Mails, zusätzliche Telefonnummern, Mitarbeiter-Schätzung (Heuristik)
 *   4. Filter in [--min-employees, --max-employees] (Treffer ohne Schätzung via --keep-unknown
 *      durchgelassen werden)
 *   5. CSV nach data/brokers.csv
 *
 * Run:
 *   npm run scrape:brokers
 *   npm run scrape:brokers -- --cities=Berlin,München --max=50 --keep-unknown
 */

import { chromium } from "playwright";
import { scrapeGelbeseiten } from "./scrape-brokers/sources/gelbeseiten.ts";
import { dedupeListings } from "./scrape-brokers/util/dedupe.ts";
import { enrichFromWebsite } from "./scrape-brokers/enrich/website.ts";
import { enrichFromKununu } from "./scrape-brokers/enrich/kununu.ts";
import { writeCsv } from "./scrape-brokers/util/csv.ts";
import type { CsvRow, EnrichedBroker } from "./scrape-brokers/types.ts";

// Defaults — ~12 Großstädte reichen für den Test-Lauf von 50–200 Firmen
const DEFAULT_CITIES = [
  "Berlin",
  "Hamburg",
  "München",
  "Köln",
  "Frankfurt am Main",
  "Stuttgart",
  "Düsseldorf",
  "Leipzig",
  "Dortmund",
  "Essen",
  "Bremen",
  "Hannover",
];

const DEFAULT_MIN_EMPLOYEES = 30;
const DEFAULT_MAX_EMPLOYEES = 100;
const OUTPUT_PATH = "data/brokers.csv";

type Args = {
  cities: string[];
  max: number;
  keepUnknown: boolean;
  query: string;
  maxPagesPerCity: number;
  concurrency: number;
  debug: boolean;
  headful: boolean;
  minEmployees: number;
  maxEmployees: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    cities: DEFAULT_CITIES,
    max: 200,
    keepUnknown: false,
    query: "Versicherungsmakler",
    maxPagesPerCity: 3,
    concurrency: 4,
    debug: false,
    headful: false,
    minEmployees: DEFAULT_MIN_EMPLOYEES,
    maxEmployees: DEFAULT_MAX_EMPLOYEES,
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
      case "--keep-unknown":
        args.keepUnknown = v !== "false";
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
      case "--min-employees":
        args.minEmployees = parseInt(v, 10);
        break;
      case "--max-employees":
        args.maxEmployees = parseInt(v, 10);
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

async function main() {
  const args = parseArgs(process.argv);
  console.log(`Scraping ${args.query} in ${args.cities.length} cities (max ${args.max} total)`);
  console.log(
    `Filter: ${args.minEmployees}–${args.maxEmployees} employees${args.keepUnknown ? " (keeping unknowns)" : ""}`,
  );

  const browser = await chromium.launch({ headless: !args.headful });

  try {
    // 1) Collect
    console.log("\n[1/4] Collecting listings from Gelbe Seiten...");
    const raw = await scrapeGelbeseiten(
      browser,
      args.cities,
      args.query,
      args.maxPagesPerCity,
      args.debug,
    );
    console.log(`  Total raw: ${raw.length}`);

    // 2) Dedupe + cap
    const unique = dedupeListings(raw).slice(0, args.max);
    console.log(`  After dedupe & cap(${args.max}): ${unique.length}`);

    // 3) Enrich
    console.log(`\n[2/4] Enriching ${unique.length} websites (concurrency=${args.concurrency})...`);
    let done = 0;
    const enriched: EnrichedBroker[] = await enrichInBatches(unique, args.concurrency, async (l) => {
      const base: EnrichedBroker = {
        ...l,
        emails: [],
        phonesExtra: [],
        employeesEstimate: null,
        employeesMethod: null,
      };
      if (!l.website) {
        done++;
        if (done % 5 === 0) console.log(`  · ${done}/${unique.length}`);
        return base;
      }
      const enrichment = await enrichFromWebsite(browser, l.website);
      done++;
      if (done % 5 === 0 || done === unique.length) {
        console.log(`  · ${done}/${unique.length} (${l.name.slice(0, 40)} → ${enrichment.emails.length} emails, MA=${enrichment.employeesEstimate ?? "?"})`);
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

    // 3b) Kununu fallback for entries still without an MA estimate
    const needsKununu = enriched.filter((e) => e.employeesEstimate === null);
    if (needsKununu.length > 0) {
      console.log(
        `\n[2b] Kununu fallback for ${needsKununu.length} entries without MA estimate (concurrency=2)...`,
      );
      let kdone = 0;
      let khit = 0;
      await enrichInBatches(needsKununu, 2, async (e) => {
        const k = await enrichFromKununu(browser, e.name);
        kdone++;
        if (k.employeesEstimate !== null) {
          e.employeesEstimate = k.employeesEstimate;
          e.employeesMethod = "kununu";
          e.employeesSourceUrl = k.sourceUrl;
          khit++;
        }
        if (kdone % 10 === 0 || kdone === needsKununu.length) {
          console.log(`  · ${kdone}/${needsKununu.length} (${khit} hits so far)`);
        }
        return null;
      });
    }

    // 4) Filter
    console.log(`\n[3/4] Filtering ${args.minEmployees}–${args.maxEmployees} employees...`);
    const filtered = enriched.filter((e) => {
      if (e.employeesEstimate === null) return args.keepUnknown;
      return e.employeesEstimate >= args.minEmployees && e.employeesEstimate <= args.maxEmployees;
    });
    console.log(`  Passed filter: ${filtered.length} / ${enriched.length}`);

    // 5) Write CSV
    console.log(`\n[4/4] Writing ${OUTPUT_PATH}...`);
    const rows: CsvRow[] = filtered.map((e) => ({
      name: e.name,
      street: e.street ?? "",
      zip: e.zip ?? "",
      city: e.city,
      phone: e.phone ?? e.phonesExtra[0] ?? "",
      email: e.emails[0] ?? "",
      website: e.website ?? "",
      employeesEstimate: e.employeesEstimate?.toString() ?? "",
      employeesMethod: e.employeesMethod ?? "",
      source: e.source,
      sourceUrl: e.sourceUrl ?? "",
    }));
    await writeCsv(OUTPUT_PATH, rows);
    console.log(`  ✓ ${rows.length} rows written to ${OUTPUT_PATH}`);

    // Summary
    const withEmail = rows.filter((r) => r.email).length;
    const withPhone = rows.filter((r) => r.phone).length;
    const withWebsite = rows.filter((r) => r.website).length;
    const byMethod = new Map<string, number>();
    for (const r of rows) {
      const m = r.employeesMethod || "unknown";
      byMethod.set(m, (byMethod.get(m) ?? 0) + 1);
    }
    console.log(`\nSummary: ${withEmail} with email · ${withPhone} with phone · ${withWebsite} with website`);
    console.log(
      `MA-Quellen: ${[...byMethod.entries()].map(([k, n]) => `${k}=${n}`).join(" · ")}`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
