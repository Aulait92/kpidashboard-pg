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
      const before = await page.locator('a[href^="/gsbiz/"]').count();
      await btn.scrollIntoViewIfNeeded();
      await btn.click({ timeout: 5_000 });
      // Wait until card count grows or 5s elapsed
      const grew = await page
        .waitForFunction(
          (n) => document.querySelectorAll('a[href^="/gsbiz/"]').length > n,
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
  return page.$$eval('a[href^="/gsbiz/"]', (anchors) => {
    // Each anchor wraps a listing. Walk up to find the card root if the anchor
    // itself is just the title; gelbeseiten currently uses the anchor as the
    // card wrapper, so we use it directly.
    const seen = new Set<string>();
    const out: { detailUrl: string; text: string; externalLinks: string[] }[] = [];
    for (const a of anchors as HTMLAnchorElement[]) {
      const href = a.getAttribute("href") ?? "";
      if (!href.startsWith("/gsbiz/")) continue;
      if (seen.has(href)) continue;
      seen.add(href);

      // Pick the "card root" — climb up until parent has multiple children
      // (i.e. siblings beyond just this anchor), but never beyond <body>.
      let root: HTMLElement = a;
      for (let i = 0; i < 4; i++) {
        if (root.parentElement && root.parentElement.tagName !== "BODY") {
          root = root.parentElement;
        } else break;
      }

      const text = (root.innerText ?? "").trim();
      const externalLinks = Array.from(root.querySelectorAll("a[href^='http']"))
        .map((el) => (el as HTMLAnchorElement).href)
        .filter((u) => !u.includes("gelbeseiten.de"));

      out.push({ detailUrl: `https://www.gelbeseiten.de${href}`, text, externalLinks });
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
): Promise<RawListing[]> {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "de-DE",
    viewport: { width: 1280, height: 900 },
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

  try {
    await page.waitForSelector('a[href^="/gsbiz/"]', { timeout: 10_000 });
  } catch {
    console.warn(`  ! no listing cards found on first load`);
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
  const listings: RawListing[] = [];
  for (const card of cards) {
    const l = parseCard(card, city, url);
    if (l) listings.push(l);
  }

  await context.close();
  return listings;
}

export async function scrapeGelbeseiten(
  browser: Browser,
  cities: string[],
  query: string = "Versicherungsmakler",
  maxLoadMoreClicks: number = 3,
): Promise<RawListing[]> {
  const out: RawListing[] = [];
  for (const city of cities) {
    console.log(`  · gelbeseiten: ${query} in ${city}`);
    const listings = await scrapeCity(browser, city, query, maxLoadMoreClicks);
    console.log(`    → ${listings.length} listings`);
    out.push(...listings);
  }
  return out;
}
