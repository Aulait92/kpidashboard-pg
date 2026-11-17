-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "mahnfallId" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "allowBankTransfer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bankTransferDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "mahnStopp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mahnStoppAt" TIMESTAMP(3),
ADD COLUMN     "mahnStoppGrund" TEXT,
ADD COLUMN     "zahltPerUeberweisung" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "allowBankTransfer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bankTransferDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "stripeSetupInvoiceId" TEXT,
ADD COLUMN     "ueberweisungIban" TEXT,
ADD COLUMN     "zahlweise" TEXT;

-- CreateTable
CREATE TABLE "Mahnfall" (
    "id" TEXT NOT NULL,
    "stripeInvoiceId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "customerId" TEXT,
    "offerId" TEXT,
    "invoiceNumber" TEXT,
    "email" TEXT,
    "amountDue" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "art" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offen',
    "stufe" INTEGER NOT NULL DEFAULT 0,
    "letzteMailAt" TIMESTAMP(3),
    "erinnertAt" TIMESTAMP(3),
    "faelligAt" TIMESTAMP(3),
    "mahnung1At" TIMESTAMP(3),
    "mahnung2At" TIMESTAMP(3),
    "anrufAufgabeAt" TIMESTAMP(3),
    "anrufAufgabeId" TEXT,
    "bezahltAt" TIMESTAMP(3),
    "bezahltVia" TEXT,
    "hostedUrl" TEXT,
    "pdfUrl" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mahnfall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZahlungsVorschlag" (
    "id" TEXT NOT NULL,
    "mahnfallId" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "grund" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offen',
    "entschiedenAt" TIMESTAMP(3),
    "entschiedenVon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZahlungsVorschlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MahnwesenSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "verzugspauschale" BOOLEAN NOT NULL DEFAULT false,
    "leadsPause" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MahnwesenSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Mahnfall_stripeInvoiceId_key" ON "Mahnfall"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "Mahnfall_status_idx" ON "Mahnfall"("status");

-- CreateIndex
CREATE INDEX "Mahnfall_customerId_idx" ON "Mahnfall"("customerId");

-- CreateIndex
CREATE INDEX "Mahnfall_stripeCustomerId_idx" ON "Mahnfall"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "ZahlungsVorschlag_status_idx" ON "ZahlungsVorschlag"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ZahlungsVorschlag_mahnfallId_bankTransactionId_key" ON "ZahlungsVorschlag"("mahnfallId", "bankTransactionId");

-- AddForeignKey
ALTER TABLE "Mahnfall" ADD CONSTRAINT "Mahnfall_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZahlungsVorschlag" ADD CONSTRAINT "ZahlungsVorschlag_mahnfallId_fkey" FOREIGN KEY ("mahnfallId") REFERENCES "Mahnfall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZahlungsVorschlag" ADD CONSTRAINT "ZahlungsVorschlag_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

