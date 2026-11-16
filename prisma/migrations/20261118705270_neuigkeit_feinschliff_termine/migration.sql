-- Neuigkeit „Bedienung“ (upd_2611_bedienung_feinschliff, Runde 4) um den Feinschliff aus der UX-Prüfung Runde 5 ergänzt
-- (16.11.2026): Heute/Morgen beim Buchen, alter Lead-Link führt zum verschobenen Termin, E-Mail bleibt nach falschem
-- Passwort. Kein eigener Eintrag (mehrere kleine Änderungen eines Tages = ein Eintrag), kein Push.
UPDATE "ProductUpdate"
SET "body" = 'Auf **Heute** öffnen Sie **Vorbereiten** und **Präsentation** direkt mit einem Tipp auf den Termin, und **Termin vereinbart** klappt nach dem Anruf auch ohne verbundenen Kalender. Beim Buchen stehen „Heute“ und „Morgen“ über den freien Zeiten, und öffnet Ihr Lead nach dem Verschieben den alten Link, sieht er gleich den neuen Termin. Überfällige Wiedervorlagen sind rot markiert, und nach einem falschen Passwort bleibt Ihre E-Mail-Adresse stehen.',
    "updatedAt" = '2026-11-16 07:30:00'
WHERE "id" = 'upd_2611_bedienung_feinschliff';
