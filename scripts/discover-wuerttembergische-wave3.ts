/**
 * Württembergische Discovery Wave 3 — mine the bundesland/stadt list pages.
 *
 * 62 list URLs from the beratersuche page occasionally return a full
 * 50-350 KB listing. Retry each one up to 30 times, extract every
 * `/versicherungen/<slug>` link, and merge into wue-slugs cache.
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

const SLUG_CACHE = "/tmp/claude-0/-home-user-kpidashboard-pg/9fc4aee2-fbf2-5bdd-9953-a78fd84db27c/scratchpad/wue-slugs.json";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);

function fetchText(url: string, timeoutMs = 20000): Promise<string | null> {
  return new Promise(resolve => {
    const child = spawn("curl", [
      "-s", "--compressed", "--max-time", String(Math.ceil(timeoutMs / 1000)),
      "-A", USER_AGENT,
      "-H", "Accept: text/html,application/xhtml+xml",
      "-H", "Accept-Language: de-DE,de;q=0.9",
      url,
    ], { stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.on("close", c => {
      if (c !== 0 && chunks.length === 0) return resolve(null);
      resolve(Buffer.concat(chunks).toString("utf8") || null);
    });
    child.on("error", () => resolve(null));
  });
}

async function fetchListPage(url: string, attempts = 30): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const html = await fetchText(url);
    if (html && html.length > 20000) return html;
    await new Promise(r => setTimeout(r, 1500 + Math.random() * 2000));
  }
  return null;
}

async function discoverListUrls(): Promise<string[]> {
  for (let i = 0; i < 20; i++) {
    const html = await fetchText("https://www.wuerttembergische.de/versicherungen/beratersuche/");
    if (html && html.length > 20000) {
      const set = new Set<string>();
      for (const m of html.matchAll(/href="(\/versicherungen\/(?:bundesland|stadt)\/[a-z0-9-]+\/)"/g)) {
        set.add("https://www.wuerttembergische.de" + m[1]);
      }
      return [...set];
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  return [];
}

function extractSlugs(html: string): string[] {
  const set = new Set<string>();
  for (const m of html.matchAll(/\/versicherungen\/([a-z0-9._-]+)(?:\/|[" ])/g)) {
    const s = m[1].toLowerCase();
    if (!["bundesland", "stadt", "beratersuche", "mein-servicebuero", "meinservicebuero"].includes(s)) {
      set.add(`https://www.wuerttembergische.de/versicherungen/${m[1]}`);
    }
  }
  return [...set];
}

async function main() {
  console.log("Discovery wave 3 — bundesland/stadt list pages");

  const found = new Set<string>(existsSync(SLUG_CACHE) ? JSON.parse(readFileSync(SLUG_CACHE, "utf8")) : []);
  console.log(`Start: ${found.size} URLs cached`);

  console.log("\n[1/2] Collecting list page URLs...");
  const listUrls = await discoverListUrls();
  console.log(`  ${listUrls.length} list pages`);

  const save = () => writeFileSync(SLUG_CACHE, JSON.stringify([...found], null, 2), "utf8");

  console.log(`\n[2/2] Scraping list pages (concurrency=${CONCURRENCY})...`);
  let done = 0;
  const t0 = Date.now();
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < listUrls.length) {
      const i = cursor++;
      const url = listUrls[i];
      const html = await fetchListPage(url);
      done++;
      if (!html) {
        console.log(`  ✗ ${url} failed after retries`);
        continue;
      }
      const slugs = extractSlugs(html);
      let added = 0;
      for (const u of slugs) { if (!found.has(u)) { found.add(u); added++; } }
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`  ✓ ${done}/${listUrls.length} +${added} (total=${found.size}, slugs on page=${slugs.length}) ${elapsed}s · ${url}`);
      if (done % 5 === 0) save();
    }
  });
  await Promise.all(workers);
  save();

  console.log(`\nFinal: ${found.size} URLs discovered`);
}

main().catch(e => { console.error(e); process.exit(1); });
