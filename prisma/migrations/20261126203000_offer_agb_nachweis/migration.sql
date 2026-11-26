-- Nachweis der gezeigten AGB-Fassung bei der Annahme (Ole, 26.11.2026): Stand, Filter-Merkmale, Hash. Additiv.
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "agbVersion" TEXT;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "agbMerkmale" JSONB;
ALTER TABLE "Offer" ADD COLUMN IF NOT EXISTS "agbHash" TEXT;
