/**
 * Württembergische Discovery Wave 2 — mass surname queries.
 *
 * Merge mit existing wue-slugs.json.
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

const SERPER_API = "https://google.serper.dev/search";
const SLUG_CACHE = "/tmp/claude-0/-home-user-kpidashboard-pg/9fc4aee2-fbf2-5bdd-9953-a78fd84db27c/scratchpad/wue-slugs.json";

// Top 200 German surnames
const SURNAMES = ["Müller","Schmidt","Schneider","Fischer","Weber","Meyer","Wagner","Becker","Schulz","Hoffmann","Schäfer","Koch","Bauer","Richter","Klein","Wolf","Schröder","Neumann","Schwarz","Zimmermann","Braun","Krüger","Hofmann","Hartmann","Lange","Schmitt","Werner","Schmitz","Krause","Meier","Lehmann","Schmid","Schulze","Maier","Köhler","Herrmann","König","Walter","Mayer","Huber","Kaiser","Fuchs","Peters","Lang","Scholz","Möller","Weiß","Jung","Hahn","Schubert","Vogel","Friedrich","Keller","Günther","Frank","Berger","Winkler","Roth","Beck","Lorenz","Baumann","Franke","Albrecht","Schuster","Simon","Ludwig","Böhm","Winter","Kraus","Martin","Schumacher","Krämer","Vogt","Stein","Jäger","Otto","Sommer","Groß","Seidel","Heinrich","Brandt","Haas","Schreiber","Graf","Schulte","Dietrich","Ziegler","Kuhn","Kühn","Pohl","Engel","Horn","Busch","Bergmann","Thomas","Voigt","Sauer","Arnold","Wolff","Pfeiffer","Michel","Müller","Lange","Fuhrmann","Wenzel","Dreßler","Herzog","Schilling","Berger","Beyer","Jansen","Kraft","Barth","Heinz","Wild","Hempel","Haase","Krug","Kessler","Schrader","Wilhelm","Henning","Seifert","Reichert","Stahl","Dietz","Freund","Kunze","Schäffer","Schwab","Reuter","Schwarz","Wendland","Schiller","Geiger","Weise","Hubert","Behrens","Bode","Fiedler","Nowak","Marx","Köster","Giese","Hansen","Scharf","Winkel","Westphal","Mohr","Hensel","Albers","Theiss","Schmelzer","Schott","Nagel","Kirchner","Brinkmann","Petersen","Reinhardt","Boehm","Kolb","Kirsch","Schlüter","Oswald","Ringel","Dorn","Boehme","Metz","Kempf","Zimmer","Bender","Mertens","Wolter","Haupt","Bader","Thiel","Ziegler","Hirsch","Michels","Steinhauer","Reiter","Hampel","Faber","Münch","Sauerwein","Wendt","Stadler","Hoch","Thoma","Hennig","Bartsch","Enders","Kessler","Reuter","Günther","Krüger"];

const CITIES_COMMON = ["Stuttgart","Berlin","München","Hamburg","Köln","Frankfurt","Düsseldorf","Essen","Dortmund","Leipzig","Bremen","Dresden","Hannover","Nürnberg","Duisburg","Bochum","Wuppertal","Bielefeld","Bonn","Münster","Karlsruhe","Mannheim","Augsburg","Wiesbaden","Braunschweig","Chemnitz","Kiel","Aachen","Halle","Magdeburg","Freiburg","Krefeld","Lübeck","Erfurt","Mainz","Rostock","Kassel","Hagen","Mülheim","Saarbrücken","Potsdam","Ludwigshafen","Oldenburg","Leverkusen","Osnabrück","Solingen","Heidelberg","Neuss","Darmstadt"];

function serperSearch(query: string, apiKey: string, engine = "google"): Promise<string[]> {
  return new Promise(resolve => {
    const child = spawn("curl", [
      "-s", "-X", "POST", SERPER_API,
      "-H", `X-API-KEY: ${apiKey}`,
      "-H", "Content-Type: application/json",
      "-d", JSON.stringify({ q: query, gl: "de", hl: "de", num: 50, engine }),
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

async function main() {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) { console.error("SERPER_API_KEY fehlt"); process.exit(1); }

  const found = new Set<string>(existsSync(SLUG_CACHE) ? JSON.parse(readFileSync(SLUG_CACHE, "utf8")) : []);
  console.log(`Start: ${found.size} URLs (cached)`);

  // Nur Nachname (google)
  for (const surname of SURNAMES) {
    const q = `Württembergische Versicherung ${surname}`;
    const urls = await serperSearch(q, apiKey);
    let added = 0;
    for (const u of urls) { if (!found.has(u)) { found.add(u); added++; } }
    if (added > 0) console.log(`  +${added} (now ${found.size}) · ${surname}`);
    await new Promise(r => setTimeout(r, 150));
  }
  console.log(`\nAfter surname wave: ${found.size}`);

  // Nachname × Stadt (nur häufigste Nachnamen)
  const HEAVY = SURNAMES.slice(0, 50);
  for (const surname of HEAVY) {
    for (const city of CITIES_COMMON) {
      const q = `Württembergische ${surname} ${city}`;
      const urls = await serperSearch(q, apiKey);
      let added = 0;
      for (const u of urls) { if (!found.has(u)) { found.add(u); added++; } }
      if (added > 0) console.log(`  +${added} (now ${found.size}) · ${surname} ${city}`);
      await new Promise(r => setTimeout(r, 100));
    }
  }
  console.log(`\nFinal: ${found.size} URLs`);
  writeFileSync(SLUG_CACHE, JSON.stringify([...found], null, 2), "utf8");
}

main().catch(e => { console.error(e); process.exit(1); });
