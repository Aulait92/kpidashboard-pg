// Phase 3 (optional) — dedupe + sortieren: bundesweit → überregional → regional.
// Aufruf:  node finalize.mjs [nische]   Ausgabe: output/<nische>_final.csv
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CSV_HEADER, toCsvRow, normKey } from "./lib.mjs";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dir, "output");
const nische = process.argv[2] || "badumbau";
const inFile = path.join(OUT, `${nische}.csv`);
if (!fs.existsSync(inFile)) { console.error(`Fehlt: ${inFile}. Erst enrich.mjs laufen lassen.`); process.exit(1); }

const RANK = { bundesweit: 3, ueberregional: 2, "überregional": 2, regional: 1, "": 0 };
const lines = fs.readFileSync(inFile, "utf8").split(/\r?\n/).filter((l) => l.trim());
const head = lines[0].replace(/^﻿/, "").split(";");
const rows = lines.slice(1).map((l) => { const c = l.split(";"); const o = {}; head.forEach((h, i) => (o[h] = c[i] ?? "")); return o; });

// dedupe: beste Reichweite + vollständigste Kontaktzeile gewinnt
const rank = (r) => RANK[(r.Reichweite || "").trim().toLowerCase()] || 0;
const compl = (r) => ["Website", "Telefon", "E-Mail"].filter((h) => r[h]?.trim()).length;
const invRank = { 3: "bundesweit", 2: "ueberregional", 1: "regional", 0: "" };

const groups = new Map();
for (const r of rows) {
  const k = normKey(r.Firma);
  if (!k) continue;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}

const merged = [];
for (const g of groups.values()) {
  const base = { ...[...g].sort((a, b) => compl(b) - compl(a))[0] };
  base.Reichweite = invRank[Math.max(...g.map(rank))] || base.Reichweite; // stärkste Reichweite der Gruppe
  for (const h of ["Website", "Telefon", "E-Mail"]) if (!base[h]?.trim()) base[h] = g.map((r) => r[h]).find((v) => v?.trim()) || "";
  merged.push(base);
}
merged.sort((a, b) => (RANK[b.Reichweite?.trim().toLowerCase()] || 0) - (RANK[a.Reichweite?.trim().toLowerCase()] || 0) || a.Ort.localeCompare(b.Ort) || a.Firma.localeCompare(b.Firma));

const outFile = path.join(OUT, `${nische}_final.csv`);
fs.writeFileSync(outFile, "﻿" + [CSV_HEADER.join(";"), ...merged.map(toCsvRow)].join("\n") + "\n", "utf8");
const by = {}; for (const r of merged) by[r.Reichweite] = (by[r.Reichweite] || 0) + 1;
const c = (h) => merged.filter((r) => r[h]?.trim()).length;
console.log(`✔ ${merged.length} eindeutige Firmen → ${outFile}`);
console.log(`  Reichweite:`, by);
console.log(`  mit Website ${c("Website")} · Telefon ${c("Telefon")} · E-Mail ${c("E-Mail")}`);
