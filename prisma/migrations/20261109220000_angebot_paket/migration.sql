-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "package" TEXT NOT NULL DEFAULT 'software',
ADD COLUMN     "stripeScheduleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Offer_stripeScheduleId_key" ON "Offer"("stripeScheduleId");
