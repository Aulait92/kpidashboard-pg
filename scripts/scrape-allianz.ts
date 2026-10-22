/**
 * Allianz Agenturen Scraper.
 *
 * Quelle: https://vertretung.allianz.de/sitemap.xml (robots.txt: explicit allow)
 * Jede Agentur-Seite enthält JSON-LD mit @type: InsuranceAgency —
 * daraus Name, E-Mail, Telefon, Adresse, Rating.
 *
 * Erwartung: ~6500 Agenturen, ~3-5 min bei concurrency 20.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";

const SITEMAP_URL = "https://vertretung.allianz.de/sitemap.xml";
const OUTPUT_PATH = "data/allianz-agenturen.csv";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type Agent = {
  url: string;
  name: string;
  email: string;
  phone: string;
  fax: string;
  street: string;
  zip: string;
  city: string;
  openingHours: string;
  ratingValue: string;
  ratingCount: string;
  description: string;
};

async function fetchText(url: string, timeoutMs = 30000): Promise<string | null> {
  // Node fetch's TLS fingerprint is blocked by Cloudflare on vertretung.allianz.de,
  // so shell out to curl which uses OpenSSL and reads as a browser.
  return new Promise((resolve) => {
    const child = spawn("curl", [
      "-s", "-L", "--compressed",
      "--max-time", String(Math.ceil(timeoutMs / 1000)),
      "-A", USER_AGENT,
      "-H", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "-H", "Accept-Language: de-DE,de;q=0.9,en;q=0.5",
      url,
    ], { stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.on("close", (code) => {
      if (code !== 0 && chunks.length === 0) return resolve(null);
      const text = Buffer.concat(chunks).toString("utf8");
      resolve(text || null);
    });
    child.on("error", () => resolve(null));
  });
}

function parseSitemap(xml: string): string[] {
  const urls: string[] = [];
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const u = m[1].trim();
    if (u.startsWith("https://vertretung.allianz.de/") && u !== "https://vertretung.allianz.de/") {
      urls.push(u);
    }
  }
  return [...new Set(urls)];
}

function extractAgency(html: string, url: string): Agent | null {
  // Find all application/ld+json scripts
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(scriptRe)) {
    const raw = m[1].trim();
    if (!raw.includes("InsuranceAgency")) continue;
    let obj: any;
    try {
      obj = JSON.parse(raw);
    } catch {
      continue;
    }
    const nodes = Array.isArray(obj) ? obj : [obj];
    for (const node of nodes) {
      if (node?.["@type"] !== "InsuranceAgency") continue;
      const addr = node.address ?? {};
      const rating = node.aggregateRating ?? {};
      return {
        url,
        name: String(node.name ?? "").trim(),
        email: String(node.email ?? "").trim(),
        phone: String(node.telePhone ?? node.telephone ?? "").trim(),
        fax: String(node.faxNumber ?? "").trim(),
        street: String(addr.streetAddress ?? "").trim(),
        zip: String(addr.postalCode ?? "").trim(),
        city: String(addr.addressLocality ?? "").trim(),
        openingHours: String(node.openingHours ?? "").trim(),
        ratingValue: String(rating.ratingValue ?? "").trim(),
        ratingCount: String(rating.ratingCount ?? "").trim(),
        description: String(node.description ?? "").trim().slice(0, 300),
      };
    }
  }
  return null;
}

function esc(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

async function main() {
  const concurrency = Number(process.env.CONCURRENCY ?? 20);
  console.log(`Allianz Agenturen Scraper · concurrency=${concurrency}`);

  console.log(`\n[1/3] Sitemap laden...`);
  const xml = await fetchText(SITEMAP_URL);
  if (!xml) { console.error("Sitemap konnte nicht geladen werden"); process.exit(1); }
  const urls = parseSitemap(xml);
  console.log(`  ${urls.length} Agentur-URLs`);

  console.log(`\n[2/3] JSON-LD extrahieren...`);
  const agents: (Agent | null)[] = new Array(urls.length);
  let done = 0;
  let ok = 0;
  let failed = 0;
  const t0 = Date.now();
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < urls.length) {
      const i = cursor++;
      const url = urls[i];
      const html = await fetchText(url);
      done++;
      if (!html) { failed++; continue; }
      const a = extractAgency(html, url);
      agents[i] = a;
      if (a) ok++;
      if (done % 100 === 0) {
        const elapsed = (Date.now() - t0) / 1000;
        const rate = done / elapsed;
        const eta = (urls.length - done) / rate;
        console.log(`  ${done}/${urls.length} · ok=${ok} · fail=${failed} · ${rate.toFixed(1)}/s · ETA ${eta.toFixed(0)}s`);
      }
    }
  });
  await Promise.all(workers);

  console.log(`\n[3/3] CSV schreiben...`);
  const found = agents.filter((a): a is Agent => a !== null);

  // Dedupe (should already be unique, but just in case same email + address)
  const seen = new Set<string>();
  const unique: Agent[] = [];
  for (const a of found) {
    const key = `${a.email}|${a.name}|${a.zip}|${a.street}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(a);
  }

  unique.sort((a, b) => a.zip.localeCompare(b.zip) || a.name.localeCompare(b.name));

  const headers = ["name", "email", "phone", "fax", "street", "zip", "city", "ratingValue", "ratingCount", "openingHours", "url", "description"];
  const lines = [headers.join(",")];
  for (const a of unique) {
    lines.push(headers.map(h => esc((a as any)[h] ?? "")).join(","));
  }
  mkdirSync("data", { recursive: true });
  writeFileSync(OUTPUT_PATH, lines.join("\n") + "\n", "utf8");

  const withEmail = unique.filter(a => a.email).length;
  const withPhone = unique.filter(a => a.phone).length;
  console.log(`\n✓ ${unique.length} eindeutige Agenturen`);
  console.log(`  mit E-Mail: ${withEmail}`);
  console.log(`  mit Telefon: ${withPhone}`);
  console.log(`  fehlgeschlagen: ${failed}`);
  console.log(`  Output: ${OUTPUT_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
