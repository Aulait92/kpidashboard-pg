-- Neuigkeit „Empfehlungen“: Aufsteller zum Drucken und Gesprächsleitfaden auf der Modulseite wieder entfernt – Text anpassen
UPDATE "ProductUpdate"
SET "body" = REPLACE(REPLACE("body", 'Neu sind außerdem ein Aufsteller zum Drucken, eine Zeile', 'Neu sind außerdem eine Zeile'), 'eine Aufgabe zum Nachfassen, ein Gesprächsleitfaden und die Übersicht', 'eine Aufgabe zum Nachfassen und die Übersicht'),
    "updatedAt" = '2026-11-14 00:00:00'
WHERE "id" = 'upd_2611_empfehlung_playbook';
