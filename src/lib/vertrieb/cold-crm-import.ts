// Einmalige Übernahme aus der alten Cold-CRM-Datenbank (eigenes Railway-Projekt).
// Spalten sind 1:1 identisch, nur die Tabellen heißen hier „Sales…“. Läuft
// idempotent: vorhandene Datensätze (gleiche ID oder gleiche eindeutige Werte,
// z. B. E-Mail) werden übersprungen, die Übernahme kann also mehrfach laufen.
// Zeitstempel werden als Text (row_to_json) übertragen, damit keine
// Zeitzonen-Umrechnung im Node-Prozess passiert.

import { Client } from "pg";
import { prisma } from "@/lib/prisma";

const TABLES: { from: string; to: string; fk?: { col: string; table: string; nullable: boolean }[] }[] = [
  { from: "Contact", to: "SalesContact" },
  { from: "Campaign", to: "SalesCampaign" },
  { from: "Activity", to: "SalesActivity", fk: [{ col: "contactId", table: "SalesContact", nullable: false }] },
  { from: "Task", to: "SalesTask", fk: [{ col: "contactId", table: "SalesContact", nullable: true }] },
  {
    from: "CampaignLead",
    to: "SalesCampaignLead",
    fk: [
      { col: "contactId", table: "SalesContact", nullable: false },
      { col: "campaignId", table: "SalesCampaign", nullable: false },
    ],
  },
  { from: "EmailMessage", to: "SalesEmail", fk: [{ col: "contactId", table: "SalesContact", nullable: false }] },
  { from: "LinkedInEvent", to: "SalesLinkedInEvent", fk: [{ col: "contactId", table: "SalesContact", nullable: true }] },
  {
    from: "Meeting",
    to: "SalesMeeting",
    fk: [
      { col: "contactId", table: "SalesContact", nullable: false },
      { col: "taskId", table: "SalesTask", nullable: true },
    ],
  },
  { from: "InboundLead", to: "SalesInboundLead", fk: [{ col: "contactId", table: "SalesContact", nullable: true }] },
];

const CHUNK = 1000;

export type ImportReport = { table: string; source: number; inserted: number; skipped: number }[];

export function coldCrmSourceConfigured() {
  return !!process.env.COLD_CRM_DATABASE_URL?.trim();
}

export async function importFromColdCrm(): Promise<ImportReport> {
  const url = process.env.COLD_CRM_DATABASE_URL?.trim();
  if (!url) throw new Error("COLD_CRM_DATABASE_URL ist nicht gesetzt.");
  const src = new Client({ connectionString: url, connectionTimeoutMillis: 15000 });
  await src.connect();
  const report: ImportReport = [];
  try {
    for (const t of TABLES) {
      const total = Number((await src.query(`SELECT count(*)::int AS n FROM "${t.from}"`)).rows[0].n);
      let inserted = 0;
      for (let offset = 0; offset < total; offset += CHUNK) {
        const { rows } = await src.query(
          `SELECT coalesce(json_agg(x), '[]')::text AS j FROM (SELECT * FROM "${t.from}" ORDER BY id LIMIT ${CHUNK} OFFSET ${offset}) x`,
        );
        const where = (t.fk ?? [])
          .map((f) => `(${f.nullable ? `r."${f.col}" IS NULL OR ` : ""}r."${f.col}" IN (SELECT id FROM "${f.table}"))`)
          .join(" AND ");
        // Verweise auf übersprungene Datensätze (z. B. Kontakt mit bereits
        // vorhandener E-Mail) würden sonst die Fremdschlüssel verletzen.
        const n = await prisma.$executeRawUnsafe(
          `INSERT INTO "${t.to}" SELECT r.* FROM json_populate_recordset(NULL::"${t.to}", $1::json) r ${where ? `WHERE ${where}` : ""} ON CONFLICT DO NOTHING`,
          rows[0].j,
        );
        inserted += n;
      }
      report.push({ table: t.to, source: total, inserted, skipped: total - inserted });
    }
  } finally {
    await src.end().catch(() => {});
  }
  return report;
}
