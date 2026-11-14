-- Gewinn auf /buyer/zahlen standardmäßig „Inkl. Bestand“ (Ole, 14.11.2026). Der Schalter ist von heute, eine bewusste
-- Wahl „Nur jetzt“ lässt sich nicht unterscheiden: alle bestehenden Logins einmalig auf „Inkl. Bestand“.
ALTER TABLE "User" ALTER COLUMN "gewinnMitBestand" SET DEFAULT true;
UPDATE "User" SET "gewinnMitBestand" = true WHERE "gewinnMitBestand" = false;
