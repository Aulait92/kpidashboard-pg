-- Policen-Strecke v2 (WhatsApp Flow „Policen senden“), additiv
ALTER TABLE "PolicenNachweis" ADD COLUMN "textHash" TEXT;

CREATE TABLE "PolicenFlow" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "flowId" TEXT,
    "name" TEXT,
    "jsonHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'entwurf',
    "fehler" TEXT,
    "vorlagen" JSONB,
    "publishedAt" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicenFlow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PolicenFlow_customerId_key" ON "PolicenFlow"("customerId");
