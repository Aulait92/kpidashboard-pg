-- Tierkrankenversicherung: gewünschter Umfang am Lead (op | voll | offen), lib/tkv-umfang.ts. Additiv.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "tkvUmfang" TEXT;
