-- Nutzungsmessung im Admin (Ole, 18.11.2026): Seitenaufrufe und Klicks auf data-funktion, nur Admins, additiv.
-- CreateTable
CREATE TABLE "AdminUsageEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminUserId" TEXT NOT NULL,
    "art" TEXT NOT NULL,
    "schluessel" TEXT NOT NULL,
    "oberflaeche" TEXT NOT NULL,

    CONSTRAINT "AdminUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminUsageEvent_at_idx" ON "AdminUsageEvent"("at");

-- CreateIndex
CREATE INDEX "AdminUsageEvent_art_at_idx" ON "AdminUsageEvent"("art", "at");

-- CreateIndex
CREATE INDEX "AdminUsageEvent_adminUserId_at_idx" ON "AdminUsageEvent"("adminUserId", "at");

-- AddForeignKey
ALTER TABLE "AdminUsageEvent" ADD CONSTRAINT "AdminUsageEvent_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

