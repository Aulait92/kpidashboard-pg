/**
 * Signal Iduna Agenturen – Scraper.
 *
 * Quelle: https://signal-iduna-agentur.de/sitemap.xml (2955 Agent-URLs)
 * Robots.txt erlaubt alles. Pro Seite extrahieren wir den Kontakt-Block
 * (Agenturtyp, Name, Straße, PLZ, Ort, Tel, Mobil, Email).
 *
 * Erwartung: ~2500+ Agenturen mit Name/Email/Telefon.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";

const SITEMAP_URL = "https://signal-iduna-agentur.de/sitemap.xml";
const OUTPUT = "data/signal-iduna-agenturen.csv";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 20);

function fetchText(url: string, timeoutMs = 20000): Promise<string | null> {
  return new Promise(resolve => {
    const child = spawn("curl", [
      "-s", "-L", "--compressed",
      "--max-time", String(Math.ceil(timeoutMs / 1000)),
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

function parseSitemap(xml: string): string[] {
  const urls: string[] = [];
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const u = m[1].trim();
    if (/signal-iduna-agentur\.de\/.+\/$/.test(u)) urls.push(u);
  }
  return [...new Set(urls)];
}

function stripTags(h: string): string {
  return h.replace(/<br\s*\/?>/gi, " | ")
          .replace(/<\/(?:div|p|section|article|li|h\d|span|a|td|tr)>/gi, " | ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
          .replace(/&uuml;/g, "ü").replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö")
          .replace(/&szlig;/g, "ß").replace(/&Uuml;/g, "Ü").replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö")
          .replace(/\s+/g, " ").trim();
}

const FEMALE_FIRSTS = new Set("sabine petra karin angelika andrea susanne barbara christine sandra nicole claudia stefanie julia anja silke birgit heike kerstin martina gabriele gabi ulrike katja daniela christina christiane maria monika annette iris tanja sabrina jana yvonne sonja alexandra franziska katharina vanessa melanie simone nadine verena annika annett beate elisabeth elke esther eva gudrun gisela hanna hannah helga ines ingrid isabel isabelle jasmin jessica jennifer johanna juliane karina karoline lena lisa mandy manuela marion mareike meike michaela miriam nina regina renate rita saskia sarah sylvia sigrid sophia sophie stefani tina ulla ute viviane wiebke angela astrid britta carina carolin caroline cornelia dagmar denise diana dorothea edith ellen evelyn gaby hannelore heidi helene henriette hilde inge inken jacqueline janine jutta katrin kirsten laura leonie liane luisa madeleine maike marina marita martha melissa natalie nathalie nelli olga pamela patricia peggy philippa rebecca rebekka roswitha ruth selina sibylle sieglinde silvia stefania theresa ursula vera viktoria waltraud finja amelie charlotte emma mia lea emilia mila clara paula frieda greta ronja juna orsina nicolle svenja alina anne antje alexa elena natascha susan steffi stephanie bettina brigitte bianca melina michelle sara silja friederike beatrix carla carmen cindy constanze cora dana doreen heidrun jördis katja kathleen marie michelle nicola olivia romy roxana sissi tabea".split(/\s+/));

const AGENCY_TYPE_RE = /\b(Generalagentur|Hauptagentur|Vertretung|Hauptvertretung|Generalvertretung|Agentur|Signal\s*Iduna\s*Gruppe)\b/i;

type Agent = {
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  mobile: string;
  agencyType: string;
  fullName: string;
  street: string;
  zip: string;
  city: string;
  openingHours: string;
  url: string;
};

function nameFromEmail(local: string): { first: string; last: string } {
  let s = local.replace(/\d+$/, "");
  const parts = s.split(/[._-]+/).filter(Boolean);
  if (parts.length < 2) return { first: "", last: "" };
  const prefix = parts[0].toLowerCase();
  if (["agentur", "info", "kontakt", "service", "team", "office", "buero", "mail", "generalagentur", "hauptvertretung"].includes(prefix)) {
    return { first: "", last: parts.slice(1).map(p => p[0].toUpperCase() + p.slice(1)).join("-") };
  }
  return {
    first: parts[0][0].toUpperCase() + parts[0].slice(1),
    last: parts.slice(1).map(p => p[0].toUpperCase() + p.slice(1)).join("-"),
  };
}

function detectSalutation(firstName: string, lastName: string): string {
  const firmRe = /\b(oHG|OHG|GmbH|KG|e\.?K\.|GbR)\b|[&+]/;
  if (firmRe.test(`${firstName} ${lastName}`)) return "";
  const f = firstName.toLowerCase().split(/[\s-]/)[0];
  if (FEMALE_FIRSTS.has(f)) return "Frau";
  if (firstName) return "Herr";
  return "";
}

function extractAgent(html: string, url: string): Agent | null {
  // Filter obvious non-agency pages (e.g. datenschutz)
  if (/\/(datenschutz|impressum|agb|kontakt)\/?$/i.test(url)) return null;

  // Find mailto email (anchor)
  const emailMatch = html.match(/mailto:([a-z0-9._-]+@signal-iduna\.(?:net|de|com))/i);
  if (!emailMatch) return null;
  const email = emailMatch[1].toLowerCase();
  // Skip generic company mailboxes
  if (/^info@signal-iduna\.de$/i.test(email)) return null;

  const fullText = stripTags(html);

  // Isolate contact block: the block preceding the email, after the LAST occurrence of
  // "Kontakt" that is NOT "Kontaktformular" / "Kontakt aufnehmen"
  const emailIdx = fullText.toLowerCase().indexOf(email);
  const contactSlice = emailIdx > 1000 ? fullText.slice(emailIdx - 1000, emailIdx) : fullText.slice(0, emailIdx);

  let agencyType = "", fullName = "", street = "", zip = "", city = "", phone = "", mobile = "", openingHours = "";

  // Type + name — within the 500-char slice before email
  const typeNameRe = /\b(Generalagentur|Hauptagentur|Hauptvertretung|Generalvertretung|Bezirksdirektion|Vertretung|Agentur|Geschäftsstelle)\s+([A-ZÄÖÜ][a-zäöüß\-.]+(?:\s+[A-ZÄÖÜ][a-zäöüß\-.]+){0,4})/;
  const tnm = contactSlice.match(typeNameRe);
  if (tnm) {
    agencyType = tnm[1].replace(/\s+/g, " ").trim();
    fullName = tnm[2].trim();
  }

  // Street — pipe-delimited segment containing Strasse/Weg/etc.
  const streetRe = /\|\s*([A-ZÄÖÜ][a-zäöüß\-.0-9\s]+(?:straße|str\.|str\b|weg|allee|platz|ring|chaussee|damm|gasse|ufer|hof|markt|pfad|promenade|graben|steig|brücke|berg|tal|park|anger|wall|feld|höhe|hang|kamp|stiege)[\sA-ZÄÖÜ0-9a-zäöüß\-\.]{0,30})\s*\|/i;
  const sm = contactSlice.match(streetRe);
  if (sm) street = sm[1].trim();

  // ZIP + City — must be D-PLZ (5 digits)
  const zipRe = /\|\s*(\d{5})\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß\-.\s()\/]{1,60}?)\s*\|/;
  const zm = contactSlice.match(zipRe);
  if (zm) { zip = zm[1]; city = zm[2].trim(); }

  const telMatch = contactSlice.match(/Tel\.?:?\s*([+\d][\d\s\-\/()]{6,25})/i);
  if (telMatch) phone = telMatch[1].trim();
  const mobMatch = contactSlice.match(/Mobil\.?:?\s*([+\d][\d\s\-\/()]{6,25})/i);
  if (mobMatch) mobile = mobMatch[1].trim();

  // Opening hours — after the mailto, up to ~6 pipe-segments
  const afterEmail = fullText.slice(emailIdx + email.length, emailIdx + email.length + 400);
  const ohMatch = afterEmail.match(/Öffnungszeiten\s*\|?\s*([^|]+(?:\|[^|]+){0,6})/);
  if (ohMatch) openingHours = ohMatch[1].replace(/\s*\|\s*/g, " · ").replace(/\s+/g, " ").trim().slice(0, 200);

  // Always prefer email-derived name (API-text may have non-contact "Generalagentur X" mentions)
  let first = "", last = "";
  const emailParts = email.split("@")[0];
  const n = nameFromEmail(emailParts);
  first = n.first;
  last = n.last;
  // If we got a proper fullName from the type-name regex AND the lastname matches the email, use it
  if (fullName) {
    const fullParts = fullName.split(/\s+/);
    const fullFirst = fullParts[0] || "";
    const fullLast = fullParts.slice(1).join(" ");
    // Prefer HTML name only if its lastname contains the email's lastname (consistency check)
    if (last && fullLast.toLowerCase().includes(last.toLowerCase().split("-")[0])) {
      first = fullFirst;
      last = fullLast;
    } else if (!last) {
      first = fullFirst;
      last = fullLast;
    }
  }
  const salutation = detectSalutation(first, last);

  return {
    salutation,
    firstName: first,
    lastName: last,
    email,
    phone,
    mobile,
    agencyType,
    fullName: fullName || `${first} ${last}`.trim(),
    street,
    zip,
    city,
    openingHours,
    url,
  };
}

