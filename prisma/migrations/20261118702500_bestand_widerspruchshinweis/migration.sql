-- Nachweis je Bestandskunde: Hinweis auf das Widerspruchsrecht bei Erhebung der E-Mail-Adresse (§ 7 Abs. 3 UWG)
ALTER TABLE "ExistingCustomer" ADD COLUMN "widerspruchHinweis" TEXT;
ALTER TABLE "ExistingCustomer" ADD COLUMN "widerspruchHinweisAt" TIMESTAMP(3);
ALTER TABLE "ExistingCustomer" ADD COLUMN "widerspruchHinweisSource" TEXT;
ALTER TABLE "ExistingCustomer" ADD COLUMN "widerspruchHinweisText" TEXT;
