-- Dateien im WhatsApp-Chat sichtbar machen (Ole, 25.11.2026): Metadaten je Nachricht (additiv) und Protokoll der
-- Support-Zugriffe (lib/support-zugriff.ts).
ALTER TABLE "Message" ADD COLUMN "mediaId" TEXT;
ALTER TABLE "Message" ADD COLUMN "mediaName" TEXT;
ALTER TABLE "Message" ADD COLUMN "mediaMime" TEXT;
ALTER TABLE "Message" ADD COLUMN "mediaSize" INTEGER;
ALTER TABLE "Message" ADD COLUMN "mediaLink" TEXT;

CREATE TABLE "SupportZugriff" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "leadId" TEXT,
    "adminUserId" TEXT NOT NULL,
    "adminName" TEXT NOT NULL,
    "grund" TEXT NOT NULL,
    "dateiName" TEXT NOT NULL,
    "mitteilung" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportZugriff_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportZugriff_customerId_createdAt_idx" ON "SupportZugriff"("customerId", "createdAt");
