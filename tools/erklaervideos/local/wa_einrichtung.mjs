// Erfundene Demo-Daten für das Video „WhatsApp verbinden“ (Einrichtung bis Schritt 8 offen).
// Aufruf: DATABASE_URL=postgresql://…/ev_wa_video node tools/erklaervideos/local/wa_einrichtung.mjs
// Login danach: max.mustermann@gmail.com / Demo12345!  (nur lokale Wegwerf-Datenbank)
import pg from "pg";
import bcrypt from "bcryptjs";

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const hash = await bcrypt.hash("Demo12345!", 10);
await c.query(`DELETE FROM "WhatsAppAccount" WHERE "customerId" = 'cust_wa_demo'`);
await c.query(
  `INSERT INTO "Customer" (id, name, plan, "retainerMonthly", "billingInterval", "retainerStart", "metaAdAccountId", "metaPageId", "newUi")
   VALUES ('cust_wa_demo', 'Max Mustermann Versicherungen', 'software', 349, 'month', '2026-11-20', '123456789012345', '556677889900', true)
   ON CONFLICT (id) DO NOTHING`,
);
await c.query(
  `INSERT INTO "User" (id, email, "passwordHash", role, "customerId", "teamRole", "displayName", "lastLoginAt")
   VALUES ('usr_wa_demo', 'max.mustermann@gmail.com', $1, 'BUYER', 'cust_wa_demo', 'owner', 'Max Mustermann', now())
   ON CONFLICT (id) DO NOTHING`,
  [hash],
);
await c.query(
  `INSERT INTO "Offer" (id, number, token, "contactName", term, products, "setupFee", "monthlyFee", "softwareFee", "validUntil", status, "updatedAt", "startDate")
   VALUES ('off_wa_demo', 'PG-2026-0999', 'tok-wa-demo', 'Max Mustermann', '12m', '[]', 0, 349, 349, '2026-12-31', 'accepted', now(), '2026-11-20')
   ON CONFLICT (id) DO NOTHING`,
);
const check = { at: new Date().toISOString(), adAccount: { id: "123456789012345", ok: true }, page: { id: "556677889900", ok: true, name: "Max Mustermann Versicherungen" }, leads: { ok: true }, ok: true };
await c.query(
  `INSERT INTO "Onboarding" (id, "customerId", "offerId", package, "startDate", "welcomeSentAt", "questionnaire", "questionnaireAt", "metaCheck", "metaCheckedAt", "createdAt", "updatedAt")
   VALUES ('ob_wa_demo', 'cust_wa_demo', 'off_wa_demo', 'software', '2026-11-20', now() - interval '2 days', '{"callbackBy":"Max Mustermann","formats":["telefon"]}', now() - interval '1 day', $1, now(), now() - interval '2 days', now())
   ON CONFLICT (id) DO NOTHING`,
  [JSON.stringify(check)],
);
// „App aufs Handy“ als erledigt, sonst steht dort die lokale Adresse (localhost) im Bild
await c.query(`UPDATE "Onboarding" SET "appSkippedAt" = now() WHERE id = 'ob_wa_demo'`);
await c.end();
console.log("ok");
