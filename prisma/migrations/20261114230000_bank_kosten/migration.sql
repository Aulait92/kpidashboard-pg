-- Bank & Karten: Verbindungen (Enable Banking), Buchungen (Konto + Kreditkarte), Regeln zur Kostenzuordnung. Nur hinzufügend.
-- CreateTable
CREATE TABLE "BankConnection" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'enablebanking',
    "aspspName" TEXT NOT NULL,
    "aspspCountry" TEXT NOT NULL DEFAULT 'DE',
    "psuType" TEXT NOT NULL DEFAULT 'business',
    "stateHash" TEXT,
    "sessionEnc" TEXT,
    "accounts" JSONB,
    "validUntil" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "reminderAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BankConnection_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "CostRule" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "vatIncluded" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CostRule_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT,
    "accountKey" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "bookingDate" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "counterparty" TEXT,
    "purpose" TEXT,
    "status" TEXT NOT NULL DEFAULT 'neu',
    "costPurpose" TEXT,
    "vatIncluded" BOOLEAN NOT NULL DEFAULT false,
    "ruleId" TEXT,
    "note" TEXT,
    "assignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "BankConnection_stateHash_key" ON "BankConnection"("stateHash");
-- CreateIndex
CREATE UNIQUE INDEX "CostRule_pattern_key" ON "CostRule"("pattern");
-- CreateIndex
CREATE INDEX "BankTransaction_status_bookingDate_idx" ON "BankTransaction"("status", "bookingDate");
-- CreateIndex
CREATE INDEX "BankTransaction_bookingDate_idx" ON "BankTransaction"("bookingDate");
-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_accountKey_externalId_key" ON "BankTransaction"("accountKey", "externalId");
-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BankConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "CostRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
