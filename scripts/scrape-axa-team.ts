/**
 * AXA Agenturen – Team-Enrichment.
 *
 * Nimmt die 1336 Agenturen aus axa-agenturen.csv, lädt für jede
 * `/ueber-uns/filialen-und-team`-Seite und extrahiert alle Team-
 * Mitglieder (Name, Email, Rolle, Qualifikation).
 *
 * Output: data/axa-team.csv — eine Zeile pro Person.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";

const AGENCIES_CSV = "data/axa-agenturen.csv";
const OUTPUT = "data/axa-team.csv";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 15);

type TeamMember = {
  email: string;
  firstName: string;
  lastName: string;
  salutation: string;
  qualification: string;
  role: string;            // "Ihr Ansprechpartner für ..."
  department: string;      // "Kundenberater" / "Kunden- und Schadenservice" …
  languages: string;
  agencyEmail: string;
  agencyLeader: string;
  agencyName: string;
  street: string;
  zip: string;
  city: string;
  phone: string;
  mobile: string;
  agencyUrl: string;
};

function fetchHtml(url: string): Promise<string | null> {
  return new Promise(resolve => {
    const child = spawn("curl", [
      "-s", "-L", "--compressed", "--max-time", "20",
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

function parseCsv(text: string): any[] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ""; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const [hdr, ...data] = rows.filter(r => r.some(f => f.trim() !== ""));
  return data.map(r => Object.fromEntries(hdr.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

function stripTags(h: string): string {
  return h.replace(/<br\s*\/?>/gi, " | ")
          .replace(/<\/(?:div|p|section|article|li|h\d|axa-link|span|a|td|tr)>/gi, " | ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&uuml;/g, "ü").replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö")
          .replace(/&szlig;/g, "ß").replace(/&Uuml;/g, "Ü").replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö")
          .replace(/\s+/g, " ")
          .trim();
}

const ACADEMIC_TITLES = /^(Dipl|Diplom|Diplomm?a|Dr|Prof|Professor|B\.?A|M\.?A|B\.Sc|M\.Sc|LL\.?M|MBA|Bachelor|Master|Juris)\b/i;

function nameFromEmail(local: string): { first: string; last: string } {
  // remove trailing digits ("rebekka.klemm2" → "rebekka.klemm")
  let s = local.replace(/\d+$/, "");
  // split on '.' or '-' or '_'
  const parts = s.split(/[._-]+/).filter(Boolean);
  if (parts.length < 2) {
    // e.g. "agentur" alone → no person
    return { first: "", last: "" };
  }
  const cap = (w: string) => w ? w[0].toUpperCase() + w.slice(1) : w;
  // Common agency prefixes that aren't names:
  const prefix = parts[0].toLowerCase();
  if (["agentur", "info", "kontakt", "service", "team", "office", "buero", "mail"].includes(prefix)) {
    // assume rest is the agency owner's surname
    const rest = parts.slice(1).map(cap).join("-");
    return { first: "", last: rest };
  }
  const first = cap(parts[0]);
  const last = parts.slice(1).map(cap).join("-");
  return { first, last };
}

const FEMALE_FIRSTS = new Set([
  "sabine","petra","karin","angelika","andrea","susanne","barbara","christine","sandra","nicole","claudia",
  "stefanie","julia","anja","silke","birgit","heike","kerstin","martina","gabriele","gabi","ulrike","katja",
  "daniela","christina","christiane","maria","monika","annette","iris","tanja","sabrina","jana","yvonne",
  "sonja","alexandra","franziska","katharina","vanessa","melanie","simone","nadine","verena","annika","annett",
  "beate","elisabeth","elke","esther","eva","gudrun","gisela","hanna","hannah","helga","ines","ingrid",
  "isabel","isabelle","jasmin","jessica","jennifer","johanna","juliane","karina","karoline","lena","lisa",
  "mandy","manuela","marion","mareike","meike","michaela","miriam","nina","regina","renate","rita","saskia",
  "sarah","sylvia","sigrid","sophia","sophie","stefani","tina","ulla","ute","viviane","wiebke","angela",
  "astrid","britta","carina","carolin","caroline","cornelia","dagmar","denise","diana","dorothea","edith",
  "ellen","evelyn","gaby","hannelore","heidi","helene","henriette","hilde","inge","inken","jacqueline",
  "janine","jutta","katrin","kirsten","laura","leonie","liane","luisa","madeleine","maike","marina","marita",
  "martha","melissa","natalie","nathalie","nelli","olga","pamela","patricia","peggy","philippa","rebecca",
  "rebekka","roswitha","ruth","selina","sibylle","sieglinde","silvia","stefania","theresa","ursula","vera",
  "viktoria","waltraud","finja","amelie","charlotte","emma","mia","lea","emilia","mila","clara","paula",
  "frieda","greta","ronja","juna","orsina","nicolle","hanna-pauline","hannapauline",
]);

function detectSalutationFromText(role: string, qualification: string, firstName: string): string {
  const t = `${role} ${qualification}`.toLowerCase();
  if (/ansprechpartnerin|kauffrau|beraterin|assistentin|betreuerin|expertin|managerin|chefin|leiterin|inhaberin|vertreterin|f(ü|ue)hrerin/.test(t)) return "Frau";
  const first = firstName.toLowerCase().split(/[\s\-]/)[0];
  if (FEMALE_FIRSTS.has(first)) return "Frau";
  // Default to Herr when any role-word is present OR a name was identified.
  if (/ansprechpartner|kaufmann|berater|assistent|betreuer|experte|manager|chef|leiter|inhaber|vertreter|f(ü|ue)hrer/.test(t)) return "Herr";
  if (firstName) return "Herr";
  return "";
}

function extractTeam(html: string, agency: any): TeamMember[] {
  const members: TeamMember[] = [];
  const emailRe = /([a-z0-9._-]+)@axa\.de/gi;
  const seen = new Set<string>();
  const uniqEmails: { email: string; local: string; idx: number }[] = [];
  let m;
  while ((m = emailRe.exec(html)) !== null) {
    const full = `${m[1]}@axa.de`.toLowerCase();
    if (seen.has(full)) continue;
    seen.add(full);
    uniqEmails.push({ email: full, local: m[1].toLowerCase(), idx: m.index });
  }

  for (const { email, local, idx } of uniqEmails) {
    const pre = stripTags(html.slice(Math.max(0, idx - 2000), idx));
    const parts = pre.split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);
    const tail = parts.slice(-15);

    // Find a name candidate
    let fullName = "";
    let qualification = "";
    for (let i = tail.length - 1; i >= 0; i--) {
      const seg = tail[i];
      if (ACADEMIC_TITLES.test(seg)) continue;
      if (/berat|service|kauffrau|kaufmann|betreuer|ansprechpartner|AXA|versicherung|IHK|dienstleistung/i.test(seg)) continue;
      if (/^[A-ZÄÖÜ][a-zäöü\-]+(?:\s+[A-ZÄÖÜ][a-zäöü\-]+){1,3}$/.test(seg)) {
        fullName = seg;
        qualification = (i + 1 < tail.length) ? tail[i + 1] : "";
        break;
      }
    }

    // Fallback: derive from email
    let firstName = "", lastName = "";
    if (fullName) {
      const sp = fullName.split(" ");
      firstName = sp[0];
      lastName = sp.slice(1).join(" ");
    } else {
      const n = nameFromEmail(local);
      firstName = n.first;
      lastName = n.last;
    }

    const roleSeg = tail.find(s => /^Ihre?r?\s+Ansprechpartner/i.test(s)) || "";
    const dept = tail.slice(-5).find(s =>
      /^(Kundenberater|Kunden-\s*und\s*Schadenservice|Agenturleiter|Beraterin|Fachberater|B(ü|ue)roleitung|Vertriebsassistenz)/i.test(s)
    ) || "";
    const langIdx = tail.findIndex(s => /Ber(ä|ae)t\s+Sie\s+auch\s+in/i.test(s));
    const languages = langIdx >= 0 && langIdx + 1 < tail.length ? tail[langIdx + 1] : "";

    members.push({
      email,
      firstName,
      lastName,
      salutation: detectSalutationFromText(roleSeg, qualification, firstName),
      qualification,
      role: roleSeg,
      department: dept,
      languages,
      agencyEmail: agency.email || "",
      agencyLeader: `${agency.firstName || ""} ${agency.lastName || ""}`.trim(),
      agencyName: agency.agencyName || "",
      street: agency.street || "",
      zip: agency.zip || "",
      city: agency.city || "",
      phone: agency.phone || "",
      mobile: agency.mobile || "",
      agencyUrl: agency.url || "",
    });
  }
  return members;
}

async function main() {
  const text = readFileSync(AGENCIES_CSV, "utf8");
  const agencies = parseCsv(text);
  // Dedup agencies by url (one URL = one agency page, multiple API rows same)
  const byUrl = new Map<string, any>();
  for (const a of agencies) {
    const u = (a.url || "").replace(/\/+$/, "");
    if (!u) continue;
    if (!byUrl.has(u)) byUrl.set(u, a);
  }
  const uniqueAgencies = [...byUrl.values()];
  console.log(`AXA Team Enrichment · ${uniqueAgencies.length} eindeutige Agentur-URLs · concurrency=${CONCURRENCY}`);

  const allMembers: TeamMember[] = [];
  const perAgencyEmails = new Set<string>();  // dedup globally by email+agency
  let done = 0, failed = 0;
  const t0 = Date.now();

  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < uniqueAgencies.length) {
      const i = cursor++;
      const a = uniqueAgencies[i];
      const base = (a.url || "").replace(/\/+$/, "");
      if (!base) { done++; failed++; continue; }
      const teamUrl = `${base}/ueber-uns/filialen-und-team`;
      const html = await fetchHtml(teamUrl);
      done++;
      if (!html || html.length < 2000) { failed++; continue; }
      const members = extractTeam(html, a);
      for (const m of members) {
        const key = `${m.email}|${base}`;
        if (perAgencyEmails.has(key)) continue;
        perAgencyEmails.add(key);
        allMembers.push(m);
      }
      if (done % 50 === 0) {
        const elapsed = (Date.now() - t0) / 1000;
        const rate = done / elapsed;
        const eta = (uniqueAgencies.length - done) / rate;
        console.log(`  ${done}/${uniqueAgencies.length} · members=${allMembers.length} · fail=${failed} · ${rate.toFixed(1)}/s · ETA ${eta.toFixed(0)}s`);
      }
    }
  });
  await Promise.all(workers);

  console.log(`\n✓ ${allMembers.length} eindeutige Team-Mitglieder von ${uniqueAgencies.length} Agenturen`);

  const headers = ["salutation","firstName","lastName","email","qualification","role","department","languages",
                   "agencyLeader","agencyEmail","agencyName","street","zip","city","phone","mobile","agencyUrl"];
  const esc = (v: string) => /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  allMembers.sort((a, b) => (a.zip || "").localeCompare(b.zip || "") || a.lastName.localeCompare(b.lastName));
  const lines = [headers.join(",")];
  for (const m of allMembers) {
    lines.push(headers.map(h => esc(String((m as any)[h] ?? ""))).join(","));
  }
  mkdirSync("data", { recursive: true });
  writeFileSync(OUTPUT, lines.join("\n") + "\n", "utf8");

  const withSalutation = allMembers.filter(m => m.salutation).length;
  const withName = allMembers.filter(m => m.firstName || m.lastName).length;
  console.log(`  mit Name: ${withName}`);
  console.log(`  mit Anrede: ${withSalutation}`);
  console.log(`  Output: ${OUTPUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
