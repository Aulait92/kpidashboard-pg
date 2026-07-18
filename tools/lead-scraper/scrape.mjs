// Phase 1 — Portal-Scrape: zieht Firmen (Name + Ort + Adresse) aus dem Vertikal-Portal.
// Aufruf:  node scrape.mjs [nische]     (Default: badumbau)
// Ausgabe: output/<nische>_raw.csv
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NISCHEN, STAEDTE, BLOCK_DOMAINS } from "./config.mjs";
import { fetchText, parsePflegehilfe, sleep, CSV_HEADER, toCsvRow, normKey } from "./lib.mjs";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dir, "output");
fs.mkdirSync(OUT, { recursive: true });

const nische = process.argv[2] || "badumbau";
const cfg = NISCHEN[nische];
if (!cfg) { console.error(`Unbekannte Nische "${nische}". Verfügbar: ${Object.keys(NISCHEN).join(", ")}`); process.exit(1); }
if (cfg.typ !== "cityLoop") { console.error(`Nische "${nische}" ist typ "${cfg.typ}" — cityLoop-Scrape hier nicht anwendbar. (nationalList: Seeds in config.mjs pflegen und enrich.mjs nutzen.)`); process.exit(1); }
if (!cfg.verifiziert) console.warn(`⚠  Slug "${cfg.slug}" für "${nische}" ist noch nicht verifiziert — 404s sind möglich.`);

const seen = new Map(); // normKey -> row
let hits404 = 0;

const maxI = process.argv.indexOf("--max");
const staedte = maxI > -1 ? STAEDTE.slice(0, Number(process.argv[maxI + 1])) : STAEDTE;

for (let idx = 0; idx < staedte.length; idx++) {
  const stadt = staedte[idx];
  const url = `https://www.pflegehilfe.org/${stadt}-${cfg.slug}`;
  const { ok, status, text } = await fetchText(url);
  if (!ok) { if (status === 404) hits404++; console.log(`  [${idx + 1}/${staedte.length}] ${stadt}: HTTP ${status} — übersprungen`); await sleep(400); continue; }
  const firmen = parsePflegehilfe(text, prettyCity(stadt), url);
  let neu = 0;
  for (const f of firmen) {
    const k = normKey(f.firma);
    if (!k || seen.has(k)) continue;
    seen.set(k, { Firma: f.firma, Nische: nische, Reichweite: "", Ort: f.ort, Website: "", Telefon: "", "E-Mail": "", "Lead-Kauf-Signal": cfg.leadSignal, Quelle: f.quelle, _adresse: f.adresse });
    neu++;
  }
  console.log(`  [${idx + 1}/${staedte.length}] ${stadt}: ${firmen.length} gelistet, +${neu} neu (gesamt ${seen.size})`);
  await sleep(500 + Math.floor(Math.random() * 400)); // höflich
}

const rows = [...seen.values()];
const file = path.join(OUT, `${nische}_raw.csv`);
fs.writeFileSync(file, [CSV_HEADER.join(";"), ...rows.map(toCsvRow)].join("\n") + "\n", "utf8");
console.log(`\n✔ ${rows.length} eindeutige Firmen → ${file}${hits404 ? `  (${hits404} Städte 404)` : ""}`);
console.log(`  Nächster Schritt: node enrich.mjs ${nische}`);

function prettyCity(slug) {
  return slug.replace(/-/g, " ").replace(/\bam main\b/, "am Main").replace(/(^|\s)\S/g, (c) => c.toUpperCase())
    .replace(/ue/g, "ü").replace(/oe/g, "ö").replace(/ae/g, "ä"); // grobe Rückumlautung fürs Anzeigen
}
