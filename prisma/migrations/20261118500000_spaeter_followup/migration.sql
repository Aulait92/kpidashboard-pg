-- Später-Follow-ups: Postfach an der E-Mail, Follow-up je Kontakt, Einstellungen. Nur hinzufügend.
-- AlterTable
ALTER TABLE "SalesEmail" ADD COLUMN     "eaccount" TEXT;

-- CreateTable
CREATE TABLE "SalesFollowup" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "activeFor" TEXT,
    "status" TEXT NOT NULL DEFAULT 'GEPLANT',
    "step" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "nextAt" TIMESTAMP(3) NOT NULL,
    "timing" TEXT,
    "replyEmailId" TEXT,
    "subject" TEXT,
    "body1" TEXT,
    "body2" TEXT,
    "textSource" TEXT,
    "mail1SentAt" TIMESTAMP(3),
    "mail2SentAt" TIMESTAMP(3),
    "sendingAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "stoppedAt" TIMESTAMP(3),
    "stopReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesFollowup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesFollowupSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "perDay" INTEGER NOT NULL DEFAULT 15,
    "useAi" BOOLEAN NOT NULL DEFAULT true,
    "bookingUrl" TEXT,
    "pitch" TEXT NOT NULL DEFAULT 'Wir sorgen über Meta-Werbung für planbare Kundenanfragen in Ihrer Region. Ein WhatsApp-Assistent meldet sich sofort bei jeder Anfrage und vereinbart Termine für Sie.',
    "backfillAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesFollowupSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesFollowup_activeFor_key" ON "SalesFollowup"("activeFor");

-- CreateIndex
CREATE INDEX "SalesFollowup_status_nextAt_idx" ON "SalesFollowup"("status", "nextAt");

-- CreateIndex
CREATE INDEX "SalesFollowup_contactId_idx" ON "SalesFollowup"("contactId");

-- AddForeignKey
ALTER TABLE "SalesFollowup" ADD CONSTRAINT "SalesFollowup_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "SalesContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