async function main() {
  console.log("Signal Iduna Agenturen Scraper");
  console.log(`  concurrency=${CONCURRENCY}`);

  console.log("\n[1/3] Sitemap laden...");
  const xml = await fetchText(SITEMAP_URL);
  if (!xml) { console.error("Sitemap fail"); process.exit(1); }
  const urls = parseSitemap(xml);
  console.log(`  ${urls.length} Agentur-URLs`);

  console.log("\n[2/3] Scrapen...");
  const agents: (Agent | null)[] = new Array(urls.length);
  let done = 0, ok = 0, fail = 0;
  const t0 = Date.now();
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < urls.length) {
      const i = cursor++;
      const html = await fetchText(urls[i]);
      done++;
      if (!html) { fail++; continue; }
      const a = extractAgent(html, urls[i]);
      agents[i] = a;
      if (a) ok++;
      if (done % 100 === 0) {
        const elapsed = (Date.now() - t0) / 1000;
        const rate = done / elapsed;
        const eta = (urls.length - done) / rate;
        console.log(`  ${done}/${urls.length} · ok=${ok} · fail=${fail} · ${rate.toFixed(1)}/s · ETA ${eta.toFixed(0)}s`);
      }
    }
  });
  await Promise.all(workers);

  const found = agents.filter((a): a is Agent => a !== null);

  // Dedupe by email
  const byEmail = new Map<string, Agent>();
  for (const a of found) if (!byEmail.has(a.email)) byEmail.set(a.email, a);
  const unique = [...byEmail.values()];

  unique.sort((a, b) => (a.zip || "").localeCompare(b.zip || "") || a.lastName.localeCompare(b.lastName));

  const headers = ["salutation","firstName","lastName","email","phone","mobile","agencyType","fullName","street","zip","city","openingHours","url"];
  const esc = (v: string) => /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const lines = [headers.join(",")];
  for (const a of unique) lines.push(headers.map(h => esc(String((a as any)[h] ?? ""))).join(","));

  mkdirSync("data", { recursive: true });
  writeFileSync(OUTPUT, lines.join("\n") + "\n", "utf8");

  const withSalut = unique.filter(a => a.salutation).length;
  const withFirst = unique.filter(a => a.firstName).length;
  const withPhone = unique.filter(a => a.phone || a.mobile).length;
  console.log(`\n✓ ${unique.length} eindeutige Agenturen (raw fetches: ${urls.length}, ok: ${ok})`);
  console.log(`  mit E-Mail:    ${unique.length}`);
  console.log(`  mit Anrede:    ${withSalut}`);
  console.log(`  mit Vorname:   ${withFirst}`);
  console.log(`  mit Telefon:   ${withPhone}`);
  console.log(`  Output:        ${OUTPUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
