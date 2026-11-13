-- Monatsberichte (lib/monatsbericht): Bericht je Kunde und Monat, Einstellungen, Schalter je Kunde. Nur hinzufügend.
-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "monthlyReportsOff" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MonthlyReport" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "dataQuality" TEXT NOT NULL DEFAULT 'ok',
    "reasons" JSONB,
    "metrics" JSONB NOT NULL,
    "subject" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "check" JSONB,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "autoSendGood" BOOLEAN NOT NULL DEFAULT false,
    "senderName" TEXT,
    "goodLeadsPct" INTEGER NOT NULL DEFAULT 85,
    "weakLeadsPct" INTEGER NOT NULL DEFAULT 60,
    "weakCplPct" INTEGER NOT NULL DEFAULT 150,
    "weakNoMeetingLeads" INTEGER NOT NULL DEFAULT 15,
    "minResultPct" INTEGER NOT NULL DEFAULT 50,
    "minActiveDays" INTEGER NOT NULL DEFAULT 14,
    "targetCpl" DECIMAL(10,2),
    "bookingUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthlyReport_month_status_idx" ON "MonthlyReport"("month", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyReport_customerId_month_key" ON "MonthlyReport"("customerId", "month");

-- AddForeignKey
ALTER TABLE "MonthlyReport" ADD CONSTRAINT "MonthlyReport_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
