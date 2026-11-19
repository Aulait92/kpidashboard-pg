-- Merkfeld je Termin und Adresse für die Einladung mit Kalendereintrag (Ole, 19.11.2026, lib/whatsapp/einladung-rueckfall.ts)
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "einladungAdressen" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Bisher versendete Einladungen übernehmen
UPDATE "Appointment" SET "einladungAdressen" = ARRAY[lower("einladungAn")]
WHERE "einladungAn" IS NOT NULL AND cardinality("einladungAdressen") = 0;
