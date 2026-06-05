import type { Browser, Page } from "playwright";
import type { RawListing } from "../types.ts";

const BASE = "https://www.gelbeseiten.de";

// Phone regex (DE): matches +49…, 030 …, 089/… etc.
const PHONE_REGEX = /(?:\+49|0)[\s\-/()]*\d[\d\s\-/()]{6,18}\d/;

// Address regex: "Streetname 12, 10115 Berlin" or "Streetname 12 · 10115 Berlin"
const ADDRESS_REGEX = /([A-Za-zÄÖÜäöüß][\w.\-äöüÄÖÜß\s]+?\s+\d+[a-zA-Z]?)[\s,·•|]+(\d{5})\s+([A-Za-zÄÖÜäöüß][\w.\-äöüÄÖÜß\s]+)/;

const COOKIE_BUTTON_SELECTORS = [
  "button#cmpwelcomebtnyes",
  "button[aria-label*='Akzeptieren' i]",
  "button[aria-label*='Alle akzeptieren' i]",
  "button:has-text('Alle akzeptieren')",
  "button:has-text('Akzeptieren')",
  "button:has-text('Zustimmen')",
];

async function dismissCookieBanner(page: Page): Promise<void> {
  for (const sel of COOKIE_BUTTON_SELECTORS) {
    try {
      const btn = page.locator(sel).first();
      if ((await btn.count()) > 0) {
        await btn.click({ timeout: 2_000 });
        await page.waitForTimeout(500);
        return;
      }
    } catch {
      // try next
    }
  }
}

const LOAD_MORE_SELECTORS = [
  "button:has-text('Mehr anzeigen')",
  "button:has-text('Mehr Anzeigen')",
  "a:has-text('Mehr anzeigen')",
  "[data-testid*='load-more' i]",
  "button[class*='mehr' i]",
];

async function clickLoadMore(page: Page): Promise<boolean> {
  for (const sel of LOAD_MORE_SELECTORS) {
    try {
      const btn = page.locator(sel).first();
      if ((await btn.count()) === 0) continue;
      if (!(await btn.isVisible())) continue;
      const before = await page.locator('a[href*="/gsbiz/"]').count();
      await btn.scrollIntoViewIfNeeded();
      await btn.click({ timeout: 5_000 });
      // Wait until card count grows or 5s elapsed
      const grew = await page
        .waitForFunction(
          (n) => document.querySelectorAll('a[href*="/gsbiz/"]').length > n,
          before,
          { timeout: 5_000 },
        )
        .then(() => true)
        .catch(() => false);
      return grew;
    } catch {
      // try next
    }
  }
  return false;
}

type CardData = {
  detailUrl: string;
  text: string;
  externalLinks: string[];
};

async function extractCards(page: Page): Promise<CardData[]> {
  return page.$$eval('a[href*="/gsbiz/"]', (anchors) => {
    const seen = new Set<string>();
    const out: { detailUrl: string; text: string; externalLinks: string[] }[] = [];
    for (const a of anchors as HTMLAnchorElement[]) {
      const m = ((a.getAttribute("href") ?? "") + "").match(/\/gsbiz\/([a-f0-9-]+)/i);
      if (!m) continue;
      const uuid = m[1];
      if (seen.has(uuid)) continue;
      seen.add(uuid);

      // Pick the "card root" — climb up until parent has at least 2 children
      // (more than the bare anchor itself), so we collect siblings with
      // address, phone, website. Stop at body.
      let root: HTMLElement = a;
      for (let i = 0; i < 6; i++) {
        const parent = root.parentElement;
        if (!parent || parent.tagName === "BODY") break;
        root = parent;
        if (root.children.length >= 3 && root.innerText && root.innerText.length > 40) break;
      }

      const text = (root.innerText ?? "").trim();
      const externalLinks = Array.from(root.querySelectorAll("a[href^='http']"))
        .map((el) => (el as HTMLAnchorElement).href)
        .filter((u) => !u.includes("gelbeseiten.de"));

      out.push({ detailUrl: `https://www.gelbeseiten.de/gsbiz/${uuid}`, text, externalLinks });
    }
    return out;
  });
}

