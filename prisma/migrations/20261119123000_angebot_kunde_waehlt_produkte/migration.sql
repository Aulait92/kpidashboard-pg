-- Kunde wählt Produkte und Tagesbudget auf der Angebotsseite (Ole, 19.11.2026). Standard aus (Altangebote unverändert).
ALTER TABLE "Offer" ADD COLUMN "customerChoosesProducts" BOOLEAN NOT NULL DEFAULT false;
