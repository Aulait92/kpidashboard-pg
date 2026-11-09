
-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "leadEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "paymentOverdueSince" TIMESTAMP(3),
ADD COLUMN     "paymentWarnedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CustomerPause" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'customer';

