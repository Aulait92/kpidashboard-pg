-- Admin: Buchungen zuletzt angesehen (Hinweis „neue Buchungen seit Ihrem letzten Besuch“ auf Heute)
ALTER TABLE "User" ADD COLUMN "buchungenSeenAt" TIMESTAMP(3);
-- Startpunkt für bestehende Admins: jetzt (sonst zählt der erste Hinweis alle alten Buchungen)
UPDATE "User" SET "buchungenSeenAt" = NOW() WHERE "role" = 'ADMIN';
