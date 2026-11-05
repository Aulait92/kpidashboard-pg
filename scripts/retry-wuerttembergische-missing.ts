/**
 * Retry nur fehlende Württembergische-URLs mit extrem vielen Retries.
 */
import { writeFileSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { spawn } from "node:child_process";

const MISSING = "/tmp/claude-0/-home-user-kpidashboard-pg/9fc4aee2-fbf2-5bdd-9953-a78fd84db27c/scratchpad/wue-missing.json";
const OUTPUT = "data/wuerttembergische-agenturen.csv";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);

function fetchText(url: string): Promise<string | null> {
  return new Promise(resolve => {
    const child = spawn("curl", ["-s","-L","--compressed","--max-time","20","-A",UA,"-H","Accept: text/html","-H","Accept-Language: de-DE,de;q=0.9", url], { stdio: ["ignore","pipe","ignore"] });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.on("close", c => resolve(c !== 0 && chunks.length === 0 ? null : Buffer.concat(chunks).toString("utf8")));
    child.on("error", () => resolve(null));
  });
}

async function fetchWithRetry(url: string): Promise<string | null> {
  for (let i = 0; i < 80; i++) {
    const h = await fetchText(url);
    if (h && h.length > 10000 && h.includes("InsuranceAgency")) return h;
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 1500));
  }
  return null;
}

const FEMALE_FIRSTS = new Set("sabine petra karin angelika andrea susanne barbara christine sandra nicole claudia stefanie julia anja silke birgit heike kerstin martina gabriele gabi ulrike katja daniela christina christiane maria monika annette iris tanja sabrina jana yvonne sonja alexandra franziska katharina vanessa melanie simone nadine verena annika annett beate elisabeth elke esther eva gudrun gisela hanna hannah helga ines ingrid isabel isabelle jasmin jessica jennifer johanna juliane karina karoline lena lisa mandy manuela marion mareike meike michaela miriam nina regina renate rita saskia sarah sylvia sigrid sophia sophie stefani tina ulla ute viviane wiebke angela astrid britta carina carolin caroline cornelia dagmar denise diana dorothea edith ellen evelyn gaby hannelore heidi helene henriette hilde inge inken jacqueline janine jutta katrin kirsten laura leonie liane luisa madeleine maike marina marita martha melissa natalie nathalie nelli olga pamela patricia peggy philippa rebecca rebekka roswitha ruth selina sibylle sieglinde silvia stefania theresa ursula vera viktoria waltraud finja amelie charlotte emma mia lea emilia mila clara paula frieda greta ronja juna svenja alina anne antje alexa elena natascha susan steffi stephanie bettina brigitte bianca melina michelle sara silja friederike beatrix carla carmen cindy constanze cora dana doreen heidrun jördis kathleen marie olivia romy roxana sissi tabea".split(/\s+/));

function detectSalutation(first: string, last: string): string {
  if (/\b(oHG|OHG|GmbH|KG|e\.?K\.|GbR)\b|[&+]/.test(`${first} ${last}`)) return "";
  const f = first.toLowerCase().split(/[\s-]/)[0];
  if (FEMALE_FIRSTS.has(f)) return "Frau";
  if (first) return "Herr";
  return "";
}

function nameFromEmail(local: string) {
  const s = local.replace(/\d+$/, "");
  const parts = s.split(/[._-]+/).filter(Boolean);
  if (parts.length < 2) return { first: "", last: "" };
  const prefix = parts[0].toLowerCase();
  if (["agentur","info","kontakt","service","team","office","buero","mail"].includes(prefix)) {
    return { first: "", last: parts.slice(1).map(p => p[0].toUpperCase() + p.slice(1)).join("-") };
  }
  return { first: parts[0][0].toUpperCase() + parts[0].slice(1), last: parts.slice(1).map(p => p[0].toUpperCase() + p.slice(1)).join("-") };
}

function extractAgent(html: string, url: string): any | null {
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let agency: any = null;
  for (const m of html.matchAll(scriptRe)) {
    const raw = m[1].trim();
    if (!raw.includes("InsuranceAgency")) continue;
    try {
      const obj = JSON.parse(raw);
      const nodes = Array.isArray(obj) ? obj : [obj];
      for (const n of nodes) { if (n?.["@type"] === "InsuranceAgency") { agency = n; break; } }
      if (agency) break;
    } catch {}
  }
  if (!agency) return null;
  const addr = agency.address ?? {};
  const email = String(agency.email ?? "").toLowerCase().trim();
  if (!email) return null;
  const rawName = String(agency.name ?? "").trim();
  const nm = rawName.match(/:\s*(.+)$/);
  const nameOnly = nm ? nm[1].trim() : rawName;
  const fullName = nameOnly.replace(/^(?:Dipl\.?-?[A-Za-z]*\.?|Dr\.?|Prof\.?|Diplom)\s+/i, "").trim();
  const nParts = fullName.split(/\s+/);
  let first = nParts[0] || "";
  let last = nParts.slice(1).join(" ");
  const emLocal = email.split("@")[0];
  if (!first || /^[A-Z]{2,}$/.test(first)) {
    const nf = nameFromEmail(emLocal);
    first = nf.first; last = nf.last;
  }
  const htmlType = html.match(/\b(Generalagentur|Hauptagentur|Hauptvertretung|Generalvertretung|Vertretung|Agentur|Bezirksdirektion|Versicherungsagentur)/);
  return {
    salutation: detectSalutation(first, last),
    firstName: first, lastName: last, email,
    phone: String(agency.telephone ?? "").trim(),
    fax: String(agency.faxNumber ?? "").trim(),
    agencyType: htmlType ? htmlType[1] : "",
    fullName,
    street: String(addr.streetAddress ?? "").trim(),
    zip: String(addr.postalCode ?? "").trim(),
    city: String(addr.addressLocality ?? "").trim(),
    url,
  };
}

async function main() {
  const missing: string[] = JSON.parse(readFileSync(MISSING, "utf8"));
  console.log(`Retry ${missing.length} missing URLs (concurrency=${CONCURRENCY}, 80 retries each)`);

  const recovered: any[] = [];
  let done = 0, ok = 0, fail = 0;
  const t0 = Date.now();
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < missing.length) {
      const i = cursor++;
      const url = missing[i];
      const html = await fetchWithRetry(url);
      done++;
      if (!html) { fail++; continue; }
      const a = extractAgent(html, url);
      if (a) { recovered.push(a); ok++; }
      else fail++;
      if (done % 10 === 0) console.log(`  ${done}/${missing.length} · ok=${ok} · fail=${fail}`);
    }
  });
  await Promise.all(workers);

  console.log(`\n✓ recovered ${recovered.length} von ${missing.length}`);
  if (recovered.length === 0) return;
  // Append to existing CSV
  const headers = ["salutation","firstName","lastName","email","phone","fax","agencyType","fullName","street","zip","city","url"];
  const esc = (v: string) => /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  let lines = "";
  for (const a of recovered) lines += headers.map(h => esc(String((a as any)[h] ?? ""))).join(",") + "\n";
  appendFileSync(OUTPUT, lines, "utf8");
  console.log(`Appended to ${OUTPUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
