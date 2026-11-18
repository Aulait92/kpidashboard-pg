-- Paket M5: Beratungsdokumentation (LeadFile.kind „beratungsdoku“) bleibt beim Löschen des Leads bis zu diesem Zeitpunkt
ALTER TABLE "LeadFile" ADD COLUMN "aufbewahrenBis" TIMESTAMP(3);
CREATE INDEX "LeadFile_aufbewahrenBis_idx" ON "LeadFile"("aufbewahrenBis");
