/**
 * PKV-§204 Scraper — Welle 3 (Brave Search API).
 *
 * Pipeline:
 *   1. Seed-Liste (data/seed-pkv-204.json)
 *   2. Brave Search API — 6 Fach-Keywords, je bis zu 20 Ergebnisse
 *   3. HTTP-Verifikation aller entdeckten Domains
 *   4. Playwright-Enrichment für Emails + Telefone
 *   5. CSV nach data/pkv-204-v3.csv
 *
 * Setup:
 *   1. https://api.search.brave.com → Free-Plan → API-Key
 *   2. export BRAVE_API_KEY="dein-key"
 *   3. npm run scrape:pkv-204-v3
 */

import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { loadSeedList } from "./scrape-brokers/sources/seed-list.ts";

const OUTPUT_PATH = "data/pkv-204-v3.csv";
const SEED_PATH = "data/seed-pkv-204.json";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const BRAVE_API = "https://api.search.brave.com/res/v1/web/search";

const KEYWORDS = [
  "PKV Tarifwechsel §204 Beratung",
  "PKV Optimierung Honorarberatung Deutschland",
  "PKV Beitrag senken Tarifwechsel Berater",
  "private Krankenversicherung Tarifoptimierung Anbieter",
  "PKV Beitragsoptimierung Honorarberater",
  "PKV Wechsel §204 Versicherung",
];

const BLACKLIST_DOMAINS = new Set([
  "wikipedia.org", "de.wikipedia.org", "gesetze-im-internet.de", "dejure.org",
  "pkv.de", "pkv-ombudsmann.de", "verbraucherzentrale.de", "finanztip.de",
  "stiftung-warentest.de", "check24.de", "verivox.de", "focus.de",
  "handelsblatt.com", "welt.de", "spiegel.de", "wiwo.de", "faz.net",
  "sueddeutsche.de", "tagesschau.de", "zdf.de", "ard.de", "youtube.com",
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "xing.com", "google.com", "bing.com", "duckduckgo.com", "startpage.com",
  "ecosia.org", "brave.com", "mojeek.com", "amazon.de", "trustpilot.com",
  "provenexpert.com", "kununu.com", "jameda.de", "sanego.de", "pflege.de",
  "aok.de", "tk.de", "barmer.de", "dak.de", "debeka.de", "signal-iduna.de",
  "hukcoburg.de", "huk.de", "allianz.de", "axa.de", "ergo.de", "dkv.com",
  "generali.de", "gothaer.de", "provinzial.com", "hansemerkur.de",
  "reddit.com", "quora.com", "gutefrage.net", "stern.de", "zeit.de",
  "n-tv.de", "duden.de", "wiktionary.org",
]);

type Args = {
  concurrency: number;
  skipSerp: boolean;
  skipEnrich: boolean;
  count: number;
  debug: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { concurrency: 4, skipSerp: false, skipEnrich: false, count: 20, debug: false };
  for (const raw of argv.slice(2)) {
    const [k, v] = raw.includes("=") ? raw.split("=", 2) : [raw, "true"];
    switch (k) {
      case "--concurrency": args.concurrency = parseInt(v, 10); break;
      case "--skip-serp": args.skipSerp = v !== "false"; break;
      case "--skip-enrich": args.skipEnrich = v !== "false"; break;
      case "--count": args.count = parseInt(v, 10); break;
      case "--debug": args.debug = v !== "false"; break;
      default: console.warn(`Unknown arg: ${k}`);
    }
  }
  return args;
}

function normalizeDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// --- Brave Search API ---

type BraveResult = { url?: string; title?: string; description?: string };
type BraveResponse = { web?: { results?: BraveResult[] } };

async function braveSearch(query: string, count: number, apiKey: string, debug: boolean): Promise<BraveResult[]> {
  const url = `${BRAVE_API}?q=${encodeURIComponent(query)}&country=DE&search_lang=de&count=${count}&safesearch=off`;
  try {
    const res = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "X-Subscription-Token": apiKey,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      if (debug) console.warn(`      Brave: HTTP ${res.status} - ${await res.text().then((t) => t.slice(0, 200))}`);
      return [];
    }
    const j = (await res.json()) as BraveResponse;
    return j.web?.results ?? [];
  } catch (e) {
    if (debug) console.warn(`      Brave: ${(e as Error).message}`);
    return [];
  }
}

async function runBraveDiscovery(count: number, apiKey: string, debug: boolean): Promise<Map<string, { title: string; queries: string[] }>> {
  const map = new Map<string, { title: string; queries: string[] }>();
  for (const q of KEYWORDS) {
    console.log(`  · Brave: "${q}"...`);
    const results = await braveSearch(q, count, apiKey, debug);
    console.log(`      → ${results.length} Ergebnisse`);
    for (const r of results) {
      if (!r.url) continue;
      const d = normalizeDomain(r.url);
      if (!d) continue;
      if (BLACKLIST_DOMAINS.has(d)) continue;
      if (!/\.[a-z]{2,}$/i.test(d)) continue;
      const entry = map.get(d) ?? { title: (r.title ?? "").slice(0, 120), queries: [] };
      if (!entry.queries.includes(q)) entry.queries.push(q);
      if (!entry.title && r.title) entry.title = r.title.slice(0, 120);
      map.set(d, entry);
    }
    // Free tier: 1 req/sec — Politeness
    await new Promise((r) => setTimeout(r, 1200));
  }
  return map;
}

