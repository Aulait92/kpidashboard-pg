-- Ole, 20.11.2026: Assistent und Erstanschreiben bei allen verbundenen Kunden einschalten (neue Verbindungen
-- schalten es seitdem selbst ein, lib/whatsapp/self-connect.ts onConnected). Support-Nummer ausgenommen.
INSERT INTO "AgentConfig" ("id", "customerId", "active", "outreachEnabled", "updatedAt")
SELECT 'agent_an_' || md5(w."customerId"), w."customerId", true, true, NOW()
FROM "WhatsAppAccount" w
WHERE w."status" = 'connected' AND w."customerId" <> 'cust_pg_support'
ON CONFLICT ("customerId") DO UPDATE SET "active" = true, "outreachEnabled" = true, "updatedAt" = NOW();