function parseCard(card: CardData, fallbackCity: string, sourceUrl: string): RawListing | null {
  const lines = card.text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  // First non-empty line is usually the business name
  const name = lines[0];
  if (!name || name.length < 2 || name.length > 200) return null;

  // Phone
  let phone: string | undefined;
  for (const line of lines) {
    const m = line.match(PHONE_REGEX);
    if (m) {
      phone = m[0].trim();
      break;
    }
  }

  // Address
  let street: string | undefined;
  let zip: string | undefined;
  let city: string = fallbackCity;
  const addrMatch = card.text.match(ADDRESS_REGEX);
  if (addrMatch) {
    street = addrMatch[1].trim();
    zip = addrMatch[2];
    city = addrMatch[3].split(/\s+/).slice(0, 3).join(" ").trim() || fallbackCity;
  }

  // Website — pick first external link
  const website = card.externalLinks[0];

  return {
    name,
    street,
    zip,
    city,
    phone,
    website,
    source: "gelbeseiten.de",
    sourceUrl,
  };
}

async function scrapeCity(
  browser: Browser,
  city: string,
  query: string,
  maxLoadMoreClicks: number,
  debug: boolean,
): Promise<RawListing[]> {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "de-DE",
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: {
      "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
    },
  });
  const page = await context.newPage();

  const url = `${BASE}/suche/${encodeURIComponent(query)}/${encodeURIComponent(city)}`;

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  } catch (err) {
    console.warn(`  ! navigation failed: ${(err as Error).message}`);
    await context.close();
    return [];
  }

  await dismissCookieBanner(page);
  // Settle network + JS
  await page.waitForTimeout(1500);
  // Scroll to trigger any lazy-loading
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(800);

  try {
    await page.waitForSelector('a[href*="/gsbiz/"]', { timeout: 10_000 });
  } catch {
    console.warn(`  ! no listing cards found on first load`);
    if (debug) await dumpDebug(page, city);
    await context.close();
    return [];
  }

  // Click "Mehr anzeigen" up to N times
  for (let i = 0; i < maxLoadMoreClicks; i++) {
    const grew = await clickLoadMore(page);
    if (!grew) break;
    await page.waitForTimeout(600);
  }

  const cards = await extractCards(page);
  if (debug) {
    console.log(`  · debug: extracted ${cards.length} raw card objects`);
    if (cards.length > 0) {
      console.log(`  · debug: first card text (first 300 chars):\n${cards[0].text.slice(0, 300)}`);
    }
  }
  const listings: RawListing[] = [];
  for (const card of cards) {
    const l = parseCard(card, city, url);
    if (l) listings.push(l);
  }

  await context.close();
  return listings;
}

async function dumpDebug(page: Page, city: string): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir("data/debug", { recursive: true });
  const slug = city.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const pngPath = `data/debug/gelbeseiten-${slug}.png`;
  const htmlPath = `data/debug/gelbeseiten-${slug}.html`;
  try {
    await page.screenshot({ path: pngPath, fullPage: true });
  } catch (err) {
    console.warn(`  · debug screenshot failed: ${(err as Error).message}`);
  }
  try {
    await writeFile(htmlPath, await page.content(), "utf8");
  } catch (err) {
    console.warn(`  · debug HTML dump failed: ${(err as Error).message}`);
  }
  const title = await page.title().catch(() => "");
  const anchorCount = await page.locator("a").count().catch(() => -1);
  const hrefs = await page
    .$$eval("a", (as) =>
      (as as HTMLAnchorElement[]).slice(0, 30).map((a) => a.getAttribute("href") ?? ""),
    )
    .catch(() => []);
  console.warn(`  · debug: title="${title}" · total anchors=${anchorCount}`);
  console.warn(`  · debug: first 30 hrefs:`);
  for (const h of hrefs) console.warn(`      ${h}`);
  console.warn(`  · debug: screenshot=${pngPath}, html=${htmlPath}`);
}

export async function scrapeGelbeseiten(
  browser: Browser,
  cities: string[],
  query: string = "Versicherungsmakler",
  maxLoadMoreClicks: number = 3,
  debug: boolean = false,
): Promise<RawListing[]> {
  const out: RawListing[] = [];
  for (const city of cities) {
    console.log(`  · gelbeseiten: ${query} in ${city}`);
    const listings = await scrapeCity(browser, city, query, maxLoadMoreClicks, debug);
    console.log(`    → ${listings.length} listings`);
    out.push(...listings);
  }
  return out;
}
