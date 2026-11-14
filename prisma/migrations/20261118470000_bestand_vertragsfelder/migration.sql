-- Bestand-Import: Anrede, Firma, Beitragsvolumen am Kunden; Jahresbeitrag, Vertragsnummer, Versicherer, Status am Vertrag.
-- Nur hinzufügend.

-- AlterTable
ALTER TABLE "ExistingCustomer" ADD COLUMN     "company" TEXT,
ADD COLUMN     "premiumTotal" DECIMAL(12,2),
ADD COLUMN     "salutation" TEXT;

-- AlterTable
ALTER TABLE "ExistingContract" ADD COLUMN     "annualPremium" DECIMAL(12,2),
ADD COLUMN     "contractNo" TEXT,
ADD COLUMN     "insurer" TEXT,
ADD COLUMN     "status" TEXT;
