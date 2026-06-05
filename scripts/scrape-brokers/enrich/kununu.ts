import type { Browser } from "playwright";

export type KununuEnrichment = {
  employeesEstimate: number | null;
  sourceUrl?: string;
};

// Kununu shows size as ranges like "51-500 Mitarbeiter". We pick the
// lower bound — conservative but matches "≥30" semantics.
const SIZE_RANGE_REGEX =
  /(\d{1,3}(?:\.\d{3})?)\s*[-–]\s*(\d{1,3}(?:\.\d{3})?)\s*(?:Mitarbeiter|Mitarbeitende|Beschäftigte|Angestellte)/i;
const SIZE_PLUS_REGEX =
  /(\d{1,3}(?:\.\d{3})?)\s*\+\s*(?:Mitarbeiter|Mitarbeitende|Beschäftigte)/i;

function parseNum(s: string): number {
  return parseInt(s.replace(/\./g, ""), 10);
}

/**
 * Best-effort Kununu lookup. Fails quietly — Kununu has bot detection,
 * so this is treated as a bonus signal, not a hard dependency.
 */
export async function enrichFromKununu(
  browser: Browser,
  name: string,
): Promise<KununuEnrichment> {
  // Trim corporate suffixes for cleaner search
  const cleaned = name
    .replace(/\b(GmbH|AG|KG|OHG|UG|e\.K\.?|mbH|& Co\.?|Co\.?|KGaA)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length < 3) return { employeesEstimate: null };

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "de-DE",
  });
  const page = await context.newPage();

  try {
    const searchUrl = `https://www.kununu.com/de/search?q=${encodeURIComponent(cleaned)}`;
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(800);

    // Find first company profile link. Kununu profile slugs typically live at
    // /de/<slug> — exclude search/filter/static pages.
    const firstProfileUrl = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[];
      const EXCLUDE = /\/de\/(search|companies|jobs|gehalt|kultur|bewerbung|impressum|datenschutz|agb|kontakt|presse|about|hilfe|login|register)\b/i;
      for (const a of anchors) {
        const path = a.getAttribute("href") ?? "";
        if (!/^\/de\/[a-z0-9][a-z0-9\-]+\/?$/i.test(path)) continue;
        if (EXCLUDE.test(path)) continue;
        return new URL(path, location.origin).toString();
      }
      return null;
    });

    if (!firstProfileUrl) {
      await context.close();
      return { employeesEstimate: null };
    }

    await page.goto(firstProfileUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(600);
    const text = await page.evaluate(() => document.body?.innerText ?? "");

    const range = text.match(SIZE_RANGE_REGEX);
    if (range) {
      const lo = parseNum(range[1]);
      await context.close();
      return { employeesEstimate: lo, sourceUrl: firstProfileUrl };
    }
    const plus = text.match(SIZE_PLUS_REGEX);
    if (plus) {
      const n = parseNum(plus[1]);
      await context.close();
      return { employeesEstimate: n, sourceUrl: firstProfileUrl };
    }

    await context.close();
    return { employeesEstimate: null };
  } catch {
    await context.close().catch(() => {});
    return { employeesEstimate: null };
  }
}
