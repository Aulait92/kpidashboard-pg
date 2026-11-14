-- Interner Kunde für das WhatsApp-Support-Postfach von performancegrowth (lib/whatsapp/support-inbox.ts).
-- plan "internal" = taucht in Zahlen, Abrechnung und Auswertungen nicht auf. Keine Logins.
INSERT INTO "Customer" ("id", "name", "plan")
VALUES ('cust_pg_support', 'performancegrowth Support', 'internal')
ON CONFLICT DO NOTHING;
