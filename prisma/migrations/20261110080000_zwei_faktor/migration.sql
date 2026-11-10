-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totpBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpSecretEnc" TEXT;

