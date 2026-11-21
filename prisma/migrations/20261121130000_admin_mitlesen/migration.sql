-- Ole, 21.11.2026: Bei den ersten Kunden Push an Admins bei neuem Lead, Termin und Abschluss. Standard an, je Kunde abschaltbar.
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "adminMitlesen" BOOLEAN NOT NULL DEFAULT true;
