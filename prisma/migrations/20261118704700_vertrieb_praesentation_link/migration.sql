-- Vertriebspräsentation zum Nachklicken (Ole, 15.11.2026): Link je Kontakt (14 Tage) und Aufrufe. Nur neue Tabellen.
-- CreateTable
CREATE TABLE "SalesPresentationLink" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'vertreter',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesPresentationLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesPresentationView" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesPresentationView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesPresentationLink_token_key" ON "SalesPresentationLink"("token");

-- CreateIndex
CREATE INDEX "SalesPresentationLink_contactId_idx" ON "SalesPresentationLink"("contactId");

-- CreateIndex
CREATE INDEX "SalesPresentationView_linkId_viewedAt_idx" ON "SalesPresentationView"("linkId", "viewedAt");

-- AddForeignKey
ALTER TABLE "SalesPresentationLink" ADD CONSTRAINT "SalesPresentationLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "SalesContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesPresentationView" ADD CONSTRAINT "SalesPresentationView_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "SalesPresentationLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

