/**
 * PKV-§204 Scraper — Welle 2 (kombiniert).
 *
 * Pipeline:
 *   1. Seed-Liste (data/seed-pkv-204.json) — 8 verifizierte Kern-Firmen
 *   2. Multi-SERP-Discovery über 4 Suchmaschinen (Startpage, Ecosia, DDG, Mojeek)
 *      × 6 Fach-Keywords → ergibt viele Domain-Kandidaten
 *   3. HTTP-Verifikation aller entdeckten Domains (nur lebende behalten)
 *   4. Enrichment via Playwright (kann JS-lastige Sites) → E-Mails + Telefone
 *   5. CSV nach data/pkv-204-v2.csv
 *
 * Run: npm run scrape:pkv-204-v2
 */

import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { loadSeedList } from "./scrape-brokers/sources/seed-list.ts";
import { dedupeListings } from "./scrape-brokers/util/dedupe.ts";
import type { RawListing } from "./scrape-brokers/types.ts";

const OUTPUT_PATH = "data/pkv-204-v2.csv";
const SEED_PATH = "data/seed-pkv-204.json";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const KEYWORDS = [
  "PKV Tarifwechsel §204 Beratung",
  "PKV Optimierung Honorarberatung Deutschland",
  "PKV Beitrag senken Tarifwechsel Berater",
  "private Krankenversicherung Tarifoptimierung Anbieter",
  "PKV Beitragsoptimierung Honorarberater",
  "PKV Wechsel innerhalb Versicherung 204",
];

const BLACKLIST_DOMAINS = new Set([
  "wikipedia.org", "de.wikipedia.org", "gesetze-im-internet.de", "dejure.org",
  "pkv.de", "pkv-ombudsmann.de", "verbraucherzentrale.de", "finanztip.de",
  "stiftung-warentest.de", "check24.de", "verivox.de", "focus.de",
  "handelsblatt.com", "welt.de", "spiegel.de", "wiwo.de", "faz.net",
  "sueddeutsche.de", "tagesschau.de", "zdf.de", "ard.de", "youtube.com",
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "xing.com", "google.com", "bing.com", "duckduckgo.com", "startpage.com",
  "ecosia.org", "mojeek.com", "amazon.de", "trustpilot.com", "provenexpert.com",
  "kununu.com", "jameda.de", "sanego.de", "pflege.de", "aok.de", "tk.de",
  "barmer.de", "dak.de", "debeka.de", "signal-iduna.de", "hukcoburg.de",
  "huk.de", "allianz.de", "axa.de", "ergo.de", "dkv.com", "generali.de",
  "gothaer.de", "provinzial.com", "hansemerkur.de", "apple.com",
  "microsoft.com", "cloudflare.com", "wordpress.com", "wix.com", "jimdo.com",
  "duden.de", "wiktionary.org", "reddit.com", "quora.com", "gutefrage.net",
  "stern.de", "zeit.de", "n-tv.de", "n24.de", "welt-online.de",
]);

type Args = {
  concurrency: number;
  skipSerp: boolean;
  skipEnrich: boolean;
  max: number;
  debug: boolean;
  engines: string[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    concurrency: 4,
    skipSerp: false,
    skipEnrich: false,
    max: 0,
    debug: false,
    engines: ["startpage", "ecosia", "ddg", "mojeek"],
  };
  for (const raw of argv.slice(2)) {
    const [k, v] = raw.includes("=") ? raw.split("=", 2) : [raw, "true"];
    switch (k) {
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
      case "--engines":
        args.engines = v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        break;
      default:
        console.warn(`Unknown arg: ${k}`);
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

// --- SERP-Discovery ---

async function fetchSerp(url: string, engine: string, debug: boolean): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      if (debug) console.warn(`      ${engine}: HTTP ${res.status}`);
      return null;
    }
    const html = await res.text();
    if (html.length < 3000) {
      if (debug) console.warn(`      ${engine}: too short (${html.length}b)`);
      return null;
    }
    if (/anomaly\.js|captcha|blocked|access\s+denied/i.test(html)) {
      if (debug) console.warn(`      ${engine}: challenge`);
      return null;
    }
    return html;
  } catch (e) {
    if (debug) console.warn(`      ${engine}: ${(e as Error).message}`);
    return null;
  }
}

