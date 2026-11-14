-- Zusatzpakete für Kampagnen-Nachrichten im Bestandskunden-Modul (Ole, 14.11.2026).
-- Pakete gelten 3 Monate; Verbrauch erst Monatskontingent, dann ältestes Paket (CampaignRecipient.packId).
-- Laufende Kampagnen pausieren am Limit mit Grund (CustomerCampaign.pausedReason).
-- Optional automatisch nachbuchen bis Höchstbetrag je Monat (Customer.bestandAutoTopUpMax, Standard aus).
-- Nur hinzufügend.
ALTER TABLE "Customer" ADD COLUMN "bestandAutoTopUpMax" INTEGER;

ALTER TABLE "CustomerCampaign" ADD COLUMN "pausedReason" TEXT;

ALTER TABLE "CampaignRecipient" ADD COLUMN "packId" TEXT;

CREATE TABLE "BestandMessagePack" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "messages" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'kauf',
    "createdById" TEXT,
    "stripeInvoiceItemId" TEXT,
    "stripeInvoiceId" TEXT,
    "stripeStatus" TEXT NOT NULL DEFAULT 'added',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BestandMessagePack_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BestandMessagePack_customerId_expiresAt_idx" ON "BestandMessagePack"("customerId", "expiresAt");

CREATE INDEX "BestandMessagePack_purchasedAt_idx" ON "BestandMessagePack"("purchasedAt");

CREATE INDEX "CampaignRecipient_packId_idx" ON "CampaignRecipient"("packId");

ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_packId_fkey" FOREIGN KEY ("packId") REFERENCES "BestandMessagePack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BestandMessagePack" ADD CONSTRAINT "BestandMessagePack_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
