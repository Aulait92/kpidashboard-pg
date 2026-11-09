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

async function hasMigrationTable() {
  const client = await connectWithRetry();
  try {
    const r = await client.query(
      "select 1 from information_schema.tables where table_schema = 'public' and table_name = '_prisma_migrations'",
    );
    return r.rowCount > 0;
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

if (!(await hasMigrationTable())) {
  console.log("[migrate] Datenbank ohne Migrations-Historie – wird einmalig eingemessen.");
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
  for (const name of migrations) prisma(["migrate", "resolve", "--applied", name]);
}

prisma(["migrate", "deploy"]);
console.log("[migrate] Schema aktuell.");
