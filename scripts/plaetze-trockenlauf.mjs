// Trockenlauf „3 aktive Verkäufer inklusive“ (Ole, 14.11.2026): Änderungsliste je Kunde,
// alt → neu (weitere berechnete Verkäufer-Plätze). Nur lesend, ändert nichts.
// Die echte Anpassung macht der tägliche Abgleich (reconcileSeatBilling, 03 Uhr UTC).
//
//   DATABASE_URL=… node --no-warnings --experimental-strip-types scripts/plaetze-trockenlauf.mjs [--json]
//
// Spalten: bisher berechnet (Customer.seatsBilled), alte Regel (alle Logins), neue Regel
// (aktive Verkäufer, nie über der alten Regel). Art: weniger (wird gesenkt), gleich,
// nachberechnung (bisher zu wenig berechnet, z. B. durch den Fehler bei geplantem Abo-Start;
// nie mehr als nach der alten Regel).

import pg from "pg";
import { berlinDayStart, countActiveSellers, seatChange } from "../src/lib/seats.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL fehlt.");
  process.exit(1);
}
const asJson = process.argv.includes("--json");

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("SET default_transaction_read_only = on");
  // Vor dem Deploy gibt es die Spalte noch nicht: dann zählt nur „bekommt Leads“
  const col = await client.query(
    `select 1 from information_schema.columns where table_schema = 'public' and table_name = 'User' and column_name = 'leadReceivedAt'`,
  );
  const received = col.rowCount ? `u."leadReceivedAt"` : `NULL::timestamp`;
  const { rows: customers } = await client.query(
    `select c.id, c.name, c."seatsIncluded" as included, c."seatMonthly"::float as price, c."seatsBilled" as billed
       from "Customer" c
      where c."seatsIncluded" is not null and c.archived = false
      order by c.name`,
  );
  const { rows: users } = await client.query(
    `select u."customerId" as cid, u."receivesLeads" as "receivesLeads", ${received} as "leadReceivedAt"
       from "User" u where u.role = 'BUYER' and u."customerId" is not null`,
  );
  const byCustomer = new Map();
  for (const u of users) {
    const list = byCustomer.get(u.cid) ?? [];
    list.push({ receivesLeads: u.receivesLeads, leadReceivedAt: u.leadReceivedAt ? new Date(u.leadReceivedAt) : null });
    byCustomer.set(u.cid, list);
  }
  const dayStart = berlinDayStart(new Date());
  const changes = customers.map((c) => {
    const members = byCustomer.get(c.id) ?? [];
    return seatChange({
      customerId: c.id,
      name: c.name,
      included: c.included,
      price: Number(c.price ?? 0),
      billed: c.billed,
      logins: members.length,
      active: countActiveSellers(members, dayStart),
    });
  });
  if (asJson) {
    console.log(JSON.stringify(changes, null, 2));
  } else {
    const relevant = changes.filter((c) => c.kind !== "gleich" || c.legacy !== c.next);
    console.log(`Trockenlauf aktive Verkäufer · ${changes.length} Kunden mit Platz-Abrechnung · ${relevant.length} mit Unterschied\n`);
    console.log(["Kunde", "inkl.", "Preis", "Logins", "aktiv", "bisher", "alte Regel", "neu", "Art"].join(" | "));
    for (const c of relevant) {
      console.log([c.name, c.included, `${c.price} €`, c.logins, c.active, c.billed, c.legacy, c.next, c.kind].join(" | "));
    }
    const fewer = changes.filter((c) => c.kind === "weniger");
    const more = changes.filter((c) => c.kind === "nachberechnung");
    console.log(`\nweniger: ${fewer.length} Kunden, zusammen −${fewer.reduce((a, c) => a + (c.billed - c.next) * c.price, 0)} € netto im Monat`);
    console.log(`nachberechnung (bisher zu wenig berechnet, nie über alter Regel): ${more.length} Kunden`);
    if (changes.some((c) => c.next > c.legacy)) {
      console.error("FEHLER: neue Menge über der alten Regel. Bitte nicht deployen.");
      process.exitCode = 2;
    }
  }
} finally {
  await client.end();
}
