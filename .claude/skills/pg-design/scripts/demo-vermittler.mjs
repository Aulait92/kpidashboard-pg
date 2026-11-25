// Legt einen Demo-Vermittler mit 3 erfundenen Leads in einer LOKALEN Datenbank an (nie Produktion).
// Aufruf aus dem Repo-Ordner: DATABASE_URL=postgresql://postgres:pg@localhost:5432/<db> node .claude/skills/pg-design/scripts/demo-vermittler.mjs
// Login danach: design@test.local / Test-Passwort-123 (Software-Kunde, neue Oberfläche, Inhaber).
// Andere Zustände (z. B. Team-Berater, offene Einrichtung, keine Leads) hier ergänzen.
import pg from "pg";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("Nur gegen eine lokale Datenbank (localhost). DATABASE_URL prüfen.");
  process.exit(1);
}
const c = new pg.Client({ connectionString: url });
await c.connect();
const hash = await bcrypt.hash("Test-Passwort-123", 10);
const cid = "design_kunde";
await c.query(`delete from "Lead" where "customerId"=$1`, [cid]);
await c.query(`delete from "User" where email=$1`, ["design@test.local"]);
await c.query(`delete from "Onboarding" where "customerId"=$1`, [cid]);
await c.query(`delete from "Customer" where id=$1`, [cid]);
await c.query(
  `insert into "Customer"(id,name,"vermittlerTyp","newUi","retainerMonthly","retainerStart") values($1,'Agentur Max Berger','vertreter',true,990,now() - interval '40 days')`,
  [cid],
);
await c.query(`insert into "Onboarding"(id,"customerId",package,"updatedAt") values('ob_design',$1,'software',now())`, [cid]);
await c.query(
  `insert into "User"(id,email,"passwordHash",role,"customerId","teamRole","displayName") values('u_design','design@test.local',$1,'BUYER',$2,'owner','Max Berger')`,
  [hash, cid],
);
const namen = ["Lea Schulz", "Tim Krüger", "Mia Wolf"];
for (let i = 0; i < namen.length; i++)
  await c.query(
    `insert into "Lead"(id,"customerId",name,phone,source,status,reached) values($1,$2,$3,$4,'Hausrat','Neuer Lead',false)`,
    [`l_design_${i}`, cid, namen[i], `+4915100000${70 + i}`],
  );
console.log("Demo-Vermittler angelegt: design@test.local / Test-Passwort-123");
await c.end();
