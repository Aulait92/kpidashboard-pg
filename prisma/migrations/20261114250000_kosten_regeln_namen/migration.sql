-- Sprechende Namen für die BWA-Zeilen bei Regeln, die per „immer so“ mit der
-- Gegenpartei als Bezeichnung angelegt wurden (nur Bezeichnung, keine Zuordnung).
UPDATE "CostRule" SET "label" = 'Steuerberater'            WHERE "pattern" ILIKE '%phdrmueller%';
UPDATE "CostRule" SET "label" = 'Papierkram (Buchhaltung)' WHERE "pattern" ILIKE '%odacer%' OR "pattern" ILIKE '%papierkram%';
UPDATE "CostRule" SET "label" = 'DATEV'                    WHERE "pattern" ILIKE '%datev%';
UPDATE "CostRule" SET "label" = 'Telekom (Handy)'          WHERE "pattern" ILIKE '%telekom%';
UPDATE "CostRule" SET "label" = 'Kontoführung Commerzbank' WHERE "pattern" ILIKE '%kontoführung%';
UPDATE "CostRule" SET "label" = 'Google (E-Mail)'          WHERE "pattern" ILIKE '%google cloud%';
UPDATE "CostRule" SET "label" = 'Asana'                    WHERE "pattern" ILIKE '%asana%';
UPDATE "CostRule" SET "label" = 'XING'                     WHERE "pattern" ILIKE '%xing%';
UPDATE "CostRule" SET "label" = 'Privat'                   WHERE "pattern" ILIKE '%ole kannapinn%';
