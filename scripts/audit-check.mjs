// Sicherheitsprüfung der Produktions-Abhängigkeiten für die CI (ersetzt
// `npm audit --omit=dev --audit-level=high`).
//
// Wertet `npm audit --omit=dev --json` aus und schlägt bei jeder Advisory der
// Schwere „high“ oder „critical“ fehl. Übersprungen werden nur Advisories aus
// AUSNAHMEN unten, und nur bis zu ihrem Ablaufdatum: danach schlägt die Prüfung
// wieder an, damit die Ausnahme neu bewertet wird. Jede Ausnahme steht mit
// Begründung auch in docs/sicherheit-advisories.md.
//
// Aufruf: node scripts/audit-check.mjs

import { spawnSync } from "node:child_process";

const AUSNAHMEN = [
  {
    id: "GHSA-fc5q-39xc-vjpf",
    paket: "picomatch",
    bis: "2026-12-15",
    grund:
      "ReDoS in picomatch <= 4.0.7, nur transitiv im Build-Werkzeug von @sentry/nextjs (Rollup/Vite) mit festen " +
      "Mustern aus der Konfiguration; keine gepatchte Version veröffentlicht. Siehe docs/sicherheit-advisories.md.",
  },
];

const SCHWER = new Set(["high", "critical"]);
const heute = new Date().toISOString().slice(0, 10);

const lauf = spawnSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let bericht;
try {
  bericht = JSON.parse(lauf.stdout);
} catch {
  console.error("npm audit lieferte kein JSON (Netzwerk?):\n" + (lauf.stderr || lauf.stdout));
  process.exit(1);
}
if (bericht.error) {
  console.error("npm audit fehlgeschlagen:", JSON.stringify(bericht.error));
  process.exit(1);
}

// Advisories einsammeln (Einträge in `via` als Objekt sind die eigentlichen Advisories,
// Zeichenketten nur Verweise auf betroffene Unterpakete).
const advisories = new Map();
for (const [paket, v] of Object.entries(bericht.vulnerabilities ?? {})) {
  for (const via of v.via ?? []) {
    if (typeof via !== "object" || !via) continue;
    const id = String(via.url ?? "").split("/").pop() || String(via.source);
    const a = advisories.get(id) ?? { id, schwere: via.severity, titel: via.title, url: via.url, pakete: new Set() };
    a.pakete.add(`${via.name ?? paket}@${via.range ?? "?"}`);
    advisories.set(id, a);
  }
}

const fehler = [];
const uebersprungen = [];
for (const a of advisories.values()) {
  if (!SCHWER.has(a.schwere)) continue;
  const ausnahme = AUSNAHMEN.find((x) => x.id === a.id);
  if (ausnahme && heute <= ausnahme.bis) uebersprungen.push({ a, ausnahme });
  else fehler.push({ a, abgelaufen: ausnahme ? ausnahme.bis : null });
}

const zeile = (a) => `${a.id} [${a.schwere}] ${[...a.pakete].join(", ")}: ${a.titel} (${a.url})`;

for (const { a, ausnahme } of uebersprungen) {
  console.log(`Ausnahme bis ${ausnahme.bis}: ${zeile(a)}\n  Grund: ${ausnahme.grund}`);
}
for (const x of AUSNAHMEN) {
  if (!advisories.has(x.id)) console.log(`Hinweis: Ausnahme ${x.id} (${x.paket}) wird nicht mehr gemeldet und kann entfernt werden.`);
}

if (fehler.length) {
  console.error(`\n${fehler.length} Advisory(s) mit Schwere high/critical:`);
  for (const { a, abgelaufen } of fehler) {
    console.error(`- ${zeile(a)}${abgelaufen ? `\n  Ausnahme ist am ${abgelaufen} abgelaufen: neu bewerten.` : ""}`);
  }
  process.exit(1);
}

const m = bericht.metadata?.vulnerabilities ?? {};
console.log(
  `\nKeine offenen Advisories ab „high“ (betroffene Pakete laut npm: ${m.critical ?? 0} critical, ${m.high ?? 0} high, ` +
    `${m.moderate ?? 0} moderate, ${m.low ?? 0} low; ${uebersprungen.length} per Ausnahme übersprungen).`,
);
