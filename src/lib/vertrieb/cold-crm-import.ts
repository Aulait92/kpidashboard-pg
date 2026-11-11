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

/**
 * Quelle der Übernahme:
 * - "cold":    altes Cold CRM (COLD_CRM_DATABASE_URL, Tabellen „Contact“ usw.)
 * - "staging": Testumgebung (VERTRIEB_QUELLE_URL, gleiche Tabellen „Sales…“), für den
 *   Livegang. Verknüpfungen zu Kundenakten (customerId) werden geleert, weil die
 *   Kundenakten der Testumgebung in der Produktion nicht existieren.
 */
export type ImportSource = "cold" | "staging";

function sourceUrl(source: ImportSource): string {
  const url = (source === "cold" ? process.env.COLD_CRM_DATABASE_URL : process.env.VERTRIEB_QUELLE_URL)?.trim();
  if (!url) throw new Error(source === "cold" ? "COLD_CRM_DATABASE_URL ist nicht gesetzt." : "VERTRIEB_QUELLE_URL ist nicht gesetzt.");
  return url;
}

export function stagingSourceConfigured() {
  return !!process.env.VERTRIEB_QUELLE_URL?.trim();
}

export async function importFromColdCrm(source: ImportSource = "cold"): Promise<ImportReport> {
  const src = new Client({ connectionString: sourceUrl(source), connectionTimeoutMillis: 15000 });
  await src.connect();
  const report: ImportReport = [];
  try {
    for (const t of TABLES) {
      const from = source === "staging" ? t.to : t.from;
      const total = Number((await src.query(`SELECT count(*)::int AS n FROM "${from}"`)).rows[0].n);
      let inserted = 0;
      for (let offset = 0; offset < total; offset += CHUNK) {
        const { rows } = await src.query(
          `SELECT coalesce(json_agg(x), '[]')::text AS j FROM (SELECT * FROM "${from}" ORDER BY id LIMIT ${CHUNK} OFFSET ${offset}) x`,
        );
        let json: string = rows[0].j;
        if (source === "staging" && t.to === "SalesContact") {
          json = JSON.stringify((JSON.parse(json) as Record<string, unknown>[]).map((r) => ({ ...r, customerId: null })));
        }
        const where = (t.fk ?? [])
          .map((f) => `(${f.nullable ? `r."${f.col}" IS NULL OR ` : ""}r."${f.col}" IN (SELECT id FROM "${f.table}"))`)
          .join(" AND ");
        // Verweise auf übersprungene Datensätze (z. B. Kontakt mit bereits
        // vorhandener E-Mail) würden sonst die Fremdschlüssel verletzen.
        const n = await prisma.$executeRawUnsafe(
          `INSERT INTO "${t.to}" SELECT r.* FROM json_populate_recordset(NULL::"${t.to}", $1::json) r ${where ? `WHERE ${where}` : ""} ON CONFLICT DO NOTHING`,
          json,
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

// ─── Neu-Import (ersetzt den Vertrieb) ────────────────────────────────────
// Für den Umzug vom eingefrorenen Cold CRM: Vertriebsdaten leeren und frisch
// übernehmen, damit auch Änderungen an schon übernommenen Kontakten ankommen.
// Nur erlaubt, wenn VERTRIEB_NEUIMPORT_ERLAUBT=1 gesetzt ist (Testumgebung).
// Vorher wird alles in ein eigenes Schema „backup_vertrieb_…“ kopiert
// (außerhalb von public, stört Prisma/Migrationen nicht).

/** Tabellen in Lösch-Reihenfolge; Angebote hängen per Cascade am Kontakt. */
const REPLACE_TABLES = [
  "SalesInboundLead",
  "SalesLinkedInEvent",
  "SalesMeeting",
  "SalesEmail",
  "SalesCampaignLead",
  "SalesTask",
  "SalesActivity",
  "Offer",
  "SalesContact",
  "SalesCampaign",
] as const;

export function coldCrmReplaceAllowed() {
  return coldCrmSourceConfigured() && process.env.VERTRIEB_NEUIMPORT_ERLAUBT === "1";
}

export function backupSchemaName(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `backup_vertrieb_${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}_${p(now.getUTCHours())}${p(now.getUTCMinutes())}`;
}

export async function replaceFromColdCrm(now = new Date(), source: ImportSource = "cold"): Promise<{ backup: string; report: ImportReport }> {
  if (process.env.VERTRIEB_NEUIMPORT_ERLAUBT !== "1") throw new Error("Neu-Import ist hier nicht freigeschaltet.");
  // Quelle zuerst prüfen: ohne erreichbare, gefüllte Quelle wird nichts gelöscht.
  const src = new Client({ connectionString: sourceUrl(source), connectionTimeoutMillis: 15000 });
  await src.connect();
  try {
    const n = Number((await src.query(`SELECT count(*)::int AS n FROM "${source === "staging" ? "SalesContact" : "Contact"}"`)).rows[0].n);
    if (!n) throw new Error(source === "staging" ? "Die Testumgebung liefert keine Kontakte. Abgebrochen, nichts gelöscht." : "Das Cold CRM liefert keine Kontakte. Abgebrochen, nichts gelöscht.");
  } finally {
    await src.end().catch(() => {});
  }

  const backup = backupSchemaName(now);
  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${backup}"`);
      for (const t of REPLACE_TABLES) {
        const where = t === "Offer" ? ` WHERE "salesContactId" IS NOT NULL` : "";
        await tx.$executeRawUnsafe(`CREATE TABLE "${backup}"."${t}" AS SELECT * FROM "${t}"${where}`);
      }
      // Kunden behalten, nur die Verknüpfung zum Vertriebskontakt fällt weg.
      await tx.$executeRawUnsafe(`DELETE FROM "SalesInboundLead"`);
      await tx.$executeRawUnsafe(`DELETE FROM "SalesLinkedInEvent"`);
      await tx.$executeRawUnsafe(`DELETE FROM "SalesContact"`);
      await tx.$executeRawUnsafe(`DELETE FROM "SalesCampaign"`);
    },
    { timeout: 120_000 },
  );
  const report = await importFromColdCrm(source);
  return { backup, report };
}
