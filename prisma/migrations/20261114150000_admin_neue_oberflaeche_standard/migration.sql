-- Neue Admin-Oberfläche (Admin-A) ist ab jetzt Standard für alle Admins (Ole, 11.11.).
-- Umschalten bleibt im Profilmenü möglich.
ALTER TABLE "User" ALTER COLUMN "adminNewUi" SET DEFAULT true;
UPDATE "User" SET "adminNewUi" = true WHERE "role" = 'ADMIN';
