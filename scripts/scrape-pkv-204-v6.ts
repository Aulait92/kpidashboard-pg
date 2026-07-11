/**
 * PKV-§204 Scraper — Welle 6: Long-Tail + City + ProvenExpert
 *
 * - 10 Long-Tail Keywords (Beitragsentlastung, Beihilfe, Selbständige, ...)
 * - 10 City-Queries ("PKV Berater [Stadt]")
 * - 5 site:provenexpert.com Queries für strukturierte Berater-Profile
 * - Erwartung: 50-150 neue Domains nach Dedup gegen v5-Winner
 */

// no browser needed — sandbox proxy allows fetch but not headless Chromium egress

const OUTPUT_PATH = "data/pkv-204-v6.csv";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SERPER_API = "https://google.serper.dev/search";

const LONGTAIL_KEYWORDS = [
  "PKV Beitrag zu hoch was tun Berater",
  "PKV Beihilfe Tarifwechsel Beamte Berater",
  "PKV Alterungsrückstellungen optimieren Beratung",
  "PKV Selbständige Beitrag senken Honorarberater",
  "PKV Rentner Beitrag senken §204 Beratung",
  "PKV Prämie senken §204 Berater Deutschland",
  "PKV günstiger werden ohne Leistungsverzicht Beratung",
  "PKV Tarifoptimierung Honorar Berater Deutschland",
  "PKV Wechsel innerhalb Gesellschaft §204 Berater",
  "PKV Beitragserstattung Tarif wechseln Beratung",
];

const CITY_KEYWORDS = [
  "PKV Berater Berlin Tarifwechsel §204",
  "PKV Berater München Tarifwechsel §204",
  "PKV Berater Hamburg Tarifwechsel §204",
  "PKV Berater Köln Tarifwechsel §204",
  "PKV Berater Frankfurt Tarifwechsel §204",
  "PKV Berater Stuttgart Tarifwechsel §204",
  "PKV Berater Düsseldorf Tarifwechsel §204",
  "PKV Berater Leipzig Tarifwechsel §204",
  "PKV Berater Hannover Tarifwechsel §204",
  "PKV Berater Nürnberg Tarifwechsel §204",
];

const PROVENEXPERT_KEYWORDS = [
  "provenexpert PKV Tarifwechsel",
  "provenexpert PKV Optimierung Berater",
  "provenexpert Honorarberatung PKV",
  "provenexpert private Krankenversicherung Berater",
  "provenexpert Versicherungsmakler PKV §204",
];

const ALL_KEYWORDS = [...LONGTAIL_KEYWORDS, ...CITY_KEYWORDS, ...PROVENEXPERT_KEYWORDS];

const BLACKLIST_DOMAINS = new Set([
  "wikipedia.org", "de.wikipedia.org", "gesetze-im-internet.de", "dejure.org",
  "pkv.de", "pkv-ombudsmann.de", "verbraucherzentrale.de", "finanztip.de",
  "stiftung-warentest.de", "check24.de", "verivox.de", "focus.de",
  "handelsblatt.com", "welt.de", "spiegel.de", "wiwo.de", "faz.net",
  "sueddeutsche.de", "tagesschau.de", "zdf.de", "ard.de", "youtube.com",
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "xing.com", "google.com", "bing.com", "duckduckgo.com", "startpage.com",
  "ecosia.org", "brave.com", "mojeek.com", "serper.dev", "amazon.de",
  "trustpilot.com", "kununu.com", "jameda.de",
  "sanego.de", "pflege.de", "aok.de", "tk.de", "barmer.de", "dak.de",
  "debeka.de", "signal-iduna.de", "hukcoburg.de", "huk.de", "allianz.de",
  "axa.de", "ergo.de", "dkv.com", "generali.de", "gothaer.de",
  "provinzial.com", "hansemerkur.de", "reddit.com", "quora.com",
  "gutefrage.net", "stern.de", "zeit.de", "n-tv.de", "duden.de",
  "wiktionary.org", "clark.de", "ottonova.de", "continentale.de",
  "krankenkassen.de", "pfefferminzia.de", "versicherungsbote.de",
  "whofinance.de", "iww.de", "test.de", "fuer-gruender.de",
  "pkv-tarifvergleich.info", "verbraucherzentrale.bayern",
  "bundesgesundheitsministerium.de", "dhb.de", "vzhh.de",
  "anwalt.org", "anwalt-kg.de", "gr-anwalt.de", "db-anwaelte.de",
  "baumeister-kollegen.de", "akh-h.de", "rechtsanwalt24.de",
  // Bereits kontaktiert (aus Cold-Mail-Liste)
  "kvoptimal.de", "verticus-versicherungsvergleich.de", "verticus.ag",
  "schlemann.com", "pkvservice.com", "pkv-hilfe.de", "hcconsultingag.de",
  "checkfox.de", "lead-production.de", "ccm-versicherungsmakler.de",
  "cp-finanz.de", "finanzschneiderei-versicherungsmakler.de",
  "pkv-tarifwechsel-50plus.de", "pkv-lounge.de", "hoesch-partner.de",
  "drklein.de", "formaxx.de", "formaxx.ag", "mayflower-capital.de",
  "plansecur.de", "tecis.de", "finum.de", "leadsale.de", "topscout.de",
  "deutsche-honorarberatung.de", "versicherungsberater.jetzt",
  "binversichert.de", "meine-pkv-berater.de", "derfairsicherungsladen.de",
  "versicherungenmitkopf.de", "teamkrankenversicherung.de",
  "derpkvmakler.de", "risk007.de", "financedoor.de", "pkv.wiki",
  "vumak.de", "nuernberger.de", "minerva.de", "minerva-kundenrechte.de",
  "premiumcircle.de", "online-pkv.de",
  // Bereits in v5-verified übernommen (nicht nochmal enrichen)
  "pkv-welt.de", "privat-patienten.de", "pkv-kosten-senken.de",
  "kretschmerundschweiger.de", "maiwerk-finanzpartner.de", "pkvcheck360.de",
  "pkv-tarifoptimierer.de", "pkv-experten.de", "alexander-kuhlen.de",
  "boss-assekuranz.com", "pkv-profis.com", "pkvforum24.de",
  "selbststaendig-pkv.de", "pkv-tarifoptimierer24.de",
  "vorsorgewerkstatt.de", "versicherungsmakler.ac",
]);

