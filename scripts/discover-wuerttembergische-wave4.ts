/**
 * Württembergische Discovery Wave 4 — heavy retry on bundesland pages only.
 *
 * Die Bundesland-Seiten (`/versicherungen/bundesland/<name>/`) scheinen
 * die vollständigen Berater-Listen des Landes zu enthalten, wenn sie
 * im "good state" ausgeliefert werden. Retry sehr aggressiv (bis 80x)
 * und über mehrere Runden.
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

const SLUG_CACHE = "/tmp/claude-0/-home-user-kpidashboard-pg/9fc4aee2-fbf2-5bdd-9953-a78fd84db27c/scratchpad/wue-slugs.json";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BUNDESLAENDER = [
  "baden-wuerttemberg", "bayern", "berlin", "brandenburg", "bremen",
  "hamburg", "hessen", "mecklenburg-vorpommern", "niedersachsen",
  "nordrhein-westfalen", "rheinland-pfalz", "saarland", "sachsen",
  "sachsen-anhalt", "schleswig-holstein", "thueringen",
];

function fetchText(url: string, timeoutMs = 25000): Promise<string | null> {
  return new Promise(resolve => {
    const child = spawn("curl", [
      "-s", "--compressed", "--max-time", String(Math.ceil(timeoutMs / 1000)),
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

function extractSlugs(html: string): string[] {
  const set = new Set<string>();
  for (const m of html.matchAll(/\/versicherungen\/([a-z0-9._-]+)(?:\/|[" ])/g)) {
    const s = m[1].toLowerCase();
    if (!["bundesland", "stadt", "beratersuche", "mein-servicebuero", "meinservicebuero"].includes(s)) {
      set.add(`https://www.wuerttembergische.de/versicherungen/${m[1]}`);
    }
  }
  return [...set];
}

async function main() {
  const found = new Set<string>(existsSync(SLUG_CACHE) ? JSON.parse(readFileSync(SLUG_CACHE, "utf8")) : []);
  console.log(`Start: ${found.size} URLs cached`);
  const save = () => writeFileSync(SLUG_CACHE, JSON.stringify([...found], null, 2), "utf8");

  const ROUNDS = 3;
  for (let round = 1; round <= ROUNDS; round++) {
    console.log(`\n=== Round ${round}/${ROUNDS} ===`);
    for (const bl of BUNDESLAENDER) {
      const url = `https://www.wuerttembergische.de/versicherungen/bundesland/${bl}/`;
      // retry up to 60x per land
      let got: string | null = null;
      for (let i = 0; i < 60; i++) {
        const h = await fetchText(url);
        if (h && h.length > 30000) { got = h; break; }
        await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
      }
      if (!got) {
        console.log(`  ✗ ${bl} — failed all 60 retries`);
        continue;
      }
      const slugs = extractSlugs(got);
      let added = 0;
      for (const u of slugs) { if (!found.has(u)) { found.add(u); added++; } }
      console.log(`  ✓ ${bl}: +${added} (page=${slugs.length}, total=${found.size})`);
      save();
    }
  }

  console.log(`\nFinal: ${found.size} URLs discovered`);
}

main().catch(e => { console.error(e); process.exit(1); });
