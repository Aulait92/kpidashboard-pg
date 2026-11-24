-- Teilzahlungen zu einem Beleg (Ole, 24.11.2026): eine Rechnung in mehreren Abbuchungen, z. B. Perspective
-- (Jahresrechnung in zwei Lastschriften). Nur hinzufügend.
ALTER TABLE "BankTransaction" ADD COLUMN "belegTeilVonId" TEXT;
CREATE INDEX "BankTransaction_belegTeilVonId_idx" ON "BankTransaction"("belegTeilVonId");
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_belegTeilVonId_fkey" FOREIGN KEY ("belegTeilVonId") REFERENCES "Beleg"("id") ON DELETE SET NULL ON UPDATE CASCADE;
