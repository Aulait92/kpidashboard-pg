-- „Kollegen empfehlen“: Empfehlungscode je Kunde, Empfehlungen, Hinweise, Einstellungen (nur hinzufügend)
-- CreateTable
CREATE TABLE "ReferralCode" (
    "customerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("customerId")
);

-- CreateTable
CREATE TABLE "ColleagueReferral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "contactId" TEXT,
    "name" TEXT,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "consentText" TEXT NOT NULL,
    "existingContact" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'open',
    "blockedReason" TEXT,
    "wonAt" TIMESTAMP(3),
    "offerId" TEXT,
    "rewardStatus" TEXT NOT NULL DEFAULT 'none',
    "rewardAmount" DECIMAL(10,2),
    "rewardRef" TEXT,
    "rewardNote" TEXT,
    "rewardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ColleagueReferral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralNudge" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "firstShownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ReferralNudge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rewardKind" TEXT NOT NULL DEFAULT 'month',
    "rewardFixed" DECIMAL(10,2),
    "benefitKind" TEXT NOT NULL DEFAULT 'none',
    "benefitText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");

-- CreateIndex
CREATE INDEX "ColleagueReferral_referrerId_createdAt_idx" ON "ColleagueReferral"("referrerId", "createdAt");

-- CreateIndex
CREATE INDEX "ColleagueReferral_contactId_idx" ON "ColleagueReferral"("contactId");

-- CreateIndex
CREATE INDEX "ColleagueReferral_createdAt_idx" ON "ColleagueReferral"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralNudge_customerId_key_key" ON "ReferralNudge"("customerId", "key");

-- AddForeignKey
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ColleagueReferral" ADD CONSTRAINT "ColleagueReferral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ColleagueReferral" ADD CONSTRAINT "ColleagueReferral_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "SalesContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralNudge" ADD CONSTRAINT "ReferralNudge_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
