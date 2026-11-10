-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "billable" BOOLEAN,
ADD COLUMN     "pricingCategory" TEXT;

-- CreateTable
CREATE TABLE "WhatsAppFeeCharge" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "counts" JSONB NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "stripeInvoiceItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppFeeCharge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppFeeCharge_customerId_month_key" ON "WhatsAppFeeCharge"("customerId", "month");

-- CreateIndex
CREATE INDEX "Message_billable_createdAt_idx" ON "Message"("billable", "createdAt");

-- AddForeignKey
ALTER TABLE "WhatsAppFeeCharge" ADD CONSTRAINT "WhatsAppFeeCharge_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

