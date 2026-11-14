-- Rechnungsangaben: USt-IdNr. bzw. Steuernummer für den Footer jeder Stripe-Rechnung. Nur hinzufügend.
-- CreateTable
CREATE TABLE "InvoiceSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "taxNumber" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceSettings_pkey" PRIMARY KEY ("id")
);
