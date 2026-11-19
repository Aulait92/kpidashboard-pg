-- Datenschutz und Recht im Vertrieb (Ole, 19.11.2026): nur additiv
ALTER TABLE "SalesEmail" ADD COLUMN "rechtsArt" TEXT;

CREATE TABLE "DatenschutzFallEreignis" (
    "id" TEXT NOT NULL,
    "fallId" TEXT NOT NULL,
    "contactId" TEXT,
    "ereignis" TEXT NOT NULL,
    "art" TEXT NOT NULL,
    "eingangAt" TIMESTAMP(3) NOT NULL,
    "fristAt" TIMESTAMP(3) NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wer" TEXT NOT NULL,
    "detail" TEXT,
    "instantlyEmailId" TEXT,
    "postfach" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DatenschutzFallEreignis_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DatenschutzFallEreignis_fallId_idx" ON "DatenschutzFallEreignis"("fallId");
CREATE INDEX "DatenschutzFallEreignis_contactId_idx" ON "DatenschutzFallEreignis"("contactId");
CREATE INDEX "DatenschutzFallEreignis_eingangAt_idx" ON "DatenschutzFallEreignis"("eingangAt");
