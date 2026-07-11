/**
 * PKV-Optimierung §204 VVG Scraper — Welle 1.
 *
 * Pipeline:
 *   1. Seed-Liste bekannter Anbieter (data/seed-pkv-204.json)
 *   2. DDG-SERP-Discovery über 6 Fach-Keywords → weitere Anbieter-Domains
 *   3. Dedupe per Domain
 *   4. Pro Anbieter: Impressum / Kontakt crawlen → E-Mails + Telefone
 *   5. CSV nach data/pkv-204-anbieter.csv
 *
 * Run: npm run scrape:pkv-204
 */

import { chromium } from "playwright";
import { loadSeedList } from "./scrape-brokers/sources/seed-list.ts";
import { dedupeListings } from "./scrape-brokers/util/dedupe.ts";
import { enrichFromWebsite } from "./scrape-brokers/enrich/website.ts";
import type { EnrichedBroker, RawListing } from "./scrape-brokers/types.ts";

const DEFAULT_SEED = "data/seed-pkv-204.json";
const OUTPUT_PATH = "data/pkv-204-anbieter.csv";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Themenspezifische Suchbegriffe für DDG-SERP-Entdeckung
const DDG_QUERIES = [
  "PKV Tarifwechsel §204 Beratung",
  "PKV Optimierung Honorarberatung",
  "PKV Beitrag senken Tarifwechsel",
  "PKV Wechsel innerhalb Versicherung §204",
  "private Krankenversicherung Tarifoptimierung",
  "PKV Beitragsoptimierung Honorarberater",
];

// Domains ausschließen die keine Anbieter sind
const BLACKLIST_DOMAINS = new Set([
  "wikipedia.org",
  "gesetze-im-internet.de",
  "dejure.org",
  "pkv.de",           // Fachverband, kein Anbieter
  "pkv-ombudsmann.de",
  "verbraucherzentrale.de",
  "finanztip.de",
  "stiftung-warentest.de",
  "check24.de",
  "verivox.de",
  "focus.de",
  "handelsblatt.com",
  "welt.de",
  "spiegel.de",
  "wiwo.de",
  "faz.net",
  "sueddeutsche.de",
  "tagesschau.de",
  "zdf.de",
  "ard.de",
  "youtube.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "xing.com",
  "google.com",
  "bing.com",
  "duckduckgo.com",
  "amazon.de",
  "trustpilot.com",
  "provenexpert.com",
  "kununu.com",
  "jameda.de",
  "sanego.de",
  "docsonnet.de",
  "pflege.de",
  "aok.de",
  "tk.de",
  "barmer.de",
  "dak.de",
  "debeka.de",
  "signal-iduna.de",
  "hukcoburg.de",
  "huk.de",
  "allianz.de",
  "axa.de",
  "ergo.de",
  "dkv.com",
  "generali.de",
  "gothaer.de",
  "provinzial.com",
  "hansemerkur.de",
]);

type Args = {
  seedPath: string;
  concurrency: number;
  skipSerp: boolean;
  skipEnrich: boolean;
  max: number;
  debug: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    seedPath: DEFAULT_SEED,
    concurrency: 4,
    skipSerp: false,
    skipEnrich: false,
    max: 0,
    debug: false,
  };
  for (const raw of argv.slice(2)) {
    const [k, v] = raw.includes("=") ? raw.split("=", 2) : [raw, "true"];
    switch (k) {
      case "--seed-path":
        args.seedPath = v;
        break;
      case "--concurrency":
        args.concurrency = parseInt(v, 10);
        break;
      case "--skip-serp":
        args.skipSerp = v !== "false";
        break;
      case "--skip-enrich":
        args.skipEnrich = v !== "false";
        break;
      case "--max":
        args.max = parseInt(v, 10);
        break;
      case "--debug":
        args.debug = v !== "false";
        break;
      default:
        console.warn(`Unknown arg: ${k}`);
    }
  }
  return args;
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

// DDG-HTML SERP-Discovery — sammelt externe Domains aus den Suchergebnissen
async function discoverViaDdg(query: string, debug: boolean): Promise<string[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "de-DE,de;q=0.9",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      if (debug) console.warn(`  DDG "${query}": HTTP ${res.status}`);
      return [];
    }
    const html = await res.text();
    if (html.length < 5000 || /challenge|anomaly\.js/i.test(html)) {
      if (debug) console.warn(`  DDG "${query}": blocked (challenge)`);
      return [];
    }
    // Extract result URLs from DDG-HTML — die stehen als klare hrefs
    const domains = new Set<string>();
    // DDG-HTML: <a class="result__a" href="URL"> oder in <a class="result__url">
    for (const m of html.matchAll(/<a[^>]+class="result__(?:a|url)"[^>]+href="([^"]+)"/gi)) {
      let url = m[1];
      // DDG wraps some URLs in /l/?uddg=...
      const uddg = url.match(/[?&]uddg=([^&]+)/);
      if (uddg) {
        try {
          url = decodeURIComponent(uddg[1]);
        } catch {}
      }
      const d = normalizeDomain(url);
      if (d) domains.add(d);
    }
    return [...domains];
  } catch (e) {
    if (debug) console.warn(`  DDG "${query}": ${(e as Error).message}`);
    return [];
  }
}

