-- Vertriebskontakte: Adresse aus dem Impressum ergänzen (nur hinzufügend)
ALTER TABLE "SalesContact" ADD COLUMN "addressEnrichTriedAt" TIMESTAMP(3);
ALTER TABLE "SalesContact" ADD COLUMN "addressEnrichedAt" TIMESTAMP(3);
