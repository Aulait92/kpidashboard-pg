-- Maklervollmacht digital mit Übernahme bestehender Verträge (Ole, 18.11.2026; nur Makler)
CREATE TABLE IF NOT EXISTS "Maklervollmacht" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offen',
    "ansprache" TEXT NOT NULL DEFAULT 'sie',
    "daten" JSONB,
    "vertraege" JSONB,
    "gesundheit" BOOLEAN NOT NULL DEFAULT false,
    "textVersion" TEXT,
    "signatur" BYTEA,
    "pdf" BYTEA,
    "signedAt" TIMESTAMP(3),
    "signedIp" TEXT,
    "signedUa" TEXT,
    "sentAt" TIMESTAMP(3),
    "widerrufenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Maklervollmacht_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Maklervollmacht_token_key" ON "Maklervollmacht"("token");
CREATE INDEX IF NOT EXISTS "Maklervollmacht_leadId_idx" ON "Maklervollmacht"("leadId");
CREATE INDEX IF NOT EXISTS "Maklervollmacht_customerId_idx" ON "Maklervollmacht"("customerId");
DO $$ BEGIN
  ALTER TABLE "Maklervollmacht" ADD CONSTRAINT "Maklervollmacht_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Maklervollmacht" ADD CONSTRAINT "Maklervollmacht_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