// --- HTTP-Verifikation ---

async function isDomainAlive(domain: string): Promise<{ ok: boolean; url: string }> {
  for (const prefix of ["https://www.", "https://"]) {
    const url = `${prefix}${domain}`;
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(6000),
        redirect: "follow",
      });
      if (r.ok || r.status < 400) return { ok: true, url: r.url || url };
    } catch {}
  }
  return { ok: false, url: `https://${domain}` };
}

// --- Playwright-Enrichment ---

type Enriched = {
  domain: string;
  finalUrl: string;
  companyName: string;
  email: string;
  emailsExtra: string;
  phone: string;
  impressumUrl: string;
  error: string;
};

const EMAIL_RE = /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
const PHONE_RE = /(?:\+49|0)\s*[\d][\d\s\-/()]{6,20}\d/g;
const BAD_EMAIL_HOSTS = ["sentry.io", "example.com", "wixpress.com", "wp.com", "domain.de", "gmail.com", "gmx.de", "web.de"];

function collectEmails(html: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(EMAIL_RE)) {
    const email = m[1].toLowerCase();
    if (BAD_EMAIL_HOSTS.some((h) => email.endsWith(h))) continue;
    if (email.endsWith(".png") || email.endsWith(".jpg") || email.endsWith(".svg")) continue;
    found.add(email);
  }
  const obf = /\b([A-Z0-9._%+-]+)\s*(?:\[at\]|\(at\))\s*([A-Z0-9.-]+)\s*(?:\[dot\]|\(dot\))\s*([A-Z]{2,})\b/gi;
  for (const m of html.matchAll(obf)) {
    found.add(`${m[1]}@${m[2]}.${m[3]}`.toLowerCase());
  }
  return [...found];
}

function collectPhones(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(PHONE_RE)) {
    const cleaned = m[0].replace(/\s+/g, " ").trim();
    if (cleaned.replace(/\D/g, "").length >= 8) found.add(cleaned);
  }
  return [...found];
}

async function findImpressumLink(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const priority = ["impressum", "kontakt", "ueber-uns", "ueber_uns", "team"];
    for (const p of priority) {
      for (const a of anchors as HTMLAnchorElement[]) {
        if (a.href && new RegExp(p, "i").test(a.href)) {
          try { return new URL(a.href, document.baseURI).toString(); } catch { return a.href; }
        }
      }
    }
    return null;
  }).catch(() => null);
}

async function enrichSite(browser: Browser, homeUrl: string, debug: boolean): Promise<Enriched> {
  const result: Enriched = {
    domain: normalizeDomain(homeUrl),
    finalUrl: homeUrl,
    companyName: "",
    email: "",
    emailsExtra: "",
    phone: "",
    impressumUrl: "",
    error: "",
  };
  const ctx = await browser.newContext({ userAgent: USER_AGENT, locale: "de-DE" });
  await ctx.route("**/*", (route) => {
    const t = route.request().resourceType();
    if (["image", "font", "media"].includes(t)) return route.abort();
    return route.continue();
  });
  const page = await ctx.newPage();
  try {
    await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(400);
    result.finalUrl = page.url();
    const homeHtml = await page.content();
    const t = homeHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (t) result.companyName = t[1].split(/\s*[|\/–—-]\s*/)[0].trim().slice(0, 80);

    let emails = collectEmails(homeHtml);
    let phones = collectPhones(homeHtml.replace(/<[^>]+>/g, " "));

    const imp = await findImpressumLink(page);
    if (imp) {
      result.impressumUrl = imp;
      try {
        await page.goto(imp, { waitUntil: "domcontentloaded", timeout: 12000 });
        await page.waitForTimeout(300);
        const impHtml = await page.content();
        emails = [...new Set([...emails, ...collectEmails(impHtml)])];
        phones = [...new Set([...phones, ...collectPhones(impHtml.replace(/<[^>]+>/g, " "))])];
      } catch (e) {
        if (debug) console.warn(`      impressum load fail: ${(e as Error).message.slice(0, 60)}`);
      }
    }

    if (emails.length > 0) { result.email = emails[0]; result.emailsExtra = emails.slice(1, 10).join("; "); }
    if (phones.length > 0) result.phone = phones[0];
  } catch (e) {
    result.error = (e as Error).message.slice(0, 100);
  } finally {
    await ctx.close();
  }
  return result;
}

// --- Main ---

