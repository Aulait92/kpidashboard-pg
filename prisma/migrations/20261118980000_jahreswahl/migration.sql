-- Jahreszahlung im Angebot zur Wahl (Ole, 18.11.2026): Kunde wählt bei der Annahme monatlich oder jährlich im Voraus.
ALTER TABLE "Offer" ADD COLUMN "annualChoice" BOOLEAN NOT NULL DEFAULT false;