type Args = {
  concurrency: number;
  skipSerp: boolean;
  skipEnrich: boolean;
  count: number;
  debug: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { concurrency: 4, skipSerp: false, skipEnrich: false, count: 30, debug: false };
  for (const raw of argv.slice(2)) {
    const [k, v] = raw.includes("=") ? raw.split("=", 2) : [raw, "true"];
    switch (k) {
      case "--concurrency": args.concurrency = parseInt(v, 10); break;
      case "--skip-serp": args.skipSerp = v !== "false"; break;
      case "--skip-enrich": args.skipEnrich = v !== "false"; break;
      case "--count": args.count = parseInt(v, 10); break;
      case "--debug": args.debug = v !== "false"; break;
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

type SerperResult = { link?: string; title?: string; snippet?: string };
type SerperResponse = { organic?: SerperResult[] };

async function serperSearch(query: string, count: number, apiKey: string, debug: boolean): Promise<SerperResult[]> {
  try {
    const res = await fetch(SERPER_API, {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, gl: "de", hl: "de", num: count }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      if (debug) console.warn(`  Serper HTTP ${res.status}`);
      return [];
    }
    const j = (await res.json()) as SerperResponse;
    return j.organic ?? [];
  } catch (e) {
    if (debug) console.warn(`  Serper: ${(e as Error).message}`);
    return [];
  }
}

async function runDiscovery(count: number, apiKey: string, debug: boolean): Promise<Map<string, { title: string; queries: string[]; provenExpertUrl?: string }>> {
  const map = new Map<string, { title: string; queries: string[]; provenExpertUrl?: string }>();
  for (const q of ALL_KEYWORDS) {
    console.log(`  · "${q.slice(0, 60)}..."`);
    const results = await serperSearch(q, count, apiKey, debug);
    console.log(`      → ${results.length} Ergebnisse`);
    for (const r of results) {
      if (!r.link) continue;
      const d = normalizeDomain(r.link);
      if (!d) continue;
      // ProvenExpert-Treffer: aus PE-URL versuchen die Berater-URL zu ziehen
      if (d === "provenexpert.com" || d === "www.provenexpert.com") {
        // Store as PE profile, we'll enrich to find actual site
        const key = `pe:${r.link}`
        const entry = map.get(key) ?? { title: (r.title ?? "").slice(0, 120), queries: [], provenExpertUrl: r.link };
        if (!entry.queries.includes(q)) entry.queries.push(q);
        map.set(key, entry);
        continue;
      }
      if (BLACKLIST_DOMAINS.has(d)) continue;
      if (!/\.[a-z]{2,}$/i.test(d)) continue;
      const entry = map.get(d) ?? { title: (r.title ?? "").slice(0, 120), queries: [] };
      if (!entry.queries.includes(q)) entry.queries.push(q);
      if (!entry.title && r.title) entry.title = r.title.slice(0, 120);
      map.set(d, entry);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return map;
}

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

async function resolvePEProfile(peUrl: string): Promise<{ site: string; domain: string; title: string } | null> {
  const res = await fetchHtml(peUrl, 12000);
  if (!res) return null;
  const html = res.html;
  const websiteMatch = html.match(/href="(https?:\/\/(?!(?:www\.)?provenexpert\.com)[^"]+)"[^>]*>[^<]{0,40}(?:Website|Zur\s*Website|zur\s*Homepage|Homepage|Website\s*besuchen)/i);
  let site = websiteMatch?.[1] ?? "";
  if (!site) {
    const genericLink = html.match(/data-link-external="true"\s+href="(https?:\/\/[^"]+)"/i);
    site = genericLink?.[1] ?? "";
  }
  if (!site) {
    // Fallback: extern-Link in "Kontakt" oder itemprop="url"
    const alt = html.match(/itemprop=["']url["']\s+href=["'](https?:\/\/(?!(?:www\.)?provenexpert\.com)[^"']+)["']/i);
    site = alt?.[1] ?? "";
  }
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = (titleMatch?.[1] ?? "").replace(/\s*\|.*$/i, "").trim().slice(0, 120);
  if (!site) return null;
  const domain = normalizeDomain(site);
  if (!domain || BLACKLIST_DOMAINS.has(domain)) return null;
  return { site, domain, title };
}

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
const BAD_EMAIL_HOSTS = ["sentry.io", "example.com", "wixpress.com", "wp.com", "domain.de", "gmail.com", "gmx.de", "web.de", "mysite.com", "website.com"];

function collectEmails(html: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(EMAIL_RE)) {
    const email = m[1].toLowerCase();
    if (BAD_EMAIL_HOSTS.some((h) => email.endsWith(h))) continue;
    if (/\.(png|jpg|svg|webp|gif)$/.test(email)) continue;
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
    for (const p of ["impressum", "kontakt", "ueber-uns"]) {
      for (const a of anchors as HTMLAnchorElement[]) {
        if (a.href && new RegExp(p, "i").test(a.href)) {
          try { return new URL(a.href, document.baseURI).toString(); } catch { return a.href; }
        }
      }
    }
    return null;
  }).catch(() => null);
}

async function fetchHtml(url: string, timeoutMs = 12000): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "de-DE,de;q=0.9,en;q=0.5",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") ?? "";
    if (!/text|html|xml/i.test(ct)) return null;
    const buf = await r.arrayBuffer();
    if (buf.byteLength > 3_000_000) return null;
    return { html: new TextDecoder("utf-8", { fatal: false }).decode(buf), finalUrl: r.url || url };
  } catch { return null; }
}

function findImpressumInHtml(html: string, baseUrl: string): string | null {
  // Suche href="..." + Text "Impressum"
  const linkRe = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]{1,80})<\/a>/gi;
  for (const m of html.matchAll(linkRe)) {
    if (/impressum/i.test(m[2]) || /impressum/i.test(m[1])) {
      try { return new URL(m[1], baseUrl).toString(); } catch { return m[1]; }
    }
  }
  return null;
}

