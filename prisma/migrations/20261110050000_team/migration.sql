
-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "calendarKey" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "assignedUserId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "lastLeadAssignedAt" TIMESTAMP(3),
ADD COLUMN     "receivesLeads" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "teamRole" TEXT NOT NULL DEFAULT 'owner';

-- CreateTable
CREATE TABLE "AdvisorCalendar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "accountEmail" TEXT,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvisorCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdvisorCalendar_userId_key" ON "AdvisorCalendar"("userId");

-- CreateIndex
CREATE INDEX "AdvisorCalendar_customerId_idx" ON "AdvisorCalendar"("customerId");

-- CreateIndex
CREATE INDEX "Lead_assignedUserId_idx" ON "Lead"("assignedUserId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvisorCalendar" ADD CONSTRAINT "AdvisorCalendar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

