-- Zahlen nachvollziehbar machen (nur hinzufügend): Retainer-Ende von Hand
-- und nachgetragene Einmal-Umsätze (Einrichtungsgebühren, Sonstiges).
ALTER TABLE "Customer" ADD COLUMN "retainerEnd" TIMESTAMP(3);

CREATE TABLE "ManualRevenue" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "customerId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'setup',
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualRevenue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ManualRevenue_month_idx" ON "ManualRevenue"("month");
CREATE INDEX "ManualRevenue_customerId_idx" ON "ManualRevenue"("customerId");

ALTER TABLE "ManualRevenue" ADD CONSTRAINT "ManualRevenue_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
