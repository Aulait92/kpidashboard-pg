-- Neuigkeit vom 14.11.: Empfehlungen-Seite mit Reitern ergänzen (kleine Änderungen eines Tages zusammengefasst)
UPDATE "ProductUpdate"
SET "body" = "body" || E'\n\n**Empfehlungen & Bewertungen** ist jetzt in die Reiter Übersicht, Einstellungen sowie Teilen & Google aufgeteilt; die Einstellungen lassen sich abschnittsweise aufklappen.',
    "updatedAt" = now()
WHERE "id" = 'upd_2611_empfehlung_ihr_name' AND "body" NOT LIKE '%in die Reiter Übersicht%';
