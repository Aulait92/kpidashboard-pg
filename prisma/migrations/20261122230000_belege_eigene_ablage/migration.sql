-- Eigene Beleg-Ablage (ohne GetMyInvoices): Datei, Quelle, Hash
ALTER TABLE "Beleg" ALTER COLUMN "gmiUid" DROP NOT NULL;
ALTER TABLE "Beleg" ADD COLUMN "quelle" TEXT NOT NULL DEFAULT 'gmi';
ALTER TABLE "Beleg" ADD COLUMN "datei" BYTEA;
ALTER TABLE "Beleg" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "Beleg" ADD COLUMN "hash" TEXT;
ALTER TABLE "Beleg" ADD COLUMN "absender" TEXT;
ALTER TABLE "Beleg" ADD COLUMN "ausgelesen" TEXT;
CREATE UNIQUE INDEX "Beleg_hash_key" ON "Beleg"("hash");
