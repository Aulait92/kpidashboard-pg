// Datenbank-Migrationen beim Start (ersetzt `prisma db push --accept-data-loss`).
//
// 1. Kennt die Datenbank noch keine Migrationen (Tabelle `_prisma_migrations`
//    fehlt), wird sie einmalig „eingemessen": Die Differenz zwischen Datenbank
//    und Schema wird als SQL erzeugt und – nur wenn darin nichts gelöscht oder
//    umtypisiert wird – in EINER Transaktion ausgeführt. Danach werden alle
//    vorhandenen Migrationen als angewendet markiert.
// 2. Danach immer `prisma migrate deploy`: wendet nur neue, versionierte
//    Migrationen aus prisma/migrations an.
//
// Schlägt etwas fehl, endet der Start mit Fehler, ohne Daten zu verändern.
// Mit Healthcheck in Railway bleibt dann die alte Version online.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";

const prisma = (args, capture = false) =>
  execFileSync("npx", ["prisma", ...args], {
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    env: process.env,
    encoding: "utf8",
  });

// Wartet bis zu 5 Minuten auf die Datenbank (z. B. während eines Neustarts
// oder Umzugs), statt sofort abzustürzen.
async function connectWithRetry() {
  const deadline = Date.now() + 5 * 60 * 1000;
  for (let attempt = 1; ; attempt++) {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    client.on("error", () => {});
    try {
      await client.connect();
      return client;
    } catch (err) {
      await client.end().catch(() => {});
      if (Date.now() > deadline) throw err;
      console.log(`[migrate] Datenbank noch nicht erreichbar (${err.code ?? err.message}) – neuer Versuch in 5 s (${attempt}).`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

/**
 * Stand der Migrations-Historie:
 * - baselined: unsere erste Migration (0_init) ist als angewendet eingetragen
 * - failed: unsere Migrationen, die als fehlgeschlagen markiert sind
 * Die Produktion hatte schon eine `_prisma_migrations`-Tabelle mit alten
 * Einträgen eines früheren Verlaufs – darum zählt nur, ob 0_init drinsteht.
 */
async function migrationState(names) {
  const client = await connectWithRetry();
  try {
    const t = await client.query(
      "select 1 from information_schema.tables where table_schema = 'public' and table_name = '_prisma_migrations'",
    );
    if (t.rowCount === 0) return { baselined: false, failed: [], applied: [] };
    const r = await client.query("select migration_name, finished_at, rolled_back_at from _prisma_migrations");
    const ours = r.rows.filter((x) => names.includes(x.migration_name));
    const foreign = r.rows.filter((x) => !names.includes(x.migration_name)).map((x) => x.migration_name);
    if (foreign.length) console.log(`[migrate] Alte Einträge aus früherem Verlauf (bleiben unberührt): ${foreign.join(", ")}`);
    return {
      baselined: ours.some((x) => x.migration_name === names[0] && x.finished_at && !x.rolled_back_at),
      failed: ours.filter((x) => !x.finished_at && !x.rolled_back_at).map((x) => x.migration_name),
      applied: ours.filter((x) => x.finished_at && !x.rolled_back_at).map((x) => x.migration_name),
    };
  } finally {
    await client.end();
  }
}

// Änderungen, bei denen Daten verloren gehen könnten → nie automatisch.
const DESTRUCTIVE = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bDROP\s+TYPE\b/i,
  /\bALTER\s+COLUMN\s+"[^"]+"\s+(SET\s+DATA\s+)?TYPE\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
];

const dir = path.join(process.cwd(), "prisma", "migrations");
const migrations = readdirSync(dir)
  .filter((n) => statSync(path.join(dir, n)).isDirectory())
  .sort();

const state = await migrationState(migrations);
if (!state.baselined) {
  console.log("[migrate] Datenbank ohne (eigene) Migrations-Historie – wird einmalig eingemessen.");
  // Abgebrochene Versuche (z. B. ein früherer Start) erst als zurückgerollt markieren.
  for (const name of state.failed) prisma(["migrate", "resolve", "--rolled-back", name]);
  const sql = prisma(
    ["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--script"],
    true,
  );
  const statements = sql.replace(/^--.*$/gm, "").trim();
  if (statements && !/^-- This is an empty migration\.?$/m.test(sql)) {
    const hit = DESTRUCTIVE.find((re) => re.test(sql));
    if (hit) {
      console.error("[migrate] ABBRUCH: Die Angleichung würde Daten löschen oder umwandeln (" + hit + ").");
      console.error(sql);
      process.exit(1);
    }
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), "migrate-")), "baseline.sql");
    writeFileSync(file, "BEGIN;\n" + sql + "\nCOMMIT;\n");
    console.log("[migrate] Schema wird angeglichen (nur hinzufügende Änderungen).");
    prisma(["db", "execute", "--file", file]);
  }
  for (const name of migrations) {
    if (!state.applied.includes(name)) prisma(["migrate", "resolve", "--applied", name]);
  }
}

prisma(["migrate", "deploy"]);
console.log("[migrate] Schema aktuell.");
