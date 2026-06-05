import type { Browser, Page } from "playwright";

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

// Anti-obfuscation: "info (at) example (dot) de", "info[at]example.de"
const OBFUSCATED_EMAIL_REGEX =
  /\b([A-Z0-9._%+-]+)\s*(?:\[at\]|\(at\)|\s+at\s+|@)\s*([A-Z0-9.-]+)\s*(?:\[dot\]|\(dot\)|\s+dot\s+|\.)\s*([A-Z]{2,})\b/gi;

const SUBPAGE_KEYWORDS: { kind: "impressum" | "kontakt" | "team"; needles: string[] }[] = [
  { kind: "impressum", needles: ["impressum", "imprint"] },
  { kind: "kontakt", needles: ["kontakt", "contact"] },
  { kind: "team", needles: ["team", "ueber-uns", "über-uns", "ueberuns", "unternehmen", "mitarbeiter", "wir-ueber-uns"] },
];

const BAD_EMAIL_DOMAINS = ["sentry.io", "wixpress.com", "example.com", "domain.de"];

function isUsefulEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (BAD_EMAIL_DOMAINS.some((d) => lower.endsWith(d))) return false;
  if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".svg")) return false;
  return true;
}

function extractEmails(html: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(EMAIL_REGEX)) {
    if (isUsefulEmail(m[0])) found.add(m[0].toLowerCase());
  }
  for (const m of html.matchAll(OBFUSCATED_EMAIL_REGEX)) {
    const email = `${m[1]}@${m[2]}.${m[3]}`.toLowerCase();
    if (isUsefulEmail(email)) found.add(email);
  }
  return [...found];
}

const PHONE_REGEX = /(?:\+49|0)[\s\-/()]*\d[\d\s\-/()]{6,18}\d/g;

function extractPhones(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(PHONE_REGEX)) {
    const cleaned = m[0].replace(/[^\d+]/g, "");
    if (cleaned.length >= 8 && cleaned.length <= 20) found.add(m[0].trim());
  }
  return [...found];
}

async function findSubpages(
  page: Page,
  baseUrl: string,
): Promise<{ impressum?: string; kontakt?: string; team?: string }> {
  const links = await page.$$eval("a[href]", (as) =>
    as.map((a) => ({
      href: (a as HTMLAnchorElement).href,
      text: (a.textContent ?? "").trim().toLowerCase(),
    })),
  );

  const baseHost = new URL(baseUrl).hostname;
  const result: { impressum?: string; kontakt?: string; team?: string } = {};

  for (const { kind, needles } of SUBPAGE_KEYWORDS) {
    if (result[kind]) continue;
    for (const link of links) {
      try {
        const u = new URL(link.href);
        if (u.hostname !== baseHost) continue;
        const haystack = `${u.pathname.toLowerCase()} ${link.text}`;
        if (needles.some((n) => haystack.includes(n))) {
          result[kind] = u.toString();
          break;
        }
      } catch {
        // skip invalid
      }
    }
  }
  return result;
}

async function safeGoto(page: Page, url: string): Promise<string | null> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    return await page.content();
  } catch {
    return null;
  }
}

// Patterns matching German team-size statements. Two shapes:
//   "ein Team von 30 Mitarbeitern", "wir sind über 50 Berater"
//   "30 Mitarbeiter betreuen Sie", "über 50 Beschäftigte"
const TEAM_PHRASES = [
  /\b(?:ein\s+team\s+von\s+(?:über\s+|mehr\s+als\s+)?|wir\s+sind\s+(?:über\s+|mehr\s+als\s+)?|mit\s+(?:über\s+|mehr\s+als\s+)?|rund\s+|ca\.?\s+|circa\s+|etwa\s+)(\d{2,4})\s+(?:mitarbeiter|mitarbeitende|mitarbeiterinnen|mitarbeitern|kolleg|berater|expert|spezialist|beschäftigt|köpfe|personen)/gi,
  /\b(?:über|mehr\s+als|rund|ca\.?|etwa|circa)\s+(\d{2,4})\s+(?:mitarbeiter|mitarbeitende|berater|kolleg|beschäftigt|köpfe|spezialist|expert)/gi,
  /\b(\d{2,4})\s*\+\s*(?:mitarbeiter|mitarbeitende|berater|kolleg|spezialist)/gi,
  /\b(\d{2,4})\s+(?:mitarbeiter|mitarbeitende|berater|kolleg|beschäftigt|spezialist|expert)\s+(?:an|in|bei|für|betreuen|kümmern|stehen|arbeiten)/gi,
];

function estimateFromText(text: string): number | null {
  let max = 0;
  for (const re of TEAM_PHRASES) {
    for (const m of text.matchAll(re)) {
      const n = parseInt(m[1], 10);
      if (n > max && n < 10000) max = n;
    }
  }
  return max > 0 ? max : null;
}

