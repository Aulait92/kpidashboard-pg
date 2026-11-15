-- Ausgehende E-Mails im Kontaktverlauf (Ole, 15.11.2026): Tabelle ContactMail und Verweis am Lead-Verlauf. Nur Ergänzungen.
-- AlterTable
ALTER TABLE "LeadHistory" ADD COLUMN     "mailId" TEXT;

-- CreateTable
CREATE TABLE "ContactMail" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "leadId" TEXT,
    "existingCustomerId" TEXT,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "automatic" BOOLEAN NOT NULL DEFAULT true,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'versendet',
    "reason" TEXT,
    "statusAt" TIMESTAMP(3),
    "provider" TEXT,
    "providerMessageId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactMail_leadId_createdAt_idx" ON "ContactMail"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "ContactMail_existingCustomerId_createdAt_idx" ON "ContactMail"("existingCustomerId", "createdAt");

-- CreateIndex
CREATE INDEX "ContactMail_providerMessageId_idx" ON "ContactMail"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadHistory_mailId_key" ON "LeadHistory"("mailId");

-- AddForeignKey
ALTER TABLE "LeadHistory" ADD CONSTRAINT "LeadHistory_mailId_fkey" FOREIGN KEY ("mailId") REFERENCES "ContactMail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMail" ADD CONSTRAINT "ContactMail_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactMail" ADD CONSTRAINT "ContactMail_existingCustomerId_fkey" FOREIGN KEY ("existingCustomerId") REFERENCES "ExistingCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
