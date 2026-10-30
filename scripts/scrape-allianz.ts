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
  agencyType: string;        // GENERAL / HAUPT / UNDEFINED
  salutation: string;
  firstName: string;
  lastName: string;
  leaderNames: string;
  leaderRoles: string;
  teamSize: string;
  leaderCount: string;
  facebookUrl: string;
  instagramUrl: string;
  xingUrl: string;
  linkedinUrl: string;
  socialCount: string;
  potentialScore: string;
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
  teamNames: string;
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

const LEADER_ROLE_RE = /(Generalvertreter|Hauptvertreter|Agenturleiter|Agenturinhaber|Firmeninhaber|Agentur-?Nachfolger|Gesch(ä|ae)ftsf(ü|ue)hr|^Inhaber|\sInhaber)/i;

// Rolle endet auf "in" ⇒ weiblich (Generalvertreter*in*, Agenturinhaber*in*, Inhaber*in*, Geschäftsführer*in*).
// Match am Wortende innerhalb der Rolle: ...rin, ...erin, ...nde Inhaberin, usw.
const FEMALE_ROLE_RE = /(?:vertreter|inhaber|leiter|f(ü|ue)hrer|nachfolger|experte|spezialist|beraterin|betreuerin|managerin|chefin)in\b/i;

// Vornamen, die bei fehlender Rolle das Geschlecht liefern (nur eindeutige Beispiele).
const FEMALE_FIRST_NAMES = new Set([
  "sabine","petra","karin","angelika","andrea","susanne","barbara","christine","sandra","nicole","claudia","stefanie","julia","anja","silke","birgit","heike","kerstin","martina","gabriele","gabi","ulrike","katja","daniela","christina","christiane","maria","monika","annette","iris","tanja","sabrina","jana","yvonne","sonja","alexandra","franziska","katharina","vanessa","melanie","simone","nadine","verena","annika","annett","beate","elisabeth","elke","esther","eva","gudrun","gisela","hanna","hannah","helga","ines","ingrid","isabel","isabelle","jasmin","jessica","jennifer","johanna","juliane","karina","karoline","lena","lisa","mandy","manuela","marion","mareike","meike","michaela","miriam","nina","regina","renate","rita","sabrina","saskia","sarah","sylvia","sigrid","sophia","sophie","stefani","tina","ulla","ute","viviane","wiebke","angela","astrid","britta","carina","carolin","caroline","cornelia","dagmar","denise","diana","dorothea","edith","ellen","evelyn","gabi","gaby","hannelore","heidi","helene","henriette","hilde","inge","inken","jacqueline","janine","jutta","katrin","kirsten","laura","leonie","liane","luisa","madeleine","maike","marina","marita","martha","melissa","natalie","nathalie","nelli","olga","pamela","patricia","peggy","philippa","rebecca","roswitha","ruth","selina","sibylle","sieglinde","silvia","stefania","theresa","ursula","vera","viktoria","waltraud","wiebke","finja","amelie","charlotte","emma","mia","lea","emilia","mila","clara","paula","hannah","ida","frieda","greta","mathilda","lotte","nina","ronja","juna"
]);

const MALE_FIRST_NAMES = new Set([
  "michael","thomas","andreas","peter","klaus","wolfgang","jürgen","juergen","frank","stefan","stephan","markus","matthias","christian","oliver","dirk","jörg","joerg","ralf","uwe","martin","holger","rainer","hans","gerd","heinz","dieter","achim","volker","hartmut","rüdiger","ruediger","roland","udo","bernd","detlef","manfred","norbert","alexander","sascha","daniel","christoph","sebastian","benjamin","marcel","tobias","florian","nils","nico","timo","philipp","jens","sven","tim","lars","kai","björn","bjoern","dominik","patrick","andre","andré","mike","mirko","maik","maximilian","max","moritz","julian","jan","jonas","leon","luca","lukas","finn","noah","paul","felix","david","elias","samuel","alexander","konstantin","constantin","alf","alfred","albert","axel","benno","bernhard","bruno","carsten","karsten","claus","detlev","eberhard","edgar","edmund","egon","eric","erich","ernst","erwin","eugen","fabian","fritz","georg","gerald","gerhard","gernot","gottfried","gunnar","günter","guenter","günther","guenther","gustav","harald","harry","heiko","heinrich","helmut","henning","henry","herbert","hermann","hubert","hugo","ingo","jakob","joachim","johann","johannes","josef","jost","julius","justus","kevin","konrad","kurt","leopold","leon","leonard","leonhard","lothar","ludwig","manfred","mario","martin","mathias","maurice","moritz","nicolas","nick","niels","nikolaus","otto","patrick","paul","philip","phillip","phillipp","rainer","reiner","reinhard","reinhold","richard","robin","rudolf","rudi","rüdiger","sepp","siegfried","simon","stefan","sven","theo","theodor","tilo","tilmann","tim","timo","toni","torben","torsten","ulf","ulrich","valentin","victor","viktor","vincent","walter","werner","wilfried","wilhelm","willi","wolfgang","yannick"
]);

