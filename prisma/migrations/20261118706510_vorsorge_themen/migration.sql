-- Cross-Selling Teil C (16.11.2026): Vorsorge-Themen, die die Terminvorbereitung nicht vorschlagen soll (additiv).
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "vorsorgeThemenAus" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
