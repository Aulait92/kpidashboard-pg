-- Halteangebote beim Kündigen (Ole, 15.11.2026): angenommene Angebote, Einstellungen, Bindung nach Rabatt,
-- Rückkehrangebot nach Vertragsende, Pause ohne Kosten. Nur additiv.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "retentionCommitUntil" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "winbackOfferAt" TIMESTAMP(3);
ALTER TABLE "CustomerPause" ADD COLUMN IF NOT EXISTS "free" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "RetentionOffer" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "intentId" TEXT,
    "userId" TEXT,
    "reason" TEXT,
    "kind" TEXT NOT NULL,
    "discount" BOOLEAN NOT NULL DEFAULT false,
    "stripeStatus" TEXT NOT NULL DEFAULT 'none',
    "stripeCouponId" TEXT,
    "percentOff" INTEGER,
    "months" INTEGER,
    "commitUntil" TIMESTAMP(3),
    "mrrBefore" DECIMAL(12,2),
    "mrrSaved" DECIMAL(12,2),
    "details" JSONB,
    "cancelledLaterAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RetentionOffer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RetentionOffer_intentId_kind_key" ON "RetentionOffer"("intentId", "kind");
CREATE INDEX IF NOT EXISTS "RetentionOffer_customerId_createdAt_idx" ON "RetentionOffer"("customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "RetentionOffer_kind_createdAt_idx" ON "RetentionOffer"("kind", "createdAt");
DO $$ BEGIN
  ALTER TABLE "RetentionOffer" ADD CONSTRAINT "RetentionOffer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "RetentionOfferSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "config" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RetentionOfferSettings_pkey" PRIMARY KEY ("id")
);
