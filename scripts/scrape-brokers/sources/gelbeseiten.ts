import type { Browser } from "playwright";
import type { RawListing } from "../types.ts";

const BASE = "https://www.gelbeseiten.de";

type PageJson = {
  name?: string;
  telephone?: string;
  url?: string;
  address?: {
    streetAddress?: string;
    postalCode?: string;
    addressLocality?: string;
  };
};

function pickListingsFromJsonLd(jsonLdBlocks: string[]): PageJson[] {
  const out: PageJson[] = [];
  for (const raw of jsonLdBlocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const c of candidates) {
      if (!c || typeof c !== "object") continue;
      const obj = c as Record<string, unknown>;
      const type = obj["@type"];
      const typeStr = Array.isArray(type) ? type.join(",") : String(type ?? "");
      if (!/LocalBusiness|Organization|Place|FinancialService/i.test(typeStr)) continue;
      out.push(obj as PageJson);
    }
  }
  return out;
}

async function scrapeCityPage(
  browser: Browser,
  city: string,
  query: string,
  maxPages: number,
): Promise<RawListing[]> {
  const results: RawListing[] = [];
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "de-DE",
  });
  const page = await context.newPage();

  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const url = `${BASE}/suche/${encodeURIComponent(query)}/${encodeURIComponent(city)}?umkreis=10&seite=${pageNum}`;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    } catch (err) {
      console.warn(`  ! gelbeseiten ${city} p${pageNum} navigation failed: ${(err as Error).message}`);
      break;
    }

    try {
      await page.waitForSelector("article, [data-testid='gs-result-list-item'], script[type='application/ld+json']", {
        timeout: 10_000,
      });
    } catch {
      // empty page — bail
      break;
    }

    const jsonLdBlocks = await page.$$eval(
      "script[type='application/ld+json']",
      (els) => els.map((e) => e.textContent ?? ""),
    );
    const listings = pickListingsFromJsonLd(jsonLdBlocks);

    if (listings.length === 0) {
      // No structured data on this page → stop paginating
      break;
    }

    for (const l of listings) {
      if (!l.name) continue;
      results.push({
        name: l.name,
        street: l.address?.streetAddress,
        zip: l.address?.postalCode,
        city: l.address?.addressLocality ?? city,
        phone: l.telephone,
        website: l.url,
        source: "gelbeseiten.de",
        sourceUrl: url,
      });
    }

    // light politeness delay
    await page.waitForTimeout(800);
  }

  await context.close();
  return results;
}

export async function scrapeGelbeseiten(
  browser: Browser,
  cities: string[],
  query: string = "Versicherungsmakler",
  maxPagesPerCity: number = 3,
): Promise<RawListing[]> {
  const out: RawListing[] = [];
  for (const city of cities) {
    console.log(`  · gelbeseiten: ${query} in ${city}`);
    const listings = await scrapeCityPage(browser, city, query, maxPagesPerCity);
    console.log(`    → ${listings.length} listings`);
    out.push(...listings);
  }
  return out;
}
