-- AlterTable
ALTER TABLE "AgentConfig" ADD COLUMN     "allianzAlertAt" TIMESTAMP(3),
ADD COLUMN     "allianzCalendarEnc" TEXT,
ADD COLUMN     "allianzConsentAt" TIMESTAMP(3),
ADD COLUMN     "allianzLastError" TEXT,
ADD COLUMN     "allianzLastOkAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CalendarLeadTimes" (
    "calendarKey" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "weekdays" INTEGER[],
    "times" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarLeadTimes_pkey" PRIMARY KEY ("calendarKey")
);

-- CreateTable
CREATE TABLE "CalendarBlock" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "calendarKey" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarLeadTimes_customerId_idx" ON "CalendarLeadTimes"("customerId");

-- CreateIndex
CREATE INDEX "CalendarBlock_calendarKey_endsAt_idx" ON "CalendarBlock"("calendarKey", "endsAt");

-- CreateIndex
CREATE INDEX "CalendarBlock_customerId_idx" ON "CalendarBlock"("customerId");

-- AddForeignKey
ALTER TABLE "CalendarLeadTimes" ADD CONSTRAINT "CalendarLeadTimes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarBlock" ADD CONSTRAINT "CalendarBlock_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

