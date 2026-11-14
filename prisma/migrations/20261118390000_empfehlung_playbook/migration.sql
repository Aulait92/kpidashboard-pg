-- Empfehlungen & Bewertungen: Empfehlungsangebot, Link sofort bei Lob, Anlässe, allgemeiner Link
-- (Aufsteller/Signatur), Nachfassen, einzelne Besucher (Trichter), Rückmeldung an Empfehlende, Dankeschön für Empfehlende (standardmäßig aus).
-- Nur hinzufügend.

-- AlterTable
ALTER TABLE "ReviewSettings" ADD COLUMN     "offerKind" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "offerHeadline" TEXT,
ADD COLUMN     "praiseReferralText" TEXT,
ADD COLUMN     "offerText" TEXT,
ADD COLUMN     "referralOnPraise" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "statusUpdates" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "followUpHours" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN     "rewardKind" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "rewardAmount" INTEGER,
ADD COLUMN     "rewardNote" TEXT,
ADD COLUMN     "rewardTrigger" TEXT NOT NULL DEFAULT 'termin',
ADD COLUMN     "rewardConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "referralAfterAppointment" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "referralAskedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ReferralLink" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'contact',
ADD COLUMN     "lastOccasion" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "referralStatusConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referralNotifiedStage" TEXT,
ADD COLUMN     "referralRewardStatus" TEXT,
ADD COLUMN     "referralRewardDueAt" TIMESTAMP(3),
ADD COLUMN     "referralRewardDoneAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ReferralVisit" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralVisit_linkId_visitorHash_key" ON "ReferralVisit"("linkId", "visitorHash");

-- CreateIndex
CREATE INDEX "ReferralVisit_customerId_createdAt_idx" ON "ReferralVisit"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReferralVisit" ADD CONSTRAINT "ReferralVisit_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ReferralLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
