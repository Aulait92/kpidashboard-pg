-- Bestandskunden-Import (Ole, 14.11.2026): Import-Läufe festhalten, damit sich der letzte Import
-- rückgängig machen lässt (nur die Datensätze, die dieser Lauf angelegt hat: ExistingCustomer.importId).
-- Nur hinzufügend.
CREATE TABLE "ExistingCustomerImport" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdById" TEXT,
    "fileName" TEXT,
    "rows" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "contracts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),
    "undoneById" TEXT,
    "removed" INTEGER,
    "kept" INTEGER,

    CONSTRAINT "ExistingCustomerImport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExistingCustomerImport_customerId_createdAt_idx" ON "ExistingCustomerImport"("customerId", "createdAt");

CREATE INDEX "ExistingCustomer_importId_idx" ON "ExistingCustomer"("importId");

ALTER TABLE "ExistingCustomerImport" ADD CONSTRAINT "ExistingCustomerImport_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
