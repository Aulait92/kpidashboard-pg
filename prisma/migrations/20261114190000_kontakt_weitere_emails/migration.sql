-- Weitere E-Mail-Adressen je Vertriebskontakt (nur hinzufügend)
ALTER TABLE "SalesContact" ADD COLUMN "altEmails" TEXT[] DEFAULT ARRAY[]::TEXT[] NOT NULL;
CREATE INDEX "SalesContact_altEmails_idx" ON "SalesContact" USING GIN ("altEmails");
