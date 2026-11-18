-- Neuigkeit (18.11.2026, Usability-Check): „Was hat … schon?“ mit einem Schalter je Zeile, Vorschlag mit Quelle, Zeilen
-- entfernen, Eingabe „Ja, woanders“ als bisheriger Vertrag auf der Folie; „Heute“ ohne doppelte Personen; Buchungslink
-- ohne Kalender mit Rückruf bzw. Anruf. Zusammengefasst als ein Eintrag. Kein Push.
INSERT INTO "ProductUpdate" ("id", "title", "body", "kind", "audience", "publishedAt", "createdAt", "updatedAt") VALUES
('upd_2611_ux_klein', 'Terminvorbereitung und Heute übersichtlicher',
 'Unter **Termin vorbereiten → Schritt 1** wählen Sie je Versicherung mit einem Schalter, Vorschläge aus dem Chat stehen mit ihrer Quelle da, Zeilen lassen sich wieder entfernen, und was Sie bei „Ja, woanders“ eintragen, zeigt die Präsentation als bisherigen Vertrag. Auf **Heute** steht jeder Kontakt nur noch einmal (der Termin geht vor der Wiedervorlage), und Ihr Buchungslink bietet ohne verbundenen Kalender Rückruf oder Anruf an.',
 'verbessert', 'software', '2026-11-18 21:00:00', '2026-11-18 21:00:00', '2026-11-18 21:00:00')
ON CONFLICT ("id") DO NOTHING;