async function enrichSite(homeUrl: string, debug: boolean): Promise<Enriched> {
  const result: Enriched = {
    domain: normalizeDomain(homeUrl),
    finalUrl: homeUrl,
    companyName: "", email: "", emailsExtra: "", phone: "", impressumUrl: "", error: "",
  };
  const home = await fetchHtml(homeUrl);
  if (!home) { result.error = "home fetch failed"; return result; }
  result.finalUrl = home.finalUrl;
  const t = home.html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (t) result.companyName = t[1].split(/\s*[|\/–—-]\s*/)[0].trim().slice(0, 80);

  let emails = collectEmails(home.html);
  let phones = collectPhones(home.html.replace(/<[^>]+>/g, " "));

  const imp = findImpressumInHtml(home.html, home.finalUrl);
  if (imp) {
    result.impressumUrl = imp;
    const impRes = await fetchHtml(imp, 10000);
    if (impRes) {
      emails = [...new Set([...emails, ...collectEmails(impRes.html)])];
      phones = [...new Set([...phones, ...collectPhones(impRes.html.replace(/<[^>]+>/g, " "))])];
    }
  }

  if (emails.length > 0) { result.email = emails[0]; result.emailsExtra = emails.slice(1, 10).join("; "); }
  if (phones.length > 0) result.phone = phones[0];
  return result;
}

