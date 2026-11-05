/**
 * Württembergische Agenturen – Discovery via Serper + Scrape.
 *
 * Problem: keine Sitemap, AWS-API vom Proxy blockiert.
 * Lösung: viele Google-Anfragen mit Städten/Vornamen → aggregiere alle
 * `wuerttembergische.de/versicherungen/<slug>` URLs, dann pro URL JSON-LD scrape.
 *
 * Erwartung: ~2500+ Agenturen (lt. Unternehmensangabe).
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

const SERPER_API = "https://google.serper.dev/search";
const SLUG_CACHE = "/tmp/claude-0/-home-user-kpidashboard-pg/9fc4aee2-fbf2-5bdd-9953-a78fd84db27c/scratchpad/wue-slugs.json";
const OUTPUT = "data/wuerttembergische-agenturen.csv";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 15);

const CITIES = [
  "Berlin","Hamburg","München","Köln","Frankfurt","Stuttgart","Düsseldorf","Dortmund","Essen","Leipzig",
  "Bremen","Dresden","Hannover","Nürnberg","Duisburg","Bochum","Wuppertal","Bielefeld","Bonn","Münster",
  "Karlsruhe","Mannheim","Augsburg","Wiesbaden","Mönchengladbach","Gelsenkirchen","Braunschweig","Chemnitz",
  "Kiel","Aachen","Halle","Magdeburg","Freiburg","Krefeld","Lübeck","Oberhausen","Erfurt","Mainz","Rostock",
  "Kassel","Hagen","Hamm","Saarbrücken","Mülheim","Potsdam","Ludwigshafen","Oldenburg","Leverkusen","Osnabrück",
  "Solingen","Heidelberg","Herne","Neuss","Darmstadt","Paderborn","Regensburg","Ingolstadt","Würzburg","Fürth",
  "Wolfsburg","Offenbach","Ulm","Heilbronn","Pforzheim","Göttingen","Bottrop","Trier","Recklinghausen",
  "Reutlingen","Bremerhaven","Koblenz","Bergisch Gladbach","Jena","Remscheid","Erlangen","Moers","Siegen",
  "Hildesheim","Salzgitter","Cottbus","Kaiserslautern","Gütersloh","Witten","Iserlohn","Hanau","Esslingen",
  "Zwickau","Ratingen","Dessau","Flensburg","Marl","Lünen","Villingen-Schwenningen","Konstanz","Gera",
  "Worms","Marburg","Dorsten","Gießen","Rüsselsheim","Lüneburg","Bamberg","Bayreuth"
];

const SEED_KEYWORDS = [
  "Generalagentur", "Hauptagentur", "Versicherungsagentur", "Versicherungsbüro",
  "Agentur", "Vertretung", "Berater", "Beratung",
];

function serperSearch(query: string, apiKey: string): Promise<string[]> {
  return new Promise(resolve => {
    const child = spawn("curl", [
      "-s", "-X", "POST", SERPER_API,
      "-H", `X-API-KEY: ${apiKey}`,
      "-H", "Content-Type: application/json",
      "-d", JSON.stringify({ q: query, gl: "de", hl: "de", num: 100 }),
      "--max-time", "15",
    ], { stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.on("close", () => {
      try {
        const j = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        const urls: string[] = [];
        for (const r of (j.organic ?? [])) {
          const link = String(r.link ?? "");
          const m = link.match(/https?:\/\/(?:www\.)?wuerttembergische\.de\/versicherungen\/([a-z0-9._-]+)(?:\/|$)/i);
          if (m && !["beratersuche", "bundesland", "stadt"].includes(m[1].toLowerCase())) {
            urls.push(`https://www.wuerttembergische.de/versicherungen/${m[1]}`);
          }
        }
        resolve(urls);
      } catch { resolve([]); }
    });
    child.on("error", () => resolve([]));
  });
}

async function discover(apiKey: string): Promise<string[]> {
  const found = new Set<string>();

  // 1. Keyword × City (quotes weggelassen — Serper gibt sonst 0 zurück)
  for (const kw of SEED_KEYWORDS) {
    for (const city of CITIES) {
      const q = `Württembergische Versicherung ${kw} ${city}`;
      const urls = await serperSearch(q, apiKey);
      let added = 0;
      for (const u of urls) { if (!found.has(u)) { found.add(u); added++; } }
      if (added > 0 || Math.random() < 0.05) console.log(`  + ${added} (now ${found.size}) · "${kw}" ${city}`);
      await new Promise(r => setTimeout(r, 150));
    }
  }
  // 2. Vornamen × keyword – zusätzliche Namens-basierte Suche
  const FIRST_NAMES = ["Harald","Michael","Thomas","Andreas","Peter","Klaus","Wolfgang","Frank","Stefan","Markus","Matthias","Christian","Oliver","Jens","Lars","Dirk","Ralf","Uwe","Martin","Holger","Jürgen","Rainer","Hans","Heinz","Dieter","Achim","Volker","Bernd","Detlef","Manfred","Norbert","Alexander","Sascha","Daniel","Christoph","Sebastian","Tobias","Florian","Nils","Timo","Philipp","Sven","Tim","Kai","Björn","Dominik","Patrick","Mike","Maximilian","Julian","Jan","Petra","Sabine","Andrea","Susanne","Nicole","Claudia","Christine","Barbara","Stefanie","Angelika","Tanja","Sandra","Martina","Katja","Monika"];
  for (const name of FIRST_NAMES) {
    const q = `Württembergische Versicherung ${name}`;
    const urls = await serperSearch(q, apiKey);
    let added = 0;
    for (const u of urls) { if (!found.has(u)) { found.add(u); added++; } }
    if (added > 0) console.log(`  + ${added} (now ${found.size}) · ${name}`);
    await new Promise(r => setTimeout(r, 150));
  }
  return [...found];
}

function fetchText(url: string, timeoutMs = 15000): Promise<string | null> {
  return new Promise(resolve => {
    const child = spawn("curl", [
      "-s", "-L", "--compressed", "--max-time", String(Math.ceil(timeoutMs / 1000)),
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

type Agent = {
  salutation: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  fax: string;
  agencyType: string;
  fullName: string;
  street: string;
  zip: string;
  city: string;
  url: string;
};

const FEMALE_FIRSTS = new Set("sabine petra karin angelika andrea susanne barbara christine sandra nicole claudia stefanie julia anja silke birgit heike kerstin martina gabriele gabi ulrike katja daniela christina christiane maria monika annette iris tanja sabrina jana yvonne sonja alexandra franziska katharina vanessa melanie simone nadine verena annika annett beate elisabeth elke esther eva gudrun gisela hanna hannah helga ines ingrid isabel isabelle jasmin jessica jennifer johanna juliane karina karoline lena lisa mandy manuela marion mareike meike michaela miriam nina regina renate rita saskia sarah sylvia sigrid sophia sophie stefani tina ulla ute viviane wiebke angela astrid britta carina carolin caroline cornelia dagmar denise diana dorothea edith ellen evelyn gaby hannelore heidi helene henriette hilde inge inken jacqueline janine jutta katrin kirsten laura leonie liane luisa madeleine maike marina marita martha melissa natalie nathalie nelli olga pamela patricia peggy philippa rebecca rebekka roswitha ruth selina sibylle sieglinde silvia stefania theresa ursula vera viktoria waltraud finja amelie charlotte emma mia lea emilia mila clara paula frieda greta ronja juna svenja alina anne antje alexa elena natascha susan steffi stephanie bettina brigitte bianca melina michelle sara silja friederike beatrix carla carmen cindy constanze cora dana doreen heidrun jördis katja kathleen marie olivia romy roxana sissi tabea".split(/\s+/));

function nameFromEmail(local: string) {
  const s = local.replace(/\d+$/, "");
  const parts = s.split(/[._-]+/).filter(Boolean);
  if (parts.length < 2) return { first: "", last: "" };
  const prefix = parts[0].toLowerCase();
  if (["agentur","info","kontakt","service","team","office","buero","mail","generalagentur"].includes(prefix)) {
    return { first: "", last: parts.slice(1).map(p => p[0].toUpperCase() + p.slice(1)).join("-") };
  }
  return {
    first: parts[0][0].toUpperCase() + parts[0].slice(1),
    last: parts.slice(1).map(p => p[0].toUpperCase() + p.slice(1)).join("-"),
  };
}

function detectSalutation(first: string, last: string): string {
  if (/\b(oHG|OHG|GmbH|KG|e\.?K\.|GbR)\b|[&+]/.test(`${first} ${last}`)) return "";
  const f = first.toLowerCase().split(/[\s-]/)[0];
  if (FEMALE_FIRSTS.has(f)) return "Frau";
  if (first) return "Herr";
  return "";
}

function extractAgent(html: string, url: string): Agent | null {
  // Find JSON-LD with @type: InsuranceAgency
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let agency: any = null;
  for (const m of html.matchAll(scriptRe)) {
    const raw = m[1].trim();
    if (!raw.includes("InsuranceAgency")) continue;
    try {
      const obj = JSON.parse(raw);
      const nodes = Array.isArray(obj) ? obj : [obj];
      for (const n of nodes) {
        if (n?.["@type"] === "InsuranceAgency") { agency = n; break; }
      }
      if (agency) break;
    } catch {}
  }
  if (!agency) return null;

  const addr = agency.address ?? {};
  const email = String(agency.email ?? "").toLowerCase().trim();
  if (!email) return null;

  // Extract "Generalagentur <Name>" from name field
  const rawName = String(agency.name ?? "").trim();
  // e.g. "Württembergische Versicherung: Dipl.Kfm. Harald Brandenstein"
  let agencyType = "", fullName = "";
  const nm = rawName.match(/:\s*(.+)$/);
  const nameOnly = nm ? nm[1].trim() : rawName;
  // strip academic titles
  fullName = nameOnly.replace(/^(?:Dipl\.?-?[A-Za-z]*\.?|Dr\.?|Prof\.?|Diplom)\s+/i, "").trim();

  // Try to find agency type from the HTML (Generalagentur, Hauptagentur, etc.)
  const htmlType = html.match(/\b(Generalagentur|Hauptagentur|Hauptvertretung|Generalvertretung|Vertretung|Agentur|Bezirksdirektion|Versicherungsagentur)\s+(?:Dipl\.?-?[A-Za-z]*\.?|Dr\.?|Prof\.?)?\s*(?:[A-ZÄÖÜ][a-zäöüß\-.]+(?:\s+[A-ZÄÖÜ][a-zäöüß\-.]+){0,4})/);
  if (htmlType) agencyType = htmlType[1];

  // Derive first/last from fullName
  const nParts = fullName.split(/\s+/);
  let first = nParts[0] || "";
  let last = nParts.slice(1).join(" ");

  // Fallback to email if fullName looks wrong
  const emLocal = email.split("@")[0];
  if (!first || /^[A-Z]{2,}$/.test(first)) {
    const nf = nameFromEmail(emLocal);
    first = nf.first;
    last = nf.last;
  }

  return {
    salutation: detectSalutation(first, last),
    firstName: first,
    lastName: last,
    email,
    phone: String(agency.telephone ?? "").trim(),
    fax: String(agency.faxNumber ?? "").trim(),
    agencyType,
    fullName,
    street: String(addr.streetAddress ?? "").trim(),
    zip: String(addr.postalCode ?? "").trim(),
    city: String(addr.addressLocality ?? "").trim(),
    url,
  };
}

async function main() {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) { console.error("SERPER_API_KEY fehlt"); process.exit(1); }

  // Discovery (Cache nutzen, wenn vorhanden)
  let urls: string[];
  if (existsSync(SLUG_CACHE) && !process.env.FORCE_DISCOVERY) {
    urls = JSON.parse(readFileSync(SLUG_CACHE, "utf8"));
    console.log(`Cache: ${urls.length} URLs aus ${SLUG_CACHE}`);
  } else {
    console.log("Discovery via Serper...");
    urls = await discover(apiKey);
    mkdirSync(SLUG_CACHE.replace(/\/[^/]+$/, ""), { recursive: true });
    writeFileSync(SLUG_CACHE, JSON.stringify(urls, null, 2), "utf8");
    console.log(`\n→ ${urls.length} URLs discovered, cached to ${SLUG_CACHE}`);
  }

  console.log(`\n[2/2] Scrapen von ${urls.length} Agent-URLs...`);
  const agents: (Agent | null)[] = new Array(urls.length);
  let done = 0, ok = 0, fail = 0;
  const t0 = Date.now();
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < urls.length) {
      const i = cursor++;
      const html = await fetchText(urls[i]);
      done++;
      if (!html || html.length < 5000) { fail++; continue; }
      const a = extractAgent(html, urls[i]);
      agents[i] = a;
      if (a) ok++; else fail++;
      if (done % 50 === 0) {
        const elapsed = (Date.now() - t0) / 1000;
        const rate = done / elapsed;
        const eta = (urls.length - done) / rate;
        console.log(`  ${done}/${urls.length} · ok=${ok} · fail=${fail} · ${rate.toFixed(1)}/s · ETA ${eta.toFixed(0)}s`);
      }
    }
  });
  await Promise.all(workers);

  const found = agents.filter((a): a is Agent => a !== null);
  const byEmail = new Map<string, Agent>();
  for (const a of found) if (!byEmail.has(a.email)) byEmail.set(a.email, a);
  const unique = [...byEmail.values()];
  unique.sort((a, b) => (a.zip || "").localeCompare(b.zip || "") || a.lastName.localeCompare(b.lastName));

  const headers = ["salutation","firstName","lastName","email","phone","fax","agencyType","fullName","street","zip","city","url"];
  const esc = (v: string) => /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const lines = [headers.join(",")];
  for (const a of unique) lines.push(headers.map(h => esc(String((a as any)[h] ?? ""))).join(","));
  mkdirSync("data", { recursive: true });
  writeFileSync(OUTPUT, lines.join("\n") + "\n", "utf8");

  const withSalut = unique.filter(a => a.salutation).length;
  const withPhone = unique.filter(a => a.phone).length;
  console.log(`\n✓ ${unique.length} eindeutige Agenturen`);
  console.log(`  mit Anrede: ${withSalut}`);
  console.log(`  mit Phone:  ${withPhone}`);
  console.log(`  Output:     ${OUTPUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