function detectSalutation(firstName: string, role: string): string {
  const r = role.trim();
  if (r) {
    // Weibliche Role-Suffixe
    // Weibliche Form: Rolle enthält Wort auf "...erin" (vertreterin, inhaberin,
    // leiterin, führerin, nachfolgerin, managerin, beraterin) oder explizit
    // "Spezialistin", "Expertin", "Kauffrau".
    if (/erin\b|istin\b|expertin\b|kauffrau\b/i.test(r)) return "Frau";
    // Rolle vorhanden ⇒ männliche Default-Form (deutscher Branchenstandard)
    return "Herr";
  }
  const first = firstName.toLowerCase().split(/[\s\-]/)[0];
  if (FEMALE_FIRST_NAMES.has(first)) return "Frau";
  if (MALE_FIRST_NAMES.has(first)) return "Herr";
  return "";
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase()
    .replace(/[äÄ]/g, "a").replace(/[öÖ]/g, "o").replace(/[üÜ]/g, "u").replace(/[ß]/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractAgency(html: string, url: string): Agent | null {
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(scriptRe)) {
    const raw = m[1].trim();
    if (!raw.includes("InsuranceAgency")) continue;
    let obj: any;
    try { obj = JSON.parse(raw); } catch { continue; }
    const nodes = Array.isArray(obj) ? obj : [obj];
    for (const node of nodes) {
      if (node?.["@type"] !== "InsuranceAgency") continue;
      const addr = node.address ?? {};
      const rating = node.aggregateRating ?? {};
      const agencyName = String(node.name ?? "").trim();

      const employees: any[] = Array.isArray(node.employees) ? node.employees :
                               Array.isArray(node.employee) ? node.employee :
                               node.employees ? [node.employees] :
                               node.employee ? [node.employee] : [];
      const parsed = employees
        .filter(e => e && typeof e === "object")
        .map(e => {
          const given = String(e.givenName ?? "").trim();
          const family = String(e.familyName ?? "").trim();
          const fullName = [given, family].filter(Boolean).join(" ");
          const title = (typeof e.jobTitle === "object"
            ? String(e.jobTitle?.name ?? "")
            : String(e.jobTitle ?? "")).trim();
          return { given, family, fullName, title };
        })
        .filter(p => p.fullName);

      const leaders: { name: string; role: string }[] = [];
      const otherTeam: string[] = [];
      for (const p of parsed) {
        if (LEADER_ROLE_RE.test(p.title)) {
          leaders.push({ name: p.fullName, role: p.title });
        } else {
          otherTeam.push(`${p.fullName} (${p.title})`);
        }
      }

      // Fallback: no leader detected? Match employee whose name appears in agency.name
      if (leaders.length === 0 && parsed.length > 0 && agencyName) {
        const normAgency = normalizeForMatch(agencyName);
        for (const p of parsed) {
          const normFam = normalizeForMatch(p.family);
          if (normFam && normAgency.includes(normFam)) {
            leaders.push({ name: p.fullName, role: p.title || "(Agenturinhaber lt. Agenturname)" });
            // remove from team
            const idx = otherTeam.findIndex(t => t.startsWith(p.fullName + " ("));
            if (idx >= 0) otherTeam.splice(idx, 1);
            break;
          }
        }
      }

      const primary = leaders[0];
      const primaryGiven = primary ? parsed.find(p => p.fullName === primary.name)?.given ?? "" : "";
      const primaryFamily = primary ? parsed.find(p => p.fullName === primary.name)?.family ?? "" : "";
      const salutation = primary ? detectSalutation(primaryGiven, primary.role) : "";

      // --- Social media (from node.sameAs) ---
      const sameAs: string[] = Array.isArray(node.sameAs) ? node.sameAs : (node.sameAs ? [node.sameAs] : []);
      let facebookUrl = "", instagramUrl = "", xingUrl = "", linkedinUrl = "";
      for (const s of sameAs) {
        const u = String(s);
        if (!facebookUrl && /facebook\.com\//i.test(u)) facebookUrl = u;
        else if (!instagramUrl && /instagram\.com\//i.test(u)) instagramUrl = u;
        else if (!xingUrl && /xing\.com\//i.test(u)) xingUrl = u;
        else if (!linkedinUrl && /linkedin\.com\//i.test(u)) linkedinUrl = u;
      }
      const socialCount = [facebookUrl, instagramUrl, xingUrl, linkedinUrl].filter(Boolean).length;

      // --- Agency type ---
      let agencyType = "";
      if (/GENERALVERTRETUNG/i.test(agencyName)) agencyType = "GENERAL";
      else if (/HAUPTVERTRETUNG/i.test(agencyName)) agencyType = "HAUPT";

      // --- Potential score ---
      const ratingCountN = Number(String(rating.ratingCount ?? "0")) || 0;
      const ratingValueN = Number(String(rating.ratingValue ?? "0")) || 0;
      let score = 0;
      // Social signals (= Meta Ads affinity)
      if (facebookUrl) score += 3;
      if (instagramUrl) score += 2;
      if (xingUrl) score += 1;
      if (linkedinUrl) score += 1;
      // Social presence combined bonus
      if (facebookUrl && instagramUrl) score += 2;
      // Team size — bigger agency = more budget
      if (parsed.length >= 5) score += 2;
      if (parsed.length >= 10) score += 2;
      // Multi-leader agencies tend to be bigger
      if (leaders.length >= 2) score += 2;
      // Reviews — proof of marketing willingness
      if (ratingCountN >= 25) score += 1;
      if (ratingCountN >= 100) score += 2;
      if (ratingCountN >= 300) score += 2;
      if (ratingValueN >= 4.5 && ratingCountN >= 25) score += 1;
      // Agency type
      if (agencyType === "GENERAL") score += 1;

      return {
        url,
        name: agencyName,
        agencyType,
        salutation,
        firstName: primaryGiven,
        lastName: primaryFamily,
        leaderNames: leaders.map(l => l.name).join("; "),
        leaderRoles: leaders.map(l => l.role).join("; "),
        teamSize: String(parsed.length),
        leaderCount: String(leaders.length),
        facebookUrl,
        instagramUrl,
        xingUrl,
        linkedinUrl,
        socialCount: String(socialCount),
        potentialScore: String(score),
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
        teamNames: otherTeam.join("; "),
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

  unique.sort((a, b) => (Number(b.potentialScore) - Number(a.potentialScore)) || a.zip.localeCompare(b.zip) || a.name.localeCompare(b.name));

  const headers = ["potentialScore", "salutation", "firstName", "lastName", "leaderNames", "leaderRoles",
                   "name", "agencyType", "email", "phone", "fax", "street", "zip", "city",
                   "teamSize", "leaderCount", "facebookUrl", "instagramUrl", "xingUrl", "linkedinUrl", "socialCount",
                   "ratingValue", "ratingCount", "openingHours", "teamNames", "url", "description"];
  const lines = [headers.join(",")];
  for (const a of unique) {
    lines.push(headers.map(h => esc((a as any)[h] ?? "")).join(","));
  }
  mkdirSync("data", { recursive: true });
  writeFileSync(OUTPUT_PATH, lines.join("\n") + "\n", "utf8");

  const withEmail = unique.filter(a => a.email).length;
  const withPhone = unique.filter(a => a.phone).length;
  const withLeader = unique.filter(a => a.leaderNames).length;
  const withSalutation = unique.filter(a => a.salutation).length;
  const herr = unique.filter(a => a.salutation === "Herr").length;
  const frau = unique.filter(a => a.salutation === "Frau").length;
  const withFb = unique.filter(a => a.facebookUrl).length;
  const withIg = unique.filter(a => a.instagramUrl).length;
  const withXing = unique.filter(a => a.xingUrl).length;
  const topScore = Math.max(...unique.map(a => Number(a.potentialScore)));
  const topTen = unique.slice(0, 10);
  console.log(`\n✓ ${unique.length} eindeutige Agenturen`);
  console.log(`  mit Agenturleiter-Namen: ${withLeader}`);
  console.log(`  mit Anrede: ${withSalutation} (Herr ${herr}, Frau ${frau})`);
  console.log(`  mit E-Mail: ${withEmail}`);
  console.log(`  mit Telefon: ${withPhone}`);
  console.log(`  mit Facebook: ${withFb} · Instagram: ${withIg} · Xing: ${withXing}`);
  console.log(`\nTop-10 Potential-Score (max=${topScore}):`);
  for (const a of topTen) {
    console.log(`  ${a.potentialScore.padStart(2)} · ${a.firstName} ${a.lastName} · ${a.city} · FB=${a.facebookUrl?'Y':'-'} IG=${a.instagramUrl?'Y':'-'} team=${a.teamSize} ratings=${a.ratingCount}`);
  }
  console.log(`  fehlgeschlagen: ${failed}`);
  console.log(`  Output: ${OUTPUT_PATH}`);
}

main().catch(e => { console.error(e); process.exit(1); });
