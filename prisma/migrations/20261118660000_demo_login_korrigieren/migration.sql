-- Demo-Login für die Google-Prüfung gehört zum eigenen Demo-Kunden (Ole, 14.11.2026).
-- 20261118491000_demo_kunde_google_pruefung legt den Login mit ON CONFLICT DO NOTHING an. Gab es die
-- E-Mail schon (z. B. von Hand bei einem echten Kunden angelegt), blieb der Login dort hängen.
-- Diese Migration ist idempotent: Kunde anlegen, falls er fehlt, Login umhängen, fremde Zuweisungen lösen.

INSERT INTO "Customer" ("id", "name", "plan", "newUi")
VALUES ('cust_google_review_demo', 'Google Review Demo', 'internal', true)
ON CONFLICT ("id") DO NOTHING;

-- Zuweisungen dieses Logins bei anderen Kunden aufheben (Leads und WhatsApp-Gespräche).
UPDATE "Lead" SET "assignedUserId" = NULL
WHERE "customerId" <> 'cust_google_review_demo'
  AND "assignedUserId" IN (
    SELECT "id" FROM "User" WHERE "email" = 'google-review-demo@performancegrowth.de' AND "role" = 'BUYER'
  );

UPDATE "Conversation" SET "assignedUserId" = NULL
WHERE "customerId" <> 'cust_google_review_demo'
  AND "assignedUserId" IN (
    SELECT "id" FROM "User" WHERE "email" = 'google-review-demo@performancegrowth.de' AND "role" = 'BUYER'
  );

-- Login an den Demo-Kunden hängen, als Inhaber ohne Lead-Verteilung. Wechselt der Kunde,
-- steigt die Sitzungsversion: der Kunde steht im Sitzungs-Cookie, alte Sitzungen enden.
UPDATE "User" SET
  "sessionVersion" = "sessionVersion" + CASE WHEN "customerId" IS DISTINCT FROM 'cust_google_review_demo' THEN 1 ELSE 0 END,
  "customerId" = 'cust_google_review_demo',
  "teamRole" = 'owner',
  "receivesLeads" = false
WHERE "email" = 'google-review-demo@performancegrowth.de' AND "role" = 'BUYER';