function extractSerpDomains(html: string, engine: string): string[] {
  const domains = new Set<string>();
  // Universeller Extraktor: alle absoluten URLs
  for (const m of html.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)) {
    let url = m[1];
    // DDG / Startpage wrapping
    const uddg = url.match(/[?&](?:uddg|url|u)=([^&]+)/);
    if (uddg) {
      try {
        url = decodeURIComponent(uddg[1]);
      } catch {}
    }
    const d = normalizeDomain(url);
    if (!d) continue;
    if (BLACKLIST_DOMAINS.has(d)) continue;
    // Domain selbst darf nicht die SE sein
    if (d.includes(engine.replace(/-/g, ""))) continue;
    // .de/.com/.org priorisieren, aber alle .xx behalten
    if (!/\.[a-z]{2,}$/i.test(d)) continue;
    domains.add(d);
  }
  return [...domains];
}

async function discoverStartpage(query: string, debug: boolean): Promise<string[]> {
  const url = `https://www.startpage.com/sp/search?query=${encodeURIComponent(query)}&cat=web&language=deutsch`;
  const html = await fetchSerp(url, "startpage", debug);
  return html ? extractSerpDomains(html, "startpage") : [];
}

async function discoverEcosia(query: string, debug: boolean): Promise<string[]> {
  const url = `https://www.ecosia.org/search?q=${encodeURIComponent(query)}`;
  const html = await fetchSerp(url, "ecosia", debug);
  return html ? extractSerpDomains(html, "ecosia") : [];
}

async function discoverDdg(query: string, debug: boolean): Promise<string[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchSerp(url, "ddg", debug);
  return html ? extractSerpDomains(html, "duckduckgo") : [];
}

async function discoverMojeek(query: string, debug: boolean): Promise<string[]> {
  const url = `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`;
  const html = await fetchSerp(url, "mojeek", debug);
  return html ? extractSerpDomains(html, "mojeek") : [];
}

async function runMultiSerp(engines: string[], debug: boolean): Promise<Map<string, string[]>> {
  const stats = new Map<string, number>();
  const domainSignals = new Map<string, string[]>();

  const dispatchers: Record<string, (q: string) => Promise<string[]>> = {
    startpage: (q) => discoverStartpage(q, debug),
    ecosia: (q) => discoverEcosia(q, debug),
    ddg: (q) => discoverDdg(q, debug),
    mojeek: (q) => discoverMojeek(q, debug),
  };

  for (const engine of engines) {
    const fn = dispatchers[engine];
    if (!fn) continue;
    stats.set(engine, 0);
    for (const q of KEYWORDS) {
      console.log(`  · ${engine}: "${q}"...`);
      const domains = await fn(q);
      console.log(`      → ${domains.length} Domains`);
      stats.set(engine, (stats.get(engine) ?? 0) + domains.length);
      for (const d of domains) {
        const sig = `${engine}:${q}`;
        const list = domainSignals.get(d) ?? [];
        if (!list.includes(sig)) list.push(sig);
        domainSignals.set(d, list);
      }
      // Politeness — hilft gegen Blocks
      await new Promise((r) => setTimeout(r, 3500 + Math.random() * 2000));
    }
  }

  console.log(`\n  SERP-Statistik: ${[...stats.entries()].map(([e, n]) => `${e}=${n}`).join(" · ")}`);
  return domainSignals;
}

// --- HTTP-Verifikation ---