async function main() {
  const args = parseArgs(process.argv);
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) { console.error("SERPER_API_KEY not set"); process.exit(1); }

  console.log(`PKV-204 v6 (Long-tail + City + PE) · ${ALL_KEYWORDS.length} Keywords · count=${args.count}`);

  console.log(`\n[1/5] Serper-Discovery...`);
  const raw = await runDiscovery(args.count, apiKey, args.debug);
  const peKeys = [...raw.keys()].filter(k => k.startsWith("pe:"));
  const normalKeys = [...raw.keys()].filter(k => !k.startsWith("pe:"));
  console.log(`  ${normalKeys.length} eigene Domains + ${peKeys.length} ProvenExpert-Profile`);

  // 2) PE-Profile auflösen → externe Websites finden
  const signals = new Map<string, { title: string; queries: string[]; source: string }>();
  for (const d of normalKeys) {
    const e = raw.get(d)!;
    signals.set(d, { title: e.title, queries: e.queries, source: "serp" });
  }
  console.log(`\n[2/5] Resolve ${peKeys.length} ProvenExpert-Profile...`);
  const peQueue = [...peKeys];
  const peWorkers = Array.from({ length: 4 }, async () => {
    while (peQueue.length > 0) {
      const key = peQueue.shift()
      if (!key) break;
      const e = raw.get(key)!;
      const res = await resolvePEProfile(e.provenExpertUrl!);
      if (!res) continue;
      if (BLACKLIST_DOMAINS.has(res.domain)) continue;
      const existing = signals.get(res.domain);
      if (existing) {
        for (const q of e.queries) if (!existing.queries.includes(q)) existing.queries.push(q);
      } else {
        signals.set(res.domain, { title: res.title || e.title, queries: [`provenexpert:${res.site}`, ...e.queries], source: "provenexpert" });
      }
    }
  });
  await Promise.all(peWorkers);
  console.log(`  ${signals.size} Kandidaten insgesamt`);

  // 3) HTTP-Verify
  console.log(`\n[3/5] HTTP-Verify...`);
  const alive: { domain: string; url: string; title: string; queries: string[]; source: string }[] = [];
  const domainsArr = [...signals.keys()];
  let vDone = 0;
  const vWorkers = Array.from({ length: 6 }, async () => {
    while (vDone < domainsArr.length) {
      const idx = vDone++;
      const d = domainsArr[idx];
      const res = await isDomainAlive(d);
      if (res.ok) {
        const s = signals.get(d)!;
        alive.push({ domain: d, url: res.url, title: s.title, queries: s.queries, source: s.source });
      }
    }
  });
  await Promise.all(vWorkers);
  console.log(`  ${alive.length} lebende Domains`);

  // 4) Enrich
  let enriched: Enriched[] = [];
  if (!args.skipEnrich) {
    console.log(`\n[4/5] Enrich (concurrency=${args.concurrency})...`);
    let done = 0;
    enriched = new Array(alive.length);
    const eWorkers = Array.from({ length: Math.max(args.concurrency, 6) }, async () => {
      while (done < alive.length) {
        const idx = done++;
        const a = alive[idx];
        enriched[idx] = await enrichSite(a.url, args.debug);
        if (done % 10 === 0) console.log(`  · ${done}/${alive.length}`);
      }
    });
    await Promise.all(eWorkers);
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
      queryHits: String(a.queries.filter((q) => !q.startsWith("provenexpert:")).length),
      isSeed: "",
      source: a.source,
      error: e.error,
    };
  });

  rows.sort((a, b) => {
    const av = a.email ? 0 : 1;
    const bv = b.email ? 0 : 1;
    if (av !== bv) return av - bv;
    return parseInt(b.queryHits, 10) - parseInt(a.queryHits, 10);
  });

  const { writeFile, mkdir } = await import("node:fs/promises");
  const headers = ["domain", "companyName", "email", "emailsExtra", "phone", "website", "impressumUrl", "signals", "queryHits", "isSeed", "source", "error"];
  const escape = (v: string) => v.includes('"') || v.includes(",") || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v;
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => escape(String((r as any)[h] ?? ""))).join(","));
  await mkdir("data", { recursive: true });
  await writeFile(OUTPUT_PATH, lines.join("\n") + "\n", "utf8");

  const withEmail = rows.filter((r) => r.email).length;
  const withPhone = rows.filter((r) => r.phone).length;
  const peCount = rows.filter((r) => r.source === "provenexpert").length;
  console.log(`\n✓ ${rows.length} Zeilen · ${withEmail} mit Email · ${withPhone} mit Telefon · ${peCount} via ProvenExpert`);
}

main().catch((err) => { console.error(err); process.exit(1); });
