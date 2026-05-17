-- Drop & recreate Creative tables.
--
-- The earlier add_creative_tables migration was marked-as-applied against
-- a prod DB whose actual schema still held the pre-Telegram column names
-- (whatsappFrom, whatsappMsgId). No real data has been written to either
-- table yet, so the safest deterministic fix is to drop and recreate with
-- the current schema rather than diff-detecting renames.

DROP TABLE IF EXISTS "CreativeVariant" CASCADE;
DROP TABLE IF EXISTS "CreativeRequest" CASCADE;

CREATE TABLE "CreativeRequest" (
    "id" TEXT NOT NULL,
    "telegramChatId" TEXT NOT NULL,
    "rawPrompt" TEXT NOT NULL,
    "parsedIntent" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generating',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreativeVariant" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "imagePrompt" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "metaCampaignId" TEXT,
    "metaAdId" TEXT,
    "metaImageHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "telegramMsgId" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "CreativeVariant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CreativeRequest_telegramChatId_createdAt_idx" ON "CreativeRequest"("telegramChatId", "createdAt");
CREATE INDEX "CreativeVariant_requestId_status_idx" ON "CreativeVariant"("requestId", "status");
CREATE INDEX "CreativeVariant_telegramMsgId_idx" ON "CreativeVariant"("telegramMsgId");

ALTER TABLE "CreativeVariant" ADD CONSTRAINT "CreativeVariant_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CreativeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
