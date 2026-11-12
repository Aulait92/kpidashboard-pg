-- Bewertungs-Wächter (Teil des Moduls „Empfehlungen & Bewertungen“, 12.11.2026). Nur hinzufügend.
-- Verbindung zum Google-Unternehmensprofil (Tokens verschlüsselt) und abgeglichene Bewertungen
-- (nur ID, Sterne, Text, Name, Zeitpunkt; Löschfrist 2 Jahre).

-- CreateTable
CREATE TABLE "GoogleBusinessConnection" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "expiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending_location',
    "accountName" TEXT,
    "locationName" TEXT,
    "locationTitle" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "startAverage" DOUBLE PRECISION,
    "startCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleBusinessConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleReview" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "googleName" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "text" TEXT,
    "reviewerName" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "replyText" TEXT,
    "repliedAt" TIMESTAMP(3),
    "suggestedReply" TEXT,
    "leadId" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleBusinessConnection_customerId_key" ON "GoogleBusinessConnection"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleReview_googleName_key" ON "GoogleReview"("googleName");

-- CreateIndex
CREATE INDEX "GoogleReview_customerId_reviewedAt_idx" ON "GoogleReview"("customerId", "reviewedAt");

-- AddForeignKey
ALTER TABLE "GoogleBusinessConnection" ADD CONSTRAINT "GoogleBusinessConnection_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleReview" ADD CONSTRAINT "GoogleReview_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleReview" ADD CONSTRAINT "GoogleReview_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