// Proxy: count distinct local-parts of emails sharing the same domain.
// e.g. info@, kontakt@, vorname.nachname@ → if 6 distinct local parts on the
// same domain, the org likely has at least that many people.
function estimateFromEmailDiversity(emails: string[]): number | null {
  const byDomain = new Map<string, Set<string>>();
  for (const e of emails) {
    const parts = e.split("@");
    if (parts.length !== 2) continue;
    const [local, domain] = parts;
    // Skip role accounts that don't imply a person
    if (/^(info|kontakt|hello|service|office|hallo|mail|post|empfang|sekretariat|reception|noreply|no-reply|admin|webmaster|datenschutz|impressum|presse|karriere|jobs)$/i.test(local)) continue;
    if (!byDomain.has(domain)) byDomain.set(domain, new Set());
    byDomain.get(domain)!.add(local.toLowerCase());
  }
  let max = 0;
  for (const set of byDomain.values()) if (set.size > max) max = set.size;
  return max >= 3 ? max : null;
}

async function estimateFromTeamPage(page: Page): Promise<number | null> {
  const counts = await page.evaluate(() => {
    const SELECTORS = [
      // Explicit team containers
      '[class*="team" i] [class*="member" i]',
      '[class*="team" i] [class*="card" i]',
      '[class*="team" i] figure',
      '[class*="team" i] article',
      '[class*="mitarbeiter" i] > *',
      '[class*="staff" i] > *',
      '[class*="person" i]',
      '.team img[alt]',
      // Generic person-card patterns (used by site builders)
      '[class*="employee" i]',
      '[class*="kollege" i]',
      '[class*="berater" i] [class*="card" i]',
      'section[class*="team" i] li',
      // Tile/grid systems
      'figure figcaption',
    ];
    const out: number[] = [];
    for (const sel of SELECTORS) {
      try {
        out.push(document.querySelectorAll(sel).length);
      } catch {
        out.push(0);
      }
    }

    // Heuristic 2: name + role pattern. Count h2/h3/h4 in the same section
    // that look like person names (Vorname Nachname capitalized).
    try {
      const headers = Array.from(document.querySelectorAll("h2, h3, h4, h5"));
      const personHeaders = headers.filter((h) => {
        const t = (h.textContent ?? "").trim();
        return /^[A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+){1,3}$/.test(t);
      });
      out.push(personHeaders.length);
    } catch {
      out.push(0);
    }

    return out;
  });
  const max = Math.max(0, ...counts);
  if (max >= 3 && max < 500) return max;
  return null;
}

export type WebsiteEnrichment = {
  emails: string[];
  phones: string[];
  employeesEstimate: number | null;
  employeesMethod: "team-page" | "impressum-text" | "email-diversity" | null;
  employeesSourceUrl?: string;
  error?: string;
};

export async function enrichFromWebsite(
  browser: Browser,
  website: string,
): Promise<WebsiteEnrichment> {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "de-DE",
    javaScriptEnabled: true,
  });
  const page = await context.newPage();

  const homeUrl = website.startsWith("http") ? website : `https://${website}`;
  const emails = new Set<string>();
  const phones = new Set<string>();
  let employeesEstimate: number | null = null;
  let employeesMethod: "team-page" | "impressum-text" | null = null;
  let employeesSourceUrl: string | undefined;
  let error: string | undefined;

  try {
    const homeHtml = await safeGoto(page, homeUrl);
    if (!homeHtml) {
      await context.close();
      return { emails: [], phones: [], employeesEstimate: null, employeesMethod: null, error: "home unreachable" };
    }

    extractEmails(homeHtml).forEach((e) => emails.add(e));
    const homeText = await page.evaluate(() => document.body?.innerText ?? "");
    extractPhones(homeText).forEach((p) => phones.add(p));
    const homeEstimate = estimateFromText(homeText);
    if (homeEstimate) {
      employeesEstimate = homeEstimate;
      employeesMethod = "impressum-text";
      employeesSourceUrl = page.url();
    }

    const subpages = await findSubpages(page, homeUrl);

    for (const url of [subpages.impressum, subpages.kontakt].filter(Boolean) as string[]) {
      const html = await safeGoto(page, url);
      if (!html) continue;
      extractEmails(html).forEach((e) => emails.add(e));
      const text = await page.evaluate(() => document.body?.innerText ?? "");
      extractPhones(text).forEach((p) => phones.add(p));
    }

    if (subpages.team) {
      const html = await safeGoto(page, subpages.team);
      if (html) {
        extractEmails(html).forEach((e) => emails.add(e));
        const text = await page.evaluate(() => document.body?.innerText ?? "");
        const teamCount = await estimateFromTeamPage(page);
        if (teamCount && (employeesEstimate === null || teamCount > employeesEstimate)) {
          employeesEstimate = teamCount;
          employeesMethod = "team-page";
          employeesSourceUrl = subpages.team;
        }
        const textEstimate = estimateFromText(text);
        if (textEstimate && (employeesEstimate === null || textEstimate > employeesEstimate)) {
          employeesEstimate = textEstimate;
          employeesMethod = "impressum-text";
          employeesSourceUrl = subpages.team;
        }
      }
    }
  } catch (err) {
    error = (err as Error).message;
  }

  // Email-diversity proxy: only use as fallback if nothing else found a number
  if (employeesEstimate === null) {
    const emailEstimate = estimateFromEmailDiversity([...emails]);
    if (emailEstimate !== null) {
      employeesEstimate = emailEstimate;
      employeesMethod = "email-diversity";
      employeesSourceUrl = homeUrl;
    }
  }

  await context.close();
  return {
    emails: [...emails],
    phones: [...phones],
    employeesEstimate,
    employeesMethod,
    employeesSourceUrl,
    error,
  };
}