async function runSerpDiscovery(debug: boolean): Promise<RawListing[]> {
  const domainToQueries = new Map<string, string[]>();
  for (const q of DDG_QUERIES) {
    console.log(`  · SERP: "${q}"...`);
    const domains = await discoverViaDdg(q, debug);
    console.log(`      → ${domains.length} Domains`);
    for (const d of domains) {
      if (BLACKLIST_DOMAINS.has(d)) continue;
      // filter tld-only domains
      if (!/\.[a-z]{2,}$/i.test(d)) continue;
      const list = domainToQueries.get(d) ?? [];
      list.push(q);
      domainToQueries.set(d, list);
    }
    // Politeness — DDG blockt sonst
    await new Promise((r) => setTimeout(r, 3000 + Math.random() * 2000));
  }

  const results: RawListing[] = [];
  for (const [domain, queries] of domainToQueries) {
    // Nur Domains die in >=1 der Queries erschienen (also alle die im Set landen)
    results.push({
      name: domain,
      city: "",
      website: `https://${domain}`,
      source: `ddg-serp (${queries.length} query hits)`,
      sourceUrl: `https://duckduckgo.com/?q=${encodeURIComponent(queries[0])}`,
    });
  }
  return results;
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
  console.log(`PKV-204-Scraper · concurrency=${args.concurrency}` + (args.skipSerp ? " · no-serp" : "") + (args.skipEnrich ? " · no-enrich" : ""));

  const collected: RawListing[] = [];

  // 1) Seed
  console.log(`\n[1/4] Seed-Liste (${args.seedPath})...`);
  const seed = await loadSeedList(args.seedPath);
  console.log(`  ${seed.length} Anbieter`);
  collected.push(...seed);

  // 2) DDG-SERP
  if (!args.skipSerp) {
    console.log(`\n[2/4] DDG-SERP-Discovery über ${DDG_QUERIES.length} Queries...`);
    const serp = await runSerpDiscovery(args.debug);
    console.log(`  ${serp.length} eindeutige Domains aus SERPs`);
    collected.push(...serp);
  } else {
    console.log(`\n[2/4] SERP-Discovery übersprungen`);
  }

  console.log(`  Total raw: ${collected.length}`);
  let unique = dedupeListings(collected);
  console.log(`  Nach Dedupe: ${unique.length}`);
  if (args.max > 0 && unique.length > args.max) {
    unique = unique.slice(0, args.max);
    console.log(`  Nach Cap: ${unique.length}`);
  }

  // 3) Enrichment
  const browser = await chromium.launch({ headless: true });
  let enriched: EnrichedBroker[];
  try {
    if (args.skipEnrich) {
      console.log(`\n[3/4] Enrichment übersprungen`);
      enriched = unique.map((l) => ({
        ...l,
        emails: [],
        phonesExtra: [],
        employeesEstimate: null,
        employeesMethod: null,
      }));
    } else {
      console.log(`\n[3/4] Enrichment ${unique.length} Websites (concurrency=${args.concurrency})...`);
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
          return base;
        }
        const enrichment = await enrichFromWebsite(browser, l.website);
        done++;
        if (done % 10 === 0 || done === unique.length) {
          console.log(`  · ${done}/${unique.length} (${l.name.slice(0, 40)} → ${enrichment.emails.length} emails)`);
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
  } finally {
    await browser.close();
  }

  // 4) CSV
  console.log(`\n[4/4] Schreibe ${OUTPUT_PATH}...`);
  const rows = enriched.map((e) => ({
    name: e.name,
    street: e.street ?? "",
    zip: e.zip ?? "",
    city: e.city,
    phone: e.phone ?? e.phonesExtra[0] ?? "",
    email: e.emails[0] ?? "",
    emailsExtra: e.emails.slice(1).join("; "),
    website: e.website ?? "",
    source: e.source,
    sourceUrl: e.sourceUrl ?? "",
  }));

  // Sort: Seed zuerst, dann alphabetisch nach Name
  rows.sort((a, b) => {
    const aSeed = a.source === "seed-list" ? 0 : 1;
    const bSeed = b.source === "seed-list" ? 0 : 1;
    if (aSeed !== bSeed) return aSeed - bSeed;
    return a.name.localeCompare(b.name, "de");
  });

  await writeExtCsv(OUTPUT_PATH, rows);
  const withEmail = rows.filter((r) => r.email).length;
  const withPhone = rows.filter((r) => r.phone).length;
  const seedCount = rows.filter((r) => r.source === "seed-list").length;
  const serpCount = rows.length - seedCount;
  console.log(`  ✓ ${rows.length} Zeilen (${seedCount} Seed · ${serpCount} SERP)`);
  console.log(`\nSummary: ${rows.length} · ${withEmail} mit Email · ${withPhone} mit Telefon`);
}

async function writeExtCsv(
  path: string,
  rows: Array<Record<string, string>>,
): Promise<void> {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const headers = ["name", "street", "zip", "city", "phone", "email", "emailsExtra", "website", "source", "sourceUrl"];
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
