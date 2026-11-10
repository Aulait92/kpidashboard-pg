-- Neue Admin-Oberfläche (Admin-A) pro Admin-Benutzer einschaltbar; Standard bleibt die bisherige Oberfläche.
ALTER TABLE "User" ADD COLUMN "adminNewUi" BOOLEAN NOT NULL DEFAULT false;
