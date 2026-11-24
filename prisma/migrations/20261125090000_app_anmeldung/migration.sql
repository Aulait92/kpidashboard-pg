-- iPhone-App (Ole, 24.11.2026): App-Anmeldung je Login, iPhone gesehen, Hinweiskarte weggeklickt (lib/app-store.ts)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "appLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "iphoneSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "appHinweisAusAt" TIMESTAMP(3);

-- Nachtragen: wer schon ein Gerät der App-Store-App hat, war in der App angemeldet
UPDATE "User" u SET "appLoginAt" = d.first
FROM (SELECT "userId", MIN("createdAt") AS first FROM "DeviceToken" GROUP BY "userId") d
WHERE d."userId" = u."id" AND u."appLoginAt" IS NULL;

-- iPhone gesehen: App-Gerät mit iOS oder Web-Push von einem iPhone
UPDATE "User" u SET "iphoneSeenAt" = d.first
FROM (SELECT "userId", MIN("createdAt") AS first FROM "DeviceToken" WHERE "platform" = 'ios' GROUP BY "userId") d
WHERE d."userId" = u."id" AND u."iphoneSeenAt" IS NULL;
UPDATE "User" u SET "iphoneSeenAt" = p.first
FROM (SELECT "userId", MIN("createdAt") AS first FROM "PushSubscription" WHERE "userId" IS NOT NULL AND "userAgent" LIKE '%iPhone%' GROUP BY "userId") p
WHERE p."userId" = u."id" AND u."iphoneSeenAt" IS NULL;
