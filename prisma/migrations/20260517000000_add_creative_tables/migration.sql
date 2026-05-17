-- CreateTable
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

-- CreateTable
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

-- CreateIndex
CREATE INDEX "CreativeRequest_telegramChatId_createdAt_idx" ON "CreativeRequest"("telegramChatId", "createdAt");

-- CreateIndex
CREATE INDEX "CreativeVariant_requestId_status_idx" ON "CreativeVariant"("requestId", "status");

-- CreateIndex
CREATE INDEX "CreativeVariant_telegramMsgId_idx" ON "CreativeVariant"("telegramMsgId");

-- AddForeignKey
ALTER TABLE "CreativeVariant" ADD CONSTRAINT "CreativeVariant_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CreativeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

