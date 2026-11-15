// Zustand des WhatsApp-Schritts für das Video setzen: node wa_state.mjs neu|invited|pending|connected
import pg from "pg";

const state = process.argv[2] ?? "neu";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query(`DELETE FROM "WhatsAppAccount" WHERE "customerId" = 'cust_wa_demo'`);
if (state !== "neu") {
  await c.query(
    `INSERT INTO "WhatsAppAccount" (id, "customerId", provider, status, "dialog360ClientId", "dialog360ChannelId", "phoneNumber", "updatedAt")
     VALUES ('wa_demo', 'cust_wa_demo', '360dialog', $1, 'demo-client', $2, $3, now())`,
    [state, state === "invited" ? null : "demo-channel", state === "connected" ? "+49 151 23456789" : null],
  );
}
await c.end();
console.log("state", state);