async function main() {
  const args = parseArgs(process.argv);
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey && !args.skipSerp) {
    console.error("FEHLER: BRAVE_API_KEY nicht gesetzt.");
    console.error("Registrieren auf https://api.search.brave.com, dann:");
    console.error("  export BRAVE_API_KEY=\"dein-key\"");
    console.error("  npm run scrape:pkv-204-v3");
    process.exit(1);
  }
  console.log(`PKV-204 v3 (Brave API) · concurrency=${args.concurrency} · count=${args.count}`);

  // 1) Seed
  console.log(`\n[1/5] Seed-Liste...`);
  const seed = await loadSeedList(SEED_PATH);
  console.log(`  ${seed.length} verifizierte Firmen`);

  // 2) Brave-Discovery
  const signals = new Map<string, { title: string; queries: string[] }>();
  if (!args.skipSerp && apiKey) {
    console.log(`\n[2/5] Brave-Discovery ${KEYWORDS.length} Queries × ${args.count} Results...`);
    const braveMap = await runBraveDiscovery(args.count, apiKey, args.debug);
    for (const [d, v] of braveMap) signals.set(d, v);
    console.log(`  Total: ${signals.size} eindeutige Domains`);
  } else {
    console.log(`\n[2/5] SERP übersprungen`);
  }

  // Seed hinzufügen
  for (const s of seed) {
    const d = normalizeDomain(s.website ?? "");
    if (!d) continue;
    const entry = signals.get(d) ?? { title: s.name, queries: [] };
    if (!entry.queries.includes(`seed:${s.name}`)) entry.queries.push(`seed:${s.name}`);
    signals.set(d, entry);
  }

  // 3) HTTP-Verify
  console.log(`\n[3/5] HTTP-Verifikation von ${signals.size} Domains...`);
  const alive: { domain: string; url: string; title: string; queries: string[] }[] = [];
  const domainsArr = [...signals.keys()];
  let vDone = 0;
  const vWorkers = Array.from({ length: 6 }, async () => {
    while (vDone < domainsArr.length) {
      const idx = vDone++;
      const d = domainsArr[idx];
      const res = await isDomainAlive(d);
      if (res.ok) {
        const s = signals.get(d)!;
        alive.push({ domain: d, url: res.url, title: s.title, queries: s.queries });
      }
      if (vDone % 25 === 0) console.log(`  · ${vDone}/${domainsArr.length}`);
    }
  });
  await Promise.all(vWorkers);
  console.log(`  ${alive.length} lebende Domains`);

  // 4) Playwright-Enrichment
  let enriched: Enriched[] = [];
  if (!args.skipEnrich) {
    console.log(`\n[4/5] Playwright-Enrichment ${alive.length} Sites (concurrency=${args.concurrency})...`);
    const browser = await chromium.launch({ headless: true });
    try {
      let done = 0;
      enriched = new Array(alive.length);
      const eWorkers = Array.from({ length: args.concurrency }, async () => {
        while (done < alive.length) {
          const idx = done++;
          const a = alive[idx];
          enriched[idx] = await enrichSite(browser, a.url, args.debug);
          if (done % 10 === 0) console.log(`  · ${done}/${alive.length} (${a.domain} → email:${enriched[idx].email ? "y" : "n"})`);
        }
      });
      await Promise.all(eWorkers);
    } finally {
      await browser.close();
    }
  }

  // 5) CSV
  console.log(`\n[5/5] Schreibe ${OUTPUT_PATH}...`);
  const rows = alive.map((a, i) => {
    const e = enriched[i] ?? { companyName: "", email: "", emailsExtra: "", phone: "", impressumUrl: "", error: "" };
    return {
      domain: a.domain,
      companyName: e.companyName || a.title,
      email: e.email,
      emailsExtra: e.emailsExtra,
      phone: e.phone,
      website: a.url,
      impressumUrl: e.impressumUrl,
      signals: a.queries.join("; "),
      isSeed: a.queries.some((q) => q.startsWith("seed:")) ? "ja" : "",
      queryHits: String(a.queries.filter((q) => !q.startsWith("seed:")).length),
      error: e.error,
    };
  });

  rows.sort((a, b) => {
    if (a.isSeed !== b.isSeed) return a.isSeed ? -1 : 1;
    const av = a.email ? 0 : 1;
    const bv = b.email ? 0 : 1;
    if (av !== bv) return av - bv;
    return parseInt(b.queryHits, 10) - parseInt(a.queryHits, 10);
  });

  await writeCsv(OUTPUT_PATH, rows);
  const withEmail = rows.filter((r) => r.email).length;
  const withPhone = rows.filter((r) => r.phone).length;
  const seedCount = rows.filter((r) => r.isSeed).length;
  console.log(`  ✓ ${rows.length} Zeilen (${seedCount} Seed · ${rows.length - seedCount} Brave-neu)`);
  console.log(`\nSummary: ${rows.length} · ${withEmail} mit Email · ${withPhone} mit Telefon`);
}

async function writeCsv(path: string, rows: Array<Record<string, string>>) {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const headers = ["domain", "companyName", "email", "emailsExtra", "phone", "website", "impressumUrl", "signals", "queryHits", "isSeed", "error"];
  const escape = (v: string) => {
    if (v.includes('"') || v.includes(",") || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => escape(String(r[h] ?? ""))).join(","));
  await mkdir("data", { recursive: true });
  await writeFile(path, lines.join("\n") + "\n", "utf8");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
