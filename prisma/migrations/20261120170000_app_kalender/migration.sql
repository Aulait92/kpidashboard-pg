-- App-Kalender (Ole, 20.11.2026, lib/calendar/app-kalender.ts): Kunden mit Allianz-Online-Kalender oder Kalender-Link (ICS),
-- aber ohne verbundenen Google-/Outlook-Kalender, buchen ab jetzt über den App-Kalender (Einladung per Mail).
INSERT INTO "GoogleCalendarConnection" ("id", "customerId", "provider", "status", "calendarId", "createdAt", "updatedAt")
SELECT 'app_' || md5(random()::text || a."customerId"), a."customerId", 'app', 'connected', 'primary', NOW(), NOW()
FROM "AgentConfig" a
WHERE (a."allianzCalendarEnc" IS NOT NULL OR a."availabilityIcsUrlEnc" IS NOT NULL)
ON CONFLICT ("customerId") DO UPDATE
SET "provider" = 'app', "status" = 'connected', "accessTokenEnc" = NULL, "refreshTokenEnc" = NULL, "tokenExpiresAt" = NULL,
    "accountEmail" = NULL, "scope" = NULL, "calendarId" = 'primary', "updatedAt" = NOW()
WHERE "GoogleCalendarConnection"."status" <> 'connected';
