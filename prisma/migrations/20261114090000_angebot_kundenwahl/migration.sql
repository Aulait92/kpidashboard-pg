-- Kunde wählt Laufzeit und Startdatum auf der Angebotsseite selbst (nur hinzufügend).
-- Bestehende Angebote: false = bisheriges Verhalten (feste Konditionen).
ALTER TABLE "Offer" ADD COLUMN "customerChoosesTerm" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Offer" ADD COLUMN "customerChoosesStart" BOOLEAN NOT NULL DEFAULT false;
