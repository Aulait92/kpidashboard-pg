-- Support-Nummer: Chats Vertriebskontakt/Kunde zuordnen; WhatsApp-Terminbestätigung für Vertriebstermine (Ole, 15.11.2026)
-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "contactLinkManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contactMatchedAt" TIMESTAMP(3),
ADD COLUMN     "linkedCustomerId" TEXT,
ADD COLUMN     "salesContactId" TEXT;

-- AlterTable
ALTER TABLE "SalesMeeting" ADD COLUMN     "waConfirmAt" TIMESTAMP(3),
ADD COLUMN     "waConfirmError" TEXT,
ADD COLUMN     "waConfirmStatus" TEXT;

-- CreateIndex
CREATE INDEX "Conversation_salesContactId_idx" ON "Conversation"("salesContactId");

-- CreateIndex
CREATE INDEX "Conversation_linkedCustomerId_idx" ON "Conversation"("linkedCustomerId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_salesContactId_fkey" FOREIGN KEY ("salesContactId") REFERENCES "SalesContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_linkedCustomerId_fkey" FOREIGN KEY ("linkedCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

