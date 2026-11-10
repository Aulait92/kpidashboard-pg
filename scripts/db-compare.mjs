// Zeilen je Tabelle vergleichen: SOURCE_URL (z. B. Produktion, nur lesend)
// gegen DATABASE_URL (z. B. wiederhergestellte Kopie). Für den
// Wiederherstellungstest und den Migrations-Probelauf (docs/livegang.md).
//
//   SOURCE_URL=… DATABASE_URL=… node scripts/db-compare.mjs [Bezeichnung]
//
// Gibt nur Tabellennamen und Anzahlen aus, keine Inhalte.

import pg from "pg";

const label = process.argv[2] ?? "Vergleich";

async function counts(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("SET default_transaction_read_only = on");
    const { rows } = await client.query(
      "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1",
    );
    const out = new Map();
    for (const { table_name } of rows) {
      const r = await client.query(`select count(*)::int as n from "${table_name.replace(/"/g, '""')}"`);
      out.set(table_name, r.rows[0].n);
    }
    return out;
  } finally {
    await client.end();
  }
}

const target = await counts(process.env.DATABASE_URL);
const source = process.env.SOURCE_URL ? await counts(process.env.SOURCE_URL) : null;
const names = [...new Set([...(source?.keys() ?? []), ...target.keys()])].sort();

console.log(`[db-compare] ${label}: ${target.size} Tabellen in der Zieldatenbank`);
let diff = 0;
for (const n of names) {
  const t = target.get(n);
  const s = source?.get(n);
  const mark = source && s !== t ? "  <-- abweichend" : "";
  if (mark) diff++;
  console.log(`[db-compare] ${n.padEnd(32)} ziel=${t ?? "-"}${source ? ` quelle=${s ?? "-"}` : ""}${mark}`);
}
console.log(`[db-compare] ${label}: ${diff} Tabellen abweichend`);
