-- Bestandsübertragung aus der Maklervollmacht (Ole, 18.11.2026): Verträge der Vollmacht als LeadContract mit
-- herkunft „uebertragung“, zählen erst nach Bestätigung (uebertragungBestaetigtAt).
ALTER TABLE "LeadContract" ADD COLUMN "herkunft" TEXT;
ALTER TABLE "LeadContract" ADD COLUMN "uebertragungBestaetigtAt" TIMESTAMP(3);
ALTER TABLE "LeadContract" ADD COLUMN "vollmachtId" TEXT;
ALTER TABLE "LeadContract" ADD COLUMN "uebertragungKey" TEXT;

CREATE UNIQUE INDEX "LeadContract_uebertragungKey_key" ON "LeadContract"("uebertragungKey");
CREATE INDEX "LeadContract_vollmachtId_idx" ON "LeadContract"("vollmachtId");