async function isDomainAlive(domain: string): Promise<{ ok: boolean; url: string }> {
  const url = `https://www.${domain}`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });
    if (r.ok || r.status < 400) return { ok: true, url: r.url || url };
  } catch {
    // Try bare domain
  }
  try {
    const r = await fetch(`https://${domain}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });
    if (r.ok || r.status < 400) return { ok: true, url: r.url || `https://${domain}` };
  } catch {}
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
const BAD_EMAIL_HOSTS = ["sentry.io", "example.com", "wixpress.com", "wp.com", "domain.de"];

function collectEmails(html: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(EMAIL_RE)) {
    const email = m[1].toLowerCase();
    if (BAD_EMAIL_HOSTS.some((h) => email.endsWith(h))) continue;
    if (email.endsWith(".png") || email.endsWith(".jpg")) continue;
    found.add(email);
  }
  // Obfuskiert: name (at) domain (dot) de
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
  return page
    .evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href]"));
      const priority = ["impressum", "kontakt", "ueber-uns", "ueber_uns", "team"];
      for (const p of priority) {
        for (const a of anchors as HTMLAnchorElement[]) {
          if (a.href && new RegExp(p, "i").test(a.href)) {
            try {
              return new URL(a.href, document.baseURI).toString();
            } catch {
              return a.href;
            }
          }
        }
      }
      return null;
    })
    .catch(() => null);
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
  // Block images / fonts for speed
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

    // Titel als Company-Name Fallback
    const t = homeHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (t) result.companyName = t[1].split(/\s*[|\/–—-]\s*/)[0].trim().slice(0, 80);

    let emails = collectEmails(homeHtml);
    let phones = collectPhones(homeHtml.replace(/<[^>]+>/g, " "));

    // Impressum/Kontakt-Sub-Page laden
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

    if (emails.length > 0) {
      result.email = emails[0];
      result.emailsExtra = emails.slice(1, 10).join("; ");
    }
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
  console.log(`PKV-204 v2 · engines=${args.engines.join(",")} · concurrency=${args.concurrency}`);

  // 1) Seed
  console.log(`\n[1/5] Seed-Liste...`);
  const seed = await loadSeedList(SEED_PATH);
  console.log(`  ${seed.length} verifizierte Firmen`);

  // 2) SERP
  const signals = new Map<string, string[]>();
  if (!args.skipSerp) {
    console.log(`\n[2/5] Multi-SERP-Discovery über ${args.engines.length} Engines × ${KEYWORDS.length} Queries...`);
    const s = await runMultiSerp(args.engines, args.debug);
    for (const [d, sigs] of s) signals.set(d, sigs);
    console.log(`  Total: ${signals.size} eindeutige Domains`);
  } else {
    console.log(`\n[2/5] SERP übersprungen`);
  }

  // Add seed domains to signals
  for (const s of seed) {
    const d = normalizeDomain(s.website ?? "");
    if (d) {
      const list = signals.get(d) ?? [];
      list.push(`seed:${s.name}`);
      signals.set(d, list);
    }
  }

  // 3) HTTP-Verify
  console.log(`\n[3/5] HTTP-Verifikation von ${signals.size} Domains...`);
  const alive: { domain: string; url: string; signals: string[] }[] = [];
  const domainsArr = [...signals.keys()];
  let vDone = 0;
  const vWorkers = Array.from({ length: 6 }, async () => {
    while (vDone < domainsArr.length) {
      const idx = vDone++;
      const d = domainsArr[idx];
      const res = await isDomainAlive(d);
      if (res.ok) alive.push({ domain: d, url: res.url, signals: signals.get(d) ?? [] });
      if ((vDone) % 25 === 0) {
        console.log(`  · ${vDone}/${domainsArr.length}`);
      }
    }
  });
  await Promise.all(vWorkers);
  console.log(`  ${alive.length} lebende Domains von ${domainsArr.length}`);

  if (args.max > 0 && alive.length > args.max) {
    alive.length = args.max;
    console.log(`  Nach --max: ${alive.length}`);
  }

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
          if (done % 10 === 0) {
            console.log(`  · ${done}/${alive.length} (${a.domain} → email:${enriched[idx].email ? "y" : "n"})`);
          }
        }
      });
      await Promise.all(eWorkers);
    } finally {
      await browser.close();
    }
  } else {
    enriched = alive.map((a) => ({
      domain: a.domain,
      finalUrl: a.url,
      companyName: "",
      email: "",
      emailsExtra: "",
      phone: "",
      impressumUrl: "",
      error: "",
    }));
  }

  // 5) CSV
  console.log(`\n[5/5] Schreibe ${OUTPUT_PATH}...`);
  const rows = enriched.map((e, i) => ({
    domain: e.domain,
    companyName: e.companyName,
    email: e.email,
    emailsExtra: e.emailsExtra,
    phone: e.phone,
    website: e.finalUrl,
    impressumUrl: e.impressumUrl,
    signals: (alive[i]?.signals ?? []).join("; "),
    isSeed: (alive[i]?.signals ?? []).some((s) => s.startsWith("seed:")) ? "ja" : "",
    error: e.error,
  }));

  rows.sort((a, b) => {
    if (a.isSeed !== b.isSeed) return a.isSeed ? -1 : 1;
    const av = a.email ? 0 : 1;
    const bv = b.email ? 0 : 1;
    if (av !== bv) return av - bv;
    return a.domain.localeCompare(b.domain);
  });

  await writeCsv(OUTPUT_PATH, rows);
  const withEmail = rows.filter((r) => r.email).length;
  const withPhone = rows.filter((r) => r.phone).length;
  const seedCount = rows.filter((r) => r.isSeed).length;
  console.log(`  ✓ ${rows.length} Zeilen (${seedCount} Seed · ${rows.length - seedCount} SERP-neu)`);
  console.log(`\nSummary: ${rows.length} · ${withEmail} mit Email · ${withPhone} mit Telefon`);
}

async function writeCsv(path: string, rows: Array<Record<string, string>>) {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const headers = ["domain", "companyName", "email", "emailsExtra", "phone", "website", "impressumUrl", "signals", "isSeed", "error"];
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
