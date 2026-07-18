// Phase 2 — Anreicherung: löst pro Firma die offizielle Website auf (DuckDuckGo)
// und zieht Telefon + E-Mail + Reichweite aus Startseite/Impressum/Kontakt.
// Aufruf:  node enrich.mjs [nische] [--limit N] [--conc 4]
// Eingabe: output/<nische>_raw.csv   Ausgabe: output/<nische>.csv  (resume-fähig)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NISCHEN, BLOCK_DOMAINS } from "./config.mjs";
import { resolveWebsite, osmLookup, enrichFromWebsite, CSV_HEADER, toCsvRow, normKey, pool } from "./lib.mjs";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dir, "output");

const nische = process.argv[2] || "badumbau";
const cfg = NISCHEN[nische] || {};
const limit = num("--limit", Infinity);
const conc = num("--conc", 3);

const rawFile = path.join(OUT, `${nische}_raw.csv`);
if (!fs.existsSync(rawFile)) { console.error(`Fehlt: ${rawFile}. Erst  node scrape.mjs ${nische}  laufen lassen.`); process.exit(1); }

const raw = parseCsv(fs.readFileSync(rawFile, "utf8"));
const outFile = path.join(OUT, `${nische}.csv`);
const done = new Set();
if (fs.existsSync(outFile)) {
  for (const r of parseCsv(fs.readFileSync(outFile, "utf8"))) done.add(normKey(r.Firma));
  console.log(`Resume: ${done.size} Firmen bereits angereichert — werden übersprungen.`);
} else {
  fs.writeFileSync(outFile, CSV_HEADER.join(";") + "\n", "utf8");
}

const todo = raw.filter((r) => !done.has(normKey(r.Firma))).slice(0, limit === Infinity ? undefined : limit);
console.log(`Reichere ${todo.length} Firmen an (Nebenläufigkeit ${conc}) …\n`);

let n = 0;
await pool(todo, conc, async (r) => {
  // 1) OSM/Nominatim (keyless): oft Website + Telefon/E-Mail direkt
  const osm = await osmLookup(r.Firma, r.Ort, BLOCK_DOMAINS);
  // 2) Website bestimmen: aus Rohdaten -> OSM -> Suchmaschine (Brave/DDG)
  let website = r.Website?.trim() || osm.website || "";
  if (!website) website = await resolveWebsite(r.Firma, r.Ort, BLOCK_DOMAINS);
  // 3) Kontakt aus Website-Impressum, ergänzt um OSM-Direktdaten
  const info = await enrichFromWebsite(website);
  const telefon = osm.telefon || info.telefon;
  const email = osm.email || info.email;
  const row = {
    Firma: r.Firma, Nische: nische,
    Reichweite: r.Reichweite?.trim() || info.reichweite,
    Ort: r.Ort, Website: website, Telefon: telefon, "E-Mail": email,
    "Lead-Kauf-Signal": r["Lead-Kauf-Signal"] || cfg.leadSignal || "", Quelle: r.Quelle,
  };
  fs.appendFileSync(outFile, toCsvRow(row) + "\n", "utf8"); // atomarer Zeilen-Append = resume-safe
  n++;
  const flag = email || telefon ? "✔" : website ? "○" : "×";
  console.log(`  ${flag} [${n}/${todo.length}] ${r.Firma} — ${website || "keine Website"}`);
});

console.log(`\n✔ Fertig. Angereichert: ${n}. Datei: ${outFile}`);

// ---------- helpers ----------
function num(flag, def) { const i = process.argv.indexOf(flag); return i > -1 ? Number(process.argv[i + 1]) : def; }
function parseCsv(txt) {
  const lines = txt.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = lines[0].replace(/^﻿/, "").split(";");
  return lines.slice(1).map((l) => { const c = l.split(";"); const o = {}; head.forEach((h, i) => (o[h] = c[i] ?? "")); return o; });
}
