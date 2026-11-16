// Demo-Kunde (seed.ts) aufräumen für die Einführungsvideos: vollständige Erstinformation (kein Warnhinweis auf „Heute“)
// und Wiedervorlagen wie im echten Alltag.
// Aufruf: DATABASE_URL=… node tools/erklaervideos/local/ev_zustand.mjs   (nur lokale Wegwerf-Datenbank)
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const { rows } = await c.query(`SELECT id FROM "Customer" WHERE name = 'Allianz Max Berger'`);
if (!rows[0]) throw new Error("Demo-Kunde fehlt (erst local/seed.ts)");
await c.query(
  `INSERT INTO "Erstinformation" (id, "customerId", token, "registerNummer", "fileName", "contentType", size, data, "bestaetigtAt", "statusAt", "updatedAt")
   VALUES ('ei_demo', $1, 'demo-erstinfo-token', 'D-ABCD-EFGHI-12', 'erstinformation.pdf', 'application/pdf', 8, '\\x255044462d312e34'::bytea, now(), now(), now())
   ON CONFLICT ("customerId") DO UPDATE SET "registerNummer" = EXCLUDED."registerNummer", "fileName" = EXCLUDED."fileName", "bestaetigtAt" = now()`,
  [rows[0].id],
);
// Wie bei einem Kunden, der die App nutzt: fast alle offenen Leads haben eine Wiedervorlage, zwei nicht
// (sonst steht „Leads ohne nächsten Schritt“ mit 14 Einträgen über allem anderen).
const open = ["Nicht erreicht", "Im Gespräch", "In Beratung", "Termin vereinbart", "Angebot gesendet", "Angebot verschickt", "Angebot raus", "Erreicht", "Qualifiziert", "Angebot/Beratung läuft"];
const { rows: leads } = await c.query(
  `SELECT id FROM "Lead" WHERE "customerId" = $1 AND status = ANY($2) AND "closedAt" IS NULL AND "followUpAt" IS NULL ORDER BY "createdAt" DESC`,
  [rows[0].id, open],
);
const keep = leads.slice(0, 2).map((l) => l.id);
await c.query(
  `UPDATE "Lead" SET "followUpAt" = now() + interval '3 days' WHERE "customerId" = $1 AND status = ANY($2) AND "closedAt" IS NULL AND "followUpAt" IS NULL AND NOT (id = ANY($3))`,
  [rows[0].id, open, keep],
);
// Heute wie im Alltag (Stand 16.11.2026): ein Termin von gestern ohne Ergebnis („Wie lief es?“) und zwei Kontakte
// ohne nächsten Schritt (unten „Aufräumen“, in Kontakte „Festlegen“).
const { rows: dj } = await c.query(`SELECT id FROM "Lead" WHERE "customerId" = $1 AND name = 'Dennis Jung' LIMIT 1`, [rows[0].id]);
if (dj[0]) {
  await c.query(
    `INSERT INTO "Appointment" (id, "customerId", "leadId", mode, "startsAt", "endsAt", status, "updatedAt")
     VALUES ('ev_wie_lief', $1, $2, 'video', date_trunc('day', now()) - interval '1 day' + interval '13 hours',
             date_trunc('day', now()) - interval '1 day' + interval '13 hours 30 minutes', 'booked', now())
     ON CONFLICT (id) DO NOTHING`,
    [rows[0].id, dj[0].id],
  );
}
await c.query(
  `UPDATE "Lead" SET "followUpAt" = NULL WHERE "customerId" = $1 AND name IN ('Philipp Günther', 'Stefanie Keller')`,
  [rows[0].id],
);
await c.end();
console.log("ok");
