-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "optedOutAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "consentData" JSONB,
ADD COLUMN     "waConsent" TEXT;

-- AlterTable
ALTER TABLE "LeadSource" ADD COLUMN     "consentText" TEXT,
ADD COLUMN     "consentVersion" TEXT;

-- CreateTable
CREATE TABLE "Erstinformation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "registerNummer" TEXT,
    "statusAt" TIMESTAMP(3),
    "url" TEXT,
    "fileName" TEXT,
    "contentType" TEXT,
    "size" INTEGER,
    "data" BYTEA,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Erstinformation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Erstinformation_customerId_key" ON "Erstinformation"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Erstinformation_token_key" ON "Erstinformation"("token");

-- AddForeignKey
ALTER TABLE "Erstinformation" ADD CONSTRAINT "Erstinformation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

