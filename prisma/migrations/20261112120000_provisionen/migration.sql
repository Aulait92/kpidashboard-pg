-- Provisionen: Vermittlertyp (Vertreter/Makler) und eigene Provisionssätze je Kunde (nur hinzufügend).
ALTER TABLE "Customer" ADD COLUMN "vermittlerTyp" TEXT NOT NULL DEFAULT 'vertreter';
ALTER TABLE "Customer" ADD COLUMN "provisionRates" JSONB;
