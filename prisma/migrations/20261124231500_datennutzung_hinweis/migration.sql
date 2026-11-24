-- Hinweis „KI-Hilfe und gemeinsames Anzeigenlernen“ (Ole, 24.11.2026, lib/datennutzung.ts): Banner im Kundenbereich
-- mit Widerspruch je Punkt. Additiv: Stand am Kunden (erste Anzeige, „Verstanden“, Widerspruch Anzeigenlernen,
-- Widerspruch Amazon Web Services) und die Nachweis-Tabelle (nur anhängen, Trigger in 20261124231600).
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "datennutzungAngezeigtAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "datennutzungAngezeigtVersion" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "datennutzungVerstandenAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "datennutzungVerstandenVersion" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "datennutzungVerstandenUserId" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "anzeigenlernenWiderspruchAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "anzeigenlernenWiderspruchUserId" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "awsWiderspruchAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "awsWiderspruchUserId" TEXT;

CREATE TABLE IF NOT EXISTS "DatennutzungNachweis" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "art" TEXT NOT NULL,
    "punkt" TEXT,
    "textVersion" TEXT NOT NULL,
    "wortlaut" TEXT,
    "userId" TEXT,
    "userEmail" TEXT,
    "quelle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DatennutzungNachweis_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DatennutzungNachweis_customerId_createdAt_idx" ON "DatennutzungNachweis"("customerId", "createdAt");
