// Löschprotokoll nach einer Wiederherstellung der Datenbank (docs/notfall-wiederherstellung.md, lib/loeschprotokoll.ts).
//
//   Übertragen (alte → neue Datenbank, vor dem Umschalten):
//     VON_URL=<alte DATABASE_URL> NACH_URL=<neue DATABASE_URL> node scripts/loeschprotokoll.mjs uebertragen
//   Prüfen (nach dem Umschalten; 0 offen = alle Löschungen wieder angewendet):
//     NACH_URL=<DATABASE_URL> node scripts/loeschprotokoll.mjs pruefen
//
// Überträgt nur Zeilen der Tabelle „Loeschprotokoll“ (IDs und technische Verweise, keine Inhalte), die in der neuen
// Datenbank fehlen. Angewendet werden sie von der App selbst: beim Start (instrumentation.ts) und täglich im Cron.
// Gibt nur Anzahlen aus, keine IDs und keine Inhalte. Die alte Datenbank wird nur gelesen.

import pg from "pg";
import { pathToFileURL } from "node:url";

const SPALTEN = ["id", "art", "entityId", "customerId", "ref", "grund", "createdAt"];

async function verbinde(url, nurLesen = false) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  if (nurLesen) await client.query("SET default_transaction_read_only = on");
  return client;
}

/** Fehlende Einträge von VON nach NACH kopieren; gibt { alt, neu, uebertragen } zurück. */
export async function uebertrage(vonUrl, nachUrl) {
  const von = await verbinde(vonUrl, true);
  const nach = await verbinde(nachUrl);
  try {
    const { rows } = await von.query(`SELECT ${SPALTEN.map((s) => `"${s}"`).join(", ")} FROM "Loeschprotokoll" ORDER BY "createdAt"`);
    const vorher = Number((await nach.query(`SELECT count(*)::int AS n FROM "Loeschprotokoll"`)).rows[0].n);
    let uebertragen = 0;
    for (const r of rows) {
      const res = await nach.query(
        `INSERT INTO "Loeschprotokoll" ("id","art","entityId","customerId","ref","grund","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT DO NOTHING`,
        SPALTEN.map((s) => r[s]),
      );
      uebertragen += res.rowCount ?? 0;
    }
    return { alt: rows.length, neuVorher: vorher, uebertragen };
  } finally {
    await von.end();
    await nach.end();
  }
}

/** Wie viele protokollierte Löschungen sind in dieser Datenbank (wieder) offen? Nur lesend. */
export async function pruefe(url) {
  const db = await verbinde(url, true);
  try {
    const q = async (sql) => Number((await db.query(sql)).rows[0].n);
    const offen = {
      leads: await q(`SELECT count(*)::int AS n FROM "Loeschprotokoll" p JOIN "Lead" l ON l.id = p."entityId" WHERE p.art = 'lead' AND l."erasedAt" IS NULL`),
      kunden: await q(`SELECT count(*)::int AS n FROM "Loeschprotokoll" p JOIN "Customer" c ON c.id = p."entityId" WHERE p.art = 'kunde' AND c."dataDeletedAt" IS NULL`),
      dokumente: await q(`SELECT count(*)::int AS n FROM "Loeschprotokoll" p JOIN "LeadDocument" d ON d.id = p."entityId" WHERE p.art = 'policen_dokument'`),
      kontakte: await q(`SELECT count(*)::int AS n FROM "Loeschprotokoll" p JOIN "SalesContact" s ON s.id = p."entityId" WHERE p.art = 'vertriebskontakt'`),
    };
    const eintraege = await q(`SELECT count(*)::int AS n FROM "Loeschprotokoll"`);
    return { eintraege, offen, summe: Object.values(offen).reduce((a, b) => a + b, 0) };
  } finally {
    await db.end();
  }
}

async function main() {
  const befehl = process.argv[2];
  const nach = process.env.NACH_URL;
  if (!nach || (befehl !== "uebertragen" && befehl !== "pruefen")) {
    console.error("Aufruf: VON_URL=… NACH_URL=… node scripts/loeschprotokoll.mjs uebertragen | NACH_URL=… node scripts/loeschprotokoll.mjs pruefen");
    process.exit(2);
  }
  if (befehl === "uebertragen") {
    if (!process.env.VON_URL) {
      console.error("VON_URL fehlt (alte Datenbank).");
      process.exit(2);
    }
    const r = await uebertrage(process.env.VON_URL, nach);
    console.log(`Löschprotokoll übertragen: ${r.uebertragen} neu (alte Datenbank ${r.alt}, neue vorher ${r.neuVorher}).`);
    console.log("Jetzt umschalten; die App wendet die Einträge beim Start an. Danach: … pruefen");
  }
  const p = await pruefe(nach);
  console.log(`Einträge: ${p.eintraege}. Offen: Leads ${p.offen.leads}, Kunden ${p.offen.kunden}, Policen ${p.offen.dokumente}, Vertriebskontakte ${p.offen.kontakte}.`);
  if (befehl === "pruefen" && p.summe > 0) {
    console.log("Noch offen: App starten bzw. ein paar Minuten warten (Abgleich beim Start), dann erneut prüfen.");
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("Fehler:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
